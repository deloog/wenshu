import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HOST_PROTOCOL_VERSION,
  type HostContractIssueCode,
  validateHostSession,
} from "../src/index.ts";

async function registryFixture(): Promise<unknown> {
  const path = new URL("../fixtures/valid/browser-registry.json", import.meta.url);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function request(
  requestId: string,
  capability: "file.export.write" | "platform.info.read" | "project.save.atomic",
): Readonly<Record<string, unknown>> {
  return {
    protocol_version: HOST_PROTOCOL_VERSION,
    kind: "request",
    request_id: requestId,
    capability,
    capability_version: "0.1.0",
    input: {},
  };
}

function hasIssue(
  result: ReturnType<typeof validateHostSession>,
  code: HostContractIssueCode,
): boolean {
  return !result.ok && result.issues.some((entry) => entry.code === code);
}

test("a supported request reaches exactly one success terminal", async () => {
  const registry = await registryFixture();
  const start = request(
    "req_00000000000000000000000000000021",
    "platform.info.read",
  );
  const success = {
    protocol_version: HOST_PROTOCOL_VERSION,
    kind: "success",
    request_id: start["request_id"],
    capability: start["capability"],
    output: { platform_kind: "browser" },
  };

  assert.equal(validateHostSession(registry, [start, success]).ok, true);
  assert.ok(
    hasIssue(
      validateHostSession(registry, [start, success, success]),
      "HOST_TERMINAL_STATE_DUPLICATE",
    ),
  );
});

test("failures must use error codes declared by the capability", async () => {
  const registry = await registryFixture();
  const start = request(
    "req_00000000000000000000000000000022",
    "platform.info.read",
  );
  const failure = {
    protocol_version: HOST_PROTOCOL_VERSION,
    kind: "failure",
    request_id: start["request_id"],
    capability: start["capability"],
    error: {
      code: "HOST_QUOTA_EXCEEDED",
      retryable: false,
      detail_key: "host.platform.quota",
    },
    fallback: { strategy: "none", reason_code: "NO_FALLBACK" },
  };
  assert.ok(
    hasIssue(
      validateHostSession(registry, [start, failure]),
      "HOST_ERROR_CODE_UNDECLARED",
    ),
  );
});

test("progress sequence and cancellation follow the registry declaration", async () => {
  const registry = await registryFixture();
  const start = request(
    "req_00000000000000000000000000000023",
    "file.export.write",
  );
  const progress = (sequence: number): Readonly<Record<string, unknown>> => ({
    protocol_version: HOST_PROTOCOL_VERSION,
    kind: "progress",
    request_id: start["request_id"],
    capability: start["capability"],
    sequence,
    phase: "running",
    completed: sequence,
    total: 10,
    message_key: "host.export.writing",
  });
  assert.ok(
    hasIssue(
      validateHostSession(registry, [start, progress(2), progress(1)]),
      "HOST_SEQUENCE_REGRESSION",
    ),
  );

  const nonCancellable = request(
    "req_00000000000000000000000000000024",
    "platform.info.read",
  );
  const cancel = {
    protocol_version: HOST_PROTOCOL_VERSION,
    kind: "cancel",
    request_id: nonCancellable["request_id"],
    reason: "user",
  };
  assert.ok(
    hasIssue(
      validateHostSession(registry, [nonCancellable, cancel]),
      "HOST_CANCELLATION_UNDECLARED",
    ),
  );
});

test("unsupported capabilities cannot start a session request", async () => {
  const registry = await registryFixture();
  const start = request(
    "req_00000000000000000000000000000025",
    "project.save.atomic",
  );
  assert.ok(
    hasIssue(
      validateHostSession(registry, [start]),
      "HOST_CAPABILITY_UNSUPPORTED",
    ),
  );
});

test("every accepted request must reach one terminal state", async () => {
  const registry = await registryFixture();
  const start = request(
    "req_00000000000000000000000000000025",
    "platform.info.read",
  );
  const result = validateHostSession(registry, [start]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "HOST_TERMINAL_STATE_MISSING",
      ),
    );
  }
});
