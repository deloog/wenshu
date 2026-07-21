import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { parseSbom, serializeSbom, SupplyChainError } from "../src/index.ts";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

test("sbom contract accepts only the frozen shape", () => {
  const valid = {
    schema_version: "0.1.0",
    sbom_id: "wenshu.supply-chain",
    source: "pnpm-lock.yaml",
    packages: [
      {
        name: "example",
        version: "1.0.0",
        license: "MIT",
        direct: true,
        requested_by: ["wenshu"],
      },
    ],
  };
  const parsed = parseSbom(valid);
  assert.equal(parsed.packages.length, 1);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.packages));

  const mutations: unknown[] = [
    { ...valid, schema_version: "0.2.0" },
    { ...valid, extra: true },
    { ...valid, packages: [] },
    { ...valid, packages: [{ ...valid.packages[0], license: "" }] },
    { ...valid, packages: [{ ...valid.packages[0], direct: true, requested_by: [] }] },
    { ...valid, packages: [{ ...valid.packages[0], unknown: 1 }] },
  ];
  for (const mutation of mutations) {
    assert.throws(() => parseSbom(mutation), SupplyChainError);
  }
});

test("committed sbom satisfies the contract and is canonical", async () => {
  const text = await readFile(resolve(workspaceRoot, "sbom", "sbom.json"), "utf8");
  const parsed = parseSbom(JSON.parse(text));
  assert.equal(serializeSbom(parsed), text);
  const names = parsed.packages.map(({ name }) => name);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b, "en")),
  );
  assert.ok(parsed.packages.some(({ name, direct }) => name === "eslint" && direct));
  assert.ok(
    parsed.packages.some(
      ({ name, license }) => name === "lightningcss" && license === "MPL-2.0",
    ),
  );
});
