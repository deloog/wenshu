/**
 * A02F5 (decision #20 D3, amended to (b′)): deterministic counterexamples for
 * the late-progress race fix. NO "ran N times without going red" evidence —
 * every counterexample injects the late/illegal event directly into the
 * wiring callback (task book §5).
 *
 * The wiring under test is the REAL wireProgress against the REAL
 * ImportFlowController (no mock of the state machine): counterexample 3 only
 * proves "the fix did not go blind" if a genuine illegal dispatch still
 * throws inside the real controller.
 *
 * Mutation anchor: removing `if (!forwarding) return;` from wireProgress
 * turns counterexample 1 red on the dispatchErrors assertion.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createImportFlowController,
  type ImportFlowController,
} from "@wenshu/ux-state/import-flow";

import type { ImportProgress, ProjectBridge } from "../scenario/bridge.ts";
import {
  assertProgressWiringClean,
  emptyProgressWiring,
  wireProgress,
  type ProgressWiring,
} from "../scenario/project-import-shared.ts";

/** Captured renderer-side progress callbacks, fed deterministically by tests. */
const progressCallbacks: ((progress: ImportProgress) => void)[] = [];

function installFakeBridge(): void {
  const fakeBridge = {
    onImportProgress: (callback: (progress: ImportProgress) => void) => {
      progressCallbacks.push(callback);
    },
    offImportProgress: () => {
      progressCallbacks.length = 0;
    },
  } as unknown as ProjectBridge;
  (globalThis as { window?: unknown }).window = { wenshuProject: fakeBridge };
}

function feedProgress(completed = 1, total = 2): void {
  assert.ok(progressCallbacks.length > 0, "no progress callback registered");
  for (const callback of [...progressCallbacks]) {
    callback({ import_id: "imp_test", phase: "read", completed, total });
  }
}

function importingFlow(): ImportFlowController {
  const flow = createImportFlowController();
  flow.dispatch({ type: "import-started", fileName: "report.md" });
  return flow;
}

test("counterexample 1: a late event AFTER the terminal dispatch produces no dispatchError", () => {
  installFakeBridge();
  const flow = importingFlow();
  const wiring = wireProgress(flow);
  feedProgress();
  wiring.dispatchTerminal({ type: "import-succeeded" });
  feedProgress(2, 2); // late event: invoke reply overtook the progress channel
  assert.deepEqual(wiring.dispatchErrors, []);
  assert.doesNotThrow(() => assertProgressWiringClean(wiring));
});

test("counterexample 2: late events are still RECORDED (no new events.length>=1 flake)", () => {
  installFakeBridge();
  const flow = importingFlow();
  const wiring = wireProgress(flow);
  wiring.dispatchTerminal({ type: "import-succeeded" });
  feedProgress(); // every event late — the extreme ordering that breaks literal (b)
  feedProgress();
  assert.equal(wiring.events.length, 2, "late events must still be recorded");
  assert.deepEqual(wiring.dispatchErrors, []);
  assert.doesNotThrow(() => assertProgressWiringClean(wiring));
});

test("counterexample 3: a REAL illegal dispatch inside the open window still fails (no blindness)", () => {
  installFakeBridge();
  // Controller never left empty-project: dispatching import-progress now is a
  // genuine defect and MUST still be recorded + fail the assertion.
  const flow = createImportFlowController();
  const wiring = wireProgress(flow);
  feedProgress();
  assert.equal(wiring.dispatchErrors.length, 1);
  assert.match(wiring.dispatchErrors[0] ?? "", /IMPORT_FLOW_ILLEGAL_TRANSITION/u);
  assert.throws(() => assertProgressWiringClean(wiring), /progress dispatch errors/u);
});

test("counterexample 4: normal happy/partial/cancel-shaped flows stay green (no over-correction)", () => {
  installFakeBridge();
  for (const terminal of [
    { type: "import-succeeded" },
    {
      type: "import-partial",
      items: [
        { fileName: "img2.png", reasonCode: "asset_not_provided", retryable: true },
      ],
    },
    { type: "import-cancelled" },
  ] as const) {
    const flow = importingFlow();
    const wiring = wireProgress(flow);
    feedProgress();
    feedProgress(2, 2);
    wiring.dispatchTerminal(terminal);
    assert.doesNotThrow(() => assertProgressWiringClean(wiring));
    assert.equal(wiring.events.length, 2);
  }
});

test("counterexample 5 (dynamic): forgetting to route the terminal through the wiring is caught", () => {
  installFakeBridge();
  const flow = importingFlow();
  const wiring: ProgressWiring = wireProgress(flow);
  feedProgress();
  // The "forgotten" form: terminal dispatched directly, forwarding still on.
  flow.dispatch({ type: "import-succeeded" });
  feedProgress(2, 2); // late event now hits a closed window → recorded error
  assert.equal(wiring.dispatchErrors.length, 1);
  assert.throws(() => assertProgressWiringClean(wiring), /progress dispatch errors/u);
});

test("counterexample 5 (static pin): wireProgress scenarios never dispatch terminal events directly", () => {
  // The race revives silently if a future (fourth) sub-scenario "forgets" and
  // calls flow.dispatch(terminal) directly while using the strict wiring.
  // This pin makes forgetting mechanically detectable, for present AND future
  // scenario files. Rule: any scenario file that uses wireProgress must route
  // terminal dispatches through wiring.dispatchTerminal. (wiringHelper paths
  // such as guards.ts unsubscribe before their terminal dispatch already and
  // are out of scope — task book §4.3.)
  const scenarioDir = fileURLToPath(new URL("../scenario/", import.meta.url));
  const usesStrictWiring = /\bwireProgress\(/u;
  const terminalDispatch =
    /flow\.dispatch\(\s*\{\s*type:\s*"(?:import-succeeded|import-partial|import-cancelled)"/u;
  const offenders: string[] = [];
  for (const entry of readdirSync(scenarioDir)) {
    if (!entry.endsWith(".ts")) continue;
    const source = readFileSync(join(scenarioDir, entry), "utf8");
    if (usesStrictWiring.test(source) && terminalDispatch.test(source)) {
      offenders.push(entry);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "terminal dispatches must go through wiring.dispatchTerminal (A02F5 structural fix)",
  );
});

test("emptyProgressWiring is fail-closed before installation", () => {
  const wiring = emptyProgressWiring();
  assert.throws(
    () => wiring.dispatchTerminal({ type: "import-succeeded" }),
    /progress wiring not installed/u,
  );
});
