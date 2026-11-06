import assert from "node:assert/strict";
import test from "node:test";

import { RenderCheckError, launchBrowser } from "../src/index.ts";

/**
 * 取消原语单元层（PA-13）：预取消信号必须在 spawn 之前 fail-closed，
 * 不产生任何子进程/profile 目录；信号缺省与未触发是完全 no-op 由
 * render 层的既有用例覆盖。
 */

test("launchBrowser: pre-aborted signal fails closed before spawning", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    launchBrowser(undefined, { signal: controller.signal }),
    (error: unknown) =>
      error instanceof RenderCheckError && error.code === "RENDER_CANCELLED",
  );
});
