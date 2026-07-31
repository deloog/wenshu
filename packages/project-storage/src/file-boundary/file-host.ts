import {
  buildPayloadHostRegistry,
  HOST_PROTOCOL_VERSION_V0_2,
  hostPayloadSchemaId,
  isHostPayloadCapability,
  validateHostContract,
  validateHostPayload,
  validateHostSession,
  type HostPayloadCapability,
  type PayloadSupportStatus,
} from "@wenshu/host-contract";

import {
  handleBackupCreate,
  handleBackupRestore,
  handleDirectoryAuthorize,
  handleDirectorySelect,
  handleExportWrite,
  handleSaveAs,
  handleSaveAtomic,
  type CapabilityOutcome,
  type DirectorySelection,
  type FileHostContext,
} from "./handlers.ts";
import { FileBoundaryError, type FileBoundaryCode } from "./errors.ts";
import { createGrantTable, type GrantTable } from "./grants.ts";
import {
  failureMessage,
  knownCapability,
  rawField,
  unsupportedTerminal,
} from "./messages.ts";

export class FileHostProtocolError extends Error {
  constructor() {
    super("FILE_HOST_PROTOCOL_ERROR");
  }
}

export interface FileHostOptions {
  readonly hostKind: "electron" | "browser" | "arkweb";
  readonly hostVersion: string;
  readonly instanceId: string;
  readonly selectDirectory: (purpose?: string) => Promise<DirectorySelection>;
  readonly capabilitySupport?: Partial<
    Readonly<Record<HostPayloadCapability, PayloadSupportStatus>>
  >;
  readonly additionalDeclarations?: readonly Record<string, unknown>[];
  readonly timeoutMs?: Partial<Readonly<Record<HostPayloadCapability, number>>>;
  readonly now?: () => Date;
  /** Test injection only. Production callers must let the host create the table. */
  readonly grants?: GrantTable;
}

export interface FileHost {
  readonly registry: unknown;
  invoke(request: unknown): Promise<unknown>;
  /** Late or unknown cancels are ignored; an in-flight request is aborted and ends cancelled. */
  cancel(cancel: unknown): Promise<null>;
  /** Valid-envelope messages in order; usable directly with validateHostSession. */
  transcript(): readonly unknown[];
}

interface RequestState {
  readonly capability: string;
  readonly controller: AbortController;
  terminal: boolean;
  terminalMessage?: unknown;
  cancelReason: "user" | "superseded" | "shutdown" | "deadline";
}

const REQUEST_ID_PATTERN = /^req_[0-9a-f]{32}$/u;

