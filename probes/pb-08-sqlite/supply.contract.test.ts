import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface LockPackage {
  readonly version?: string;
  readonly resolved?: string;
  readonly integrity?: string;
  readonly license?: string;
}

interface Lockfile {
  readonly lockfileVersion?: number;
  readonly packages?: Readonly<Record<string, LockPackage>>;
}

test("isolated candidate has a pinned Apache-2.0 source and integrity", async () => {
  const lock = JSON.parse(
    await readFile(new URL("./package-lock.json", import.meta.url), "utf8"),
  ) as Lockfile;
  const candidate = lock.packages?.["node_modules/@sqlite.org/sqlite-wasm"];
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(candidate?.version, "3.53.0-build1");
  assert.equal(candidate?.license, "Apache-2.0");
  assert.equal(
    candidate?.resolved,
    "https://registry.npmjs.org/@sqlite.org/sqlite-wasm/-/sqlite-wasm-3.53.0-build1.tgz",
  );
  assert.equal(
    candidate?.integrity,
    "sha512-PfWPWN2n+/37doa8oh2/oUXk4OOsRYZsxc1W1sDXIGb/Pu5Yrb+f2eyYpgQMGITVX7HVgxhs9P18Rc6I97ym/g==",
  );
});
