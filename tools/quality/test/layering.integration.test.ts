import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkLayering } from "../src/index.ts";
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
