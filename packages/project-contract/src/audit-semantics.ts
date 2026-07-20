import type { SemanticAuditEvent } from "./generated/project-contract.ts";
import type { ProjectContractIssue } from "./validation.ts";

function issue(path: string): ProjectContractIssue {
  return Object.freeze({ code: "PROJECT_INTEGRITY", path });
}

export function isCanonicalTimestamp(value: string): boolean {
  const parsed = new Date(value);
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === normalized;
}

function looksSensitiveIdentifier(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    /^(?:sk[-_]|aiza|gh[pousr]_|xox[baprs]-)/u.test(normalized) ||
    /(?:key|secret|token)/u.test(normalized.slice(0, 24))
  );
}

export function validateAudit(
  event: SemanticAuditEvent,
): readonly ProjectContractIssue[] {
  const issues: ProjectContractIssue[] = [];
  const expectedDecision = {
    ai_change_decided: ["accepted", "rejected"],
    user_changed_after_ai: ["applied"],
    source_linked: ["applied"],
    template_applied: ["applied"],
    formal_version_approved: ["approved"],
  }[event.action];
  if (!expectedDecision.includes(event.decision)) {
    issues.push(issue("/decision"));
  }
  if (!isCanonicalTimestamp(event.occurred_at)) {
    issues.push(issue("/occurred_at"));
  }

  const hasModelSubject = event.subject_model_context !== null;
  const hasAffectedNodes = event.affected_node_ids.length > 0;
  const hasBefore = event.before_sha256 !== null;
  const hasAfter = event.after_sha256 !== null;
  const hashesDiffer =
    hasBefore && hasAfter && event.before_sha256 !== event.after_sha256;
  const hashesMatch =
    hasBefore && hasAfter && event.before_sha256 === event.after_sha256;
  if (
    event.subject_model_context !== null &&
    (looksSensitiveIdentifier(event.subject_model_context.provider) ||
      looksSensitiveIdentifier(event.subject_model_context.model))
  ) {
    issues.push(issue("/subject_model_context"));
  }

  switch (event.action) {
    case "ai_change_decided":
      if (event.actor !== "user" || !hasModelSubject || !hasAffectedNodes) {
        issues.push(issue("/actor"));
      }
      if (
        (event.decision === "accepted" && !hashesDiffer) ||
        (event.decision === "rejected" && !hashesMatch)
      ) {
        issues.push(issue("/after_sha256"));
      }
      break;
    case "user_changed_after_ai":
      if (
        event.actor !== "user" ||
        !hasModelSubject ||
        !hasAffectedNodes ||
        !hashesDiffer
      ) {
        issues.push(issue("/action"));
      }
      break;
    case "source_linked":
      if (
        hasModelSubject ||
        !hasAffectedNodes ||
        !hashesDiffer ||
        event.source_refs.length === 0
      ) {
        issues.push(issue("/action"));
      }
      break;
    case "template_applied":
      if (
        event.actor !== "user" ||
        hasModelSubject ||
        !hashesDiffer ||
        hasAffectedNodes ||
        event.source_refs.length > 0
      ) {
        issues.push(issue("/action"));
      }
      break;
    case "formal_version_approved":
      if (
        event.actor !== "user" ||
        hasModelSubject ||
        !hashesMatch ||
        hasAffectedNodes ||
        event.source_refs.length > 0
      ) {
        issues.push(issue("/action"));
      }
      break;
  }
  return Object.freeze(issues);
}
