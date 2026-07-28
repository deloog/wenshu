/**
 * PA-11A 级联钉刷新探针：从新签署基线（VM run1）实测全部下游钉值。
 * 禁猜——所有刷新值以本探针输出为准。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { extractEvidence } from "@wenshu/pdf-evidence";

const pdf = new Uint8Array(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../../../test-results/pa-11a/harvest/run1/golden-report-baseline.pdf",
    ),
  ),
);
const result = extractEvidence(pdf);
if (!result.ok) {
  throw new Error(`extract failed: ${result.issue.code} @ ${result.issue.location}`);
}
const ev = result.evidence;

const out: Record<string, unknown> = {};
out["pageCount"] = ev.pages.length;
out["textRuns"] = ev.textRuns.length;

// 压印 run（font tag PA11F* 解析期事实）：逐页计数与字样。
const stampRuns = ev.textRuns.filter((run) => /^PA11F\d+$/u.test(run.font.tag));
out["stampRunCount"] = stampRuns.length;
out["stampPages"] = [...new Set(stampRuns.map((run) => run.pageIndex))];
out["stampTags"] = [...new Set(stampRuns.map((run) => run.font.tag))];
out["stampSamples"] = stampRuns.slice(0, 6).map((run) => ({
  pageIndex: run.pageIndex,
  text: run.text,
  fontSize: run.fontSize,
  baselineY: run.baselineY,
  x: run.bbox.x,
  tag: run.font.tag,
  readingOrder: run.readingOrder,
}));

// figure 钉：页位/mcid/成员数/paintBBox/题注阅读序。
out["figures"] = ev.figures.map((figure) => {
  const pageRuns = ev.textRuns.filter((run) => run.pageIndex === figure.pageIndex);
  const members = pageRuns.filter((run) => run.figureMcid === figure.mcid);
  const lastMemberRo = Math.max(...members.map((run) => run.readingOrder));
  const captionRuns = ev.textRuns.filter(
    (run) =>
      run.pageIndex === figure.pageIndex &&
      run.figureMcid === null &&
      run.readingOrder > lastMemberRo &&
      !/^PA11F\d+$/u.test(run.font.tag),
  );
  return {
    pageIndex: figure.pageIndex,
    mcid: figure.mcid,
    members: members.length,
    bbox: figure.bbox,
    paintBBox: figure.paintBBox,
    altShort: figure.altShort,
    followingRos: captionRuns.slice(0, 4).map((run) => run.readingOrder),
    followingText: captionRuns
      .slice(0, 12)
      .map((run) => run.text)
      .join(""),
  };
});

// 跨页表探测：逐页归一拼接文本钉（run 多为单字，按页拼接后查子串）。
import { normalizePdfText } from "@wenshu/pdf-export";

const pageTexts = ev.pages.map((page) =>
  normalizePdfText(
    ev.textRuns
      .filter((run) => run.pageIndex === page.index)
      .sort((a, b) => a.readingOrder - b.readingOrder)
      .map((run) => run.text)
      .join(""),
  ),
);
out["riskTableTitlePages"] = pageTexts
  .map((text, index) => ({ index, hit: text.includes("主要风险与首期处置") }))
  .filter((entry) => entry.hit)
  .map((entry) => entry.index);
out["riskHeaderPages"] = pageTexts
  .map((text, index) => ({ index, hit: text.includes("风险等级") }))
  .filter((entry) => entry.hit)
  .map((entry) => entry.index);

// 目录页：前 5 页 run 计数（阅读序范围）。
out["earlyPageRunCounts"] = [0, 1, 2, 3, 4].map(
  (page) => ev.textRuns.filter((run) => run.pageIndex === page).length,
);

// 全局阅读序尾部钉（最大 readingOrder）。
out["maxReadingOrder"] = Math.max(...ev.textRuns.map((run) => run.readingOrder));

// 字体面：tag 全集（含 PA11F）。
out["fontTags"] = [...new Set(ev.fonts.map((font) => font.name))];

writeFileSync(
  resolve(import.meta.dirname, "../../../test-results/pa-11a/probe-facts.json"),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
