import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { launchBrowser } from "@wenshu/report-render";

import { PdfExportError, produceBaselinePdf } from "../src/index.ts";

/**
 * 取消与资源清理集成验证（PA-13，真实浏览器，无 mock）：
 * - 管线各阶段经取消信号到统一终态 PDF_EXPORT_CANCELLED；
 * - abort → 终态时延以 G0「取消后 2 秒内停止主要消耗」为目标；
 * - 无半产物（管线只产字节，取消即无输出）、无孤儿进程、无残留 profile。
 */

const repoRoot = resolve(import.meta.dirname, "../../..");
const input = {
  fixture: resolve(repoRoot, "docs/poc-a/fixtures/golden-report.md"),
  fixtureRoot: resolve(repoRoot, "docs/poc-a/fixtures"),
  fontDir: resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R"),
  templatePath: resolve(repoRoot, "docs/poc-a/fixtures/formal-business.template.json"),
};

const CANCEL_TARGET_MS = 2_000;

async function renderProfileDirs(): Promise<readonly string[]> {
  return (await readdir(tmpdir())).filter((entry) =>
    entry.startsWith("wenshu-render-"),
  );
}

/** Windows 锁释放是异步的：轮询至无新增 profile 残留（超时仍 fail-closed）。 */
async function assertNoNewProfileDirs(before: readonly string[]): Promise<void> {
  const deadline = performance.now() + 10_000;
  for (;;) {
    const extras = (await renderProfileDirs()).filter(
      (entry) => !before.includes(entry),
    );
    if (extras.length === 0) {
      return;
    }
    if (performance.now() > deadline) {
      assert.fail(`orphaned profile directories: ${extras.join(", ")}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function hasCancelCode(error: unknown): boolean {
  return error instanceof PdfExportError && error.code === "PDF_EXPORT_CANCELLED";
}

test("pipeline cancel: pre-aborted signal terminates at import stage, zero residue", async () => {
  const before = await renderProfileDirs();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    produceBaselinePdf(input, { signal: controller.signal }),
    hasCancelCode,
  );
  await assertNoNewProfileDirs(before);
});

test("browser session cancel: in-flight command rejects, process killed, profile removed", async () => {
  const before = await renderProfileDirs();
  const controller = new AbortController();
  const browser = await launchBrowser(undefined, { signal: controller.signal });
  const pid = browser.pid;
  assert.ok(pid !== undefined && isProcessAlive(pid), "browser process must be alive");

  const slow = browser.evaluate<string>(
    "new Promise((resolveIt) => setTimeout(resolveIt, 5000))",
  );
  const abortAt = performance.now();
  controller.abort();
  const settledAt = await slow.then(
    () => {
      throw new Error("in-flight command must not resolve after abort");
    },
    () => performance.now(),
  );
  assert.ok(
    settledAt - abortAt < CANCEL_TARGET_MS,
    `in-flight cancellation latency ${(settledAt - abortAt).toFixed(0)}ms must be < ${CANCEL_TARGET_MS}ms`,
  );

  await browser.close();
  assert.equal(isProcessAlive(pid), false, "browser process must be dead after close");
  await assertNoNewProfileDirs(before);
});

test("pipeline cancel: abort during render terminates cancelled with no half artifacts", async () => {
  const before = await renderProfileDirs();
  const controller = new AbortController();
  const abortAt = performance.now() + 500;
  const timer = setTimeout(() => controller.abort(), 500);
  try {
    const startedAt = performance.now();
    await assert.rejects(
      produceBaselinePdf(input, { signal: controller.signal }),
      hasCancelCode,
    );
    const latency = performance.now() - Math.max(startedAt, abortAt);
    assert.ok(
      latency < CANCEL_TARGET_MS,
      `pipeline cancellation latency ${latency.toFixed(0)}ms must be < ${CANCEL_TARGET_MS}ms`,
    );
  } finally {
    clearTimeout(timer);
  }
  await assertNoNewProfileDirs(before);
});

test("pipeline red line: an untriggered signal is a complete no-op on artifacts", async () => {
  const controller = new AbortController();
  const [withSignal, without] = await Promise.all([
    produceBaselinePdf(input, { signal: controller.signal }),
    produceBaselinePdf(input),
  ]);
  assert.equal(withSignal.inspection.pageCount, without.inspection.pageCount);
  assert.equal(withSignal.extractedText, without.extractedText);
  assert.deepEqual([...withSignal.tocPages.entries()], [...without.tocPages.entries()]);
  // 插桩只观测：timings 存在且为正，不改变产物。
  assert.ok(withSignal.timings.totalMs > 0);
  assert.ok(
    withSignal.timings.importMs +
      withSignal.timings.renderMs +
      withSignal.timings.postprocessMs <=
      withSignal.timings.totalMs + 1,
  );
});
