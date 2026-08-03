import type { ImportFailureItem, ImportFlowView } from "@wenshu/ux-state/import-flow";

/**
 * Pure view-model for the project/import flow (A-02): all presentation logic
 * lives here so the DOM layer stays thin and untested. Verbatim contract
 * obligations (requiredPresentation / forbiddenSemantics / a11y) pass through
 * untouched from the frozen state machine via the import-flow controller.
 */
export type FlowActionId =
  | "new-project"
  | "open-project"
  | "import-markdown"
  | "cancel-import"
  | "retry-import"
  | "return-to-project";

export interface FlowScreenViewModel {
  readonly kind: "state" | "project-view";
  readonly heading: string;
  /** Verbatim frozen requiredPresentation for machine states; [] in project view. */
  readonly requiredItems: readonly string[];
  /** Verbatim frozen forbiddenSemantics; never dropped. */
  readonly forbiddenNotes: readonly string[];
  readonly textEquivalent: string;
  readonly focusEntry: string;
  readonly detailLines: readonly string[];
  readonly items: readonly ImportFailureItem[];
  readonly actions: readonly FlowActionId[];
  /** One-shot session notice (e.g. a denied directory selection at empty-project). */
  readonly notice?: string;
}

const PROJECT_ACTIONS: readonly FlowActionId[] = Object.freeze([
  "new-project",
  "open-project",
  "import-markdown",
]);

export function buildFlowScreen(
  view: ImportFlowView,
  notice?: string,
): FlowScreenViewModel {
  if (view.kind === "project-view") {
    const heading =
      view.cause === "project-opened"
        ? `项目「${view.projectName ?? ""}」已就绪`
        : view.cause === "import-succeeded"
          ? "导入完成，已返回项目视图"
          : view.cause === "import-cancelled"
            ? "导入已取消（取消不是失败）"
            : view.cause === "import-failed"
              ? `导入失败（${view.reasonCode ?? "未知原因"}）`
              : "已返回项目视图";
    return Object.freeze({
      kind: "project-view",
      heading,
      requiredItems: Object.freeze([]),
      forbiddenNotes: Object.freeze([]),
      textEquivalent: heading,
      focusEntry: "焦点落在「导入 Markdown」主操作",
      detailLines: Object.freeze([]),
      items: Object.freeze([]),
      actions: PROJECT_ACTIONS,
      ...(notice === undefined ? {} : { notice }),
    });
  }

  const detailLines: string[] = [];
  const items: ImportFailureItem[] = [];
  let actions: readonly FlowActionId[] = PROJECT_ACTIONS;

  if (view.stateId === "importing") {
    detailLines.push(`文件名：${view.fileName ?? "（待选择）"}`);
    if (view.progress !== undefined) {
      detailLines.push(
        `阶段：${view.progress.phase}；进度：${String(view.progress.percent)}%`,
      );
    }
    detailLines.push("原文件只读：导入不修改源文件");
    actions = Object.freeze(["cancel-import"]);
  } else if (view.stateId === "import-partial") {
    detailLines.push("成功内容：正文与可用资源已导入");
    for (const item of view.items ?? []) {
      items.push(item);
    }
    actions = Object.freeze(["retry-import", "return-to-project"]);
  } else if (view.stateId === "permission-denied") {
    detailLines.push(`为什么需要：导入需要选择并读取本地文件（${view.reasonCode ?? ""}）`);
    if (view.fallbackNote !== undefined) {
      detailLines.push(`当前可做什么 / 降级路径：${view.fallbackNote}`);
    }
    detailLines.push("如何重新授权：由用户主动重新发起，不自动重弹授权框");
    // 不循环弹窗: a non-retryable failure (e.g. HOST_UNSUPPORTED) offers no
    // retry affordance at all; retryable ones expose a single explicit retry.
    actions =
      view.retryable === true
        ? Object.freeze(["retry-import", "return-to-project"])
        : Object.freeze(["return-to-project"]);
  }

  return Object.freeze({
    kind: "state",
    heading: `${view.label}（${view.stateId}）`,
    requiredItems: view.requiredPresentation,
    forbiddenNotes: view.forbiddenSemantics,
    textEquivalent: view.a11y.textEquivalent,
    focusEntry: view.a11y.focusEntry,
    detailLines: Object.freeze(detailLines),
    items: Object.freeze(items),
    actions,
    ...(notice === undefined ? {} : { notice }),
  });
}
