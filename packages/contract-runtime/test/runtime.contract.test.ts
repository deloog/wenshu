import assert from "node:assert/strict";
import test from "node:test";

import { cloneAndFreeze, inspectData } from "../src/index.ts";

test("inherited accessors are rejected without invocation", () => {
  let invoked = false;
  const prototype = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(prototype, "payload", {
    get: (): unknown => {
      invoked = true;
      return "unsafe";
    },
  });
  const input = Object.create(prototype) as unknown;

  assert.deepEqual(inspectData(input, { maxDepth: 10, maxNodes: 100 }), {
    ok: false,
    kind: "prototype",
    path: "/",
  });
  assert.equal(invoked, false);
});

test("depth and node budgets fail deterministically", () => {
  const deep = { child: { child: { child: {} } } };
  assert.deepEqual(inspectData(deep, { maxDepth: 2, maxNodes: 100 }), {
    ok: false,
    kind: "budget",
    path: "/child/child/child",
  });

  assert.deepEqual(
    inspectData({ values: [{}, {}, {}] }, { maxDepth: 10, maxNodes: 2 }),
    { ok: false, kind: "budget", path: "/values/0" },
  );
});

test("custom key and string classifiers return stable paths", () => {
  const result = inspectData(
    { safe_name: { destination: "C:/private/file.txt" } },
    {
      classifyKey: (key) => (key === "destination" ? "bad-key" : undefined),
      classifyString: (value) =>
        /^[A-Za-z]:\//u.test(value) ? "absolute-path" : undefined,
      maxDepth: 10,
      maxNodes: 100,
    },
  );
  assert.deepEqual(result, {
    ok: false,
    kind: "custom",
    code: "bad-key",
    path: "/safe_name/destination",
  });
});

test("cloneAndFreeze creates an immutable detached graph", () => {
  const input = { nested: [{ value: "original" }] };
  const frozen = cloneAndFreeze(input);
  input.nested[0] = { value: "changed" };

  assert.equal(frozen.nested[0]?.value, "original");
  assert.ok(Object.isFrozen(frozen));
  assert.ok(Object.isFrozen(frozen.nested));
  assert.ok(Object.isFrozen(frozen.nested[0]));
});
