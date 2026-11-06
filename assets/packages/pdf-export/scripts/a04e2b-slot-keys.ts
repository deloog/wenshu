/**
 * A-04E-2b 工装（决策 #25 D1，非产品）：槽位 PDF 的跨轮可比证据键 CLI 出口。
 * 对指定 PDF 的前 <pages> 页提取几何证据，逐 run 取 tag-free 键（runKeyTagFree，
 * F2 口径：font.tag 为每打印调用独立分配，不参与跨打印比对），拼接后出 sha256。
 * 算法唯一真源在 src（extractGeometry/pageRuns/runKeyTagFree），本脚本只是出口；
 * 调用方为 tools/a-04e/verify-a04e2b-harness.mjs（经 child_process，VM 批次用）。
 *
 * 用法：node packages/pdf-export/scripts/a04e2b-slot-keys.ts <pdf路径> <页数>
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { extractGeometry } from "../src/geometry.ts";
import { pageRuns, runKeyTagFree } from "../src/incremental.ts";

const [pdfPath, pagesArg] = process.argv.slice(2);
const pages = Number(pagesArg);
if (pdfPath === undefined || !Number.isInteger(pages) || pages < 1) {
  throw new Error("usage: a04e2b-slot-keys.ts <pdf> <pages>=positive integer");
}
const geometry = extractGeometry(new Uint8Array(await readFile(pdfPath)));
if (geometry.pages.length < pages) {
  throw new Error(
    `slot pdf has ${geometry.pages.length} pages, fewer than requested ${pages}`,
  );
}
const keys: string[] = [];
for (let page = 0; page < pages; page += 1) {
  for (const run of pageRuns(geometry, page)) {
    keys.push(runKeyTagFree(run));
  }
}
console.log(createHash("sha256").update(keys.join("\n")).digest("hex"));
