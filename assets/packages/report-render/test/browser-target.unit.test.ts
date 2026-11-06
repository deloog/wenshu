import assert from "node:assert/strict";
import test from "node:test";

import { createRenderTargetOpener } from "../src/browser-target.ts";
import { RenderCheckError } from "../src/errors.ts";

/**
 * RenderTarget opener 单元层（注入假 send/waitEvent，无浏览器）：
 * 挂载命令序列与参数、close 幂等、半途失败收掉已建 target 不泄漏。
 */

interface SentCommand {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly sessionId: string | undefined;
}

function fakeCdp(handlers?: { readonly failOn?: string }): {
  readonly sent: SentCommand[];
  readonly waited: Array<{ method: string; sessionId: string | undefined }>;
  readonly send: (
    method: string,
    params: Record<string, unknown>,
    sessionId?: string,
  ) => Promise<Record<string, unknown>>;
  readonly waitEvent: (method: string, sessionId?: string) => Promise<void>;
  /** 拒绝最近一次未结案的 Page.printToPDF（模拟浏览器侧异步失败）。 */
  readonly failPending: (error: Error) => void;
} {
  const sent: SentCommand[] = [];
  const waited: Array<{ method: string; sessionId: string | undefined }> = [];
  const pendingPrints: Array<(error: Error) => void> = [];
  return {
    sent,
    waited,
    failPending: (error) => {
      const rejectPrint = pendingPrints.pop();
      if (rejectPrint === undefined) {
        throw new Error("no pending print to fail");
      }
      rejectPrint(error);
    },
    send: (method, params, sessionId) => {
      sent.push({ method, params, sessionId });
      if (handlers?.failOn === method) {
        return Promise.reject(new Error(`injected failure: ${method}`));
      }
      if (method === "Target.createTarget") {
        return Promise.resolve({ targetId: "T1" });
      }
      if (method === "Target.attachToTarget") {
        return Promise.resolve({ sessionId: "S1" });
      }
      if (method === "Page.printToPDF") {
        return new Promise((resolvePrint, rejectPrint) => {
          pendingPrints.push(rejectPrint);
          setTimeout(() => {
            const index = pendingPrints.indexOf(rejectPrint);
            if (index >= 0) {
              pendingPrints.splice(index, 1);
              resolvePrint({
                data: Buffer.from("%PDF-fake").toString("base64"),
              });
            }
          }, 10);
        });
      }
      return Promise.resolve({});
    },
    waitEvent: (method, sessionId) => {
      waited.push({ method, sessionId });
      return Promise.resolve();
    },
  };
}

test("openTarget: mounts with createTarget + attachToTarget(flatten) + Page.enable in order", async () => {
  const cdp = fakeCdp();
  const target = await createRenderTargetOpener(cdp.send, cdp.waitEvent)();
  const methods = cdp.sent.map((command) => command.method);
  assert.deepEqual(methods, [
    "Target.createTarget",
    "Target.attachToTarget",
    "Page.enable",
  ]);
  assert.equal(cdp.sent[1]?.params["flatten"], true);
  assert.equal(cdp.sent[1]?.params["targetId"], "T1");
  assert.equal(cdp.sent[2]?.sessionId, "S1");
  assert.ok(target !== undefined);
});

test("openTarget: navigate/printToPdf run on the target session, close sends closeTarget", async () => {
  const cdp = fakeCdp();
  const target = await createRenderTargetOpener(cdp.send, cdp.waitEvent)();
  await target.navigate("http://example.test/print.html");
  const bytes = await target.printToPdf({ landscape: false });
  assert.equal(new TextDecoder().decode(bytes), "%PDF-fake");
  await target.close();
  const nav = cdp.sent.find((command) => command.method === "Page.navigate");
  const print = cdp.sent.find((command) => command.method === "Page.printToPDF");
  const close = cdp.sent.find((command) => command.method === "Target.closeTarget");
  assert.equal(nav?.sessionId, "S1");
  assert.equal(print?.sessionId, "S1");
  assert.deepEqual(close?.params, { targetId: "T1" });
  // loadEventFired 等待必须锚定本 target 的 sessionId（防串到会话本体）。
  assert.deepEqual(cdp.waited, [{ method: "Page.loadEventFired", sessionId: "S1" }]);
});

test("openTarget: close is idempotent (second close is a no-op)", async () => {
  const cdp = fakeCdp();
  const target = await createRenderTargetOpener(cdp.send, cdp.waitEvent)();
  await target.close();
  await target.close();
  const closes = cdp.sent.filter((command) => command.method === "Target.closeTarget");
  assert.equal(closes.length, 1);
});

test("openTarget: mount failure closes the created target (no orphan target)", async () => {
  const cdp = fakeCdp({ failOn: "Page.enable" });
  await assert.rejects(
    createRenderTargetOpener(cdp.send, cdp.waitEvent)(),
    /injected failure: Page.enable/,
  );
  const closes = cdp.sent.filter((command) => command.method === "Target.closeTarget");
  assert.equal(closes.length, 1);
  assert.deepEqual(closes[0]?.params, { targetId: "T1" });
});

test("openTarget: protocol error after caller-initiated close normalizes to RENDER_TARGET_CLOSED", async () => {
  // Chrome 对「close 杀在途 print」的应答是通用错误（如 "Printing failed"）
  // 而非结构化码；调用方已发起 close 时的协议错误必须归一为 RENDER_TARGET_CLOSED，
  // 否则消费侧无法确定性区分「取消结案」与「真实打印失败」。
  const cdp = fakeCdp();
  const target = await createRenderTargetOpener(cdp.send, cdp.waitEvent)();
  const printing = target.printToPdf({});
  await target.close();
  // 在途 print 以通用协议错误收官（模拟 Chrome 对被杀打印的应答）。
  cdp.failPending(
    new RenderCheckError("RENDER_BROWSER_PROTOCOL", "Page.printToPDF: Printing failed"),
  );
  await assert.rejects(printing, (error: unknown) =>
    Boolean(error instanceof RenderCheckError && error.code === "RENDER_TARGET_CLOSED"),
  );
  // 未关闭时的协议错误保持原码（不误译）。
  const second = await createRenderTargetOpener(cdp.send, cdp.waitEvent)();
  const failing = second.printToPdf({});
  cdp.failPending(
    new RenderCheckError("RENDER_BROWSER_PROTOCOL", "Page.printToPDF: Printing failed"),
  );
  await assert.rejects(failing, (error: unknown) =>
    Boolean(
      error instanceof RenderCheckError && error.code === "RENDER_BROWSER_PROTOCOL",
    ),
  );
});
