import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type PreparedTestIsolation,
  withPreparedTestIsolationOperation,
} from "./isolation.ts";
import { assertSafeTestIdentifier } from "./identifiers.ts";
import type { TestLayer } from "./layers.ts";

export interface FailureEvidence {
  readonly caseId: string;
  readonly layer: TestLayer;
  readonly seed: string;
  readonly errorName: string;
  readonly errorMessage: string;
  readonly stack?: string;
}

export interface FailureEvidencePaths {
  readonly manifestPath: string;
  readonly logPath: string;
}

export async function writeFailureEvidence(
  isolation: PreparedTestIsolation,
  evidence: FailureEvidence,
): Promise<FailureEvidencePaths> {
  return withPreparedTestIsolationOperation(isolation, async () => {
    assertSafeTestIdentifier("caseId", evidence.caseId, 96);
    if (evidence.layer !== isolation.layer) {
      throw new Error("failure evidence layer does not match worker isolation");
    }
    const caseDirectory = join(isolation.evidenceDirectory, evidence.caseId);
    const evidenceStats = await lstat(isolation.evidenceDirectory);
    if (!evidenceStats.isDirectory() || evidenceStats.isSymbolicLink()) {
      throw new Error("evidence directory must be a prepared real directory");
    }
    await mkdir(caseDirectory);

    const manifestPath = join(caseDirectory, "failure.json");
    const logPath = join(caseDirectory, "diagnostic.log");
    const manifest = {
      schema_version: "0.1.0",
      case_id: evidence.caseId,
      layer: evidence.layer,
      seed: evidence.seed,
      error_name: evidence.errorName,
      error_message: evidence.errorMessage,
    };
    const log = [evidence.errorName, evidence.errorMessage, evidence.stack]
      .filter((value): value is string => value !== undefined)
      .join("\n");

    await Promise.all([
      writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      }),
      writeFile(logPath, `${log}\n`, { encoding: "utf8", flag: "wx" }),
    ]);
    return Object.freeze({ manifestPath, logPath });
  });
}
