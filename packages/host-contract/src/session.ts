import type {
  CapabilityName,
  HostRegistry,
} from "./generated/host.ts";
import {
  type HostContractIssue,
  type HostContractIssueCode,
  validateHostContract,
} from "./contract.ts";

export type HostSessionValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly HostContractIssue[] };

interface HostRequestState {
  readonly capability: CapabilityName;
  readonly declaration: HostRegistry["capabilities"][number];
  readonly requestIndex: number;
  lastSequence: number;
  terminal: boolean;
}

function sessionIssue(
  code: HostContractIssueCode,
  messageIndex: number,
  suffix = "",
): HostContractIssue {
  return Object.freeze({
    code,
    path: `/messages/${messageIndex}${suffix}`,
  });
}

export function validateHostSession(
  registryInput: unknown,
  messageInputs: readonly unknown[],
): HostSessionValidationResult {
  const registryResult = validateHostContract(registryInput);
  if (!registryResult.ok) {
    return registryResult;
  }
  if (registryResult.value.kind !== "registry") {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([sessionIssue("HOST_SCHEMA", 0, "/registry")]),
    });
  }

  const declarations = new Map(
    registryResult.value.capabilities.map((entry) => [entry.name, entry]),
  );
  const requests = new Map<string, HostRequestState>();
  const issues: HostContractIssue[] = [];

  messageInputs.forEach((input, index) => {
    const result = validateHostContract(input);
    if (!result.ok) {
      result.issues.forEach((entry) => {
        issues.push(sessionIssue(entry.code, index, entry.path));
      });
      return;
    }
    const message = result.value;
    if (message.kind === "registry") {
      issues.push(sessionIssue("HOST_SCHEMA", index));
      return;
    }
    if (message.kind === "request") {
      if (requests.has(message.request_id)) {
        issues.push(sessionIssue("HOST_REQUEST_DUPLICATE", index, "/request_id"));
        return;
      }
      const declaration = declarations.get(message.capability);
      if (declaration === undefined) {
        issues.push(sessionIssue("HOST_CAPABILITY_MISMATCH", index, "/capability"));
        return;
      }
      if (declaration.support_status === "unsupported") {
        issues.push(
          sessionIssue("HOST_CAPABILITY_UNSUPPORTED", index, "/capability"),
        );
      }
      requests.set(message.request_id, {
        capability: message.capability,
        declaration,
        requestIndex: index,
        lastSequence: -1,
        terminal: false,
      });
      return;
    }

    const state = requests.get(message.request_id);
    if (state === undefined) {
      issues.push(sessionIssue("HOST_REQUEST_UNKNOWN", index, "/request_id"));
      return;
    }
    if (message.kind === "cancel") {
      if (state.declaration.cancellation === "none") {
        issues.push(sessionIssue("HOST_CANCELLATION_UNDECLARED", index));
      }
      return;
    }
    if (message.capability !== state.capability) {
      issues.push(sessionIssue("HOST_CAPABILITY_MISMATCH", index, "/capability"));
      return;
    }
    if (message.kind === "progress") {
      if (state.terminal) {
        issues.push(sessionIssue("HOST_TERMINAL_STATE_DUPLICATE", index));
      }
      if (state.declaration.progress === "none") {
        issues.push(sessionIssue("HOST_PROGRESS_UNDECLARED", index));
      }
      if (message.sequence <= state.lastSequence) {
        issues.push(sessionIssue("HOST_SEQUENCE_REGRESSION", index, "/sequence"));
      }
      state.lastSequence = Math.max(state.lastSequence, message.sequence);
      return;
    }

    if (state.terminal) {
      issues.push(sessionIssue("HOST_TERMINAL_STATE_DUPLICATE", index));
      return;
    }
    if (
      message.kind === "failure" &&
      !state.declaration.error_codes.includes(message.error.code)
    ) {
      issues.push(sessionIssue("HOST_ERROR_CODE_UNDECLARED", index, "/error/code"));
    }
    if (
      message.kind === "cancelled" &&
      state.declaration.cancellation === "none"
    ) {
      issues.push(sessionIssue("HOST_CANCELLATION_UNDECLARED", index));
    }
    state.terminal = true;
  });

  requests.forEach((state) => {
    if (!state.terminal) {
      issues.push(
        sessionIssue("HOST_TERMINAL_STATE_MISSING", state.requestIndex),
      );
    }
  });

  if (issues.length > 0) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  return Object.freeze({ ok: true });
}
