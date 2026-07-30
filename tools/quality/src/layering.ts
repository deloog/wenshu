import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { collectModuleImports, type ModuleImport } from "./phantom-dependencies.ts";
import {
  EXCLUDED_TOP_LEVEL_DIRECTORIES,
  LAYERED_WORKSPACES,
  type Layer,
} from "./layering-registry.ts";
import {
  CODE_EXTENSIONS,
  hasExactExtension,
  type QualityFinding,
} from "./guardrails.ts";

type SpecifierForm = "bare" | "node" | "relative" | "absolute" | "drive";
type Syntax = ModuleImport["syntax"];
type RuleSet = "strict" | "auxiliary";

export interface LayeringCoverage {
  readonly workspaces: number;
  readonly sourceFiles: number;
  readonly auxiliaryFiles: number;
  readonly unclassifiedFiles: number;
  readonly emptyImportFiles: number;
  readonly specifierForms: Readonly<Record<SpecifierForm, number>>;
  readonly syntaxForms: Readonly<Record<Syntax, number>>;
  readonly ignoredArkTsFiles: number;
}

export interface LayeringResult {
  readonly findings: readonly QualityFinding[];
  readonly coverage: LayeringCoverage;
}

interface MutableLayeringCoverage {
  workspaces: number;
  sourceFiles: number;
  auxiliaryFiles: number;
  unclassifiedFiles: number;
  emptyImportFiles: number;
  specifierForms: Record<SpecifierForm, number>;
  syntaxForms: Record<Syntax, number>;
  ignoredArkTsFiles: number;
}

interface Workspace {
  readonly directory: string;
  readonly layer: Layer;
  readonly packageName: string;
}

function zeroCoverage(): MutableLayeringCoverage {
  return {
    workspaces: 0,
    sourceFiles: 0,
    auxiliaryFiles: 0,
    unclassifiedFiles: 0,
    emptyImportFiles: 0,
    specifierForms: { bare: 0, node: 0, relative: 0, absolute: 0, drive: 0 },
    syntaxForms: {
      esm: 0,
      "export-from": 0,
      dynamic: 0,
      require: 0,
      "import-equals": 0,
      reference: 0,
    },
    ignoredArkTsFiles: 0,
  };
}

function formOf(specifier: string): SpecifierForm {
  if (specifier.startsWith("node:")) return "node";
  if (/^[A-Za-z]:[\\/]/u.test(specifier)) return "drive";
  if (specifier.startsWith("./") || specifier.startsWith("../")) return "relative";
  if (isAbsolute(specifier)) return "absolute";
  return "bare";
}

function packageName(specifier: string): string | undefined {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return scope === undefined || name === undefined ? undefined : `${scope}/${name}`;
  }
  return specifier.split("/")[0];
}

function ruleSetFor(filePath: string, workspace: Workspace): RuleSet | undefined {
  const sourceRoot = resolve(workspace.directory, "src");
  if (!relative(sourceRoot, filePath).startsWith("..")) return "strict";
  const localPath = relative(workspace.directory, filePath).replaceAll("\\", "/");
  if (localPath.startsWith("test/") || localPath.startsWith("scripts/")) {
    return "auxiliary";
  }
  return undefined;
}

function allows(source: Layer, target: Layer): boolean {
  if (source === "L0") return target === "L0";
  if (source === "L1") return target === "L0" || target === "L1";
  if (source === "L2") return target !== "L3" && target !== "web";
  if (source === "L3") return target !== "web";
  return target === "L0" || target === "L1" || target === "web";
}

function allowsForRuleSet(source: Layer, target: Layer, ruleSet: RuleSet): boolean {
  if (ruleSet === "strict") return allows(source, target);
  return allows(source, target) || target === source || target === "L2";
}

function platformViolation(
  source: Layer,
  specifier: string,
  ruleSet: RuleSet,
): string | undefined {
  if (
    specifier.startsWith("node:") &&
    ruleSet === "strict" &&
    source !== "L2" &&
    source !== "L3"
  ) {
    return "NODE_BUILTIN_FORBIDDEN";
  }
  if (specifier === "electron" || specifier.startsWith("electron/")) {
    return source === "L3" ? undefined : "ELECTRON_FORBIDDEN";
  }
  if (specifier.startsWith("@ohos.") || specifier.startsWith("@ohos/")) {
    return source === "L3" ? undefined : "ARKTS_FORBIDDEN";
  }
  return undefined;
}

function workspaceForPath(
  filePath: string,
  workspaces: readonly Workspace[],
): Workspace | undefined {
  return workspaces.find(
    (workspace) => !relative(workspace.directory, filePath).startsWith(".."),
  );
}

function resolveSpecifier(filePath: string, specifier: string): string | undefined {
  const form = formOf(specifier);
  if (form !== "relative" && form !== "absolute" && form !== "drive") return undefined;
  return form === "relative"
    ? resolve(dirname(filePath), specifier)
    : resolve(specifier);
}

