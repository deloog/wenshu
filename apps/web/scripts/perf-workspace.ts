/**
 * A-03 performance sampler (ADR-0030 D4a): per-key end-to-end latency of the
 * real WorkspaceController (PB-03 transaction + flatten refresh included) on
 * the committed 30,000-character fixture. PB-12 single-JSON format per
 * metric; 1 warmup (discarded) + 10 samples per metric; ALL raw values kept.
 *
 * Metrics (budgetMs = 100 per key; the 2s-no-feedback hard line is asserted
 * as maxSample < 2000):
 *   insert-char         printable input at a mid-document paragraph
 *   split-paragraph     Enter mid-paragraph (rewrite + insert in one txn)
 *   move-block          Ctrl+ArrowDown same-container move
 *   promote-paragraph   Ctrl+T type correction (new section wraps paragraph)
 *   table-row-insert    Ctrl+Enter in table mode
 *   undo-redo-pair      Ctrl+Z immediately followed by Ctrl+Y
 *
 * Focus positioning between samples uses controller.moveFocus directly —
 * navigation is NOT the measured operation and its cost is excluded on
 * purpose; every measured key is a real handleKey round-trip.
 *
 * Usage: pnpm --filter @wenshu/web perf:workspace
 * Output: artifacts/perf/2026-08-05-A-03/*.json (+ stdout summary)
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import type { SupportedDocument } from "@wenshu/document-model";

import { WorkspaceController } from "../src/workspace/controller.ts";

const BUDGET_MS = 100;
const HARD_LINE_MS = 2_000;
const SAMPLES = 10;
const ENVIRONMENT =
  `wenshu-dev-primary (Win10 local dev machine, Node ${process.version}; ` +
  "NOT the Win11 reference machine Node 24.17.0 — G1-14 registered deviation; " +
  "reference-machine re-run is the signing-time follow-up)";

const fixtureUrl = new URL("../test/fixtures/workspace-30k.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as SupportedDocument;

const outDir = new URL("../../../artifacts/perf/2026-08-05-A-03/", import.meta.url);
await mkdir(outDir, { recursive: true });

interface MetricResult {
  readonly task: string;
  readonly metric: string;
  readonly environment: string;
  readonly unit: "ms";
  readonly budgetMs: number;
  readonly warmupRuns: number;
  readonly samples: number[];
  readonly median: number;
  readonly p95: number;
  readonly maxSample: number;
  readonly recordedAt: string;
}

function summarize(task: string, metric: string, samples: number[]): MetricResult {
  const sorted = [...samples].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const p95 =
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
  const maxSample = sorted[sorted.length - 1] ?? 0;
  return {
    task: "A-03",
    metric,
    environment: ENVIRONMENT,
    unit: "ms",
    budgetMs: BUDGET_MS,
    warmupRuns: 1,
    samples,
    median,
    p95,
    maxSample,
    recordedAt: new Date().toISOString(),
  };
}

async function timedKey(
  controller: WorkspaceController,
  key: string,
  mods?: { ctrl?: boolean; shift?: boolean },
): Promise<number> {
  const start = performance.now();
  await controller.handleKey({
    key,
    ctrlKey: mods?.ctrl ?? false,
    shiftKey: mods?.shift ?? false,
  });
  return performance.now() - start;
}

function paragraphRowIndex(controller: WorkspaceController, ordinal: number): number {
  const rows = controller.snapshot().rows;
  let seen = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.kind === "paragraph") {
      if (seen === ordinal) return index;
      seen += 1;
    }
  }
  return rows.length - 1;
}

function tableRowIndex(controller: WorkspaceController): number {
  const rows = controller.snapshot().rows;
  const index = rows.findIndex((entry) => entry.kind === "table");
  if (index < 0) throw new Error("fixture lost its tables");
  return index;
}

/** Runs one metric: fresh controller, 1 warmup + SAMPLES measured keys. */
async function sampleMetric(
  metric: string,
  prepare: (controller: WorkspaceController, sample: number) => Promise<void> | void,
  key: string,
  mods?: { ctrl?: boolean; shift?: boolean },
): Promise<MetricResult> {
  const controller = new WorkspaceController(fixture);
  await prepare(controller, -1); // warmup (discarded)
  await timedKey(controller, key, mods);
  const samples: number[] = [];
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    await prepare(controller, sample);
    samples.push(await timedKey(controller, key, mods));
  }
  return summarize("A-03", metric, samples);
}

