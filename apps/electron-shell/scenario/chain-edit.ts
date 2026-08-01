import {
  fromProseMirrorDocument,
  RandomIdAllocator,
  toProseMirrorDocument,
  type ProseMirrorDocument,
} from "@wenshu/semantic-editor";
import type { SupportedDocument } from "@wenshu/document-model";
import { TransactionManager } from "@wenshu/editor-transactions";
import { DiffReview, type DiffProposal } from "@wenshu/editor-diff";
import { SemanticAuditTrail } from "@wenshu/semantic-audit";
import type { SemanticAuditEvent } from "@wenshu/project-contract";

import { assert, sha256Hex } from "./bridge.ts";
import {
  auditEventId,
  buildInitialDocument,
  MODEL_CONTEXT,
  PROJECT_ID,
  REJECTED_INSERT_TEXT,
  REWRITE_ONE_TEXT,
  REWRITE_TWO_TEXT,
  scriptedAiPlan,
  scriptedPermission,
} from "./fixture.ts";
import { ChainRecorder, type ChainResult } from "./report.ts";

export interface EditChainOutcome {
  readonly results: readonly ChainResult[];
  readonly finalDocument: SupportedDocument;
  readonly audits: readonly SemanticAuditEvent[];
}

function canonical(document: ProseMirrorDocument): string {
  return JSON.stringify(fromProseMirrorDocument(document));
}

function proposalNodeIds(proposal: DiffProposal): readonly { nodeId: string }[] {
  return proposal.diffs.map((diff) => ({ nodeId: diff.anchor.nodeId }));
}

/**
 * Chain 1: AI proposal -> partial accept/partial reject -> undo/redo round
 * trip, all inside the sandboxed renderer against the real PB-03/04/05 stack.
 * ModelToolGateway.invoke is exercised through DiffReview (preview proposals
 * and real-source accepts both go through the gateway).
 */
export async function runEditChain(): Promise<EditChainOutcome> {
  const recorder = new ChainRecorder();
  const manager = new TransactionManager(
    toProseMirrorDocument(buildInitialDocument()),
    new RandomIdAllocator(),
  );
  const review = new DiffReview(manager, scriptedPermission());
  const trail = new SemanticAuditTrail();
  const originalCanonical = canonical(manager.snapshot());
  const originalHash = await sha256Hex(new TextEncoder().encode(originalCanonical));
  let finalDocument: SupportedDocument | undefined;
  let proposals: readonly DiffProposal[] = [];

  await recorder.step("edit-propose", async () => {
    const created = await review.propose(scriptedAiPlan());
    assert(created.length === 3, `expected 3 proposals, got ${created.length}`);
    assert(
      created.every((proposal) => proposal.status === "pending"),
      "every scripted proposal must commit in preview",
    );
    proposals = created;
    return `3 proposals pending, diffs=${created.map((p) => p.diffs.length).join("/")}`;
  });

  await recorder.step("edit-proposal-isolation", () => {
    const after = canonical(manager.snapshot());
    assert(
      after === originalCanonical,
      "unaccepted proposals must not touch the real source (byte-identical check)",
    );
    return (
      "real source byte-identical after propose (sha256 prefix " +
      `${originalHash.slice(0, 16)})`
    );
  });

  await recorder.step("edit-partial-decision", async () => {
    const [rewriteOne, insertRejected, rewriteTwo] = proposals;
    assert(
      rewriteOne !== undefined &&
        insertRejected !== undefined &&
        rewriteTwo !== undefined,
      "proposal list shape",
    );
    const rejected = review.reject(insertRejected.id);
    assert(rejected.status === "rejected", `reject returned ${rejected.status}`);
    trail.recordAiDecision({
      event_id: auditEventId(0),
      project_id: PROJECT_ID,
      occurred_at: new Date().toISOString(),
      proposal: { diffs: proposalNodeIds(insertRejected) },
      decision: "rejected",
      before_sha256: originalHash,
      after_sha256: originalHash,
      subject_model_context: MODEL_CONTEXT,
    });
    const acceptedOne = await review.accept(rewriteOne.id);
    assert(
      acceptedOne.status === "accepted",
      `accept A returned ${acceptedOne.status}`,
    );
    const afterOneCanonical = canonical(manager.snapshot());
    trail.recordAiDecision({
      event_id: auditEventId(1),
      project_id: PROJECT_ID,
      occurred_at: new Date().toISOString(),
      proposal: { diffs: proposalNodeIds(rewriteOne) },
      decision: "accepted",
      before_sha256: originalHash,
      after_sha256: await sha256Hex(new TextEncoder().encode(afterOneCanonical)),
      subject_model_context: MODEL_CONTEXT,
    });
    const acceptedTwo = await review.accept(rewriteTwo.id);
    assert(
      acceptedTwo.status === "accepted",
      `accept C returned ${acceptedTwo.status}`,
    );
    const afterTwoCanonical = canonical(manager.snapshot());
    trail.recordAiDecision({
      event_id: auditEventId(2),
      project_id: PROJECT_ID,
      occurred_at: new Date().toISOString(),
      proposal: { diffs: proposalNodeIds(rewriteTwo) },
      decision: "accepted",
      before_sha256: await sha256Hex(new TextEncoder().encode(afterOneCanonical)),
      after_sha256: await sha256Hex(new TextEncoder().encode(afterTwoCanonical)),
      subject_model_context: MODEL_CONTEXT,
    });
    assert(afterTwoCanonical.includes(REWRITE_ONE_TEXT), "accepted rewrite A missing");
    assert(afterTwoCanonical.includes(REWRITE_TWO_TEXT), "accepted rewrite C missing");
    assert(
      !afterTwoCanonical.includes(REJECTED_INSERT_TEXT),
      "rejected insert B must never reach the real source",
    );
    return "A+C accepted, B rejected; source contains only accepted edits";
  });

  await recorder.step("edit-undo-redo", () => {
    const afterBothCanonical = canonical(manager.snapshot());
    manager.undo();
    const backToOne = canonical(manager.snapshot());
    assert(!backToOne.includes(REWRITE_TWO_TEXT), "undo must revert rewrite C");
    manager.undo();
    assert(
      canonical(manager.snapshot()) === originalCanonical,
      "undo x2 must restore the original document byte-identically",
    );
    manager.redo();
    assert(
      canonical(manager.snapshot()) === backToOne,
      "redo must restore the post-A state byte-identically",
    );
    manager.redo();
    assert(
      canonical(manager.snapshot()) === afterBothCanonical,
      "redo x2 must restore the post-C state byte-identically",
    );
    return "undo/undo/redo/redo round trip byte-identical at every step";
  });

  await recorder.step("edit-undo-accepted", () => {
    const reverted = review.undoAccepted();
    assert(reverted.status === "reverted", `undoAccepted returned ${reverted.status}`);
    const current = canonical(manager.snapshot());
    assert(current.includes(REWRITE_ONE_TEXT), "rewrite A must survive C revert");
    assert(!current.includes(REWRITE_TWO_TEXT), "rewrite C must be reverted");
    finalDocument = fromProseMirrorDocument(manager.snapshot());
    return "accepted proposal C reverted via DiffReview.undoAccepted";
  });

  assert(finalDocument !== undefined, "edit chain did not reach final state");
  return { results: recorder.results, finalDocument, audits: trail.events() };
}
