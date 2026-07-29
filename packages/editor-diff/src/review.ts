import {
  fromProseMirrorDocument,
  RandomIdAllocator,
  toProseMirrorDocument,
} from "@wenshu/semantic-editor";
import { TransactionManager } from "@wenshu/editor-transactions";
import { ModelToolGateway, type ToolPermission } from "@wenshu/semantic-tools";

import type { DiffProposal, ProposalStatus, ReviewResult } from "./contract.ts";
import { diffDocuments } from "./diff.ts";

interface StoredProposal {
  readonly id: string;
  readonly request: unknown;
  readonly diffs: DiffProposal["diffs"];
  status: ProposalStatus;
}

function expose(proposal: StoredProposal): DiffProposal {
  return Object.freeze({
    id: proposal.id,
    request: proposal.request,
    diffs: proposal.diffs,
    status: proposal.status,
  });
}

function cloneRequest(request: unknown): unknown {
  return freezeData(structuredClone(request));
}

function freezeData(value: unknown): unknown {
  if (Array.isArray(value)) {
    value.forEach(freezeData);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freezeData);
    return Object.freeze(value);
  }
  return value;
}

/**
 * Keeps AI suggestions in an isolated preview manager. The real manager only
 * changes when one pending proposal is explicitly accepted through PB-04.
 */
export class DiffReview {
  #nextId = 1;
  #proposals = new Map<string, StoredProposal>();
  #accepted: string[] = [];
  readonly #gateway: ModelToolGateway;
  readonly #permission: ToolPermission;
  private readonly manager: TransactionManager;

  public constructor(manager: TransactionManager, permission: ToolPermission) {
    this.manager = manager;
    this.#permission = Object.freeze({
      allowedTools: Object.freeze([...permission.allowedTools]),
      writableNodeIds: Object.freeze([...permission.writableNodeIds]),
    });
    this.#gateway = new ModelToolGateway(manager, this.#permission);
  }

  public list(): readonly DiffProposal[] {
    return Object.freeze([...this.#proposals.values()].map(expose));
  }

  public async propose(requests: readonly unknown[]): Promise<readonly DiffProposal[]> {
    const preview = new TransactionManager(
      toProseMirrorDocument(fromProseMirrorDocument(this.manager.snapshot())),
      new RandomIdAllocator(),
    );
    const previewGateway = new ModelToolGateway(preview, this.#permission);
    const created: DiffProposal[] = [];
    for (const untrusted of requests) {
      const request = cloneRequest(untrusted);
      const before = fromProseMirrorDocument(preview.snapshot());
      const outcome = await previewGateway.invoke(request);
      const id = `proposal_${this.#nextId.toString().padStart(6, "0")}`;
      this.#nextId += 1;
      const after = fromProseMirrorDocument(preview.snapshot());
      const stored: StoredProposal = {
        id,
        request,
        diffs:
          outcome.status === "committed"
            ? diffDocuments(before, after, id)
            : Object.freeze([]),
        status: outcome.status === "committed" ? "pending" : "rejected",
      };
      this.#proposals.set(id, stored);
      created.push(expose(stored));
    }
    return Object.freeze(created);
  }

  public reject(id: string): ReviewResult {
    const proposal = this.#proposals.get(id);
    if (proposal === undefined || proposal.status !== "pending") {
      return Object.freeze({
        status: "not_pending",
        proposal: proposal && expose(proposal),
      });
    }
    proposal.status = "rejected";
    return Object.freeze({ status: "rejected", proposal: expose(proposal) });
  }

  public async accept(id: string): Promise<ReviewResult> {
    const proposal = this.#proposals.get(id);
    if (proposal === undefined)
      return Object.freeze({ status: "not_accepted", proposal: undefined });
    if (proposal.status !== "pending") {
      return Object.freeze({ status: "not_pending", proposal: expose(proposal) });
    }
    const outcome = await this.#gateway.invoke(proposal.request);
    if (outcome.status !== "committed") {
      return Object.freeze({
        status: "transaction_rolled_back",
        proposal: expose(proposal),
      });
    }
    proposal.status = "accepted";
    this.#accepted.push(id);
    return Object.freeze({ status: "accepted", proposal: expose(proposal) });
  }

  public undoAccepted(): ReviewResult {
    const id = this.#accepted.at(-1);
    const proposal = id === undefined ? undefined : this.#proposals.get(id);
    if (proposal === undefined || proposal.status !== "accepted") {
      return Object.freeze({
        status: "not_accepted",
        proposal: proposal && expose(proposal),
      });
    }
    this.manager.undo();
    proposal.status = "reverted";
    this.#accepted.pop();
    return Object.freeze({ status: "reverted", proposal: expose(proposal) });
  }
}
