import {
  validateProjectContract,
  type ModelContext,
  type SemanticAuditEvent,
  type SourceReference,
} from "@wenshu/project-contract";

export interface MaterialPresence {
  readonly material_id: string;
  readonly sha256: string;
}

export interface AuditExplanation {
  readonly nodeId: string;
  readonly aiDecisions: readonly SemanticAuditEvent[];
  readonly humanFollowups: readonly SemanticAuditEvent[];
  readonly sources: readonly SourceReference[];
  readonly materials: readonly {
    readonly material_id: string;
    readonly exists: boolean;
  }[];
}

export interface AiDecisionInput {
  readonly event_id: string;
  readonly project_id: string;
  readonly occurred_at: string;
  readonly proposal: { readonly diffs: readonly { readonly nodeId: string }[] };
  readonly decision: "accepted" | "rejected";
  readonly before_sha256: string;
  readonly after_sha256: string;
  readonly subject_model_context: ModelContext;
}

function frozen<T>(value: T): T {
  return Object.freeze(value);
}

function nodeIds(proposal: {
  readonly diffs: readonly { readonly nodeId: string }[];
}): readonly string[] {
  return frozen([...new Set(proposal.diffs.map((diff) => diff.nodeId))]);
}

/**
 * In-memory semantic-event truth stream. It deliberately accepts only event
 * metadata and hashes: requests, field values, prompts, and keystrokes have
 * no API entry point.
 */
export class SemanticAuditTrail {
  #events: SemanticAuditEvent[] = [];

  public record(input: unknown): SemanticAuditEvent {
    const result = validateProjectContract(input);
    if (!result.ok) {
      throw new Error("SEMANTIC_AUDIT_EVENT_REJECTED");
    }
    if (result.value.contract_kind !== "semantic_audit_event") {
      throw new Error("SEMANTIC_AUDIT_EVENT_REJECTED");
    }
    const value = result.value;
    if (value.sequence !== this.#events.length) {
      throw new Error("SEMANTIC_AUDIT_SEQUENCE_REJECTED");
    }
    if (this.#events.some((event) => event.event_id === value.event_id)) {
      throw new Error("SEMANTIC_AUDIT_DUPLICATE_ID");
    }
    const event = frozen(structuredClone(value));
    this.#events.push(event);
    return event;
  }

  public recordAiDecision(input: AiDecisionInput): SemanticAuditEvent {
    const affected_node_ids = nodeIds(input.proposal);
    if (affected_node_ids.length === 0) throw new Error("SEMANTIC_AUDIT_EMPTY_DIFF");
    return this.record({
      contract_kind: "semantic_audit_event",
      schema_version: "0.2.0",
      event_id: input.event_id,
      project_id: input.project_id,
      sequence: this.#events.length,
      occurred_at: input.occurred_at,
      actor: "user",
      action: "ai_change_decided",
      decision: input.decision,
      affected_node_ids,
      before_sha256: input.before_sha256,
      before_hash_subject: "document",
      after_sha256: input.after_sha256,
      after_hash_subject: "document",
      source_refs: [],
      subject_model_context: input.subject_model_context,
    });
  }

  public events(): readonly SemanticAuditEvent[] {
    return frozen([...this.#events]);
  }

  public explain(
    nodeId: string,
    materials: readonly MaterialPresence[],
  ): AuditExplanation {
    const related = this.#events.filter((event) =>
      event.affected_node_ids.includes(nodeId),
    );
    const sources = related.flatMap((event) => event.source_refs);
    const known = new Set(
      materials.map((item) => `${item.material_id}:${item.sha256}`),
    );
    return frozen({
      nodeId,
      aiDecisions: frozen(
        related.filter((event) => event.action === "ai_change_decided"),
      ),
      humanFollowups: frozen(
        related.filter((event) => event.action === "user_changed_after_ai"),
      ),
      sources: frozen(sources),
      materials: frozen(
        sources.map((source) =>
          frozen({
            material_id: source.material_id,
            exists: known.has(`${source.material_id}:${source.sha256}`),
          }),
        ),
      ),
    });
  }
}
