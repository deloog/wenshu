/**
 * CI-01 BLOCKER-1 / MAJOR-1: the classifier's input comes from a real git
 * invocation. Mocking runDiff (as scope.unit.test.ts does) proves decideScope
 * is rigorous, but says nothing about the command line that feeds it — and
 * BLOCKER-1 (rename detection hiding the deleted source path) lived exactly
 * on that seam. These tests run the real `runGitDiff` against a real
 * temporary repository, including a cross-boundary `git mv`.
 *
 * Mutation anchor: removing `--no-renames` from runGitDiff turns the first
 * test red (the rename then reports only docs/pipeline-moved.ts and the
 * classifier misjudges docs_only=true).
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { decideScope, runGitDiff } from "../src/scope.ts";

function git(repoDir: string, args: readonly string[]): string {
  const result = spawnSync("git", [...args], { cwd: repoDir, encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${result.stderr ?? ""}`,
  );
  return (result.stdout ?? "").trim();
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "ci-scope-git-"));
  git(dir, ["init", "--quiet"]);
  git(dir, ["config", "user.email", "ci-scope@test.invalid"]);
  git(dir, ["config", "user.name", "ci-scope-test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
}

function commitAll(dir: string, message: string): string {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "--quiet", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]);
}

function writeRepoFile(dir: string, relativePath: string, content: string): void {
  mkdirSync(dirname(join(dir, relativePath)), { recursive: true });
  writeFileSync(join(dir, relativePath), content);
}

function classify(dir: string, baseSha: string, headSha: string) {
  return decideScope({
    eventName: "push",
    baseSha,
    headSha,
    runDiff: (base, head, event) => runGitDiff(base, head, event, dir),
  });
}

test("real git: cross-boundary rename does NOT hide the deleted source (BLOCKER-1, counterexample 7)", (t) => {
  const dir = initRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeRepoFile(dir, "packages/pdf-export/src/pipeline.ts", "export const x = 1;\n");
  const baseSha = commitAll(dir, "base");

  mkdirSync(join(dir, "docs"), { recursive: true });
  git(dir, ["mv", "packages/pdf-export/src/pipeline.ts", "docs/pipeline-moved.ts"]);
  const headSha = commitAll(dir, "rename source into docs");

  // Ground truth of the attack: with default rename detection the diff shows
  // ONLY the destination path; --no-renames must surface both sides.
  const raw = git(dir, ["diff", "--name-only", `${baseSha}..${headSha}`]);
  assert.equal(
    raw,
    "docs/pipeline-moved.ts",
    "attack precondition: rename hides the source path by default",
  );

  const decision = classify(dir, baseSha, headSha);
  assert.equal(
    decision.docsOnly,
    false,
    "rename of source into docs/ must force a full run",
  );
  assert.ok(
    decision.changedFiles.includes("packages/pdf-export/src/pipeline.ts"),
    `deleted source path must be classified, got: ${decision.changedFiles.join(", ")}`,
  );
  assert.ok(decision.changedFiles.includes("docs/pipeline-moved.ts"));
});

test("real git: genuine docs-only change still classifies docs_only=true (no over-correction)", (t) => {
  const dir = initRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeRepoFile(dir, "packages/pdf-export/src/pipeline.ts", "export const x = 1;\n");
  const baseSha = commitAll(dir, "base");

  writeRepoFile(dir, "docs/audits/new-note.md", "# note\n");
  writeRepoFile(dir, "AGENTS.md", "# agents\n");
  const headSha = commitAll(dir, "docs only");

  const decision = classify(dir, baseSha, headSha);
  assert.equal(decision.docsOnly, true, decision.reason);
  assert.deepEqual([...decision.changedFiles].sort(), [
    "AGENTS.md",
    "docs/audits/new-note.md",
  ]);
});

test("real git: pull_request three-dot range against merge base works", (t) => {
  const dir = initRepo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  writeRepoFile(dir, "tools/ci/src/scope.ts", "export {};\n");
  const baseSha = commitAll(dir, "base");

  const decision = decideScope({
    eventName: "pull_request",
    baseSha,
    headSha: (() => {
      writeRepoFile(dir, "docs/x.md", "# x\n");
      return commitAll(dir, "docs");
    })(),
    runDiff: (base, head, event) => runGitDiff(base, head, event, dir),
  });
  assert.equal(decision.docsOnly, true, decision.reason);
});
