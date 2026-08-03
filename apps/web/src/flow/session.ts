import type {
  ImportFlowController,
  ImportFlowView,
} from "@wenshu/ux-state/import-flow";
import { createImportFlowController } from "@wenshu/ux-state/import-flow";

import type { BridgeTerminal, FlowBridge } from "./bridge.ts";
import { buildFlowScreen, type FlowScreenViewModel } from "./view-model.ts";

/**
 * DOM-free flow session (A-02): wires the injected host bridge to the frozen
 * import-flow controller. All state changes go through controller.dispatch so
 * machine-illegal moves fail closed in one place. Async host outcomes are
 * mapped to flow events without inventing states:
 * - HOST_PERMISSION_DENIED / HOST_UNSUPPORTED → permission-denied state
 *   (honest degradation, fallback note surfaced, no dialog loop);
 * - any other failure code → project-view cause "import-failed" carrying the
 *   real code (the frozen machine has no generic import-failure state);
 * - cancelled → project-view cause "import-cancelled" (never disguised as
 *   failure).
 */
export interface ProjectFlow {
  view(): ImportFlowView;
  screen(): FlowScreenViewModel;
  newProject(name: string): Promise<FlowScreenViewModel>;
  openProject(): Promise<FlowScreenViewModel>;
  importMarkdown(): Promise<FlowScreenViewModel>;
  cancelImport(): FlowScreenViewModel;
  returnToProject(): FlowScreenViewModel;
}

const DENIAL_CODES: ReadonlySet<string> = new Set([
  "HOST_PERMISSION_DENIED",
  "HOST_UNSUPPORTED",
]);

export function createProjectFlow(
  bridge: FlowBridge,
  controller?: ImportFlowController,
): ProjectFlow {
  const flow = controller ?? createImportFlowController();
  let notice: string | undefined;

  function screen(): FlowScreenViewModel {
    return buildFlowScreen(flow.view(), notice);
  }

  function denialNotice(terminal: BridgeTerminal & { readonly kind: "failure" }): void {
    // The frozen machine has no legal empty-project → permission-denied
    // transition; a denied directory selection therefore stays at the current
    // view with an explicit notice instead of lying about the state.
    notice = `授权被拒绝（${terminal.code}）：可在内存会话中继续，或由你主动重新发起`;
  }

  async function selectProject(purpose: "new" | "open", name?: string): Promise<void> {
    const terminal =
      purpose === "new"
        ? await bridge.createProject(name ?? "")
        : await bridge.openProject();
    if (terminal.kind === "success") {
      notice = undefined;
      const fallbackName = purpose === "new" ? (name ?? "") : "";
      flow.dispatch({
        type: "project-opened",
        projectName: terminal.projectName ?? fallbackName,
      });
      return;
    }
    if (terminal.kind === "cancelled") {
      notice = "已取消选择，项目未变更";
      return;
    }
    if (terminal.kind === "partial") {
      // Directory selection never produces partial import results; surface
      // the anomaly honestly instead of misreading it.
      notice = "选择返回了意外的部分导入结果，已忽略";
      return;
    }
    denialNotice(terminal);
  }

  return Object.freeze({
    view: () => flow.view(),
    screen,
    async newProject(name: string): Promise<FlowScreenViewModel> {
      await selectProject("new", name);
      return screen();
    },
    async openProject(): Promise<FlowScreenViewModel> {
      await selectProject("open");
      return screen();
    },
    async importMarkdown(): Promise<FlowScreenViewModel> {
      notice = undefined;
      flow.dispatch({ type: "import-started", fileName: "（待选择）" });
      const terminal = await bridge.importMarkdown();
      if (terminal.kind === "success") {
        flow.dispatch({ type: "import-succeeded" });
      } else if (terminal.kind === "cancelled") {
        flow.dispatch({ type: "import-cancelled" });
      } else if (terminal.kind === "partial") {
        flow.dispatch({ type: "import-partial", items: terminal.items });
      } else if (DENIAL_CODES.has(terminal.code)) {
        flow.dispatch({
          type: "import-permission-denied",
          reasonCode: terminal.code,
          retryable: terminal.retryable,
          ...(terminal.fallbackNote === undefined
            ? {}
            : { fallbackNote: terminal.fallbackNote }),
        });
      } else {
        flow.dispatch({ type: "import-failed", reasonCode: terminal.code });
      }
      return screen();
    },
    cancelImport(): FlowScreenViewModel {
      flow.dispatch({ type: "import-cancelled" });
      return screen();
    },
    returnToProject(): FlowScreenViewModel {
      flow.dispatch({ type: "return-to-project" });
      return screen();
    },
  });
}
