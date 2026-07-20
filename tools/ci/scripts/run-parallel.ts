import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { CI_JOB_NAMES, type CiJobName } from "../src/jobs.ts";
import { runWithConcurrency } from "../src/parallel.ts";

const jobScript = fileURLToPath(new URL("./run-job.ts", import.meta.url));

function executeJob(jobName: CiJobName): Promise<number> {
  console.log(`[ci] starting ${jobName}`);
  return new Promise((resolveJob, rejectJob) => {
    const child = spawn(process.execPath, [jobScript, jobName], {
      cwd: process.cwd(),
      env: { ...process.env, CI: "true" },
      stdio: "inherit",
    });
    child.once("error", rejectJob);
    child.once("exit", (code) => resolveJob(code ?? 1));
  });
}

const results = await runWithConcurrency(CI_JOB_NAMES, 4, executeJob);
console.log("\nCI job summary");
results.forEach(({ jobName, status }) => {
  console.log(`- ${jobName}: ${status === 0 ? "PASS" : `FAIL (${status})`}`);
});
if (results.some(({ status }) => status !== 0)) {
  process.exitCode = 1;
}
