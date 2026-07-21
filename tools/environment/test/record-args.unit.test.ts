import assert from "node:assert/strict";
import test from "node:test";

import { EnvironmentEvidenceError, parseRecordArguments } from "../src/index.ts";

test("recorder defaults to the audited win10 baseline target", () => {
  assert.deepEqual(parseRecordArguments([]), {
    machineLabel: "wenshu-dev-primary",
    outputFile: "environment.json",
  });
});

test("recorder accepts an explicit label and output file", () => {
  assert.deepEqual(
    parseRecordArguments([
      "--label",
      "wenshu-poc-a-win11",
      "--out",
      "environment.win11.json",
    ]),
    { machineLabel: "wenshu-poc-a-win11", outputFile: "environment.win11.json" },
  );
});

test("recorder rejects unknown flags, missing values, and unsafe targets", () => {
  const invalid = [
    ["--nope"],
    ["--label"],
    ["--label", "--out"],
    ["--label", "Wenshu Win11"],
    ["--label", "x"],
    ["--out", "../escape.json"],
    ["--out", "sub/dir.json"],
    ["--out", "environment.txt"],
  ];
  for (const argv of invalid) {
    assert.throws(
      () => parseRecordArguments(argv),
      (error: unknown) =>
        error instanceof EnvironmentEvidenceError &&
        error.code === "ENV_EVIDENCE_INVALID",
    );
  }
});
