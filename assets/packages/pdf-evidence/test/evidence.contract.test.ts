import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import evidenceSchemaV1_0_0 from "../schema/evidence-1.0.0.schema.json" with { type: "json" };
import evidenceSchema from "../schema/evidence.schema.json" with { type: "json" };
import {
  EVIDENCE_VERSION,
  SUPPORTED_EVIDENCE_VERSIONS,
  validateEvidence,
} from "../src/index.ts";
import type { WenshuPdfEvidence } from "../src/index.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(path: URL): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function fixtureFiles(kind: "invalid" | "valid"): Promise<URL[]> {
  const directory = new URL(`../fixtures/${kind}/`, import.meta.url);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  return names.map((name) => new URL(name, directory));
}

test("v1.1 evidence version is frozen across constant, schema and generated type", () => {
  assert.equal(EVIDENCE_VERSION, "1.1.0");
  assert.equal(evidenceSchema.properties.evidenceVersion.const, EVIDENCE_VERSION);
  const typedVersion: WenshuPdfEvidence["evidenceVersion"] = EVIDENCE_VERSION;
  assert.equal(typedVersion, "1.1.0");
  // additive 升级纪律：冻结的 1.0.0 schema 原样保留，读取方双向接受。
  assert.equal(evidenceSchemaV1_0_0.properties.evidenceVersion.const, "1.0.0");
  assert.deepEqual([...SUPPORTED_EVIDENCE_VERSIONS], ["1.0.0", "1.1.0"]);
});

test("frozen 1.0.0 data stays valid under the 1.1.0 reader (additive upgrade)", () => {
  // v1.0.0 形状（无 figureMcid/paintBBox）在 v1.0.0 分支下合法；valid/ 目录
  // 中的 1.0.0 fixture 由目录级用例逐文件覆盖，此处再验版本分发扬状。
  const result = validateEvidence({
    evidenceVersion: "1.0.0",
    source: {
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      pageCount: 1,
      producer: "Skia/PDF m150",
    },
    pages: [
      {
        index: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        widthPt: 595.28,
        heightPt: 841.89,
        rotate: 0,
      },
    ],
    textRuns: [],
    figures: [],
    fonts: [
      {
        name: "ABCDEF+NotoSansCJKsc-Regular",
        family: "Noto Sans CJK SC",
        weight: 400,
        subtype: "CIDFontType0",
        subset: true,
        embedded: true,
      },
    ],
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    assert.equal(result.value.evidenceVersion, "1.0.0");
  }
});

test("1.1.0 run missing figureMcid fails as schema violation, not version", () => {
  const result = validateEvidence({
    evidenceVersion: EVIDENCE_VERSION,
    source: {
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      pageCount: 1,
      producer: "Skia/PDF m150",
    },
    pages: [
      {
        index: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        widthPt: 595.28,
        heightPt: 841.89,
        rotate: 0,
      },
    ],
    textRuns: [
      {
        pageIndex: 0,
        text: "段落",
        bbox: { x: 72, y: 96, width: 200, height: 24 },
        baselineY: 118,
        fontSize: 16,
        font: {
          objectId: 30,
          tag: "F30",
          family: "Noto Sans CJK SC",
          weight: 400,
          subset: true,
          embedded: true,
        },
        blockOrder: 0,
        readingOrder: 0,
        viaActualText: false,
      },
    ],
    figures: [],
    fonts: [
      {
        name: "ABCDEF+NotoSansCJKsc-Regular",
        family: "Noto Sans CJK SC",
        weight: 400,
        subtype: "CIDFontType0",
        subset: true,
        embedded: true,
      },
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === "PDF_EVIDENCE_SCHEMA" &&
          issue.path === "/textRuns/0/figureMcid",
      ),
      JSON.stringify(result.issues),
    );
  }
});

test("all valid evidence fixtures pass and are deeply frozen", async (context) => {
  for (const file of await fixtureFiles("valid")) {
    await context.test(file.pathname, async () => {
      const result = validateEvidence(await readJson(file));
      assert.equal(result.ok, true, JSON.stringify(result));
      if (result.ok) {
        assert.ok(Object.isFrozen(result.value));
        assert.ok(Object.isFrozen(result.value.pages));
        assert.ok(Object.isFrozen(result.value.pages[0]));
        assert.ok(Object.isFrozen(result.value.textRuns));
        assert.ok(Object.isFrozen(result.value.fonts));
      }
    });
  }
});

test("all invalid evidence fixtures fail with stable issue codes", async (context) => {
  for (const file of await fixtureFiles("invalid")) {
    await context.test(file.pathname, async () => {
      const fixture = await readJson(file);
      if (
        !isRecord(fixture) ||
        typeof fixture["expectedIssue"] !== "string" ||
        typeof fixture["expectedPath"] !== "string"
      ) {
        throw new Error(`Invalid negative fixture metadata: ${file.pathname}`);
      }
      const expectedIssue = fixture["expectedIssue"];
      const expectedPath = fixture["expectedPath"];
      delete fixture["expectedIssue"];
      delete fixture["expectedPath"];
      const result = validateEvidence(fixture);
      assert.equal(result.ok, false, file.pathname);
      if (!result.ok) {
        assert.ok(
          result.issues.some(
            (issue) => issue.code === expectedIssue && issue.path === expectedPath,
          ),
          JSON.stringify(result.issues),
        );
      }
    });
  }
});

test("validation diagnostics never echo evidence content", () => {
  const sentinel = "private-evidence-marker-must-not-be-logged";
  const result = validateEvidence({
    evidenceVersion: EVIDENCE_VERSION,
    source: {
      sha256: sentinel,
      pageCount: 1,
      producer: "Skia/PDF m150",
    },
    pages: [
      {
        index: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        widthPt: 595.28,
        heightPt: 841.89,
        rotate: 0,
      },
    ],
    textRuns: [],
    figures: [],
    fonts: [
      {
        name: sentinel,
        family: "Noto Sans CJK SC",
        weight: 400,
        subtype: "CIDFontType0",
        subset: true,
        embedded: true,
      },
    ],
    unexpected: sentinel,
  });

  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(sentinel));
});

