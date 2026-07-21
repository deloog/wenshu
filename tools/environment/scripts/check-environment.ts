import { join, resolve } from "node:path";

import { checkCommittedEvidence } from "../src/index.ts";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const verified = await checkCommittedEvidence(
  join(repositoryRoot, "artifacts", "reference-machine"),
);
console.log(
  `Environment check passed: ${verified.length} evidence file(s) ` +
    `(${verified.map((evidence) => evidence.machine_label).join(", ")}) ` +
    `match frozen anchors.`,
);