export function createFileHost(options: FileHostOptions): FileHost {
  const registry = buildPayloadHostRegistry({
    hostKind: options.hostKind,
    hostVersion: options.hostVersion,
    instanceId: options.instanceId,
    ...(options.capabilitySupport === undefined
      ? {}
      : { capabilitySupport: options.capabilitySupport }),
    ...(options.additionalDeclarations === undefined
      ? {}
      : { additionalDeclarations: options.additionalDeclarations }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  const grants = options.grants ?? createGrantTable();
  const declarations = new Map(
    registry.capabilities.map((declaration) => [declaration.name, declaration]),
  );
  const context: FileHostContext = {
    grants,
    selectDirectory: options.selectDirectory,
    now: options.now ?? (() => new Date()),
  };
  const requests = new Map<string, RequestState>();
  const messages: unknown[] = [];
  let queue: Promise<unknown> = Promise.resolve();

  function assertSelfValid(message: unknown): void {
    if (!validateHostContract(message).ok) {
      throw new FileHostProtocolError();
    }
  }

  function finishWithTerminal(state: RequestState, terminal: unknown): unknown {
    if (state.terminal) {
      return state.terminalMessage;
    }
    assertSelfValid(terminal);
    const candidate = [...messages, terminal];
    if (!validateHostSession(registry, candidate).ok) {
      throw new FileHostProtocolError();
    }
    messages.push(terminal);
    state.terminal = true;
    state.terminalMessage = terminal;
    return terminal;
  }

  function outcomeToTerminal(
    protocolVersion: string,
    requestId: string,
    capability: string,
    outcome: CapabilityOutcome,
  ): unknown {
    if (outcome.kind === "cancelled") {
      return {
        protocol_version: protocolVersion,
        kind: "cancelled",
        request_id: requestId,
        capability,
        reason: outcome.reason,
      };
    }
    if (
      isHostPayloadCapability(capability) &&
      !validateHostPayload(hostPayloadSchemaId(capability, "output"), outcome.output).ok
    ) {
      return failureMessage(protocolVersion, requestId, capability, "INTERNAL");
    }
    return {
      protocol_version: protocolVersion,
      kind: "success",
      request_id: requestId,
      capability,
      output: outcome.output,
    };
  }

  async function dispatch(
    capability: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<CapabilityOutcome> {
    switch (capability) {
      case "project.directory.select":
        return handleDirectorySelect(context, input, signal);
      case "project.directory.authorize":
        return handleDirectoryAuthorize(context, input);
      case "project.save.atomic":
        return handleSaveAtomic(context, input, signal);
      case "project.save.as":
        return handleSaveAs(context, input, signal);
      case "project.backup.create":
        return handleBackupCreate(context, input);
      case "project.backup.restore":
        return handleBackupRestore(context, input);
      case "file.export.write":
        return handleExportWrite(context, input, signal);
      default:
        throw new FileBoundaryError("INVALID");
    }
  }

  async function invokeSerialized(request: unknown): Promise<unknown> {
    const parsed = validateHostContract(request);
    const protocolVersion =
      rawField(request, "protocol_version") === "0.1.0"
        ? "0.1.0"
        : HOST_PROTOCOL_VERSION_V0_2;
    const requestId = rawField(request, "request_id");
    const capability = knownCapability(request);
    if (!parsed.ok || parsed.value.kind !== "request") {
      if (requestId === undefined || !REQUEST_ID_PATTERN.test(requestId)) {
        throw new FileHostProtocolError();
      }
      if (capability === undefined) {
        throw new FileHostProtocolError();
      }
      const terminal = failureMessage(
        protocolVersion,
        requestId,
        capability,
        "INVALID",
      );
      assertSelfValid(terminal);
      return terminal;
    }
    const value = parsed.value;
    const declaration = declarations.get(value.capability);
    if (declaration === undefined) {
      throw new FileHostProtocolError();
    }
    if (declaration.support_status === "unsupported") {
      const terminal = unsupportedTerminal(
        protocolVersion,
        value.request_id,
        value.capability,
        declaration.fallback,
      );
      assertSelfValid(terminal);
      return terminal;
    }
    if (
      declaration.capability_version !== value.capability_version ||
      requests.has(value.request_id)
    ) {
      const terminal = failureMessage(
        protocolVersion,
        value.request_id,
        value.capability,
        "INVALID",
      );
      assertSelfValid(terminal);
      return terminal;
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
      const outcome = await new Promise<CapabilityOutcome>((resolve, reject) => {
        timer = setTimeout(() => {
          state.controller.abort();
          reject(new FileBoundaryError("TIMEOUT"));
        }, declaration.limits.timeout_ms);
        dispatch(value.capability, value.input, state.controller.signal).then(
          (result) => {
            if (state.controller.signal.aborted && result.kind === "success") {
              reject(new FileBoundaryError("CANCELLED"));
              return;
            }
            resolve(result);
          },
          (error: unknown) => {
            reject(error);
          },
        );
      });
      return finishWithTerminal(
        state,
        outcomeToTerminal(protocolVersion, value.request_id, value.capability, outcome),
      );
    } catch (error) {
      if (state.terminal) {
        return state.terminalMessage;
      }
      if (error instanceof FileBoundaryError && error.code === "CANCELLED") {
        return finishWithTerminal(state, {
          protocol_version: protocolVersion,
          kind: "cancelled",
          request_id: value.request_id,
          capability: value.capability,
          reason: state.cancelReason,
        });
      }
      const code: FileBoundaryCode =
        error instanceof FileBoundaryError ? error.code : "INTERNAL";
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
