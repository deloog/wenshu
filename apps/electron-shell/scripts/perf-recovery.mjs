/**
 * PB-12 W5: end-to-end crash-recovery performance sampling (D2 procedure).
 *
 * Metric: "relaunch to operable" — spawn of `e2e-main.cjs --e2e --recover`
 * until the ready marker appears (recoverGrantDirectory dual-prefix cleanup +
 * openProjectStore({recover:true}) + artifact hash verification all happen
 * before the marker is written).
 *
 * Each iteration builds a real crash state first: a full `--e2e` run saves
 * the baseline document, then a save-loop run is SIGKILLed after its first
 * save report, leaving genuine crash residue. Nothing is mocked.
 *
 * Procedure (reference-machine §3): env:record first with a hard PATH/Node
 * assertion (PB-10 MAJOR-4 lesson), 1 warmup + 10 measured runs, raw values
 * preserved, median/p95 reported. Output is gitignored local evidence
 * (EN-N2): artifacts/perf/2026-08-01-PB-12/recovery-e2e-samples.json.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_NODE = "v24.17.0";
const BATCH_DIR = fileURLToPath(
  new URL("../../../artifacts/perf/2026-08-01-PB-12/", import.meta.url),
);
const shellDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const electronBinary = createRequire(import.meta.url)("electron");

function assertEnvironment() {
  if (process.version !== EXPECTED_NODE) {
    throw new Error(
      `perf sampling requires Node ${EXPECTED_NODE} with the D-drive toolchain ` +
        `first in PATH (got ${process.version} at ${process.execPath}); ` +
        `refusing to pollute machine evidence (PB-10 MAJOR-4)`,
    );
  }
  if (process.platform === "win32" && !/^[A-Za-z]:[\\/]/.test(process.execPath)) {
    throw new Error(`unexpected Node location: ${process.execPath}`);
  }
}

function runStep(label, command, args, options = {}) {
  const npmExecPath = process.env["npm_execpath"];
  if (npmExecPath === undefined || npmExecPath === "") {
    throw new Error("npm_execpath is required; run this script through pnpm");
  }
  const result = spawnSync(command, [npmExecPath, ...args], {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}`);
  }
}

function spawnElectron(args, env) {
  const childEnv = {
    ...process.env,
    NODE_OPTIONS: "--experimental-strip-types",
    ...env,
  };
  delete childEnv["ELECTRON_RUN_AS_NODE"];
  return spawn(electronBinary, args, { cwd: shellDir, env: childEnv });
}

function waitExit(child, timeoutMs, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error(`${label} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal });
    });
  });
}

async function waitForFile(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await stat(path).then(
      () => true,
      () => false,
    );
    if (found) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
}

async function waitReportLines(reportPath, count, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const text = await readFile(reportPath, "utf8").catch(() => "");
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length >= count) return lines;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${count} report lines`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
  }
}

function envFor(workdir, reportDir) {
  return {
    E2E_WORKDIR: workdir,
    E2E_REPORT_DIR: reportDir,
    E2E_IMPORT_MARKER: join(workdir, "import-marker.json"),
    E2E_READY_MARKER: join(workdir, "ready-marker.json"),
  };
}

/**
 * One iteration: real crash state, then a timed relaunch-to-operable.
 * Returns the end-to-end recovery time in milliseconds.
 */
async function sampleOnce(iteration) {
  const workdir = await mkdtemp(join(tmpdir(), `wenshu-pb12-perf-${iteration}-`));
  const reportDir = await mkdtemp(
    join(tmpdir(), `wenshu-pb12-perf-report-${iteration}-`),
  );
  try {
    const baseline = spawnElectron(
      ["./src/e2e-main.cjs", "--e2e"],
      envFor(workdir, reportDir),
    );
    const baselineExit = await waitExit(baseline, 60_000, "baseline e2e run");
    if (baselineExit.code !== 0) {
      throw new Error(`baseline e2e run exited with ${baselineExit.code}`);
    }
    const reportPath = join(reportDir, "scenario-report.ndjson");
    const baselineText = await readFile(reportPath, "utf8");
    const baselineSummary = baselineText
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line))
      .find((line) => line["type"] === "summary");
    const baselineSha = baselineSummary?.["savedDocument"]?.["sha256"];
    if (typeof baselineSha !== "string") {
      throw new Error("baseline summary savedDocument.sha256 missing");
    }
    const crash = spawnElectron(["./src/e2e-main.cjs", "--e2e"], {
      ...envFor(workdir, reportDir),
      E2E_SCENARIO_MODE: "save-loop",
      E2E_SAVE_LOOP_PREVIOUS_SHA256: baselineSha,
    });
    // 11 chain lines + 1 summary from the baseline e2e run are already in
    // the report; the first save-loop line is the 13th.
    await waitReportLines(reportPath, 13, 30_000);
    crash.kill("SIGKILL");
    const crashExit = await waitExit(crash, 30_000, "save-loop crash run");
    if (crashExit.signal !== "SIGKILL") {
      throw new Error(`save-loop did not die by SIGKILL (${crashExit.signal})`);
    }
    // The recovered document may be any completed save-loop version (the kill
    // lands at an arbitrary point); the recover scenario accepts a
    // comma-separated expected set.
    const reportText = await readFile(reportPath, "utf8");
    const expectedSet = reportText
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line))
      .filter((line) => line["type"] === "save-loop")
      .map((line) => line["sha256"])
      .join(",");

    const started = performance.now();
    const recover = spawnElectron(["./src/e2e-main.cjs", "--e2e", "--recover"], {
      ...envFor(workdir, reportDir),
      E2E_EXPECTED_DOC_SHA256: expectedSet,
    });
    await waitForFile(join(workdir, "ready-marker.json"), 60_000);
    const elapsed = performance.now() - started;
    const recoverExit = await waitExit(recover, 60_000, "recovery run");
    if (recoverExit.code !== 0) {
      throw new Error(`recovery run exited with ${recoverExit.code}`);
    }
    return elapsed;
  } finally {
    await rm(workdir, { recursive: true, force: true, maxRetries: 8 });
    await rm(reportDir, { recursive: true, force: true, maxRetries: 8 });
  }
}

async function main() {
  assertEnvironment();
  console.log(`node: ${process.version} at ${process.execPath}`);
  runStep("env:record", process.execPath, [
    "--filter",
    "@wenshu/environment",
    "record",
  ]);
  runStep("build:scenario", process.execPath, [
    "--filter",
    "@wenshu/electron-shell",
    "build:scenario",
  ]);
  await mkdir(BATCH_DIR, { recursive: true });

  const warmup = await sampleOnce("warmup");
  console.log(`warmup: ${warmup.toFixed(1)} ms (not counted)`);
  const samples = [];
  for (let index = 0; index < 10; index += 1) {
    const elapsed = await sampleOnce(index);
    samples.push(elapsed);
    console.log(`sample ${index + 1}/10: ${elapsed.toFixed(1)} ms`);
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  const report = {
    task: "PB-12",
    metric:
      "end-to-end crash recovery to operable (Electron relaunch: dual-prefix " +
      "residue cleanup + store recover + artifact hash verify -> ready marker)",
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
    join(BATCH_DIR, "recovery-e2e-samples.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`median=${median?.toFixed(1)} ms p95=${p95?.toFixed(1)} ms`);
  console.log(`written: ${join(BATCH_DIR, "recovery-e2e-samples.json")}`);
  if ((p95 ?? Number.POSITIVE_INFINITY) > 10000) {
    throw new Error(`p95 recovery ${p95} ms exceeds the 10 s budget`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
