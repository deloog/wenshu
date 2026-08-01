import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createFileHost,
  createGrantTable,
  isImportedOriginal,
} from "@wenshu/project-storage";

import {
  exportKnowledgePackage,
  importKnowledgePackage,
  KnowledgePackageError,
  sha256,
  type ExportedKnowledgePackage,
} from "../src/index.ts";
import { createZip, MAX_ENTRY_UNCOMPRESSED_BYTES, readZip } from "../src/zip.ts";
import { canonicalJsonBytes } from "../src/serialization.ts";

// --- shared fixture builders (mirrors package.integration.test.ts) ---------

const hex32 = (prefix: string, seed: string): string =>
  `${prefix}${seed.replaceAll("-", "")}`;
const SEED = "00000000000000000000000000000001";

function makeDocument() {
  return {
    schemaVersion: "0.2.0",
    documentId: hex32("doc_", SEED),
    revision: 0,
    title: "边界测试文档",
    language: "zh-CN",
    blocks: [
      { id: hex32("node_", SEED), type: "paragraph", text: "边界与对抗测试段落。" },
    ],
    assets: [],
  };
}

function makeTemplate() {
  return {
    dsl_version: "0.1.0",
    template_id: "wenshu.minimal",
    version: "1.0.0",
    supported_document_schema: "wenshu.report/0.1.0",
    required_sections: ["body"],
    page: {
      size: "A4",
      orientation: "portrait",
      margin_mm: { top: 20, right: 18, bottom: 20, left: 18 },
    },
    fonts: {
      primary: "Source Han Sans CN",
      version: "2.005R",
      weights: [400],
      fallback_policy: "fail_before_export",
    },
    layout_tokens: {
      body_font_pt: 11,
      body_line_height: 1.55,
      paragraph_spacing_pt: 6,
      h1_font_pt: 22,
      h2_font_pt: 16,
      h3_font_pt: 13,
      caption_font_pt: 9,
      table_font_pt: 9.5,
      primary_color: "#17324D",
      accent_color: "#2E6F95",
      text_color: "#1F2933",
      muted_color: "#66737F",
    },
    pagination_rules: {
      cover_own_page: true,
      toc_start_new_page: true,
      h1_start_new_page: true,
      heading_keep_with_next_lines: 2,
      widows: 2,
      orphans: 2,
      table_repeat_header: true,
      table_row_break_inside: "avoid",
      figure_keep_with_caption: true,
      max_consecutive_sparse_pages: 1,
    },
    validators: ["pdf_parseable"],
    export_profile: {
      format: "pdf",
      print_background: true,
      browser_header_footer: false,
      prefer_css_page_size: true,
      embed_fonts_when_supported: true,
    },
    migration_rules: [],
  };
}

function buildPackage(): ExportedKnowledgePackage {
  const materialBytes = new TextEncoder().encode("# 边界材料\n内容。");
  const document = makeDocument();
  const documentSha256 = sha256(canonicalJsonBytes(document));
  const audit = {
    contract_kind: "semantic_audit_event",
    schema_version: "0.2.0",
    event_id: hex32("audit_", SEED),
    project_id: hex32("prj_", SEED),
    sequence: 0,
    occurred_at: "2026-07-31T00:00:00.000Z",
    actor: "user",
    action: "ai_change_decided",
    decision: "accepted",
    affected_node_ids: [hex32("node_", SEED)],
    before_sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    before_hash_subject: "document",
    after_sha256: documentSha256,
    after_hash_subject: "document",
    source_refs: [
      {
        material_id: hex32("mat_", SEED),
        sha256: sha256(materialBytes),
        locator: "anchor:section-1",
      },
    ],
    subject_model_context: {
      provider: "test",
      model: "keystone",
      invocation_id: hex32("inv_", SEED),
    },
  };
  return exportKnowledgePackage({
    packageId: hex32("pkg_", SEED),
    projectId: hex32("prj_", SEED),
    title: "边界测试知识包",
    revision: 0,
    createdAt: "2026-07-31T00:00:00.000Z",
    document: { documentId: hex32("doc_", SEED), revision: 0, value: document },
    template: {
      templateId: "wenshu.minimal",
      version: "1.0.0",
      value: makeTemplate(),
    },
    materials: [
      {
        materialId: hex32("mat_", SEED),
        displayName: "边界材料.md",
        mediaType: "text/markdown",
        bytes: materialBytes,
      },
    ],
    audits: [audit],
  });
}

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writePackage(dir: string, bytes: Uint8Array): Promise<string> {
  const sourcePath = join(dir, "package.zip");
  await writeFile(sourcePath, bytes);
  return sourcePath;
}

