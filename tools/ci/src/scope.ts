/**
 * CI-01 change-scope classification (fail-closed).
 *
 * Decides whether a CI run may skip the jobs that cannot be affected by
 * documentation-only changes. Every doubt resolves to "full run": saving
 * quota always yields to fail-closed (task book §4.1). The skip set and the
 * docs-insensitivity proofs per skipped job live in the CI-01 task book D1
 * and the implementation record §5.4; this module only answers "did anything
 * outside the recognized documentation surface change?".
 */

import { spawnSync } from "node:child_process";

/**
 * A changed file counts as documentation iff it lives under docs/ or is a
 * root-level .md — with one exception: docs/poc-a/** is consumed by
 * fixtures:check (contracts job, see tools/fixtures/scripts/check-fixtures.ts
 * reading docs/poc-a/fixtures), so it is NOT part of the skippable surface
 * (§5.4 trace finding; conservative exclusion, full run on any touch).
 */
export function isDocumentationPath(filePath: string): boolean {
  if (filePath.startsWith("docs/poc-a/")) return false;
  return filePath.startsWith("docs/") || /^[^/]+\.md$/u.test(filePath);
}

export interface DiffResult {
  readonly status: number;
  readonly stdout: string;
}

/**
 * Runs the real git diff that feeds the classifier.
 *
 * `--no-renames` is load-bearing (BLOCKER-1): with git's default rename
 * detection, a rename reports ONLY the destination path — moving
 * packages/x/src/a.ts to docs/a.ts would surface solely as a docs path and
 * misclassify as docs-only while source code was deleted. --no-renames
 * reports rename as delete + add, so both sides are classified.
 *
 * Exported (with cwd) so the integration test can exercise the exact command
 * line against a real temporary repository instead of a mock.
 */
export function runGitDiff(
  baseSha: string,
  headSha: string,
  eventName: string,
  cwd?: string,
): DiffResult {
  // pull_request: three-dot diff against the merge base; push: direct before..after.
  const range =
    eventName === "pull_request" ? `${baseSha}...${headSha}` : `${baseSha}..${headSha}`;
  const result = spawnSync("git", ["diff", "--name-only", "--no-renames", range], {
    encoding: "utf8",
    cwd,
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

export interface ScopeInput {
  readonly eventName: string;
  readonly baseSha: string | undefined;
  readonly headSha: string | undefined;
  readonly runDiff: (baseSha: string, headSha: string, eventName: string) => DiffResult;
}

export interface ScopeDecision {
  readonly docsOnly: boolean;
  readonly reason: string;
  readonly changedFiles: readonly string[];
}

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ZERO_SHA_PATTERN = /^0{40}$/u;

function full(reason: string, changedFiles: readonly string[] = []): ScopeDecision {
  return Object.freeze({
    docsOnly: false,
    reason,
    changedFiles: Object.freeze([...changedFiles]),
  });
}

export function decideScope(input: ScopeInput): ScopeDecision {
  if (input.eventName !== "pull_request" && input.eventName !== "push") {
    return full(`event "${input.eventName}" is not classifiable`);
  }
  const baseSha = input.baseSha ?? "";
  const headSha = input.headSha ?? "";
  if (!SHA_PATTERN.test(baseSha) || ZERO_SHA_PATTERN.test(baseSha)) {
    return full(`base sha unavailable or unusable ("${baseSha || "∅"}")`);
  }
  if (!SHA_PATTERN.test(headSha)) {
    return full(`head sha unavailable or unusable ("${headSha || "∅"}")`);
  }
  const diff = input.runDiff(baseSha, headSha, input.eventName);
  if (diff.status !== 0) {
    return full(`git diff failed with status ${diff.status}`);
  }
  const changedFiles = diff.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (changedFiles.length === 0) {
    return full("empty diff is undetermined");
  }
  if (!changedFiles.every(isDocumentationPath)) {
    return full("non-documentation file changed", changedFiles);
  }
  return Object.freeze({
    docsOnly: true,
    reason: "all changed files are documentation",
    changedFiles: Object.freeze(changedFiles),
  });
}
