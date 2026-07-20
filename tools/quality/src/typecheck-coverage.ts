import { readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import ts from "typescript";

export interface TypecheckCoverageFinding {
  readonly packageRoot: string;
  readonly message: string;
}

interface PackageManifest {
  readonly scripts?: Readonly<Record<string, string>>;
}

function normalized(path: string): string {
  return resolve(path).replaceAll("\\", "/").toLowerCase();
}

function isWorkspacePackageJson(workspaceRoot: string, filePath: string): boolean {
  if (!filePath.endsWith("package.json")) {
    return false;
  }
  const path = relative(workspaceRoot, filePath).replaceAll("\\", "/");
  return /^(?:apps|packages|tools)\/[^/]+\/package\.json$/u.test(path);
}

function isTypeScriptSource(filePath: string): boolean {
  return (
    [".ts", ".tsx", ".mts", ".cts"].includes(extname(filePath)) &&
    !filePath.endsWith(".d.ts")
  );
}

export async function checkTypecheckCoverage(
  workspaceRoot: string,
  repositoryFiles: readonly string[],
): Promise<readonly TypecheckCoverageFinding[]> {
  const findings: TypecheckCoverageFinding[] = [];
  const packageJsonFiles = repositoryFiles.filter((file) =>
    isWorkspacePackageJson(workspaceRoot, file),
  );

  for (const packageJsonPath of packageJsonFiles) {
    const packageRoot = dirname(packageJsonPath);
    const manifest = JSON.parse(
      await readFile(packageJsonPath, "utf8"),
    ) as PackageManifest;
    if (manifest.scripts?.["typecheck"] !== "tsc -p tsconfig.json") {
      findings.push({
        packageRoot,
        message:
          "package must expose the exact typecheck command: tsc -p tsconfig.json",
      });
    }

    const configPath = resolve(packageRoot, "tsconfig.json");
    const configRead = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configRead.error !== undefined) {
      findings.push({ packageRoot, message: "tsconfig.json cannot be read" });
      continue;
    }
    const parsed = ts.parseJsonConfigFileContent(
      configRead.config,
      ts.sys,
      packageRoot,
      undefined,
      configPath,
    );
    parsed.errors.forEach((error) => {
      findings.push({
        packageRoot,
        message: ts.flattenDiagnosticMessageText(error.messageText, " "),
      });
    });
    const checkedFiles = new Set(parsed.fileNames.map(normalized));
    repositoryFiles
      .filter((file) => {
        const child = relative(packageRoot, file);
        return (
          child !== "" &&
          child !== ".." &&
          !child.startsWith("..\\") &&
          !child.startsWith("../") &&
          isTypeScriptSource(file)
        );
      })
      .forEach((file) => {
        if (!checkedFiles.has(normalized(file))) {
          findings.push({
            packageRoot,
            message: `TypeScript file is outside typecheck: ${relative(packageRoot, file)}`,
          });
        }
      });
  }
  return Object.freeze(findings);
}

export async function checkStrictBaseConfig(
  workspaceRoot: string,
): Promise<readonly string[]> {
  const path = resolve(workspaceRoot, "tsconfig.base.json");
  const read = ts.readConfigFile(path, ts.sys.readFile);
  if (read.error !== undefined) {
    return Object.freeze(["tsconfig.base.json cannot be read"]);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, workspaceRoot);
  const requiredTrue = [
    "strict",
    "noImplicitAny",
    "useUnknownInCatchVariables",
    "noUncheckedIndexedAccess",
    "exactOptionalPropertyTypes",
  ] as const;
  const findings = requiredTrue
    .filter((name) => parsed.options[name] !== true)
    .map((name) => `strict compiler option missing: ${name}`);
  if (parsed.options.skipLibCheck !== false) {
    findings.push("strict compiler option missing: skipLibCheck=false");
  }
  return Object.freeze(findings);
}
