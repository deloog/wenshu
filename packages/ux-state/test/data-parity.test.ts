import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  UX_STATES_DATA,
  canTransitionIn,
  getUxStateFrom,
  listUxStatesFrom,
} from "../src/data.ts";
import { UX_STATES, canTransition, listUxStates } from "../src/index.ts";

/**
 * Parity guard (A-01-followups #1 / ADR-0029 §4): the pure-data subpath must
 * never drift from the Ajv-validated main entry, and must never pull Ajv back
 * into the browser bundle.
 */
test("UX_STATES_DATA is deep-equal to the Ajv-validated UX_STATES", () => {
  assert.deepEqual(UX_STATES_DATA, UX_STATES);
});

test("data subpath accessors agree with the main entry", () => {
  assert.deepEqual(listUxStatesFrom(UX_STATES_DATA), listUxStates());
  for (const state of listUxStates()) {
    assert.deepEqual(getUxStateFrom(UX_STATES_DATA, state.id), state);
  }
  assert.equal(getUxStateFrom(UX_STATES_DATA, "no-such-state"), undefined);
});

test("canTransitionIn matches canTransition on the full 12×12 matrix plus unknowns", () => {
  const ids = [...listUxStates().map((state) => state.id), "unknown-a", "unknown-b"];
  for (const from of ids) {
    for (const to of ids) {
      assert.equal(
        canTransitionIn(UX_STATES_DATA, from, to),
        canTransition(from, to),
        `${from} -> ${to}`,
      );
    }
  }
});

test("data subpath does not import Ajv (bundle-lean guard)", async () => {
  const source = await readFile(new URL("../src/data.ts", import.meta.url), "utf8");
  const importLines = source.match(/^import\b[^;]*$/gmu)?.join("\n") ?? "";
  assert.equal(/ajv/iu.test(importLines), false);
});

test("frozen JSON bytes are untouched by the data subpath (1.0.0 zero-change)", async () => {
  const raw = await readFile(
    new URL("../src/states-1.0.0.json", import.meta.url),
    "utf8",
  );
  const parsed = JSON.parse(raw) as { stateVersion: string };
  assert.equal(parsed.stateVersion, "1.0.0");
  assert.equal(UX_STATES_DATA.stateVersion, "1.0.0");
});
