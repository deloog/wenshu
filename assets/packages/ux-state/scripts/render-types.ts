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
    throw new Error("Ux-state type generator is unavailable.");
  }
  return moduleValue.compileFromFile as CompileFromFile;
}

const packageRoot = resolve(import.meta.dirname, "..");

export const schemaPath = resolve(
  import.meta.dirname,
  "../schema/ux-states-1.0.0.schema.json",
);
export const generatedPath = resolve(
  import.meta.dirname,
  "../src/generated/ux-states.ts",
);

function generatorOptions(bannerComment: string): GeneratorOptions {
  return {
    bannerComment,
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
  };
}

export function renderUxStatesTypes(): Promise<string> {
  return loadCompileFromFile()(
    schemaPath,
    generatorOptions(
      "/* Generated from schema/ux-states-1.0.0.schema.json. Do not edit directly. */",
    ),
  );
}

export interface GeneratedFile {
  readonly path: string;
  readonly relativeName: string;
  readonly render: () => Promise<string>;
}

export const GENERATED_FILES: readonly GeneratedFile[] = Object.freeze([
  Object.freeze({
    path: generatedPath,
    relativeName: "src/generated/ux-states.ts",
    render: renderUxStatesTypes,
  }),
]);
