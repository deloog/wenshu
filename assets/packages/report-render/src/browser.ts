import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findChromium } from "./browser-find.ts";
import { createRenderTargetOpener, type RenderTarget } from "./browser-target.ts";
import {
  cleanupFailedLaunch,
  killProcessTree,
  removeProfileWithRetry,
} from "./browser-process.ts";
import { RenderCheckError } from "./errors.ts";

// findChromium 纯搬迁至 browser-find.ts（file-size 门），此处转出口保持
// 既有 import 路径（probes 等直引 browser.ts）零改动。
export { findChromium } from "./browser-find.ts";

export interface BrowserSession {
  /** 浏览器子进程 PID（资源清理核验用；spawn 失败场景为 undefined）。 */
  readonly pid: number | undefined;
  navigate(url: string): Promise<void>;
  /** 在页面上下文执行表达式（可含 Promise），按值返回结果。 */
  evaluate<T>(expression: string): Promise<T>;
  screenshot(filePath: string): Promise<void>;
  /** CDP Page.printToPDF：按显式参数打印当前页，返回 PDF 字节。 */
  printToPdf(params: Record<string, unknown>): Promise<Uint8Array>;
  /** 浏览器产品版本（CDP Browser.getVersion），锁定留证用。 */
  productVersion(): Promise<string>;
  /**
   * 打开会话内独立渲染 target（A-04E-2-P6）：取消 = 关闭该 target，
   * 会话本体不污染、可立即复用（决策 #27 D3 授权形态）。
   */
  openTarget(): Promise<RenderTarget>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  /** 取消信号（PA-13）：abort 后在途 CDP 命令与等待事件以 RENDER_CANCELLED 拒绝。 */
  readonly signal?: AbortSignal | undefined;
}

interface CdpFrame {
  id?: number;
  method?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

const COMMAND_TIMEOUT_MS = 30_000;

function cancelledError(): RenderCheckError {
  return new RenderCheckError("RENDER_CANCELLED", "browser operation cancelled");
}

/** 最小 CDP 客户端：真实 Chromium、真实 Font Loading API，无任何 mock。 */
export async function launchBrowser(
  executableOverride?: string,
  options?: LaunchOptions,
): Promise<BrowserSession> {
  const signal = options?.signal;
  if (signal?.aborted === true) {
    throw cancelledError();
  }
  const executable = findChromium(executableOverride);
  const profile = await mkdtemp(join(tmpdir(), "wenshu-render-"));
  const child: ChildProcess = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  // 启动段（等 DevTools 端点 → ws 连接 → 目标挂载）任一失败（含取消、超时）
  // 必须杀子进程并清 profile，不留孤儿进程/临时目录（PA-13 资源清理红线）。
  const launch = async (): Promise<WebSocket> => {
    const wsUrl = await new Promise<string>((resolveWs, rejectWs) => {
      let buffer = "";
      const onAbort = (): void => {
        clearTimeout(timer);
        rejectWs(cancelledError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        rejectWs(
          new RenderCheckError(
            "RENDER_BROWSER_UNAVAILABLE",
            "browser did not expose its DevTools endpoint in time",
          ),
        );
      }, COMMAND_TIMEOUT_MS);
      signal?.addEventListener("abort", onAbort, { once: true });
      child.stderr?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const match = /DevTools listening on (ws:\/\/\S+)/u.exec(buffer);
        if (match?.[1] !== undefined) {
          signal?.removeEventListener("abort", onAbort);
          clearTimeout(timer);
          resolveWs(match[1]);
        }
      });
      child.on("error", (error) => {
        signal?.removeEventListener("abort", onAbort);
        clearTimeout(timer);
        rejectWs(error);
      });
    });

