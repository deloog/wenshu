import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, open, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  hostPayloadSchemaIdV03,
  validateHostContract,
  validateHostPayload,
  validateHostSession,
} from "@wenshu/host-contract";

import {
  createGrantTable,
  FileBoundaryError,
  readGrantedFile,
  type FileSelection,
} from "../src/index.ts";
import { createTestHost, nextRequestId, sha256, withIsolatedRoot } from "./helpers.ts";

const execFileAsync = promisify(execFile);

const IMPORT_OUTPUT_SCHEMA = hostPayloadSchemaIdV03("file.import.select", "output");

function importRequest(input: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocol_version: "0.3.0",
    kind: "request",
    request_id: nextRequestId(),
    capability: "file.import.select",
    capability_version: "0.3.0",
    input,
  };
}

function selected(...files: readonly string[]): () => Promise<FileSelection> {
  return () => Promise.resolve({ status: "selected", files });
}

function registryDeclaration(
  host: { readonly registry: unknown },
  name: string,
): Record<string, unknown> {
  const registry = host.registry as {
    capabilities: readonly Record<string, unknown>[];
  };
  const declaration = registry.capabilities.find((entry) => entry["name"] === name);
  assert.ok(declaration, `registry must declare ${name}`);
  return declaration;
}

async function assertRejectsWithCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof FileBoundaryError);
    assert.equal(error.code, code);
    return true;
  });
}

/**
 * Revoke read permission on a file. POSIX uses chmod; on Windows chmod cannot
 * revoke read access, so an explicit ACL deny entry is used instead (and
 * removed on restore).
 */
async function denyRead(target: string): Promise<() => Promise<void>> {
  if (process.platform === "win32") {
    // Everyone (S-1-1-0) because the effective token SID can differ from the
    // interactive username on sandboxed development machines.
    await execFileAsync("icacls", [target, "/deny", "*S-1-1-0:(R)"]);
    return async () => {
      await execFileAsync("icacls", [target, "/remove:d", "*S-1-1-0"]);
    };
  }
  await chmod(target, 0o000);
  return async () => {
    await chmod(target, 0o644);
  };
}

test("file.import.select returns handles that resolve, validate and stay pathless", async () => {
  await withIsolatedRoot("import-happy", async (root) => {
    const alpha = join(root, "alpha.md");
    const beta = join(root, "beta notes.md");
    await writeFile(alpha, "# Alpha\n");
    await writeFile(beta, "beta body");

    const grants = createGrantTable();
    const host = createTestHost(root, { grants, selectFiles: selected(alpha, beta) });

    const declaration = registryDeclaration(host, "file.import.select");
    assert.equal(declaration["capability_version"], "0.3.0");
    assert.equal(declaration["support_status"], "supported");
    assert.equal(
      declaration["input_schema"],
      "wenshu.host.input.file.import.select/0.3.0",
    );

    const response = (await host.invoke(
      importRequest({ purpose: "import_markdown", multiple: true, extensions: ["md"] }),
    )) as Record<string, unknown>;
    assert.equal(response["kind"], "success", JSON.stringify(response));
    assert.equal(response["protocol_version"], "0.3.0");
    assert.ok(validateHostContract(response).ok, "terminal must stay contract-valid");
    assert.ok(
      !JSON.stringify(response).includes(root),
      "output must never echo a system path (ADR-0029 1-a)",
    );

    const output = response["output"] as Record<string, unknown>;
    assert.equal(validateHostPayload(IMPORT_OUTPUT_SCHEMA, output).ok, true);
    const files = output["files"] as readonly Record<string, unknown>[];
    assert.equal(files.length, 2);
    assert.deepEqual(
      files.map((entry) => entry["file_name"]),
      ["alpha.md", "beta notes.md"],
    );
    assert.equal(files[0]?.["content_sha256"], sha256("# Alpha\n"));
    assert.equal(files[1]?.["size_bytes"], "beta body".length);

    const grantId = String(files[0]?.["grant_id"]);
    const grant = grants.resolveFile(grantId);
    assert.ok(grant, "grant must be resolvable in the shared table");
    assert.equal(grant.kind, "file");
    assert.equal(grant.filePath, alpha);

    assert.equal(validateHostSession(host.registry, host.transcript()).ok, true);
  });
});

test("dialog cancellation is a cancelled terminal, not a failure", async () => {
  await withIsolatedRoot("import-cancel", async (root) => {
    const grants = createGrantTable();
    const host = createTestHost(root, {
      grants,
      selectFiles: () => Promise.resolve({ status: "cancelled" }),
    });
    const response = (await host.invoke(importRequest())) as Record<string, unknown>;
    assert.equal(response["kind"], "cancelled");
    assert.equal(response["reason"], "user");
    assert.ok(validateHostContract(response).ok);
    assert.equal(validateHostSession(host.registry, host.transcript()).ok, true);
  });
});

test("declaring the capability without the shell dialog fails closed", async () => {
  await withIsolatedRoot("import-no-dialog", async (root) => {
    const host = createTestHost(root);
    const response = (await host.invoke(importRequest())) as Record<string, unknown>;
    assert.equal(response["kind"], "failure");
    assert.equal(
      (response["error"] as Record<string, unknown>)["code"],
      "HOST_INVALID_REQUEST",
    );
    assert.ok(validateHostContract(response).ok);
  });
});

