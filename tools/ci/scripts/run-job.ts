import { CI_JOB_NAMES, isCiJobName } from "../src/jobs.ts";
import { runCiJob } from "../src/process.ts";

const requestedJob = process.argv[2];
if (requestedJob === undefined || !isCiJobName(requestedJob)) {
  console.error(`Usage: pnpm ci:job <${CI_JOB_NAMES.join("|")}>`);
  process.exitCode = 2;
} else {
  process.exitCode = runCiJob(requestedJob);
}
