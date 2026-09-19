/**
 * verify-a04e2b-harness（A-04E-2b VM 批次判定器，工具层只做机械判定与指标输出）。
 *
 * 输入：a04e2b-harness.ts 的 --out 目录（含 harness-report.json 与 slots/）。
 * 判定（任一项失败即非零退出，全部判定只读报告与槽位落盘字节）：
 *   G1 报告完整：无 fatal，runRecords 轮数 === report.runs；
 *   G2 每轮：无 runError，3 次编辑记录齐备，cancelDemo 存在；
 *   G3 增量诚实性：每编辑 kind==="incremental"；pageRangesPrinted 非空、区间可解析、
 *      a>=1 且 a<=b；打印跨度 < 文档总页数（印满全文却报增量=造假，拒）；
 *      updatedRange 起点===首个区间起点且终点不超区间终点；
 *   G4 对账事实：每编辑 reconcile.windowMismatchPages 为空、tocPagesEqual、
 *      pageCountEqual、editedTextVisibleInWindow、comparedRuns>0；
 *   G5 跨轮确定性：同位次编辑的 updatedRange / pageRangesPrinted 跨轮逐字相等；
 *      槽位窗格 PDF 证据键（a04e2b-slot-keys.ts，tag-free run 序列 sha256，经
 *      child_process 调算法真源）跨轮全等；tocSlotUpdated 跨轮一致，若更新则
 *      目录页槽证据键同样跨轮全等；
 *   G6 取消演示：fallback.kind==="full-required"；background.outcome==="rejected"
 *      且 errorCode==="PDF_EXPORT_CANCELLED"；后台期间旧槽位零替换
 *      （oldSlotsUntouchedDuringBackground）；复跑 recovery.pageCount===基线页数；
 *      UI 探针 3 击延迟/maxGapMs/settleAfterClickMs 均为有限数。
 *   G7 取消结案 2s 预算（A-04E-2-P6，决策 #27 D3，冻结预算 performance-budgets.md
 *      「取消后 2 秒内停止继续消耗主要计算资源」）：逐轮 settleAfterClickMs ≤ 2000，
 *      缺字段/非有限数/超限均 fail；逐轮判定（单次操作语义），非 p95/均值。
 * 指标输出（判定归 VM 批次脚本）：增量编辑 totalMs 全样本排序、p95（nearest-rank）、
 * 分区 p95、UI 探针最大点击延迟与最大事件循环间隙。
 *
 * 用法：node tools/a-04e/verify-a04e2b-harness.mjs <harness-out-dir>
 */
import { execFileSync } from "node:child_process";
import console from "node:console";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const outDir = resolve(process.argv[2] ?? "");
if (process.argv[2] === undefined) {
  console.error("usage: verify-a04e2b-harness.mjs <harness-out-dir>");
  process.exit(2);
}
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const slotKeysScript = resolve(
  repoRoot,
  "packages/pdf-export/scripts/a04e2b-slot-keys.ts",
);

const failures = [];
const fail = (message) => failures.push(message);

/** G7：取消结案预算（冻结预算原文口径，决策 #27 D3 唯一验收条款）。 */
const CANCEL_SETTLE_BUDGET_MS = 2000;

/** @returns {{a: number, b: number}} */
const parseRange = (range, context) => {
  const match = /^(\d+)-(\d+)$/.exec(range);
  if (match === null) {
    fail(`${context}: unparseable page range "${range}"`);
    return { a: 0, b: -1 };
  }
  return { a: Number(match[1]), b: Number(match[2]) };
};

const slotKey = (fileName, pages) =>
  execFileSync(
    process.execPath,
    [slotKeysScript, resolve(outDir, "slots", fileName), String(pages)],
    {
      encoding: "utf8",
    },
  ).trim();

const report = JSON.parse(readFileSync(resolve(outDir, "harness-report.json"), "utf8"));

