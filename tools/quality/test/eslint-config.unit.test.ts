import assert from "node:assert/strict";
import { cwd } from "node:process";
import test from "node:test";

import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: cwd() });

async function configuredRules(filePath: string) {
  const config = await eslint.calculateConfigForFile(filePath);
  assert.ok(config, `${filePath} must match an ESLint configuration`);
  assert.ok(config.rules, `${filePath} must have ESLint rules`);
  return config.rules;
}

test("recommended defect rules remain active for TypeScript and JavaScript", async () => {
  for (const extension of ["ts", "tsx", "mts", "cts", "js", "mjs", "cjs"]) {
    const rules = await configuredRules(`src/eslint-probe.${extension}`);
    assert.equal(rules["no-debugger"]?.[0], 2, extension);
    assert.equal(rules["use-isnan"]?.[0], 2, extension);
    assert.equal(rules["valid-typeof"]?.[0], 2, extension);
  }
});

test("JSX receives recommended rules without displacing TypeScript rules", async () => {
  const jsxRules = await configuredRules("src/eslint-probe.jsx");
  const typescriptRules = await configuredRules("src/eslint-probe.ts");
  assert.equal(jsxRules["no-unused-vars"]?.[0], 2);
  assert.equal(jsxRules["no-debugger"]?.[0], 2);
  assert.equal(typescriptRules["@typescript-eslint/no-explicit-any"]?.[0], 2);
  assert.equal(typescriptRules["no-debugger"]?.[0], 2);
});
