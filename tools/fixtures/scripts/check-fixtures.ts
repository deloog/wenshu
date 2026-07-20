import { resolve } from "node:path";

import { verifyFixtureSet } from "../src/index.ts";

const fixtureRoot = resolve(import.meta.dirname, "../../../docs/poc-a/fixtures");
const verified = await verifyFixtureSet(fixtureRoot);
process.stdout.write(
  `Fixture check passed: ${verified.manifest.entries.length} frozen files.\n`,
);
