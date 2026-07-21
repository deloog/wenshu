import { EnvironmentEvidenceError } from "./errors.ts";
import type { MachineEvidence } from "./types.ts";

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MACHINE_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/u;
const NODE_VERSION_PATTERN = /^v\d+\.\d+\.\d+$/u;
const PNPM_VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;
const MOUNT_PATTERN = /^(?:[A-Za-z]:[\\/]?|\/)$/u;
const ARCHITECTURES = Object.freeze(["x64", "arm64", "ia32"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function requireRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new EnvironmentEvidenceError("ENV_EVIDENCE_INVALID", message);
  }
  return value;
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EnvironmentEvidenceError("ENV_EVIDENCE_INVALID", message);
  }
  return value;
}

function requireSafeInteger(value: unknown, minimum: number, message: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new EnvironmentEvidenceError("ENV_EVIDENCE_INVALID", message);
  }
  return value;
}

export function parseMachineEvidence(value: unknown): MachineEvidence {
  const root = requireRecord(
    value,
    [
      "cpu",
      "disk",
      "display",
      "evidence_id",
      "frozen_inputs",
      "machine_label",
      "memory",
      "os",
      "recorded_at",
      "runtime",
      "schema_version",
    ],
    "machine evidence shape is invalid",
  );
  if (
    root["schema_version"] !== "0.1.0" ||
    root["evidence_id"] !== "wenshu.reference-machine" ||
    typeof root["recorded_at"] !== "string" ||
    !ISO_UTC_PATTERN.test(root["recorded_at"]) ||
    typeof root["machine_label"] !== "string" ||
    !MACHINE_LABEL_PATTERN.test(root["machine_label"])
  ) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "machine evidence identity is invalid",
    );
  }

  const os = requireRecord(
    root["os"],
    ["arch", "platform", "release", "version"],
    "machine os shape is invalid",
  );
  if (
    (os["platform"] !== "win32" &&
      os["platform"] !== "linux" &&
      os["platform"] !== "darwin") ||
    typeof os["arch"] !== "string" ||
    !ARCHITECTURES.includes(os["arch"])
  ) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "machine os identity is invalid",
    );
  }
  const parsedOs = Object.freeze({
    platform: os["platform"],
    release: requireNonEmptyString(os["release"], "machine os release is invalid"),
    version: requireNonEmptyString(os["version"], "machine os version is invalid"),
    arch: os["arch"],
  });

  const cpu = requireRecord(
    root["cpu"],
    ["logical_cores", "model", "speed_mhz"],
    "machine cpu shape is invalid",
  );
  const parsedCpu = Object.freeze({
    model: requireNonEmptyString(cpu["model"], "machine cpu model is invalid"),
    logical_cores: requireSafeInteger(
      cpu["logical_cores"],
      1,
      "machine cpu core count is invalid",
    ),
    speed_mhz: requireSafeInteger(cpu["speed_mhz"], 1, "machine cpu speed is invalid"),
  });

  const memory = requireRecord(
    root["memory"],
    ["total_bytes"],
    "machine memory shape is invalid",
  );
  const parsedMemory = Object.freeze({
    total_bytes: requireSafeInteger(
      memory["total_bytes"],
      1,
      "machine memory size is invalid",
    ),
  });

  const display = requireRecord(
    root["display"],
    ["dpi", "height_px", "scale_percent", "width_px"],
    "machine display shape is invalid",
  );
  const parsedDisplay = Object.freeze({
    width_px: requireSafeInteger(
      display["width_px"],
      1,
      "machine display width is invalid",
    ),
    height_px: requireSafeInteger(
      display["height_px"],
      1,
      "machine display height is invalid",
    ),
    scale_percent: requireSafeInteger(
      display["scale_percent"],
      25,
      "machine display scale is invalid",
    ),
    dpi: requireSafeInteger(display["dpi"], 24, "machine display dpi is invalid"),
  });
  if (Math.round((parsedDisplay.dpi / 96) * 100) !== parsedDisplay.scale_percent) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "machine display dpi and scale disagree",
    );
  }

  const disk = requireRecord(
    root["disk"],
    ["free_bytes", "mount", "total_bytes"],
    "machine disk shape is invalid",
  );
  if (typeof disk["mount"] !== "string" || !MOUNT_PATTERN.test(disk["mount"])) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "machine disk mount is invalid",
    );
  }
  const parsedDisk = Object.freeze({
    mount: disk["mount"],
    total_bytes: requireSafeInteger(
      disk["total_bytes"],
      1,
      "machine disk size is invalid",
    ),
    free_bytes: requireSafeInteger(
      disk["free_bytes"],
      0,
      "machine free disk is invalid",
    ),
  });
  if (parsedDisk.free_bytes > parsedDisk.total_bytes) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "machine free disk exceeds total disk",
    );
  }

  const runtime = requireRecord(
    root["runtime"],
    ["node", "pnpm"],
    "machine runtime shape is invalid",
  );
  if (
    typeof runtime["node"] !== "string" ||
    !NODE_VERSION_PATTERN.test(runtime["node"]) ||
    typeof runtime["pnpm"] !== "string" ||
    !PNPM_VERSION_PATTERN.test(runtime["pnpm"])
  ) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "machine runtime versions are invalid",
    );
  }
  const parsedRuntime = Object.freeze({ node: runtime["node"], pnpm: runtime["pnpm"] });

  const frozen = requireRecord(
    root["frozen_inputs"],
    ["fixture_manifest_sha256", "font_manifest_sha256"],
    "machine frozen inputs shape is invalid",
  );
  if (
    typeof frozen["fixture_manifest_sha256"] !== "string" ||
    !SHA256_PATTERN.test(frozen["fixture_manifest_sha256"]) ||
    typeof frozen["font_manifest_sha256"] !== "string" ||
    !SHA256_PATTERN.test(frozen["font_manifest_sha256"])
  ) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "machine frozen input anchors are invalid",
    );
  }
  const parsedFrozen = Object.freeze({
    fixture_manifest_sha256: frozen["fixture_manifest_sha256"],
    font_manifest_sha256: frozen["font_manifest_sha256"],
  });

  return Object.freeze({
    schema_version: "0.1.0",
    evidence_id: "wenshu.reference-machine",
    recorded_at: root["recorded_at"],
    machine_label: root["machine_label"],
    os: parsedOs,
    cpu: parsedCpu,
    memory: parsedMemory,
    display: parsedDisplay,
    disk: parsedDisk,
    runtime: parsedRuntime,
    frozen_inputs: parsedFrozen,
  });
}
