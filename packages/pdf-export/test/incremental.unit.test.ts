import assert from "node:assert/strict";
import test from "node:test";

import type { TocEntry, WenshuDocument } from "@wenshu/document-model";

import { PdfExportError } from "../src/errors.ts";
import type { GeometryTextRun, PdfGeometry } from "../src/geometry.ts";
import {
  buildPageTextIndex,
  evaluateCascade,
  locateAnchorPage,
  recomputeTocPagesAfterWindow,
  resolveEditAnchor,
  runKeyTagFree,
  tocPagesDrifted,
  updateTocPages,
} from "../src/incremental.ts";

/** 合成 run 工厂：只填本模块消费的字段，其余置中性值。 */
function run(pageIndex: number, text: string, x = 0, baselineY = 0): GeometryTextRun {
  return Object.freeze({
    pageIndex,
    text,
    bbox: Object.freeze({ x, y: baselineY + 10, width: 10, height: 10 }),
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

function doc(blocks: WenshuDocument["blocks"]): WenshuDocument {
  return {
    schemaVersion: "0.2.0",
    id: "d",
    title: "测试文档",
    metadata: {},
    assets: [],
    blocks,
  } as unknown as WenshuDocument;
}

// ---------------------------------------------------------------------------
// runKeyTagFree / 页证据比对口径（tag-free 键逐字段口径：ADR-0033 §4，A2B-F1）
// ---------------------------------------------------------------------------

test("runKeyTagFree ignores font tag but pins text/geometry", () => {
  const a = run(0, "同文", 42, 700);
  const b = { ...run(0, "同文", 42, 700), font: { ...a.font, tag: "F99" } };
  assert.equal(runKeyTagFree(a), runKeyTagFree(b));
  const moved = run(0, "同文", 43, 700);
  assert.notEqual(runKeyTagFree(a), runKeyTagFree(moved));
  const resized = { ...run(0, "同文", 42, 700), fontSize: 10 };
  assert.notEqual(runKeyTagFree(a), runKeyTagFree(resized));
});

test("runKeyTagFree ignores only the three print-variant fields", () => {
  const a = run(0, "同文", 42, 700);
  // 打印相关字段（每 print 调用重分配/可漂移）：变更必须判等，否则跨打印比对全异
  assert.equal(
    runKeyTagFree(a),
    runKeyTagFree({ ...a, font: { ...a.font, objectId: 99 } }),
  );
  assert.equal(
    runKeyTagFree(a),
    runKeyTagFree({ ...a, font: { ...a.font, tag: "F99" } }),
  );
  assert.equal(
    runKeyTagFree(a),
    runKeyTagFree({ ...a, bbox: { ...a.bbox, height: 99 } }),
  );
});

test("runKeyTagFree pins every semantic field (A2B-F1 decisive mutations)", () => {
  const a = run(0, "同文", 42, 700);
  const mutants: readonly [string, GeometryTextRun][] = [
    ["text", { ...a, text: "异文" }],
    ["baselineY", { ...a, baselineY: 701 }],
    ["bbox.x", { ...a, bbox: { ...a.bbox, x: 43 } }],
    ["bbox.y", { ...a, bbox: { ...a.bbox, y: a.bbox.y + 1 } }],
    ["bbox.width", { ...a, bbox: { ...a.bbox, width: a.bbox.width * 2 } }],
    ["fontSize", { ...a, fontSize: 10 }],
    ["blockOrder", { ...a, blockOrder: 7 }],
    ["viaActualText", { ...a, viaActualText: true }],
    ["figureMcid", { ...a, figureMcid: 3 }],
    ["font.family", { ...a, font: { ...a.font, family: "Other" } }],
    ["font.weight", { ...a, font: { ...a.font, weight: 700 } }],
    ["font.subset", { ...a, font: { ...a.font, subset: false } }],
    ["font.embedded", { ...a, font: { ...a.font, embedded: false } }],
  ];
  for (const [field, mutant] of mutants) {
    assert.notEqual(
      runKeyTagFree(a),
      runKeyTagFree(mutant),
      `mutating ${field} must change the key`,
    );
  }
});

// ---------------------------------------------------------------------------
// buildPageTextIndex / locateAnchorPage
// ---------------------------------------------------------------------------

test("locateAnchorPage returns the unique matching page (0-based)", () => {
  const geo = geometry(3, [
    run(0, "封面"),
    run(1, "第一章 总则 内容"),
    run(2, "第二章 细则 内容"),
  ]);
  const index = buildPageTextIndex(geo);
  assert.equal(index.length, 3);
  assert.equal(locateAnchorPage(index, "第一章 总则", "t"), 1);
  assert.equal(locateAnchorPage(index, "细则", "t"), 2);
});

test("locateAnchorPage fails closed on zero hits", () => {
  const index = Object.freeze(["页一内容", "页二内容"]);
  assert.throws(
    () => locateAnchorPage(index, "不存在的锚", "missing"),
    (error: unknown) =>
      error instanceof PdfExportError &&
      error.code === "PDF_EXPORT_INCREMENTAL_FALLBACK",
  );
});

test("locateAnchorPage fails closed on ambiguous anchor (multi-page hit)", () => {
  const index = Object.freeze(["重复段落 甲", "重复段落 乙"]);
  assert.throws(
    () => locateAnchorPage(index, "重复段落", "ambiguous"),
    (error: unknown) =>
      error instanceof PdfExportError &&
      error.code === "PDF_EXPORT_INCREMENTAL_FALLBACK",
  );
});

test("locateAnchorPage fails closed on empty anchor", () => {
  assert.throws(
    () => locateAnchorPage(Object.freeze(["内容"]), "   ", "empty"),
    (error: unknown) =>
      error instanceof PdfExportError &&
      error.code === "PDF_EXPORT_INCREMENTAL_FALLBACK",
  );
});

// ---------------------------------------------------------------------------
// resolveEditAnchor
// ---------------------------------------------------------------------------

const para = (id: string, text: string) =>
  ({ id, type: "paragraph", text }) as unknown as WenshuDocument["blocks"][number];

test("resolveEditAnchor: modified block anchors to its OLD text", () => {
  const oldDoc = doc([para("p1", "修改前的原文内容")]);
  const newDoc = doc([para("p1", "修改后的新文内容")]);
  const anchor = resolveEditAnchor(oldDoc, newDoc, "p1");
  assert.equal(anchor.startsWith("修改前的原文内容".slice(0, 8)), true);
});

test("resolveEditAnchor: inserted block anchors to nearest OLD predecessor", () => {
  const oldDoc = doc([para("p1", "既有段落")]);
  const newDoc = doc([para("p1", "既有段落"), para("p-new", "全新插入段落")]);
  assert.equal(resolveEditAnchor(oldDoc, newDoc, "p-new"), "既有段落");
});

test("resolveEditAnchor: insertion at document head fails closed (no predecessor)", () => {
  const oldDoc = doc([para("p1", "既有段落")]);
  const newDoc = doc([para("p-new", "文首插入"), para("p1", "既有段落")]);
  assert.throws(
    () => resolveEditAnchor(oldDoc, newDoc, "p-new"),
    (error: unknown) =>
      error instanceof PdfExportError &&
      error.code === "PDF_EXPORT_INCREMENTAL_FALLBACK",
  );
});

test("resolveEditAnchor: structural block (pageBreak) fails closed", () => {
  const pb = {
    id: "pb1",
    type: "pageBreak",
    reason: "source",
  } as unknown as WenshuDocument["blocks"][number];
  const d = doc([pb]);
  assert.throws(
    () => resolveEditAnchor(d, d, "pb1"),
    (error: unknown) =>
      error instanceof PdfExportError &&
      error.code === "PDF_EXPORT_INCREMENTAL_FALLBACK",
  );
});

test("resolveEditAnchor: node absent from both documents fails closed", () => {
  const d = doc([para("p1", "内容")]);
  assert.throws(
    () => resolveEditAnchor(d, d, "ghost"),
    (error: unknown) =>
      error instanceof PdfExportError &&
      error.code === "PDF_EXPORT_INCREMENTAL_FALLBACK",
  );
});

// ---------------------------------------------------------------------------
// evaluateCascade（级联状态机）
// ---------------------------------------------------------------------------

test("cascade: sentinel equal closes with delta = newWindowPages - oldWindowPages", () => {
  const step = evaluateCascade({
    windowStart: 9,
    windowEnd: 9,
    oldPageCount: 30,
    printedPages: 2, // 1 窗页 + 1 哨兵
    sentinelEqual: true,
  });
  assert.deepEqual(step, {
    kind: "closed",
    newWindowPages: 1,
    newPageCount: 30,
    delta: 0,
    degeneratedToFull: false,
  });
});

test("cascade: sentinel mismatch extends the window by one page", () => {
  const step = evaluateCascade({
    windowStart: 9,
    windowEnd: 9,
    oldPageCount: 30,
    printedPages: 2,
    sentinelEqual: false,
  });
  assert.deepEqual(step, { kind: "extend", newWindowEnd: 10 });
});

test("cascade: no old sentinel page (grew past old tail) extends", () => {
  const step = evaluateCascade({
    windowStart: 28,
    windowEnd: 29,
    oldPageCount: 30,
    printedPages: 3,
    sentinelEqual: null,
  });
  assert.deepEqual(step, { kind: "extend", newWindowEnd: 30 });
});

test("cascade: short print closes at EOF with recomputed total", () => {
  // 请求 12 页（11 窗页 + 1 哨兵）实出 10 页 → 新文档在窗内到尾，29 页
  const step = evaluateCascade({
    windowStart: 9,
    windowEnd: 19,
    oldPageCount: 30,
    printedPages: 10,
    sentinelEqual: null,
  });
  assert.deepEqual(step, {
    kind: "closed",
    newWindowPages: 10,
    newPageCount: 19,
    delta: -11,
    degeneratedToFull: false,
  });
});

test("cascade: window covering from page 0 to EOF is flagged degeneratedToFull", () => {
  const step = evaluateCascade({
    windowStart: 0,
    windowEnd: 29,
    oldPageCount: 30,
    printedPages: 29,
    sentinelEqual: null,
  });
  assert.equal(step.kind, "closed");
  if (step.kind === "closed") {
    assert.equal(step.degeneratedToFull, true);
    assert.equal(step.newPageCount, 29);
  }
});

test("cascade: over-production is a contract violation → fallback", () => {
  const step = evaluateCascade({
    windowStart: 9,
    windowEnd: 9,
    oldPageCount: 30,
    printedPages: 3,
    sentinelEqual: true,
  });
  assert.equal(step.kind, "fallback");
});

// ---------------------------------------------------------------------------
// updateTocPages / tocPagesDrifted
// ---------------------------------------------------------------------------

test("updateTocPages: entries before window unchanged, in window relocated, after shifted", () => {
  const tocPages = new Map([
    ["s1", 3], // 窗前
    ["s2", 10], // 窗内（旧页 10）
    ["s3", 20], // 窗后
  ]);
  const anchors = new Map([
    ["s1", "第一章"],
    ["s2", "第二章"],
    ["s3", "第三章"],
  ]);
  const updated = updateTocPages({
    tocPages,
    anchors,
    windowStart: 9, // 0 基 = 第 10 页
    oldWindowPages: 2, // 窗覆盖旧第 10–11 页
    newWindowPageRuns: Object.freeze([
      Object.freeze([run(0, "前文 第二章 后文")]), // 新窗第 1 页（=第 10 页）
      Object.freeze([run(0, "无关内容")]),
      Object.freeze([run(0, "延续内容")]), // 新窗扩到 3 页
    ]),
    delta: 1,
  });
  assert.equal(updated.get("s1"), 3);
  assert.equal(updated.get("s2"), 10); // 窗内重定位：新窗页 0 → 第 10 页
  assert.equal(updated.get("s3"), 21); // 窗后移位 +1
});

test("updateTocPages: ambiguous in-window heading anchor fails closed", () => {
  const tocPages = new Map([["s2", 10]]);
  const anchors = new Map([["s2", "重复标题"]]);
  assert.throws(
    () =>
      updateTocPages({
        tocPages,
        anchors,
        windowStart: 9,
        oldWindowPages: 1,
        newWindowPageRuns: Object.freeze([
          Object.freeze([run(0, "重复标题 甲")]),
          Object.freeze([run(0, "重复标题 乙")]),
        ]),
        delta: 0,
      }),
    (error: unknown) =>
      error instanceof PdfExportError &&
      error.code === "PDF_EXPORT_INCREMENTAL_FALLBACK",
  );
});

test("updateTocPages: missing anchor entry fails closed", () => {
  const tocPages = new Map([["s2", 10]]);
  assert.throws(
    () =>
      updateTocPages({
        tocPages,
        anchors: new Map(),
        windowStart: 9,
        oldWindowPages: 1,
        newWindowPageRuns: Object.freeze([Object.freeze([run(0, "任何内容")])]),
        delta: 0,
      }),
    (error: unknown) =>
      error instanceof PdfExportError &&
      error.code === "PDF_EXPORT_INCREMENTAL_FALLBACK",
  );
});

test("recomputeTocPagesAfterWindow: empty entry set passes the old map through", () => {
  const tocPages = new Map([["s1", 3]]);
  const passthrough = recomputeTocPagesAfterWindow({
    entries: Object.freeze([]),
    tocPages,
    windowStart: 1,
    oldWindowPages: 1,
    newWindowGeometry: geometry(2, [run(0, "任意")]),
    newWindowPages: 1,
    delta: 0,
  });
  assert.equal(passthrough, tocPages);
});

test("recomputeTocPagesAfterWindow: builds anchors from entries and relocates in-window", () => {
  const entries: readonly TocEntry[] = Object.freeze([
    Object.freeze({ id: "s1", title: "第一章", level: 1 }),
    Object.freeze({ id: "s2", title: "第二章", level: 1 }),
  ]);
  const tocPages = new Map([
    ["s1", 2], // 窗前
    ["s2", 5], // 窗内
  ]);
  const updated = recomputeTocPagesAfterWindow({
    entries,
    tocPages,
    windowStart: 4, // 0 基 = 第 5 页
    oldWindowPages: 1,
    newWindowGeometry: geometry(2, [run(0, "前文 第二章 后文"), run(1, "延续")]),
    newWindowPages: 2, // 扩窗收束
    delta: 0,
  });
  assert.equal(updated.get("s1"), 2);
  assert.equal(updated.get("s2"), 5); // 新窗页 0 → 第 5 页
});

test("tocPagesDrifted detects value and membership drift", () => {
  const a = new Map([
    ["s1", 3],
    ["s2", 10],
  ]);
  assert.equal(
    tocPagesDrifted(
      a,
      new Map([
        ["s1", 3],
        ["s2", 10],
      ]),
    ),
    false,
  );
  assert.equal(
    tocPagesDrifted(
      a,
      new Map([
        ["s1", 3],
        ["s2", 11],
      ]),
    ),
    true,
  );
  assert.equal(tocPagesDrifted(a, new Map([["s1", 3]])), true);
  assert.equal(
    tocPagesDrifted(
      a,
      new Map([
        ["s1", 3],
        ["s2", 10],
        ["s3", 20],
      ]),
    ),
    true,
  );
});
