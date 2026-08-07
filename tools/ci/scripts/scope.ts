import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { decideScope, type DiffResult } from "../src/scope.ts";

const eventName = process.env["CI_SCOPE_EVENT"] ?? "";
const baseSha = process.env["CI_SCOPE_BASE"];
const headSha = process.env["CI_SCOPE_HEAD"];

function runDiff(base: string, head: string, event: string): DiffResult {
  // pull_request: three-dot diff against the merge base; push: direct before..after.
  const range = event === "pull_request" ? `${base}...${head}` : `${base}..${head}`;
  const result = spawnSync("git", ["diff", "--name-only", range], { encoding: "utf8" });
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

const decision = decideScope({ eventName, baseSha, headSha, runDiff });

console.log(
  `[ci:scope] event=${eventName || "∅"} base=${baseSha || "∅"} head=${headSha || "∅"}`,
);
console.log(`[ci:scope] changed files (${decision.changedFiles.length}):`);
for (const file of decision.changedFiles) console.log(`  ${file}`);
console.log(`[ci:scope] docs_only=${decision.docsOnly} — ${decision.reason}`);

const outputPath = process.env["GITHUB_OUTPUT"];
if (outputPath !== undefined && outputPath !== "") {
  appendFileSync(outputPath, `docs_only=${decision.docsOnly}\n`, "utf8");
} else {
  console.log(
    "[ci:scope] GITHUB_OUTPUT not set (local run), decision printed above only",
  );
}
