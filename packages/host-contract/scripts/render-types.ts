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
    throw new Error("Host type generator is unavailable.");
  }
  return moduleValue.compileFromFile as CompileFromFile;
}

const packageRoot = resolve(import.meta.dirname, "..");

export const schemaPath = resolve(import.meta.dirname, "../schema/host.schema.json");
export const generatedPath = resolve(import.meta.dirname, "../src/generated/host.ts");
export const schemaV02Path = resolve(
  import.meta.dirname,
  "../schema/host-0.2.0.schema.json",
);
export const generatedV02Path = resolve(
  import.meta.dirname,
  "../src/generated/host-0.2.0.ts",
);
export const payloadsSchemaPath = resolve(
  import.meta.dirname,
  "../schema/host-payloads-0.2.0.schema.json",
);
export const generatedPayloadsPath = resolve(
  import.meta.dirname,
  "../src/generated/payloads.ts",
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

export function renderHostTypes(): Promise<string> {
  return loadCompileFromFile()(
    schemaPath,
    generatorOptions(
      "/* Generated from schema/host.schema.json. Do not edit directly. */",
    ),
  );
}

export function renderHostV02Types(): Promise<string> {
  return loadCompileFromFile()(
    schemaV02Path,
    generatorOptions(
      "/* Generated from schema/host-0.2.0.schema.json. Do not edit directly. */",
    ),
  );
}

export function renderPayloadTypes(): Promise<string> {
  return loadCompileFromFile()(
    payloadsSchemaPath,
    generatorOptions(
      "/* Generated from schema/host-payloads-0.2.0.schema.json. Do not edit directly. */",
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
    relativeName: "src/generated/host.ts",
    render: renderHostTypes,
  }),
  Object.freeze({
    path: generatedV02Path,
    relativeName: "src/generated/host-0.2.0.ts",
    render: renderHostV02Types,
  }),
  Object.freeze({
    path: generatedPayloadsPath,
    relativeName: "src/generated/payloads.ts",
    render: renderPayloadTypes,
  }),
]);
