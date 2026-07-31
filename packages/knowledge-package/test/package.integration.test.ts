import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import test from "node:test";

import { isImportedOriginal } from "@wenshu/project-storage";

import {
  canonicalJsonBytes,
  createGrantTable,
  exportKnowledgePackage,
  importKnowledgePackage,
  KnowledgePackageError,
  sha256,
  type ExportedKnowledgePackage,
} from "../src/index.ts";
import { createZip, readZip } from "../src/zip.ts";

const hex32 = (prefix: string, seed: string): string =>
  `${prefix}${seed.replaceAll("-", "")}`;

function makeIds(seed = "00000000000000000000000000000001") {
  return {
    projectId: hex32("prj_", seed),
    documentId: hex32("doc_", seed),
    materialId: hex32("mat_", seed),
    auditId: hex32("audit_", seed),
    packageId: hex32("pkg_", seed),
  };
}

function makeDocument(seed = "00000000000000000000000000000001") {
  return {
    schemaVersion: "0.2.0",
    documentId: hex32("doc_", seed),
    revision: 0,
    title: "测试文档",
    language: "zh-CN",
    blocks: [
      {
        id: hex32("node_", seed),
        type: "paragraph",
        text: "知识包 round-trip 测试段落。",
      },
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

function makeAudit(materialSha256: string, documentSha256: string) {
  const ids = makeIds();
  return {
    contract_kind: "semantic_audit_event",
    schema_version: "0.2.0",
    event_id: ids.auditId,
    project_id: ids.projectId,
    sequence: 0,
    occurred_at: "2026-07-31T00:00:00.000Z",
    actor: "user",
    action: "ai_change_decided",
    decision: "accepted",
    affected_node_ids: [hex32("node_", "00000000000000000000000000000001")],
    // Accepted ai_change_decided requires before/after hashes to differ.
    before_sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    before_hash_subject: "document",
    after_sha256: documentSha256,
    after_hash_subject: "document",
    source_refs: [
      {
        material_id: ids.materialId,
        sha256: materialSha256,
        locator: "anchor:section-1",
      },
    ],
    subject_model_context: {
      provider: "test",
      model: "keystone",
      invocation_id: hex32("inv_", "00000000000000000000000000000001"),
    },
  };
}

function buildPackage(
  seed = "00000000000000000000000000000001",
): ExportedKnowledgePackage {
  const ids = makeIds(seed);
  const materialBytes = new TextEncoder().encode("# 参考资料\n测试材料内容。");
  const document = makeDocument(seed);
  const template = makeTemplate();

  // Compute the exact canonical hashes that exportKnowledgePackage will use.
  const documentBytes = canonicalJsonBytes(document);
  const documentSha256 = sha256(documentBytes);
  const materialSha256 = sha256(materialBytes);

  // Audit must pass project-contract semantics: accepted ai_change_decided
  // requires before/after hashes to differ, and after must match the document.
  const audit = makeAudit(materialSha256, documentSha256);

  return exportKnowledgePackage({
    packageId: ids.packageId,
    projectId: ids.projectId,
    title: "测试知识包",
    revision: 0,
    createdAt: "2026-07-31T00:00:00.000Z",
    document: { documentId: ids.documentId, revision: 0, value: document },
    template: { templateId: "wenshu.minimal", version: "1.0.0", value: template },
    materials: [
      {
        materialId: ids.materialId,
        displayName: "参考资料.md",
        mediaType: "text/markdown",
        bytes: materialBytes,
      },
    ],
    audits: [audit],
    derived: [
      {
        kind: "search_index",
        bytes: new TextEncoder().encode('{"index": true}'),
        sourceSha256s: [documentSha256],
      },
    ],
  });
}

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writePackageToDisk(exported: ExportedKnowledgePackage): Promise<string> {
  const dir = await tempDir("wenshu-pkg-export-");
  const path = join(dir, "package.zip");
  await writeFile(path, exported.bytes);
  return path;
}

test("export produces a self-valid manifest with byte-derived truth hashes", () => {
  const exported = buildPackage();
  assert.equal(exported.manifest.contract_kind, "knowledge_package");
  assert.equal(
    exported.manifest.entries.some((entry) => entry.role === "truth.project"),
    true,
  );
  assert.equal(
    exported.manifest.entries.some((entry) => entry.role === "truth.audit"),
    true,
  );

  const projectEntry = exported.manifest.entries.find(
    (entry) => entry.role === "truth.project",
  );
  assert.ok(projectEntry);
  const projectBytes = canonicalJsonBytes(exported.project);
  assert.equal(projectEntry.sha256, sha256(projectBytes));
  assert.equal(projectEntry.size_bytes, projectBytes.length);
});

test("clean-environment round-trip preserves project, document, template, audit and material", async () => {
  const exported = buildPackage();
  const sourcePath = await writePackageToDisk(exported);
  const targetRoot = join(await tempDir("wenshu-pkg-target-"), "project");
  const grants = createGrantTable();
  const grant = grants.register(dirname(targetRoot), "read_write");

  const imported = await importKnowledgePackage({ sourcePath, targetRoot, grant });

  assert.equal(imported.project.project_id, exported.project.project_id);
  assert.equal(imported.project.title, exported.project.title);
  assert.equal(imported.project.revision, exported.project.revision);
  assert.equal(imported.audits.length, 1);
  assert.equal(
    imported.audits[0]?.event_id,
    exported.project.semantic_audit_event_ids[0],
  );
  assert.equal(imported.manifest.package_id, exported.manifest.package_id);

  // Material file was registered as an imported original.
  const materialEntry = imported.manifest.entries.find(
    (entry) => entry.role === "truth.material",
  );
  assert.ok(materialEntry);
  assert.equal(isImportedOriginal(grant, basename(materialEntry.path)), true);
});

test("round-trip through a separate node process", async () => {
  const exported = buildPackage();
  const sourcePath = await writePackageToDisk(exported);
  const targetRoot = join(await tempDir("wenshu-pkg-subprocess-"), "project");

  const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const packageEntry = pathToFileURL(
    resolve(workspaceRoot, "packages/knowledge-package/src/index.ts"),
  ).href;
  const script = `
    import { createGrantTable, importKnowledgePackage } from ${JSON.stringify(packageEntry)};
    import { mkdir } from "node:fs/promises";
    import { dirname } from "node:path";

    const sourcePath = ${JSON.stringify(sourcePath)};
    const targetRoot = ${JSON.stringify(targetRoot)};
    await mkdir(dirname(targetRoot), { recursive: true });
    const grants = createGrantTable();
    const grant = grants.register(dirname(targetRoot), "read_write");
    const imported = await importKnowledgePackage({ sourcePath, targetRoot, grant });
    console.log(JSON.stringify({ projectId: imported.project.project_id, audits: imported.audits.length }));
  `;

  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim().split("\n").pop() ?? "{}");
  assert.equal(output.projectId, exported.project.project_id);
  assert.equal(output.audits, 1);
});

async function tamperEntry(
  exported: ExportedKnowledgePackage,
  path: string,
): Promise<Uint8Array> {
  const entries = readZip(exported.bytes).map((entry) =>
    entry.path === path
      ? { path: entry.path, bytes: flipOneBit(entry.bytes) }
      : { path: entry.path, bytes: entry.bytes },
  );
  return createZip(entries);
}

function flipOneBit(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes);
  const first = copy[0];
  if (first !== undefined) {
    copy[0] = first ^ 0x01;
  }
  return copy;
}

async function expectImportFailure(
  tamperedBytes: Uint8Array,
  expectedCode: KnowledgePackageError["code"],
): Promise<void> {
  const dir = await tempDir("wenshu-pkg-tamper-");
  const sourcePath = join(dir, "package.zip");
  const targetRoot = join(dir, "project");
  await writeFile(sourcePath, tamperedBytes);
  const grants = createGrantTable();
  const grant = grants.register(dir, "read_write");

  await assert.rejects(
    () => importKnowledgePackage({ sourcePath, targetRoot, grant }),
    (error: unknown) =>
      error instanceof KnowledgePackageError && error.code === expectedCode,
  );

  // Target must not be created.
  await assert.rejects(
    () => import("node:fs/promises").then((fs) => fs.stat(targetRoot)),
    /ENOENT/,
  );
}

test("tampering truth.project rejects import", async () => {
  const exported = buildPackage();
  const tampered = await tamperEntry(exported, "truth/project.json");
  await expectImportFailure(tampered, "PACKAGE_HASH_MISMATCH");
});

test("tampering truth.audit rejects import", async () => {
  const exported = buildPackage();
  const tampered = await tamperEntry(exported, "truth/audit.ndjson");
  await expectImportFailure(tampered, "PACKAGE_HASH_MISMATCH");
});

test("tampering truth.document rejects import", async () => {
  const exported = buildPackage();
  const tampered = await tamperEntry(exported, "truth/document.json");
  await expectImportFailure(tampered, "PACKAGE_HASH_MISMATCH");
});

test("tampering truth.template rejects import", async () => {
  const exported = buildPackage();
  const tampered = await tamperEntry(exported, "truth/template.json");
  await expectImportFailure(tampered, "PACKAGE_HASH_MISMATCH");
});

test("tampering truth.material rejects import", async () => {
  const exported = buildPackage();
  const materialEntry = exported.manifest.entries.find(
    (entry) => entry.role === "truth.material",
  );
  assert.ok(materialEntry);
  const tampered = await tamperEntry(exported, materialEntry.path);
  await expectImportFailure(tampered, "PACKAGE_HASH_MISMATCH");
});

test("deleting derived entry still imports successfully", async () => {
  const exported = buildPackage();
  const entries = readZip(exported.bytes);
  const manifestEntry = entries.find((entry) => entry.path === "manifest.json");
  assert.ok(manifestEntry);
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.bytes)) as {
    entries: Array<{ path: string; role: string }>;
  };
  const slimManifest = {
    ...manifest,
    entries: manifest.entries.filter((entry) => !entry.path.startsWith("derived/")),
  };

  const slimEntries = entries
    .filter((entry) => !entry.path.startsWith("derived/"))
    .map((entry) =>
      entry.path === "manifest.json"
        ? {
            path: entry.path,
            bytes: new TextEncoder().encode(JSON.stringify(slimManifest)),
          }
        : entry,
    );
  const slimBytes = createZip(slimEntries);

  const dir = await tempDir("wenshu-pkg-derived-");
  const sourcePath = join(dir, "package.zip");
  const targetRoot = join(dir, "project");
  await writeFile(sourcePath, slimBytes);
  const grants = createGrantTable();
  const grant = grants.register(dir, "read_write");

  const imported = await importKnowledgePackage({ sourcePath, targetRoot, grant });
  assert.equal(imported.project.project_id, exported.project.project_id);
});

test("manifest entry with wrong sha256 is caught by byte hash verification", async () => {
  const exported = buildPackage();
  const entries = readZip(exported.bytes).map((entry) => {
    if (entry.path !== "manifest.json") return entry;
    const manifest = JSON.parse(new TextDecoder().decode(entry.bytes)) as {
      entries: Array<{ path: string; sha256: string }>;
    };
    const documentEntry = manifest.entries.find(
      (e) => e.path === "truth/document.json",
    );
    assert.ok(documentEntry);
    documentEntry.sha256 =
      "0000000000000000000000000000000000000000000000000000000000000000";
    return {
      path: entry.path,
      bytes: new TextEncoder().encode(JSON.stringify(manifest)),
    };
  });
  const tampered = createZip(entries);
  await expectImportFailure(tampered, "PACKAGE_HASH_MISMATCH");
});
