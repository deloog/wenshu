import type { ProjectFlow } from "./session.ts";
import type { FlowActionId, FlowScreenViewModel } from "./view-model.ts";

const ACTION_LABELS: Readonly<Record<FlowActionId, string>> = {
  "new-project": "新建项目",
  "open-project": "打开项目",
  "import-markdown": "导入 Markdown",
  "cancel-import": "取消导入",
  "retry-import": "重试导入",
  "return-to-project": "返回项目视图",
};

/**
 * Thin DOM mount for the A-02 project/import flow. Text-only rendering via
 * textContent (no innerHTML injection surface), native buttons for keyboard
 * reachability; all logic lives in the session/view-model layers.
 */
export function mountFlow(root: HTMLElement, flow: ProjectFlow): void {
  const heading = document.createElement("h2");
  heading.textContent = "项目与导入（A-02 真实流程）";
  root.append(heading);

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "新项目目录名：";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = "我的项目";
  nameLabel.append(nameInput);
  root.append(nameLabel);

  const noticeLine = document.createElement("p");
  const screenContainer = document.createElement("section");
  const actionBar = document.createElement("div");
  actionBar.setAttribute("role", "group");
  actionBar.setAttribute("aria-label", "流程操作");
  root.append(noticeLine, screenContainer, actionBar);

  function render(screen: FlowScreenViewModel): void {
    screenContainer.replaceChildren();
    noticeLine.textContent = screen.notice ?? "";

    const title = document.createElement("h3");
    title.textContent = screen.heading;
    screenContainer.append(title);

    if (screen.requiredItems.length > 0) {
      appendList(screenContainer, "必须呈现（冻结契约，逐字）", screen.requiredItems);
    }
    if (screen.forbiddenNotes.length > 0) {
      appendList(screenContainer, "不做（冻结契约，逐字）", screen.forbiddenNotes);
    }
    if (screen.detailLines.length > 0) {
      appendList(screenContainer, "当前情况", screen.detailLines);
    }
    if (screen.items.length > 0) {
      appendList(
        screenContainer,
        "失败项（逐项，不整体吞掉）",
        screen.items.map(
          (item) =>
            `${item.fileName} — ${item.reasonCode}${item.retryable ? "（可重试）" : ""}`,
        ),
      );
    }
    const a11y = document.createElement("p");
    a11y.textContent = `${screen.textEquivalent}；${screen.focusEntry}`;
    screenContainer.append(a11y);

    actionBar.replaceChildren();
    for (const action of screen.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = ACTION_LABELS[action];
      button.addEventListener("click", () => {
        void run(action);
      });
      actionBar.append(button);
    }
  }

  async function run(action: FlowActionId): Promise<void> {
    if (action === "new-project") {
      render(await flow.newProject(nameInput.value.trim() || "我的项目"));
    } else if (action === "open-project") {
      render(await flow.openProject());
    } else if (action === "import-markdown" || action === "retry-import") {
      render(await flow.importMarkdown());
    } else if (action === "cancel-import") {
      render(flow.cancelImport());
    } else {
      render(flow.returnToProject());
    }
  }

  render(flow.screen());
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
