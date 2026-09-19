/**
 * 独立渲染 target（A-04E-2-P6，决策 #27 D3）：同一会话内的独立 CDP 页面目标。
 * 取消语义 = Target.closeTarget——只销毁该 target，会话本体与其他 target
 * 不受任何影响、可立即复用；会话级 abort 的永久锁存语义（browser.ts）不变。
 * 本模块不直接持有 socket：经注入的 send/waitEvent 操作所属会话的连接。
 */

/** 会话内独立 target 的操作面（navigate/printToPdf 语义与 BrowserSession 同）。 */
export interface RenderTarget {
  navigate(url: string): Promise<void>;
  /** CDP Page.printToPDF：按显式参数打印本 target 当前页，返回 PDF 字节。 */
  printToPdf(params: Record<string, unknown>): Promise<Uint8Array>;
  /**
   * 关闭本 target（Target.closeTarget），幂等（重复调用为 no-op）。
   * 在途命令由连接层随 Target.detachedFromTarget 以 RENDER_TARGET_CLOSED 拒绝。
   */
  close(): Promise<void>;
}

import { RenderCheckError } from "./errors.ts";

type CdpSend = (
  method: string,
  params: Record<string, unknown>,
  sessionId?: string,
) => Promise<Record<string, unknown>>;
type CdpWaitEvent = (method: string, sessionId?: string) => Promise<void>;

/** 构造 BrowserSession.openTarget 的实现（连接层原语由 browser.ts 注入）。 */
export function createRenderTargetOpener(
  send: CdpSend,
  waitEvent: CdpWaitEvent,
): () => Promise<RenderTarget> {
  return async (): Promise<RenderTarget> => {
    const created = await send("Target.createTarget", { url: "about:blank" });
    const targetId = String(created["targetId"]);
    const attached = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const sessionId = String(attached["sessionId"]);
    let closed = false;
    // 调用方发起的 close 与 Chrome 对在途命令的错误应答（"Printing failed"）
    // 存在竞态：凡本 target 已被我们关闭后失败的命令，确定性归一为
    // RENDER_TARGET_CLOSED（crash 等外部销毁由连接层 detachedFromTarget 覆盖）。
    const asTargetClosed = (error: unknown): never => {
      if (
        closed &&
        error instanceof RenderCheckError &&
        error.code === "RENDER_BROWSER_PROTOCOL"
      ) {
        throw new RenderCheckError(
          "RENDER_TARGET_CLOSED",
          "render target closed or detached",
        );
      }
      throw error;
    };
    const close = async (): Promise<void> => {
      if (closed) {
        return;
      }
      closed = true;
      await send("Target.closeTarget", { targetId });
    };
    try {
      await send("Page.enable", {}, sessionId);
    } catch (error) {
      // 挂载半途失败必须收掉已建 target，不泄漏孤立页面目标。
      await close().catch(() => {});
      throw error;
    }
    return Object.freeze({
      navigate: async (url: string) => {
        const loaded = waitEvent("Page.loadEventFired", sessionId);
        try {
          await send("Page.navigate", { url }, sessionId);
        } catch (error) {
          // send 先失败（如 target 已关闭）时 loaded 将随后被拒：挂吞掉器防未处理拒绝。
          loaded.catch(() => {});
          asTargetClosed(error);
        }
        await loaded;
      },
      printToPdf: async (params: Record<string, unknown>) => {
        try {
          const result = await send("Page.printToPDF", params, sessionId);
          return new Uint8Array(Buffer.from(String(result["data"]), "base64"));
        } catch (error) {
          return asTargetClosed(error);
        }
      },
      close,
    });
  };
}