const results: MetricResult[] = [];

results.push(
  await sampleMetric(
    "insert-char: printable input at a mid-document paragraph (30k fixture)",
    (controller, sample) => {
      controller.setFocus(paragraphRowIndex(controller, 100 + (sample + 1) * 5), 50);
    },
    "z",
  ),
);

results.push(
  await sampleMetric(
    "split-paragraph: Enter mid-paragraph, rewrite+insert in one transaction",
    (controller, sample) => {
      // Spaced ordinals: each split inserts a half-paragraph BELOW the target,
      // shifting later ordinals +1; 10-wide spacing keeps every sample on a
      // full 100-char paragraph (never on a previous split's 50-char half).
      controller.setFocus(paragraphRowIndex(controller, 120 + (sample + 1) * 10), 50);
    },
    "Enter",
  ),
);

results.push(
  await sampleMetric(
    "move-block: Ctrl+ArrowDown same-container block move",
    (controller, sample) => {
      controller.setFocus(paragraphRowIndex(controller, 60 + (sample + 1) * 5), 0);
    },
    "ArrowDown",
    { ctrl: true },
  ),
);

results.push(
  await sampleMetric(
    "promote-paragraph: Ctrl+T type correction (new section wraps paragraph)",
    (controller, sample) => {
      controller.setFocus(paragraphRowIndex(controller, 140 + (sample + 1) * 5), 0);
    },
    "t",
    { ctrl: true },
  ),
);

results.push(
  await sampleMetric(
    "table-row-insert: Ctrl+Enter inside table mode",
    async (controller) => {
      controller.setFocus(tableRowIndex(controller), 0);
      if (controller.snapshot().focus.table === undefined) {
        await controller.handleKey({ key: "Enter", ctrlKey: false, shiftKey: false });
      }
    },
    "Enter",
    { ctrl: true },
  ),
);

{
  // undo-redo-pair: commit one edit, then time Ctrl+Z + Ctrl+Y as one sample.
  const controller = new WorkspaceController(fixture);
  const samples: number[] = [];
  const pair = async (sample: number): Promise<number> => {
    controller.setFocus(paragraphRowIndex(controller, 200 + (sample + 2) * 5), 40);
    await timedKey(controller, "u");
    const start = performance.now();
    await controller.handleKey({ key: "z", ctrlKey: true, shiftKey: false });
    await controller.handleKey({ key: "y", ctrlKey: true, shiftKey: false });
    return performance.now() - start;
  };
  await pair(-1); // warmup (discarded)
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    samples.push(await pair(sample));
  }
  results.push(
    summarize("A-03", "undo-redo-pair: Ctrl+Z + Ctrl+Y back to back", samples),
  );
}

let failures = 0;
for (const result of results) {
  const fileName = `${result.metric.split(":")[0]}-samples.json`;
  await writeFile(new URL(fileName, outDir), `${JSON.stringify(result, null, 2)}\n`);
  const over = result.samples.filter((sample) => sample > BUDGET_MS).length;
  if (result.p95 > BUDGET_MS || result.maxSample >= HARD_LINE_MS) failures += 1;
  console.log(
    `${result.metric.split(":")[0]}: p95=${result.p95.toFixed(1)}ms ` +
      `median=${result.median.toFixed(1)}ms max=${result.maxSample.toFixed(1)}ms ` +
      `over-budget=${over}/${result.samples.length}`,
  );
}
console.log(
  `fixture bodyChars target >=30000; artifacts -> artifacts/perf/2026-08-05-A-03/`,
);
if (failures > 0) {
  console.error(`PERF BUDGET EXCEEDED in ${failures} metric(s)`);
  process.exitCode = 1;
}
