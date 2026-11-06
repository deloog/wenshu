import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { importMarkdownDocument } from "@wenshu/markdown-import";
import { extractEvidence } from "@wenshu/pdf-evidence";
import type { TextRun, WenshuPdfEvidence } from "@wenshu/pdf-evidence";
import { extractSvgText } from "@wenshu/pdf-export";
import { validateTemplate } from "@wenshu/template-model";

import { buildExpectedBlocks } from "../src/expected-content.ts";
import { contentBoxFromMargins } from "../src/layout.ts";
import { extractSvgAspectRatio } from "../src/svg-source.ts";

/**
 * 源码变异测试（PA-11B）：目录/页码/压印三规则各防线必须因正确原因
 * 变红——页码对账检出、实际页只从证据读（标注冒充实际红线）、缺项检出、
 * 页脚错码检出、页眉对账检出、压印识别单源口径。机制同 pdf-export
 * stamp-mutation.unit.test.ts：真实 src 临时副本 + 单点锚定变异 + 动态
 * 导入；锚点缺失/不唯一即 fail-closed。临时副本置于包内（workspace
 * 依赖可解析），用毕即删。输入统一为真实签署基线的内存派生 fault。
 */

const SRC = resolve(import.meta.dirname, "../src");

async function copySources(): Promise<string> {
  const dir = await mkdtemp(join(resolve(import.meta.dirname, ".."), ".mutation-"));
  await cp(SRC, join(dir, "src"), { recursive: true });
  // validate-report.ts 运行时锚定 src 外的契约 schema，一并复制。
  await cp(resolve(import.meta.dirname, "../schema"), join(dir, "schema"), {
    recursive: true,
  });
  return dir;
}

async function applyMutation(
  dir: string,
  file: string,
  anchor: string,
  replacement: string,
): Promise<void> {
  const path = join(dir, "src", file);
  const source = await readFile(path, "utf8");
  assert.ok(
    source.includes(anchor),
    `mutation anchor not found in ${file}; source drifted`,
  );
  assert.equal(
    source.indexOf(anchor),
    source.lastIndexOf(anchor),
    `mutation anchor must be unique in ${file}`,
  );
  await writeFile(path, source.replace(anchor, replacement), "utf8");
}

interface FindingLike {
  readonly code: string;
  readonly pageIndex: number;
}
interface RunnerModule {
  readonly runP1Checks: (
    input: unknown,
    options?: { readonly disabledRules?: readonly string[] },
  ) => { readonly findings: readonly FindingLike[] };
}

async function importRunner(dir: string): Promise<RunnerModule["runP1Checks"]> {
  const module = (await import(
    pathToFileURL(join(dir, "src", "p1-runner.ts")).href
  )) as RunnerModule;
  return module.runP1Checks;
}

const SIGNED_BASELINE_SHA256 =
  "5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828";
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const fixtureRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");
const baselineBytes = new Uint8Array(
  readFileSync(
    resolve(
      repoRoot,
      "packages",
      "pdf-evidence",
      "fixtures",
      "baseline",
      "golden-report-baseline.pdf",
    ),
  ),
);
assert.equal(
  createHash("sha256").update(baselineBytes).digest("hex"),
  SIGNED_BASELINE_SHA256,
);
const extracted = extractEvidence(baselineBytes);
assert.ok(extracted.ok);
const baselineEvidence = extracted.evidence;

const imported = await importMarkdownDocument(
  resolve(fixtureRoot, "golden-report.md"),
  fixtureRoot,
);
const svgSources = Object.keys(imported.renames).map((original) =>
  readFileSync(resolve(fixtureRoot, original), "utf8"),
);
const expected = buildExpectedBlocks(
  imported.document,
  svgSources.map((source) => extractSvgText(source)),
  svgSources.map((source) => extractSvgAspectRatio(source)),
);
const templateResult = validateTemplate(
  JSON.parse(
    readFileSync(resolve(fixtureRoot, "formal-business.template.json"), "utf8"),
  ),
);
assert.ok(templateResult.ok);
const template = templateResult.value;
const firstPage = baselineEvidence.pages[0];
assert.ok(firstPage !== undefined);
const basePage = firstPage;

function inputFor(evidence: WenshuPdfEvidence) {
  return {
    evidence,
    expected,
    contentBox: contentBoxFromMargins(
      template.page.margin_mm,
      basePage.widthPt,
      basePage.heightPt,
    ),
    paginationRules: template.pagination_rules,
    headerText: imported.metadata["short_title"],
  };
}

function derive(mutate: (draft: WenshuPdfEvidence) => void): WenshuPdfEvidence {
  const draft = structuredClone(baselineEvidence) as WenshuPdfEvidence;
  mutate(draft);
  return draft;
}

function mutateRun(readingOrder: number, text: string): WenshuPdfEvidence {
  return derive((draft) => {
    const run = draft.textRuns.find(
      (item: TextRun) => item.readingOrder === readingOrder,
    );
    assert.ok(run !== undefined);
    run.text = text;
  });
}

/** 基线钉定（探针实测）：条目 7 标注 run / p4 页眉页脚压印 run。 */
const LABEL_FAULT = mutateRun(1341, "9"); // 标注 6→9（实际页未动）
const MISSING_FAULT = derive((draft) => {
  const removed = new Set([
    1330, 1331, 1332, 1333, 1334, 1335, 1336, 1337, 1338, 1339, 1340, 1341,
  ]);
  draft.textRuns = draft.textRuns.filter((run) => !removed.has(run.readingOrder));
});
const FOOTER_FAULT = mutateRun(2668, "6 / 21"); // 页脚 5→6
const HEADER_FAULT = mutateRun(2667, "被篡改的页眉");

