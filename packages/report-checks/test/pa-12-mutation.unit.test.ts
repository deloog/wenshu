import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import type { WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { blockRuns } from "../src/gate-fault-helpers.ts";
import { GATE_FAULT_SAMPLES } from "../src/gate-faults.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

/**
 * 源码变异测试（PA-12）：闸门诚实性各命门必须因正确原因变红——检出只计
 * findings（manualChecks 充数变异）、P0 豁免拒绝、P0 漏检即 FAIL、读者
 * detected 重算（说谎报告不可过）、读者 executedRules 重算（选择性跳过
 * 不可过）。机制同 pa-11b-mutation：真实 src 临时副本 + 单点锚定变异 +
 * 动态导入；锚点缺失/不唯一即 fail-closed。输入统一为真实签署基线的
 * 内存派生样本。
 */

const SRC = resolve(import.meta.dirname, "../src");

async function copySources(): Promise<string> {
  const dir = await mkdtemp(join(resolve(import.meta.dirname, ".."), ".mutation-"));
  await cp(SRC, join(dir, "src"), { recursive: true });
  await cp(resolve(import.meta.dirname, "../schema"), join(dir, "schema"), {
    recursive: true,
  });
  return dir;
}

async function applyMutation(
  dir: string,
  file: string,
  anchor: string,
  replacement: string,
): Promise<void> {
  const path = join(dir, "src", file);
  const source = await readFile(path, "utf8");
  assert.ok(
    source.includes(anchor),
    `mutation anchor not found in ${file}; source drifted`,
  );
  assert.equal(
    source.indexOf(anchor),
    source.lastIndexOf(anchor),
    `mutation anchor must be unique in ${file}`,
  );
  await writeFile(path, source.replace(anchor, replacement), "utf8");
}

interface GateReportLike {
  readonly samples: readonly {
    readonly sampleId: string;
    readonly detected?: boolean;
  }[];
  readonly evaluation: {
    readonly verdict: string;
    readonly failureCodes: readonly string[];
  };
}
interface GateRunnerModule {
  readonly runGate: (
    input: unknown,
    options?: { readonly exemptions?: readonly { ruleId: string; reason: string }[] },
  ) => GateReportLike;
}
interface GateReaderModule {
  readonly validateGateReport: (input: unknown) => {
    readonly ok: boolean;
    readonly issues?: readonly { path: string }[];
  };
}

async function importRunner(dir: string): Promise<GateRunnerModule["runGate"]> {
  const module = (await import(
    pathToFileURL(join(dir, "src", "gate-runner.ts")).href
  )) as GateRunnerModule;
  return module.runGate;
}

async function importReader(
  dir: string,
): Promise<GateReaderModule["validateGateReport"]> {
  const module = (await import(
    pathToFileURL(join(dir, "src", "validate-gate-report.ts")).href
  )) as GateReaderModule;
  return module.validateGateReport;
}

const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const fixtureRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");
const baselineBytes = new Uint8Array(
  readFileSync(
    resolve(
      repoRoot,
      "packages",
      "pdf-evidence",
      "fixtures",
      "baseline",
      "golden-report-baseline.pdf",
    ),
  ),
);
assert.equal(
  createHash("sha256").update(baselineBytes).digest("hex"),
  SIGNED_BASELINE_SHA256,
);
const extracted = extractEvidence(baselineBytes);
assert.ok(extracted.ok);
const baselineEvidence = extracted.evidence;

const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const svgSources = Object.keys(imported.renames).map((original) =>
  readFileSync(resolve(fixtureRoot, original), "utf8"),
);
const expected = buildExpectedBlocks(
  imported.document,
  svgSources.map((source) => extractSvgText(source)),
  svgSources.map((source) => extractSvgAspectRatio(source)),
);
const templateResult = validateTemplate(
  JSON.parse(
    readFileSync(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
  ),
);
assert.ok(templateResult.ok);
const firstPage = baselineEvidence.pages[0];
assert.ok(firstPage !== undefined);
const contentBox = contentBoxFromMargins(
  templateResult.value.page.margin_mm,
  firstPage.widthPt,
  firstPage.heightPt,
);
const gateContext = {
  expected,
  contentBox,
  paginationRules: templateResult.value.pagination_rules,
  headerText: imported.metadata["short_title"],
};

function gateInput(samples: readonly unknown[]) {
  return {
    baselineSha256: SIGNED_BASELINE_SHA256,
    ...gateContext,
    samples,
  };
}

const normalSample = {
  sampleId: "normal-baseline",
  kind: "normal",
  summary: "签署基线正常样本。",
  evidence: baselineEvidence,
};

function faultEvidenceOf(sampleId: string): WenshuPdfEvidence {
  const spec = GATE_FAULT_SAMPLES.find((sample) => sample.sampleId === sampleId);
  assert.ok(spec !== undefined);
  return spec.derive({ baseline: baselineEvidence, expected, contentBox });
}

/** 只降人工的 fault：标题末 run 移到次页 → 实际页不可判定，无自动发现。 */
function manualOnlyTocSample() {
  const headingRuns = blockRuns(
    { baseline: baselineEvidence, expected, contentBox },
    "/blocks/3/children/1",
  );
  const lastRun = headingRuns[headingRuns.length - 1];
  assert.ok(lastRun !== undefined);
  const evidence = structuredClone(baselineEvidence) as WenshuPdfEvidence;
  const moved = evidence.textRuns.find(
    (run) => run.readingOrder === lastRun.readingOrder,
  );
  assert.ok(moved !== undefined);
  moved.pageIndex = lastRun.pageIndex + 1;
  return {
    sampleId: "fault-manual-only",
    kind: "fault",
    severity: "P1",
    domain: "p1-toc-page-match",
    summary: "实际页不可判定 fault（只降人工；对抗性声明 REVIEW 码为期望检出码）。",
    // 对抗声明：P1_TOC_PAGE_REVIEW 只可能出现在 manualChecks——若检出
    // 通道混入 manualChecks，本样本即被冒充为已检出。
    expectedCodes: ["P1_TOC_PAGE_REVIEW"],
    evidence,
  };
}

/** P0 漏检场景：保留 fault 声明但喂入无缺陷证据。 */
function missedP0Sample() {
  const spec = GATE_FAULT_SAMPLES.find(
    (sample) => sample.sampleId === "fault-p0-overlap",
  );
  assert.ok(spec !== undefined);
  return {
    sampleId: spec.sampleId,
    kind: "fault",
    severity: spec.severity,
    domain: spec.domain,
    summary: spec.summary,
    expectedCodes: spec.expectedCodes,
    evidence: structuredClone(baselineEvidence) as WenshuPdfEvidence,
  };
}

async function withMutatedRunner(
  file: string,
  anchor: string,
  replacement: string,
  scenario: (
    control: GateRunnerModule["runGate"],
    mutated: GateRunnerModule["runGate"],
  ) => void,
): Promise<void> {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(mutatedDir, file, anchor, replacement);
    scenario(await importRunner(controlDir), await importRunner(mutatedDir));
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
}

async function withMutatedReader(
  file: string,
  anchor: string,
  replacement: string,
  scenario: (
    control: GateReaderModule["validateGateReport"],
    mutated: GateReaderModule["validateGateReport"],
  ) => void,
): Promise<void> {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(mutatedDir, file, anchor, replacement);
    scenario(await importReader(controlDir), await importReader(mutatedDir));
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
}

test("mutation red: detection must count findings only — manualChecks never satisfy it", async () => {
  await withMutatedRunner(
    "gate-runner.ts",
    "      findings.some((finding) => finding.code === code),",
    "      [...findings, ...manualChecks].some((finding) => finding.code === code),",
    (control, mutated) => {
      const input = gateInput([normalSample, manualOnlyTocSample()]);
      const controlReport = control(input);
      assert.equal(controlReport.samples[1]?.detected, false);
      // 变异后：要么说谎 detected=true，要么被自身契约兜底 GATE_INTERNAL——
      // 两条防线任一生效都证命门为真；与 control 行为相同才算变异无效。
      let mutatedDetected: boolean | undefined;
      let mutatedThrew = false;
      try {
        mutatedDetected = mutated(input).samples[1]?.detected;
      } catch {
        mutatedThrew = true;
      }
      assert.ok(
        mutatedThrew || mutatedDetected === true,
        "mutation must flip manual-only detection (or be caught by self-validation)",
      );
    },
  );
});

test("mutation red: P0 exemption must be rejected — accept-guard removal flips behavior", async () => {
  await withMutatedRunner(
    "gate-runner.ts",
    "    if ((P0_RULE_IDS as readonly string[]).includes(exemption.ruleId)) {",
    "    if (false) {",
    (control, mutated) => {
      const spec = GATE_FAULT_SAMPLES.find(
        (sample) => sample.sampleId === "fault-p0-overlap",
      );
      assert.ok(spec !== undefined);
      const input = gateInput([
        normalSample,
        {
          sampleId: spec.sampleId,
          kind: "fault",
          severity: spec.severity,
          domain: spec.domain,
          summary: spec.summary,
          expectedCodes: spec.expectedCodes,
          evidence: faultEvidenceOf(spec.sampleId),
        },
      ]);
      const options = {
        exemptions: [{ ruleId: "p0-overlap", reason: "试图豁免 P0" }],
      };
      let controlCode: string | undefined;
      try {
        control(input, options);
      } catch (error) {
        controlCode = (error as { code?: string }).code;
      }
      assert.equal(controlCode, "GATE_P0_EXEMPTION_REJECTED");
      // 变异后不再以拒绝码拦下（被自身契约兜底或直接放行）。
      let mutatedCode: string | undefined;
      try {
        mutated(input, options);
      } catch (error) {
        mutatedCode = (error as { code?: string }).code;
      }
      assert.ok(
        mutatedCode !== "GATE_P0_EXEMPTION_REJECTED",
        "mutation must remove the P0 exemption rejection path",
      );
    },
  );
});

test("mutation red: a missed P0 must fail the gate — dropping the check hides GATE_P0_MISSED", async () => {
  await withMutatedRunner(
    "gate-evaluate.ts",
    "  if (p0DetectedFaults < p0Faults.length) {",
    "  if (false) {",
    (control, mutated) => {
      const input = gateInput([normalSample, missedP0Sample()]);
      const controlReport = control(input);
      assert.equal(controlReport.evaluation.verdict, "fail");
      assert.ok(controlReport.evaluation.failureCodes.includes("GATE_P0_MISSED"));
      // 变异后：failureCodes 不再含 GATE_P0_MISSED（或被自身契约兜底抛错）。
      let mutatedCodes: readonly string[] = [];
      let mutatedThrew = false;
      try {
        mutatedCodes = mutated(input).evaluation.failureCodes;
      } catch {
        mutatedThrew = true;
      }
      assert.ok(
        mutatedThrew || !mutatedCodes.includes("GATE_P0_MISSED"),
        "mutation must drop GATE_P0_MISSED (or be caught by self-validation)",
      );
    },
  );
});

test("mutation red: reader recomputes detected — a lying report must not validate", async () => {
  await withMutatedReader(
    "validate-gate-report.ts",
    "    if (sample.detected !== detected) {",
    "    if (false) {",
    (control, mutated) => {
      const fixture = JSON.parse(
        readFileSync(
          resolve(
            import.meta.dirname,
            "..",
            "fixtures",
            "gate",
            "valid",
            "gate-report-minimal.json",
          ),
          "utf8",
        ),
      ) as {
        samples: { findings: unknown[]; detected?: boolean }[];
        evaluation: { detectedFaults: number };
      };
      // 说谎报告：detected=true 但 findings 为空；评估计数同步调成重算值。
      const fault = fixture.samples[1];
      assert.ok(fault !== undefined);
      fault.findings = [];
      fault.detected = true;
      fixture.evaluation.detectedFaults = 0;
      const controlResult = control(fixture);
      assert.ok(!controlResult.ok);
      assert.ok(
        controlResult.issues?.some((issue) => issue.path === "/samples/1/detected"),
      );
      const mutatedResult = mutated(fixture);
      assert.ok(
        mutatedResult.ok,
        "mutation must let the lying report pass reader recompute",
      );
    },
  );
});

test("mutation red: reader recomputes executedRules — silently skipped rules must not validate", async () => {
  await withMutatedReader(
    "validate-gate-report.ts",
    "  if (actual.length !== expected.length || actual.some((id, i) => id !== expected[i])) {",
    "  if (false) {",
    (control, mutated) => {
      const fixture = JSON.parse(
        readFileSync(
          resolve(
            import.meta.dirname,
            "..",
            "fixtures",
            "gate",
            "valid",
            "gate-report-minimal.json",
          ),
          "utf8",
        ),
      ) as {
        executedRules: string[];
        samples: { findings: unknown[]; detected?: boolean }[];
        evaluation: { detectedFaults: number };
      };
      // 选择性跳过 p1-stamp-consistency：规则集缺席、产出同步抹除、自报未检出。
      fixture.executedRules = fixture.executedRules.filter(
        (id) => id !== "p1-stamp-consistency",
      );
      const fault = fixture.samples[1];
      assert.ok(fault !== undefined);
      fault.findings = [];
      fault.detected = false;
      fixture.evaluation.detectedFaults = 0;
      const controlResult = control(fixture);
      assert.ok(!controlResult.ok);
      assert.ok(controlResult.issues?.some((issue) => issue.path === "/executedRules"));
      const mutatedResult = mutated(fixture);
      assert.ok(
        mutatedResult.ok,
        "mutation must let the skipped-rule report pass reader recompute",
      );
    },
  );
});
