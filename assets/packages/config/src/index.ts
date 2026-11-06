import Ajv2020 from "ajv/dist/2020.js";

import configSchema from "../app-config.schema.json" with { type: "json" };

export const CONFIG_ENVIRONMENTS = ["dev", "test", "staging", "production"] as const;

export const CONFIG_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type ConfigEnvironment = (typeof CONFIG_ENVIRONMENTS)[number];
export type ConfigLogLevel = (typeof CONFIG_LOG_LEVELS)[number];

export interface RuntimeConfig {
  readonly environment: ConfigEnvironment;
  readonly logLevel: ConfigLogLevel;
}

interface RawRuntimeConfig {
  readonly WENSHU_ENV: string;
  readonly WENSHU_LOG_LEVEL: string;
}

export type ConfigErrorCode =
  "CONFIG_ENV_MISMATCH" | "CONFIG_INVALID" | "CONFIG_MISSING" | "CONFIG_UNKNOWN";

export class ConfigValidationError extends Error {
  readonly code: ConfigErrorCode;

  constructor(code: ConfigErrorCode, fieldNames: readonly string[]) {
    super(`${code}: ${fieldNames.join(", ")}`);
    this.name = "ConfigValidationError";
    this.code = code;
  }
}

const CONFIG_PREFIX = "WENSHU_";
const ENVIRONMENT_KEY = "WENSHU_ENV";
const LOG_LEVEL_KEY = "WENSHU_LOG_LEVEL";
const ALLOWED_KEYS = new Set([ENVIRONMENT_KEY, LOG_LEVEL_KEY]);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateRawConfig = ajv.compile<RawRuntimeConfig>(configSchema);

const ENVIRONMENT_PROFILES = {
  dev: { environment: "dev", logLevel: "debug" },
  test: { environment: "test", logLevel: "warn" },
  staging: { environment: "staging", logLevel: "info" },
  production: { environment: "production", logLevel: "warn" },
} as const satisfies Record<ConfigEnvironment, RuntimeConfig>;

function isEnvironment(value: unknown): value is ConfigEnvironment {
  return (
    typeof value === "string" &&
    CONFIG_ENVIRONMENTS.some((environment) => environment === value)
  );
}

function isLogLevel(value: unknown): value is ConfigLogLevel {
  return (
    typeof value === "string" &&
    CONFIG_LOG_LEVELS.some((logLevel) => logLevel === value)
  );
}

function namespacedKeys(source: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(source).filter((key) => key.startsWith(CONFIG_PREFIX));
}

export function parseRuntimeConfig(
  source: Readonly<Record<string, unknown>>,
): RuntimeConfig {
  const unknownKeys = namespacedKeys(source).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new ConfigValidationError("CONFIG_UNKNOWN", unknownKeys.sort());
  }

  const missingKeys = [ENVIRONMENT_KEY, LOG_LEVEL_KEY].filter(
    (key) => source[key] === undefined || source[key] === "",
  );
  if (missingKeys.length > 0) {
    throw new ConfigValidationError("CONFIG_MISSING", missingKeys);
  }

  const environment = source[ENVIRONMENT_KEY];
  const logLevel = source[LOG_LEVEL_KEY];
  const candidate = {
    WENSHU_ENV: environment,
    WENSHU_LOG_LEVEL: logLevel,
  };
  if (!validateRawConfig(candidate)) {
    const invalidKeys = new Set<string>();
    validateRawConfig.errors?.forEach((error) => {
      const fieldName = error.instancePath.slice(1);
      if (ALLOWED_KEYS.has(fieldName)) {
        invalidKeys.add(fieldName);
      }
    });
    if (!isEnvironment(environment)) {
      invalidKeys.add(ENVIRONMENT_KEY);
    }
    if (!isLogLevel(logLevel)) {
      invalidKeys.add(LOG_LEVEL_KEY);
    }
    throw new ConfigValidationError("CONFIG_INVALID", [...invalidKeys].sort());
  }

  if (!isEnvironment(environment) || !isLogLevel(logLevel)) {
    throw new ConfigValidationError("CONFIG_INVALID", [ENVIRONMENT_KEY, LOG_LEVEL_KEY]);
  }
  return Object.freeze({
    environment,
    logLevel,
  });
}

export function loadEnvironmentProfile(environment: unknown): RuntimeConfig {
  if (!isEnvironment(environment)) {
    throw new ConfigValidationError("CONFIG_INVALID", [ENVIRONMENT_KEY]);
  }

  return Object.freeze({ ...ENVIRONMENT_PROFILES[environment] });
}

export function resolveRuntimeConfig(
  environment: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
): RuntimeConfig {
  const profile = loadEnvironmentProfile(environment);
  const unknownKeys = namespacedKeys(overrides).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new ConfigValidationError("CONFIG_UNKNOWN", unknownKeys.sort());
  }

  const requestedEnvironment = overrides[ENVIRONMENT_KEY];
  if (
    requestedEnvironment !== undefined &&
    requestedEnvironment !== profile.environment
  ) {
    throw new ConfigValidationError("CONFIG_ENV_MISMATCH", [ENVIRONMENT_KEY]);
  }

  return parseRuntimeConfig({
    [ENVIRONMENT_KEY]: requestedEnvironment ?? profile.environment,
    [LOG_LEVEL_KEY]: overrides[LOG_LEVEL_KEY] ?? profile.logLevel,
  });
}