test("unreadable selections fail with permission denied and echo no path", async (context) => {
  await withIsolatedRoot("import-denied", async (root) => {
    const secret = join(root, "secret.md");
    await writeFile(secret, "classified");
    const restore = await denyRead(secret);
    try {
      const host = createTestHost(root, { selectFiles: selected(secret) });
      const response = (await host.invoke(importRequest())) as Record<string, unknown>;
      if (response["kind"] === "success") {
        // Some Windows environments (sandboxed or privileged dev tokens)
        // bypass ACL deny entries: if the host itself can still read the file
        // the premise of this test is void. Probing the host behaviour (not a
        // racy one-shot readFile) keeps the POSIX path decisive.
        context.skip("environment bypasses ACL read denies");
        return;
      }
      assert.equal(response["kind"], "failure", JSON.stringify(response));
      assert.equal(
        (response["error"] as Record<string, unknown>)["code"],
        "HOST_PERMISSION_DENIED",
      );
      assert.ok(!JSON.stringify(response).includes(root), "no path echo");
      assert.ok(validateHostContract(response).ok);
    } finally {
      await restore();
    }
  });
});

test("non-file and oversized selections are rejected before any read", async () => {
  await withIsolatedRoot("import-invalid", async (root) => {
    const host = createTestHost(root, { selectFiles: selected(root) });
    const directoryResponse = (await host.invoke(importRequest())) as Record<
      string,
      unknown
    >;
    assert.equal(directoryResponse["kind"], "failure");
    assert.equal(
      (directoryResponse["error"] as Record<string, unknown>)["code"],
      "HOST_INVALID_REQUEST",
    );

    const oversized = join(root, "oversized.md");
    await writeFile(oversized, "");
    const handle = await open(oversized, "r+");
    try {
      await handle.truncate(256 * 1024 * 1024 + 1);
    } finally {
      await handle.close();
    }
    const bigHost = createTestHost(root, { selectFiles: selected(oversized) });
    const bigResponse = (await bigHost.invoke(importRequest())) as Record<
      string,
      unknown
    >;
    assert.equal(bigResponse["kind"], "failure");
    assert.equal(
      (bigResponse["error"] as Record<string, unknown>)["code"],
      "HOST_INVALID_REQUEST",
    );
  });
});

test("R-2: a file grant is one-shot — second use fails closed NOT_FOUND", async () => {
  await withIsolatedRoot("import-one-shot", async (root) => {
    const source = join(root, "once.md");
    await writeFile(source, "one shot content");
    const grants = createGrantTable();
    const host = createTestHost(root, { grants, selectFiles: selected(source) });

    const response = (await host.invoke(importRequest())) as Record<string, unknown>;
    assert.equal(response["kind"], "success");
    const files = (response["output"] as Record<string, unknown>)[
      "files"
    ] as readonly Record<string, unknown>[];
    const grantId = String(files[0]?.["grant_id"]);

    const bytes = await readGrantedFile(grants, grantId);
    assert.equal(Buffer.from(bytes).toString("utf8"), "one shot content");
    assert.equal(grants.resolveFile(grantId), undefined, "grant is consumed on read");
    await assertRejectsWithCode(() => readGrantedFile(grants, grantId), "NOT_FOUND");
  });
});

test("R-3: a file grant is pinned to exactly one file, never its directory", async () => {
  await withIsolatedRoot("import-pinned", async (root) => {
    const source = join(root, "source.md");
    const sibling = join(root, "sibling.md");
    await writeFile(source, "source body");
    await writeFile(sibling, "sibling body must stay unreachable");
    const grants = createGrantTable();
    const host = createTestHost(root, { grants, selectFiles: selected(source) });

    const response = (await host.invoke(importRequest({ multiple: true }))) as Record<
      string,
      unknown
    >;
    assert.equal(response["kind"], "success");
    const files = (response["output"] as Record<string, unknown>)[
      "files"
    ] as readonly Record<string, unknown>[];
    assert.equal(files.length, 1, "one selected file means exactly one grant");
    const grantId = String(files[0]?.["grant_id"]);

    // There is structurally no directory derivation: the grant only ever
    // resolves to the pinned path, and reading it yields the source bytes.
    const grant = grants.resolveFile(grantId);
    assert.equal(grant?.filePath, source);
    const bytes = await readGrantedFile(grants, grantId);
    assert.equal(Buffer.from(bytes).toString("utf8"), "source body");
  });
});

test("post-selection content drift fails closed with integrity failure", async () => {
  await withIsolatedRoot("import-drift", async (root) => {
    const source = join(root, "drifting.md");
    await writeFile(source, "selected body");
    const grants = createGrantTable();
    const host = createTestHost(root, { grants, selectFiles: selected(source) });

    const response = (await host.invoke(importRequest())) as Record<string, unknown>;
    assert.equal(response["kind"], "success");
    const files = (response["output"] as Record<string, unknown>)[
      "files"
    ] as readonly Record<string, unknown>[];
    const grantId = String(files[0]?.["grant_id"]);

    await writeFile(source, "rewritten after the selection snapshot");
    await assertRejectsWithCode(
      () => readGrantedFile(grants, grantId),
      "INTEGRITY_FAILURE",
    );
    // The grant is consumed even when integrity fails (one-shot semantics).
    await assertRejectsWithCode(() => readGrantedFile(grants, grantId), "NOT_FOUND");
  });
});

test("unknown or foreign grant ids fail closed NOT_FOUND", async () => {
  const grants = createGrantTable();
  await assertRejectsWithCode(
    () => readGrantedFile(grants, "grant_00000000000000000000000000000000"),
    "NOT_FOUND",
  );
});
