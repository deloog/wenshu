import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RenderCheckError } from "./errors.ts";

const CHROMIUM_CANDIDATES: readonly string[] = (() => {
  switch (process.platform) {
    case "win32":
      return [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      ];
    case "darwin":
      return [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ];
    default:
      return [
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
      ];
  }
})();

export function findChromium(): string {
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new RenderCheckError(
    "RENDER_BROWSER_UNAVAILABLE",
    `no Chromium-based browser found among ${CHROMIUM_CANDIDATES.length} candidates`,
  );
}

export interface BrowserSession {
  navigate(url: string): Promise<void>;
  /** 在页面上下文执行表达式（可含 Promise），按值返回结果。 */
  evaluate<T>(expression: string): Promise<T>;
  screenshot(filePath: string): Promise<void>;
  close(): Promise<void>;
}

interface CdpFrame {
  id?: number;
  method?: string;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

const COMMAND_TIMEOUT_MS = 30_000;

/** 最小 CDP 客户端：真实 Chromium、真实 Font Loading API，无任何 mock。 */
export async function launchBrowser(): Promise<BrowserSession> {
  const executable = findChromium();
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
  const wsUrl = await new Promise<string>((resolveWs, rejectWs) => {
    let buffer = "";
    const timer = setTimeout(() => {
      rejectWs(
        new RenderCheckError(
          "RENDER_BROWSER_UNAVAILABLE",
          "browser did not expose its DevTools endpoint in time",
        ),
      );
    }, COMMAND_TIMEOUT_MS);
    child.stderr?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const match = /DevTools listening on (ws:\/\/\S+)/u.exec(buffer);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolveWs(match[1]);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectWs(error);
    });
  });

  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolveOpen, rejectOpen) => {
    socket.onopen = () => resolveOpen();
    socket.onerror = () =>
      rejectOpen(
        new RenderCheckError("RENDER_BROWSER_UNAVAILABLE", "DevTools websocket failed"),
      );
  });

  let nextId = 0;
  const pending = new Map<
    number,
    { resolve: (frame: CdpFrame) => void; reject: (error: Error) => void }
  >();
  const eventWaiters: Array<{ method: string; resolve: () => void }> = [];
  socket.onmessage = (event) => {
    const frame = JSON.parse(String(event.data)) as CdpFrame;
    if (frame.id !== undefined) {
      pending.get(frame.id)?.resolve(frame);
      pending.delete(frame.id);
      return;
    }
    if (frame.method !== undefined) {
      for (const [index, waiter] of eventWaiters.entries()) {
        if (waiter.method === frame.method) {
          eventWaiters.splice(index, 1);
          waiter.resolve();
          break;
        }
      }
    }
  };
  socket.onclose = () => {
    for (const waiter of pending.values()) {
      waiter.reject(
        new RenderCheckError("RENDER_BROWSER_PROTOCOL", "browser disconnected"),
      );
    }
    pending.clear();
  };

  function send(method: string, params: Record<string, unknown>, sessionId?: string) {
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

  function waitEvent(method: string): Promise<void> {
    return new Promise<void>((resolveEvent) => {
      eventWaiters.push({ method, resolve: resolveEvent });
    });
  }

  const created = await send("Target.createTarget", { url: "about:blank" });
  const targetId = String(created["targetId"]);
  const attached = await send("Target.attachToTarget", { targetId, flatten: true });
  const sessionId = String(attached["sessionId"]);
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);

  return Object.freeze({
    navigate: async (url: string) => {
      const loaded = waitEvent("Page.loadEventFired");
      await send("Page.navigate", { url }, sessionId);
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
    close: async () => {
      // Windows 上 kill 后主进程仍短暂持有 profile 锁：先 CDP 优雅关闭、等退出、重试清理。
      try {
        await send("Browser.close", {});
      } catch {
        // 浏览器可能已断开，继续清理。
      }
      await new Promise<void>((resolveExit) => {
        const timer = setTimeout(resolveExit, 5_000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolveExit();
        });
      });
      if (child.exitCode === null) {
        child.kill();
      }
      socket.close();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await rm(profile, { recursive: true, force: true });
          return;
        } catch {
          await new Promise((resolveRetry) => setTimeout(resolveRetry, 250));
        }
      }
      // 系统临时目录偶发锁定（杀毒/索引）不阻断测试；%TEMP% 由系统回收。
    },
  });
}
