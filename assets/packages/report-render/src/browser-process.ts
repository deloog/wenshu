import { spawn, type ChildProcess } from "node:child_process";
import { access, rm } from "node:fs/promises";

/** Windows 上 kill 后浏览器仍短暂持有 profile 锁：重试清理，失败交由系统回收。 */
export async function removeProfileWithRetry(profile: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      try {
        await access(profile);
      } catch {
        return;
      }
    } catch {
      // Fall through to the bounded retry below.
    }
    await new Promise((resolveRetry) => setTimeout(resolveRetry, 300));
  }
  throw new Error(`browser profile cleanup did not complete: ${profile}`);
}

/** 非优雅退出时整树终止，避免 Windows 子进程保留 profile 锁。 */
export async function killProcessTree(child: ChildProcess): Promise<void> {
  if (process.platform === "win32" && child.pid !== undefined) {
    await new Promise<void>((resolveKill) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.on("exit", () => resolveKill());
      killer.on("error", () => {
        child.kill();
        resolveKill();
      });
    });
  } else {
    child.kill();
  }
  await new Promise<void>((resolveExit) => {
    const timer = setTimeout(resolveExit, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
}

/** 启动失败清理：整树杀进程 + 重试清 profile，不掩盖原始错误。 */
export async function cleanupFailedLaunch(
  child: ChildProcess,
  profile: string,
): Promise<void> {
  await killProcessTree(child);
  await removeProfileWithRetry(profile);
}
