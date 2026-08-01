import type { SupportedDocument } from "@wenshu/document-model";
import type { SemanticAuditEvent } from "@wenshu/project-contract";

import {
  assert,
  base64Decode,
  base64Encode,
  e2eBridge,
  hostInvoke,
  sha256Hex,
} from "./bridge.ts";
import {
  buildTemplate,
  buildBulkMaterialBytes,
  BULK_MATERIAL_ID,
  DOCUMENT_ID,
  MATERIAL_ID,
  MATERIAL_MARKDOWN,
  PACKAGE_ID,
  PROJECT_ID,
} from "./fixture.ts";
import { ChainRecorder, type ChainResult } from "./report.ts";

export interface PersistChainOutcome {
  readonly results: readonly ChainResult[];
  readonly savedDocumentSha256: string;
  readonly knowledgePackageSha256: string;
  readonly manifestSummary: Record<string, unknown>;
}

function outputOf(response: Record<string, unknown>, capability: string) {
  assert(
    response["kind"] === "success",
    `${capability} did not succeed: ${response["kind"]}`,
  );
  const output = response["output"];
  assert(typeof output === "object" && output !== null, `${capability} output missing`);
  return output as Record<string, unknown>;
}

/**
 * Chain 2: webcrypto sha256 -> real Host 0.2.0 save/backup -> knowledge
 * package export via the main-process orchestration channel -> zip written
 * back through the real file.export.write capability.
 */
export async function runPersistChain(
  finalDocument: SupportedDocument,
  audits: readonly SemanticAuditEvent[],
  options?: { readonly bulkMaterialBytes?: number },
): Promise<PersistChainOutcome> {
  const recorder = new ChainRecorder();
  const documentJson = JSON.stringify(finalDocument);
  const documentBytes = new TextEncoder().encode(documentJson);
  const documentSha256 = await sha256Hex(documentBytes);
  let grantId = "";
  let knowledgePackageSha256 = "";
  let zipBase64 = "";
  let manifestSummary: Record<string, unknown> = {};

  await recorder.step("persist-registry", async () => {
    const registry = (await window.wenshuHost.registry()) as {
      capabilities?: readonly { name: string }[];
    };
    const names = registry.capabilities?.map((capability) => capability.name) ?? [];
    for (const required of [
      "project.directory.select",
      "project.save.atomic",
      "project.backup.create",
      "file.export.write",
    ]) {
      assert(names.includes(required), `registry missing ${required}`);
    }
    return `registry exposes ${names.length} capabilities`;
  });

  await recorder.step("persist-directory-select", async () => {
    const output = outputOf(
      await hostInvoke("project.directory.select", { purpose: "open_project" }),
      "project.directory.select",
    );
    const id = output["grant_id"];
    assert(typeof id === "string" && id.startsWith("grant_"), "grant_id malformed");
    grantId = id;
    return `scripted directory grant ${id.slice(0, 16)}…`;
  });

  await recorder.step("persist-save-atomic", async () => {
    const output = outputOf(
      await hostInvoke("project.save.atomic", {
        grant_id: grantId,
        file_name: "document.json",
        content_base64: base64Encode(documentBytes),
        content_sha256: documentSha256,
        expected_previous_sha256: null,
      }),
      "project.save.atomic",
    );
    assert(
      output["sha256"] === documentSha256,
      "host-confirmed sha256 must equal the renderer webcrypto digest",
    );
    return `document.json saved atomically (${output["bytes_written"]} bytes)`;
  });

  await recorder.step("persist-backup-create", async () => {
    const output = outputOf(
      await hostInvoke("project.backup.create", { grant_id: grantId }),
      "project.backup.create",
    );
    const backupId = output["backup_id"];
    assert(
      typeof backupId === "string" && /^backup_[0-9a-f]{32}$/u.test(backupId),
      "backup_id malformed",
    );
    return `sqlite backup created (${backupId.slice(0, 24)}…)`;
  });

  await recorder.step("knowledge-export", async () => {
    const materials = [
      {
        materialId: MATERIAL_ID,
        displayName: "参考资料.md",
        mediaType: "text/markdown",
        bytesBase64: base64Encode(new TextEncoder().encode(MATERIAL_MARKDOWN)),
      },
    ];
    const bulkSize = options?.bulkMaterialBytes ?? 0;
    if (bulkSize > 0) {
      // W3 chain 5: a real deterministic bulk material goes through the real
      // export channel so the later import has a genuine SIGKILL window.
      materials.push({
        materialId: BULK_MATERIAL_ID,
        displayName: "大体积参考资料.md",
        mediaType: "text/markdown",
        bytesBase64: base64Encode(buildBulkMaterialBytes(bulkSize)),
      });
    }
    const result = await e2eBridge().export({
      packageId: PACKAGE_ID,
      projectId: PROJECT_ID,
      title: "PB-12 E2E 知识包",
      revision: 0,
      createdAt: "2026-08-01T00:00:00.000Z",
      document: { documentId: DOCUMENT_ID, revision: 0, value: finalDocument },
      template: {
        templateId: "wenshu.minimal",
        version: "1.0.0",
        value: buildTemplate(),
      },
      materials,
      audits,
    });
    assert(
      result.manifestSummary.package_id === PACKAGE_ID,
      "manifest package_id mismatch",
    );
    // Renderer-side honesty check: re-hash the returned zip bytes with
    // webcrypto; the main-process digest must match.
    const verified = await sha256Hex(base64Decode(result.zipBase64));
    assert(verified === result.sha256, "zip sha256 channel/self digest mismatch");
    knowledgePackageSha256 = result.sha256;
    zipBase64 = result.zipBase64;
    manifestSummary = { ...result.manifestSummary };
    return `zip ${result.zipBase64.length} base64 chars, ${result.manifestSummary.entry_count} entries, digest verified`;
  });

  await recorder.step("knowledge-export-write", async () => {
    const output = outputOf(
      await hostInvoke("file.export.write", {
        grant_id: grantId,
        file_name: "knowledge-package.zip",
        content_base64: zipBase64,
        content_sha256: knowledgePackageSha256,
        media_type: "application/zip",
        overwrite: false,
      }),
      "file.export.write",
    );
    assert(
      output["sha256"] === knowledgePackageSha256,
      "host-confirmed zip sha256 must equal the export digest",
    );
    return `knowledge-package.zip written via file.export.write (${output["bytes_written"]} bytes)`;
  });

  assert(grantId !== "" && knowledgePackageSha256 !== "", "persist chain incomplete");
  return {
    results: recorder.results,
    savedDocumentSha256: documentSha256,
    knowledgePackageSha256,
    manifestSummary,
  };
}
