/**
 * G2-04 exception registries — the single handwritten source for every
 * exemption the roadmap invariants gate accepts. The checker reads only
 * these tables; nothing is copied into check logic. Every entry must be
 * live: the checker fails closed on stale entries.
 */

export interface ApprovedDeviation {
  readonly task: string;
  readonly unmetDependency: string;
  readonly basis: string;
}

export interface AuditReportException {
  /** Report identifier: file name minus `-claude-audit-report.md`. */
  readonly report: string;
  readonly category: string;
  /** Tasks whose ledger rows may satisfy check 8b by linking this report. */
  readonly countsAsTaskReportFor: readonly string[];
}

export interface LedgerRowWithoutIndependentReport {
  readonly task: string;
  readonly reason: string;
}

export interface ParseCountFloors {
  readonly tasks: number;
  readonly dependencyEdges: number;
  readonly requirementIds: number;
  readonly ledgerEntries: number;
  readonly criticalPathEdges: number;
  readonly waveGroups: number;
}

export interface RoadmapRegistry {
  readonly approvedDeviations: readonly ApprovedDeviation[];
  readonly auditReportExceptions: readonly AuditReportException[];
  readonly ledgerRowsWithoutIndependentReport: readonly LedgerRowWithoutIndependentReport[];
  readonly historicalWaves: readonly string[];
  readonly parseCountFloors: ParseCountFloors;
}

/**
 * Check 3: owner-approved deviations from ledger status monotonicity
 * (task book §5.3). Exhaustive; unregistered non-monotonic states fail.
 */
const APPROVED_DEVIATIONS = Object.freeze<ApprovedDeviation[]>([
  {
    task: "PA-15",
    unmetDependency: "PA-14U",
    basis: "业主决策 C / PA-15 闸门报告（PA-14U 后置，决策记录 #11A）",
  },
]);

/**
 * Check 8a: audit reports without a 1:1 ledger entry (task book §5.4,
 * closed table of 11, exhaustive). `G2-03` is deliberately NOT here —
 * it is the genuine gap fixed by adding its ledger entry.
 */
const AUDIT_REPORT_EXCEPTIONS = Object.freeze<AuditReportException[]>([
  {
    report: "G1-03-to-G1-06",
    category: "多任务合并报告",
    countsAsTaskReportFor: Object.freeze(["G1-03", "G1-04", "G1-05", "G1-06"]),
  },
  {
    report: "G1-11-ci",
    category: "同一任务的分轮报告",
    countsAsTaskReportFor: Object.freeze(["G1-11"]),
  },
  {
    report: "G1-11-isolation-gates",
    category: "同一任务的分轮报告",
    countsAsTaskReportFor: Object.freeze(["G1-11"]),
  },
  {
    report: "PA-A4-A8",
    category: "跟进项批次报告",
    countsAsTaskReportFor: Object.freeze([]),
  },
  {
    report: "PA-A5-A6",
    category: "跟进项批次报告",
    countsAsTaskReportFor: Object.freeze([]),
  },
  {
    report: "PA-06B",
    category: "实施期拆分，并入父任务记载",
    countsAsTaskReportFor: Object.freeze(["PA-06"]),
  },
  {
    report: "PA-11A",
    category: "实施期拆分，并入父任务记载",
    countsAsTaskReportFor: Object.freeze(["PA-11"]),
  },
  {
    report: "PA-11B",
    category: "实施期拆分，并入父任务记载",
    countsAsTaskReportFor: Object.freeze(["PA-11"]),
  },
  {
    report: "engine-reassessment",
    category: "非任务报告（ADR-0013）",
    countsAsTaskReportFor: Object.freeze([]),
  },
  {
    report: "incremental-pagination",
    category: "非任务报告（ADR-0014）",
    countsAsTaskReportFor: Object.freeze([]),
  },
  {
    report: "poc-a-poc-b-chain-integrity",
    category: "非任务报告（链条治理）",
    countsAsTaskReportFor: Object.freeze([]),
  },
]);

/**
 * Check 8b: ledger rows that genuinely have no independent audit report
 * (task book §5.4, closed table of 6, exhaustive). Entries are verified
 * live: if an independent report appears, the entry must be removed.
 */
const LEDGER_ROWS_WITHOUT_INDEPENDENT_REPORT = Object.freeze<
  LedgerRowWithoutIndependentReport[]
>([
  { task: "G1-01", reason: "早期任务，结论记录于台账行本身" },
  { task: "G1-01R", reason: "早期任务，结论记录于台账行本身或 G1-16 总签署" },
  { task: "G1-02", reason: "早期任务，结论记录于台账行本身或 G1-16 总签署" },
  { task: "G1-03C", reason: "早期任务，结论记录于台账行本身或 G1-16 总签署" },
  { task: "G1-12", reason: "DevEco 环境任务，审计按决策 #6 推迟" },
  { task: "PA-14U", reason: "已后置（阶段 2），未执行故无报告" },
  {
    task: "PB-10",
    reason: "已实现，待 Claude 独立审计；审计报告生成后移出本表并替换为报告链接",
  },
]);

/**
 * Check 6: historical waves whose cells use stage-level prose qualifiers
 * and are therefore not mechanically decidable (task book §4). New waves
 * must use a task-level decidable format and may not be added here.
 */
const HISTORICAL_WAVES = Object.freeze(["W1"] as const);

/**
 * Fail-closed parse floors, registered after G2-04 entered the roadmap
 * (task book §5.2). Counts may only grow; dropping below a floor fails.
 */
const PARSE_COUNT_FLOORS = Object.freeze<ParseCountFloors>({
  tasks: 77,
  dependencyEdges: 238,
  requirementIds: 18,
  ledgerEntries: 49,
  criticalPathEdges: 23,
  waveGroups: 12,
});

export const ROADMAP_REGISTRY: RoadmapRegistry = Object.freeze({
  approvedDeviations: APPROVED_DEVIATIONS,
  auditReportExceptions: AUDIT_REPORT_EXCEPTIONS,
  ledgerRowsWithoutIndependentReport: LEDGER_ROWS_WITHOUT_INDEPENDENT_REPORT,
  historicalWaves: HISTORICAL_WAVES,
  parseCountFloors: PARSE_COUNT_FLOORS,
});
