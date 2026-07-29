import type { SemanticAuditEvent } from "./generated/project-contract.ts";
import type { ProjectContractIssue, ProjectContractIssueCode } from "./validation.ts";

function issue(code: ProjectContractIssueCode, path: string): ProjectContractIssue {
  return Object.freeze({ code, path });
}

export function isCanonicalTimestamp(value: string): boolean {
  const parsed = new Date(value);
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === normalized;
}

export const SYSTEM_ALLOWED_ACTION = "template_applied" as const;

function validateHashSubjects(
  event: SemanticAuditEvent,
): readonly ProjectContractIssue[] {
  if (event.schema_version === "0.1.0") {
    return Object.freeze(
      event.action === "template_applied"
        ? [issue("PROJECT_AUDIT_HASH_INVALID", "/schema_version")]
        : [],
    );
  }
  const expectedSubject = event.action === "template_applied" ? "template" : "document";
  const issues: ProjectContractIssue[] = [];
  if (
    event.before_hash_subject !== expectedSubject ||
    event.after_hash_subject !== expectedSubject
  ) {
    issues.push(issue("PROJECT_AUDIT_HASH_INVALID", "/before_hash_subject"));
  }
  if (event.before_sha256 === null || event.after_sha256 === null) {
    issues.push(issue("PROJECT_AUDIT_HASH_INVALID", "/after_hash_subject"));
  }
  return Object.freeze(issues);
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
    issues.push(issue("PROJECT_AUDIT_DECISION_INVALID", "/decision"));
  }
  if (!isCanonicalTimestamp(event.occurred_at)) {
    issues.push(issue("PROJECT_TIMESTAMP_INVALID", "/occurred_at"));
  }

  const hasModelSubject = event.subject_model_context !== null;
  const hasAffectedNodes = event.affected_node_ids.length > 0;
  const hasBefore = event.before_sha256 !== null;
  const hasAfter = event.after_sha256 !== null;
  const hashesDiffer =
    hasBefore && hasAfter && event.before_sha256 !== event.after_sha256;
  const hashesMatch =
    hasBefore && hasAfter && event.before_sha256 === event.after_sha256;
  issues.push(...validateHashSubjects(event));
  if (event.actor === "system" && event.action !== SYSTEM_ALLOWED_ACTION) {
    issues.push(issue("PROJECT_AUDIT_RESPONSIBILITY_INVALID", "/action"));
  }

  switch (event.action) {
    case "ai_change_decided":
      if (event.actor !== "user" || !hasModelSubject || !hasAffectedNodes) {
        const path =
          event.actor !== "user"
            ? "/actor"
            : !hasModelSubject
              ? "/subject_model_context"
              : "/affected_node_ids";
        issues.push(issue("PROJECT_AUDIT_RESPONSIBILITY_INVALID", path));
      }
      if (
        (event.decision === "accepted" && !hashesDiffer) ||
        (event.decision === "rejected" && !hashesMatch)
      ) {
        issues.push(issue("PROJECT_AUDIT_HASH_INVALID", "/after_sha256"));
      }
      break;
    case "user_changed_after_ai":
      if (event.actor !== "user" || !hasModelSubject || !hasAffectedNodes) {
        const path =
          event.actor !== "user"
            ? "/actor"
            : !hasModelSubject
              ? "/subject_model_context"
              : "/affected_node_ids";
        issues.push(issue("PROJECT_AUDIT_RESPONSIBILITY_INVALID", path));
      }
      if (!hashesDiffer) {
        issues.push(issue("PROJECT_AUDIT_HASH_INVALID", "/after_sha256"));
      }
      break;
    case "source_linked":
      if (hasModelSubject || !hasAffectedNodes || event.source_refs.length === 0) {
        const path = hasModelSubject
          ? "/subject_model_context"
          : !hasAffectedNodes
            ? "/affected_node_ids"
            : "/source_refs";
        issues.push(issue("PROJECT_AUDIT_RESPONSIBILITY_INVALID", path));
      }
      if (!hashesDiffer) {
        issues.push(issue("PROJECT_AUDIT_HASH_INVALID", "/after_sha256"));
      }
      break;
    case "template_applied":
      if (hasModelSubject || hasAffectedNodes || event.source_refs.length > 0) {
        const path = hasModelSubject
          ? "/subject_model_context"
          : hasAffectedNodes
            ? "/affected_node_ids"
            : "/source_refs";
        issues.push(issue("PROJECT_AUDIT_RESPONSIBILITY_INVALID", path));
      }
      if (!hashesDiffer) {
        issues.push(issue("PROJECT_AUDIT_HASH_INVALID", "/after_sha256"));
      }
      break;
    case "formal_version_approved":
      if (
        event.actor !== "user" ||
        hasModelSubject ||
        hasAffectedNodes ||
        event.source_refs.length > 0
      ) {
        const path =
          event.actor !== "user"
            ? "/actor"
            : hasModelSubject
              ? "/subject_model_context"
              : hasAffectedNodes
                ? "/affected_node_ids"
                : "/source_refs";
        issues.push(issue("PROJECT_AUDIT_RESPONSIBILITY_INVALID", path));
      }
      if (!hashesMatch) {
        issues.push(issue("PROJECT_AUDIT_HASH_INVALID", "/after_sha256"));
      }
      break;
  }
  return Object.freeze(issues);
}
