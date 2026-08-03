import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { FileBoundaryError } from "@wenshu/project-storage";

import { assertWithinTemp } from "../src/index.ts";

test("assertWithinTemp accepts targets inside the staging directory", () => {
  const temp = join(process.cwd(), "tmp-guard-root");
  assert.doesNotThrow(() => assertWithinTemp(temp, join(temp, "document.json")));
  assert.doesNotThrow(() =>
    assertWithinTemp(temp, join(temp, "assets", "ab12.png")),
  );
  assert.doesNotThrow(() =>
    assertWithinTemp(temp, join(temp, "materials", "cd34.md")),
  );
});

test("assertWithinTemp fails closed on escape, self and absolute targets", () => {
  const temp = join(process.cwd(), "tmp-guard-root");
  const escapes: string[] = [
    join(temp, "..", "original.md"),
    join(temp, "..", "..", "etc", "passwd"),
    temp,
  ];
  for (const target of escapes) {
    assert.throws(
      () => assertWithinTemp(temp, target),
      (error: unknown) =>
        error instanceof FileBoundaryError && error.code === "INTERNAL",
      `target must be rejected: ${target}`,
    );
  }
});
