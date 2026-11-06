import type { UxStateA11Y, UxStatesDocument } from "./data.ts";
import { UX_STATES_DATA, canTransitionIn, getUxStateFrom } from "./data.ts";

/**
 * Import flow controller (A-02 / ADR-0029 §4): the single source of truth for
 * the four frozen machine states the import flow touches, shared by the two
 * consumers (apps/web flow UI and electron-shell E2E scenarios).
 *
 * requiredPresentation / forbiddenSemantics / a11y in every emitted view are
 * copied VERBATIM from the frozen states-1.0.0.json data (never paraphrased,
 * never silently dropped — forbiddenSemantics travel with the view so no
 * consumer can "forget" them). Every machine-state move is guarded by
 * canTransitionIn; an illegal move throws ImportFlowTransitionError
 * (fail-closed).
 *
 * Honest scope note: the frozen 12-state machine (stateVersion 1.0.0) has NO
 * "project-ready" state and no legal transition out of `importing` that means
 * "the import fully succeeded" (importing → import-partial / ai-processing /
 * permission-denied / crash-recovery only). A-02 must not invent a 13th state
 * (A-01-followups #4). Import success and user-initiated cancel are therefore
 * expressed as the NON-state-machine "project view" (kind: "project-view"),
 * with cancel reported as a cancelled outcome — never disguised as failure
 * (ADR-0029 §4). The same applies to a whole-import failure that is not a
 * permission problem: the machine has no generic import-failure state, so it
 * surfaces as project-view cause "import-failed" carrying the real code.
 */
export type ImportFlowStateId =
  "empty-project" | "importing" | "import-partial" | "permission-denied";

export const IMPORT_FLOW_STATE_IDS: readonly ImportFlowStateId[] = Object.freeze([
  "empty-project",
  "importing",
  "import-partial",
  "permission-denied",
]);

export interface ImportProgress {
  readonly phase: string;
  readonly percent: number;
}

export interface ImportFailureItem {
  readonly fileName: string;
  readonly reasonCode: string;
  readonly retryable: boolean;
}

export interface ImportFlowStateView {
  readonly kind: "state";
  readonly stateId: ImportFlowStateId;
  readonly label: string;
  /** Verbatim frozen requiredPresentation; every entry must be visible. */
  readonly requiredPresentation: readonly string[];
  /** Verbatim frozen forbiddenSemantics; never swallowed by the controller. */
  readonly forbiddenSemantics: readonly string[];
  readonly a11y: UxStateA11Y;
  readonly cancelable: boolean;
  /** importing: display metadata of the file being imported. */
  readonly fileName?: string;
  /** importing: latest progress sample. */
  readonly progress?: ImportProgress;
  /** import-partial: per-item failures; never empty in that state. */
  readonly items?: readonly ImportFailureItem[];
  /** permission-denied: the real host code (e.g. HOST_PERMISSION_DENIED / HOST_UNSUPPORTED). */
  readonly reasonCode?: string;
  /** permission-denied: whether the host marked the failure retryable. */
  readonly retryable?: boolean;
  /** permission-denied: registry fallback explanation (strategy + reason_code). */
  readonly fallbackNote?: string;
}

export type ImportFlowProjectCause =
  | "project-opened"
  | "import-succeeded"
  | "import-cancelled"
  | "import-failed"
  | "returned";

export interface ImportFlowProjectView {
  readonly kind: "project-view";
  readonly cause: ImportFlowProjectCause;
  readonly projectName?: string;
  /** import-failed: the real host/executor code, surfaced not disguised. */
  readonly reasonCode?: string;
}

export type ImportFlowView = ImportFlowStateView | ImportFlowProjectView;

export type ImportFlowEvent =
  | { readonly type: "project-opened"; readonly projectName: string }
  | { readonly type: "import-started"; readonly fileName: string }
  | { readonly type: "import-progress"; readonly progress: ImportProgress }
  | { readonly type: "import-succeeded" }
  | {
      readonly type: "import-partial";
      readonly items: readonly ImportFailureItem[];
    }
  | {
      readonly type: "import-permission-denied";
      readonly reasonCode: string;
      readonly retryable: boolean;
      readonly fallbackNote?: string;
    }
  | { readonly type: "import-failed"; readonly reasonCode: string }
  | { readonly type: "import-cancelled" }
  | { readonly type: "return-to-project" };

export class ImportFlowTransitionError extends Error {
  readonly code = "IMPORT_FLOW_ILLEGAL_TRANSITION" as const;
  readonly from: string;
  readonly eventType: string;

  constructor(from: string, eventType: string) {
    super(`IMPORT_FLOW_ILLEGAL_TRANSITION: ${from} --${eventType}`);
    this.name = "ImportFlowTransitionError";
    this.from = from;
    this.eventType = eventType;
  }
}

export interface ImportFlowControllerOptions {
  /** Frozen state machine data; defaults to the pure-data UX_STATES_DATA. */
  readonly data?: UxStatesDocument;
}

export interface ImportFlowController {
  view(): ImportFlowView;
  dispatch(event: ImportFlowEvent): ImportFlowView;
}

interface FlowContext {
  readonly projectName?: string;
  readonly fileName?: string;
  readonly progress?: ImportProgress;
  readonly items?: readonly ImportFailureItem[];
  readonly reasonCode?: string;
  readonly retryable?: boolean;
  readonly fallbackNote?: string;
}

