import assert from "node:assert/strict";
import { hostname, platform, userInfo } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { FIXTURE_MANIFEST_SHA256 } from "@wenshu/fixtures";
import { FONT_MANIFEST_SHA256 } from "@wenshu/fonts";

import {
  EnvironmentEvidenceError,
  collectMachineEvidence,
  parseMachineEvidence,
} from "../src/index.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

test("real collection on the Windows reference machine matches the contract", async (t) => {
  if (platform() !== "win32") {
    await assert.rejects(
      () => collectMachineEvidence(repositoryRoot, "wenshu-dev-primary"),
      (error: unknown) =>
        error instanceof EnvironmentEvidenceError &&
        error.code === "ENV_PLATFORM_UNSUPPORTED",
    );
    return;
  }
  const evidence = await collectMachineEvidence(repositoryRoot, "wenshu-dev-primary");

  // The collector output always satisfies the committed evidence contract.
  assert.deepEqual(parseMachineEvidence(evidence), evidence);

  assert.ok(evidence.cpu.logical_cores >= 1);
  assert.ok(evidence.memory.total_bytes >= 1024 ** 3);
  assert.ok(evidence.disk.free_bytes <= evidence.disk.total_bytes);
  assert.equal(
    Math.round((evidence.display.dpi / 96) * 100),
    evidence.display.scale_percent,
  );
  assert.equal(evidence.frozen_inputs.fixture_manifest_sha256, FIXTURE_MANIFEST_SHA256);
  assert.equal(evidence.frozen_inputs.font_manifest_sha256, FONT_MANIFEST_SHA256);

  // Evidence never carries host or user identity.
  const serialized = JSON.stringify(evidence);
  assert.equal(serialized.includes(hostname()), false);
  const username = userInfo().username;
  if (username.length > 0) {
    assert.equal(serialized.includes(username), false);
  }
  t.diagnostic(
    `collected ${evidence.os.release} / ${evidence.cpu.logical_cores} cores / ` +
      `${evidence.display.scale_percent}% scale`,
  );
});
