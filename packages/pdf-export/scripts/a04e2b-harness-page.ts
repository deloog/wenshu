/**
 * A-04E-2b 一次性验证工装页（决策 #25 D1：显式标注为工装，不得演化为产品 UI）。
 *
 * 自包含单页（内联 JS，零外部依赖），由 a04e2b-harness.ts 驱动经
 * startStaticServer 以 "/harness.html" 内联文档投放。页面本身不做任何
 * 测量判定：只提供页槽/embed 展示、DOM 覆盖层页眉页脚、stale 标注、
 * 取消/探针按钮与事件循环插桩；全部状态由 Node 驱动经 evaluate 注入。
 *
 * 驱动注入点（window 全局，全部由驱动 evaluate 调用）：
 * - __initSlots(pageCount, headerText, initialUrl)：建 pageCount 个页槽，
 *   每槽 embed 锚定 initialUrl + "#page=k"（旧整份按绝对页码显示）。
 * - __setSlotPdf(page, url)：把 1 基页槽的 embed 切到 url（调用方附带
 *   缓存破坏 query 与 "#page=" 锚 fragment）。
 * - __setStale(page, stale)：标注/撤下「stale（后台更新中）」徽标。
 * - __setStatus(text)：更新状态行并记入 __probe.events。
 * - __resetProbe()：清空 clicks/maxGapMs/events（每轮测量前由驱动复位）。
 *
 * 插桩（页面侧事实采集，判定归 VM 批次脚本）：
 * - __probe.clicks：探针按钮真实 click handler 的 performance.now() 序列。
 * - __probe.maxGapMs：25ms setInterval 采样到的事件循环最大间隔增量。
 * - __probe.events：驱动注入的状态变更（含 performance.now()）。
 * - __cancelRequested / __cancelRequestedAt：取消按钮真实 click handler 置位。
 */
export const HARNESS_PAGE_HTML: string = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>A-04E-2b 一次性验证工装</title>
<style>
  body { margin: 0; font-family: sans-serif; background: #f3f4f6; }
  #banner {
    position: fixed; top: 0; left: 0; right: 0; z-index: 10;
    background: #7f1d1d; color: #fff; font-weight: bold;
    padding: 8px 12px; font-size: 14px;
  }
  #controls {
    position: fixed; top: 36px; left: 0; right: 0; z-index: 10;
    background: #fff7ed; border-bottom: 1px solid #d6d3d1;
    padding: 6px 12px; font-size: 13px;
    display: flex; gap: 12px; align-items: center;
  }
  #status { flex: 1; font-family: monospace; white-space: pre-wrap; }
  #slots { margin-top: 92px; padding: 12px; display: flex; flex-direction: column; gap: 16px; }
  .slot { border: 1px solid #a8a29e; background: #fff; }
  .slot-label { font-size: 12px; color: #44403c; padding: 2px 6px; }
  .slot-frame { position: relative; height: 420px; }
  .slot-pdf { width: 100%; height: 100%; }
  .overlay {
    position: absolute; left: 0; right: 0; text-align: center;
    font-size: 11px; color: #1c1917; pointer-events: none;
    background: rgba(255, 255, 255, 0.01);
  }
  .overlay.header { top: 4px; }
  .overlay.footer { bottom: 4px; }
  .stale-badge {
    position: absolute; top: 8px; right: 8px;
    background: #b45309; color: #fff; font-size: 12px;
    padding: 2px 8px; border-radius: 3px;
  }
</style>
</head>
<body>
<div id="banner">A-04E-2b 一次性验证工装 · 非产品 UI（决策 #25）</div>
<div id="controls">
  <div id="status">(未初始化)</div>
  <button id="cancel-btn" type="button">取消后台任务</button>
  <button id="probe-btn" type="button">探针</button>
</div>
<div id="slots"></div>
<script>
"use strict";
window.__probe = { clicks: [], maxGapMs: 0, events: [] };
window.__cancelRequested = false;
window.__cancelRequestedAt = null;

(function sampleEventLoop() {
  var last = performance.now();
  setInterval(function () {
    var now = performance.now();
    var gap = now - last - 25;
    if (gap > window.__probe.maxGapMs) window.__probe.maxGapMs = gap;
    last = now;
  }, 25);
})();

function pushEvent(label) {
  window.__probe.events.push({ t: performance.now(), label: label });
}

document.getElementById("cancel-btn").addEventListener("click", function () {
  window.__cancelRequested = true;
  window.__cancelRequestedAt = performance.now();
  pushEvent("cancel-requested");
});
document.getElementById("probe-btn").addEventListener("click", function () {
  window.__probe.clicks.push(performance.now());
});

window.__setStatus = function (text) {
  document.getElementById("status").textContent = text;
  pushEvent("status:" + text);
};

window.__initSlots = function (pageCount, headerText, initialUrl) {
  var host = document.getElementById("slots");
  host.textContent = "";
  for (var k = 1; k <= pageCount; k += 1) {
    var slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.page = String(k);

    var label = document.createElement("div");
    label.className = "slot-label";
    label.textContent = "第 " + k + " / " + pageCount + " 页";
    slot.appendChild(label);

    var frame = document.createElement("div");
    frame.className = "slot-frame";

    var embed = document.createElement("embed");
    embed.className = "slot-pdf";
    embed.type = "application/pdf";
    embed.src = initialUrl + "#page=" + k;
    frame.appendChild(embed);

    var header = document.createElement("div");
    header.className = "overlay header";
    header.textContent = headerText;
    frame.appendChild(header);

    var footer = document.createElement("div");
    footer.className = "overlay footer";
    footer.textContent = k + " / " + pageCount;
    frame.appendChild(footer);

    var stale = document.createElement("div");
    stale.className = "stale-badge";
    stale.textContent = "stale（后台更新中）";
    stale.hidden = true;
    frame.appendChild(stale);

    slot.appendChild(frame);
    host.appendChild(slot);
  }
  pushEvent("init-slots:" + pageCount);
};

function slotOf(page) {
  var slot = document.querySelector('.slot[data-page="' + page + '"]');
  if (slot === null) throw new Error("no slot for page " + page);
  return slot;
}

window.__setSlotPdf = function (page, url) {
  var embed = slotOf(page).querySelector(".slot-pdf");
  embed.src = url;
  pushEvent("slot-pdf:" + page);
};

window.__setStale = function (page, stale) {
  slotOf(page).querySelector(".stale-badge").hidden = !stale;
  pushEvent("stale:" + page + ":" + stale);
};

window.__resetProbe = function () {
  window.__probe.clicks.length = 0;
  window.__probe.events.length = 0;
  window.__probe.maxGapMs = 0;
};
</script>
</body>
</html>
`;
