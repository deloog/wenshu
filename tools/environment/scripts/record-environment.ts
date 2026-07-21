import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { collectMachineEvidence } from "../src/index.ts";

const MACHINE_LABEL = "wenshu-dev-primary";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const evidenceDirectory = join(repositoryRoot, "artifacts", "reference-machine");
const evidence = await collectMachineEvidence(repositoryRoot, MACHINE_LABEL);
await mkdir(evidenceDirectory, { recursive: true });
await writeFile(
  join(evidenceDirectory, "environment.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
  "utf8",
);
console.log(
  `Environment evidence recorded: ${MACHINE_LABEL} ` +
    `(${evidence.os.platform} ${evidence.os.release}, ` +
    `${evidence.cpu.logical_cores} cores, ${evidence.display.scale_percent}% scale).`,
);
