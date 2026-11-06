import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { collectTocEntries, type WenshuDocument } from "@wenshu/document-model";
import { launchBrowser, renderDocumentHtml } from "@wenshu/report-render";

import { composePrintDocument } from "../src/compose.ts";
import {
  extractGeometry,
  type GeometryTextRun,
  type PdfGeometry,
} from "../src/geometry.ts";
import { pageRuns, runKeyTagFree } from "../src/incremental.ts";
import {
  buildInitialPreviewState,
  createIncrementalPreviewController,
  type PreviewState,
} from "../src/incremental-controller.ts";
import { inspectPdf } from "../src/inspect.ts";
import type { ExportContext } from "../src/prepare-context.ts";
import { prepareExportContext, renderDocumentFull } from "../src/index.ts";
import { normalizePdfText } from "../src/reconcile.ts";
import type { StampSpec } from "../src/stamp.ts";

/**
 * A2B-F2 目录页槽重打路径执行证据（真实 Chromium，无 mock）。
 *
 * 合成自校准夹具（签署语料全程紧密排版，节末零余量无法构造 delta=0 漂移）：
 * 第一章 = [P1 段落][level-2 节「跨页漂移标题」（HTML h3，break-after: avoid）
 * + P2 长段落]，第二章强制新页（模板 h1_start_new_page）把章间版式隔断为
 * 天然哨兵。所有排版参数（行距/版心底线/每行字数）自基线渲染的几何证据
 * 实测，不依赖任何环境相关的绝对分页位置。
 *
 * 校准两旋钮分治：p1Chars 把 h3 钉在页底上方 1~3 行（addLines 最小化，
 * 避免「推标题过页底需十几行、章末吸收不下」的旧卡点），p2Chars 把章末页
 * 余量钉在 [addLines+4, addLines+12] 行。编辑 = 仅 P1 追加 addLines 行纯
 * 全角文本：h3 被推出原页（页码漂移），净位移由章末页余量吸收，delta=0 →
 * 触发目录页槽重打+占位回填；断言回填槽位与整份重渲独立 oracle 的目录页
 * 逐 run 证据级全等。
 */

const repoRoot = resolve(import.meta.dirname, "../../..");
const input = {
  fixture: resolve(repoRoot, "docs/poc-a/fixtures/golden-report.md"),
  fixtureRoot: resolve(repoRoot, "docs/poc-a/fixtures"),
  fontDir: resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R"),
  templatePath: resolve(repoRoot, "docs/poc-a/fixtures/formal-business.template.json"),
};

const MM_TO_PT = 72 / 25.4;
const POOL_A = "窗格证据逐页对账文本甲乙丙丁戊己庚辛";
const POOL_B = "补偿段落稳定吸收位移文本子丑寅卯辰巳";
const A_MARK = "甲段独特开头麒麟现瑞"; // 锚唯一性标记（段落首 32 归一化字符须全文档唯一）
const B_MARK = "乙段独特开头凤凰于飞";
const H2_TITLE = "跨页漂移标题 0123456789"; // 尾随数字井：占位字体子集（目录页 ranged 打印只含本页字形）须覆盖全部数字码位供回填反查

type Block = WenshuDocument["blocks"][number];

function pool(poolText: string, chars: number): string {
  return poolText.repeat(Math.ceil(chars / poolText.length)).slice(0, chars);
}

function section(
  id: string,
  level: number,
  title: string,
  children: readonly Block[],
): Block {
  return Object.freeze({
    id,
    type: "section",
    level,
    title,
    children: Object.freeze(children),
  }) as unknown as Block;
}

function paragraph(id: string, text: string): Block {
  return Object.freeze({ id, type: "paragraph", text }) as unknown as Block;
}

