/**
 * A-04E-2c 层 1 HTML 预览（决策 #29 D1「局部编辑交互反馈（HTML 预览层）
 * p95 ≤ 1 秒」；一次性验证工装组成部分，非产品 UI，决策 #25 D1）。
 *
 * 层 1 = 编辑提交后先把新文档的 HTML 预览更新到位（结构/文本回流），
 * 机制上不含真实分页与 print——本模块根本不接收打印会话参数，结构性
 * 不可能触发 printToPdf；runLayer1Preview 另以 printCalls 计数快照做
 * 可证伪断言（层 1 窗口内打印调用数 === 0，判定器 G8 逐编辑核验）。
 *
 * 测量口径（ADR-0036 钉定）：
 * - 起点 = submittedAt（编辑事务 commit 完成，Node 侧 performance.now()）；
 * - 终点 = __setLayer1Html 的 evaluate 返回（页面侧 iframe srcdoc 装载 +
 *   load 事件 = DOM 更新与回流完成的确定性标记；CDP 往返计入，偏保守）。
 * 层 1 的 HTML 组合路径与控制器 composeNewHtml 同一组函数
 * （renderDocumentHtml + composePrintDocument + fillTocPlaceholders）。
 */
import { performance } from "node:perf_hooks";

import { collectTocEntries, type WenshuDocument } from "@wenshu/document-model";
import { renderDocumentHtml, type BrowserSession } from "@wenshu/report-render";

import { composePrintDocument, fillTocPlaceholders } from "../src/compose.ts";
import type { ExportContext } from "../src/prepare-context.ts";

import type { HarnessUi } from "./a04e2b-harness-ui.ts";

/** printToPdf 调用计数包装：委托全部方法，仅计数 printToPdf（层 1 零打印断言用）。 */
export function withPrintCallCount(session: BrowserSession): {
  readonly session: BrowserSession;
  readonly printCalls: () => number;
} {
  let count = 0;
  const wrapped: BrowserSession = Object.freeze({
    pid: session.pid,
    navigate: (url: string) => session.navigate(url),
    evaluate: <T>(expression: string): Promise<T> => session.evaluate<T>(expression),
    screenshot: (filePath: string) => session.screenshot(filePath),
    printToPdf: async (params: Record<string, unknown>) => {
      count += 1;
      return session.printToPdf(params);
    },
    productVersion: () => session.productVersion(),
    openTarget: () => session.openTarget(),
    close: () => session.close(),
  });
  return Object.freeze({ printCalls: () => count, session: wrapped });
}

/** 层 1 预览 HTML：与控制器同一组合路径（无分页、无 print）。 */
export function composeLayer1PreviewHtml(
  document: WenshuDocument,
  context: ExportContext,
): string {
  const base = composePrintDocument(
    renderDocumentHtml(document),
    context.css,
    (assetPath) => {
      const original = Object.entries(context.imported.renames).find(
        ([, normalized]) => normalized === assetPath,
      )?.[0];
      return original === undefined ? undefined : context.svgCache.get(original);
    },
  );
  const entries = collectTocEntries(document);
  return entries.length === 0 ? base : fillTocPlaceholders(base, entries);
}

export interface Layer1PreviewResult {
  /** 编辑提交 → 层 1 HTML 预览完成更新（ms，Node 侧同一时钟）。 */
  readonly layer1UpdateMs: number;
  /** 层 1 窗口内 printToPdf 调用数（=== 0 为机制断言，判定器 G8 核验）。 */
  readonly layer1PrintCalls: number;
}

/** 层 1 更新一轮：组合 HTML → 注入工装页预览 iframe → 读计数快照。 */
export async function runLayer1Preview(args: {
  readonly ui: HarnessUi;
  readonly document: WenshuDocument;
  readonly context: ExportContext;
  readonly printCalls: () => number;
  readonly submittedAt: number;
}): Promise<Layer1PreviewResult> {
  const printsBefore = args.printCalls();
  const html = composeLayer1PreviewHtml(args.document, args.context);
  await args.ui.setLayer1Html(html);
  return Object.freeze({
    layer1UpdateMs: performance.now() - args.submittedAt,
    layer1PrintCalls: args.printCalls() - printsBefore,
  });
}
