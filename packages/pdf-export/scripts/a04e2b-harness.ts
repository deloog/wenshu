/**
 * A-04E-2b 一次性验证工装驱动（决策 #25 D1：本脚本与 a04e2b-harness-page.ts /
 * -edits.ts / -reconcile.ts / -cancel.ts / -ui.ts 是一次性验证工装，不是产品
 * UI，不得演化）。30 页语料 + 真实 Chromium + 真实编辑事务链
 * （@wenshu/editor-transactions TransactionManager）+ 增量预览控制器 +
 * 工装预览页，测量并记录：
 *   1. 逐编辑增量更新：kind / timings / pageRangesPrinted / updatedRange，
 *      增量产物实时注入工装页页槽（页槽 PDF 全部落盘 --out/slots/）；
 *   2. ADR-0014 ③演示（每轮一次，实现在 a04e2b-harness-cancel.ts）：后台
 *      整份 + UI 探针 + 真实按钮取消 + PDF_EXPORT_CANCELLED + 同会话复跑；
 *   3. 对账（每轮每编辑，实现在 a04e2b-harness-reconcile.ts）：整份重渲
 *      独立参照，窗页逐页 tag-free run + tocPages 逐项比对。
 *
 * 纪律：本驱动只做测量与记录，不做任何预算/质量判定（判定归 VM 批次脚本）；
 * 管线内部既有 fail-closed 断言照常生效，错误如实记录进报告。
 *
 * 选型说明（其余见各子模块头）：
 * - 页槽 PDF 走工装静态服务器 URL（startStaticServer 挂载 --out/slots/），
 *   不走 blob URL：窗格 PDF 为数百 KB 级二进制，经 CDP evaluate 推 base64
 *   会污染测量且放大驱动；URL 引用让 evaluate 载荷恒定小，且槽位 PDF 本来
 *   就要求落盘留证。缓存破坏用 "?v=<counter>" query，"#page=k" fragment
 *   锚定绝对页码（服务器按 pathname 服务，query 不影响读取）。
 * - UI 页用第二个独立浏览器实例（uiSession）：打印 navigate 不污染 UI 页。
 * - 每轮从同一初次状态重建控制器与事务管理器：编辑脚本逐轮相同（确定性）。
 * - headless Chromium 的 <embed> PDF 查看器不渲染内容区（截图可见区域为
 *   空白）：槽位更新机制（src 切换与事件记录）真实发生，全部槽位 PDF 落盘
 *   slots/ 供直接查验；本工装不以截图作内容证据。
 *
 * 用法：node packages/pdf-export/scripts/a04e2b-harness.ts
 *       --out <dir> --fixture-root <dir> [--browser <path>] [--runs 10]
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { platform, release, arch } from "node:os";
import { resolve } from "node:path";

import type { WenshuDocument } from "@wenshu/document-model";
import { TransactionManager } from "@wenshu/editor-transactions";
import { launchBrowser, startStaticServer } from "@wenshu/report-render";
import { RandomIdAllocator, toProseMirrorDocument } from "@wenshu/semantic-editor";

import {
  buildInitialPreviewState,
  createIncrementalPreviewController,
} from "../src/incremental-controller.ts";
import {
  prepareExportContext,
  produceBaselinePdf,
  type BaselineOutput,
  type ExportContext,
} from "../src/index.ts";

import { runCancelDemo } from "./a04e2b-harness-cancel.ts";
import {
  applyParagraphRewrite,
  pickEditableParagraph,
} from "./a04e2b-harness-edits.ts";
import { HARNESS_PAGE_HTML } from "./a04e2b-harness-page.ts";
import { reconcileWindowAgainstFull } from "./a04e2b-harness-reconcile.ts";
import { HarnessUi } from "./a04e2b-harness-ui.ts";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const repoRoot = resolve(import.meta.dirname, "../../..");
const outDir = resolve(argValue("--out") ?? resolve(repoRoot, "tmp/a04e-2b-harness"));
const fixtureRoot = resolve(
  argValue("--fixture-root") ?? resolve(repoRoot, "tmp/a04e-2b-input"),
);
const browserPath = argValue("--browser");
const runs = Number(argValue("--runs") ?? "10");
if (!Number.isInteger(runs) || runs < 1) {
  throw new Error("--runs must be a positive integer");
}

const fixture = resolve(fixtureRoot, "pa-13-performance-30-page.md");
const templatePath = resolve(fixtureRoot, "formal-business.template.json");
const fontDir = resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R");
const slotsDir = resolve(outDir, "slots");
const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

interface EditRecord {
  readonly edit: number;
  readonly zone: string;
  readonly nodeId: string;
  readonly anchorPage0: number;
  readonly chainAffectedNodeIds: readonly string[];
  readonly updateAffectedNodeIds: readonly string[];
  readonly kind: string;
  readonly reason?: string;
  readonly pageRangesPrinted: readonly string[];
  readonly updatedRange?: readonly [number, number];
  readonly timings: unknown;
  readonly slotsUpdated: readonly number[];
  readonly tocSlotUpdated: boolean;
  readonly reconcile?: unknown;
}

await mkdir(slotsDir, { recursive: true });

// ---- 1. 装配上下文 + 持久打印会话 + 工装静态服务器 + 独立 UI 浏览器实例 ----
const context: ExportContext = await prepareExportContext({
  fixture,
  fixtureRoot,
  fontDir,
  templatePath,
});
const printLaunchStart = performance.now();
const printSession = await launchBrowser(browserPath, {});
const printBrowserLaunchMs = performance.now() - printLaunchStart;
const harnessServer = await startStaticServer(
  [{ mount: "/slots/", directory: slotsDir }],
  { "/harness.html": HARNESS_PAGE_HTML },
);
const uiSession = await launchBrowser(browserPath, {});
const ui = new HarnessUi(uiSession);

let slotVersion = 0;
const slotUrl = (fileName: string, pageFragment?: number): string => {
  slotVersion += 1;
  const base = `${harnessServer.origin}/slots/${fileName}?v=${slotVersion}`;
  return pageFragment === undefined ? base : `${base}#page=${pageFragment}`;
};

const report: Record<string, unknown> = {
  harness: "a-04e-2b-harness",
  toolingNotice:
    "A-04E-2b 一次性验证工装 · 非产品 UI（决策 #25 D1）；本驱动只做测量与记录，判定归 VM 批次脚本",
  timestamp: new Date().toISOString(),
  environment: {
    platform: platform(),
    release: release(),
    arch: arch(),
    node: process.version,
  },
  fixture,
  fixtureRoot,
  templatePath,
  runs,
  affectedNodesDiscipline:
    "真实事务链 affectedNodeIds 逐字记录于 edits[].chainAffectedNodeIds；" +
    "传给 controller.update 的 updateAffectedNodeIds 是文本实际变更的叶块 id" +
    "（rewrite 目标自身）——rewriteBlock affected 集含父节 id，父节标题同时" +
    "出现在目录页与该节页，控制器锚定多页命中会 fail-closed 退 full-required；" +
    "用法形态与 test/incremental.render.test.ts 一致。",
  cancellationSemantics:
    "printSession 未挂 session 级 signal（保留 5c 同会话复跑能力），abort 在" +
    "管线阶段边界（assertNotCancelled）生效；结案耗时含在途打印剩余时间。",
};

const runRecords: unknown[] = [];

try {
  report["printBrowserProduct"] = await printSession.productVersion();
  report["uiBrowserProduct"] = await uiSession.productVersion();
  report["printBrowserLaunchMs"] = printBrowserLaunchMs;

  // ---- 2. 初次整份产物（produceBaselinePdf 注入 printSession）+ 初次预览状态
  //    （displayBytes 用 contentBytes 未压印态，页眉页脚由页面覆盖层显示） ----
  const baselineStart = performance.now();
  const output: BaselineOutput = await produceBaselinePdf({
    fixture,
    fixtureRoot,
    fontDir,
    templatePath,
    browserPath,
    // R5 接缝：持久会话归本驱动所有，管线 finally 绝不 close。
    createBrowser: async () => printSession,
  });
  const pageCount = output.inspection.pageCount;
  const headerText = output.stampSpec.headerText;
  await writeFile(resolve(slotsDir, "initial-full.pdf"), output.contentBytes);
  report["baseline"] = {
    pageCount,
    headerText,
    contentSha256: sha256(output.contentBytes),
    finalSha256: sha256(output.pdfBytes),
    tocEntries: output.tocPages.size,
    timings: output.timings,
    wallMs: performance.now() - baselineStart,
  };
  const initialState = buildInitialPreviewState({
    document: context.imported.document,
    contentBytes: output.contentBytes,
    displayBytes: output.contentBytes,
    tocPages: output.tocPages,
    pageCount,
  });
  const firstTocEntryId = context.tocEntries[0]?.id;
  if (firstTocEntryId === undefined) {
    throw new Error("corpus must have TOC entries");
  }

  // ---- 3. 工装页投放 + 30 页槽初始化（旧整份按 #page=k 锚定显示） ----
  await uiSession.navigate(`${harnessServer.origin}/harness.html`);
  await ui.initSlots(
    pageCount,
    headerText,
    `${harnessServer.origin}/slots/initial-full.pdf`,
  );
  await ui.setStatus(`基线就绪：${pageCount} 页（旧整份按 #page=k 锚定显示）`);
  await uiSession.screenshot(resolve(outDir, "harness-ui-initial.png"));

  for (let run = 1; run <= runs; run += 1) {
    const runTag = `run-${String(run).padStart(2, "0")}`;
    const controller = createIncrementalPreviewController(
      { session: printSession, context },
      initialState,
    );
    const manager = new TransactionManager(
      toProseMirrorDocument(initialState.document),
      new RandomIdAllocator(),
    );
    await ui.resetForRun();
    await ui.setStatus(`${runTag}：开始`);

    const edits: EditRecord[] = [];
    const usedIds = new Set<string>();
    let runDoc: WenshuDocument = initialState.document;
    let runError: string | undefined;

    // ---- 4. 确定性编辑脚本：正文早/中/晚三段锚定唯一段落同长替换 ----
    for (let zone = 0; zone < 3; zone += 1) {
      const zoneName = ["早", "中", "晚"][zone] as string;
      try {
        const state = controller.state();
        const target = pickEditableParagraph(
          runDoc,
          state.pageTextIndex,
          state.pageCount,
          zone,
          usedIds,
        );
        usedIds.add(target.id);
        const edited = applyParagraphRewrite(manager, runDoc, target.id);
        runDoc = edited.document;

        const result = await controller.update(runDoc, [target.id]);
        const slotsUpdated: number[] = [];
        let tocSlotUpdated = false;
        let reconcile: unknown;

        if (result.kind === "incremental") {
          const windowFile = `${runTag}-edit-${zone + 1}-window.pdf`;
          await writeFile(resolve(slotsDir, windowFile), result.windowPdfBytes);
          for (let k = 0; k < result.windowPages; k += 1) {
            const absolutePage = result.updatedRange[0] + k;
            await ui.setSlotPdf(absolutePage, slotUrl(windowFile, k + 1));
            slotsUpdated.push(absolutePage);
          }
          if (result.tocSlotPdfBytes !== null) {
            const tocFile = `${runTag}-edit-${zone + 1}-toc.pdf`;
            await writeFile(resolve(slotsDir, tocFile), result.tocSlotPdfBytes);
            const tocPageIndex = controller.state().tocPageIndex;
            if (tocPageIndex !== null) {
              await ui.setSlotPdf(tocPageIndex + 1, slotUrl(tocFile, 1));
              tocSlotUpdated = true;
            }
          }
          await ui.setStatus(
            `${runTag} 编辑${zone + 1}（${zoneName}段 p${target.page + 1}）：增量` +
              ` 窗页 ${result.updatedRange[0]}-${result.updatedRange[1]}` +
              ` totalMs=${result.timings.totalMs.toFixed(1)}`,
          );
          // ---- 6. 对账（只记录，不判定） ----
          reconcile = await reconcileWindowAgainstFull({
            context,
            session: printSession,
            document: runDoc,
            stampSpec: output.stampSpec,
            controller,
            targetPage0: target.page,
            updatedRange: result.updatedRange,
            pageCount: result.pageCount,
            tocPages: result.tocPages,
          });
        } else {
          await ui.setStatus(
            `${runTag} 编辑${zone + 1}（${zoneName}段）：full-required — ${result.reason}`,
          );
        }

        edits.push(
          Object.freeze({
            edit: zone + 1,
            zone: zoneName,
            nodeId: target.id,
            anchorPage0: target.page,
            chainAffectedNodeIds: edited.affectedNodeIds,
            updateAffectedNodeIds: [target.id],
            kind: result.kind,
            ...(result.kind === "full-required" ? { reason: result.reason } : {}),
            pageRangesPrinted: result.pageRangesPrinted,
            ...(result.kind === "incremental"
              ? { updatedRange: result.updatedRange }
              : {}),
            timings: result.timings,
            slotsUpdated: Object.freeze(slotsUpdated),
            tocSlotUpdated,
            ...(reconcile === undefined ? {} : { reconcile }),
          }),
        );
        console.log(
          `${runTag} edit ${zone + 1} (${zoneName}): kind=${result.kind}` +
            ` totalMs=${result.timings.totalMs.toFixed(1)}` +
            ` ranges=${result.pageRangesPrinted.join(",")}`,
        );
      } catch (error) {
        runError = error instanceof Error ? error.message : String(error);
        break;
      }
    }

    // ---- 5. ADR-0014 ③演示（每轮一次） ----
    let cancelDemo: unknown;
    if (runError === undefined) {
      try {
        cancelDemo = await runCancelDemo({
          context,
          printSession,
          manager,
          runDoc,
          controller,
          stampSpec: output.stampSpec,
          firstTocEntryId,
          ui,
          runTag,
          outDir,
          recoveryInput: { fixture, fixtureRoot, fontDir, templatePath, browserPath },
          sha256,
        });
        console.log(`${runTag} cancel-demo: done`);
      } catch (error) {
        runError = error instanceof Error ? error.message : String(error);
      }
    }

    runRecords.push(
      Object.freeze({
        run,
        edits: Object.freeze(edits),
        cancelDemo: cancelDemo ?? null,
        probe: await ui.probeSnapshot(),
        ...(runError === undefined ? {} : { runError }),
      }),
    );
  }

  await uiSession.screenshot(resolve(outDir, "harness-ui-final.png"));
  report["runRecords"] = runRecords;
} catch (error) {
  // 致命错误也落报告：驱动只记录不吞没，错误如实进入 harness-report.json。
  report["fatal"] =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  report["runRecords"] = runRecords;
} finally {
  await uiSession.close();
  await printSession.close();
  await harnessServer.close();
}

await writeFile(
  resolve(outDir, "harness-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(`report: ${resolve(outDir, "harness-report.json")}`);
