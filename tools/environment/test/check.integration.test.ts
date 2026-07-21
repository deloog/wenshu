import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  EnvironmentEvidenceError,
  checkCommittedEvidence,
  parseMachineEvidence,
} from "../src/index.ts";

const committedDirectory = resolve(
  import.meta.dirname,
  "../../../artifacts/reference-machine",
);

async function expectInvalid(directory: string): Promise<void> {
  await assert.rejects(
    () => checkCommittedEvidence(directory),
    (error: unknown) =>
      error instanceof EnvironmentEvidenceError &&
      error.code === "ENV_EVIDENCE_INVALID",
  );
}

test("every committed evidence file is validated, not just the first", async () => {
  const verified = await checkCommittedEvidence(committedDirectory);
  assert.ok(verified.length >= 1);
  assert.equal(verified[0]?.machine_label, "wenshu-dev-primary");

  const root = await mkdtemp(join(tmpdir(), "wenshu-env-check-"));
  const directory = join(root, "evidence");
  try {
    await mkdir(directory, { recursive: true });
    await cp(committedDirectory, directory, { recursive: true });

    // A second valid evidence file (different label) is accepted.
    const first = parseMachineEvidence(
      JSON.parse(await readFile(join(directory, "environment.json"), "utf8")),
    );
    const second = {
      ...first,
      machine_label: "wenshu-poc-a-win11",
    };
    await writeFile(
      join(directory, "environment.win11.json"),
      `${JSON.stringify(second, null, 2)}\n`,
    );
    const both = await checkCommittedEvidence(directory);
    assert.equal(both.length, 2);

    // Tampering with the second file only is still detected.
    const tampered = {
      ...second,
      frozen_inputs: {
        ...second.frozen_inputs,
        font_manifest_sha256: "0".repeat(64),
      },
    };
    await writeFile(
      join(directory, "environment.win11.json"),
      `${JSON.stringify(tampered, null, 2)}\n`,
    );
    await expectInvalid(directory);

    // Duplicate labels across files are rejected.
    await writeFile(
      join(directory, "environment.win11.json"),
      `${JSON.stringify({ ...second, machine_label: first.machine_label }, null, 2)}\n`,
    );
    await expectInvalid(directory);

    // Unexpected entries (unknown json, non-json file, subdirectory) fail closed.
    await writeFile(
      join(directory, "environment.win11.json"),
      `${JSON.stringify(second, null, 2)}\n`,
    );
    await writeFile(join(directory, "other.json"), "{}");
    await expectInvalid(directory);
    await rm(join(directory, "other.json"));
    await mkdir(join(directory, "subdir"));
    await expectInvalid(directory);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