    const socket = new WebSocket(wsUrl);
    await new Promise<void>((resolveOpen, rejectOpen) => {
      const onAbort = (): void => {
        socket.close();
        rejectOpen(cancelledError());
      };
      const clearAbort = (): void => signal?.removeEventListener("abort", onAbort);
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.onopen = () => {
        clearAbort();
        resolveOpen();
      };
      socket.onerror = () => {
        clearAbort();
        if (signal?.aborted === true) {
          rejectOpen(cancelledError());
          return;
        }
        rejectOpen(
          new RenderCheckError(
            "RENDER_BROWSER_UNAVAILABLE",
            "DevTools websocket failed",
          ),
        );
      };
    });
    if (signal?.aborted === true) {
      socket.close();
      throw cancelledError();
    }
    return socket;
  };

  let socket: WebSocket;
  try {
    socket = await launch();
  } catch (error) {
    await cleanupFailedLaunch(child, profile);
    throw error;
  }

  let nextId = 0;
  const pending = new Map<
    number,
    {
      resolve: (frame: CdpFrame) => void;
      reject: (error: Error) => void;
      sessionId: string | undefined;
    }
  >();
  const eventWaiters: Array<{
    method: string;
    sessionId: string | undefined;
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  let aborted: boolean = signal?.aborted ?? false;
  const onSessionAbort = (): void => {
    aborted = true;
    for (const waiter of pending.values()) {
      waiter.reject(cancelledError());
    }
    pending.clear();
    for (const waiter of eventWaiters) {
      waiter.reject(cancelledError());
    }
    eventWaiters.length = 0;
  };
  signal?.addEventListener("abort", onSessionAbort, { once: true });
  socket.onmessage = (event) => {
    const frame = JSON.parse(String(event.data)) as CdpFrame;
    if (frame.id !== undefined) {
      pending.get(frame.id)?.resolve(frame);
      pending.delete(frame.id);
      return;
    }
    if (frame.method === "Target.detachedFromTarget") {
      // target 关闭/崩溃即 detach：该 session 的在途命令与事件等待必须以
      // RENDER_TARGET_CLOSED 立即拒绝（Chrome 不回答已销毁 session 的在途
      // 命令；不拒绝则 30s 超时才结案，2s 取消预算失守）。
      const detached = frame.params?.["sessionId"];
      const targetClosedError = () =>
        new RenderCheckError(
          "RENDER_TARGET_CLOSED",
          "render target closed or detached",
        );
      for (const [id, waiter] of pending.entries()) {
        if (waiter.sessionId === detached) {
          pending.delete(id);
          waiter.reject(targetClosedError());
        }
      }
      for (let index = eventWaiters.length - 1; index >= 0; index -= 1) {
        const waiter = eventWaiters[index];
        if (waiter !== undefined && waiter.sessionId === detached) {
          eventWaiters.splice(index, 1);
          waiter.reject(targetClosedError());
        }
      }
      return;
    }
    if (frame.method !== undefined) {
      for (const [index, waiter] of eventWaiters.entries()) {
        if (waiter.method === frame.method && waiter.sessionId === frame.sessionId) {
          eventWaiters.splice(index, 1);
          waiter.resolve();
          break;
        }
      }
    }
  };
  socket.onclose = () => {
    signal?.removeEventListener("abort", onSessionAbort);
    for (const waiter of pending.values()) {
      waiter.reject(
        new RenderCheckError("RENDER_BROWSER_PROTOCOL", "browser disconnected"),
      );
    }
    pending.clear();
    for (const waiter of eventWaiters) {
      waiter.reject(
        new RenderCheckError("RENDER_BROWSER_PROTOCOL", "browser disconnected"),
      );
    }
    eventWaiters.length = 0;
  };

  function send(method: string, params: Record<string, unknown>, sessionId?: string) {
    if (aborted) {
      return Promise.reject(cancelledError());
    }
    nextId += 1;
    const id = nextId;
    return new Promise<CdpFrame>((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectSend(
          new RenderCheckError(
            "RENDER_BROWSER_PROTOCOL",
            `CDP command timed out: ${method}`,
          ),
        );
      }, COMMAND_TIMEOUT_MS);
      pending.set(id, {
        sessionId,
        resolve: (frame) => {
          clearTimeout(timer);
          resolveSend(frame);
        },
        reject: (error) => {
          clearTimeout(timer);
          rejectSend(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    }).then((frame) => {
      if (frame.error !== undefined) {
        throw new RenderCheckError(
          "RENDER_BROWSER_PROTOCOL",
          `${method}: ${frame.error.message ?? "unknown CDP error"}`,
        );
      }
      return frame.result ?? {};
    });
  }

  function waitEvent(method: string, sessionId?: string): Promise<void> {
    if (aborted) {
      return Promise.reject(cancelledError());
    }
    return new Promise<void>((resolveEvent, rejectEvent) => {
      eventWaiters.push({
        method,
        sessionId,
        resolve: resolveEvent,
        reject: rejectEvent,
      });
    });
  }

  // 目标挂载期同样可能被取消/协议失败：失败必须杀进程清 profile，不交付半会话。
  let sessionId: string;
  try {
    const created = await send("Target.createTarget", { url: "about:blank" });
    const targetId = String(created["targetId"]);
    const attached = await send("Target.attachToTarget", { targetId, flatten: true });
    sessionId = String(attached["sessionId"]);
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
  } catch (error) {
    socket.close();
    await cleanupFailedLaunch(child, profile);
    throw error;
  }

  return Object.freeze({
    pid: child.pid ?? undefined,
    navigate: async (url: string) => {
      const loaded = waitEvent("Page.loadEventFired", sessionId);
      try {
        await send("Page.navigate", { url }, sessionId);
      } catch (error) {
        // send 先失败（如取消）时 loaded 将随后被拒：挂吞掉器防未处理拒绝。
        loaded.catch(() => {});
        throw error;
      }
      await loaded;
    },
    evaluate: async <T>(expression: string): Promise<T> => {
      const result = await send(
        "Runtime.evaluate",
        { expression, awaitPromise: true, returnByValue: true },
        sessionId,
      );
      const exception = result["exceptionDetails"] as
        { text?: string; exception?: { description?: string } } | undefined;
      if (exception !== undefined) {
        throw new RenderCheckError(
          "RENDER_BROWSER_PROTOCOL",
          exception.exception?.description ??
            exception.text ??
            "page evaluation failed",
        );
      }
      const remote = result["result"] as { value?: unknown };
      return remote.value as T;
    },
    screenshot: async (filePath: string) => {
      const result = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(filePath, Buffer.from(String(result["data"]), "base64"));
    },
    printToPdf: async (params: Record<string, unknown>) => {
      const result = await send("Page.printToPDF", params, sessionId);
      return new Uint8Array(Buffer.from(String(result["data"]), "base64"));
    },
    productVersion: async () => {
      const result = await send("Browser.getVersion", {});
      return String(result["product"] ?? "unknown");
    },
    openTarget: createRenderTargetOpener(send, waitEvent),
    close: async () => {
      // Windows 上 kill 后主进程仍短暂持有 profile 锁：先 CDP 优雅关闭、等退出、重试清理。
      try {
        await send("Browser.close", {});
      } catch {
        // 浏览器可能已断开，继续清理。
      }
      await new Promise<void>((resolveExit) => {
        // 取消路径下浏览器可能正忙于打印：缩短优雅退出等待，尽快 kill 止损。
        const timer = setTimeout(resolveExit, aborted ? 1_000 : 5_000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolveExit();
        });
      });
      if (child.exitCode === null) {
        await killProcessTree(child);
      }
      socket.close();
      await removeProfileWithRetry(profile);
      // 系统临时目录偶发锁定（杀毒/索引）不阻断测试；%TEMP% 由系统回收。
    },
  });
}
