import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { validateHostSession } from "@wenshu/host-contract";

import {
  atomicWriteFile,
  recoverGrantDirectory,
  resolveGrantFile,
  TEMP_FILE_PREFIX,
} from "../src/index.ts";
import {
  createTestHost,
  nextRequestId,
  saveRequest,
  selectGrant,
  sha256,
  withIsolatedRoot,
} from "./helpers.ts";

test("atomic write round-trips bytes and cleans no residue", async () => {
  await withIsolatedRoot("atomic", async (root) => {
    const content = "PB-10 atomic payload · 中文内容 · ".repeat(1000);
    const bytes = Buffer.from(content, "utf8");
    const phases: string[] = [];
    const result = await atomicWriteFile(join(root, "artifact.bin"), bytes, {
      onPhase: (phase) => phases.push(phase),
    });
    assert.deepEqual(await readFile(join(root, "artifact.bin")), bytes);
    assert.ok(phases.includes("data-fsynced"));
    assert.ok(phases.includes("renamed"));
    if (process.platform === "win32") {
      assert.equal(result.directoryFsync, "unsupported_platform");
      assert.ok(phases.includes("dir-fsync-unsupported"));
    } else {
      assert.equal(result.directoryFsync, "performed");
      assert.ok(phases.includes("dir-fsynced"));
    }
    const residue = (await readdir(root)).filter((entry) =>
      entry.startsWith(TEMP_FILE_PREFIX),
    );
    assert.deepEqual(residue, []);
  });
});

test("resolveGrantFile structurally refuses escapes", async () => {
  await withIsolatedRoot("escape", async (root) => {
    for (const bad of [
      "../x.md",
      "a/b.md",
      "a\\b.md",
      ".hidden.md",
      "name with space.md",
      "..md",
      "",
    ]) {
      assert.throws(() => resolveGrantFile(root, bad), /INVALID/u, bad);
    }
    assert.equal(
      resolveGrantFile(root, "report.final-2.md"),
      join(root, "report.final-2.md"),
    );
  });
});

test("recovery removes temp residue and never completes it", async () => {
  await withIsolatedRoot("residue", async (root) => {
    await writeFile(join(root, `${TEMP_FILE_PREFIX}deadbeef`), "partial");
    await writeFile(join(root, "artifact.bin"), "complete");
    const result = await recoverGrantDirectory(root);
    assert.equal(result.removedResidue, 1);
    assert.deepEqual(await readFile(join(root, "artifact.bin"), "utf8"), "complete");
    assert.deepEqual(await readdir(root), ["artifact.bin"]);
  });
});

test("save.atomic overwrites only with the correct previous hash", async () => {
  await withIsolatedRoot("save", async (root) => {
    const host = createTestHost(root);
    const grant = await selectGrant(host);

    const first = (await host.invoke(
      saveRequest(String(grant["grant_id"]), "report.md", "v1-content", null),
    )) as Record<string, unknown>;
    assert.equal(first["kind"], "success");

    const stale = (await host.invoke(
      saveRequest(String(grant["grant_id"]), "report.md", "v2-content", null),
    )) as Record<string, unknown>;
    assert.equal(stale["kind"], "failure");
    assert.equal(
      (stale["error"] as Record<string, unknown>)["code"],
      "HOST_CONFLICT",
      "create-only expectation must fail once the file exists",
    );

    const correct = (await host.invoke(
      saveRequest(
        String(grant["grant_id"]),
        "report.md",
        "v2-content",
        sha256("v1-content"),
      ),
    )) as Record<string, unknown>;
    assert.equal(correct["kind"], "success");
    assert.deepEqual(await readFile(join(root, "report.md"), "utf8"), "v2-content");

    assert.equal(validateHostSession(host.registry, host.transcript()).ok, true);
  });
});

test("last good artifact survives failed and conflicting saves byte for byte", async () => {
  await withIsolatedRoot("lastgood", async (root) => {
    const host = createTestHost(root);
    const grant = await selectGrant(host);
    const grantId = String(grant["grant_id"]);

    const good = "last-good-artifact-bytes";
    const first = (await host.invoke(
      saveRequest(grantId, "artifact.bin", good, null),
    )) as Record<string, unknown>;
    assert.equal(first["kind"], "success");
    const goodHash = sha256(await readFile(join(root, "artifact.bin")));

    const tampered = saveRequest(grantId, "artifact.bin", "replacement", sha256(good));
    (tampered["input"] as Record<string, unknown>)["content_sha256"] = sha256("other");
    const integrity = (await host.invoke(tampered)) as Record<string, unknown>;
    assert.equal(integrity["kind"], "failure");
    assert.equal(
      (integrity["error"] as Record<string, unknown>)["code"],
      "HOST_INTEGRITY_FAILURE",
    );
    assert.equal(
      sha256(await readFile(join(root, "artifact.bin"))),
      goodHash,
      "integrity failure must leave the last good artifact untouched",
    );

    const conflict = (await host.invoke(
      saveRequest(grantId, "artifact.bin", "replacement", sha256("wrong")),
    )) as Record<string, unknown>;
    assert.equal(conflict["kind"], "failure");
    assert.equal(
      (conflict["error"] as Record<string, unknown>)["code"],
      "HOST_CONFLICT",
    );
    assert.equal(sha256(await readFile(join(root, "artifact.bin"))), goodHash);

    const saveAs = (await host.invoke({
      protocol_version: "0.2.0",
      kind: "request",
      request_id: nextRequestId(),
      capability: "project.save.as",
      capability_version: "0.2.0",
      input: {
        grant_id: grantId,
        file_name: "artifact.bin",
        content_base64: Buffer.from("replacement").toString("base64"),
        content_sha256: sha256("replacement"),
      },
    })) as Record<string, unknown>;
    assert.equal(saveAs["kind"], "failure");
    assert.equal((saveAs["error"] as Record<string, unknown>)["code"], "HOST_CONFLICT");
    assert.equal(sha256(await readFile(join(root, "artifact.bin"))), goodHash);

    const residue = (await readdir(root)).filter((entry) =>
      entry.startsWith(TEMP_FILE_PREFIX),
    );
    assert.deepEqual(residue, [], "failed saves must not leave temp residue");
  });
});