/** 合成文档：封面题名节（目录收录排除）+ toc + 两章。 */
function buildSyntheticDocument(p1Chars: number, p2Chars: number): WenshuDocument {
  return Object.freeze({
    schemaVersion: "0.2.0",
    documentId: "a2bf2-toc-slot-fixture",
    revision: 1,
    title: "页槽回填漂移合成试验",
    language: "zh-CN",
    assets: Object.freeze([]),
    blocks: Object.freeze([
      section("cover", 1, "页槽回填漂移合成试验", [
        paragraph("cover-p", pool(POOL_A, 20)),
      ]),
      Object.freeze({ id: "toc", type: "toc" }),
      section("ch1", 1, "第一章 漂移试验", [
        paragraph("p1", `${A_MARK}${pool(POOL_A, p1Chars)}`),
        section("ch1s1", 2, H2_TITLE, [
          paragraph("p2", `${B_MARK}${pool(POOL_B, p2Chars)}`),
        ]),
      ]),
      section("ch2", 1, "第二章 稳定尾部", [
        paragraph("tail", `${pool(POOL_B, 120)} 01/23`), // 压印字符集含 "/"（页脚 N / total），须有引擎原字形供复刻
      ]),
    ]),
  }) as unknown as WenshuDocument;
}

/** 以签署语料装配产物（CSS/字体/模板/打印参数）派生合成文档的导出上下文。 */
function deriveContext(base: ExportContext, document: WenshuDocument): ExportContext {
  return Object.freeze({
    ...base,
    imported: Object.freeze({
      document,
      renames: Object.freeze({}),
      metadata: Object.freeze({ short_title: "窗格证据对账" }),
      reconciliation: Object.freeze({
        sourceChars: 0,
        newlineChars: 0,
        contentChars: 0,
        syntaxChars: 0,
        lines: Object.freeze([]),
        counts: Object.freeze({}),
      }),
    }),
    tocEntries: collectTocEntries(document),
    svgCache: new Map<string, string>(),
    basePrintHtml: composePrintDocument(
      renderDocumentHtml(document),
      base.css,
      () => undefined,
    ),
  });
}

function makeStampSpec(context: ExportContext, pageSize: readonly number[]): StampSpec {
  const margins = context.model.page.margin_mm;
  return Object.freeze({
    headerText: "窗格证据对账",
    pageWidthPt: pageSize[0] ?? 0,
    pageHeightPt: pageSize[1] ?? 0,
    marginTopPt: margins.top * MM_TO_PT,
    marginBottomPt: margins.bottom * MM_TO_PT,
    marginLeftPt: margins.left * MM_TO_PT,
  });
}

/** 正文字号（全部 run 的 fontSize 众数）。 */
function bodyFontSize(geometry: PdfGeometry): number {
  const counts = new Map<number, number>();
  for (const run of geometry.textRuns) {
    counts.set(run.fontSize, (counts.get(run.fontSize) ?? 0) + 1);
  }
  const [size] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] as [
    number,
    number,
  ];
  return size;
}

/** 正文行距（正文字号 run 的逐页相邻 baselineY 差分众数）。 */
function bodyLinePitch(geometry: PdfGeometry, fontSize: number): number {
  const counts = new Map<number, number>();
  for (const page of geometry.pages) {
    const baselines = [
      ...new Set(
        pageRuns(geometry, page.index)
          .filter((run) => run.fontSize === fontSize)
          .map((run) => run.baselineY),
      ),
    ].sort((a, b) => a - b);
    for (let index = 1; index < baselines.length; index += 1) {
      const diff =
        Math.round(
          ((baselines[index] as number) - (baselines[index - 1] as number)) * 100,
        ) / 100;
      if (diff > 5 && diff < 60) {
        counts.set(diff, (counts.get(diff) ?? 0) + 1);
      }
    }
  }
  const [pitch] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] as [
    number,
    number,
  ];
  return pitch;
}

/** 纯全角满行字符数：宽度 ≥97% 版心宽的全角字元正文行中最长者。 */
function cjkCharsPerLine(geometry: PdfGeometry, fontSize: number): number {
  const lines = new Map<string, { text: string; x0: number; x1: number }>();
  for (const run of geometry.textRuns) {
    if (run.fontSize !== fontSize) {
      continue;
    }
    const key = `${run.pageIndex}|${run.baselineY.toFixed(2)}`;
    const line = lines.get(key) ?? { text: "", x0: Infinity, x1: -Infinity };
    line.text += normalizePdfText(run.text);
    line.x0 = Math.min(line.x0, run.bbox.x);
    line.x1 = Math.max(line.x1, run.bbox.x + run.bbox.width);
    lines.set(key, line);
  }
  const all = [...lines.values()];
  const maxWidth = Math.max(...all.map((line) => line.x1 - line.x0));
  let cpl = 0;
  for (const line of all) {
    if (
      line.x1 - line.x0 >= maxWidth * 0.97 &&
      /^[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]+$/u.test(line.text) &&
      line.text.length > cpl
    ) {
      cpl = line.text.length;
    }
  }
  if (cpl < 10) {
    throw new Error(`implausible chars-per-line: ${cpl}`);
  }
  return cpl;
}