async function withMutation(
  file: string,
  anchor: string,
  replacement: string,
  scenario: (
    control: RunnerModule["runP1Checks"],
    mutated: RunnerModule["runP1Checks"],
  ) => void,
): Promise<void> {
  const controlDir = await copySources();
  const mutatedDir = await copySources();
  try {
    await applyMutation(mutatedDir, file, anchor, replacement);
    scenario(await importRunner(controlDir), await importRunner(mutatedDir));
  } finally {
    await rm(controlDir, { recursive: true, force: true });
    await rm(mutatedDir, { recursive: true, force: true });
  }
}

test("mutation red: toc page reconcile disabled → label drift goes undetected", async () => {
  await withMutation(
    "rules/p1-toc-page-match.ts",
    "    if (entry.label !== actualPage) {",
    "    if (false) {",
    (control, mutated) => {
      assert.ok(
        control(inputFor(LABEL_FAULT)).findings.some(
          (finding) => finding.code === "P1_TOC_PAGE_MISMATCH",
        ),
      );
      assert.ok(
        mutated(inputFor(LABEL_FAULT)).findings.every(
          (finding) => finding.code !== "P1_TOC_PAGE_MISMATCH",
        ),
      );
    },
  );
});

test("mutation red: actual page must be read from evidence, never the printed label", async () => {
  // 红线命门：actualPage 改用标注冒充 → 标注与实际同漂移时静默漏检。
  await withMutation(
    "rules/p1-toc-page-match.ts",
    "    const actualPage = entry.headingPage + 1;",
    "    const actualPage = entry.label ?? 0;",
    (control, mutated) => {
      assert.ok(
        control(inputFor(LABEL_FAULT)).findings.some(
          (finding) => finding.code === "P1_TOC_PAGE_MISMATCH",
        ),
      );
      assert.ok(
        mutated(inputFor(LABEL_FAULT)).findings.every(
          (finding) => finding.code !== "P1_TOC_PAGE_MISMATCH",
        ),
      );
    },
  );
});

test("mutation red: missing toc entry detection disabled → gap goes undetected", async () => {
  await withMutation(
    "rules/p1-toc-reconcile.ts",
    "    if (!entry.entryMatched) {",
    "    if (false) {",
    (control, mutated) => {
      assert.ok(
        control(inputFor(MISSING_FAULT)).findings.some(
          (finding) => finding.code === "P1_TOC_ENTRY_MISSING",
        ),
      );
      assert.ok(
        mutated(inputFor(MISSING_FAULT)).findings.every(
          (finding) => finding.code !== "P1_TOC_ENTRY_MISSING",
        ),
      );
    },
  );
});

test("mutation red: footer page reconcile disabled → wrong footer number undetected", async () => {
  await withMutation(
    "rules/p1-stamp-consistency.ts",
    "      if (printed !== pageIndex + 1 || total !== pageCount) {",
    "      if (false) {",
    (control, mutated) => {
      assert.ok(
        control(inputFor(FOOTER_FAULT)).findings.some(
          (finding) =>
            finding.code === "P1_FOOTER_PAGE_MISMATCH" && finding.pageIndex === 4,
        ),
      );
      assert.ok(
        mutated(inputFor(FOOTER_FAULT)).findings.every(
          (finding) => finding.code !== "P1_FOOTER_PAGE_MISMATCH",
        ),
      );
    },
  );
});

test("mutation red: physical page is pageIndex+1 — off-by-one flips the whole baseline red", async () => {
  // 页码语义防线：物理页从证据读（pageIndex+1，ADR-0010）；变异成 0 基
  // 编号 → 20 页非封面页脚全部误报（基线 40 压印 run 逐页对账证伪）。
  await withMutation(
    "rules/p1-stamp-consistency.ts",
    "      if (printed !== pageIndex + 1 || total !== pageCount) {",
    "      if (printed !== pageIndex || total !== pageCount) {",
    (control, mutated) => {
      assert.equal(
        control(inputFor(baselineEvidence)).findings.filter(
          (finding) => finding.code === "P1_FOOTER_PAGE_MISMATCH",
        ).length,
        0,
      );
      assert.equal(
        mutated(inputFor(baselineEvidence)).findings.filter(
          (finding) => finding.code === "P1_FOOTER_PAGE_MISMATCH",
        ).length,
        20,
      );
    },
  );
});

test("mutation red: header reconcile disabled → tampered header undetected", async () => {
  await withMutation(
    "rules/p1-stamp-consistency.ts",
    "      } else if (normalizePdfText(firstHeader.text) !== expectedHeader) {",
    "      } else if (false) {",
    (control, mutated) => {
      assert.ok(
        control(inputFor(HEADER_FAULT)).findings.some(
          (finding) =>
            finding.code === "P1_HEADER_INCONSISTENT" && finding.pageIndex === 4,
        ),
      );
      assert.ok(
        mutated(inputFor(HEADER_FAULT)).findings.every(
          (finding) => finding.code !== "P1_HEADER_INCONSISTENT",
        ),
      );
    },
  );
});

test("mutation red: stamp identity by font tag — disabled → every page reports missing stamps", async () => {
  await withMutation(
    "stamp-scope.ts",
    "export function isStampRun(run: TextRun): boolean {\n  return STAMP_TAG_PATTERN.test(run.font.tag);\n}",
    "export function isStampRun(run: TextRun): boolean {\n  return false;\n}",
    (control, mutated) => {
      assert.equal(
        control(inputFor(baselineEvidence)).findings.filter(
          (finding) => finding.code === "P1_FOOTER_MISSING",
        ).length,
        0,
      );
      assert.equal(
        mutated(inputFor(baselineEvidence)).findings.filter(
          (finding) => finding.code === "P1_FOOTER_MISSING",
        ).length,
        20,
      );
    },
  );
});
