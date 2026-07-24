import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { platform, release, arch } from "node:os";
import { resolve } from "node:path";

import {
  assertMetadataPolicy,
  assertPdfReconciled,
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

const { inspection } = output;
assertMetadataPolicy(
  inspection.metadata,
  inspection.xmp,
  "AI 辅助长文交付流程效率观察报告",
);

const A4_PT = [595.28, 841.89] as const;
const [widthPt, heightPt] = inspection.pageSizePt;
if (Math.abs(widthPt - A4_PT[0]) > 0.5 || Math.abs(heightPt - A4_PT[1]) > 0.5) {
  throw new Error(`page size is not A4: ${JSON.stringify(inspection.pageSizePt)}`);
}
for (const font of inspection.fonts) {
  if (!font.embedded) {
    throw new Error(`font not embedded: ${font.name || font.family}`);
  }
}
assertPdfReconciled(output.extractedText, output.expectedText);

const sha256 = createHash("sha256").update(output.pdfBytes).digest("hex");
await mkdir(outDir, { recursive: true });
const pdfPath = resolve(outDir, "golden-report-baseline.pdf");
await writeFile(pdfPath, output.pdfBytes);
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
    bytes: output.pdfBytes.length,
    sha256,
    pageCount: inspection.pageCount,
    pageSizePt: inspection.pageSizePt,
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
console.log(`pages: ${inspection.pageCount}, reconcile: ok`);
