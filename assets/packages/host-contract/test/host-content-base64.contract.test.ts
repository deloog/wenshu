import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  hostPayloadSchemaId,
  isContentBase64,
  validateHostPayload,
} from "../src/index.ts";

const SAVE_ATOMIC_INPUT = hostPayloadSchemaId("project.save.atomic", "input");

function saveAtomicInput(contentBase64: string): Record<string, unknown> {
  return {
    grant_id: "grant_02020202020202020202020202020202",
    file_name: "report.md",
    content_base64: contentBase64,
    content_sha256: "185f8db32271fe25f561a6fc938b2e264306ec304eda518007d1764826381969",
    expected_previous_sha256: null,
  };
}

/** Deterministic valid base64 of the requested character length. */
function validBase64(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += alphabet[(index * 31 + 7) % 64];
  }
  return value;
}

// PB-12 audit MAJOR-1: the frozen ContentBase64 pattern exhausted the V8
// RegExp stack at ~4 MiB — deep inside the advertised ~64 MiB range — and
// escaped as a raw RangeError with zero protocol terminal states. The
// programmatic content-base64 format must accept the whole advertised range.
test("ContentBase64 validates across the advertised range without throwing", () => {
  for (const mib of [1, 2, 4, 8]) {
    const length = mib * 1024 * 1024;
    const result = validateHostPayload(
      SAVE_ATOMIC_INPUT,
      saveAtomicInput(validBase64(length)),
    );
    assert.equal(result.ok, true, `${mib} MiB valid base64 must validate`);
  }
});

test("ContentBase64 rejects malformed values with a schema issue, never a throw", () => {
  const cases: readonly [string, string][] = [
    ["length not multiple of 4", validBase64(101)],
    ["character outside the alphabet", `${validBase64(96)}*AAA`],
    ["non-ascii character", `${validBase64(96)}中AAA`],
    ["equals sign inside the body", `${validBase64(48)}=${validBase64(51)}`],
    ["triple padding", `${validBase64(96)}A===`],
    ["padding followed by data", `${validBase64(96)}==AA`],
  ];
  for (const [label, value] of cases) {
    assert.equal(isContentBase64(value), false, label);
    const result = validateHostPayload(SAVE_ATOMIC_INPUT, saveAtomicInput(value));
    assert.equal(result.ok, false, label);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "HOST_PAYLOAD_SCHEMA", label);
    }
  }
  assert.equal(isContentBase64(""), true, "empty string is in the language");
});

// Language equivalence: the programmatic check must accept exactly the same
// strings as the frozen pattern (the pattern is only safe to run on small
// inputs, which is precisely where equivalence is checkable).
test("content-base64 format accepts exactly the frozen pattern language", () => {
  const frozen = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
  const symbols = "ABCabc017+/=*中 ";
  let state = 0x9e3779b9;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state;
  };
  for (let iteration = 0; iteration < 5000; iteration += 1) {
    const length = next() % 13;
    let value = "";
    for (let index = 0; index < length; index += 1) {
      value += symbols[next() % symbols.length];
    }
    assert.equal(
      isContentBase64(value),
      frozen.test(value),
      `language mismatch for ${JSON.stringify(value)}`,
    );
  }
});

// Regression guard: the schema must stay on the programmatic format; going
// back to a regex pattern re-introduces the stack-exhaustion crash path.
test("ContentBase64 schema definition uses the programmatic format", async () => {
  const schema = JSON.parse(
    await readFile(
      new URL("../schema/host-payloads-0.2.0.schema.json", import.meta.url),
      "utf8",
    ),
  ) as { $defs: Record<string, Record<string, unknown>> };
  const definition = schema.$defs["ContentBase64"];
  assert.equal(definition?.["format"], "content-base64");
  assert.equal("pattern" in (definition ?? {}), false, "regex pattern must not return");
  assert.equal(definition?.["maxLength"], 89478488);
});
