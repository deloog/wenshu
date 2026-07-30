/**
 * Roadmap model types and task/requirement identifier extraction.
 * Pure text utilities; no file system access.
 */

/** Well-formed task identifier, e.g. `G1-03C`, `PA-14U`, `PB-05A`, `A-10X`. */
export const TASK_ID_PATTERN = /^(?:G[123]|PA|PB|A)-\d{2}[A-Z]?$/u;

/** Well-formed requirement identifier, e.g. `R-PDF`, `R-PA-METRIC`. */
export const REQUIREMENT_ID_PATTERN = /^R-[A-Z][A-Z0-9-]*$/u;

const SCAN_PATTERN =
  /(?<![A-Za-z0-9])(G[123]|PA|PB|A)-(\d{2}[A-Z]?)(?![A-Za-z0-9])|\/(\d{2}[A-Z]?)(?![A-Za-z0-9])/gu;

/**
 * Token that looks like a task identifier but is not well-formed
 * (e.g. `PB-O9` with a letter O). Detection is restricted to the
 * structural positions declared in the task book; prose is never scanned.
 */
const SUSPICIOUS_ID_PATTERN = /\b(?:G[123]?|PA|PB|A)-[A-Za-z0-9]{2,3}\b/gu;

/**
 * Extracts task identifiers from a structural cell, expanding the
 * roadmap shorthand (`G1-08/11/16` → `G1-08`, `G1-11`, `G1-16`).
 * A shorthand segment inherits the family prefix of the preceding full ID.
 */
export function extractTaskIds(text: string): readonly string[] {
  const ids: string[] = [];
  let lastPrefix: string | undefined;
  for (const match of text.matchAll(SCAN_PATTERN)) {
    if (match[1] !== undefined) {
      ids.push(`${match[1]}-${match[2]}`);
      lastPrefix = match[1];
    } else if (lastPrefix !== undefined) {
      ids.push(`${lastPrefix}-${match[3]}`);
    }
  }
  return Object.freeze(ids);
}

/** Finds ID-like but malformed tokens (check 1c). */
export function extractSuspiciousIdTokens(text: string): readonly string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(SUSPICIOUS_ID_PATTERN)) {
    if (!TASK_ID_PATTERN.test(match[0])) {
      tokens.add(match[0]);
    }
  }
  return Object.freeze([...tokens]);
}

export function extractRequirementIds(text: string): readonly string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/R-[A-Z][A-Z0-9-]*\b/gu)) {
    if (REQUIREMENT_ID_PATTERN.test(match[0])) {
      ids.push(match[0]);
    }
  }
  return Object.freeze(ids);
}

export interface TaskRow {
  readonly id: string;
  readonly line: number;
  readonly dependencies: readonly string[];
  readonly consumers: readonly string[];
  readonly requirementIds: readonly string[];
}

export interface LedgerRow {
  readonly id: string;
  readonly line: number;
  readonly status: string;
  /** Raw link targets (`[text](target)`) found anywhere in the row. */
  readonly links: readonly string[];
}

export interface CriticalEdge {
  readonly from: string;
  readonly to: string;
  readonly line: number;
}

export interface WaveGroup {
  readonly wave: string;
  readonly line: number;
  readonly taskIds: readonly string[];
}

export interface IdReference {
  readonly id: string;
  readonly line: number;
  readonly position: string;
}

export interface SuspiciousIdToken {
  readonly token: string;
  readonly line: number;
  readonly position: string;
}

export interface RequirementAnnotation {
  readonly id: string;
  readonly line: number;
  readonly position: string;
}

export interface ParseIssue {
  readonly line: number;
  readonly message: string;
}

export interface ParseCounts {
  readonly tasks: number;
  readonly dependencyEdges: number;
  readonly requirementIds: number;
  readonly ledgerEntries: number;
  readonly criticalPathEdges: number;
  readonly waveGroups: number;
}

export interface RoadmapModel {
  readonly tasks: readonly TaskRow[];
  readonly ledger: readonly LedgerRow[];
  readonly criticalEdges: readonly CriticalEdge[];
  readonly waves: readonly { readonly wave: string; readonly line: number }[];
  readonly waveGroups: readonly WaveGroup[];
  readonly requirementDefs: readonly string[];
  readonly matrixRequirementIds: readonly string[];
  readonly idReferences: readonly IdReference[];
  readonly suspiciousTokens: readonly SuspiciousIdToken[];
  readonly requirementAnnotations: readonly RequirementAnnotation[];
  readonly counts: ParseCounts;
}

export interface RoadmapParseResult {
  readonly model: RoadmapModel;
  /** Rows that could not be parsed; never silently skipped. */
  readonly issues: readonly ParseIssue[];
}
