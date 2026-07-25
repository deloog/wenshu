/**
 * 检出报告契约测试：合法/畸形 fixture、版本冻结、诊断不回显、结构预算。
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { CHECK_REPORT_VERSION, validateCheckReport } from "../src/validate-report.ts";

const validDir = join(import.meta.dirname, "..", "fixtures", "valid");
const invalidDir = join(import.meta.dirname, "..", "fixtures", "invalid");

function readFixture(dir: string, file: string): unknown {
  return JSON.parse(readFileSync(join(dir, file), "utf8"));
}

test("report version constant is frozen at 1.0.0", () => {
  assert.equal(CHECK_REPORT_VERSION, "1.0.0");
});

for (const file of readdirSync(validDir)) {
  test(`valid fixture passes: ${file}`, () => {
    const result = validateCheckReport(readFixture(validDir, file));
    assert.ok(result.ok, JSON.stringify(result.ok ? [] : result.issues));
    assert.ok(Object.isFrozen(result.value));
  });
}

for (const file of readdirSync(invalidDir)) {
  test(`invalid fixture fails with stable code+path: ${file}`, () => {
    const fixture = readFixture(invalidDir, file) as Record<string, unknown>;
    const expectedIssue = fixture["expectedIssue"];
    const expectedPath = fixture["expectedPath"];
    assert.equal(typeof expectedIssue, "string");
    assert.equal(typeof expectedPath, "string");
    delete fixture["expectedIssue"];
    delete fixture["expectedPath"];
    const result = validateCheckReport(fixture);
    assert.ok(!result.ok, `${file} must not validate`);
    assert.ok(
      result.issues.some(
        (entry) => entry.code === expectedIssue && entry.path === expectedPath,
      ),
      JSON.stringify(result.issues),
    );
  });
}

test("diagnostics never echo report content", () => {
  const marker = "S3CRET-MARKER-不应外泄";
  const result = validateCheckReport({
    checkReportVersion: "1.0.0",
    source: { evidenceSha256: marker },
    rules: ["p0-page-size"],
    findings: [],
  });
  assert.ok(!result.ok);
  assert.ok(!JSON.stringify(result.issues).includes(marker));
});

test("non-plain structures are rejected by the budget inspector", () => {
  const result = validateCheckReport(() => ({}));
  assert.ok(!result.ok);
  assert.equal(result.issues[0]?.code, "CHECK_REPORT_STRUCTURE");
});
