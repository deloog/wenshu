/**
 * p1-stamp-consistency（PA-11B）：页眉页脚压印一致性。
 * 遵 browser_header_footer:false——原生页眉页脚关闭，页眉页脚是
 * PA-11A 压印补偿，本规则核验压印而非假设浏览器原生存在：
 * - 封面（pageIndex 0，cover_own_page 豁免，PA-11A 钉定）出现任何
 *   压印 → P1_STAMP_ON_COVER。
 * - 页脚：非封面页恰好一个、归一文本 `N/total` 且 N === pageIndex+1、
 *   total === 页数（实际页码红线：物理页从证据读，不用假设值）。
 * - 页眉：非封面页恰好一个、归一文本 === short_title（front matter
 *   声明值溯源）；输入无 headerText 时文本对账降 P1_STAMP_REVIEW
 *   人工（诚实门），存在性/位置仍可自动判定。
 * - 位置：页眉基线在版心顶边之上（上边距带）、页脚基线在版心底边
 *   之下（下边距带），x = 版心左边，逐页均匀（0.5pt 容差）。
 * 压印识别用 stamp-scope 单源口径（font tag 解析期事实，非几何启发式）。
 */
import type { TextRun } from "@wenshu/pdf-evidence";
import { normalizePdfText } from "@wenshu/pdf-export";

import { makeFinding, makeManualCheck, runRef } from "../finding.ts";
import type { Finding, ManualCheck } from "../generated/check-report.ts";
import type { P1CheckInput, P1Rule } from "../p1-input.ts";
import { FOOTER_TEXT_PATTERN, selectStampRuns } from "../stamp-scope.ts";

/** 压印位置容差（pt）：同一公式派生的逐页均匀性判定。 */
export const STAMP_POSITION_TOLERANCE_PT = 0.5;

const HEADER_REVIEW_REASON =
  "输入未提供 short_title 声明值：页眉文本对账降人工核验（诚实门）；存在性与位置判定不受影响";

function isFooter(run: TextRun): boolean {
  return FOOTER_TEXT_PATTERN.test(normalizePdfText(run.text));
}

function check(input: P1CheckInput): {
  findings: Finding[];
  manualChecks: ManualCheck[];
} {
  const findings: Finding[] = [];
  const manualChecks: ManualCheck[] = [];
  const stamps = input.stampRuns ?? selectStampRuns(input.evidence);
  const pageCount = input.evidence.pages.length;
  const band = {
    top: input.contentBox.top,
    bottom: input.contentBox.bottom,
    left: input.contentBox.left,
  };
  const expectedHeader =
    input.headerText === undefined ? null : normalizePdfText(input.headerText);
  let headerReviewEmitted = false;

  const footerAnchor = stamps.find(isFooter) ?? null;
  const headerAnchor = stamps.find((run) => !isFooter(run)) ?? null;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const onPage = stamps.filter((run) => run.pageIndex === pageIndex);
    if (pageIndex === 0) {
      for (const run of onPage) {
        findings.push(
          makeFinding(
            "p1-stamp-consistency",
            "P1_STAMP_ON_COVER",
            0,
            runRef(run.readingOrder),
            { pageIndex },
          ),
        );
      }
      continue;
    }
    const footers = onPage.filter(isFooter);
    const headers = onPage.filter((run) => !isFooter(run));
    const firstFooter = footers[0];
    const firstHeader = headers[0];

    if (firstFooter === undefined) {
      findings.push(
        makeFinding(
          "p1-stamp-consistency",
          "P1_FOOTER_MISSING",
          pageIndex,
          `page:${pageIndex}`,
          { expectedPage: pageIndex + 1 },
        ),
      );
    } else {
      if (footers.length > 1) {
        findings.push(
          makeFinding(
            "p1-stamp-consistency",
            "P1_FOOTER_INCONSISTENT",
            pageIndex,
            runRef(footers[1]?.readingOrder ?? 0),
            { footerCount: footers.length },
          ),
        );
      }
      const match = FOOTER_TEXT_PATTERN.exec(normalizePdfText(firstFooter.text));
      const printed = Number.parseInt(match?.[1] ?? "", 10);
      const total = Number.parseInt(match?.[2] ?? "", 10);
      if (printed !== pageIndex + 1 || total !== pageCount) {
        findings.push(
          makeFinding(
            "p1-stamp-consistency",
            "P1_FOOTER_PAGE_MISMATCH",
            pageIndex,
            runRef(firstFooter.readingOrder),
            {
              expectedPage: pageIndex + 1,
              actualPage: Number.isNaN(printed) ? -1 : printed,
              expectedTotal: pageCount,
              actualTotal: Number.isNaN(total) ? -1 : total,
            },
          ),
        );
      }
      const uniform =
        footerAnchor !== null &&
        Math.abs(firstFooter.baselineY - footerAnchor.baselineY) <=
          STAMP_POSITION_TOLERANCE_PT;
      const inBand =
        firstFooter.baselineY < band.bottom &&
        Math.abs(firstFooter.bbox.x - band.left) <= STAMP_POSITION_TOLERANCE_PT;
      if (!uniform || !inBand) {
        findings.push(
          makeFinding(
            "p1-stamp-consistency",
            "P1_FOOTER_INCONSISTENT",
            pageIndex,
            runRef(firstFooter.readingOrder),
            { x: firstFooter.bbox.x, baselineY: firstFooter.baselineY },
          ),
        );
      }
    }

    if (firstHeader === undefined) {
      findings.push(
        makeFinding(
          "p1-stamp-consistency",
          "P1_HEADER_MISSING",
          pageIndex,
          `page:${pageIndex}`,
          { expectedPresent: 1 },
        ),
      );
    } else {
      if (headers.length > 1) {
        findings.push(
          makeFinding(
            "p1-stamp-consistency",
            "P1_HEADER_INCONSISTENT",
            pageIndex,
            runRef(headers[1]?.readingOrder ?? 0),
            { headerCount: headers.length },
          ),
        );
      }
      if (expectedHeader === null) {
        if (!headerReviewEmitted) {
          headerReviewEmitted = true;
          manualChecks.push(
            makeManualCheck(
              "p1-stamp-consistency",
              "P1_STAMP_REVIEW",
              pageIndex,
              runRef(firstHeader.readingOrder),
              HEADER_REVIEW_REASON,
              { stampedPages: pageCount - 1 },
            ),
          );
        }
      } else if (normalizePdfText(firstHeader.text) !== expectedHeader) {
        findings.push(
          makeFinding(
            "p1-stamp-consistency",
            "P1_HEADER_INCONSISTENT",
            pageIndex,
            runRef(firstHeader.readingOrder),
            { textMatch: 0 },
          ),
        );
      }
      const uniform =
        headerAnchor !== null &&
        Math.abs(firstHeader.baselineY - headerAnchor.baselineY) <=
          STAMP_POSITION_TOLERANCE_PT;
      const inBand =
        firstHeader.baselineY > band.top &&
        Math.abs(firstHeader.bbox.x - band.left) <= STAMP_POSITION_TOLERANCE_PT;
      if (!uniform || !inBand) {
        findings.push(
          makeFinding(
            "p1-stamp-consistency",
            "P1_HEADER_INCONSISTENT",
            pageIndex,
            runRef(firstHeader.readingOrder),
            { x: firstHeader.bbox.x, baselineY: firstHeader.baselineY },
          ),
        );
      }
    }
  }

  return { findings, manualChecks };
}

export const p1StampConsistencyRule: P1Rule = Object.freeze({
  id: "p1-stamp-consistency",
  check,
});
