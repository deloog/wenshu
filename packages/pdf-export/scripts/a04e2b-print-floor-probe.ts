/**
 * A-04E-2b print 地板探针（机制证据，非预算证据；决策 #25 D1 留证工具）。
 * 测量 CDP printToPdf 每次调用固定成本：极简 1 页（无自定义字体）vs
 * 同页注册 CJK 冻结字体，各 5 次。
 *
 * 留证声明（2026-09-16，业主复核裁定）：本探针的本机读数（~60–90ms）与
 * VM run-2b-5 两点线性分解隐含的固定成本（~509ms）相差 6–8 倍，且本机
 * 同组窗宽读数自相矛盾（2 页窗 734.9ms vs 6 页窗 116.5ms，会话暖化方差）——
 * **本探针读数不得用于任何归因承重**；归因权威口径 = VM 批次内窗宽分解
 * （见 docs/research/A-04E-2b-1s预算超限归因与加速路径.md §2.2）。
 *
 * 用法：node packages/pdf-export/scripts/a04e2b-print-floor-probe.ts
 */
import { launchBrowser, startStaticServer } from "@wenshu/report-render";
import { resolve } from "node:path";

const session = await launchBrowser(undefined, {});
const fontDir = resolve(
  import.meta.dirname,
  "../../../assets/fonts/source-han-sans-cn/2.005R",
);

async function measure(
  label: string,
  html: string,
  mounts: Parameters<typeof startStaticServer>[0],
): Promise<void> {
  const server = await startStaticServer(mounts, { "/p.html": html });
  await session.navigate(`${server.origin}/p.html`);
  const times: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const t = performance.now();
    await session.printToPdf({ printBackground: true });
    times.push(performance.now() - t);
  }
  await server.close();
  console.log(label, times.map((x) => x.toFixed(0)).join(", "));
}

const plain = "<!doctype html><html><body><p>hello one page</p></body></html>";
await measure("plain-1page:", plain, []);

const cjk = `<!doctype html><html><head><style>
@font-face{font-family:'SHS';src:url('/fonts/SourceHanSansCN-Regular.otf') format('opentype')}
body{font-family:'SHS'} p{font-size:12pt}
</style></head><body><p>${"文枢增量分页固定成本探针".repeat(20)}</p></body></html>`;
await measure("cjk-1page:", cjk, [{ mount: "/fonts/", directory: fontDir }]);

await session.close();
