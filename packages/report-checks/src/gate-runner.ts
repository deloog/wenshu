/**
 * 汇总闸门运行器（PA-12）：对每个样本跑 PA-07~11 全检查族（P0 + P1
 * 运行器真实产出，不重实现、不 mock），汇总 findings/manualChecks，
 * 门槛评估诚实计数（检出只计 findings），产出版本化门禁报告并过自身
 * 契约（fail-closed）。豁免只接受 P1 规则并记录理由；任何 P0 豁免尝试
 * 抛 GATE_P0_EXEMPTION_REJECTED，绝不放行。同样本同报告（确定性）。
 */
import { ReportChecksError } from "./check-input.ts";
import { P0_RULE_IDS, P1_RULE_IDS, type P1RuleId } from "./finding.ts";
import { buildManualChecklist } from "./gate-checklist.ts";
import { evaluateGate, GATE_THRESHOLDS } from "./gate-evaluate.ts";
import type { GateInput, GateRunOptions } from "./gate-input.ts";
import type {
  FaultSample,
  Finding,
  GateSample,
  ManualCheck,
  WenshuGateReport,
} from "./generated/gate-report.ts";
import { runP1Checks } from "./p1-runner.ts";
import { runP0Checks } from "./runner.ts";
import { GATE_REPORT_VERSION, validateGateReport } from "./validate-gate-report.ts";

function byDeterministicOrder(
  a: { ruleId: string; pageIndex: number; nodeRef: string },
  b: { ruleId: string; pageIndex: number; nodeRef: string },
): number {
  return (
    a.ruleId.localeCompare(b.ruleId) ||
    a.pageIndex - b.pageIndex ||
    a.nodeRef.localeCompare(b.nodeRef)
  );
}

/** 豁免输入校验：P0 一律拒绝；未知规则 id fail-closed。 */
function validateExemptions(options?: GateRunOptions): readonly P1RuleId[] {
  const exemptions = options?.exemptions ?? [];
  const exempted: P1RuleId[] = [];
  for (const exemption of exemptions) {
    if ((P0_RULE_IDS as readonly string[]).includes(exemption.ruleId)) {
      throw new ReportChecksError(
        "GATE_P0_EXEMPTION_REJECTED",
        `P0 rule ${exemption.ruleId} can never be exempted`,
      );
    }
    if (!(P1_RULE_IDS as readonly string[]).includes(exemption.ruleId)) {
      throw new ReportChecksError(
        "REPORT_CHECKS_UNKNOWN_RULE",
        `unknown rule id in exemptions: ${exemption.ruleId}`,
      );
    }
    exempted.push(exemption.ruleId);
  }
  return exempted;
}

export function runGate(input: GateInput, options?: GateRunOptions): WenshuGateReport {
  const disabledP1 = validateExemptions(options);
  const executedRules = [
    ...P0_RULE_IDS,
    ...P1_RULE_IDS.filter((id) => !disabledP1.includes(id)),
  ];

  const samples: GateSample[] = input.samples.map((sample) => {
    const p0 = runP0Checks({
      evidence: sample.evidence,
      expected: input.expected,
      contentBox: input.contentBox,
    });
    const p1 = runP1Checks(
      {
        evidence: sample.evidence,
        expected: input.expected,
        contentBox: input.contentBox,
        paginationRules: input.paginationRules,
        headerText: input.headerText,
      },
      { disabledRules: disabledP1 },
    );
    const findings: Finding[] = [...p0.findings, ...p1.findings];
    findings.sort(byDeterministicOrder);
    const manualChecks: ManualCheck[] = [...p1.manualChecks];
    const base = {
      sampleId: sample.sampleId,
      summary: sample.summary,
      evidenceSha256: sample.evidence.source.sha256,
      findings,
      manualChecks,
    };
    if (sample.kind === "normal") {
      return { ...base, kind: "normal", falsePositives: findings.length };
    }
    if (
      sample.severity === undefined ||
      sample.domain === undefined ||
      sample.expectedCodes === undefined ||
      sample.expectedCodes.length === 0
    ) {
      throw new ReportChecksError(
        "GATE_INTERNAL",
        `fault sample ${sample.sampleId} must declare severity/domain/expectedCodes`,
      );
    }
    const expectedCodes = sample.expectedCodes;
    const detected = expectedCodes.every((code) =>
      findings.some((finding) => finding.code === code),
    );
    const fault: FaultSample = {
      ...base,
      kind: "fault",
      severity: sample.severity,
      domain: sample.domain,
      expectedCodes: [...expectedCodes],
      detected,
    };
    return fault;
  });

  const normalSample = samples.find((sample) => sample.kind === "normal");
  const evaluation = evaluateGate(samples);
  const report: WenshuGateReport = {
    gateReportVersion: GATE_REPORT_VERSION,
    source: { baselineSha256: input.baselineSha256 },
    thresholds: { ...GATE_THRESHOLDS },
    executedRules: [...executedRules],
    samples: [...samples],
    evaluation,
    exemptions: (options?.exemptions ?? []).map((exemption) => ({
      ruleId: exemption.ruleId,
      reason: exemption.reason,
    })),
    manualChecklist: [
      ...buildManualChecklist(
        normalSample === undefined ? 0 : normalSample.manualChecks.length,
      ),
    ],
  };
  const validation = validateGateReport(report);
  if (!validation.ok) {
    throw new ReportChecksError(
      "GATE_INTERNAL",
      `gate produced a report that violates its own contract: ${JSON.stringify(
        validation.issues,
      )}`,
    );
  }
  return validation.value;
}
