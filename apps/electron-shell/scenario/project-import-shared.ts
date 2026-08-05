/**
 * A-02 project-import scenario shared helpers: real protocol calls
 * (project.directory.select at 0.2.0, file.import.select at 0.3.0), the
 * frozen-contract verbatim view reconciliation and progress wiring every
 * sub-scenario runner builds on. See project-import.ts for the entry point.
 */
import { getUxStateFrom, UX_STATES_DATA } from "@wenshu/ux-state/data";
import {
  type ImportFlowController,
  type ImportFlowStateId,
  type ImportFlowStateView,
  type ImportFlowView,
} from "@wenshu/ux-state/import-flow";

import {
  assert,
  hostInvoke,
  projectBridge,
  type ImportProgress as ChannelProgress,
  type ProjectImportResult,
} from "./bridge.ts";
import type { ChainRecorder, ChainResult } from "./report.ts";

export interface SelectedFile {
  readonly grant_id: string;
  readonly file_name: string;
  readonly content_sha256: string;
  readonly size_bytes: number;
}

export type ImportOutcome = Extract<
  ProjectImportResult,
  { readonly documentSha256: string }
>;

export interface SubRun {
  readonly results: readonly ChainResult[];
  readonly extra: Record<string, unknown>;
}

/** Reconciles one emitted state view verbatim against frozen 1.0.0 data. */
export function assertStateViewFromContract(
  view: ImportFlowView,
  expectedStateId: ImportFlowStateId,
): ImportFlowStateView {
  assert(
    view.kind === "state",
    `expected a machine-state view for ${expectedStateId}, got ${view.kind}`,
  );
  assert(
    view.stateId === expectedStateId,
    `expected state ${expectedStateId}, got ${view.stateId}`,
  );
  const frozen = getUxStateFrom(UX_STATES_DATA, expectedStateId);
  assert(frozen !== undefined, `frozen contract is missing state ${expectedStateId}`);
  assert(
    JSON.stringify(view.requiredPresentation) ===
      JSON.stringify(frozen.requiredPresentation),
    `${expectedStateId}: requiredPresentation is not the verbatim frozen contract`,
  );
  assert(
    view.requiredPresentation.length > 0 &&
      view.requiredPresentation.every((item) => item.trim().length > 0),
    `${expectedStateId}: every requiredPresentation entry must be non-empty`,
  );
  assert(
    JSON.stringify(view.forbiddenSemantics) ===
      JSON.stringify(frozen.forbiddenSemantics),
    `${expectedStateId}: forbiddenSemantics must travel verbatim with the view`,
  );
  assert(
    JSON.stringify(view.a11y) === JSON.stringify(frozen.a11y),
    `${expectedStateId}: a11y is not the verbatim frozen contract`,
  );
  assert(
    view.label === frozen.label && view.cancelable === frozen.cancelable,
    `${expectedStateId}: label/cancelable diverged from the frozen contract`,
  );
  return view;
}

/** Records the distinct machine positions the flow actually visited. */
export class Trajectory {
  readonly #positions: string[] = [];

  public get positions(): readonly string[] {
    return this.#positions;
  }

  public note(view: ImportFlowView): void {
    const position =
      view.kind === "state" ? view.stateId : `project-view:${view.cause}`;
    if (this.#positions[this.#positions.length - 1] !== position) {
      this.#positions.push(position);
    }
  }

  public describe(): string {
    return this.#positions.join(" -> ");
  }

