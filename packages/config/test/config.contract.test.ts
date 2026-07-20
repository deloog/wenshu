import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CONFIG_ENVIRONMENTS,
  CONFIG_LOG_LEVELS,
  ConfigValidationError,
  loadEnvironmentProfile,
  parseRuntimeConfig,
  resolveRuntimeConfig,
} from "../src/index.ts";

const expectedEnvironments = ["dev", "test", "staging", "production"] as const;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(
  source: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  const value = source[key];
  if (!isRecord(value)) {
    throw new Error(`Expected object field: ${key}`);
  }
  return value;
}

test("all four named environment profiles satisfy the runtime contract", () => {
  assert.deepEqual(CONFIG_ENVIRONMENTS, expectedEnvironments);
  for (const environment of expectedEnvironments) {
    const config = loadEnvironmentProfile(environment);
    assert.equal(config.environment, environment);
    assert.ok(["debug", "info", "warn", "error"].includes(config.logLevel));
    assert.ok(Object.isFrozen(config));
  }
});

test("missing required configuration fails before startup", () => {
  assert.throws(
    () => parseRuntimeConfig({}),
    (error: unknown) =>
      error instanceof ConfigValidationError &&
      error.code === "CONFIG_MISSING" &&
      error.message.includes("WENSHU_ENV") &&
      error.message.includes("WENSHU_LOG_LEVEL"),
  );
});

test("unknown namespaced keys fail without echoing their values", () => {
  const sentinel = "must-never-appear-in-errors";
  assert.throws(
    () =>
      parseRuntimeConfig({
        WENSHU_ENV: "test",
        WENSHU_LOG_LEVEL: "warn",
        WENSHU_API_KEY: sentinel,
      }),
    (error: unknown) =>
      error instanceof ConfigValidationError &&
      error.code === "CONFIG_UNKNOWN" &&
      error.message.includes("WENSHU_API_KEY") &&
      !error.message.includes(sentinel),
  );
});

test("unrelated operating-system variables are ignored", () => {
  const config = parseRuntimeConfig({
    PATH: "not-part-of-the-contract",
    WENSHU_ENV: "dev",
    WENSHU_LOG_LEVEL: "debug",
  });
  assert.deepEqual(config, { environment: "dev", logLevel: "debug" });
});

test("invalid values fail with field names but never raw values", () => {
  const sentinel = "secret-production-ish-value";
  assert.throws(
    () =>
      parseRuntimeConfig({
        WENSHU_ENV: sentinel,
        WENSHU_LOG_LEVEL: "verbose",
      }),
    (error: unknown) =>
      error instanceof ConfigValidationError &&
      error.code === "CONFIG_INVALID" &&
      error.message.includes("WENSHU_ENV") &&
      error.message.includes("WENSHU_LOG_LEVEL") &&
      !error.message.includes(sentinel) &&
      !error.message.includes("verbose"),
  );
});

test("an override cannot silently select a different environment", () => {
  assert.throws(
    () => resolveRuntimeConfig("staging", { WENSHU_ENV: "production" }),
    (error: unknown) =>
      error instanceof ConfigValidationError &&
      error.code === "CONFIG_ENV_MISMATCH",
  );
});

test("the committed example and JSON schema remain executable contracts", async () => {
  const exampleUrl = new URL("../../../.env.example", import.meta.url);
  const schemaUrl = new URL("../app-config.schema.json", import.meta.url);
  const example = await readFile(exampleUrl, "utf8");
  const parsedSchema: unknown = JSON.parse(await readFile(schemaUrl, "utf8"));
  if (!isRecord(parsedSchema)) {
    throw new Error("Configuration schema must be an object.");
  }
  const properties = requiredRecord(parsedSchema, "properties");
  const environment = requiredRecord(properties, "WENSHU_ENV");
  const logLevel = requiredRecord(properties, "WENSHU_LOG_LEVEL");
  const entries: Array<readonly [string, string]> = example
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)] as const;
    });

  assert.deepEqual(parseRuntimeConfig(Object.fromEntries(entries)), {
    environment: "dev",
    logLevel: "debug",
  });
  assert.deepEqual(parsedSchema["required"], ["WENSHU_ENV", "WENSHU_LOG_LEVEL"]);
  assert.deepEqual(environment["enum"], expectedEnvironments);
  assert.deepEqual(logLevel["enum"], CONFIG_LOG_LEVELS);
  assert.equal(parsedSchema["additionalProperties"], false);
});
