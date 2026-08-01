import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  base64Of,
  createTestHost,
  nextRequestId,
  selectGrant,
  sha256,
  withIsolatedRoot,
} from "./helpers.ts";

/**
 * PB-12 audit MAJOR-1 regression: the frozen ContentBase64 pattern crashed
 * (RangeError, zero protocol terminals) inside the advertised payload range.
 * The real Host must now produce exactly one terminal for a 4 MiB save, and
 * any unexpected validation-phase throw must degrade to a single INTERNAL
 * terminal instead of escaping raw (host-contract §3/§4).
 */

function bigSaveRequest(grantId: string, content: string): Record<string, unknown> {
  return {
    protocol_version: "0.2.0",
    kind: "request",
    request_id: nextRequestId(),
    capability: "project.save.atomic",
    capability_version: "0.2.0",
    input: {
      grant_id: grantId,
      file_name: "big.bin",
      content_base64: base64Of(content),
      content_sha256: sha256(content),
      expected_previous_sha256: null,
    },
  };
}

test("a 4 MiB save produces exactly one success terminal through the real Host", async () => {
  await withIsolatedRoot("large-payload", async (root) => {
    const host = createTestHost(root);
    const selected = await selectGrant(host);
    const grantId = selected["grant_id"] as string;
    // 3 MiB of source bytes -> 4 MiB of base64 (the old crash threshold).
    const content = "wenshu-MAJOR1-".repeat((3 * 1024 * 1024) / 14);

    const response = (await host.invoke(bigSaveRequest(grantId, content))) as Record<
      string,
      unknown
    >;

    assert.equal(response["kind"], "success", JSON.stringify(response));
    const output = response["output"] as Record<string, unknown>;
    assert.equal(output["sha256"], sha256(content));
    const onDisk = await readFile(join(root, "big.bin"), "utf8");
    assert.equal(onDisk, content);
    assert.equal((await stat(join(root, "big.bin"))).size, content.length);
  });
});

test("a validation-phase crash degrades to one INTERNAL terminal, never a raw escape", async () => {
  await withIsolatedRoot("validator-crash", async (root) => {
    const host = createTestHost(root);
    // Hostile input: addressable envelope fields as real own properties
    // (rawField reads descriptors, not the get trap), but any further
    // property access — e.g. reading `input` during validation — throws.
    // Simulates any future validator crash without mocking product code.
    const envelope = {
      protocol_version: "0.2.0",
      kind: "request",
      request_id: nextRequestId(),
      capability: "project.save.atomic",
      capability_version: "0.2.0",
    };
    const hostile = new Proxy(envelope, {
      get(target, key, receiver) {
        if (Reflect.has(target, key)) {
          return Reflect.get(target, key, receiver);
        }
        throw new RangeError("simulated validator stack blowout");
      },
    });

    const response = (await host.invoke(hostile)) as Record<string, unknown>;

    assert.equal(response["kind"], "failure", "exactly one failure terminal");
    const error = response["error"] as Record<string, unknown>;
    assert.equal(error["code"], "HOST_INTERNAL");
    assert.equal(response["capability"], "project.save.atomic");
  });
});
