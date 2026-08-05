import {
  HOST_PROTOCOL_VERSION_V0_2,
  HOST_PROTOCOL_VERSION_V0_3,
  buildPayloadHostRegistry,
  hostPayloadSchemaId,
  hostPayloadSchemaIdV03,
  isHostPayloadCapability,
  validateHostContract,
  validateHostPayload,
  validateHostSession,
} from "@wenshu/host-contract";

import { BrowserHostError, failureMessage, type HOST_CODE } from "./host/errors.ts";
import {
  base64Decode,
  handleBackupCreate,
  handleBackupRestore,
  handleExportWrite,
  handleSaveAs,
  handleSaveAtomic,
  newGrantId,
  sha256,
  type DirectoryGrant,
} from "./host/store.ts";

type CancelReason = "user" | "superseded" | "shutdown" | "deadline";

interface RequestState {
  readonly capability: string;
  readonly controller: AbortController;
  terminal: boolean;
  terminalMessage?: unknown;
  cancelReason: CancelReason;
}

export interface BrowserHostOptions {
  /** Deterministic selector; defaults to a virtual in-memory directory. */
  readonly selectDirectory?: (
    purpose?: string,
  ) => Promise<
    | { readonly status: "selected"; readonly displayName: string }
    | { readonly status: "cancelled" }
    | { readonly status: "denied" }
  >;
  readonly now?: () => Date;
}

export interface BrowserHost {
  readonly registry: unknown;
  invoke(request: unknown): Promise<unknown>;
  cancel(cancel: unknown): Promise<null>;
  transcript(): readonly unknown[];
}

