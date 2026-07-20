import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { FixtureIntegrityError, verifyFixtureSet } from "../src/index.ts";

const sourceRoot = resolve(import.meta.dirname, "../../../docs/poc-a/fixtures");
const controlledRoot = resolve("test-results", "g1-10-verification");

async function temporaryFixtureCopy(): Promise<{ root: string; fixtureRoot: string }> {
  await mkdir(controlledRoot, { recursive: true });
  const root = await mkdtemp(join(controlledRoot, "run-"));
  const fixtureRoot = join(root, "fixtures");
  await cp(sourceRoot, fixtureRoot, { recursive: true, verbatimSymlinks: true });
  return { root, fixtureRoot };
}

test("the committed PoC-A fixture set matches its frozen manifest", async () => {
  const verified = await verifyFixtureSet(sourceRoot);
  assert.equal(verified.manifest.entries.length, 7);
  assert.deepEqual(
    verified.manifest.entries.map((entry) => entry.path),
    [
      "chart-overview.svg",
      "chart-process.svg",
      "fault-cases.json",
      "formal-business.template.json",
      "golden-report.md",
      "manual-baseline.csv",
      "report-data.csv",
    ],
  );
});

test("changing one byte in any frozen fixture is rejected", async (context) => {
  const verified = await verifyFixtureSet(sourceRoot);
  for (const entry of verified.manifest.entries) {
    await context.test(entry.path, async () => {
      const temporary = await temporaryFixtureCopy();
      try {
        const filePath = join(temporary.fixtureRoot, ...entry.path.split("/"));
        const bytes = await readFile(filePath);
        const changed = Buffer.from(bytes);
        changed[0] = (changed[0] ?? 0) ^ 1;
        await writeFile(filePath, changed);
        await assert.rejects(
          verifyFixtureSet(temporary.fixtureRoot),
          (error: unknown) =>
            error instanceof FixtureIntegrityError &&
            error.code === "FIXTURE_SET_MISMATCH",
        );
      } finally {
        await rm(temporary.root, { recursive: true });
      }
    });
  }
});

test("manifest tampering, missing files, and unregistered files are rejected", async () => {
  const scenarios = [
    async (fixtureRoot: string): Promise<void> => {
      await writeFile(join(fixtureRoot, "unregistered.txt"), "extra", "utf8");
    },
    async (fixtureRoot: string): Promise<void> => {
      await rm(join(fixtureRoot, "report-data.csv"));
    },
    async (fixtureRoot: string): Promise<void> => {
      await writeFile(join(fixtureRoot, "manifest.json"), "{}\n", "utf8");
    },
    async (fixtureRoot: string): Promise<void> => {
      const manifestPath = join(fixtureRoot, "manifest.json");
      const manifest = await readFile(manifestPath);
      await writeFile(manifestPath, Buffer.concat([manifest, Buffer.from("\n")]));
    },
  ];
  for (const mutate of scenarios) {
    const temporary = await temporaryFixtureCopy();
    try {
      await mutate(temporary.fixtureRoot);
      await assert.rejects(
        verifyFixtureSet(temporary.fixtureRoot),
        FixtureIntegrityError,
      );
    } finally {
      await rm(temporary.root, { recursive: true });
    }
  }
});

test("filesystem links inside the fixture root are rejected without traversal", async () => {
  const temporary = await temporaryFixtureCopy();
  const outside = await mkdtemp(join(controlledRoot, "outside-"));
  const linked = join(temporary.fixtureRoot, "linked");
  await writeFile(join(outside, "secret.txt"), "outside", "utf8");
  try {
    await symlink(outside, linked, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(verifyFixtureSet(temporary.fixtureRoot), /filesystem link/u);
  } finally {
    await unlink(linked).catch(() => undefined);
    await Promise.all([
      rm(temporary.root, { recursive: true }),
      rm(outside, { recursive: true }),
    ]);
  }
});
