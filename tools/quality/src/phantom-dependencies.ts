import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

import { LAYERED_WORKSPACES, RESOURCE_DEPENDENCIES } from "./layering-registry.ts";
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
  readonly syntax:
    "esm" | "export-from" | "dynamic" | "require" | "import-equals" | "reference";
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
          syntax: "esm",
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
          syntax: "export-from",
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
        imports.push(
          Object.freeze({
            specifier: argument.text,
            typeOnly: false,
            syntax: "dynamic",
          }),
        );
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1
    ) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteral(argument)) {
        imports.push(
          Object.freeze({
            specifier: argument.text,
            typeOnly: false,
            syntax: "require",
          }),
        );
      }
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      imports.push(
        Object.freeze({
          specifier: node.moduleReference.expression.text,
          typeOnly: false,
          syntax: "import-equals",
        }),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const reference of source.typeReferenceDirectives) {
    imports.push(
      Object.freeze({
        specifier: reference.fileName,
        typeOnly: true,
        syntax: "reference",
      }),
    );
  }
  return Object.freeze(imports);
}

function excludedFromNpmDependencyScan(
  workspaceRoot: string,
  filePath: string,
): boolean {
  const normalized = relative(workspaceRoot, filePath).replaceAll("\\", "/");
  return LAYERED_WORKSPACES.some((workspace) =>
    workspace.npmDependencyScanExclusions?.includes(normalized),
  );
}

interface WorkspacePackage {
  readonly directory: string;
  readonly name: string;
  readonly declared: ReadonlySet<string>;
  readonly productionDependencies: ReadonlySet<string>;
  readonly manifestPath: string;
  readonly scripts: readonly string[];
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
    const productionDependencies = new Set<string>();
    for (const key of ["dependencies", "devDependencies"] as const) {
      const section = record[key];
      if (typeof section === "object" && section !== null && !Array.isArray(section)) {
        for (const name of Object.keys(section)) {
          declared.add(name);
          if (key === "dependencies") productionDependencies.add(name);
        }
      }
    }
    packages.push(
      Object.freeze({
        directory: dirname(manifestPath),
        manifestPath,
        name: typeof record["name"] === "string" ? record["name"] : "(root)",
        declared,
        productionDependencies,
        scripts:
          typeof record["scripts"] === "object" &&
          record["scripts"] !== null &&
          !Array.isArray(record["scripts"])
            ? Object.values(record["scripts"] as Record<string, unknown>).filter(
                (value): value is string => typeof value === "string",
              )
            : [],
      }),
    );
  }
  return Object.freeze(
    packages.sort((left, right) => right.directory.length - left.directory.length),
  );
}

function belongsTo(directory: string, file: string): boolean {
  return !relative(directory, file).startsWith("..");
}

function isUsedByScript(scripts: readonly string[], dependency: string): boolean {
  return scripts.some((script) => script.includes(dependency));
}

export async function checkUnusedProductionDependencies(
  workspaceRoot: string,
  files: readonly string[],
): Promise<readonly QualityFinding[]> {
  const packages = await discoverWorkspacePackages(files);
  const findings: QualityFinding[] = [];
  const registeredDirectories = new Set(
    LAYERED_WORKSPACES.map((workspace) => resolve(workspaceRoot, workspace.directory)),
  );
  for (const owner of packages.filter((candidate) =>
    registeredDirectories.has(candidate.directory),
  )) {
    for (const dependency of owner.productionDependencies) {
      const resourceDependency = RESOURCE_DEPENDENCIES.some(
        (entry) =>
          entry.workspace ===
            relative(workspaceRoot, owner.directory).replaceAll("\\", "/") &&
          entry.dependency === dependency,
      );
      if (
        dependency.startsWith("@types/") ||
        resourceDependency ||
        isUsedByScript(owner.scripts, dependency)
      ) {
        continue;
      }
      let used = false;
      for (const file of files) {
        if (
          !belongsTo(owner.directory, file) ||
          excludedFromNpmDependencyScan(workspaceRoot, file)
        ) {
          continue;
        }
        if (hasExactExtension(file, CODE_EXTENSIONS)) {
          const imports = collectModuleImports(file, await readFile(file, "utf8"));
          if (
            imports.some(
              (item) => packageNameOfSpecifier(item.specifier) === dependency,
            )
          ) {
            used = true;
            break;
          }
        }
      }
      if (!used) {
        findings.push({
          rule: "unused-production-dependency",
          severity: "error",
          filePath: owner.manifestPath,
          line: 1,
          message: `${owner.name} declares unused production dependency ${dependency}`,
        });
      }
    }
  }
  return Object.freeze(findings);
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
    if (excludedFromNpmDependencyScan(workspaceRoot, file)) continue;
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
