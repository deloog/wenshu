import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertMetadataPolicy,
  assertPdfReconciled,
  normalizePdfText,
  produceBaselinePdf,
} from "../src/index.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const input = {
  fixture: resolve(repoRoot, "docs/poc-a/fixtures/golden-report.md"),
  fixtureRoot: resolve(repoRoot, "docs/poc-a/fixtures"),
  fontDir: resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R"),
  templatePath: resolve(repoRoot, "docs/poc-a/fixtures/formal-business.template.json"),
};

test("baseline export: A4, embedded fonts, metadata policy, verbatim reconciliation", async () => {
  const output = await produceBaselinePdf(input);
  const { inspection } = output;

  // 元数据卫生（书面规则见实施记录）。
  assert.doesNotThrow(() =>
    assertMetadataPolicy(
      inspection.metadata,
      inspection.xmp,
      "AI 辅助长文交付流程效率观察报告",
    ),
  );
  // A4 物理尺寸（Skia 页框取整有 <1pt 抖动，双引擎实测 594.96–595.92）。
  const [widthPt = 0, heightPt = 0] = inspection.pageSizePt;
  assert.ok(Math.abs(widthPt - 595.28) < 1, `width ${widthPt}`);
  assert.ok(Math.abs(heightPt - 841.89) < 1, `height ${heightPt}`);
  // 字体内嵌（名称随引擎在 SourceHanSansCN / 联合设计别名 Noto Sans SC 间变化，
  // 本基线实际使用 400/700 两档字重；500 已注册待模板后续使用）。
  assert.ok(inspection.fonts.length > 0);
  for (const font of inspection.fonts) {
    assert.equal(font.embedded, true, `${font.name} must be embedded`);
    assert.match(font.name, /SourceHanSansCN|Noto-Sans-SC/u);
  }
  const weights = new Set(
    inspection.fonts.map((font) => font.weight).filter((weight) => weight !== null),
  );
  assert.deepEqual([...weights].sort(), [400, 700]);
  assert.ok(
    inspection.fonts.every((font) => font.subset),
    "fonts must be embedded subsets of the frozen OTF",
  );
  // 文本层可搜索可复制：管线内两遍渲染页码 + 修复层 + 压印后，独立抽取
  // （压印串位置锚定剥离）与文档文本逐字对账。
  assert.doesNotThrow(() =>
    assertPdfReconciled(output.extractedText, output.expectedText, output.repeatables),
  );
  assert.ok(normalizePdfText(output.extractedText).length > 10_000);
  // PA-11A：目录页码全部实测（禁手写），页码在物理页范围内；页眉页脚压印
  // 封面豁免、其余页页尾后缀可验。
  assert.ok(output.tocPages.size > 10, "toc entries must be measured");
  for (const page of output.tocPages.values()) {
    assert.ok(page >= 2 && page <= inspection.pageCount, `toc page ${page}`);
  }
  const page2 = inspection.pages[1]?.text ?? "";
  assert.ok(
    normalizePdfText(page2).endsWith(`长文交付效率观察2/${inspection.pageCount}`),
    "page 2 must carry stamped header and footer",
  );
  assert.equal(
    normalizePdfText(inspection.pages[0]?.text ?? "").includes("长文交付效率观察"),
    false,
    "cover page must be exempt from stamping",
  );
  // A-04E：renderBreakdown 账目必须闭合——renderMs 窗口内不允许存在无归属
  // 区段；将来有人在 render 路径加未计时区段时此断言变红（审计 MINOR 修复）。
  const breakdown = output.timings.renderBreakdown;
  const accountedMs =
    breakdown.serverMs +
    breakdown.browserMs +
    breakdown.firstPassMs +
    breakdown.stabilizationRoundMs.reduce((sum, roundMs) => sum + roundMs, 0) +
    breakdown.finalPassMs +
    breakdown.teardownMs;
  const residualMs = output.timings.renderMs - accountedMs;
  assert.ok(
    Math.abs(residualMs) <= 5,
    `render breakdown must close within 5ms, residual ${residualMs}ms`,
  );
});

test("repeated export in the same environment is deterministic at content level", async () => {
  const [first, second] = await Promise.all([
    produceBaselinePdf(input),
    produceBaselinePdf(input),
  ]);
  assert.equal(first.inspection.pageCount, second.inspection.pageCount);
  assert.equal(
    normalizePdfText(first.extractedText),
    normalizePdfText(second.extractedText),
  );
  // 字节级差异仅允许来自时间戳（CreationDate/ModDate 与派生 ID）。
  const firstMeta = first.inspection.metadata;
  const secondMeta = second.inspection.metadata;
  assert.equal(firstMeta["Producer"], secondMeta["Producer"]);
  assert.equal(firstMeta["Title"], secondMeta["Title"]);
  if (first.pdfBytes.length === second.pdfBytes.length) {
    let diffBytes = 0;
    for (let index = 0; index < first.pdfBytes.length; index += 1) {
      if (first.pdfBytes[index] !== second.pdfBytes[index]) {
        diffBytes += 1;
      }
    }
    assert.ok(
      diffBytes < 200,
      `byte-level drift beyond timestamp scope: ${diffBytes} bytes differ`,
    );
  }
});
