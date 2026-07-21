export const CI_JOB_NAMES = Object.freeze([
  "static",
  "unit-config",
  "contracts",
  "typecheck",
  "build-test",
  "build-staging",
  "build-production",
  "security",
] as const);

export type CiJobName = (typeof CI_JOB_NAMES)[number];

export interface CiCommand {
  readonly label: string;
  readonly arguments: readonly string[];
}

function command(label: string, ...arguments_: string[]): CiCommand {
  return Object.freeze({ label, arguments: Object.freeze(arguments_) });
}

export const CI_JOBS: Readonly<Record<CiJobName, readonly CiCommand[]>> = Object.freeze(
  {
    static: Object.freeze([
      command("format", "format:check"),
      command("lint", "lint"),
      command("quality", "quality:check"),
    ]),
    "unit-config": Object.freeze([
      command("unit", "test:foundation"),
      command("config", "config:check"),
    ]),
    contracts: Object.freeze([
      command("contracts", "contracts:check"),
      command("fixtures", "fixtures:check"),
      command("environment", "environment:check"),
    ]),
    typecheck: Object.freeze([command("typecheck", "typecheck")]),
    "build-test": Object.freeze([
      command(
        "build-test",
        "--filter",
        "@wenshu/web",
        "exec",
        "vite",
        "build",
        "--mode",
        "test",
        "--outDir",
        "dist/ci-test",
      ),
    ]),
    "build-staging": Object.freeze([
      command(
        "build-staging",
        "--filter",
        "@wenshu/web",
        "exec",
        "vite",
        "build",
        "--mode",
        "staging",
        "--outDir",
        "dist/ci-staging",
      ),
    ]),
    "build-production": Object.freeze([
      command(
        "build-production",
        "--filter",
        "@wenshu/web",
        "exec",
        "vite",
        "build",
        "--mode",
        "production",
        "--outDir",
        "dist/ci-production",
      ),
    ]),
    security: Object.freeze([
      command("secrets", "secrets:check"),
      command("licenses", "licenses:check"),
      command("fonts", "fonts:check"),
    ]),
  },
);

export function isCiJobName(value: string): value is CiJobName {
  return CI_JOB_NAMES.some((name) => name === value);
}
