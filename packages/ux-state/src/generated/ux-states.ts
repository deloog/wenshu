/* Generated from schema/ux-states-1.0.0.schema.json. Do not edit directly. */

export interface UxStatesDocument {
  /**
   * Frozen Alpha UX state-machine contract version. Readers must fail closed on any other value (no best-effort reads); additive evolution follows the document-model discipline (ADR-0010) with a new schema file per version.
   */
  stateVersion: "1.0.0";
  /**
   * Exactly the 12 rows of docs/ux-spec.md §4, in table order. Enumeration boundary dual source (owner correction 2026-08-01): 7 rows map to the roadmap A-01 completion-evidence categories (loading/partial-success/failure/cancel/offline/recovery), 4 rows bind via ux-spec §4 '必须呈现', save-result is dual.
   *
   * @minItems 12
   * @maxItems 12
   */
  states: UxState[];
}
/**
 * Conditional extension presence (pagination/permission/offline/recovery required by state id) is enforced by the code semantic layer in src/index.ts (UX_STATE_EXTENSION_MISSING), not by if/then here: json-schema-to-typescript degrades allOf-if/then to an untyped record, which would rob the 12 consumers of typed access.
 */
export interface UxState {
  /**
   * Stable machine id; the importable contract handle for the 12 downstream consumers.
   */
  id: string;
  label: string;
  /**
   * 1-based row number in docs/ux-spec.md §4; traceability anchor.
   */
  uxSpecRow: number;
  /**
   * Why this row is mandatory: roadmap A-01 completion evidence (loading/partial-success/failure/cancel/offline/recovery), ux-spec §4 '必须呈现', or dual (save-result: failure side from the roadmap, success side from ux-spec §4).
   */
  evidenceSource: "roadmap-completion-evidence" | "ux-spec-must-present" | "dual";
  /**
   * Verbatim from the ux-spec §4 '必须呈现' cell; every entry must have a visible rendering in any consuming UI.
   *
   * @minItems 1
   */
  requiredPresentation: string[];
  /**
   * Verbatim '不得' clauses from ux-spec §4/§5/§6/§7; states must not lie (no blank meaningless editor, no swallowing partial results, unaccepted AI output never touches formal content, failed save never pretends saved, no retry-loop dialogs).
   */
  forbiddenSemantics: string[];
  cancelable: boolean;
  a11y: UxStateA11Y;
  /**
   * Allowed successor state ids; semantic validation requires the graph to be closed (no dangling targets).
   */
  transitions: string[];
  pagination?: UxPaginationExtension;
  permission?: UxPermissionExtension;
  offline?: UxOfflineExtension;
  recovery?: UxRecoveryExtension;
}
export interface UxStateA11Y {
  /**
   * Every state has a text equivalent expression (docs/accessibility.md); established at the state-machine level, not deferred to A-13.
   */
  textEquivalent: string;
  /**
   * Keyboard focus entry point for this state (keyboard reachable, focus visible).
   */
  focusEntry: string;
  /**
   * Errors and progress must not rely on color alone.
   */
  noColorOnly: true;
}
export interface UxPaginationExtension {
  fullRepagination?: never;
  /**
   * Current pagination phase shown to the user.
   */
  phase: string;
  cancelable: true;
  /**
   * The previous preview stays valid and visible until the new result is ready (ux-spec §4).
   */
  stalePreviewRetained: true;
  /**
   * D3 (ADR-0014): PoC-A full repagination is DEGRADE/not_met (PA-13 p95 24.3s vs 8s budget); the frozen state machine models INCREMENTAL pagination only and leaves the implementation slot for A-04. A full-repagination field is contract-level forbidden.
   */
  repaginationScope: "incremental";
  /**
   * Optional: which pages were incrementally updated; partial updates keep the stale preview valid.
   */
  updatedPageRange?: string;
}
export interface UxPermissionExtension {
  reason: string;
  /**
   * What the user can still do right now (maps to PB-10 HOST_PERMISSION_DENIED degradation).
   *
   * @minItems 1
   */
  availableActions: string[];
  reauthorization: string;
  /**
   * Explicit degradation enumeration, e.g. continue without grant / export to an already-authorized location.
   *
   * @minItems 1
   */
  degradationOptions: string[];
  /**
   * Never loop the permission dialog (ux-spec §4).
   */
  noRetryLoop: true;
}
export interface UxOfflineExtension {
  /**
   * Local editing, pagination, checks and export stay fully usable while the model is unavailable (ux-spec §4/§5); AI degradation is implemented in A-07P, only the state is frozen here.
   *
   * @minItems 4
   * @maxItems 4
   */
  localCapabilitiesIntact: ("编辑" | "排版" | "检查" | "导出")[];
  aiDegradationExplanation: string;
}
export interface UxRecoveryExtension {
  /**
   * Which checkpoint the recovery restores to (PB-12 measured semantics: last successful save). PB-12 N3 is the input only; user-facing wording remains owned by A-12.
   */
  checkpoint: string;
  /**
   * What may be lost (at most in-flight transactions / unsaved edits).
   */
  potentialLoss: string;
  /**
   * Whether a separate recovery copy is offered.
   */
  recoveryCopy: boolean;
}
