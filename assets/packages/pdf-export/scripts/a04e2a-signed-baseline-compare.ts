/**
 * A-04E-2a 签署基线等价比对（决策 #21「无视觉变化」承重点的 VM 侧证据工具）：
 * 比对给定 PDF（VM 单遍+回填管线产物，含 repair+stamp 全流程）与签署基线
 * （packages/pdf-evidence/fixtures/baseline/golden-report-baseline.pdf，
 * sha256 5d7c06bc…0828，同 VM 同 Edge 150 签署）——
 * 页数一致 + 全页全 run 序列逐一项相等（归一化 text/baselineY/bbox.x/
 * fontSize/font tag），零差异硬门：任一差异即非零退出并逐条列出（上限 50 条）。
 * 只在签署同机（Win11 参考 VM + Edge 150）上具判定力；其他引擎版本的差异
 * 不区分机制与引擎变量（本机自验仅作脚本机制冒烟，结论无效）。
 * 用法：node packages/pdf-export/scripts/a04e2a-signed-baseline-compare.ts <pdf>
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractGeometry, type GeometryTextRun } from "../src/geometry.ts";
import { normalizePdfText } from "../src/reconcile.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const signedPath = resolve(
  repoRoot,
  "packages/pdf-evidence/fixtures/baseline/golden-report-baseline.pdf",
);
const candidatePath = process.argv[2];
if (candidatePath === undefined) {
  console.error("usage: node a04e2a-signed-baseline-compare.ts <pdf>");
  process.exit(2);
}

const signed = extractGeometry(new Uint8Array(await readFile(signedPath)));
const candidate = extractGeometry(
  new Uint8Array(await readFile(resolve(candidatePath))),
);

const keyOf = (run: GeometryTextRun): string =>
  JSON.stringify([
    normalizePdfText(run.text),
    run.baselineY,
    run.bbox.x,
    run.fontSize,
    run.font.tag,
  ]);

const differences: string[] = [];
if (signed.pages.length !== candidate.pages.length) {
  differences.push(
    `page count: signed ${signed.pages.length} vs candidate ${candidate.pages.length}`,
  );
}
const pageCount = Math.min(signed.pages.length, candidate.pages.length);
for (let page = 0; page < pageCount; page += 1) {
  const runsA = signed.textRuns.filter((run) => run.pageIndex === page);
  const runsB = candidate.textRuns.filter((run) => run.pageIndex === page);
  if (runsA.length !== runsB.length) {
    differences.push(
      `page ${page}: run count signed ${runsA.length} vs candidate ${runsB.length}`,
    );
    continue;
  }
  for (let index = 0; index < runsA.length; index += 1) {
    const a = runsA[index] as GeometryTextRun;
    const b = runsB[index] as GeometryTextRun;
    if (keyOf(a) !== keyOf(b)) {
      differences.push(
        `page ${page} run ${index}:\n  signed    ${keyOf(a)}\n  candidate ${keyOf(b)}`,
      );
      if (differences.length >= 50) break;
    }
  }
  if (differences.length >= 50) break;
}

if (differences.length > 0) {
  console.log(
    JSON.stringify(
      { equivalent: false, differenceCount: differences.length, differences },
      null,
      1,
    ),
  );
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      equivalent: true,
      pages: signed.pages.length,
      runs: signed.textRuns.length,
      note: "full run sequence identical (normalized text/baselineY/x/fontSize/tag)",
    },
    null,
    1,
  ),
);
