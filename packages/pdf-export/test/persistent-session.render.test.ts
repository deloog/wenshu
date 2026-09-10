import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { launchBrowser, type BrowserSession } from "@wenshu/report-render";

import { PdfExportError } from "../src/errors.ts";
import { produceBaselinePdf } from "../src/index.ts";

/**
 * 持久会话所有权与取消（决策 #19 出口 1 / R5，真实 Chromium，无 mock）：
 * - createBrowser 提供的会话归调用方所有：管线绝不 close，可跨导出复用；
 * - 复用会话下取消以 PDF_EXPORT_CANCELLED 至终态，会话不被管线关闭，
 *   取消后同一会话可立即再次导出（资源清理完备的决定性证据）。
 */

const repoRoot = resolve(import.meta.dirname, "../../..");
const input = {
  fixture: resolve(repoRoot, "docs/poc-a/fixtures/golden-report.md"),
  fixtureRoot: resolve(repoRoot, "docs/poc-a/fixtures"),
  fontDir: resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R"),
  templatePath: resolve(repoRoot, "docs/poc-a/fixtures/formal-business.template.json"),
};

/** close 计数包装：观测管线是否越权关闭外部会话。 */
function spySession(session: BrowserSession): {
  readonly session: BrowserSession;
  readonly closeCalls: () => number;
} {
  let closeCalls = 0;
  return Object.freeze({
    // 展开真实会话（箭头闭包无 this 依赖，签名逐一保留），只覆盖 close 计数。
    session: Object.freeze({
      ...session,
      close: async () => {
        closeCalls += 1;
        await session.close();
      },
    }),
    closeCalls: () => closeCalls,
  });
}

test("persistent session: pipeline never closes a caller-owned session, reused across exports", async () => {
  const real = await launchBrowser(undefined, {});
  const spy = spySession(real);
  try {
    const first = await produceBaselinePdf({
      ...input,
      createBrowser: async () => spy.session,
    });
    const second = await produceBaselinePdf({
      ...input,
      createBrowser: async () => spy.session,
    });
    assert.equal(spy.closeCalls(), 0, "pipeline must not close a caller-owned session");
    assert.equal(first.inspection.pageCount, second.inspection.pageCount);
    assert.equal(first.browserProduct, second.browserProduct);
  } finally {
    await spy.session.close();
  }
  assert.equal(spy.closeCalls(), 1, "only the caller closes the session");
});

test("persistent session: cancellation ends as PDF_EXPORT_CANCELLED without closing the session", async () => {
  const real = await launchBrowser(undefined, {});
  const spy = spySession(real);
  const controller = new AbortController();
  let armed = true;
  // 确定性注入：首个 navigate 发生时翻转取消信号——取消落在渲染段中途
  // （printToPdf 未被信号接线、照常完成），下一道阶段门 assertNotCancelled 结案。
  const cancelling: BrowserSession = Object.freeze({
    ...spy.session,
    navigate: async (url: string) => {
      await spy.session.navigate(url);
      if (armed) {
        armed = false;
        controller.abort();
      }
    },
  });
  try {
    await assert.rejects(
      produceBaselinePdf(
        { ...input, createBrowser: async () => cancelling },
        { signal: controller.signal },
      ),
      (error: unknown) =>
        error instanceof PdfExportError && error.code === "PDF_EXPORT_CANCELLED",
    );
    assert.equal(
      spy.closeCalls(),
      0,
      "cancelled pipeline must not close a caller-owned session",
    );
    // 资源清理完备：取消后同一会话立即可再次导出（server/页面状态无残留）。
    const recovered = await produceBaselinePdf({
      ...input,
      createBrowser: async () => spy.session,
    });
    assert.ok(recovered.inspection.pageCount > 0);
  } finally {
    await real.close();
  }
});
