import { appendFileSync } from "node:fs";

import { decideScope, runGitDiff } from "../src/scope.ts";

const eventName = process.env["CI_SCOPE_EVENT"] ?? "";
const baseSha = process.env["CI_SCOPE_BASE"];
const headSha = process.env["CI_SCOPE_HEAD"];

const decision = decideScope({ eventName, baseSha, headSha, runDiff: runGitDiff });

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
