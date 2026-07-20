import assert from "node:assert/strict";
import test from "node:test";

import {
  checkFileSize,
  checkForbiddenSyntax,
  countLines,
  hasExactExtension,
  hasNoncanonicalCodeExtension,
  TYPESCRIPT_EXTENSIONS,
} from "../src/index.ts";

function lines(count: number): string {
  return Array.from({ length: count }, () => "const value = 1;").join("\n");
}

test("line counting handles empty, final-newline, and CRLF input", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("one\n"), 1);
  assert.equal(countLines("one\r\ntwo\r\n"), 2);
});

test("production size guard warns at 300 and fails above 400", () => {
  assert.deepEqual(checkFileSize("src/small.ts", lines(299)), []);
  assert.equal(checkFileSize("src/warn.ts", lines(300))[0]?.severity, "warning");
  assert.equal(checkFileSize("src/limit.ts", lines(400))[0]?.severity, "warning");
  assert.equal(checkFileSize("src/fail.ts", lines(401))[0]?.severity, "error");
});

test("test size guard warns at 300 and fails above 500", () => {
  assert.deepEqual(checkFileSize("test/small.unit.test.ts", lines(299)), []);
  assert.equal(
    checkFileSize("test/warn.unit.test.ts", lines(300))[0]?.severity,
    "warning",
  );
  assert.equal(
    checkFileSize("test/limit.unit.test.ts", lines(500))[0]?.severity,
    "warning",
  );
  assert.equal(
    checkFileSize("test/fail.unit.test.ts", lines(501))[0]?.severity,
    "error",
  );
});

test("generated declarations do not trigger handwritten size limits", () => {
  const generated = "packages/model/src/generated/types.ts";
  assert.deepEqual(checkFileSize(generated, lines(900), [generated]), []);
  assert.equal(checkFileSize(generated, lines(401))[0]?.severity, "error");
});

test("explicit any and suppression directives fail without false positives", () => {
  assert.deepEqual(
    checkForbiddenSyntax("src/safe.ts", "const company = 'anywhere';\n"),
    [],
  );
  const findings = checkForbiddenSyntax(
    "src/unsafe.ts",
    [
      `type Unsafe = ${"a" + "ny"};`,
      `// @ts-${"ignore"}`,
      `// @ts-${"expect-error"} reason`,
      `// @ts-${"nocheck"}`,
      `// eslint-${"disable"}-next-line`,
    ].join("\n"),
  );
  assert.deepEqual(
    new Set(findings.map((finding) => finding.rule)),
    new Set(["explicit-any", "forbidden-suppression"]),
  );
  assert.equal(findings.length, 5);
});

test("module TypeScript extensions receive the same syntax and size guards", () => {
  for (const extension of [".ts", ".tsx", ".mts", ".cts"]) {
    const file = `src/module${extension}`;
    assert.equal(hasExactExtension(file, TYPESCRIPT_EXTENSIONS), true);
    assert.equal(
      checkForbiddenSyntax(file, `export type Unsafe = ${"a" + "ny"};`)[0]?.rule,
      "explicit-any",
    );
    assert.equal(checkFileSize(file, lines(401))[0]?.severity, "error");
  }
  assert.equal(hasNoncanonicalCodeExtension("src/module.TS"), true);
  assert.equal(hasNoncanonicalCodeExtension("src/module.mts"), false);
});
