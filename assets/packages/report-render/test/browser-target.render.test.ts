import assert from "node:assert/strict";
import test from "node:test";

import { RenderCheckError, launchBrowser, startStaticServer } from "../src/index.ts";

/**
 * RenderTarget 生命周期（A-04E-2-P6，真实 Chromium，无 mock）：
 * - 独立 target 可导航/打印，关闭幂等；
 * - 关闭 target 使在途命令以 RENDER_TARGET_CLOSED 立即拒绝（不等 30s 超时）；
 * - 关闭 target 不伤会话本体：主 target 打印与 evaluate 照常。
 * 断言定位是机制（拒绝码/会话存活/产物形态），不设墙钟预算断言（A2A-N2 教训）。
 */

const HEAVY_HTML = `<!doctype html><html><body>${Array.from(
  { length: 4000 },
  (_, index) => `<p>第 ${index} 段：取消目标隔离机制验证用的重型排版载荷。</p>`,
).join("")}</body></html>`;

function hasTargetClosedCode(error: unknown): boolean {
  return error instanceof RenderCheckError && error.code === "RENDER_TARGET_CLOSED";
}

test("render target: navigate + printToPdf on an isolated target, idempotent close", async () => {
  const session = await launchBrowser(undefined, {});
  const server = await startStaticServer([], { "/heavy.html": HEAVY_HTML });
  try {
    const target = await session.openTarget();
    await target.navigate(`${server.origin}/heavy.html`);
    const bytes = await target.printToPdf({ printBackground: true });
    // 真实 PDF 产物形态（多页重型文档）。
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    assert.ok(bytes.length > 100_000, `pdf too small: ${bytes.length}`);
    await target.close();
    await target.close(); // 幂等：第二次为 no-op
    // 关闭后命令被拒（session 已销毁，协议层错误，绝不静默成功）。
    await assert.rejects(target.printToPdf({}), RenderCheckError);
  } finally {
    // 先关浏览器再关服务器：浏览器存活时 keep-alive 连接会让 server.close()
    // 挂到 Chrome 空闲超时（~75s），签署管线同为浏览器先序（pipeline.ts finally）。
    await session.close();
    await server.close();
  }
});

test("render target: closing a target rejects in-flight commands as RENDER_TARGET_CLOSED", async () => {
  const session = await launchBrowser(undefined, {});
  const server = await startStaticServer([], { "/heavy.html": HEAVY_HTML });
  try {
    const target = await session.openTarget();
    await target.navigate(`${server.origin}/heavy.html`);
    const printing = target.printToPdf({ printBackground: true });
    await target.close();
    await assert.rejects(printing, hasTargetClosedCode);
  } finally {
    // 先关浏览器再关服务器：浏览器存活时 keep-alive 连接会让 server.close()
    // 挂到 Chrome 空闲超时（~75s），签署管线同为浏览器先序（pipeline.ts finally）。
    await session.close();
    await server.close();
  }
});

test("render target: closing a target leaves the session body fully usable", async () => {
  const session = await launchBrowser(undefined, {});
  const server = await startStaticServer([], { "/heavy.html": HEAVY_HTML });
  try {
    const target = await session.openTarget();
    await target.navigate(`${server.origin}/heavy.html`);
    await target.close();
    // 会话本体零污染：evaluate 与主 target 打印立即可用（对照 5c 复跑红线）。
    assert.equal(await session.evaluate<number>("1 + 1"), 2);
    await session.navigate(`${server.origin}/heavy.html`);
    const bytes = await session.printToPdf({ printBackground: true });
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    // 关闭一个 target 后仍可再开新 target（target 不泄漏到后续使用）。
    const second = await session.openTarget();
    await second.navigate(`${server.origin}/heavy.html`);
    await second.close();
  } finally {
    // 先关浏览器再关服务器：浏览器存活时 keep-alive 连接会让 server.close()
    // 挂到 Chrome 空闲超时（~75s），签署管线同为浏览器先序（pipeline.ts finally）。
    await session.close();
    await server.close();
  }
});