// ---- G1 报告完整 ----
if (report.fatal !== undefined) fail(`fatal present: ${report.fatal}`);
const pageCount = report.baseline?.pageCount;
if (!Number.isInteger(pageCount) || pageCount < 1) {
  fail("baseline.pageCount missing or invalid");
}
const records = report.runRecords ?? [];
if (records.length !== report.runs) {
  fail(`runRecords ${records.length} !== runs ${report.runs}`);
}

const editTotals = [];
const zoneTotals = [[], [], []];
const probeLatencies = [];
const maxGaps = [];
const perZone = [[], [], []]; // 跨轮确定性比对容器

for (const record of records) {
  const tag = `run-${String(record.run).padStart(2, "0")}`;
  // ---- G2 轮次完整 ----
  if (record.runError !== undefined) fail(`${tag}: runError=${record.runError}`);
  if ((record.edits ?? []).length !== 3) {
    fail(`${tag}: edits ${(record.edits ?? []).length} !== 3`);
    continue;
  }
  if (record.cancelDemo == null) fail(`${tag}: cancelDemo missing`);

  for (const [zone, edit] of record.edits.entries()) {
    const ctx = `${tag} edit ${zone + 1}`;
    // ---- G3 增量诚实性 ----
    if (edit.kind !== "incremental") {
      fail(`${ctx}: kind=${edit.kind} (${edit.reason ?? "no reason"})`);
      continue;
    }
    const ranges = edit.pageRangesPrinted ?? [];
    if (ranges.length === 0) fail(`${ctx}: pageRangesPrinted empty`);
    let firstA = null;
    let lastB = null;
    for (const range of ranges) {
      const { a, b } = parseRange(range, ctx);
      if (a < 1 || a > b) fail(`${ctx}: invalid range ${range}`);
      if (b - a + 1 >= pageCount) {
        fail(
          `${ctx}: printed span ${b - a + 1} covers whole document (${pageCount}) — fake incremental`,
        );
      }
      if (firstA === null) firstA = a;
      lastB = b;
    }
    const [rangeStart, rangeEnd] = edit.updatedRange ?? [];
    if (rangeStart !== firstA) {
      fail(
        `${ctx}: updatedRange start ${rangeStart} !== first printed range start ${firstA}`,
      );
    }
    if (rangeEnd > lastB) {
      fail(`${ctx}: updatedRange end ${rangeEnd} beyond printed range end ${lastB}`);
    }
    // ---- G4 对账事实 ----
    const rec = edit.reconcile ?? {};
    if ((rec.windowMismatchPages ?? [1]).length !== 0) {
      fail(`${ctx}: windowMismatchPages=${JSON.stringify(rec.windowMismatchPages)}`);
    }
    if (rec.tocPagesEqual !== true) fail(`${ctx}: tocPagesEqual!==true`);
    if (rec.pageCountEqual !== true) fail(`${ctx}: pageCountEqual!==true`);
    if (rec.editedTextVisibleInWindow !== true) {
      fail(`${ctx}: edited text not visible in window evidence (stale content?)`);
    }
    if (!(rec.comparedRuns > 0)) fail(`${ctx}: comparedRuns=${rec.comparedRuns}`);
    // 指标采样
    editTotals.push(edit.timings.totalMs);
    zoneTotals[zone].push(edit.timings.totalMs);
    // ---- G5 跨轮确定性容器 ----
    perZone[zone].push({
      tag,
      updatedRange: JSON.stringify(edit.updatedRange),
      ranges: JSON.stringify(ranges),
      tocSlotUpdated: edit.tocSlotUpdated === true,
      windowKey: slotKey(
        `${tag}-edit-${zone + 1}-window.pdf`,
        rangeEnd - rangeStart + 1,
      ),
      tocKey:
        edit.tocSlotUpdated === true
          ? slotKey(`${tag}-edit-${zone + 1}-toc.pdf`, 1)
          : null,
    });
  }

  // ---- G6 取消演示 ----
  const demo = record.cancelDemo ?? {};
  if (demo.fallback?.kind !== "full-required") {
    fail(`${tag}: heading edit did not fall back (kind=${demo.fallback?.kind})`);
  }
  if (
    demo.background?.outcome !== "rejected" ||
    demo.background?.errorCode !== "PDF_EXPORT_CANCELLED"
  ) {
    fail(
      `${tag}: background outcome=${demo.background?.outcome} code=${demo.background?.errorCode}`,
    );
  }
  if (demo.oldSlotsUntouchedDuringBackground !== true) {
    fail(`${tag}: old preview slots were replaced during background task`);
  }
  if (demo.recovery?.pageCount !== pageCount) {
    fail(`${tag}: recovery pageCount=${demo.recovery?.pageCount} !== ${pageCount}`);
  }
  const tl = demo.timelineMs ?? {};
  if ((tl.probeClickLatencies ?? []).length !== 3) {
    fail(`${tag}: probeClickLatencies ${JSON.stringify(tl.probeClickLatencies)}`);
  }
  for (const [name, value] of [
    ["maxGapMsDuringBackground", tl.maxGapMsDuringBackground],
    ["settleAfterClickMs", tl.settleAfterClickMs],
  ]) {
    if (!Number.isFinite(value)) fail(`${tag}: ${name} not finite (${value})`);
  }
  // ---- G7 取消结案 2s 预算（逐轮；缺字段/非有限数/超限均 fail） ----
  if (!Number.isFinite(tl.settleAfterClickMs)) {
    fail(
      `${tag}: G7 settleAfterClickMs missing or not finite (${tl.settleAfterClickMs})`,
    );
  } else if (tl.settleAfterClickMs > CANCEL_SETTLE_BUDGET_MS) {
    fail(
      `${tag}: G7 settleAfterClickMs ${tl.settleAfterClickMs} > ${CANCEL_SETTLE_BUDGET_MS} (cancel-settle budget, decision #27 D3)`,
    );
  }
  probeLatencies.push(...(tl.probeClickLatencies ?? []));
  maxGaps.push(tl.maxGapMsDuringBackground);
}

