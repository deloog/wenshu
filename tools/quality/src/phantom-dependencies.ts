import { readFile } from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import ts from "typescript";

import {
  CODE_EXTENSIONS,
  hasExactExtension,
  type QualityFinding,
} from "./guardrails.ts";

export function packageNameOfSpecifier(specifier: string): string | undefined {
  if (
    specifier.startsWith("node:") ||
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    /^[A-Za-z]:/u.test(specifier)
  ) {
    return undefined;
  }
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    const [scope, name] = segments;
    return scope !== undefined && name !== undefined && name.length > 0
      ? `${scope}/${name}`
      : undefined;
  }
  return segments[0];
}

function scriptKindOf(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx") || fileName.endsWith(".jsx")) {
    return ts.ScriptKind.TSX;
  }
  if (
    fileName.endsWith(".js") ||
    fileName.endsWith(".mjs") ||
    fileName.endsWith(".cjs")
  ) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

export interface ModuleImport {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

export function collectModuleImports(
  fileName: string,
  text: string,
): readonly ModuleImport[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.ESNext,
    true,
    scriptKindOf(fileName),
  );
  const imports: ModuleImport[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(
        Object.freeze({
          specifier: node.moduleSpecifier.text,
          typeOnly: node.importClause?.isTypeOnly ?? false,
        }),
      );
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(
        Object.freeze({
          specifier: node.moduleSpecifier.text,
          typeOnly: node.isTypeOnly,
        }),
      );
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteral(argument)) {
        imports.push(Object.freeze({ specifier: argument.text, typeOnly: false }));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const reference of source.typeReferenceDirectives) {
    imports.push(Object.freeze({ specifier: reference.fileName, typeOnly: true }));
  }
  return Object.freeze(imports);
}

interface WorkspacePackage {
  readonly directory: string;
  readonly name: string;
  readonly declared: ReadonlySet<string>;
}

async function discoverWorkspacePackages(
  files: readonly string[],
): Promise<readonly WorkspacePackage[]> {
  const manifestPaths = files.filter((file) => file.endsWith(`${sep}package.json`));
  const packages: WorkspacePackage[] = [];
  for (const manifestPath of manifestPaths) {
    const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      continue;
    }
    const record = parsed as Record<string, unknown>;
    const declared = new Set<string>();
    for (const key of ["dependencies", "devDependencies"] as const) {
      const section = record[key];
      if (typeof section === "object" && section !== null && !Array.isArray(section)) {
        for (const name of Object.keys(section)) {
          declared.add(name);
        }
      }
    }
    packages.push(
      Object.freeze({
        directory: dirname(manifestPath),
        name: typeof record["name"] === "string" ? record["name"] : "(root)",
        declared,
      }),
    );
  }
  return Object.freeze(
    packages.sort((left, right) => right.directory.length - left.directory.length),
  );
}

export async function checkPhantomDependencies(
  workspaceRoot: string,
  files: readonly string[],
): Promise<readonly QualityFinding[]> {
  const packages = await discoverWorkspacePackages(files);
  const findings: QualityFinding[] = [];
  for (const file of files) {
    if (!hasExactExtension(file, CODE_EXTENSIONS)) {
      continue;
    }
    const owner = packages.find(
      (candidate) => !relative(candidate.directory, file).startsWith(".."),
    );
    if (owner === undefined) {
      continue;
    }
    const text = await readFile(file, "utf8");
    for (const moduleImport of collectModuleImports(file, text)) {
      const dependency = packageNameOfSpecifier(moduleImport.specifier);
      if (dependency === undefined || owner.declared.has(dependency)) {
        continue;
      }
      // A type-only import may be satisfied by a declared @types/* package;
      // a value import always needs the runtime package itself (SM-02).
      if (moduleImport.typeOnly && owner.declared.has(`@types/${dependency}`)) {
        continue;
      }
      findings.push({
        rule: "phantom-dependency",
        severity: "error",
        filePath: file,
        line: 1,
        message: `${owner.name} must declare ${dependency} in its own manifest`,
      });
    }
  }
  return Object.freeze(findings);
}
