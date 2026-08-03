import type { UxState } from "@wenshu/ux-state/data";
import {
  UX_STATES_DATA,
  getUxStateFrom,
  listUxStatesFrom,
} from "@wenshu/ux-state/data";

/** Display-ready rendering of one frozen contract state (A-01 gallery). */
export interface StateScreenViewModel {
  readonly stateId: string;
  readonly label: string;
  readonly uxSpecRow: number;
  readonly evidenceSource: UxState["evidenceSource"];
  /** Verbatim contract requiredPresentation; every entry must be visible. */
  readonly requiredItems: readonly string[];
  /** Verbatim contract forbiddenSemantics, rendered as a "we do not" list. */
  readonly forbiddenNotes: readonly string[];
  readonly cancelable: boolean;
  readonly textEquivalent: string;
  readonly focusEntry: string;
  readonly transitions: readonly { readonly id: string; readonly label: string }[];
  readonly extensions: readonly ExtensionEntry[];
}

export interface ExtensionEntry {
  readonly name: string;
  readonly value: string;
}

const EXTENSION_LABELS = {
  pagination: "分页",
  permission: "权限",
  offline: "离线",
  recovery: "恢复",
} as const;

const EXTENSION_KEYS = ["pagination", "permission", "offline", "recovery"] as const;

function formatValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join("、");
  }
  return String(value);
}

export function extensionEntries(state: UxState): ExtensionEntry[] {
  const entries: ExtensionEntry[] = [];
  for (const key of EXTENSION_KEYS) {
    const extension = state[key];
    if (extension === undefined) {
      continue;
    }
    for (const [name, value] of Object.entries(extension)) {
      entries.push({
        name: `${EXTENSION_LABELS[key]}·${name}`,
        value: formatValue(value),
      });
    }
  }
  return entries;
}

export function buildScreen(state: UxState): StateScreenViewModel {
  return Object.freeze({
    stateId: state.id,
    label: state.label,
    uxSpecRow: state.uxSpecRow,
    evidenceSource: state.evidenceSource,
    requiredItems: state.requiredPresentation,
    forbiddenNotes: state.forbiddenSemantics,
    cancelable: state.cancelable,
    textEquivalent: state.a11y.textEquivalent,
    focusEntry: state.a11y.focusEntry,
    transitions: state.transitions.map((id) =>
      Object.freeze({ id, label: getUxStateFrom(UX_STATES_DATA, id)?.label ?? id }),
    ),
    extensions: extensionEntries(state),
  });
}

/** One screen per frozen contract state, in ux-spec §4 table order. */
export function buildStateScreens(): readonly StateScreenViewModel[] {
  return Object.freeze(listUxStatesFrom(UX_STATES_DATA).map((state) => buildScreen(state)));
}

export function buildScreenFor(stateId: string): StateScreenViewModel | undefined {
  const state = getUxStateFrom(UX_STATES_DATA, stateId);
  return state === undefined ? undefined : buildScreen(state);
}
