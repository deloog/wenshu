import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { platform, release, arch } from "node:os";
import { resolve } from "node:path";

import {
  assertMetadataPolicy,
  assertPdfReconciled,
  inspectPdf,
  normalizePdfText,
  produceBaselinePdf,
} from "../src/index.ts";

/**
 * PA-05 基线导出 CLI：node scripts/export-baseline.ts --out <dir> [--browser <path>] [--label <label>]
 * 所有检查 fail-closed；证据（PDF + evidence.json）写入 --out 目录。
 */
function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const repoRoot = resolve(import.meta.dirname, "../../..");
const outDir = resolve(argValue("--out") ?? resolve(repoRoot, "test-results/pa-05"));
const browserPath = argValue("--browser");
const label = argValue("--label") ?? "development";

const output = await produceBaselinePdf({
  fixture: resolve(repoRoot, "docs/poc-a/fixtures/golden-report.md"),
  fixtureRoot: resolve(repoRoot, "docs/poc-a/fixtures"),
  fontDir: resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R"),
  templatePath: resolve(repoRoot, "docs/poc-a/fixtures/formal-business.template.json"),
  browserPath,
});

const finalBytes = output.pdfBytes;
// 全部检查针对终稿（两遍渲染页码 + 文本层修复 + 页眉页脚压印后）PDF。
const inspection = inspectPdf(finalBytes);

// 先留证后断言：即使检查失败，PDF 与初步证据也已落盘（可信失败留证）。
await mkdir(outDir, { recursive: true });
const pdfPath = resolve(outDir, "golden-report-baseline.pdf");
await writeFile(pdfPath, finalBytes);

assertMetadataPolicy(
  inspection.metadata,
  inspection.xmp,
  "AI 辅助长文交付流程效率观察报告",
);

const A4_PT = [595.28, 841.89] as const;
const [widthPt = 0, heightPt = 0] = inspection.pageSizePt;
if (Math.abs(widthPt - A4_PT[0]) > 1 || Math.abs(heightPt - A4_PT[1]) > 1) {
  throw new Error(`page size is not A4: ${JSON.stringify(inspection.pageSizePt)}`);
}
for (const font of inspection.fonts) {
  if (!font.embedded) {
    throw new Error(`font not embedded: ${font.name || font.family}`);
  }
  // 静默回落熔断：PDF 中只允许冻结字体（Skia 可能用联合设计别名登记）。
  if (!/SourceHanSansCN|Noto-Sans-SC/u.test(font.name)) {
    throw new Error(
      `non-frozen font in pdf (silent fallback): ${font.name || font.family || "unnamed"}`,
    );
  }
}
assertPdfReconciled(output.extractedText, output.expectedText, output.repeatables);

const sha256 = createHash("sha256").update(finalBytes).digest("hex");
const evidence = {
  task: "PA-05 baseline A4 PDF export",
  label,
  timestamp: new Date().toISOString(),
  environment: { platform: platform(), release: release(), arch: arch() },
  browser: {
    product: output.browserProduct,
    executable: browserPath ?? "system-candidate",
  },
  printParams: output.printParams,
  pdf: {
    path: pdfPath,
    bytes: finalBytes.length,
    sha256,
    repair: {
      repairedHoles: output.repair.repairedHoles,
      patchedObjects: output.repair.patchedObjects,
    },
    pageCount: inspection.pageCount,
    pageSizePt: inspection.pageSizePt,
    tocEntries: output.tocPages.size,
  },
  fonts: inspection.fonts,
  metadata: inspection.metadata,
  xmpPresent: inspection.xmp !== null,
  reconciliation: {
    expectedChars: normalizePdfText(output.expectedText).length,
    extractedChars: normalizePdfText(output.extractedText).length,
    equal: true,
  },
};
await writeFile(
  resolve(outDir, "evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(`baseline pdf: ${pdfPath}`);
console.log(`sha256: ${sha256}`);
console.log(`browser: ${output.browserProduct}`);
console.log(
  `pages: ${inspection.pageCount}, toc entries: ${output.tocPages.size}, reconcile: ok`,
);
