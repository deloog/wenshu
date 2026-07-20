import type { CiJobName } from "./jobs.ts";

export interface CiJobResult {
  readonly jobName: CiJobName;
  readonly status: number;
}

export async function runWithConcurrency(
  jobNames: readonly CiJobName[],
  concurrency: number,
  execute: (jobName: CiJobName) => Promise<number>,
): Promise<readonly CiJobResult[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("CI concurrency must be a positive safe integer");
  }
  const results: CiJobResult[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, jobNames.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < jobNames.length) {
        const index = nextIndex;
        nextIndex += 1;
        const jobName = jobNames[index];
        if (jobName !== undefined) {
          results.push(Object.freeze({ jobName, status: await execute(jobName) }));
        }
      }
    }),
  );
  return Object.freeze(
    results.sort(
      (left, right) => jobNames.indexOf(left.jobName) - jobNames.indexOf(right.jobName),
    ),
  );
}