export function createBrowserHost(options?: BrowserHostOptions): BrowserHost {
  const registry = buildPayloadHostRegistry({
    hostKind: "browser",
    hostVersion: "pb10-browser-1.0",
    instanceId: "host_b1010101010101010101010101010101",
    capabilitySupport: {
      "project.backup.create": "supported",
      "project.backup.restore": "supported",
    },
    // ADR-0029 §1-c: the real file picker lives only in the L3 electron
    // shell; the browser host structurally cannot run the L2 import
    // pipeline, so file.import.select is honestly declared unsupported
    // (fallback points at the desktop shell; no dialog loop). Without this
    // explicit override the registry builder would default to "supported".
    additionalDeclarations: [
      {
        name: "file.import.select",
        capability_version: HOST_PROTOCOL_VERSION_V0_3,
        support_status: "unsupported",
        permission_status: "not_applicable",
        input_schema: hostPayloadSchemaIdV03("file.import.select", "input"),
        output_schema: hostPayloadSchemaIdV03("file.import.select", "output"),
        limits: {
          max_concurrent_requests: 1,
          timeout_ms: 300000,
          max_payload_bytes: 0,
        },
        lifecycle: "request",
        cancellation: "none",
        progress: "none",
        error_codes: ["HOST_UNSUPPORTED"],
        fallback: {
          strategy: "manual_file_picker",
          reason_code: "BROWSER_HOST_NO_IMPORT_PIPELINE",
        },
      },
    ],
  });
  const declarations = new Map(
    registry.capabilities.map((declaration) => [declaration.name, declaration]),
  );
  const grants = new Map<string, DirectoryGrant>();
  const requests = new Map<string, RequestState>();
  const messages: unknown[] = [];
  const now = options?.now ?? (() => new Date());
  let queue: Promise<unknown> = Promise.resolve();

  function requireGrant(id: string): DirectoryGrant {
    const grant = grants.get(id);
    if (grant === undefined) {
      throw new BrowserHostError("NOT_FOUND");
    }
    return grant;
  }

  function assertSelfValid(message: unknown): void {
    if (!validateHostContract(message).ok) {
      throw new Error("BROWSER_HOST_PROTOCOL_ERROR");
    }
  }

  function finishWithTerminal(state: RequestState, terminal: unknown): unknown {
    if (state.terminal) {
      return state.terminalMessage;
    }
    assertSelfValid(terminal);
    const candidate = [...messages, terminal];
    if (!validateHostSession(registry, candidate).ok) {
      throw new Error("BROWSER_HOST_PROTOCOL_ERROR");
    }
    messages.push(terminal);
    state.terminal = true;
    state.terminalMessage = terminal;
    return terminal;
  }

  function rawString(input: unknown, key: string): string | undefined {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    return typeof descriptor?.value === "string" ? descriptor.value : undefined;
  }

  async function handleDirectorySelect(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const selector = options?.selectDirectory;
    const selection = await (selector === undefined
      ? Promise.resolve<{
          readonly status: "selected";
          readonly displayName: string;
        }>({ status: "selected", displayName: "browser-opfs-root" })
      : selector(input["purpose"] as string));
    if (selection.status === "cancelled") {
      return { kind: "cancelled", reason: "user" };
    }
    if (selection.status === "denied") {
      throw new BrowserHostError("PERMISSION_DENIED");
    }
    const grant: DirectoryGrant = {
      id: newGrantId(),
      files: new Map(),
      backups: new Map(),
      displayName: selection.displayName,
    };
    grants.set(grant.id, grant);
    return {
      kind: "success",
      output: { grant_id: grant.id, display_name: grant.displayName },
    };
  }

  function handleDirectoryAuthorize(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const grant = requireGrant(String(input["grant_id"]));
    return {
      kind: "success",
      output: { grant_id: grant.id, mode: "read_write" },
    };
  }

  async function dispatch(
    capability: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    if (signal.aborted) {
      throw new BrowserHostError("CANCELLED");
    }
    switch (capability) {
      case "project.directory.select":
        return handleDirectorySelect(input);
      case "project.directory.authorize":
        return handleDirectoryAuthorize(input);
      case "project.save.atomic":
        return await handleSaveAtomic(requireGrant(String(input["grant_id"])), input);
      case "project.save.as":
        return await handleSaveAs(requireGrant(String(input["grant_id"])), input);
      case "file.export.write":
        return await handleExportWrite(requireGrant(String(input["grant_id"])), input);
      case "project.backup.create":
        return await handleBackupCreate(requireGrant(String(input["grant_id"])), now());
      case "project.backup.restore":
        return await handleBackupRestore(
          requireGrant(String(input["grant_id"])),
          String(input["backup_id"]),
        );
      default:
        throw new BrowserHostError("INVALID");
    }
  }

  function terminalFromOutcome(
    protocolVersion: string,
    requestId: string,
    capability: string,
    outcome: Record<string, unknown>,
  ): unknown {
    if (outcome["kind"] === "cancelled") {
      return {
        protocol_version: protocolVersion,
        kind: "cancelled",
        request_id: requestId,
        capability,
        reason: "user",
      };
    }
    const output = outcome["output"] as Record<string, unknown>;
    if (
      isHostPayloadCapability(capability) &&
      !validateHostPayload(hostPayloadSchemaId(capability, "output"), output).ok
    ) {
      return failureMessage(protocolVersion, requestId, capability, "INTERNAL");
    }
    return {
      protocol_version: protocolVersion,
      kind: "success",
      request_id: requestId,
      capability,
      output,
    };
  }

  async function invokeSerialized(request: unknown): Promise<unknown> {
    const parsed = validateHostContract(request);
    const requestedProtocol = rawString(request, "protocol_version");
    const protocolVersion =
      requestedProtocol === "0.1.0"
        ? "0.1.0"
        : requestedProtocol === HOST_PROTOCOL_VERSION_V0_3
          ? HOST_PROTOCOL_VERSION_V0_3
          : HOST_PROTOCOL_VERSION_V0_2;
    const requestId = rawString(request, "request_id");
    if (!parsed.ok || parsed.value.kind !== "request" || requestId === undefined) {
      throw new Error("BROWSER_HOST_PROTOCOL_ERROR");
    }
    const value = parsed.value;
    const declaration = declarations.get(value.capability);
    if (declaration === undefined) {
      throw new Error("BROWSER_HOST_PROTOCOL_ERROR");
    }
    if (declaration.support_status === "unsupported") {
      const terminal = {
        protocol_version: protocolVersion,
        kind: "failure",
        request_id: value.request_id,
        capability: value.capability,
        error: {
          code: "HOST_UNSUPPORTED",
          retryable: false,
          detail_key: "host.capability.unsupported",
        },
        fallback: declaration.fallback,
      };
      assertSelfValid(terminal);
      return terminal;
    }
    if (
      declaration.capability_version !== value.capability_version ||
      requests.has(value.request_id)
    ) {
      return failureMessage(
        protocolVersion,
        value.request_id,
        value.capability,
        "INVALID",
      );
    }
    const state: RequestState = {
      capability: value.capability,
      controller: new AbortController(),
      terminal: false,
      cancelReason: "user",
    };
    requests.set(value.request_id, state);
    messages.push(value);

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await new Promise<Record<string, unknown>>((resolve, reject) => {
        timer = setTimeout(() => {
          state.controller.abort();
          reject(new BrowserHostError("TIMEOUT"));
        }, declaration.limits.timeout_ms);
        dispatch(value.capability, value.input, state.controller.signal).then(
          (result) => {
            if (state.controller.signal.aborted) {
              reject(new BrowserHostError("CANCELLED"));
              return;
            }
            resolve(result);
          },
          (error: unknown) => reject(error),
        );
      });
      return finishWithTerminal(
        state,
        terminalFromOutcome(
          protocolVersion,
          value.request_id,
          value.capability,
          outcome,
        ),
      );
    } catch (error) {
      if (state.terminal) {
        return state.terminalMessage;
      }
      if (error instanceof BrowserHostError && error.code === "CANCELLED") {
        return finishWithTerminal(state, {
          protocol_version: protocolVersion,
          kind: "cancelled",
          request_id: value.request_id,
          capability: value.capability,
          reason: state.cancelReason,
        });
      }
      const code: keyof typeof HOST_CODE =
        error instanceof BrowserHostError ? error.code : "INTERNAL";
      return finishWithTerminal(
        state,
        failureMessage(protocolVersion, value.request_id, value.capability, code),
      );
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  function invoke(request: unknown): Promise<unknown> {
    const run = queue.then(() => invokeSerialized(request));
    queue = run.catch(() => undefined);
    return run;
  }

  function cancel(cancelMessage: unknown): Promise<null> {
    const parsed = validateHostContract(cancelMessage);
    if (!parsed.ok || parsed.value.kind !== "cancel") {
      return Promise.resolve(null);
    }
    const state = requests.get(parsed.value.request_id);
    if (state === undefined || state.terminal) {
      return Promise.resolve(null);
    }
    state.cancelReason = parsed.value.reason;
    state.controller.abort();
    return Promise.resolve(null);
  }

  return Object.freeze({
    registry,
    invoke,
    cancel,
    transcript: () => Object.freeze([...messages]),
  });
}

export { base64Decode, sha256 };