  public assertEquals(expected: readonly string[]): void {
    assert(
      JSON.stringify(this.#positions) === JSON.stringify(expected),
      `state trajectory [${this.describe()}] != expected [${expected.join(" -> ")}]`,
    );
  }
}

let importRequestOrdinal = 0;

/** Real file.import.select request at protocol 0.3.0 (ADR-0029 ①-b). */
export async function selectImportFiles(): Promise<readonly SelectedFile[]> {
  importRequestOrdinal += 1;
  // The 0xa02000 offset keeps these ids disjoint from bridge.ts hostRequest
  // ordinals: request ids are session-scoped and duplicates are rejected.
  const requestId = `req_${(0xa02000 + importRequestOrdinal).toString(16).padStart(32, "0")}`;
  const response = await window.wenshuHost.invoke({
    protocol_version: "0.3.0",
    kind: "request",
    request_id: requestId,
    capability: "file.import.select",
    capability_version: "0.3.0",
    input: { purpose: "import_markdown", multiple: true, extensions: ["md", "png"] },
  });
  assert(
    typeof response === "object" && response !== null,
    "file.import.select: response is not an object",
  );
  const envelope = response as Record<string, unknown>;
  assert(
    envelope["kind"] === "success",
    `file.import.select did not succeed: ${JSON.stringify(envelope)}`,
  );
  const output = envelope["output"];
  assert(
    typeof output === "object" && output !== null,
    "file.import.select output missing",
  );
  const files = (output as Record<string, unknown>)["files"];
  assert(
    Array.isArray(files) && files.length >= 1,
    "file.import.select returned no files",
  );
  return files.map((entry) => {
    assert(
      typeof entry === "object" && entry !== null,
      "file.import.select file entry is not an object",
    );
    const record = entry as Record<string, unknown>;
    // ADR-0029 ①-a: handles + display metadata only. The output structurally
    // has no path field, and file_name may never carry separators/colons.
    assert(
      JSON.stringify(Object.keys(record).sort()) ===
        JSON.stringify(["content_sha256", "file_name", "grant_id", "size_bytes"]),
      `file entry keys must be exactly grant_id/file_name/content_sha256/size_bytes: ` +
        Object.keys(record).join(","),
    );
    const grantId = record["grant_id"];
    const fileName = record["file_name"];
    const sha = record["content_sha256"];
    const size = record["size_bytes"];
    assert(
      typeof grantId === "string" && /^grant_[0-9a-f]{32}$/u.test(grantId),
      "grant_id malformed",
    );
    assert(
      typeof fileName === "string" && !/[\\/:]/u.test(fileName),
      `file_name carries a path separator: ${String(fileName)}`,
    );
    assert(
      typeof sha === "string" && /^[0-9a-f]{64}$/u.test(sha),
      "content_sha256 malformed",
    );
    assert(
      typeof size === "number" && Number.isInteger(size) && size >= 0,
      "size_bytes malformed",
    );
    return Object.freeze({
      grant_id: grantId,
      file_name: fileName,
      content_sha256: sha,
      size_bytes: size,
    });
  });
}

/** Real project.directory.select at protocol 0.2.0 (scripted in e2e mode). */
export async function selectProjectDirectory(): Promise<string> {
  const response = await hostInvoke("project.directory.select", {
    purpose: "open_project",
  });
  assert(
    response["kind"] === "success",
    `project.directory.select did not succeed: ${String(response["kind"])}`,
  );
  const output = response["output"];
  assert(
    typeof output === "object" && output !== null,
    "project.directory.select output missing",
  );
  const grantId = (output as Record<string, unknown>)["grant_id"];
  assert(
    typeof grantId === "string" && /^grant_[0-9a-f]{32}$/u.test(grantId),
    "directory grant_id malformed",
  );
  return grantId;
}

export interface ProgressWiring {
  readonly events: ChannelProgress[];
  readonly dispatchErrors: string[];
}

/**
 * Forwards real channel progress events into the flow controller. Dispatch
 * errors are recorded, never swallowed; callers assert the list is empty.
 */
export function wireProgress(
  flow: ImportFlowController,
  onFirst?: (progress: ChannelProgress) => void,
): ProgressWiring {
  const wiring: ProgressWiring = { events: [], dispatchErrors: [] };
  let firstSeen = false;
  projectBridge().onImportProgress((progress) => {
    wiring.events.push(progress);
    if (!firstSeen) {
      firstSeen = true;
      onFirst?.(progress);
    }
    try {
      flow.dispatch({
        type: "import-progress",
        progress: {
          phase: progress.phase,
          percent:
            progress.total > 0
              ? Math.round((progress.completed / progress.total) * 100)
              : 0,
        },
      });
    } catch (error) {
      wiring.dispatchErrors.push(
        error instanceof Error ? error.message : String(error),
      );
    }
  });
  return wiring;
}

/** Shared first step: the registry must declare file.import.select at 0.3.0. */
export async function assertRegistryDeclaresImportSelect(
  recorder: ChainRecorder,
  chainId: string,
): Promise<void> {
  await recorder.step(chainId, async () => {
    const registry = (await window.wenshuHost.registry()) as {
      capabilities?: readonly Record<string, unknown>[];
    };
    const declaration = registry.capabilities?.find(
      (entry) => entry["name"] === "file.import.select",
    );
    assert(declaration !== undefined, "registry missing file.import.select");
    assert(
      declaration["support_status"] === "supported",
      `file.import.select support_status: ${String(declaration["support_status"])}`,
    );
    assert(
      declaration["capability_version"] === "0.3.0",
      `file.import.select capability_version: ${String(declaration["capability_version"])}`,
    );
    return "file.import.select declared supported at capability 0.3.0";
  });
}

/** Shared second step: the initial view is the verbatim empty-project state. */
export async function assertInitialEmptyProject(
  recorder: ChainRecorder,
  chainId: string,
  flow: ImportFlowController,
): Promise<void> {
  await recorder.step(chainId, () => {
    const view = assertStateViewFromContract(flow.view(), "empty-project");
    return (
      `empty-project verbatim: ${view.requiredPresentation.length} required items, ` +
      `${view.forbiddenSemantics.length} forbidden semantics`
    );
  });
}

export function splitSelection(files: readonly SelectedFile[]): {
  readonly source: SelectedFile;
  readonly assets: readonly SelectedFile[];
} {
  const source = files.find((file) => file.file_name.endsWith(".md"));
  assert(source !== undefined, "no .md source among the selected files");
  return { source, assets: files.filter((file) => file !== source) };
}

export function assertProgressWiringClean(wiring: ProgressWiring): void {
  assert(
    wiring.dispatchErrors.length === 0,
    `progress dispatch errors: ${wiring.dispatchErrors.join("; ")}`,
  );
  assert(wiring.events.length >= 1, "no import progress events observed");
}

/** No-op progress wiring for flows that only need the importing view alive. */
export function wiringHelper(flow: ImportFlowController): void {
  projectBridge().onImportProgress((progress) => {
    try {
      flow.dispatch({
        type: "import-progress",
        progress: {
          phase: progress.phase,
          percent:
            progress.total > 0
              ? Math.round((progress.completed / progress.total) * 100)
              : 0,
        },
      });
    } catch {
      // A late event after the terminal dispatch is ignored, never fatal.
    }
  });
}