async function workspacesFor(
  workspaceRoot: string,
  files: readonly string[],
): Promise<{
  readonly workspaces: readonly Workspace[];
  readonly findings: readonly QualityFinding[];
}> {
  const findings: QualityFinding[] = [];
  const manifests = new Map<string, string>();
  for (const file of files) {
    if (file.endsWith(`${sep}package.json`)) manifests.set(dirname(file), file);
  }
  const workspaces: Workspace[] = [];
  for (const entry of LAYERED_WORKSPACES) {
    const directory = resolve(workspaceRoot, entry.directory);
    const manifest = manifests.get(directory);
    if (manifest === undefined) {
      findings.push({
        rule: "layering-registry",
        severity: "error",
        filePath: directory,
        line: 1,
        message: `UNREGISTERED_OR_MISSING_WORKSPACE ${entry.directory}`,
      });
      continue;
    }
    const parsed: unknown = JSON.parse(await readFile(manifest, "utf8"));
    const name =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)["name"]
        : undefined;
    if (typeof name !== "string") {
      findings.push({
        rule: "layering-registry",
        severity: "error",
        filePath: manifest,
        line: 1,
        message: "INVALID_WORKSPACE_MANIFEST",
      });
      continue;
    }
    workspaces.push({ directory, layer: entry.layer, packageName: name });
  }
  for (const [directory, manifest] of manifests) {
    const relativeDirectory = relative(workspaceRoot, directory).replaceAll("\\", "/");
    const [topLevel] = relativeDirectory.split("/");
    if (
      topLevel !== undefined &&
      topLevel !== "." &&
      topLevel !== "" &&
      !EXCLUDED_TOP_LEVEL_DIRECTORIES.some((excluded) => excluded === topLevel) &&
      !LAYERED_WORKSPACES.some((entry) => entry.directory === relativeDirectory)
    ) {
      findings.push({
        rule: "layering-registry",
        severity: "error",
        filePath: manifest,
        line: 1,
        message: `UNREGISTERED_WORKSPACE ${relativeDirectory}`,
      });
    }
  }
  return { workspaces: Object.freeze(workspaces), findings: Object.freeze(findings) };
}

export async function checkLayering(
  workspaceRoot: string,
  files: readonly string[],
): Promise<LayeringResult> {
  const registry = await workspacesFor(workspaceRoot, files);
  const coverage = zeroCoverage();
  const findings = [...registry.findings];
  coverage.workspaces = registry.workspaces.length;
  const byPackage = new Map(
    registry.workspaces.map((workspace) => [workspace.packageName, workspace]),
  );
  for (const file of files) {
    if (file.endsWith(".ets")) {
      if (file.includes(`${sep}apps${sep}arkweb-shell${sep}`))
        coverage.ignoredArkTsFiles += 1;
      continue;
    }
    if (!hasExactExtension(file, CODE_EXTENSIONS)) continue;
    const source = workspaceForPath(file, registry.workspaces);
    if (source === undefined) continue;
    const ruleSet = ruleSetFor(file, source);
    if (ruleSet === undefined) {
      coverage.unclassifiedFiles += 1;
      continue;
    }
    coverage.sourceFiles += 1;
    if (ruleSet === "auxiliary") coverage.auxiliaryFiles += 1;
    const imports = collectModuleImports(file, await readFile(file, "utf8"));
    if (imports.length === 0) coverage.emptyImportFiles += 1;
    for (const imported of imports) {
      const form = formOf(imported.specifier);
      coverage.specifierForms[form] += 1;
      coverage.syntaxForms[imported.syntax] += 1;
      const platform = platformViolation(source.layer, imported.specifier, ruleSet);
      if (platform !== undefined) {
        findings.push({
          rule: "layering",
          severity: "error",
          filePath: file,
          line: 1,
          message: `${platform} specifier=${imported.specifier}`,
        });
        continue;
      }
      const resolved = resolveSpecifier(file, imported.specifier);
      const target =
        form === "bare"
          ? byPackage.get(packageName(imported.specifier) ?? "")
          : workspaceForPath(resolved ?? "", registry.workspaces);
      if (form !== "bare" && resolved !== undefined && target === undefined) {
        findings.push({
          rule: "layering",
          severity: "error",
          filePath: file,
          line: 1,
          message: `UNREGISTERED_PATH_TARGET specifier=${imported.specifier}`,
        });
      } else if (
        target !== undefined &&
        !allowsForRuleSet(source.layer, target.layer, ruleSet)
      ) {
        findings.push({
          rule: "layering",
          severity: "error",
          filePath: file,
          line: 1,
          message: `LAYER_DIRECTION_FORBIDDEN ${source.layer}->${target.layer} specifier=${imported.specifier}`,
        });
      }
    }
  }
  return Object.freeze({
    findings: Object.freeze(findings),
    coverage: Object.freeze({
      ...coverage,
      specifierForms: Object.freeze({ ...coverage.specifierForms }),
      syntaxForms: Object.freeze({ ...coverage.syntaxForms }),
    }),
  });
}

export function formatLayeringCoverage(coverage: LayeringCoverage): string {
  return `Layering coverage: workspaces=${coverage.workspaces} sourceFiles=${coverage.sourceFiles} auxiliaryFiles=${coverage.auxiliaryFiles} unclassifiedFiles=${coverage.unclassifiedFiles} emptyImports=${coverage.emptyImportFiles} specifiers=${JSON.stringify(coverage.specifierForms)} syntax=${JSON.stringify(coverage.syntaxForms)} arkTsIgnored=${coverage.ignoredArkTsFiles}`;
}
