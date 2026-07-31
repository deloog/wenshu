import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const evidence = JSON.parse(
  await readFile(
    new globalThis.URL(
      "../../../test-results/pa-14e-electron/evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const security = evidence.rendererSecurity;

assert.deepEqual(security.exposedKeys, ["cancel", "invoke", "registry"]);
assert.equal(security.requireType, "undefined");
assert.equal(security.processType, "undefined");
assert.equal(security.actualPreferences.contextIsolation, true);
assert.equal(security.actualPreferences.sandbox, true);
assert.equal(security.actualPreferences.nodeIntegration, false);
assert.deepEqual(evidence.hostSession, {
  terminalKind: "success",
  capability: "print.pdf.export",
});
