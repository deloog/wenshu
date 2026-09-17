import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  RenderCheckError,
  launchBrowser,
  type RenderTarget,
} from "@wenshu/report-render";

import { PdfExportError } from "../src/errors.ts";
import {
  inspectPdf,
  prepareExportContext,
  produceBaselinePdf,
  renderDocumentFull,
  stripStampsForReconcile,
} from "../src/index.ts";

/**
 * A-04E-2-P6 取消 target 隔离端到端（真实 Chromium，无 mock，决策 #27 D3）：
 * 1. 独立 target 上的整份渲染与签署管线同会话产物形态一致（页数/目录页码/
 *    提取文本逐项相等）——target 执行面对产物是 no-op；
 * 2. 在途打印时关闭其 target → PDF_EXPORT_CANCELLED 结案，且底层在途 print
 *    真实被拒（RENDER_TARGET_CLOSED——证明结案来自 target 销毁而非等打印
 *    自然完成的旧路径），会话本体存活并立即再导出成功；
 * 3. 未触发取消时 target 失败的错误**不**被误译为 PDF_EXPORT_CANCELLED
 *    （fail-closed：非取消失败原样抛出）。
 *
 * 语料为 21 页仓库 fixture——本文件只验机制正确性，不设墙钟预算断言
 * （A2A-N2 教训）；2s 预算证据归 Win11 参考 VM 批次（判定器逐轮
 * settleAfterClickMs ≤ 2000 条款）。
 */

const repoRoot = resolve(import.meta.dirname, "../../..");
const input = {
  fixture: resolve(repoRoot, "docs/poc-a/fixtures/golden-report.md"),
  fixtureRoot: resolve(repoRoot, "docs/poc-a/fixtures"),
  fontDir: resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R"),
  templatePath: resolve(repoRoot, "docs/poc-a/fixtures/formal-business.template.json"),
};

test("target isolation: full render on an isolated target matches the signed pipeline form", async () => {
  const session = await launchBrowser(undefined, {});
  try {
    const context = await prepareExportContext(input);
    const baseline = await produceBaselinePdf({
      ...input,
      createBrowser: async () => session,
    });
    const target = await session.openTarget();
    let isolated;
    try {
      isolated = await renderDocumentFull(
        context,
        session,
        context.imported.document,
        baseline.stampSpec,
        undefined,
        { renderTarget: target },
      );
    } finally {
      await target.close();
    }
    assert.equal(isolated.pageCount, baseline.inspection.pageCount);
    assert.deepEqual(
      [...isolated.tocPages.entries()],
      [...baseline.tocPages.entries()],
    );
    const isolatedText = stripStampsForReconcile(
      inspectPdf(isolated.finalBytes).pages.map((page) => page.text),
      baseline.stampSpec,
    );
    assert.equal(isolatedText, baseline.extractedText);
  } finally {
    await session.close();
  }
});

test("target isolation: closing the target mid-print settles PDF_EXPORT_CANCELLED, session survives", async () => {
  const session = await launchBrowser(undefined, {});
  try {
    const context = await prepareExportContext(input);
    const baseline = await produceBaselinePdf({
      ...input,
      createBrowser: async () => session,
    });
    const target = await session.openTarget();
    const controller = new AbortController();
    let rawPrintError: unknown = null;
    // 确定性注入：print 在途即 abort（阶段门兜底）+ 关闭 target（取消主路径）。
    // 包装捕获原始 print 结局——若取消仍走旧「等打印自然完成」路径，rawPrintError
    // 将为 null（print 正常 resolve），本测试即红（变异①的决定性证据）。
    const cancelling: RenderTarget = Object.freeze({
      ...target,
      printToPdf: (params: Record<string, unknown>) => {
        const printing = target.printToPdf(params).catch((error: unknown) => {
          rawPrintError = error;
          throw error;
        });
        controller.abort();
        void target.close();
        return printing;
      },
    });
    await assert.rejects(
      renderDocumentFull(
        context,
        session,
        context.imported.document,
        baseline.stampSpec,
        { signal: controller.signal },
        { renderTarget: cancelling },
      ),
      (error: unknown) =>
        error instanceof PdfExportError && error.code === "PDF_EXPORT_CANCELLED",
    );
    assert.ok(
      rawPrintError instanceof RenderCheckError &&
        rawPrintError.code === "RENDER_TARGET_CLOSED",
      `in-flight print must be killed by target close, got: ${String(rawPrintError)}`,
    );
    // 会话本体零污染：同会话立即再导出成功（对照 persistent-session 红线）。
    const recovered = await produceBaselinePdf({
      ...input,
      createBrowser: async () => session,
    });
    assert.equal(recovered.inspection.pageCount, baseline.inspection.pageCount);
  } finally {
    await session.close();
  }
});

test("target isolation: a non-cancel target failure is not mistranslated as cancellation", async () => {
  const session = await launchBrowser(undefined, {});
  try {
    const context = await prepareExportContext(input);
    const baseline = await produceBaselinePdf({
      ...input,
      createBrowser: async () => session,
    });
    const target = await session.openTarget();
    // 关闭 target 但**不**触发取消信号：真实失败必须原样抛出（RENDER_TARGET_CLOSED），
    // 不得冒充 PDF_EXPORT_CANCELLED（错误误译猎杀方向的决定性用例）。
    const closing: RenderTarget = Object.freeze({
      ...target,
      printToPdf: (params: Record<string, unknown>) => {
        const printing = target.printToPdf(params);
        void target.close();
        return printing;
      },
    });
    await assert.rejects(
      renderDocumentFull(
        context,
        session,
        context.imported.document,
        baseline.stampSpec,
        undefined,
        { renderTarget: closing },
      ),
      (error: unknown) =>
        error instanceof RenderCheckError &&
        error.code === "RENDER_TARGET_CLOSED" &&
        !(error instanceof PdfExportError),
    );
  } finally {
    await session.close();
  }
});
