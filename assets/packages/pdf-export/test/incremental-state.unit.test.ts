import assert from "node:assert/strict";
import test from "node:test";

import type { GeometryTextRun, PdfGeometry } from "../src/geometry.ts";
import { locateTocPageIndex } from "../src/incremental-state.ts";

/**
 * incremental-state.ts 单元测试（A2B-F2：locateTocPageIndex 字距拆字修复）。
 * 合成 run/geometry 工厂与 incremental.unit.test.ts 同形态，只填消费字段。
 */

function run(pageIndex: number, text: string, baselineY = 0): GeometryTextRun {
  return Object.freeze({
    pageIndex,
    text,
    bbox: Object.freeze({ x: 0, y: 10, width: 10, height: 10 }),
    baselineY,
    fontSize: 12,
    font: Object.freeze({
      objectId: 1,
      tag: "F1",
      family: "Test",
      weight: 400,
      subset: true,
      embedded: true,
    }),
    blockOrder: 0,
    viaActualText: false,
    figureMcid: null,
  });
}

function geometry(pages: number, runs: GeometryTextRun[]): PdfGeometry {
  return Object.freeze({
    pages: Object.freeze(
      Array.from({ length: pages }, (_, index) =>
        Object.freeze({
          index,
          mediaBox: Object.freeze([0, 0, 595, 842]),
          rotate: 0 as const,
        }),
      ),
    ),
    textRuns: Object.freeze(runs),
    figures: Object.freeze([]),
  });
}

test("locateTocPageIndex matches a letter-spaced heading split into single-char runs", () => {
  const geo = geometry(3, [
    run(0, "封面"),
    run(1, "目"),
    run(1, "录"),
    run(2, "正文内容"),
  ]);
  assert.equal(locateTocPageIndex(geo), 1);
});

test("locateTocPageIndex tolerates whitespace-only runs inside the split heading", () => {
  const geo = geometry(2, [run(0, "目"), run(0, "   "), run(0, "录"), run(1, "正文")]);
  assert.equal(locateTocPageIndex(geo), 0);
});

test("locateTocPageIndex ignores a longer body run merely containing the heading", () => {
  const geo = geometry(2, [run(0, "见目录页说明"), run(1, "正文内容")]);
  assert.equal(locateTocPageIndex(geo), null);
});

test("locateTocPageIndex rejects a split-run occurrence embedded mid-line", () => {
  // 封面说明行内嵌「目录」（实测形态）：行内各字同基线 → 不独立成行 → 不算命中
  const geo = geometry(2, [
    run(0, "报", 100),
    run(0, "目", 100),
    run(0, "录", 100),
    run(0, "告", 100),
    run(1, "目", 200),
    run(1, "录", 200),
  ]);
  assert.equal(locateTocPageIndex(geo), 1);
});

test("locateTocPageIndex returns null when only a mid-line occurrence exists", () => {
  const geo = geometry(1, [
    run(0, "报", 100),
    run(0, "目", 100),
    run(0, "录", 100),
    run(0, "告", 100),
  ]);
  assert.equal(locateTocPageIndex(geo), null);
});

test("locateTocPageIndex returns null on multi-page or zero hits", () => {
  const multi = geometry(2, [run(0, "目录"), run(1, "目录")]);
  assert.equal(locateTocPageIndex(multi), null);
  const zero = geometry(1, [run(0, "正文内容")]);
  assert.equal(locateTocPageIndex(zero), null);
});
