/**
 * p1-heading-keep（PA-08）：标题与正文分离。
 *
 * 自动判定（确定性核心）：标题块同页无任何后继正文行（0 行）——
 * 这违反渲染器实际承诺的不变量：模板 heading_keep_with_next_lines > 0
 * 经 PA-04 注册近似为 CSS break-after: avoid（CSS 无「保留下 N 行」
 * 等价物，近似已书面登记），即保证标题后至少 1 行同页。0 行 = 标题
 * 落页尾与后续正文断开 → P1_HEADING_SEPARATED。
 *
 * 人工核验（诚实门）：0 < 后继行数 < 模板 heading_keep_with_next_lines
 * 的区间是模板意图与已登记近似之差（标题后接标题、单行完整段落等
 * 合法形态落在此区间），无确定性判定依据 → P1_HEADING_KEEP_REVIEW
 * 附行数与模板阈值，绝不作为自动发现。
 *
 * 标题后紧邻表格/图片块：跳过（PA-09/10 专项域，本规则不夹带）。
 */
import {
  attributeBlocks,
  bodyRunIndexesOnPage,
  countLines,
  pagesOfBlock,
  type AttributedBlock,
  type BlockAttribution,
} from "../p1-attribution.ts";
import type { ExpectedBlock, ExpectedBlockKind } from "../expected-content.ts";
import { makeFinding, makeManualCheck } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";

/** 「标题保留下续」语义覆盖的文本块类；表格/图片块归 PA-09/10 域。 */
const TEXTUAL_NEXT_KINDS: readonly ExpectedBlockKind[] = [
  "paragraph",
  "quote",
  "quote-attribution",
  "list-marker",
  "list-item",
  "section-title",
];

const KEEP_REVIEW_REASON =
  "模板 heading_keep_with_next_lines 意图经 PA-04 注册近似为 CSS break-after:avoid" +
  "（仅保证 ≥1 行）；1 行至 N-1 行区间无确定性判定依据，降人工核验。";

function nextExpectedBlock(
  expected: readonly ExpectedBlock[],
  block: ExpectedBlock,
): ExpectedBlock | undefined {
  const index = expected.indexOf(block);
  if (index === -1) {
    return undefined;
  }
  return expected.slice(index + 1).find((candidate) => !candidate.repeatable);
}

/** 后继块同页正文行数；有序列表 marker 与其 item 首行同线，合并计行。 */
function followingLinesOnPage(
  input: P1CheckInput,
  attribution: BlockAttribution,
  next: ExpectedBlock,
  pageIndex: number,
): number | undefined {
  const nextEntry = attribution.matched.find((entry) => entry.block === next);
  if (nextEntry === undefined) {
    // 后继内容缺失是 P0 域（p0-content），本规则不据此判定。
    return undefined;
  }
  const entries: AttributedBlock[] = [nextEntry];
  if (next.kind === "list-marker") {
    const item = nextExpectedBlock(input.expected, next);
    if (item !== undefined && item.kind === "list-item") {
      const itemEntry = attribution.matched.find((entry) => entry.block === item);
      if (itemEntry !== undefined) {
        entries.push(itemEntry);
      }
    }
  }
  const runIndexes = entries.flatMap((entry) =>
    bodyRunIndexesOnPage(attribution, entry, pageIndex),
  );
  return countLines(attribution, runIndexes);
}

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const keepWithNext = input.paginationRules.heading_keep_with_next_lines;
  const attribution = attributeBlocks(input.evidence, input.expected);
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  for (const entry of attribution.matched) {
    if (entry.block.kind !== "section-title") {
      continue;
    }
    const pages = pagesOfBlock(attribution, entry);
    const lastPage = pages[pages.length - 1];
    if (lastPage === undefined) {
      continue;
    }
    const next = nextExpectedBlock(input.expected, entry.block);
    if (next === undefined || !TEXTUAL_NEXT_KINDS.includes(next.kind)) {
      continue;
    }
    const followingLines = followingLinesOnPage(input, attribution, next, lastPage);
    if (followingLines === undefined) {
      continue;
    }
    if (followingLines === 0) {
      findings.push(
        makeFinding(
          "p1-heading-keep",
          "P1_HEADING_SEPARATED",
          lastPage,
          entry.block.ref,
          { followingLinesOnPage: 0, templateKeepWithNextLines: keepWithNext },
          next.ref,
        ),
      );
      continue;
    }
    if (followingLines < keepWithNext) {
      manualChecks.push(
        makeManualCheck(
          "p1-heading-keep",
          "P1_HEADING_KEEP_REVIEW",
          lastPage,
          entry.block.ref,
          KEEP_REVIEW_REASON,
          {
            followingLinesOnPage: followingLines,
            templateKeepWithNextLines: keepWithNext,
          },
          next.ref,
        ),
      );
    }
  }
  return { findings, manualChecks };
}

export const p1HeadingKeepRule: P1Rule = Object.freeze({
  id: "p1-heading-keep",
  check,
});
