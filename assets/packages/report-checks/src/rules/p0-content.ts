/**
 * P0_CONTENT_MISSING：文档块级内容存在性（PA-05「图像溢出丢文本算子」教训
 * 的守门——应出现的内容没进证据模型即 P0）。证据文本按阅读序拼接、PA-05
 * 归一口径；期望块按文档序顺序匹配，repeatable（跨页重绘表头）接受任意
 * 位置 ≥1 次出现。内容乱序不是 P0 类别（不作为缺失误报）：顺序匹配失败
 * 后回退全局存在性匹配，仍无才判缺失。
 */
import { normalizePdfText } from "@wenshu/pdf-export";

import type { P0CheckInput, P0Rule } from "../check-input.ts";
import { makeFinding } from "../finding.ts";
import type { Finding } from "../generated/check-report.ts";

interface PositionedRun {
  readonly normalized: string;
  readonly start: number;
  readonly pageIndex: number;
}

function pageAtOffset(runs: readonly PositionedRun[], offset: number): number {
  for (const run of runs) {
    if (offset >= run.start && offset < run.start + run.normalized.length) {
      return run.pageIndex;
    }
  }
  return runs[runs.length - 1]?.pageIndex ?? 0;
}

function check(input: P0CheckInput): readonly Finding[] {
  const runs: PositionedRun[] = [];
  let cursor = 0;
  const ordered = [...input.evidence.textRuns].sort(
    (a, b) => a.readingOrder - b.readingOrder,
  );
  for (const run of ordered) {
    const normalized = normalizePdfText(run.text);
    runs.push(Object.freeze({ normalized, start: cursor, pageIndex: run.pageIndex }));
    cursor += normalized.length;
  }
  const evidenceText = runs.map((run) => run.normalized).join("");

  const findings: Finding[] = [];
  let searchFrom = 0;
  let lastMatchedPage = 0;
  for (const block of input.expected) {
    if (block.repeatable) {
      if (!evidenceText.includes(block.text)) {
        findings.push(
          makeFinding("p0-content", "P0_CONTENT_MISSING", lastMatchedPage, block.ref, {
            expectedLength: block.text.length,
          }),
        );
      }
      continue;
    }
    const inOrder = evidenceText.indexOf(block.text, searchFrom);
    if (inOrder !== -1) {
      lastMatchedPage = pageAtOffset(runs, inOrder);
      searchFrom = inOrder + block.text.length;
      continue;
    }
    // 乱序不算缺失（乱序非 P0 类别）；全局仍无才判内容缺失。
    if (evidenceText.includes(block.text)) {
      continue;
    }
    findings.push(
      makeFinding("p0-content", "P0_CONTENT_MISSING", lastMatchedPage, block.ref, {
        expectedLength: block.text.length,
      }),
    );
  }
  return findings;
}

export const p0ContentRule: P0Rule = Object.freeze({
  id: "p0-content",
  check,
});
