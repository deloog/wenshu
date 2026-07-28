/* Generated from schema/gate-report.schema.json. Do not edit directly. */

export type GateSample = NormalSample | FaultSample;

/**
 * Version 1.0.0 PoC-A summary gate report (PA-12). Aggregates the real outputs of the full check family (P0: PA-07; P1: PA-08/09/10/11B) over the normal sample plus 12 fault samples: per-sample findings/manualChecks (location + numeric basis only, never document content), threshold evaluation (P0 detection rate, detected faults / 12, normal-sample false positives counted from real findings only), pass/fail verdict, exemptions with reasons (P0 rules can never be exempted), and the manual checklist carrying PA-A7/J1/K1/L1~L4/M1~M5/N1/N2. manualChecks are listed for human review but are never counted as automatic detections. Thresholds are pinned as schema constants so lowering them requires a contract version bump.
 */
export interface WenshuGateReport {
  gateReportVersion: "1.0.0";
  source: GateSource;
  thresholds: GateThresholds;
  /**
   * Rule ids actually executed for every sample: the full P0+P1 registry minus rules absent via declared exemptions. Skipping a rule without a declared exemption violates the semantic contract.
   *
   * @minItems 1
   */
  executedRules: string[];
  /**
   * @minItems 1
   */
  samples: GateSample[];
  evaluation: GateEvaluation;
  /**
   * Declared per-rule exemptions (P1 only, each with a recorded reason). A P0 exemption attempt is rejected by the gate and can never appear here.
   */
  exemptions: GateExemption[];
  /**
   * Manual checklist carrying the audit followups PA-A7/J1/K1/L1~L4/M1~M5/N1/N2 item by item. Listed for human review; never merged into automatic detection counts.
   *
   * @minItems 1
   */
  manualChecklist: ManualChecklistItem[];
}
export interface GateSource {
  /**
   * SHA-256 of the PA-05 signed baseline PDF the normal sample and all fault derivations anchor to.
   */
  baselineSha256: string;
}
export interface GateThresholds {
  /**
   * Pinned fault sample count (roadmap PA-12). Changing it requires a contract version bump.
   */
  faultSampleCount: 12;
  /**
   * Pinned minimum P0+P1 fault samples that must be detected (of 12), counting real findings only.
   */
  minDetectedFaults: 10;
  /**
   * Pinned maximum findings tolerated on the normal (signed baseline) sample, honestly counted.
   */
  maxNormalFalsePositives: 2;
}
export interface NormalSample {
  sampleId: string;
  kind: "normal";
  /**
   * Static sample description. Never document content.
   */
  summary: string;
  evidenceSha256: string;
  findings: Finding[];
  manualChecks: ManualCheck[];
  /**
   * Honest count of findings on the normal sample (semantically equals findings.length; nothing may be hidden or reclassified).
   */
  falsePositives: number;
}
export interface Finding {
  ruleId: string;
  code: string;
  pageIndex: number;
  /**
   * Deterministic node locator: run:<readingOrder>, figure:<pageIndex>:<mcid>, page:<index>, or a document block path like /blocks/3.
   */
  nodeRef: string;
  basis: {
    metrics: {
      [k: string]: number;
    };
    relatedNodeRef?: string;
  };
}
export interface ManualCheck {
  ruleId: string;
  code: string;
  pageIndex: number;
  nodeRef: string;
  /**
   * Static explanation of why automatic determination is impossible. Never document content.
   */
  reason: string;
  basis: {
    metrics: {
      [k: string]: number;
    };
    relatedNodeRef?: string;
  };
}
export interface FaultSample {
  sampleId: string;
  kind: "fault";
  /**
   * Severity of the injected real defect. P0 faults must all be detected; a P0 miss fails the gate and cannot be exempted away.
   */
  severity: "P0" | "P1";
  /**
   * Rule id of the domain the injected defect belongs to.
   */
  domain: string;
  /**
   * Static description of the injected defect. Never document content.
   */
  summary: string;
  /**
   * Finding codes the injected defect must produce. Detection is judged against findings only; manualChecks never count.
   *
   * @minItems 1
   */
  expectedCodes: string[];
  /**
   * SHA-256 of the baseline PDF the fault was deterministically derived from (in-memory derivation; frozen artifacts untouched).
   */
  evidenceSha256: string;
  findings: Finding[];
  manualChecks: ManualCheck[];
  /**
   * True iff every expected code appears in findings (semantically recomputed; manualChecks presence never satisfies detection).
   */
  detected: boolean;
}
export interface GateEvaluation {
  /**
   * Actual number of fault samples in this run.
   */
  faultSampleCount: number;
  /**
   * Fault samples whose every expected code appears in real findings. manualChecks are never counted.
   */
  detectedFaults: number;
  p0FaultSampleCount: number;
  p0DetectedFaults: number;
  /**
   * p0DetectedFaults / p0FaultSampleCount (1 when no P0 sample exists). Must be 1 for the gate to pass.
   */
  p0DetectionRate: number;
  /**
   * Sum of findings over all normal samples, honestly counted.
   */
  normalFalsePositives: number;
  verdict: "pass" | "fail";
  /**
   * Stable failure codes; verdict is pass iff this list is empty.
   */
  failureCodes: (
    "GATE_P0_MISSED" | "GATE_DETECTION_BELOW_THRESHOLD" | "GATE_FALSE_POSITIVE_OVERFLOW"
  )[];
}
export interface GateExemption {
  /**
   * Exempted P1 rule id (expressed as absence from executedRules). P0 rule ids are rejected by the gate and forbidden here.
   */
  ruleId: string;
  /**
   * Recorded reason for the exemption. Static text only.
   */
  reason: string;
}
export interface ManualChecklistItem {
  /**
   * Audit followup id (PA-A7/J1/K1/L1~L4/M1~M5/N1/N2).
   */
  itemId: string;
  /**
   * carried: truly carried by this report; registered: recorded in the risk register/manual list; closed: already closed with evidence; external: owned outside this gate.
   */
  disposition: "carried" | "registered" | "closed" | "external";
  /**
   * Static carry-over statement. Never document content.
   */
  summary: string;
  /**
   * Authoritative doc path for the followup (ledger/audit report/decision).
   */
  reference?: string;
  /**
   * Dynamic count when the item pins a real quantity (e.g. manualChecks total for PA-J1/PA-M1/PA-N2).
   */
  relatedCount?: number;
}