type FlowPosition =
  | { readonly kind: "state"; readonly stateId: ImportFlowStateId }
  | { readonly kind: "project-view"; readonly cause: ImportFlowProjectCause };

export function createImportFlowController(
  options?: ImportFlowControllerOptions,
): ImportFlowController {
  const data = options?.data ?? UX_STATES_DATA;
  for (const id of IMPORT_FLOW_STATE_IDS) {
    if (getUxStateFrom(data, id) === undefined) {
      throw new Error(`IMPORT_FLOW_STATE_MISSING: ${id}`);
    }
  }
  let position: FlowPosition = { kind: "state", stateId: "empty-project" };
  let context: FlowContext = {};

  function currentAnchor(): string {
    // A project view re-enters the machine at empty-project: starting a new
    // import from a ready project is empty-project → importing (legal).
    return position.kind === "state" ? position.stateId : "empty-project";
  }

  function moveTo(target: ImportFlowStateId, eventType: string): void {
    if (!canTransitionIn(data, currentAnchor(), target)) {
      throw new ImportFlowTransitionError(currentAnchor(), eventType);
    }
    position = { kind: "state", stateId: target };
  }

  function leaveToProjectView(cause: ImportFlowProjectCause): void {
    position = { kind: "project-view", cause };
  }

  function requireImporting(eventType: string): void {
    if (!(position.kind === "state" && position.stateId === "importing")) {
      throw new ImportFlowTransitionError(currentAnchor(), eventType);
    }
  }

  function dispatch(event: ImportFlowEvent): ImportFlowView {
    switch (event.type) {
      case "project-opened": {
        if (position.kind === "state" && position.stateId !== "empty-project") {
          throw new ImportFlowTransitionError(currentAnchor(), event.type);
        }
        context = { projectName: event.projectName };
        leaveToProjectView("project-opened");
        break;
      }
      case "import-started": {
        moveTo("importing", event.type);
        context = { fileName: event.fileName };
        break;
      }
      case "import-progress": {
        requireImporting(event.type);
        const { percent } = event.progress;
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          throw new ImportFlowTransitionError(currentAnchor(), event.type);
        }
        context = { ...context, progress: event.progress };
        break;
      }
      case "import-succeeded": {
        requireImporting(event.type);
        leaveToProjectView("import-succeeded");
        break;
      }
      case "import-partial": {
        requireImporting(event.type);
        // Partial success must enumerate per-item failures; an empty list
        // would swallow the result wholesale (forbidden semantics).
        if (event.items.length === 0) {
          throw new ImportFlowTransitionError(currentAnchor(), event.type);
        }
        moveTo("import-partial", event.type);
        context = { items: event.items };
        break;
      }
      case "import-permission-denied": {
        requireImporting(event.type);
        moveTo("permission-denied", event.type);
        context = {
          reasonCode: event.reasonCode,
          retryable: event.retryable,
          ...(event.fallbackNote === undefined
            ? {}
            : { fallbackNote: event.fallbackNote }),
        };
        break;
      }
      case "import-failed": {
        requireImporting(event.type);
        context = { reasonCode: event.reasonCode };
        leaveToProjectView("import-failed");
        break;
      }
      case "import-cancelled": {
        requireImporting(event.type);
        leaveToProjectView("import-cancelled");
        break;
      }
      case "return-to-project": {
        if (
          position.kind === "project-view" ||
          (position.stateId !== "import-partial" &&
            position.stateId !== "permission-denied")
        ) {
          throw new ImportFlowTransitionError(currentAnchor(), event.type);
        }
        leaveToProjectView("returned");
        break;
      }
    }
    return view();
  }

  function view(): ImportFlowView {
    if (position.kind === "project-view") {
      const projectView: ImportFlowProjectView = {
        kind: "project-view",
        cause: position.cause,
        ...(context.projectName === undefined
          ? {}
          : { projectName: context.projectName }),
        ...(context.reasonCode === undefined ? {} : { reasonCode: context.reasonCode }),
      };
      return Object.freeze(projectView);
    }
    const state = getUxStateFrom(data, position.stateId);
    if (state === undefined) {
      // Unreachable: constructor pins all four ids; fail closed regardless.
      throw new Error(`IMPORT_FLOW_STATE_MISSING: ${position.stateId}`);
    }
    const stateView: ImportFlowStateView = {
      kind: "state",
      stateId: position.stateId,
      label: state.label,
      requiredPresentation: state.requiredPresentation,
      forbiddenSemantics: state.forbiddenSemantics,
      a11y: state.a11y,
      cancelable: state.cancelable,
      ...(context.fileName === undefined ? {} : { fileName: context.fileName }),
      ...(context.progress === undefined ? {} : { progress: context.progress }),
      ...(context.items === undefined ? {} : { items: context.items }),
      ...(context.reasonCode === undefined ? {} : { reasonCode: context.reasonCode }),
      ...(context.retryable === undefined ? {} : { retryable: context.retryable }),
      ...(context.fallbackNote === undefined
        ? {}
        : { fallbackNote: context.fallbackNote }),
    };
    return Object.freeze(stateView);
  }

  return Object.freeze({ view, dispatch });
}
