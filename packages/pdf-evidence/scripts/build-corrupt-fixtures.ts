/**
 * 重建 fixtures/corrupt/ 失败分类字节样本与 manifest（确定性输出，手工审查后提交）。
 * 用法：node packages/pdf-evidence/scripts/build-corrupt-fixtures.ts
 * 样本覆盖：空、非 PDF、截断、加密、异构结构（未知 filter / 非自家管线 Producer）。
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const outDir = join(import.meta.dirname, "..", "fixtures", "corrupt");
const baselinePath = join(
  repoRoot,
  "test-results",
  "pa-05",
  "golden-report-baseline.pdf",
);

interface FixtureEntry {
  readonly file: string;
  readonly expectedCode: string;
  readonly sha256: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function minimalPdf(body: string, trailerExtra: string): string {
  // 手工最小 PDF：一个 Catalog + 一个 Info（Producer），无页或单页，视 body 而定。
  return `%PDF-1.7\n${body}\n trailer\n<< /Root 1 0 R /Info 2 0 R${trailerExtra} >>\n%%EOF\n`;
}

const catalog = "1 0 obj\n<< /Type /Catalog /Pages 3 0 R >>\nendobj\n";
const infoOther =
  "2 0 obj\n<< /Producer (OtherTool 9.9) /CreationDate (D:20260101000000Z) >>\nendobj\n";
const foreignPages =
  "3 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n" +
  "4 0 obj\n<< /Type /Page /Parent 3 0 R /MediaBox [0 0 595 842] /Contents 5 0 R >>\nendobj\n";

// DCTDecode（JPEG）filter 不在自家管线子集内：检查器必须 fail-closed。
const dctStream =
  "5 0 obj\n<< /Length 4 /Filter /DCTDecode >>\nstream\nJPEG\nendstream\nendobj\n";

const fixtures: ReadonlyArray<{
  file: string;
  expectedCode: string;
  bytes: Uint8Array;
}> = [
  {
    file: "empty.bin",
    expectedCode: "PDF_EVIDENCE_EMPTY",
    bytes: new Uint8Array(0),
  },
  {
    file: "not-a-pdf.bin",
    expectedCode: "PDF_EVIDENCE_MALFORMED",
    bytes: new TextEncoder().encode("this is not a pdf file at all\n"),
  },
  {
    file: "truncated.pdf",
    expectedCode: "PDF_EVIDENCE_MALFORMED",
    // 签署基线前 64 KiB：有 %PDF- 头但缺 %%EOF（截断）。
    bytes: readFileSync(baselinePath).subarray(0, 64 * 1024),
  },
  {
    file: "encrypted.pdf",
    expectedCode: "PDF_EVIDENCE_ENCRYPTED",
    bytes: new TextEncoder().encode(minimalPdf(catalog + infoOther, " /Encrypt 6 0 R")),
  },
  {
    file: "foreign-filter.pdf",
    expectedCode: "PDF_EVIDENCE_UNSUPPORTED",
    bytes: new TextEncoder().encode(
      minimalPdf(catalog + infoOther + foreignPages + dctStream, ""),
    ),
  },
  {
    file: "foreign-producer.pdf",
    expectedCode: "PDF_EVIDENCE_UNSUPPORTED",
    // 结构可解析但非自家管线产出（Producer 非 Skia/PDF）。
    bytes: new TextEncoder().encode(
      minimalPdf(
        catalog +
          infoOther +
          foreignPages +
          "5 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
        "",
      ),
    ),
  },
];

const manifest: FixtureEntry[] = [];
for (const fixture of fixtures) {
  writeFileSync(join(outDir, fixture.file), fixture.bytes);
  manifest.push({
    file: fixture.file,
    expectedCode: fixture.expectedCode,
    sha256: sha256(fixture.bytes),
  });
}
writeFileSync(
  join(outDir, "manifest.json"),
  `${JSON.stringify({ fixtures: manifest }, null, 2)}\n`,
);
console.log(`wrote ${fixtures.length} corrupt fixtures + manifest`);
