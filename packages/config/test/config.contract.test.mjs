import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CONFIG_ENVIRONMENTS,
  ConfigValidationError,
  loadEnvironmentProfile,
  parseRuntimeConfig,
  resolveRuntimeConfig,
} from "../src/index.ts";

const expectedEnvironments = ["dev", "test", "staging", "production"];

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
    (error) =>
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
    (error) =>
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
    (error) =>
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
    (error) =>
      error instanceof ConfigValidationError &&
      error.code === "CONFIG_ENV_MISMATCH",
  );
});

test("the committed example and JSON schema remain executable contracts", async () => {
  const exampleUrl = new URL("../../../.env.example", import.meta.url);
  const schemaUrl = new URL("../app-config.schema.json", import.meta.url);
  const example = await readFile(exampleUrl, "utf8");
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));
  const entries = Object.fromEntries(
    example
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );

  assert.deepEqual(parseRuntimeConfig(entries), {
    environment: "dev",
    logLevel: "debug",
  });
  assert.deepEqual(schema.required, ["WENSHU_ENV", "WENSHU_LOG_LEVEL"]);
  assert.deepEqual(
    schema.properties.WENSHU_ENV.enum,
    expectedEnvironments,
  );
  assert.equal(schema.additionalProperties, false);
});