/** 标题行基线：页面上连续同基线 run 拼出标题全长（合成夹具标题短且唯一）。 */
function headingBaseline(geometry: PdfGeometry, page: number, title: string): number {
  const runs = pageRuns(geometry, page);
  const normalized = runs.map((run) => normalizePdfText(run.text));
  for (let from = 0; from < runs.length; from += 1) {
    const baseline = (runs[from] as GeometryTextRun).baselineY;
    let joined = "";
    let to = from;
    while (
      to < runs.length &&
      (runs[to] as GeometryTextRun).baselineY === baseline &&
      title.startsWith(joined + (normalized[to] as string))
    ) {
      joined += normalized[to] as string;
      to += 1;
    }
    if (joined === title) {
      return baseline;
    }
  }
  throw new Error(`heading ${title} not found on page ${page + 1}`);
}

/** 页面最深行基线（PDF 用户空间 y 向上：行越深 baselineY 越小）。 */
function pageBottom(geometry: PdfGeometry, page: number): number {
  return Math.min(...pageRuns(geometry, page).map((run) => run.baselineY));
}

/** 页面内容容量底线（全文档逐页最深 baselineY 的最小值——真实页容量；众数页深被孤/寡行规则提前收束，不是容量）。 */
function pageCapacity(geometry: PdfGeometry): number {
  return Math.min(
    ...geometry.pages.map((page) =>
      Math.min(...pageRuns(geometry, page.index).map((run) => run.baselineY)),
    ),
  );
}

const sessions: { close(): Promise<void> }[] = [];
test.after(async () => {
  for (const session of sessions) {
    await session.close();
  }
});

