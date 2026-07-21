import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("the complete verify entry point cannot omit machine evidence checks", async () => {
  const packagePath = resolve(import.meta.dirname, "../../../package.json");
  const parsed = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
  if (typeof parsed !== "object" || parsed === null) {
    return;
  }
  const scripts = Reflect.get(parsed, "scripts") as unknown;
  assert.equal(typeof scripts, "object");
  assert.notEqual(scripts, null);
  if (typeof scripts !== "object" || scripts === null) {
    return;
  }
  assert.match(String(Reflect.get(scripts, "verify")), /pnpm environment:check/u);
  assert.equal(
    Reflect.get(scripts, "environment:check"),
    "pnpm --filter @wenshu/environment check",
  );
});
