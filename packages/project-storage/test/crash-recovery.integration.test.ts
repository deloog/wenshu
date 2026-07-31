import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  atomicWriteFile,
  openProjectStore,
  recoverGrantDirectory,
  TEMP_FILE_PREFIX,
} from "../src/index.ts";
import { isolatedRoot, sha256, withIsolatedRoot } from "./helpers.ts";

const V1_HASH = sha256(Buffer.alloc(1024, 0x41));

function v2Hash(size: number): string {
  return sha256(Buffer.alloc(size, 0x42));
}

async function killAtPhase(root: string, phase: string, size: number): Promise<void> {
  const child = spawn(
    process.execPath,
    [resolve(import.meta.dirname, "crash-writer.ts"), root, phase, String(size)],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  let output = "";
  let completed = false;
  const finished = new Promise<void>((resolvePromise, rejectPromise) => {
    child.once("error", rejectPromise);
    child.once("exit", () => resolvePromise());
  });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
    if (output.includes("DONE")) {
      completed = true;
      return;
    }
    if (output.includes(`PHASE ${phase}\n`)) {
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 300);
    }
  });
  await finished;
  assert.equal(completed, false, `child completed instead of being killed at ${phase}`);
  assert.equal(child.signalCode, "SIGKILL", `child must die by SIGKILL at ${phase}`);
}

async function artifactHash(root: string): Promise<string | null> {
  try {
    return sha256(await readFile(join(root, "artifact.bin")));
  } catch {
    return null;
  }
}

async function residueCount(root: string): Promise<number> {
  return (await readdir(root)).filter((entry) => entry.startsWith(TEMP_FILE_PREFIX))
    .length;
}

const KILL_PHASES = [
  "temp-created",
  "data-written-partial",
  "data-fsynced",
  "renamed",
] as const;

test("killing the writer at any phase leaves exactly one complete artifact", async (context) => {
  const size = 64 * 1024 * 1024;
  for (const phase of KILL_PHASES) {
    await context.test(phase, async () => {
      await withIsolatedRoot(`crash-${phase}`, async (root) => {
        await killAtPhase(root, phase, size);
        const hash = await artifactHash(root);
        assert.ok(
          hash === V1_HASH || hash === v2Hash(size),
          `${phase}: artifact must be either the previous or the new complete file`,
        );
        if (phase !== "renamed") {
          assert.equal(hash, V1_HASH, `${phase}: rename never happened`);
          assert.ok(
            (await residueCount(root)) >= 1,
            `${phase}: interrupted write must leave temp residue`,
          );
        }
        const recovery = await recoverGrantDirectory(root);
        assert.equal(await residueCount(root), 0);
        if (phase !== "renamed") {
          assert.ok(recovery.removedResidue >= 1);
          assert.equal(await artifactHash(root), V1_HASH);
        }
        const followup = Buffer.from("post-crash save");
        await atomicWriteFile(join(root, "artifact.bin"), followup);
        assert.deepEqual(await readFile(join(root, "artifact.bin")), followup);
      });
    });
  }
});

test("crash recovery to an operable store stays within the 10 second budget", async () => {
  const size = 16 * 1024 * 1024;
  const samples: number[] = [];
  const batchDir = resolve(
    import.meta.dirname,
    "../../../artifacts/perf/2026-07-31-PB-10",
  );
  await mkdir(batchDir, { recursive: true });

  for (let iteration = 0; iteration < 11; iteration += 1) {
    const root = await isolatedRoot(`recover-${iteration}`);
    try {
      await killAtPhase(root, "data-written-partial", size);
      const started = performance.now();
      await recoverGrantDirectory(root);
      const store = await openProjectStore({
        databasePath: join(root, "project.sqlite"),
        backupDirectory: join(root, "backups"),
        recover: true,
      });
      store.close();
      const hash = await artifactHash(root);
      const elapsed = performance.now() - started;
      assert.equal(hash, V1_HASH, "last good artifact must survive recovery");
      if (iteration > 0) {
        samples.push(elapsed);
      }
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
    }
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  const report = {
    task: "PB-10",
    metric:
      "crash recovery to operable (residue cleanup + store open + artifact verify)",
    environment:
      "wenshu-dev-primary (Win10 local baseline; NOT the Win11 reference machine)",
    unit: "ms",
    budgetMs: 10000,
    warmupRuns: 1,
    samples,
    median,
    p95,
    recoveryPoint:
      "last completed atomic save; loss range is at most the in-flight save",
    recordedAt: new Date().toISOString(),
  };
  await writeFile(
    join(batchDir, "recovery-samples.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  assert.ok(samples.length === 10, "ten measured runs required");
  assert.ok(
    (p95 ?? Number.POSITIVE_INFINITY) <= 10000,
    `p95 recovery ${p95}ms exceeds the 10s budget`,
  );
});
