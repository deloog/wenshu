import type { WorkspaceSnapshot } from "./model.ts";

/**
 * D1 结构确认视图（可跳过，ADR-0030 D1/D2 推论）：呈现导入终态的结构
 * 摘要——层级深度、节点计数、被降级/丢弃项——并明示三类键盘纠正入口；
 * 不发明第 13 态，只是工作区的一个呈现分支。
 */
export function renderConfirmation(
  container: HTMLElement,
  snapshot: WorkspaceSnapshot,
): void {
  container.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = "结构确认（可跳过）";
  container.append(heading);

  const meta = snapshot.importMeta;
  if (meta !== undefined) {
    const source = document.createElement("p");
    source.textContent = `来源材料：${meta.materialName}；导入结果：${
      meta.status === "success" ? "全部成功" : "部分成功（有失败项）"
    }`;
    container.append(source);
  }

  const summary = snapshot.summary;
  const counts = Object.entries(summary.counts)
    .map(([type, count]) => `${type} × ${count}`)
    .join("，");
  const structure = document.createElement("p");
  structure.textContent = `节点计数：共 ${summary.totalBlocks} 块（${counts}）；层级深度：${summary.maxDepth}`;
  container.append(structure);

  if (meta !== undefined) {
    appendList(
      container,
      `已导入资源（${meta.importedAssets.length} 项）`,
      meta.importedAssets.length > 0 ? [...meta.importedAssets] : ["（无）"],
    );
    appendList(
      container,
      `被降级/丢弃项（${meta.failedAssets.length} 项，逐项列出，不整体吞掉）`,
      meta.failedAssets.length > 0
        ? meta.failedAssets.map((asset) => `${asset.fileName} — ${asset.reasonCode}`)
        : ["（无）"],
    );
  }

  appendList(container, "结构不对？三类纠正入口（仅键盘可完成）", [
    "节点类型纠正：焦点在段落/标题上按 Ctrl+T（段落包入以其文本为标题的新节；标题节拆回标题段落，子块 ID 保持）",
    "列表结构纠正：Ctrl+M 合并相邻同类列表；Ctrl+Enter 在当前项前拆分列表",
    "节点顺序纠正：Ctrl+↑ / Ctrl+↓ 同容器内移动焦点块",
  ]);

  const action = document.createElement("p");
  action.textContent = "确认无误按 Enter 进入编辑工作区；跳过确认按 Esc 直接进入。";
  container.append(action);
}

function appendList(
  parent: HTMLElement,
  heading: string,
  entries: readonly string[],
): void {
  const label = document.createElement("h4");
  label.textContent = heading;
  const list = document.createElement("ul");
  for (const entry of entries) {
    const item = document.createElement("li");
    item.textContent = entry;
    list.append(item);
  }
  parent.append(label, list);
}
