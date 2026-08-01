import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkLayering } from "../src/index.ts";
import { platformViolation } from "../src/layering-platform.ts";
import { LAYERED_WORKSPACES } from "../src/layering-registry.ts";

async function fixtureRoot(): Promise<{
  readonly root: string;
  readonly files: readonly string[];
}> {
  const root = await mkdtemp(join(tmpdir(), "wenshu-layering-"));
  const files: string[] = [];
  for (const workspace of LAYERED_WORKSPACES) {
    const manifest = join(root, workspace.directory, "package.json");
    await mkdir(dirname(manifest), { recursive: true });
    await writeFile(
      manifest,
      JSON.stringify({ name: `@wenshu/${workspace.directory.split("/").at(-1)}` }),
    );
    files.push(manifest);
  }
  return { root, files };
}

test("layering checks real files for node, CJS, platform, and relative escapes", async () => {
  const fixture = await fixtureRoot();
  try {
    const cases = [
      [
        "packages/config/src/node.ts",
        'import "node:crypto";',
        "NODE_BUILTIN_FORBIDDEN",
      ],
      [
        "packages/semantic-editor/src/electron.cjs",
        'require("electron");',
        "ELECTRON_FORBIDDEN",
      ],
      [
        "packages/semantic-tools/src/ohos.ts",
        'import "@ohos/hypium";',
        "ARKTS_FORBIDDEN",
      ],
      [
        "packages/config/src/escape.ts",
        'import "../../report-render/src/index.ts";',
        "LAYER_DIRECTION_FORBIDDEN",
      ],
      [
        "packages/config/src/unregistered.ts",
        'import "../../../probes/pb-08-sqlite/chromium-tabs.ts";',
        "UNREGISTERED_PATH_TARGET",
      ],
      [
        "packages/semantic-editor/test/electron.cjs",
        'require("electron");',
        "ELECTRON_FORBIDDEN",
      ],
    ] as const;
    for (const [path, source, expected] of cases) {
      const file = join(fixture.root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, source);
      const result = await checkLayering(fixture.root, [...fixture.files, file]);
      assert.ok(result.findings.some((finding) => finding.message.includes(expected)));
      await rm(file);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("layering allows node builtins in auxiliary test and script files", async () => {
  const fixture = await fixtureRoot();
  try {
    const files = [
      ["packages/config/test/node.test.ts", 'import "node:test";'],
      ["packages/config/scripts/generate.ts", 'import "node:fs";'],
    ] as const;
    const created: string[] = [];
    for (const [path, source] of files) {
      const file = join(fixture.root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, source);
      created.push(file);
    }
    const result = await checkLayering(fixture.root, [...fixture.files, ...created]);
    assert.equal(result.findings.length, 0);
    assert.equal(result.coverage.auxiliaryFiles, 2);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("each L3 shell accepts only its registered platform namespace", async () => {
  const fixture = await fixtureRoot();
  try {
    const cases = [
      ["apps/electron-shell/src/own.cjs", 'require("electron");', undefined],
      [
        "apps/arkweb-shell/src/foreign-electron.ts",
        'import "electron";',
        "ELECTRON_FORBIDDEN",
      ],
      [
        "apps/electron-shell/src/foreign-ark.ts",
        'import "@ohos.web.webview";',
        "ARKTS_FORBIDDEN",
      ],
      ["apps/arkweb-shell/src/own-ark.ts", 'import "@ohos.web.webview";', undefined],
    ] as const;
    for (const [path, source, expected] of cases) {
      const file = join(fixture.root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, source);
      const result = await checkLayering(fixture.root, [...fixture.files, file]);
      if (expected === undefined) {
        assert.equal(result.findings.length, 0);
      } else {
        assert.ok(
          result.findings.some((finding) => finding.message.includes(expected)),
        );
      }
      await rm(file);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("an L3 shell without a namespace registration fails closed", () => {
  const unregisteredShell = { layer: "L3" as const, platformNamespaces: [] };
  assert.equal(
    platformViolation(unregisteredShell, "electron", true),
    "ELECTRON_FORBIDDEN",
  );
  assert.equal(
    platformViolation(unregisteredShell, "@ohos.web.webview", true),
    "ARKTS_FORBIDDEN",
  );
});

test("package-root config files use the auxiliary rule set (G2-03 MI-03 / ADR-0028 D4)", async () => {
  const fixture = await fixtureRoot();
  try {
    // Positive: node builtins are allowed in root config files, and the files
    // now count as auxiliary instead of silently skipping as unclassified.
    const allowed = [
      ["apps/web/vite.config.ts", 'import "node:path";'],
      ["apps/arkweb-shell/hvigorfile.ts", 'import "node:fs";'],
      ["apps/arkweb-shell/entry/hvigorfile.ts", 'import "node:os";'],
    ] as const;
    const created: string[] = [];
    for (const [path, source] of allowed) {
      const file = join(fixture.root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, source);
      created.push(file);
    }
    const positive = await checkLayering(fixture.root, [...fixture.files, ...created]);
    assert.equal(positive.findings.length, 0);
    assert.equal(positive.coverage.auxiliaryFiles, 3);
    assert.equal(positive.coverage.unclassifiedFiles, 0);

    // Counter-examples: the auxiliary rule set still blocks platform
    // namespaces and L3 targets from a web-layer config file.
    const violations = [
      ["apps/web/vite.config.ts", 'import "electron";', "ELECTRON_FORBIDDEN"],
      [
        "apps/web/vite.config.ts",
        'import "@wenshu/electron-shell";',
        "LAYER_DIRECTION_FORBIDDEN",
      ],
      ["apps/web/vite.config.ts", 'import "@ohos.web.webview";', "ARKTS_FORBIDDEN"],
    ] as const;
    for (const [path, source, expected] of violations) {
      const file = join(fixture.root, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, source);
      const result = await checkLayering(fixture.root, [...fixture.files, file]);
      assert.ok(
        result.findings.some((finding) => finding.message.includes(expected)),
        `${path} should report ${expected}`,
      );
      await rm(file);
    }
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
