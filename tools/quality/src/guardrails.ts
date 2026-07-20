import ts from "typescript";
import { extname, resolve } from "node:path";

export type QualitySeverity = "error" | "warning";

export interface QualityFinding {
  readonly rule: string;
  readonly severity: QualitySeverity;
  readonly filePath: string;
  readonly line: number;
  readonly message: string;
}

const FORBIDDEN_DIRECTIVES = [
  `@ts-${"ignore"}`,
  `@ts-${"expect-error"}`,
  `@ts-${"nocheck"}`,
  `eslint-${"disable"}`,
] as const;

function lineNumberAt(text: string, offset: number): number {
  return text.slice(0, offset).split(/\r?\n/u).length;
}

export function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  const normalized = text.replaceAll("\r\n", "\n");
  const count = normalized.split("\n").length;
  return normalized.endsWith("\n") ? count - 1 : count;
}

export const TYPESCRIPT_EXTENSIONS = Object.freeze([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
] as const);

export const CODE_EXTENSIONS = Object.freeze([
  ...TYPESCRIPT_EXTENSIONS,
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const);

export function hasExactExtension(
  filePath: string,
  extensions: readonly string[],
): boolean {
  return extensions.includes(extname(filePath));
}

export function hasNoncanonicalCodeExtension(filePath: string): boolean {
  const extension = extname(filePath);
  return (
    extension !== extension.toLowerCase() &&
    CODE_EXTENSIONS.includes(
      extension.toLowerCase() as (typeof CODE_EXTENSIONS)[number],
    )
  );
}

export function isRegisteredGeneratedTypeScript(
  filePath: string,
  generatedFiles: readonly string[],
): boolean {
  const candidate = resolve(filePath).toLowerCase();
  return generatedFiles.some(
    (generatedFile) => resolve(generatedFile).toLowerCase() === candidate,
  );
}

export function isTestTypeScript(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  return (
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/__tests__/") ||
    normalized.includes(".test.") ||
    normalized.includes(".spec.")
  );
}

export function checkFileSize(
  filePath: string,
  text: string,
  generatedFiles: readonly string[] = [],
): readonly QualityFinding[] {
  if (isRegisteredGeneratedTypeScript(filePath, generatedFiles)) {
    return Object.freeze([]);
  }
  const lines = countLines(text);
  const testFile = isTestTypeScript(filePath);
  const failLimit = testFile ? 500 : 400;
  if (lines > failLimit) {
    return Object.freeze([
      {
        rule: "file-size",
        severity: "error",
        filePath,
        line: lines,
        message: `${testFile ? "test" : "production"} file has ${lines} lines; limit is ${failLimit}`,
      },
    ]);
  }
  if (lines >= 300) {
    return Object.freeze([
      {
        rule: "file-size",
        severity: "warning",
        filePath,
        line: lines,
        message: `${testFile ? "test" : "production"} file reached the 300-line warning threshold`,
      },
    ]);
  }
  return Object.freeze([]);
}

export function checkForbiddenSyntax(
  filePath: string,
  text: string,
): readonly QualityFinding[] {
  const findings: QualityFinding[] = [];
  FORBIDDEN_DIRECTIVES.forEach((directive) => {
    let offset = text.indexOf(directive);
    while (offset >= 0) {
      findings.push({
        rule: "forbidden-suppression",
        severity: "error",
        filePath,
        line: lineNumberAt(text, offset),
        message: `${directive} is forbidden`,
      });
      offset = text.indexOf(directive, offset + directive.length);
    }
  });

  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : [".js", ".jsx", ".mjs", ".cjs"].some((extension) => filePath.endsWith(extension))
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  function visit(node: ts.Node): void {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      findings.push({
        rule: "explicit-any",
        severity: "error",
        filePath,
        line: position.line + 1,
        message: "explicit any is forbidden",
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return Object.freeze(findings);
}
