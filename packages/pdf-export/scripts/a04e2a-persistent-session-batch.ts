/**
 * A-04E-2a 第二批驱动：持久会话稳态整份重排测量（业主 2026-08-08 裁定形态）。
 *
 * 背景：export-baseline.ts 是 PA-05 签署管线入口，每次调用自起自关浏览器，
 * 无 createBrowser 注入点，测到的是「每次冷启浏览器」形态——冷 navigate
 * 是成本中心（阶段一分解结论），与本任务书验收形态（持久会话稳态重排，
 * 同一会话内第 2 次及以后，对应 A-04 预览的产品现实）不匹配。
 * 为测量给签署 CLI 加批量模式会扩大签署面，故另写本驱动，export-baseline.ts
 * 零改动。
 *
 * 形态照 warm-print-probe.ts：一次 launchBrowser，createBrowser 回调把同一
 * 会话注入管线（R5 会话所有权接缝，管线绝不 close，所有权在本驱动），
 * 会话内连跑 warmup+runs 次完整 produceBaselinePdf（每次含导入/组装/渲染/
 * backfill/修复/压印全管线），逐次记时、逐次落盘 PDF 与原始 sha256。
 *
 * 纯测量工具：不做任何质量/预算判定（p95 口径、normalized sha 全等、等价门
 * 均由 VM 批次脚本用正式工具判定，normalized sha 算法唯一真源是
 * tools/a-04e/normalized-pdf-sha.mjs）；管线内部既有 fail-closed 断言
 * （对账/字体/页框）照常生效，错误自然抛出。
 *
 * 用法：node packages/pdf-export/scripts/a04e2a-persistent-session-batch.ts
 *       --out <dir> --browser <path> --fixture <md> --fixture-root <dir>
 *       --template <json> [--runs 10] [--warmup 1]
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { platform, release, arch } from "node:os";
import { resolve } from "node:path";

import { launchBrowser } from "@wenshu/report-render";

import { produceBaselinePdf } from "../src/index.ts";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const repoRoot = resolve(import.meta.dirname, "../../..");
const outDir = resolve(
  argValue("--out") ?? resolve(repoRoot, "test-results/a-04e-2a-persistent"),
);
const browserPath = argValue("--browser");
const fixtureRoot = resolve(
  argValue("--fixture-root") ?? resolve(repoRoot, "docs/poc-a/fixtures"),
);
const fixture = resolve(
  argValue("--fixture") ?? resolve(fixtureRoot, "golden-report.md"),
);
const templatePath = resolve(
  argValue("--template") ?? resolve(fixtureRoot, "formal-business.template.json"),
);
const runs = Number(argValue("--runs") ?? "10");
const warmup = Number(argValue("--warmup") ?? "1");
if (!Number.isInteger(runs) || runs < 1)
  throw new Error("--runs must be a positive integer");
if (!Number.isInteger(warmup) || warmup < 0)
  throw new Error("--warmup must be a non-negative integer");

const fontDir = resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R");

interface RunRecord {
  readonly run: number;
  readonly kind: "warmup" | "formal";
  readonly pdfPath: string;
  readonly pdfBytes: number;
  readonly sha256: string;
  readonly tocEntries: number;
  readonly repair: { readonly repairedHoles: number; readonly patchedObjects: number };
  readonly timings: unknown;
}

await mkdir(outDir, { recursive: true });
const launchStart = performance.now();
const session = await launchBrowser(browserPath, {});
try {
  const browserProduct = await session.productVersion();
  const browserLaunchMs = performance.now() - launchStart;
  const records: RunRecord[] = [];
  for (let i = 1; i <= warmup + runs; i += 1) {
    const kind = i <= warmup ? ("warmup" as const) : ("formal" as const);
    const output = await produceBaselinePdf({
      fixture,
      fixtureRoot,
      fontDir,
      templatePath,
      browserPath,
      // R5 接缝：持久会话归本驱动所有，管线 finally 绝不 close。
      createBrowser: async () => session,
    });
    const pdfPath = resolve(
      outDir,
      "runs",
      `${String(i).padStart(2, "0")}`,
      "golden-report-baseline.pdf",
    );
    await mkdir(resolve(pdfPath, ".."), { recursive: true });
    await writeFile(pdfPath, output.pdfBytes);
    records.push({
      run: i,
      kind,
      pdfPath,
      pdfBytes: output.pdfBytes.length,
      sha256: createHash("sha256").update(output.pdfBytes).digest("hex"),
      tocEntries: output.tocPages.size,
      repair: output.repair,
      timings: output.timings,
    });
    console.log(
      `run ${i} (${kind}): totalMs=${output.timings.totalMs.toFixed(1)} renderMs=${output.timings.renderMs.toFixed(1)} firstPassMs=${output.timings.renderBreakdown.firstPassMs.toFixed(1)}`,
    );
  }
  const report = {
    driver: "a-04e-2a-persistent-session-batch",
    semantics:
      "持久会话稳态整份重排：同一会话内第 2 次及以后导出；冷启动只付一次（browserLaunchMs）",
    timestamp: new Date().toISOString(),
    environment: { platform: platform(), release: release(), arch: arch() },
    browser: { product: browserProduct, executable: browserPath ?? "system-candidate" },
    browserLaunchMs,
    fixture,
    fixtureRoot,
    templatePath,
    runs,
    warmup,
    records,
  };
  await writeFile(
    resolve(outDir, "persistent-session-batch.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(`report: ${resolve(outDir, "persistent-session-batch.json")}`);
} finally {
  await session.close();
}
