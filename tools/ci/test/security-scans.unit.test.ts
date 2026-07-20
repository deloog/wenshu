import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  collectDependencyLocations,
  discoverInstalledPackageDirectories,
  forbiddenLicenseReason,
} from "../src/licenses.ts";
import { scanTextForSecrets } from "../src/secrets.ts";

test("secret signatures reject credentials without matching documentation examples", () => {
  const privateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  assert.deepEqual(scanTextForSecrets(privateKeyHeader), ["private key"]);
  assert.deepEqual(scanTextForSecrets(`token=ghp_${"a".repeat(36)}`), ["GitHub token"]);
  assert.deepEqual(scanTextForSecrets("sk-live-abc and gho_*** are examples"), []);
});

test("license discovery finds scoped and unscoped packages in the pnpm store", async () => {
  const root = join("test-results", "g1-11-ci", "license-discovery");
  await rm(root, { recursive: true, force: true });
  const nested = join(root, "node_modules", ".pnpm", "entry", "node_modules");
  const packagePaths = [join(nested, "plain"), join(nested, "@scope", "scoped")];
  for (const packagePath of packagePaths) {
    await mkdir(packagePath, { recursive: true });
    await writeFile(join(packagePath, "package.json"), "{}", "utf8");
  }
  assert.deepEqual(
    await discoverInstalledPackageDirectories(root),
    packagePaths.sort(),
  );
  await rm(root, { recursive: true, force: true });
});

test("license scanning rejects copyleft blockers and deduplicates package paths", () => {
  assert.match(forbiddenLicenseReason("AGPL-3.0-only") ?? "", /not approved/u);
  assert.match(forbiddenLicenseReason("GPL-2.0-or-later") ?? "", /not approved/u);
  assert.equal(forbiddenLicenseReason("MIT"), undefined);
  const locations = collectDependencyLocations([
    {
      dependencies: {
        first: { name: "one", version: "1.0.0", path: "D:/store/one" },
        duplicate: { name: "one", version: "1.0.0", path: "D:/store/one" },
      },
    },
  ]);
  assert.deepEqual(locations, [
    { name: "one", version: "1.0.0", path: "D:/store/one" },
  ]);
});
