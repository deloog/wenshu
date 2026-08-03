import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { importMarkdownProject } from "../src/index.ts";
import {
  expectBoundaryError,
  makeHarness,
  sha256,
  SOURCE_TEXT,
} from "./project-import-helpers.ts";

test("existing target directory is rejected CONFLICT (D2: no merge, no rename)", async () => {
  const harness = await makeHarness();
  try {
    await mkdir(join(harness.grantRoot, "taken"), { recursive: true });
    const sourceHashBefore = sha256(new Uint8Array(await readFile(harness.sourcePath)));
    await expectBoundaryError(
      () =>
        importMarkdownProject({
          grants: harness.grants,
          projectGrantId: harness.projectGrantId,
          targetDirName: "taken",
          sourceGrantId: harness.sourceGrantId,
          assetGrantIds: harness.assetGrantIds,
        }),
      "CONFLICT",
    );
    // 源 handle 未被消费（冲突判定在读之前），原件哈希不变。
    assert.ok(harness.grants.resolveFile(harness.sourceGrantId) !== undefined);
    assert.equal(
      sha256(new Uint8Array(await readFile(harness.sourcePath))),
      sourceHashBefore,
    );
  } finally {
    await harness.cleanup();
  }
});

test("read-only project grant is rejected PERMISSION_DENIED before any write", async () => {
  const harness = await makeHarness({ mode: "read_only" });
  try {
    const sourceHashBefore = sha256(new Uint8Array(await readFile(harness.sourcePath)));
    await expectBoundaryError(
      () =>
        importMarkdownProject({
          grants: harness.grants,
          projectGrantId: harness.projectGrantId,
          targetDirName: "denied",
          sourceGrantId: harness.sourceGrantId,
          assetGrantIds: harness.assetGrantIds,
        }),
      "PERMISSION_DENIED",
    );
    assert.deepEqual(await readdir(harness.grantRoot), []);
    assert.equal(
      sha256(new Uint8Array(await readFile(harness.sourcePath))),
      sourceHashBefore,
    );
  } finally {
    await harness.cleanup();
  }
});

test("unknown project grant id is rejected NOT_FOUND", async () => {
  const harness = await makeHarness();
  try {
    await expectBoundaryError(
      () =>
        importMarkdownProject({
          grants: harness.grants,
          projectGrantId: "grant_does_not_exist",
          targetDirName: "x",
          sourceGrantId: harness.sourceGrantId,
        }),
      "NOT_FOUND",
    );
  } finally {
    await harness.cleanup();
  }
});

test("unsafe target directory names are rejected INVALID", async () => {
  const harness = await makeHarness();
  try {
    for (const name of ["CON", "..", "a/b", "trail.", ""]) {
      await expectBoundaryError(
        () =>
          importMarkdownProject({
            grants: harness.grants,
            projectGrantId: harness.projectGrantId,
            targetDirName: name,
            sourceGrantId: harness.sourceGrantId,
          }),
        "INVALID",
      );
    }
    assert.deepEqual(await readdir(harness.grantRoot), []);
  } finally {
    await harness.cleanup();
  }
});

test("pre-aborted signal returns cancelled without touching the filesystem", async () => {
  const harness = await makeHarness();
  try {
    const result = await importMarkdownProject({
      grants: harness.grants,
      projectGrantId: harness.projectGrantId,
      targetDirName: "cancelled-early",
      sourceGrantId: harness.sourceGrantId,
      assetGrantIds: harness.assetGrantIds,
      signal: AbortSignal.abort(),
    });
    assert.equal(result.status, "cancelled");
    assert.deepEqual(await readdir(harness.grantRoot), []);
    // handle 未被消费。
    assert.ok(harness.grants.resolveFile(harness.sourceGrantId) !== undefined);
  } finally {
    await harness.cleanup();
  }
});

test("cancellation mid-read cleans staging and leaves the original untouched", async () => {
  const harness = await makeHarness();
  try {
    const sourceHashBefore = sha256(new Uint8Array(await readFile(harness.sourcePath)));
    const controller = new AbortController();
    const result = await importMarkdownProject({
      grants: harness.grants,
      projectGrantId: harness.projectGrantId,
      targetDirName: "cancelled-read",
      sourceGrantId: harness.sourceGrantId,
      assetGrantIds: harness.assetGrantIds,
      signal: controller.signal,
      onProgress: (entry) => {
        if (entry.phase === "read" && entry.completed === 1) {
          controller.abort();
        }
      },
    });
    assert.equal(result.status, "cancelled");
    assert.deepEqual(await readdir(harness.grantRoot), []);
    assert.equal(
      sha256(new Uint8Array(await readFile(harness.sourcePath))),
      sourceHashBefore,
    );
  } finally {
    await harness.cleanup();
  }
});

test("cancellation during write cleans staging and leaves the original untouched", async () => {
  const harness = await makeHarness();
  try {
    const sourceHashBefore = sha256(new Uint8Array(await readFile(harness.sourcePath)));
    const controller = new AbortController();
    const result = await importMarkdownProject({
      grants: harness.grants,
      projectGrantId: harness.projectGrantId,
      targetDirName: "cancelled-write",
      sourceGrantId: harness.sourceGrantId,
      assetGrantIds: harness.assetGrantIds,
      signal: controller.signal,
      onProgress: (entry) => {
        if (entry.phase === "write" && entry.completed === 1) {
          controller.abort();
        }
      },
    });
    assert.equal(result.status, "cancelled");
    assert.deepEqual(await readdir(harness.grantRoot), []);
    assert.equal(
      sha256(new Uint8Array(await readFile(harness.sourcePath))),
      sourceHashBefore,
    );
  } finally {
    await harness.cleanup();
  }
});

test("source rewritten after selection fails closed INTEGRITY_FAILURE with cleanup", async () => {
  const harness = await makeHarness();
  try {
    // 选择（registerFile 快照）之后改写源文件。
    const tampered = new TextEncoder().encode(`${SOURCE_TEXT}\n追加。`);
    await writeFile(harness.sourcePath, tampered);
    await expectBoundaryError(
      () =>
        importMarkdownProject({
          grants: harness.grants,
          projectGrantId: harness.projectGrantId,
          targetDirName: "integrity",
          sourceGrantId: harness.sourceGrantId,
          assetGrantIds: harness.assetGrantIds,
        }),
      "INTEGRITY_FAILURE",
    );
    // 暂存目录已清理，目标从未出现。
    assert.deepEqual(await readdir(harness.grantRoot), []);
  } finally {
    await harness.cleanup();
  }
});
