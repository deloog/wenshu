/**
 * A-02 real-file project import scenario (`?mode=project-import&sub=<name>`).
 * Every sub-scenario drives the REAL Host protocol (project.directory.select
 * at 0.2.0, file.import.select at 0.3.0) and the REAL orchestration channels
 * (wenshu.project.*) against REAL files the orchestrator wrote into the
 * workdir. Nothing here mocks the filesystem or the Host. The frozen machine
 * states are consumed through @wenshu/ux-state's import-flow controller, and
 * every emitted state view is reconciled verbatim against the frozen 1.0.0
 * contract data (requiredPresentation / forbiddenSemantics / a11y).
 *
 * Sub-scenarios: happy / partial / cancel / permission-denied /
 * target-exists / handle-reuse. Source-hash immutability and on-disk layout
 * are asserted orchestrator-side (the sandboxed renderer has no fs access).
 */
import { reportAll, reportSummary } from "./report.ts";
import { runHappy, runPartial } from "./project-import-basic.ts";
import { runCancel, runPermissionDenied } from "./project-import-abort.ts";
import { runHandleReuse, runTargetExists } from "./project-import-guards.ts";
import type { SubRun } from "./project-import-shared.ts";

const RUNNERS: Readonly<Record<string, () => Promise<SubRun>>> = Object.freeze({
  happy: runHappy,
  partial: runPartial,
  cancel: runCancel,
  "permission-denied": runPermissionDenied,
  "target-exists": runTargetExists,
  "handle-reuse": runHandleReuse,
});

export async function runProjectImportScenario(): Promise<void> {
  const sub = new URLSearchParams(window.location.search).get("sub") ?? "happy";
  const runner = RUNNERS[sub];
  if (runner === undefined) {
    await reportSummary({
      mode: "project-import",
      sub,
      status: "fail",
      chains: [
        {
          id: "project-import-sub",
          status: "fail",
          detail: `unknown sub-scenario: ${sub}`,
        },
      ],
    });
    return;
  }
  const run = await runner();
  await reportAll(run.results);
  await reportSummary({
    mode: "project-import",
    sub,
    status: run.results.every((result) => result.status === "pass") ? "pass" : "fail",
    chains: run.results,
    projectImport: run.extra,
  });
}
