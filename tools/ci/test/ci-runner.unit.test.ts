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
    ["secrets", "licenses"],
  );
});

test("GitHub workflow delegates every matrix job to the local runner", async () => {
  const workflowPath = fileURLToPath(
    new URL("../../../.github/workflows/verify.yml", import.meta.url),
  );
  const workflow = await readFile(workflowPath, "utf8");
  for (const jobName of CI_JOB_NAMES) {
    assert.match(workflow, new RegExp(`^\\s+- ${jobName}$`, "mu"));
  }
  assert.match(workflow, /pnpm ci:job \$\{\{ matrix\.job \}\}/u);
  assert.match(workflow, /pnpm install --frozen-lockfile/u);
  assert.match(workflow, /permissions:\s+contents: read/u);
  assert.doesNotMatch(workflow, /uses: [^\n]+@(v\d+|main|master)\s*$/mu);
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
