import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { FIXTURE_MANIFEST_SHA256 } from "@wenshu/fixtures";
import { FONT_MANIFEST_SHA256 } from "@wenshu/fonts";

import { EnvironmentEvidenceError } from "./errors.ts";
import { parseMachineEvidence } from "./evidence.ts";
import type { MachineEvidence } from "./types.ts";

const EVIDENCE_FILE_PATTERN = /^environment(?:\.[a-z0-9-]+)?\.json$/u;

export async function checkCommittedEvidence(
  evidenceDirectory: string,
): Promise<readonly MachineEvidence[]> {
  let entries;
  try {
    entries = await readdir(evidenceDirectory, { withFileTypes: true });
  } catch {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "committed machine evidence directory cannot be read",
    );
  }
  const jsonFiles = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".json"),
  );
  if (
    jsonFiles.length !== entries.length ||
    jsonFiles.some((entry) => !EVIDENCE_FILE_PATTERN.test(entry.name))
  ) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "evidence directory contains unexpected entries",
    );
  }
  if (jsonFiles.length === 0) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "committed machine evidence is missing",
    );
  }
  const verified: MachineEvidence[] = [];
  for (const entry of jsonFiles.toSorted((left, right) =>
    left.name.localeCompare(right.name, "en"),
  )) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(join(evidenceDirectory, entry.name), "utf8"));
    } catch {
      throw new EnvironmentEvidenceError(
        "ENV_EVIDENCE_INVALID",
        "committed machine evidence cannot be parsed",
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
    verified.push(evidence);
  }
  const labels = verified.map((evidence) => evidence.machine_label);
  if (new Set(labels).size !== labels.length) {
    throw new EnvironmentEvidenceError(
      "ENV_EVIDENCE_INVALID",
      "machine labels must be unique across evidence files",
    );
  }
  return Object.freeze(verified);
}