async function expectImportFailure(
  sourcePath: string,
  targetRoot: string,
  grantRoot: string,
  expectedCode: KnowledgePackageError["code"],
  mode: "read_write" | "read_only" = "read_write",
): Promise<void> {
  const grants = createGrantTable();
  const grant = grants.register(grantRoot, mode);
  await assert.rejects(
    () => importKnowledgePackage({ sourcePath, targetRoot, grant }),
    (error: unknown) =>
      error instanceof KnowledgePackageError && error.code === expectedCode,
  );
  await assert.rejects(
    () => import("node:fs/promises").then((fs) => fs.stat(targetRoot)),
    /ENOENT/,
    "failed import must never create the target root",
  );
  const siblings = await readdir(dirname(targetRoot)).catch(() => [] as string[]);
  assert.equal(
    siblings.some((name) => name.includes(".wenshu-import-")),
    false,
    "failed import must not leave temp residue",
  );
}

// --- MAJOR-1: grant boundary ------------------------------------------------

test("import target outside the grant root fails closed", async () => {
  const exported = buildPackage();
  const dir = await tempDir("wenshu-pkg-scope-");
  const sourcePath = await writePackage(dir, exported.bytes);
  const elsewhere = await tempDir("wenshu-pkg-elsewhere-");

  await expectImportFailure(
    sourcePath,
    join(dir, "project"),
    elsewhere,
    "PACKAGE_GRANT_SCOPE_VIOLATION",
  );
  assert.deepEqual(await readdir(elsewhere), [], "grant directory must stay untouched");
});

test("a sibling prefix look-alike is not inside the grant root", async () => {
  const exported = buildPackage();
  const dir = await tempDir("wenshu-pkg-prefix-");
  const sourcePath = await writePackage(dir, exported.bytes);

  // grant root ".../abc" must not authorize ".../ab" (string-prefix trap).
  await expectImportFailure(
    sourcePath,
    join(dir, "ab"),
    join(dir, "abc"),
    "PACKAGE_GRANT_SCOPE_VIOLATION",
  );
});

test("a read_only grant does not authorize import writes", async () => {
  const exported = buildPackage();
  const dir = await tempDir("wenshu-pkg-readonly-");
  const sourcePath = await writePackage(dir, exported.bytes);

  await expectImportFailure(
    sourcePath,
    join(dir, "project"),
    dir,
    "PACKAGE_GRANT_SCOPE_VIOLATION",
    "read_only",
  );
});

test("grant root equal to the target root is accepted", async () => {
  const exported = buildPackage();
  const dir = await tempDir("wenshu-pkg-equal-");
  const sourcePath = await writePackage(dir, exported.bytes);
  const targetRoot = join(dir, "project");
  const grants = createGrantTable();
  const grant = grants.register(targetRoot, "read_write");

  const imported = await importKnowledgePackage({ sourcePath, targetRoot, grant });
  assert.equal(imported.project.project_id, exported.project.project_id);
});

// --- MAJOR-1 consequence: original protection at the real enforcement point -

test("imported material originals cannot be overwritten through the host", async () => {
  const exported = buildPackage();
  const dir = await tempDir("wenshu-pkg-protect-");
  const sourcePath = await writePackage(dir, exported.bytes);
  const targetRoot = join(dir, "project");
  const grants = createGrantTable();
  const grant = grants.register(dir, "read_write");

  const imported = await importKnowledgePackage({ sourcePath, targetRoot, grant });
  const materialEntry = imported.manifest.entries.find(
    (entry) => entry.role === "truth.material",
  );
  assert.ok(materialEntry);
  const materialName = basename(materialEntry.path);
  assert.equal(isImportedOriginal(grant, materialName), true);

  const host = createFileHost({
    hostKind: "electron",
    hostVersion: "pb11-boundary-test",
    instanceId: "host_20202020202020202020202020202020",
    selectDirectory: () => Promise.resolve({ status: "denied" }),
    grants,
  });
  const overwrite = (await host.invoke({
    protocol_version: "0.2.0",
    kind: "request",
    request_id: "req_30303030303030303030303030303030",
    capability: "file.export.write",
    capability_version: "0.2.0",
    input: {
      grant_id: grant.id,
      file_name: materialName,
      content_base64: Buffer.from("CLOBBERED", "utf8").toString("base64"),
      content_sha256: sha256(new TextEncoder().encode("CLOBBERED")),
      media_type: "text/markdown",
      overwrite: true,
    },
  })) as Record<string, unknown>;

  assert.equal(overwrite["kind"], "failure");
  assert.equal(
    (overwrite["error"] as Record<string, unknown>)["code"],
    "HOST_PERMISSION_DENIED",
  );
  const onDisk = await readFile(join(targetRoot, "truth", "materials", materialName));
  assert.deepEqual(
    new Uint8Array(onDisk),
    new Uint8Array(
      readZip(exported.bytes).find((entry) => entry.path === materialEntry.path)
        ?.bytes ?? new Uint8Array(),
    ),
    "the imported original bytes must be unchanged",
  );
});

