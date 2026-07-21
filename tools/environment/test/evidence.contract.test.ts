import assert from "node:assert/strict";
import test from "node:test";

import { EnvironmentEvidenceError, parseMachineEvidence } from "../src/index.ts";

function validEvidence(): Record<string, unknown> {
  return {
    schema_version: "0.1.0",
    evidence_id: "wenshu.reference-machine",
    recorded_at: "2026-07-21T00:00:00.000Z",
    machine_label: "wenshu-dev-primary",
    os: {
      platform: "win32",
      release: "10.0.19045",
      version: "Windows 10 Pro",
      arch: "x64",
    },
    cpu: { model: "Example CPU", logical_cores: 8, speed_mhz: 2400 },
    memory: { total_bytes: 16 * 1024 ** 3 },
    display: { width_px: 1920, height_px: 1080, scale_percent: 100, dpi: 96 },
    disk: { mount: "D:\\", total_bytes: 1024 ** 4, free_bytes: 512 * 1024 ** 3 },
    runtime: { node: "v24.17.0", pnpm: "11.15.1" },
    frozen_inputs: {
      fixture_manifest_sha256: "a".repeat(64),
      font_manifest_sha256: "b".repeat(64),
    },
  };
}

function expectInvalid(mutation: (evidence: Record<string, unknown>) => void): void {
  const evidence = validEvidence();
  mutation(evidence);
  assert.throws(
    () => parseMachineEvidence(evidence),
    (error: unknown) =>
      error instanceof EnvironmentEvidenceError &&
      error.code === "ENV_EVIDENCE_INVALID",
  );
}

test("machine evidence accepts the frozen contract shape", () => {
  const parsed = parseMachineEvidence(validEvidence());
  assert.equal(parsed.schema_version, "0.1.0");
  assert.equal(parsed.display.scale_percent, 100);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.os));
  assert.ok(Object.isFrozen(parsed.frozen_inputs));
});

test("machine evidence identity fields fail closed", () => {
  expectInvalid((evidence) => {
    evidence["schema_version"] = "0.2.0";
  });
  expectInvalid((evidence) => {
    evidence["evidence_id"] = "wenshu.other";
  });
  expectInvalid((evidence) => {
    evidence["extra"] = true;
  });
  expectInvalid((evidence) => {
    evidence["recorded_at"] = "2026-07-21 08:00:00";
  });
  expectInvalid((evidence) => {
    evidence["machine_label"] = "Wenshu Dev Primary";
  });
});

test("machine os, cpu, memory, and runtime fields fail closed", () => {
  expectInvalid((evidence) => {
    evidence["os"] = { ...(evidence["os"] as object), platform: "freebsd" };
  });
  expectInvalid((evidence) => {
    evidence["os"] = { ...(evidence["os"] as object), arch: "mips" };
  });
  expectInvalid((evidence) => {
    evidence["cpu"] = { ...(evidence["cpu"] as object), logical_cores: 0 };
  });
  expectInvalid((evidence) => {
    evidence["memory"] = { total_bytes: -1 };
  });
  expectInvalid((evidence) => {
    evidence["runtime"] = { node: "24.17.0", pnpm: "11.15.1" };
  });
  expectInvalid((evidence) => {
    evidence["runtime"] = { node: "v24.17.0", pnpm: "v11.15.1" };
  });
});

test("display and disk invariants fail closed", () => {
  // 120 dpi implies 125% scale, so claiming 100% must be rejected.
  expectInvalid((evidence) => {
    evidence["display"] = {
      width_px: 1920,
      height_px: 1080,
      scale_percent: 100,
      dpi: 120,
    };
  });
  expectInvalid((evidence) => {
    evidence["disk"] = {
      mount: "D:\\data",
      total_bytes: 1024 ** 4,
      free_bytes: 0,
    };
  });
  expectInvalid((evidence) => {
    evidence["disk"] = {
      mount: "D:\\",
      total_bytes: 100,
      free_bytes: 101,
    };
  });
});

test("frozen input anchors fail closed", () => {
  expectInvalid((evidence) => {
    evidence["frozen_inputs"] = {
      fixture_manifest_sha256: "not-a-sha",
      font_manifest_sha256: "b".repeat(64),
    };
  });
  expectInvalid((evidence) => {
    evidence["frozen_inputs"] = {
      fixture_manifest_sha256: "a".repeat(64),
    };
  });
});
