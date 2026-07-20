import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  collectDependencyLocations,
  discoverInstalledPackageDirectories,
  forbiddenLicenseReason,
} from "../src/licenses.ts";
import { scanTextForSecrets, scanTrackedFiles } from "../src/secrets.ts";

test("secret signatures reject credentials without matching documentation examples", () => {
  const privateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
  assert.deepEqual(scanTextForSecrets(privateKeyHeader), ["private key"]);
  assert.deepEqual(scanTextForSecrets(`token=ghp_${"a".repeat(36)}`), ["GitHub token"]);
  assert.deepEqual(scanTextForSecrets("sk-live-abc and gho_*** are examples"), []);
});

test("secret scanning inspects NUL-bearing tracked files", async () => {
  const root = join("test-results", "g1-11-ci", "nul-secret");
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const filePath = "binary.dat";
  const accessKey = ["AKIA", "A".repeat(16)].join("");
  await writeFile(
    join(root, filePath),
    Buffer.concat([Buffer.from(accessKey, "ascii"), Buffer.from([0])]),
  );
  assert.deepEqual(await scanTrackedFiles(root, [filePath]), [
    { filePath, reason: "AWS access key" },
  ]);
  await rm(root, { recursive: true, force: true });
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

test("license discovery rejects an empty pnpm virtual store", async () => {
  const root = join("test-results", "g1-11-ci", "empty-license-store");
  await rm(root, { recursive: true, force: true });
  await mkdir(join(root, "node_modules", ".pnpm"), { recursive: true });
  await assert.rejects(
    discoverInstalledPackageDirectories(root),
    /contains no installed packages/u,
  );
  await rm(root, { recursive: true, force: true });
});

test("license scanning rejects copyleft blockers and deduplicates package paths", () => {
  assert.match(forbiddenLicenseReason("AGPL-3.0-only") ?? "", /not approved/u);
  assert.match(forbiddenLicenseReason("GPL-2.0-or-later") ?? "", /not approved/u);
  assert.match(
    forbiddenLicenseReason("SEE LICENSE IN LICENSE.txt") ?? "",
    /unrecognized/u,
  );
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
