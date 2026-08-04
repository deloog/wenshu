import { cloneAndFreeze } from "@wenshu/contract-runtime";

import type { UxState, UxStatesDocument } from "./generated/ux-states.ts";
import statesV1_0_0 from "./states-1.0.0.json" with { type: "json" };

export type * from "./generated/ux-states.ts";

/**
 * Pure-data subpath (`@wenshu/ux-state/data`, A-02 / ADR-0029 §4 /
 * A-01-followups #1): the frozen 1.0.0 state machine WITHOUT the Ajv
 * self-validation the main entry performs at module load (that self-check
 * dragged ~145 kB of Ajv into the apps/web browser bundle).
 *
 * Trust model: this module reads the very same states-1.0.0.json bytes the
 * main entry validates; test/data-parity.unit.test.ts proves UX_STATES_DATA is
 * deep-equal to the Ajv-validated UX_STATES and that canTransitionIn agrees
 * with canTransition on the full 12×12 matrix, so the two entries cannot
 * silently drift. states-1.0.0.json itself is NOT touched here
 * (A-01-followups #4: stateVersion 1.0.0 zero-change discipline).
 */
export const UX_STATES_DATA: UxStatesDocument = cloneAndFreeze(
  statesV1_0_0 as unknown as UxStatesDocument,
);

export function listUxStatesFrom(data: UxStatesDocument): readonly UxState[] {
  return data.states;
}

export function getUxStateFrom(
  data: UxStatesDocument,
  id: string,
): UxState | undefined {
  return data.states.find((state) => state.id === id);
}

/**
 * Same semantics as the main entry's canTransition, with the document passed
 * explicitly instead of read from the Ajv-validated module constant.
 */
export function canTransitionIn(
  data: UxStatesDocument,
  fromId: string,
  toId: string,
): boolean {
  if (!data.states.some((state) => state.id === toId)) {
    return false;
  }
  const from = getUxStateFrom(data, fromId);
  return from !== undefined && from.transitions.includes(toId);
}
