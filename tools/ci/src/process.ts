import { spawnSync } from "node:child_process";

import { CI_JOBS, type CiJobName } from "./jobs.ts";

export function runCiJob(jobName: CiJobName): number {
  const pnpmEntryPoint = process.env["npm_execpath"];
  if (pnpmEntryPoint === undefined || pnpmEntryPoint === "") {
    throw new Error("npm_execpath is required to run a CI job through pnpm");
  }
  for (const command of CI_JOBS[jobName]) {
    console.log(`[ci:${jobName}] ${command.label}`);
    const result = spawnSync(process.execPath, [pnpmEntryPoint, ...command.arguments], {
      cwd: process.cwd(),
      env: { ...process.env, CI: "true" },
      stdio: "inherit",
    });
    const status = result.status ?? 1;
    if (status !== 0) {
      console.error(`[ci:${jobName}] failed at ${command.label} (${status})`);
      return status;
    }
  }
  console.log(`[ci:${jobName}] passed`);
  return 0;
}
