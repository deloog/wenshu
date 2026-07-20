import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

export interface GeneratedFileFinding {
  readonly packageRoot: string;
  readonly message: string;
}

export interface GeneratedFileRegistryResult {
  readonly generatedFiles: readonly string[];
  readonly findings: readonly GeneratedFileFinding[];
}

interface PackageManifest {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly wenshu?: {
    readonly generatedFiles?: readonly unknown[];
  };
}

function repositoryPath(root: string, filePath: string): string {
  return relative(root, filePath).replaceAll("\\", "/");
}

function isWorkspacePackageJson(workspaceRoot: string, filePath: string): boolean {
  return /^(?:apps|packages|tools)\/[^/]+\/package\.json$/u.test(
    repositoryPath(workspaceRoot, filePath),
  );
}

function isGeneratedDirectoryFile(packageRoot: string, filePath: string): boolean {
  return repositoryPath(packageRoot, filePath)
    .toLowerCase()
    .startsWith("src/generated/");
}

export async function inspectGeneratedFileRegistry(
  workspaceRoot: string,
  repositoryFiles: readonly string[],
): Promise<GeneratedFileRegistryResult> {
  const findings: GeneratedFileFinding[] = [];
  const generatedFiles: string[] = [];
  const repositoryFileSet = new Set(
    repositoryFiles.map((file) => resolve(file).toLowerCase()),
  );

  for (const packageJsonPath of repositoryFiles.filter((file) =>
    isWorkspacePackageJson(workspaceRoot, file),
  )) {
    const packageRoot = dirname(packageJsonPath);
    const manifest = JSON.parse(
      await readFile(packageJsonPath, "utf8"),
    ) as PackageManifest;
    const entries = manifest.wenshu?.generatedFiles ?? [];
    const hasGenerator = manifest.scripts?.["generate:check"] !== undefined;
    const packageRegistrations = new Set<string>();

    if (hasGenerator && entries.length === 0) {
      findings.push({
        packageRoot,
        message: "package with generate:check must register generated files",
      });
    }

    for (const entry of entries) {
      if (typeof entry !== "string") {
        findings.push({
          packageRoot,
          message: "generated file registration must be a string",
        });
        continue;
      }
      const normalizedEntry = entry.replaceAll("\\", "/");
      const absolutePath = resolve(packageRoot, entry);
      const registrationKey = absolutePath.toLowerCase();
      if (packageRegistrations.has(registrationKey)) {
        findings.push({
          packageRoot,
          message: `duplicate generated file registration: ${entry}`,
        });
        continue;
      }
      packageRegistrations.add(registrationKey);
      if (
        !normalizedEntry.startsWith("src/generated/") ||
        normalizedEntry.includes("../") ||
        !repositoryFileSet.has(registrationKey)
      ) {
        findings.push({
          packageRoot,
          message: `invalid or missing generated file registration: ${entry}`,
        });
        continue;
      }
      generatedFiles.push(absolutePath);
    }

    for (const file of repositoryFiles.filter((candidate) =>
      isGeneratedDirectoryFile(packageRoot, candidate),
    )) {
      if (
        !generatedFiles.some(
          (generatedFile) =>
            generatedFile.toLowerCase() === resolve(file).toLowerCase(),
        )
      ) {
        findings.push({
          packageRoot,
          message: `unregistered file in generated directory: ${repositoryPath(packageRoot, file)}`,
        });
      }
    }
  }

  return Object.freeze({
    generatedFiles: Object.freeze(generatedFiles),
    findings: Object.freeze(findings),
  });
}
