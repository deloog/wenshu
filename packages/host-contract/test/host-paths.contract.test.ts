import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateHostContract } from "../src/index.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function successFixture(): Promise<Record<string, unknown>> {
  const fixture = JSON.parse(
    await readFile(new URL("../fixtures/valid/success.json", import.meta.url), "utf8"),
  ) as unknown;
  if (!isRecord(fixture) || !isRecord(fixture["output"])) {
    throw new Error("Success fixture must contain an output object.");
  }
  return fixture;
}

test("encoded and drive-relative paths cannot bypass value checks", async () => {
  const fixture = await successFixture();
  for (const unsafeValue of [
    "C:drive-relative.txt",
    "C%253A%252FWindows%252FSystem32",
    "%252E%252E%252Fescape.txt",
  ]) {
    const candidate = structuredClone(fixture);
    if (!isRecord(candidate["output"])) {
      throw new Error("Cloned fixture must contain an output object.");
    }
    candidate["output"]["grant_id"] = unsafeValue;
    const result = validateHostContract(candidate);
    assert.equal(result.ok, false, unsafeValue);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "HOST_PLATFORM_FIELD_FORBIDDEN");
    }
  }
});

test("absolute, prefixed, and control-bearing paths are rejected", async () => {
  const fixture = await successFixture();
  const unsafeValues = [
    "report.pdf\nC:/Windows/win.ini",
    "output=C:/Windows/win.ini",
    "report.pdfC:/Windows/win.ini",
    "output=C:private.txt",
    "output=/etc/passwd",
    "//server/share/secret.txt",
    "//10.0.0.1/c$/Windows/win.ini",
    "///etc/shadow",
    "\\Windows\\win.ini",
    "output=//server/share/secret.txt",
    "output=///etc/shadow",
    "output=\\Windows\\win.ini",
    "output=\\\\server\\share\\secret.txt",
    "output=file:///etc/passwd",
    "output=../secret.txt",
    "output=%252Fetc%252Fpasswd",
    "output=%zz",
    "report.pdf\u0000hidden",
  ];
  for (const unsafeValue of unsafeValues) {
    const candidate = structuredClone(fixture);
    if (!isRecord(candidate["output"])) {
      throw new Error("Cloned fixture must contain an output object.");
    }
    candidate["output"]["grant_id"] = unsafeValue;
    const result = validateHostContract(candidate);
    assert.equal(result.ok, false, unsafeValue);
    if (!result.ok) {
      assert.deepEqual(result.issues[0], {
        code: "HOST_PLATFORM_FIELD_FORBIDDEN",
        path: "/output/grant_id",
      });
    }
  }
});

test("ordinary identifiers, percentages, and web values remain valid", async () => {
  const fixture = await successFixture();
  for (const safeValue of [
    "report.pdf",
    "assets/image.png",
    "50% complete",
    "anchor:section-1",
    "mode:fast",
    "mailto:a@b.com",
    "data:text/plain;hello",
    "http://example.com/resource",
    "https://example.com/resource",
  ]) {
    const candidate = structuredClone(fixture);
    if (!isRecord(candidate["output"])) {
      throw new Error("Cloned fixture must contain an output object.");
    }
    candidate["output"]["grant_id"] = safeValue;
    assert.equal(validateHostContract(candidate).ok, true, safeValue);
  }
});
