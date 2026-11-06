/**
 * 独立 oracle 集成测试：证据模型几何经 pdfjs-dist（Apache-2.0，与被测自写
 * 解析器零共享代码）交叉验证——页框、逐行文本几何（基线/x/宽）、figure 框。
 * 容差口径见 scripts/oracle-crosscheck.ts 头注（书面化）。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { crosscheckGeometry } from "../scripts/oracle-crosscheck.ts";

const baselinePath = resolve(
  import.meta.dirname,
  "..",
  "fixtures",
  "baseline",
  "golden-report-baseline.pdf",
);
const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";

test("independent oracle confirms page boxes, text line geometry and figure boxes", async () => {
  const bytes = new Uint8Array(readFileSync(baselinePath));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    SIGNED_BASELINE_SHA256,
  );
  const report = await crosscheckGeometry(bytes);
  assert.equal(report.pagesChecked, 21);
  assert.ok(report.linesChecked > 300, `lines=${report.linesChecked}`);
  assert.equal(report.figuresChecked, 2);
  assert.deepEqual(report.mismatches, []);
  assert.ok(report.ok);
});

test("ActualText divergences are recorded as the documented semantic-surface fact", async () => {
  const bytes = new Uint8Array(readFileSync(baselinePath));
  const report = await crosscheckGeometry(bytes);
  // pdf.js 不支持 ActualText（回退 ToUnicode 部首形/figure dash）；分歧行数
  // 必须非零——若为零说明管线不再依赖 ActualText，本断言与记录口径需重审。
  assert.ok(
    report.actualTextDivergences.length > 0,
    "expected known ActualText semantic-surface divergences",
  );
  for (const divergence of report.actualTextDivergences) {
    assert.equal(divergence.kind, "line-text");
  }
});
