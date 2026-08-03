import type { ImportFailureItem } from "@wenshu/ux-state/import-flow";

import type { BrowserHost } from "../host.ts";

/**
 * Host interaction bridge for the project/import flow (A-02). The flow UI and
 * the DOM-free session depend only on this interface: the browser Host
 * implementation below, or a future Electron IPC bridge, can be injected
 * without touching flow logic.
 */
export type BridgeTerminal =
  | {
      readonly kind: "success";
      readonly projectName?: string;
      readonly fileName?: string;
    }
  | { readonly kind: "cancelled" }
  | {
      /** Body imported but ≥1 asset failed; per-item failures, never empty. */
      readonly kind: "partial";
      readonly items: readonly ImportFailureItem[];
    }
  | {
      readonly kind: "failure";
      readonly code: string;
      readonly retryable: boolean;
      readonly fallbackNote?: string;
    };

export interface FlowBridge {
  createProject(name: string): Promise<BridgeTerminal>;
  openProject(): Promise<BridgeTerminal>;
  /**
   * Runs the import entry (file.import.select plus, on hosts that support it,
   * the L2 import pipeline). On the browser Host this always resolves to a
   * HOST_UNSUPPORTED failure — the honest degradation path (ADR-0029 §1-c).
   */
  importMarkdown(): Promise<BridgeTerminal>;
}

function newRequestId(): string {
  return `req_${crypto.randomUUID().replaceAll("-", "")}`;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function toTerminal(message: unknown): BridgeTerminal {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return { kind: "failure", code: "HOST_INTERNAL", retryable: false };
  }
  const record = message as Record<string, unknown>;
  if (record["kind"] === "success") {
    const output =
      typeof record["output"] === "object" && record["output"] !== null
        ? (record["output"] as Record<string, unknown>)
        : {};
    const projectName = readString(output, "display_name");
    const fileName =
      readString(output, "file_name") ?? readString(output, "display_name");
    return {
      kind: "success",
      ...(projectName === undefined ? {} : { projectName }),
      ...(fileName === undefined ? {} : { fileName }),
    };
  }
  if (record["kind"] === "cancelled") {
    return { kind: "cancelled" };
  }
  const error =
    typeof record["error"] === "object" && record["error"] !== null
      ? (record["error"] as Record<string, unknown>)
      : {};
  const fallback =
    typeof record["fallback"] === "object" && record["fallback"] !== null
      ? (record["fallback"] as Record<string, unknown>)
      : undefined;
  const strategy = fallback === undefined ? undefined : readString(fallback, "strategy");
  const reasonCode =
    fallback === undefined ? undefined : readString(fallback, "reason_code");
  const fallbackNote =
    strategy === undefined || reasonCode === undefined
      ? undefined
      : `${strategy}/${reasonCode}`;
  return {
    kind: "failure",
    code: readString(error, "code") ?? "HOST_INTERNAL",
    retryable: error["retryable"] === true,
    ...(fallbackNote === undefined ? {} : { fallbackNote }),
  };
}

function request(
  capability: string,
  capabilityVersion: string,
  protocolVersion: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return {
    protocol_version: protocolVersion,
    kind: "request",
    request_id: newRequestId(),
    capability,
    capability_version: capabilityVersion,
    input,
  };
}

/** Browser-Host backed bridge (in-memory, development wiring only). */
export function createBrowserFlowBridge(host: BrowserHost): FlowBridge {
  return Object.freeze({
    async createProject(name: string): Promise<BridgeTerminal> {
      return toTerminal(
        await host.invoke(
          request("project.directory.select", "0.2.0", "0.2.0", {
            purpose: `新建项目：${name}`,
          }),
        ),
      );
    },
    async openProject(): Promise<BridgeTerminal> {
      return toTerminal(
        await host.invoke(
          request("project.directory.select", "0.2.0", "0.2.0", {
            purpose: "打开项目",
          }),
        ),
      );
    },
    async importMarkdown(): Promise<BridgeTerminal> {
      return toTerminal(
        await host.invoke(
          request("file.import.select", "0.3.0", "0.3.0", {
            purpose: "import_markdown",
            multiple: false,
            extensions: ["md", "markdown"],
          }),
        ),
      );
    },
  });
}
