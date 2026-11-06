import { existsSync } from "node:fs";

import { RenderCheckError } from "./errors.ts";

/**
 * 浏览器可执行文件定位（纯搬迁自 browser.ts，A-04E-2-P6 file-size 门拆分；
 * 零逻辑改动）。候选清单按平台给定，显式 override 必须存在否则 fail-closed。
 */
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

export function findChromium(executableOverride?: string): string {
  if (executableOverride !== undefined) {
    if (!existsSync(executableOverride)) {
      throw new RenderCheckError(
        "RENDER_BROWSER_UNAVAILABLE",
        "the explicitly provided browser executable does not exist",
      );
    }
    return executableOverride;
  }
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
