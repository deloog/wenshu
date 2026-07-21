import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { collectMachineEvidence, parseRecordArguments } from "../src/index.ts";

const { machineLabel, outputFile } = parseRecordArguments(process.argv.slice(2));

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const evidenceDirectory = join(repositoryRoot, "artifacts", "reference-machine");
const evidence = await collectMachineEvidence(repositoryRoot, machineLabel);
await mkdir(evidenceDirectory, { recursive: true });
await writeFile(
  join(evidenceDirectory, outputFile),
  `${JSON.stringify(evidence, null, 2)}\n`,
  "utf8",
);
console.log(
  `Environment evidence recorded: ${machineLabel} -> ${outputFile} ` +
    `(${evidence.os.platform} ${evidence.os.release}, ` +
    `${evidence.cpu.logical_cores} cores, ${evidence.display.scale_percent}% scale).`,
);
