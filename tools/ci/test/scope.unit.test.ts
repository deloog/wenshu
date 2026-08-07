import assert from "node:assert/strict";
import test from "node:test";

import { decideScope, isDocumentationPath, type DiffResult } from "../src/scope.ts";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);

function diffWith(
  files: readonly string[],
  status = 0,
): (base: string, head: string, event: string) => DiffResult {
  return () => ({ status, stdout: files.join("\n") + (files.length > 0 ? "\n" : "") });
}

test("documentation path recognition is conservative", () => {
  assert.equal(isDocumentationPath("docs/audits/x.md"), true);
  assert.equal(isDocumentationPath("docs/implementation-roadmap.md"), true);
  assert.equal(isDocumentationPath("AGENTS.md"), true);
  assert.equal(isDocumentationPath("决策记录.md"), true);
  assert.equal(isDocumentationPath("packages/pdf-export/src/pipeline.ts"), false);
  assert.equal(isDocumentationPath("packages/web/README.md"), false); // nested .md is NOT in the docs surface
  assert.equal(isDocumentationPath("docs/poc-a/fixtures/pa-05-baseline.md"), false); // read by fixtures:check (contracts job)
  assert.equal(isDocumentationPath("docs/poc-a/anything.md"), false);
  assert.equal(isDocumentationPath(".github/PULL_REQUEST_TEMPLATE.md"), false);
  assert.equal(isDocumentationPath("tools/ci/src/scope.ts"), false);
  assert.equal(isDocumentationPath("pnpm-lock.yaml"), false);
});

test("docs-only change set is classified docs_only=true", () => {
  const decision = decideScope({
    eventName: "pull_request",
    baseSha: BASE,
    headSha: HEAD,
    runDiff: diffWith([
      "docs/audits/CI-01-x.md",
      "docs/implementation-roadmap.md",
      "AGENTS.md",
      "决策记录.md",
    ]),
  });
  assert.equal(decision.docsOnly, true);
  assert.equal(decision.changedFiles.length, 4);
});

test("any code or config file forces a full run", () => {
  for (const files of [
    ["packages/pdf-export/src/pipeline.ts"],
    ["docs/audits/x.md", "packages/web/src/main.ts"], // mixed
    ["docs/x.md", "packages/web/README.md"], // nested markdown is not documentation surface
    [".github/workflows/verify.yml"],
    ["docs/x.md", ".prettierignore"],
  ]) {
    const decision = decideScope({
      eventName: "pull_request",
      baseSha: BASE,
      headSha: HEAD,
      runDiff: diffWith(files),
    });
    assert.equal(decision.docsOnly, false, `expected full run for ${files.join(",")}`);
    assert.notEqual(decision.reason, "");
  }
});

test("fail-closed: every undetermined form yields a full run (counterexample 4)", () => {
  const cases: ReadonlyArray<{
    name: string;
    input: Parameters<typeof decideScope>[0];
  }> = [
    {
      name: "diff command non-zero exit",
      input: {
        eventName: "pull_request",
        baseSha: BASE,
        headSha: HEAD,
        runDiff: diffWith([], 128),
      },
    },
    {
      name: "diff output empty",
      input: { eventName: "push", baseSha: BASE, headSha: HEAD, runDiff: diffWith([]) },
    },
    {
      name: "base sha all zeros (force-push / new branch)",
      input: {
        eventName: "push",
        baseSha: "0".repeat(40),
        headSha: HEAD,
        runDiff: diffWith(["docs/x.md"]),
      },
    },
    {
      name: "base sha missing",
      input: {
        eventName: "push",
        baseSha: undefined,
        headSha: HEAD,
        runDiff: diffWith(["docs/x.md"]),
      },
    },
    {
      name: "base sha malformed",
      input: {
        eventName: "push",
        baseSha: "not-a-sha",
        headSha: HEAD,
        runDiff: diffWith(["docs/x.md"]),
      },
    },
    {
      name: "head sha missing",
      input: {
        eventName: "push",
        baseSha: BASE,
        headSha: undefined,
        runDiff: diffWith(["docs/x.md"]),
      },
    },
    {
      name: "unclassifiable event (workflow_dispatch)",
      input: {
        eventName: "workflow_dispatch",
        baseSha: undefined,
        headSha: HEAD,
        runDiff: diffWith(["docs/x.md"]),
      },
    },
  ];
  for (const { name, input } of cases) {
    const decision = decideScope(input);
    assert.equal(decision.docsOnly, false, `fail-open detected: ${name}`);
    assert.notEqual(decision.reason, "", `reason required: ${name}`);
  }
});

test("a docs-only push event with valid baseline is still skippable", () => {
  const decision = decideScope({
    eventName: "push",
    baseSha: BASE,
    headSha: HEAD,
    runDiff: diffWith(["docs/audits/new-report-note.md"]),
  });
  assert.equal(decision.docsOnly, true);
});
