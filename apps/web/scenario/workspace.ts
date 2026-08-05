/**
 * A-03 workspace E2E scenario entry (built as a single IIFE; file:// refuses
 * ESM). Loads the real document through the grant-gated
 * wenshu.project.document.read channel, mounts the real workspace UI, then
 * hands control to the main process, which replays the scripted key sequence
 * through Chromium's trusted input pipeline (sendInputEvent). Every keydown
 * the workspace consumed is tallied with event.isTrusted so the run can prove
 * the events were real, and the final controller snapshot is handed back via
 * window.__wenshuWorkspaceReport().
 */
import { WorkspaceController } from "../src/workspace/controller.ts";
import { mountWorkspace } from "../src/workspace/mount.ts";
import type { ImportMeta } from "../src/workspace/model.ts";
import type { SupportedDocument } from "@wenshu/document-model";

interface HostBridge {
  invoke(request: unknown): Promise<unknown>;
}

interface ProjectBridge {
  readDocument(input: {
    grant_id: string;
  }): Promise<
    | { status: "ok"; document: SupportedDocument; document_sha256: string }
    | { status: "empty" | "corrupt" }
    | { status: "error"; code: string }
  >;
}

interface E2EBridge {
  report(payload: unknown): Promise<null>;
}

declare global {
  interface Window {
    wenshuHost: HostBridge;
    wenshuProject?: ProjectBridge;
    wenshuE2E?: E2EBridge;
    __wenshuWorkspaceReport?: () => Record<string, unknown>;
  }
}

let nextRequestOrdinal = 0;

function hostRequest(
  capability: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  nextRequestOrdinal += 1;
  return {
    protocol_version: "0.2.0",
    kind: "request",
    request_id: `req_${nextRequestOrdinal.toString(16).padStart(32, "0")}`,
    capability,
    capability_version: "0.2.0",
    input,
  };
}

async function hostInvoke(
  capability: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await window.wenshuHost.invoke(hostRequest(capability, input));
  if (typeof response !== "object" || response === null) {
    throw new Error(`${capability}: host response is not an object`);
  }
  return response as Record<string, unknown>;
}

async function selectProjectDirectory(): Promise<string> {
  const response = await hostInvoke("project.directory.select", {
    purpose: "open_project",
  });
  if (response["kind"] !== "success") {
    throw new Error(`project.directory.select failed: ${String(response["kind"])}`);
  }
  const output = response["output"] as Record<string, unknown> | undefined;
  const grantId = output?.["grant_id"];
  if (typeof grantId !== "string") throw new Error("directory grant_id missing");
  return grantId;
}

async function main(): Promise<void> {
  const project = window.wenshuProject;
  const e2e = window.wenshuE2E;
  if (project === undefined || e2e === undefined) {
    throw new Error("preload bridges missing (wenshuProject / wenshuE2E)");
  }

  const keyStats = { total: 0, trusted: 0, keys: [] as string[] };
  window.addEventListener(
    "keydown",
    (event) => {
      keyStats.total += 1;
      if (event.isTrusted) keyStats.trusted += 1;
      if (keyStats.keys.length < 256) keyStats.keys.push(event.key);
    },
    true,
  );

  const grantId = await selectProjectDirectory();
  const read = await project.readDocument({ grant_id: grantId });
  if (read.status !== "ok") {
    throw new Error(
      `document.read did not return ok: ${read.status}` +
        (read.status === "error" ? ` ${read.code}` : ""),
    );
  }

  // D1 confirm branch: importMeta=1 mounts the workspace in confirm phase
  // with import-terminal metadata (failed asset enumerated, skippable).
  const params = new URLSearchParams(location.search);
  let importMeta: ImportMeta | undefined;
  if (params.get("importMeta") === "1") {
    importMeta = Object.freeze({
      status: "partial",
      materialName: "e2e-material.md",
      importedAssets: Object.freeze([]),
      failedAssets: Object.freeze([
        Object.freeze({ fileName: "img2.png", reasonCode: "asset_not_provided" }),
      ]),
    });
  }

  const controller = new WorkspaceController(read.document, importMeta);
  const root = document.querySelector<HTMLElement>("#app");
  if (root === null) throw new Error("missing #app root");
  mountWorkspace(root, controller);

  window.__wenshuWorkspaceReport = () => ({
    documentSha256: read.document_sha256,
    keyStats: {
      total: keyStats.total,
      trusted: keyStats.trusted,
      keys: keyStats.keys,
    },
    snapshot: JSON.parse(JSON.stringify(controller.snapshot())) as unknown,
  });

  await e2e.report({ type: "workspace-ready" });
}

main().catch((error: unknown) => {
  void window.wenshuE2E?.report({ type: "workspace-error", error: String(error) });
});