// ---- G5 跨轮全等 ----
for (const [zone, samples] of perZone.entries()) {
  if (samples.length !== records.length) continue; // G2/G3 已记失败
  for (const field of [
    "updatedRange",
    "ranges",
    "tocSlotUpdated",
    "windowKey",
    "tocKey",
  ]) {
    const values = new Set(samples.map((sample) => String(sample[field])));
    if (values.size !== 1) {
      fail(
        `edit ${zone + 1}: cross-run ${field} diverged: ${[...values].join(" vs ")}`,
      );
    }
  }
}

// ---- 指标输出（p95 nearest-rank；预算判定归 VM 批次脚本） ----
const p95 = (values) => {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
};
if (editTotals.length > 0) {
  const sorted = [...editTotals].sort((x, y) => x - y);
  console.log(
    `incremental-totalMs sorted: ${sorted.map((v) => v.toFixed(1)).join(", ")}`,
  );
  console.log(`p95-incremental-totalMs=${p95(editTotals).toFixed(1)}`);
  for (const [zone, values] of zoneTotals.entries()) {
    if (values.length > 0) {
      console.log(
        `zone-${zone + 1}-p95=${p95(values).toFixed(1)} (n=${values.length})`,
      );
    }
  }
  console.log(`probe-click-latency-max=${Math.max(...probeLatencies).toFixed(1)}`);
  console.log(`eventloop-maxgap-max=${Math.max(...maxGaps).toFixed(1)}`);
}

if (failures.length > 0) {
  for (const message of failures) console.error(`FAIL: ${message}`);
  console.error(`verify-a04e2b-harness: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log("verify-a04e2b-harness: PASS (all gates green)");
