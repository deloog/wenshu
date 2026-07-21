import { EnvironmentEvidenceError } from "./errors.ts";

export const DEFAULT_MACHINE_LABEL = "wenshu-dev-primary";
export const DEFAULT_OUTPUT_FILE = "environment.json";

const MACHINE_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/u;
const OUTPUT_FILE_PATTERN = /^[a-z0-9][a-z0-9.-]*\.json$/u;

export interface RecordArguments {
  readonly machineLabel: string;
  readonly outputFile: string;
}

export function parseRecordArguments(argv: readonly string[]): RecordArguments {
  let machineLabel = DEFAULT_MACHINE_LABEL;
  let outputFile = DEFAULT_OUTPUT_FILE;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--label" && flag !== "--out") {
      throw new EnvironmentEvidenceError(
        "ENV_EVIDENCE_INVALID",
        "recorder arguments must be --label and/or --out",
      );
    }
    if (value === undefined || value.startsWith("--")) {
      throw new EnvironmentEvidenceError(
        "ENV_EVIDENCE_INVALID",
        "recorder flag is missing its value",
      );
    }
    if (flag === "--label") {
      if (!MACHINE_LABEL_PATTERN.test(value)) {
        throw new EnvironmentEvidenceError(
          "ENV_EVIDENCE_INVALID",
          "machine label does not match the evidence contract",
        );
      }
      machineLabel = value;
    } else {
      if (!OUTPUT_FILE_PATTERN.test(value)) {
        throw new EnvironmentEvidenceError(
          "ENV_EVIDENCE_INVALID",
          "output file must be a plain json file name",
        );
      }
      outputFile = value;
    }
    index += 1;
  }
  return Object.freeze({ machineLabel, outputFile });
}
