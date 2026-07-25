import { createRequire } from "node:module";
import { resolve } from "node:path";

interface GeneratorOptions {
  readonly bannerComment: string;
  readonly cwd: string;
  readonly declareExternallyReferenced: boolean;
  readonly ignoreMinAndMaxItems: boolean;
  readonly style: Readonly<Record<string, unknown>>;
  readonly unknownAny: boolean;
}

type CompileFromFile = (filename: string, options: GeneratorOptions) => Promise<string>;

function loadCompileFromFile(): CompileFromFile {
  const require = createRequire(import.meta.url);
  const moduleValue: unknown = require("json-schema-to-typescript");
  if (
    typeof moduleValue !== "object" ||
    moduleValue === null ||
    !("compileFromFile" in moduleValue) ||
    typeof moduleValue.compileFromFile !== "function"
  ) {
    throw new Error("Check report type generator is unavailable.");
  }
  return moduleValue.compileFromFile as CompileFromFile;
}

export interface CheckReportTypeTarget {
  /** schema/ 下的文件名（同时也是 banner 归因）。 */
  readonly schemaFile: string;
  /** src/ 下的生成物路径（与 package.json wenshu.generatedFiles 一致）。 */
  readonly generatedFile: string;
}

/**
 * 生成目标：当前契约（1.1.0，PA-08 manualChecks）+ 冻结的 1.0.0 契约
 * （reader 向后兼容的真源）。顺序即注册表顺序，漂移门禁逐字比对。
 */
export const targets: readonly CheckReportTypeTarget[] = Object.freeze([
  Object.freeze({
    schemaFile: "check-report.schema.json",
    generatedFile: "src/generated/check-report.ts",
  }),
  Object.freeze({
    schemaFile: "check-report-1.0.0.schema.json",
    generatedFile: "src/generated/check-report-1.0.0.ts",
  }),
]);

const packageRoot = resolve(import.meta.dirname, "..");

export function schemaPathOf(target: CheckReportTypeTarget): string {
  return resolve(packageRoot, "schema", target.schemaFile);
}

export function generatedPathOf(target: CheckReportTypeTarget): string {
  return resolve(packageRoot, target.generatedFile);
}

export function renderCheckReportTypes(target: CheckReportTypeTarget): Promise<string> {
  return loadCompileFromFile()(schemaPathOf(target), {
    bannerComment: `/* Generated from schema/${target.schemaFile}. Do not edit directly. */`,
    cwd: packageRoot,
    declareExternallyReferenced: true,
    ignoreMinAndMaxItems: true,
    style: {
      bracketSpacing: true,
      printWidth: 88,
      semi: true,
      singleQuote: false,
      tabWidth: 2,
      trailingComma: "all",
      useTabs: false,
    },
    unknownAny: true,
  });
}