// --- MI-04: undeclared package content fails closed -------------------------

test("a file present in the zip but absent from the manifest is rejected", async () => {
  const exported = buildPackage();
  const smuggled = createZip([
    ...readZip(exported.bytes),
    { path: "smuggled.txt", bytes: new TextEncoder().encode("not declared") },
  ]);
  const dir = await tempDir("wenshu-pkg-smuggle-");

  await expectImportFailure(
    await writePackage(dir, smuggled),
    join(dir, "project"),
    dir,
    "PACKAGE_UNDECLARED_ENTRY",
  );
});

// --- MI-03: hostile archives are distinguishable from disk failures ---------

test("a truncated archive reports PACKAGE_ZIP_INVALID, not PACKAGE_IO_FAILURE", async () => {
  const exported = buildPackage();
  const dir = await tempDir("wenshu-pkg-truncated-");
  const truncated = exported.bytes.subarray(0, exported.bytes.length - 10);

  await expectImportFailure(
    await writePackage(dir, truncated),
    join(dir, "project"),
    dir,
    "PACKAGE_ZIP_INVALID",
  );
});

test("raw-byte path traversal rewrite reports PACKAGE_ZIP_INVALID", async () => {
  const exported = buildPackage();
  // Equal-length rewrite of "truth/project.json" (18 chars) into an
  // 18-char traversal path, in both header and central directory.
  const raw = Buffer.from(exported.bytes);
  const from = Buffer.from("truth/project.json", "utf8");
  const to = Buffer.from("../../aaa/bbb.json", "utf8");
  assert.equal(from.length, to.length);
  let hits = 0;
  for (let index = raw.indexOf(from); index !== -1; index = raw.indexOf(from)) {
    to.copy(raw, index);
    hits += 1;
  }
  assert.ok(hits >= 2, "path must appear in local header and central directory");

  const dir = await tempDir("wenshu-pkg-traversal-");
  await expectImportFailure(
    await writePackage(dir, new Uint8Array(raw)),
    join(dir, "project"),
    dir,
    "PACKAGE_ZIP_INVALID",
  );
});

// --- MI-02: decompression bounds --------------------------------------------

test("an entry beyond the uncompressed size cap fails closed", async () => {
  const exported = buildPackage();
  const materialEntry = exported.manifest.entries.find(
    (entry) => entry.role === "truth.material",
  );
  assert.ok(materialEntry);
  const bomb = createZip(
    readZip(exported.bytes).map((entry) =>
      entry.path === materialEntry.path
        ? {
            path: entry.path,
            bytes: new Uint8Array(MAX_ENTRY_UNCOMPRESSED_BYTES + 1),
          }
        : entry,
    ),
  );
  const dir = await tempDir("wenshu-pkg-bomb-");

  await expectImportFailure(
    await writePackage(dir, bomb),
    join(dir, "project"),
    dir,
    "PACKAGE_ZIP_INVALID",
  );
});

test("a stored incompressible entry beyond the cap fails closed", async () => {
  const exported = buildPackage();
  const materialEntry = exported.manifest.entries.find(
    (entry) => entry.role === "truth.material",
  );
  assert.ok(materialEntry);
  // Random bytes do not deflate, so createZip stores them; the up-front
  // declared-size cap is the only guard on this path (no inflate involved).
  const stored = createZip(
    readZip(exported.bytes).map((entry) =>
      entry.path === materialEntry.path
        ? {
            path: entry.path,
            bytes: randomBytes(MAX_ENTRY_UNCOMPRESSED_BYTES + 1),
          }
        : entry,
    ),
  );
  const dir = await tempDir("wenshu-pkg-store-bomb-");

  await expectImportFailure(
    await writePackage(dir, stored),
    join(dir, "project"),
    dir,
    "PACKAGE_ZIP_INVALID",
  );
});
