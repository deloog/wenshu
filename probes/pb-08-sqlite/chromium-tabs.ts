import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  killProcessTree,
  removeProfileWithRetry,
} from "../../packages/report-render/src/browser-process.ts";
import { findChromium } from "../../packages/report-render/src/browser.ts";

interface CdpReply {
  readonly id?: number;
  readonly result?: Record<string, unknown>;
  readonly error?: { readonly message?: string };
}

interface Pending {
  readonly resolve: (value: Record<string, unknown>) => void;
  readonly reject: (reason: Error) => void;
}

export interface TabSession {
  evaluate<T>(expression: string): Promise<T>;
}

export interface ChromiumTabs {
  open(url: string): Promise<TabSession>;
  close(): Promise<void>;
}

function waitForEndpoint(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(
      () => reject(new Error("PB08_CDP_ENDPOINT_TIMEOUT")),
      15_000,
    );
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      const match = /DevTools listening on (ws:\/\/\S+)/u.exec(stderr);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export async function launchChromiumTabs(): Promise<ChromiumTabs> {
  const profile = await mkdtemp(join(tmpdir(), "wenshu-pb08-tabs-"));
  const child = spawn(
    findChromium(),
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
  let socket: WebSocket;
  try {
    socket = new WebSocket(await waitForEndpoint(child));
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("PB08_CDP_CONNECT_FAILED"));
    });
  } catch (error) {
    await killProcessTree(child);
    await removeProfileWithRetry(profile);
    throw error;
  }

  let nextId = 1;
  const pending = new Map<number, Pending>();
  socket.onmessage = (event: MessageEvent<string>) => {
    const reply = JSON.parse(event.data) as CdpReply;
    if (reply.id === undefined) return;
    const waiter = pending.get(reply.id);
    if (waiter === undefined) return;
    pending.delete(reply.id);
    if (reply.error !== undefined) {
      waiter.reject(new Error(reply.error.message ?? "PB08_CDP_COMMAND_FAILED"));
    } else {
      waiter.resolve(reply.result ?? {});
    }
  };

  const command = (
    method: string,
    params: Record<string, unknown>,
    sessionId?: string,
  ): Promise<Record<string, unknown>> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  };

  return {
    async open(url: string): Promise<TabSession> {
      const created = await command("Target.createTarget", { url: "about:blank" });
      const targetId = created["targetId"];
      if (typeof targetId !== "string") throw new Error("PB08_CDP_TARGET_FAILED");
      const attached = await command("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      const sessionId = attached["sessionId"];
      if (typeof sessionId !== "string") throw new Error("PB08_CDP_ATTACH_FAILED");
      await command("Page.navigate", { url }, sessionId);
      for (let attempt = 0; attempt < 200; attempt += 1) {
        try {
          const readiness = await command(
            "Runtime.evaluate",
            {
              expression: `location.href===${JSON.stringify(url)}&&document.readyState!=='loading'`,
              returnByValue: true,
            },
            sessionId,
          );
          const remote = readiness["result"];
          if (
            typeof remote === "object" &&
            remote !== null &&
            (remote as { value?: boolean }).value === true
          ) {
            break;
          }
        } catch (error) {
          if (attempt === 199) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return {
        async evaluate<T>(expression: string): Promise<T> {
          const response = await command(
            "Runtime.evaluate",
            { expression, awaitPromise: true, returnByValue: true },
            sessionId,
          );
          if (response["exceptionDetails"] !== undefined) {
            throw new Error(
              `PB08_CDP_EVALUATE_EXCEPTION ${JSON.stringify(response["exceptionDetails"])}`,
            );
          }
          const outer = response["result"];
          if (typeof outer !== "object" || outer === null) {
            throw new Error("PB08_CDP_EVALUATE_FAILED");
          }
          const value = (outer as { value?: T }).value;
          return value as T;
        },
      };
    },
    async close(): Promise<void> {
      socket.close();
      await killProcessTree(child);
      await removeProfileWithRetry(profile);
    },
  };
}
