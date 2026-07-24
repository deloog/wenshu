import { resolve } from "node:path";

import { importMarkdownDocument } from "../src/index.ts";

const fixture = resolve(
  import.meta.dirname,
  "../../../docs/poc-a/fixtures/golden-report.md",
);
const result = await importMarkdownDocument(fixture, resolve(fixture, ".."));
const { reconciliation } = result;
console.log(`document: ${result.document.title} (${result.document.documentId})`);
console.log(
  `reconciliation: ${reconciliation.sourceChars} chars = ` +
    `${reconciliation.contentChars} content + ${reconciliation.syntaxChars} syntax + ` +
    `${reconciliation.newlineChars} newlines`,
);
console.log(`counts: ${JSON.stringify(reconciliation.counts)}`);
console.log(`renames: ${JSON.stringify(result.renames)}`);
