import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { FIXTURE_MANIFEST_SHA256 } from "@wenshu/fixtures";
import { FONT_MANIFEST_SHA256 } from "@wenshu/fonts";

import { EnvironmentEvidenceError, parseMachineEvidence } from "../src/index.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const evidencePath = join(
  repositoryRoot,
  "artifacts",
  "reference-machine",
  "environment.json",
);

let parsed: unknown;
try {
  parsed = JSON.parse(await readFile(evidencePath, "utf8"));
} catch {
  throw new EnvironmentEvidenceError(
    "ENV_EVIDENCE_INVALID",
    "committed machine evidence cannot be read",
  );
}
const evidence = parseMachineEvidence(parsed);
if (
  evidence.frozen_inputs.fixture_manifest_sha256 !== FIXTURE_MANIFEST_SHA256 ||
  evidence.frozen_inputs.font_manifest_sha256 !== FONT_MANIFEST_SHA256
) {
  throw new EnvironmentEvidenceError(
    "ENV_EVIDENCE_INVALID",
    "committed machine evidence does not match the frozen input anchors",
  );
}
console.log(
  `Environment check passed: ${evidence.machine_label} evidence matches frozen anchors.`,
);