test("toc drift inside window reprints and backfills the TOC page slot (delta=0)", async () => {
  const session = await launchBrowser(undefined, {});
  sessions.push(session);
  const base = await prepareExportContext(input);

  // ---- 自校准基线（两旋钮分治：p1Chars 钉 h3 页内位置，p2Chars 钉章末余量） ----
  const TARGET_BELOW = 2; // h3 下方目标行数（addLines = linesBelow + 2 最小化）
  let p1Chars = 430;
  let p2Chars = 3600;
  let state: PreviewState | undefined;
  let plan:
    | {
        readonly context: ExportContext;
        readonly document: WenshuDocument;
        readonly stampSpec: StampSpec;
        readonly addLines: number;
        readonly cpl: number;
        readonly h2OldPage: number;
      }
    | undefined;
  for (let attempt = 0; attempt < 8 && plan === undefined; attempt += 1) {
    const document = buildSyntheticDocument(p1Chars, p2Chars);
    const context = deriveContext(base, document);
    const first = await renderDocumentFull(
      context,
      session,
      document,
      makeStampSpec(context, [595.28, 841.89]),
    );
    const stampSpec = makeStampSpec(context, inspectPdf(first.contentBytes).pageSizePt);
    const baseline = await renderDocumentFull(context, session, document, stampSpec);
    const current = buildInitialPreviewState({
      document,
      contentBytes: baseline.contentBytes,
      displayBytes: baseline.contentBytes,
      tocPages: baseline.tocPages,
      pageCount: baseline.pageCount,
    });
    const geo = current.geometry;
    const fontSize = bodyFontSize(geo);
    const pitch = bodyLinePitch(geo, fontSize);
    const cpl = cjkCharsPerLine(geo, fontSize);
    const h2Page0 = (current.tocPages.get("ch1s1") as number) - 1;
    const h2Base = headingBaseline(geo, h2Page0, normalizePdfText(H2_TITLE));
    const capacity = pageCapacity(geo); // 真实页容量底线（满页实测最深基线，y 向上取最小）
    const linesBelow = Math.floor((h2Base - capacity) / pitch);
    const addLines = linesBelow + 2;
    const ch1LastPage = (current.tocPages.get("ch2") as number) - 2;
    const slack = Math.floor((pageBottom(geo, ch1LastPage) - capacity) / pitch);
    console.log(
      "[calib]",
      JSON.stringify({
        attempt,
        p1Chars,
        p2Chars,
        cpl,
        pitch,
        capacity,
        h2Page0,
        linesBelow,
        addLines,
        ch1LastPage,
        slack,
        toc: Object.fromEntries(current.tocPages),
        pageCount: current.pageCount,
      }),
    );
    if (ch1LastPage <= h2Page0) {
      p2Chars += 40 * cpl; // P2 必须溢出到 h3 所在页之后（章末页独立存在）
      continue;
    }
    if (linesBelow < 1 || linesBelow > 3) {
      p1Chars += (linesBelow - TARGET_BELOW) * cpl; // 推/拉 h3 到页底上方 2 行
      continue;
    }
    if (slack < addLines + 4 || slack > addLines + 12) {
      p2Chars += (slack - addLines - 8) * cpl; // 章末余量钉到 addLines+8 行
      continue;
    }
    plan = Object.freeze({
      context,
      document,
      stampSpec,
      addLines,
      cpl,
      h2OldPage: h2Page0 + 1,
    });
    state = current;
  }
  assert.ok(
    plan !== undefined && state !== undefined,
    "synthetic fixture must be calibratable",
  );

  // ---- 编辑：仅 P1 追加 addLines 行纯全角文本（锚唯一性前缀不动；净位移由章末余量吸收）----
  const appended = pool(POOL_A, plan.addLines * plan.cpl);
  const rewrite = (blocks: readonly Block[]): Block[] =>
    blocks.map((block) => {
      if (block.type === "paragraph" && block.id === "p1") {
        return paragraph(block.id, `${block.text}${appended}`);
      }
      if (block.type === "section") {
        return section(block.id, block.level, block.title, rewrite(block.children));
      }
      return block;
    });
  const edited = Object.freeze({
    ...plan.document,
    blocks: Object.freeze(rewrite(plan.document.blocks)),
  }) as unknown as WenshuDocument;

  const controller = createIncrementalPreviewController(
    { session, context: plan.context },
    state,
  );
  const tocPageIndex = state.tocPageIndex;
  assert.ok(tocPageIndex !== null, "synthetic TOC page must be located");
  const result = await controller.update(edited, ["p1"]);
  assert.equal(
    result.kind,
    "incremental",
    `expected incremental, got ${result.kind}${result.kind === "full-required" ? `: ${result.reason}` : ""}`,
  );
  if (result.kind !== "incremental") {
    return;
  }
  assert.equal(result.pageCount, state.pageCount, "net-zero edit must keep page count");
  const newHeadingPage = result.tocPages.get("ch1s1");
  assert.ok(
    newHeadingPage !== undefined && newHeadingPage !== plan.h2OldPage,
    "heading toc page must drift",
  );
  assert.ok(result.tocSlotPdfBytes !== null, "toc slot must be reprinted on drift");
  assert.equal(
    result.pageRangesPrinted.at(-1),
    `${tocPageIndex + 1}-${tocPageIndex + 1}`,
    "last print must be the TOC page slot",
  );

  // ---- 独立 oracle：整份重渲 ----
  const reference = await renderDocumentFull(
    plan.context,
    session,
    edited,
    plan.stampSpec,
  );
  assert.deepEqual(
    Object.fromEntries(result.tocPages),
    Object.fromEntries(reference.tocPages),
    "drifted toc pages must equal the full re-render outline measurement",
  );
  // 回填后槽位页 vs 整份目录页：逐 run 证据级全等（tag-free 收紧口径）
  const slotGeometry = extractGeometry(result.tocSlotPdfBytes);
  assert.equal(slotGeometry.pages.length, 1, "toc slot pdf must be a single page");
  const slotRuns = pageRuns(slotGeometry, 0);
  const refTocRuns = pageRuns(extractGeometry(reference.contentBytes), tocPageIndex);
  assert.equal(
    slotRuns.length,
    refTocRuns.length,
    "toc slot run count drifted vs full re-render",
  );
  for (let index = 0; index < slotRuns.length; index += 1) {
    assert.equal(
      runKeyTagFree(slotRuns[index] as GeometryTextRun),
      runKeyTagFree(refTocRuns[index] as GeometryTextRun),
      `toc slot run ${index} drifted vs full re-render`,
    );
  }
  assert.equal(controller.state().tocPages.get("ch1s1"), newHeadingPage);
});