test("generated declarations avoid the forbidden type and identify their source", async () => {
  const generated = await readFile(
    new URL("../src/generated/evidence.ts", import.meta.url),
    "utf8",
  );
  const forbiddenTypePattern = new RegExp(`\\b${"a" + "ny"}\\b`, "u");

  assert.match(generated, /Generated from schema\/evidence\.schema\.json/u);
  assert.doesNotMatch(generated, forbiddenTypePattern);
});

test("function values are rejected as structural violations", () => {
  const result = validateEvidence({
    evidenceVersion: EVIDENCE_VERSION,
    hook: () => 1,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.code, "PDF_EVIDENCE_STRUCTURE");
    assert.equal(result.issues[0]?.path, "/hook");
  }
});

test("non-plain prototypes are rejected as structural violations", () => {
  class Wrapped {}
  const result = validateEvidence({
    evidenceVersion: EVIDENCE_VERSION,
    source: new Wrapped(),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.code, "PDF_EVIDENCE_STRUCTURE");
    assert.equal(result.issues[0]?.path, "/source");
  }
});

test("deeply nested evidence fails with a structural budget issue", () => {
  let nested: unknown = { leaf: true };
  for (let index = 0; index < 80; index += 1) {
    nested = { child: nested };
  }

  const result = validateEvidence({
    evidenceVersion: EVIDENCE_VERSION,
    source: nested,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.code, "PDF_EVIDENCE_STRUCTURE");
  }
});

test("version mismatch classifies before schema validation", () => {
  const result = validateEvidence({ evidenceVersion: "0.9.0" });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(
      result.issues.map((issue) => ({ code: issue.code, path: issue.path })),
      [{ code: "PDF_EVIDENCE_VERSION", path: "/evidenceVersion" }],
    );
  }
});

test("duplicate reading order is a semantic violation", () => {
  const run = {
    pageIndex: 0,
    text: "段落",
    bbox: { x: 72, y: 96, width: 200, height: 24 },
    baselineY: 118,
    fontSize: 16,
    font: {
      objectId: 30,
      tag: "F30",
      family: "Noto Sans CJK SC",
      weight: 400,
      subset: true,
      embedded: true,
    },
    blockOrder: 0,
    readingOrder: 0,
    viaActualText: false,
    figureMcid: null,
  };
  const result = validateEvidence({
    evidenceVersion: EVIDENCE_VERSION,
    source: {
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      pageCount: 1,
      producer: "Skia/PDF m150",
    },
    pages: [
      {
        index: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        widthPt: 595.28,
        heightPt: 841.89,
        rotate: 0,
      },
    ],
    textRuns: [run, { ...structuredClone(run), blockOrder: 1, readingOrder: 0 }],
    figures: [],
    fonts: [
      {
        name: "ABCDEF+NotoSansCJKsc-Regular",
        family: "Noto Sans CJK SC",
        weight: 400,
        subtype: "CIDFontType0",
        subset: true,
        embedded: true,
      },
    ],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === "PDF_EVIDENCE_SEMANTIC" &&
          issue.path === "/textRuns/1/readingOrder",
      ),
    );
  }
});

test("figure page index beyond page count is a semantic violation", () => {
  const result = validateEvidence({
    evidenceVersion: EVIDENCE_VERSION,
    source: {
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      pageCount: 1,
      producer: "Skia/PDF m150",
    },
    pages: [
      {
        index: 0,
        mediaBox: [0, 0, 595.28, 841.89],
        widthPt: 595.28,
        heightPt: 841.89,
        rotate: 0,
      },
    ],
    textRuns: [],
    figures: [
      {
        pageIndex: 1,
        mcid: 5,
        bbox: { x: 72, y: 180, width: 451.28, height: 240 },
        paintBBox: { x: 92, y: 160, width: 400, height: 200 },
        kind: "vector-figure",
        altShort: null,
        altLong: null,
      },
    ],
    fonts: [
      {
        name: "ABCDEF+NotoSansCJKsc-Regular",
        family: "Noto Sans CJK SC",
        weight: 400,
        subtype: "CIDFontType0",
        subset: true,
        embedded: true,
      },
    ],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === "PDF_EVIDENCE_SEMANTIC" &&
          issue.path === "/figures/0/pageIndex",
      ),
    );
  }
});
