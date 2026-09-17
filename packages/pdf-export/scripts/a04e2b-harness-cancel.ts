/**
 * A-04E-2b 工装（决策 #25 D1，非产品）：ADR-0014 ③演示（每轮一次）——
 * 标题编辑（真实事务链）触发 full-required → 后台整份 renderDocumentFull
 * （同 printSession）→ 任务进行中 UI 探针 3 次点击 + 0.8s 后经工装页真实
 * 取消按钮 handler 置位 → 驱动轮询发现后 abort AbortController →
 * PDF_EXPORT_CANCELLED 结案 → 取消后同 printSession 立即再跑
 * produceBaselinePdf 证明资源清理完备；全程旧预览槽位未替换。
 *
 * 选型说明：
 * - UI 探针点击：evaluate 对真实按钮元素执行 .click()（走页面真实 DOM
 *   事件 handler，非直接改数组）；点击处理延迟 = evaluate 往返耗时（含
 *   handler 同步执行）；maxGapMs 由页面 25ms 事件循环采样器给出。
 * - 取消语义（如实记录不修饰）：printSession 启动时未挂 session 级
 *   signal（挂了则 abort 后整会话不可复用，与 5c 同会话复跑冲突），故
 *   abort 在管线阶段边界（assertNotCancelled）生效，结案耗时含在途打印
 *   的剩余时间。
 *
 * 本模块只测量与记录，不做任何判定。
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { TransactionManager } from "@wenshu/editor-transactions";
import type { BrowserSession } from "@wenshu/report-render";
import type { WenshuDocument } from "@wenshu/document-model";

import { PdfExportError } from "../src/errors.ts";
import type { IncrementalPreviewController } from "../src/incremental-controller.ts";
import {
  normalizePdfText,
  produceBaselinePdf,
  renderDocumentFull,
  type BaselineInput,
  type ExportContext,
} from "../src/index.ts";
import type { StampSpec } from "../src/stamp.ts";

import { applyHeadingRewrite } from "./a04e2b-harness-edits.ts";
import type { HarnessUi } from "./a04e2b-harness-ui.ts";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

type BackgroundResult =
  | { readonly outcome: "completed"; readonly completed: unknown }
  | { readonly outcome: "rejected"; readonly error: unknown };

export interface CancelDemoDeps {
  readonly context: ExportContext;
  readonly printSession: BrowserSession;
  readonly manager: TransactionManager;
  readonly runDoc: WenshuDocument;
  readonly controller: IncrementalPreviewController;
  readonly stampSpec: StampSpec;
  readonly firstTocEntryId: string;
  readonly ui: HarnessUi;
  readonly runTag: string;
  readonly outDir: string;
  /** 5c 复跑的管线输入（createBrowser 由本模块注入 printSession）。 */
  readonly recoveryInput: BaselineInput;
  readonly sha256: (bytes: Uint8Array) => string;
}

