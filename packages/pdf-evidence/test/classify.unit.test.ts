/**
 * 失败分类单元测试：preflightPdf 的纯字节判定（合成字节，不触文件系统）。
 * 真实损坏 fixture 经 extractEvidence 的端到端分类见 baseline.integration.test.ts。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { preflightPdf } from "../src/classify.ts";

const encoder = new TextEncoder();

function pdfBytes(body: string): Uint8Array {
  return encoder.encode(`%PDF-1.7\n${body}\n%%EOF\n`);
}

test("zero bytes classify as EMPTY", () => {
  const issue = preflightPdf(new Uint8Array(0));
  assert.equal(issue?.code, "PDF_EVIDENCE_EMPTY");
  assert.equal(issue?.location, "file");
});

test("missing %PDF- magic classifies as MALFORMED at header", () => {
  const issue = preflightPdf(encoder.encode("not a pdf at all, definitely not"));
  assert.equal(issue?.code, "PDF_EVIDENCE_MALFORMED");
  assert.equal(issue?.location, "header");
});

test("missing %%EOF tail classifies as MALFORMED at eof (truncation)", () => {
  const issue = preflightPdf(pdfBytes("1 0 obj\n<<>>\nendobj").subarray(0, 12));
  assert.equal(issue?.code, "PDF_EVIDENCE_MALFORMED");
  assert.equal(issue?.location, "eof");
});

test("/Encrypt marker classifies as ENCRYPTED and never attempts decryption", () => {
  const issue = preflightPdf(pdfBytes("trailer\n<< /Root 1 0 R /Encrypt 2 0 R >>"));
  assert.equal(issue?.code, "PDF_EVIDENCE_ENCRYPTED");
  assert.equal(issue?.location, "trailer");
});

test("plain well-formed pipeline-shaped bytes pass preflight", () => {
  const issue = preflightPdf(pdfBytes("1 0 obj\n<< /Type /Catalog >>\nendobj"));
  assert.equal(issue, null);
});

test("the word Encrypt inside a stream without the /Encrypt marker does not trigger", () => {
  // 内容流中出现 Encrypt 文本但不是 /Encrypt 键：不误判（整词 + 斜杠前缀）。
  const issue = preflightPdf(
    pdfBytes("5 0 obj\n<< /Length 20 >>\nstream\nEncryptNow data\nendstream\nendobj"),
  );
  assert.equal(issue, null);
});
