import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CI_JOBS, CI_JOB_NAMES } from "../src/jobs.ts";
import { runWithConcurrency } from "../src/parallel.ts";

test("CI jobs cover independent gates and isolated build outputs", () => {
  assert.deepEqual(Object.keys(CI_JOBS), [...CI_JOB_NAMES]);
  assert.equal(new Set(CI_JOB_NAMES).size, CI_JOB_NAMES.length);
  const outputDirectories = CI_JOB_NAMES.filter((name) => name.startsWith("build-"))
    .flatMap((name) => CI_JOBS[name])
    .flatMap((command) => command.arguments)
    .filter((argument) => argument.startsWith("dist/ci-"));
  assert.equal(outputDirectories.length, 3);
  assert.equal(new Set(outputDirectories).size, 3);
  assert.deepEqual(
    CI_JOBS.security.map(({ label }) => label),
    ["secrets", "licenses", "fonts", "supply-chain"],
  );
  assert.deepEqual(
    CI_JOBS.contracts.map(({ label }) => label),
    ["contracts", "project-storage", "fixtures", "environment"],
  );
});

test("the root verification entry includes the frozen font gate", async () => {
  const packagePath = fileURLToPath(new URL("../../../package.json", import.meta.url));
  const parsed = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
  assert.ok(typeof parsed === "object" && parsed !== null && "scripts" in parsed);
  const scripts = parsed.scripts;
  assert.ok(typeof scripts === "object" && scripts !== null);
  assert.equal(
    "fonts:check" in scripts && scripts["fonts:check"],
    "pnpm --filter @wenshu/fonts check",
  );
  assert.match(
    "verify" in scripts && typeof scripts["verify"] === "string"
      ? scripts["verify"]
      : "",
    /(?:^|&&\s*)pnpm fonts:check(?:\s*&&|$)/u,
  );
});

test("GitHub workflow delegates every matrix job to the local runner", async () => {
  const workflowPath = fileURLToPath(
    new URL("../../../.github/workflows/verify.yml", import.meta.url),
  );
  const workflow = await readFile(workflowPath, "utf8");
  const matrix = workflow.match(
    /\n {6}matrix:\r?\n {8}job:\r?\n((?: {10}- [^\r\n]+\r?\n)+)/u,
  );
  assert.notEqual(matrix, null);
  const matrixJobs = (matrix?.[1] ?? "")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.trim().replace(/^- /u, ""));
  assert.deepEqual(matrixJobs, [...CI_JOB_NAMES]);
  assert.match(workflow, /pnpm ci:job \$\{\{ matrix\.job \}\}/u);
  assert.match(workflow, /pnpm install --frozen-lockfile/u);
  assert.match(workflow, /permissions:\s+contents: read/u);
  const actionReferences = [...workflow.matchAll(/^\s+uses:\s+(\S+)/gmu)].map(
    (match) => match[1] ?? "",
  );
  assert.equal(actionReferences.length, 5);
  actionReferences.forEach((reference) => {
    assert.match(reference, /^[^@\s]+@[0-9a-f]{40}$/u);
  });
});

test("workflow scope gating is fail-closed and pinned (CI-01)", async () => {
  const workflowPath = fileURLToPath(
    new URL("../../../.github/workflows/verify.yml", import.meta.url),
  );
  const workflow = await readFile(workflowPath, "utf8");
  // Shallow-clone trap: the scope job must fetch full history for its diff baseline.
  assert.match(workflow, /fetch-depth: 0/u);
  // jobs.<job_id>.if has no matrix context (GitHub contexts reference): the
  // per-leg skip decision must live at step level, and the job-level if must
  // keep every check run present even when scope fails (fail-closed).
  assert.match(workflow, /needs: scope/u);
  assert.match(workflow, /if: \$\{\{ always\(\) && !cancelled\(\) \}\}/u);
  const jobLevelIf = workflow.match(/\n {4}if: [^\r\n]+/gu) ?? [];
  assert.deepEqual(jobLevelIf, ["\n    if: ${{ always() && !cancelled() }}"]);
  // MINOR-1: exact membership via fromJSON — substring matching would accept
  // a hypothetical job named e.g. "static-analysis" as part of the run set.
  const stepGuard =
    /if: \$\{\{ env\.CI_SCOPE_DOCS_ONLY != 'true' \|\| contains\(fromJSON\('\["static","unit-config","security"\]'\), matrix\.job\) \}\}/u;
  const guardedSteps = workflow.match(new RegExp(stepGuard.source, "gu")) ?? [];
  assert.equal(guardedSteps.length, 6); // checkout/setup-node/pnpm/store/install ×6 shared steps
  assert.match(
    workflow,
    /if: \$\{\{ matrix\.job == 'e2e' && \(env\.CI_SCOPE_DOCS_ONLY != 'true' \|\| contains\(fromJSON\('\["static","unit-config","security"\]'\), matrix\.job\)\) \}\}/u,
  );
  assert.doesNotMatch(workflow, /contains\('static unit-config security'/u);
  // The classifier runs the local fail-closed script; no new third-party action.
  assert.match(workflow, /node tools\/ci\/scripts\/scope\.ts/u);
});

test("local scheduling runs concurrently without exceeding its budget", async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await runWithConcurrency(CI_JOB_NAMES, 3, async (jobName) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise<void>((resolveJob) => setImmediate(resolveJob));
    active -= 1;
    return jobName === "contracts" ? 7 : 0;
  });
  assert.equal(maximumActive, 3);
  assert.deepEqual(
    results.map(({ jobName }) => jobName),
    [...CI_JOB_NAMES],
  );
  assert.equal(results.find(({ jobName }) => jobName === "contracts")?.status, 7);
});
