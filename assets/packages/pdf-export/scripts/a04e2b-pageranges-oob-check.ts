/** 一次性机制确认：CDP pageRanges 越界行为（2b 级联 EOF 检测依赖）。 */
import { resolve } from "node:path";
import { launchBrowser } from "@wenshu/report-render";
import { inspectPdf } from "../src/index.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const probeDir = resolve(repoRoot, "tmp/a04e-2b-probe");
const { readFile } = await import("node:fs/promises");
// 复用探针已落盘的整份 HTML 不可行（服务器已关），改用最小 HTML：机制问题与内容无关。
import { startStaticServer } from "@wenshu/report-render";

const pages = 30;
const html = `<!doctype html><html><head><style>@page { size: A4; margin: 20mm; } .pb { break-before: page; }</style></head><body>${Array.from(
  { length: pages },
  (_, i) => `<p class="${i === 0 ? "" : "pb"}">page ${i + 1}</p>`,
).join("")}</body></html>`;
const server = await startStaticServer([], { "/print.html": html });
const session = await launchBrowser(undefined, {});
try {
  await session.navigate(`${server.origin}/print.html`);
  const full = await session.printToPdf({ paperWidth: 8.27, paperHeight: 11.69 });
  console.log("full pages:", inspectPdf(full).pageCount);
  for (const range of ["30-31", "31-31", "29-32"]) {
    try {
      const bytes = await session.printToPdf({
        paperWidth: 8.27,
        paperHeight: 11.69,
        pageRanges: range,
      });
      console.log(`range ${range}: ok, pages=${inspectPdf(bytes).pageCount}`);
    } catch (error) {
      console.log(
        `range ${range}: ERROR ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  // 复探 probe 目录仍在则顺带确认真实语料越界行为一致
  void readFile;
  void probeDir;
} finally {
  await session.close();
  await server.close();
}
