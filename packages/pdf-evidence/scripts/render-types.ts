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
    throw new Error("Evidence type generator is unavailable.");
  }
  return moduleValue.compileFromFile as CompileFromFile;
}

export const schemaPath = resolve(
  import.meta.dirname,
  "../schema/evidence.schema.json",
);
export const generatedPath = resolve(
  import.meta.dirname,
  "../src/generated/evidence.ts",
);

export function renderEvidenceTypes(): Promise<string> {
  return loadCompileFromFile()(schemaPath, {
    bannerComment:
      "/* Generated from schema/evidence.schema.json. Do not edit directly. */",
    cwd: resolve(import.meta.dirname, ".."),
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
