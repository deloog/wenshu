import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SupplyChainError, checkToolchainPins } from "../src/index.ts";
import type { SupplyChainSbom } from "../src/index.ts";

function sbomWith(packages: { name: string; version: string }[]): SupplyChainSbom {
  return Object.freeze({
    schema_version: "0.1.0",
    sbom_id: "wenshu.supply-chain",
    source: "pnpm-lock.yaml",
    packages: Object.freeze(
      packages.map(({ name, version }) =>
        Object.freeze({
          name,
          version,
          license: "MIT",
          direct: true,
          requested_by: Object.freeze(["wenshu"]),
        }),
      ),
    ),
  });
}

const PINS = {
  node: { version: "24.17.0" },
  pnpm: { version: "11.15.1" },
  typescript: { version: "6.0.3" },
  eslint: { version: "10.7.0" },
  eslintJs: { version: "10.0.1" },
  typescriptEslint: { version: "8.64.0" },
  prettier: { version: "3.9.5" },
  vite: { version: "8.1.5" },
};

async function stagedRoot(
  toolchain: Record<string, unknown>,
  manifest: Record<string, unknown>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "wenshu-toolchain-"));
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "toolchain.versions.json"), JSON.stringify(toolchain));
  await writeFile(join(root, "package.json"), JSON.stringify(manifest));
  return root;
}

function goodManifest(): Record<string, unknown> {
  return {
    engines: { node: "24.17.0", pnpm: "11.15.1" },
    packageManager: "pnpm@11.15.1",
  };
}

function goodSbom(): SupplyChainSbom {
  return sbomWith([
    { name: "typescript", version: "6.0.3" },
    { name: "eslint", version: "10.7.0" },
    { name: "@eslint/js", version: "10.0.1" },
    { name: "typescript-eslint", version: "8.64.0" },
    { name: "prettier", version: "3.9.5" },
    { name: "vite", version: "8.1.5" },
  ]);
}

test("aligned toolchain pins pass and report every pin", async () => {
  const root = await stagedRoot({ ...PINS }, goodManifest());
  try {
    const aligned = await checkToolchainPins(root, goodSbom());
    assert.equal(aligned.length, 8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a bumped dependency without a toolchain record update is detected", async () => {
  const root = await stagedRoot({ ...PINS }, goodManifest());
  try {
    const drifted = sbomWith([
      { name: "typescript", version: "7.0.2" },
      { name: "eslint", version: "10.7.0" },
      { name: "@eslint/js", version: "10.0.1" },
      { name: "typescript-eslint", version: "8.64.0" },
      { name: "prettier", version: "3.9.5" },
      { name: "vite", version: "8.1.5" },
    ]);
    await assert.rejects(
      () => checkToolchainPins(root, drifted),
      (error: unknown) =>
        error instanceof SupplyChainError &&
        error.code === "TOOLCHAIN_DRIFT" &&
        error.message.includes("typescript"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("engines and packageManager drift are detected", async () => {
  const root = await stagedRoot(
    { ...PINS },
    { engines: { node: "26.0.0" }, packageManager: "pnpm@12.0.0" },
  );
  try {
    await assert.rejects(
      () => checkToolchainPins(root, goodSbom()),
      (error: unknown) =>
        error instanceof SupplyChainError &&
        error.code === "TOOLCHAIN_DRIFT" &&
        error.message.includes("node") &&
        error.message.includes("pnpm"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a transitive older copy cannot mask the direct pinned version", async () => {
  const root = await stagedRoot({ ...PINS }, goodManifest());
  try {
    const withTransitiveCopy = Object.freeze({
      ...goodSbom(),
      packages: Object.freeze([
        ...goodSbom().packages,
        Object.freeze({
          name: "typescript",
          version: "6.0.0",
          license: "Apache-2.0",
          direct: false,
          requested_by: Object.freeze([]),
        }),
      ]),
    });
    const aligned = await checkToolchainPins(root, withTransitiveCopy);
    assert.equal(aligned.length, 8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing pins or missing manifests fail closed", async () => {
  const root = await stagedRoot({ node: { version: "24.17.0" } }, goodManifest());
  try {
    await assert.rejects(() => checkToolchainPins(root, goodSbom()), SupplyChainError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