export async function runCancelDemo(deps: CancelDemoDeps): Promise<unknown> {
  const { context, printSession, controller, ui, runTag } = deps;
  // 标题编辑（真实事务链）→ full-required（目录条目集变化）
  const heading = applyHeadingRewrite(deps.manager, deps.runDoc, deps.firstTocEntryId);
  const fallback = await controller.update(heading.document, heading.affectedNodeIds);

  // 后台整份 renderDocumentFull（同 printSession；驱动持有 AbortController）
  let bgAbort: AbortController | undefined;
  let bgPromise: Promise<BackgroundResult> | undefined;
  try {
    bgAbort = new AbortController();
    const bgSignal = bgAbort.signal;
    const bgStart = performance.now();
    bgPromise = renderDocumentFull(
      context,
      printSession,
      heading.document,
      deps.stampSpec,
      { signal: bgSignal },
    ).then(
      (completed): BackgroundResult => ({ outcome: "completed", completed }),
      (error: unknown): BackgroundResult => ({ outcome: "rejected", error }),
    );

    // stale 标注：标题所在页（排除目录页的标题锚定命中）
    const tocIndex = controller.state().tocPageIndex;
    const titleAnchor = normalizePdfText(heading.before).slice(0, 32);
    const stalePage0 = controller
      .state()
      .pageTextIndex.findIndex(
        (text, index) => index !== tocIndex && text.includes(titleAnchor),
      );
    if (stalePage0 >= 0) {
      await ui.setStale(stalePage0 + 1, true);
    }
    await ui.setStatus(`${runTag}：后台整份重排中…`);
    const slotEventsBefore = await ui.slotPdfEventCount();

    // a) 任务进行中：UI 探针 3 次点击
    const clickLatenciesMs: number[] = [];
    for (let click = 0; click < 3; click += 1) {
      const clickStart = performance.now();
      await ui.clickProbeButton();
      clickLatenciesMs.push(performance.now() - clickStart);
      await sleep(100);
    }
    const maxGapMsDuringBackground = await ui.maxGapMs();

    // b) 0.8s 后置 __cancelRequested（经工装页真实取消按钮 handler）
    const remainMs = 800 - (performance.now() - bgStart);
    if (remainMs > 0) {
      await sleep(remainMs);
    }
    await ui.clickCancelButton();
    const cancelClickedAt = performance.now();
    let cancelDetectedAt: number | null = null;
    let pageCancelRequestedAt: number | null = null;
    while (performance.now() - cancelClickedAt < 15_000) {
      const flag = await ui.readCancelFlag();
      if (flag.requested) {
        cancelDetectedAt = performance.now();
        pageCancelRequestedAt = flag.at;
        break;
      }
      await sleep(25);
    }
    const abortedAt = performance.now();
    (bgAbort as AbortController).abort();
    const bgResult = await bgPromise;
    const settledAt = performance.now();
    if (stalePage0 >= 0) {
      // 后台任务已取消：stale 撤下，旧预览槽位保持旧整份不变
      await ui.setStale(stalePage0 + 1, false);
    }
    await ui.setStatus(`${runTag}：后台整份已取消（${bgResult.outcome}）`);
    const slotEventsAfter = await ui.slotPdfEventCount();

    // c) 取消后同 printSession 立即再跑 produceBaselinePdf（资源清理完备证明）
    const recoveryStart = performance.now();
    const recovery = await produceBaselinePdf({
      ...deps.recoveryInput,
      createBrowser: async () => printSession,
    });
    const recoveryPath = resolve(deps.outDir, `${runTag}-recovery-baseline.pdf`);
    await writeFile(recoveryPath, recovery.pdfBytes);

    return Object.freeze({
      headingEdit: {
        nodeIds: heading.affectedNodeIds,
        before: heading.before,
        after: heading.after,
      },
      fallback: {
        kind: fallback.kind,
        ...(fallback.kind === "full-required" ? { reason: fallback.reason } : {}),
        pageRangesPrinted: fallback.pageRangesPrinted,
        timings: fallback.timings,
      },
      background: {
        outcome: bgResult.outcome,
        errorCode:
          bgResult.outcome === "rejected" && bgResult.error instanceof PdfExportError
            ? bgResult.error.code
            : null,
        errorMessage:
          bgResult.outcome === "rejected"
            ? bgResult.error instanceof Error
              ? bgResult.error.message
              : String(bgResult.error)
            : null,
      },
      timelineMs: {
        probeClickLatencies: clickLatenciesMs,
        maxGapMsDuringBackground,
        cancelClickedAt: cancelClickedAt - bgStart,
        cancelDetectedAt: cancelDetectedAt === null ? null : cancelDetectedAt - bgStart,
        abortedAt: abortedAt - bgStart,
        settledAt: settledAt - bgStart,
        settleAfterClickMs: settledAt - cancelClickedAt,
      },
      pageCancelRequestedAt,
      // d) 全程旧预览槽位未替换（slot-pdf 注入事件计数不变）
      oldSlotsUntouchedDuringBackground: slotEventsBefore === slotEventsAfter,
      stalePageDemonstrated: stalePage0 >= 0 ? stalePage0 + 1 : null,
      recovery: {
        pageCount: recovery.inspection.pageCount,
        sha256: deps.sha256(recovery.pdfBytes),
        totalMs: recovery.timings.totalMs,
        wallMs: performance.now() - recoveryStart,
        pdfPath: recoveryPath,
      },
    });
  } finally {
    // 异常路径兜底：不让在途后台整份泄漏到下一轮（同 printSession）。
    bgAbort?.abort();
    if (bgPromise !== undefined) {
      await bgPromise;
    }
  }
}
