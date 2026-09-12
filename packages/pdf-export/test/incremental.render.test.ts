import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import type { WenshuDocument } from "@wenshu/document-model";
import { launchBrowser } from "@wenshu/report-render";

import { PdfExportError } from "../src/errors.ts";
import { extractGeometry, type GeometryTextRun } from "../src/geometry.ts";
import { locateAnchorPage, pageRuns, runKeyTagFree } from "../src/incremental.ts";
import {
  buildInitialPreviewState,
  createIncrementalPreviewController,
} from "../src/incremental-controller.ts";
import {
  normalizePdfText,
  prepareExportContext,
  produceBaselinePdf,
  renderDocumentFull,
} from "../src/index.ts";

/**
 * A-04E-2b 增量预览控制器端到端（真实 Chromium，无 mock）：
 * 1. 局部编辑只重渲染受影响窗（插桩 pageRangesPrinted 为证），且产物与
 *    整份重渲（renderDocumentFull 独立路径）逐页证据级全等——增量正确性
 *    不循环自证，以整份为参照（ADR-0014 ④口径的单次形态）；
 * 2. 取消以 PDF_EXPORT_CANCELLED 结案、状态不被污染、同会话立即可再用；
 * 3. fail-closed 回落：空受影响集 / 编辑触及目录页之前 → full-required。
 *
 * 语料为 21 页仓库 fixture——本文件只验机制正确性，不产出任何预算结论
 * （30 页/30,000 字预算证据归 Win11 参考 VM 批次）。
 */

const repoRoot = resolve(import.meta.dirname, "../../..");
const input = {
  fixture: resolve(repoRoot, "docs/poc-a/fixtures/golden-report.md"),
  fixtureRoot: resolve(repoRoot, "docs/poc-a/fixtures"),
  fontDir: resolve(repoRoot, "assets/fonts/source-han-sans-cn/2.005R"),
  templatePath: resolve(repoRoot, "docs/poc-a/fixtures/formal-business.template.json"),
};

type Block = WenshuDocument["blocks"][number];

function flatten(blocks: readonly Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    out.push(block);
    if (block.type === "section") {
      out.push(...flatten(block.children));
    }
  }
  return out;
}

/** 同长替换前 12 字符（等宽 CJK 对 CJK，不改变分页的确定性编辑）。 */
function replaceParagraphText(
  document: WenshuDocument,
  id: string,
): {
  readonly document: WenshuDocument;
  readonly before: string;
  readonly after: string;
} {
  const substitute = "增量试验替换文字甲乙丙丁";
  const rewrite = (blocks: readonly Block[]): Block[] =>
    blocks.map((block) => {
      if (block.id === id && block.type === "paragraph") {
        const after = `${substitute}${block.text.slice(substitute.length)}`;
        return { ...block, text: after };
      }
      if (block.type === "section") {
        return { ...block, children: rewrite(block.children) };
      }
      return block;
    });
  const target = flatten(document.blocks).find((block) => block.id === id);
  if (target?.type !== "paragraph") {
    throw new Error("target must be a paragraph");
  }
  const newBlocks = rewrite(document.blocks);
  const newTarget = flatten(newBlocks).find((block) => block.id === id);
  const after = newTarget?.type === "paragraph" ? newTarget.text : "";
  assert.equal(after.length, target.text.length, "substitute must be same-length");
  assert.notEqual(after, target.text);
  return Object.freeze({
    document: Object.freeze({ ...document, blocks: newBlocks }),
    before: target.text,
    after,
  });
}

const sessions: { close(): Promise<void> }[] = [];
test.after(async () => {
  for (const session of sessions) {
    await session.close();
  }
});

async function setupController() {
  const session = await launchBrowser(undefined, {});
  sessions.push(session);
  const context = await prepareExportContext(input);
  const output = await produceBaselinePdf({
    ...input,
    createBrowser: async () => session,
  });
  const state = buildInitialPreviewState({
    document: context.imported.document,
    contentBytes: output.contentBytes,
    displayBytes: output.contentBytes, // 显示源=未压印内容态，页眉页脚由显示层统一覆盖
    tocPages: output.tocPages,
    pageCount: output.inspection.pageCount,
  });
  const controller = createIncrementalPreviewController({ session, context }, state);
  return { session, context, output, controller };
}

/** 选一个正文中段、锚定唯一的段落（确定性：fixture 冻结，选择过程本身确定性）。 */
function pickEditableParagraph(
  document: WenshuDocument,
  pageTextIndex: readonly string[],
  pageCount: number,
): { readonly id: string; readonly page: number } {
  for (const block of flatten(document.blocks)) {
    if (block.type !== "paragraph" || block.text.length < 30) {
      continue;
    }
    const anchor = normalizePdfText(block.text).slice(0, 32);
    const hits = pageTextIndex.filter((text) => text.includes(anchor)).length;
    if (hits !== 1) {
      continue;
    }
    const page = locateAnchorPage(pageTextIndex, anchor, "pick");
    if (page >= 6 && page <= pageCount - 4) {
      return Object.freeze({ id: block.id, page });
    }
  }
  throw new Error("no uniquely-locatable mid-document paragraph found");
}

test("incremental update re-renders only the affected window and matches a full re-render", async () => {
  const { session, context, output, controller } = await setupController();
  const state = controller.state();
  const target = pickEditableParagraph(
    state.document,
    state.pageTextIndex,
    state.pageCount,
  );
  const edited = replaceParagraphText(state.document, target.id);

  const result = await controller.update(edited.document, [target.id]);
  assert.equal(result.kind, "incremental", `expected incremental, got ${result.kind}`);
  if (result.kind !== "incremental") {
    return;
  }
  // 真增量：每轮打印区间跨度 ≤ 窗+哨兵（绝不出现整份 1-N）
  assert.ok(result.pageRangesPrinted.length >= 1);
  for (const range of result.pageRangesPrinted) {
    const [a, b] = range.split("-").map(Number);
    assert.ok(
      (b ?? 0) - (a ?? 0) + 1 <= 6,
      `printed range ${range} is not a bounded window`,
    );
  }
  const [firstRange] = result.pageRangesPrinted;
  const windowStartPrinted = Number(firstRange?.split("-")[0]);
  assert.equal(windowStartPrinted, target.page + 1, "window starts at the anchor page");
  assert.equal(
    result.pageCount,
    state.pageCount,
    "same-length edit must keep page count",
  );
  assert.equal(result.updatedRange[0], target.page + 1);

  // ---- 对账：整份重渲独立路径为参照 ----
  const reference = await renderDocumentFull(
    context,
    session,
    edited.document,
    output.stampSpec,
  );
  assert.equal(result.pageCount, reference.pageCount);
  // 目录页码表逐项全等
  assert.deepEqual(
    Object.fromEntries(result.tocPages),
    Object.fromEntries(reference.tocPages),
    "incremental toc pages must equal the full re-render outline measurement",
  );
  // 窗页证据级全等（tag-free 口径，F2）
  const refGeometry = extractGeometry(reference.contentBytes);
  const merged = controller.state().geometry;
  for (
    let page = result.updatedRange[0] - 1;
    page <= result.updatedRange[1] - 1;
    page += 1
  ) {
    const incremental = pageRuns(merged, page);
    const full = pageRuns(refGeometry, page);
    assert.equal(
      incremental.length,
      full.length,
      `page ${page + 1} run count drifted vs full re-render`,
    );
    for (let index = 0; index < incremental.length; index += 1) {
      assert.equal(
        runKeyTagFree(incremental[index] as GeometryTextRun),
        runKeyTagFree(full[index] as GeometryTextRun),
        `page ${page + 1} run ${index} drifted vs full re-render`,
      );
    }
  }
  // 编辑内容确实落进窗页（不是旧内容残留）
  const windowText = state.pageTextIndex[target.page];
  assert.ok(windowText?.includes(normalizePdfText(edited.before).slice(0, 16)));
  assert.ok(
    controller
      .state()
      .pageTextIndex[target.page]?.includes(
        normalizePdfText(edited.after).slice(0, 16),
      ),
  );
  // 未受影响页证据保持旧态（抽窗前/窗后各一页）
  const before = Math.max(0, result.updatedRange[0] - 2);
  const oldRuns = pageRuns(state.geometry, before).map(runKeyTagFree);
  const keptRuns = pageRuns(controller.state().geometry, before).map(runKeyTagFree);
  assert.deepEqual(keptRuns, oldRuns, "unaffected page evidence must be preserved");
});

test("incremental update cancellation: PDF_EXPORT_CANCELLED, state unpolluted, session reusable", async () => {
  const { controller } = await setupController();
  const stateBefore = controller.state();
  const target = pickEditableParagraph(
    stateBefore.document,
    stateBefore.pageTextIndex,
    stateBefore.pageCount,
  );
  const edited = replaceParagraphText(stateBefore.document, target.id);
  const controller0 = new AbortController();
  controller0.abort();
  await assert.rejects(
    controller.update(edited.document, [target.id], { signal: controller0.signal }),
    (error: unknown) =>
      error instanceof PdfExportError && error.code === "PDF_EXPORT_CANCELLED",
  );
  assert.equal(
    controller.state(),
    stateBefore,
    "cancelled update must not touch the committed preview state",
  );
  // 资源清理完备：同会话同控制器立即可再次成功更新
  const recovered = await controller.update(edited.document, [target.id]);
  assert.equal(recovered.kind, "incremental");
});

test("incremental update fails closed to full-required honestly", async () => {
  const { controller } = await setupController();
  const state = controller.state();

  // 空受影响集
  const edited = replaceParagraphText(
    state.document,
    pickEditableParagraph(state.document, state.pageTextIndex, state.pageCount).id,
  );
  const empty = await controller.update(edited.document, []);
  assert.equal(empty.kind, "full-required");
  if (empty.kind === "full-required") {
    assert.match(empty.reason, /no affected nodes/u);
    assert.equal(
      empty.pageRangesPrinted.length,
      0,
      "fallback before any print must not print",
    );
  }

  // 标题编辑 = 目录条目集合变化：占位回填口径不再成立 → 诚实退整份
  const section = flatten(state.document.blocks).find(
    (block): block is Block & { type: "section" } => block.type === "section",
  );
  assert.ok(section !== undefined);
  const retitle = (blocks: readonly Block[]): Block[] =>
    blocks.map((block) => {
      if (block.id === section.id && block.type === "section") {
        return { ...block, title: `${block.title}（改）` };
      }
      if (block.type === "section") {
        return { ...block, children: retitle(block.children) };
      }
      return block;
    });
  const retitled = Object.freeze({
    ...state.document,
    blocks: retitle(state.document.blocks),
  });
  const toc = await controller.update(retitled, [section.id]);
  assert.equal(toc.kind, "full-required");
  if (toc.kind === "full-required") {
    assert.match(toc.reason, /toc entry set changed/u);
    assert.equal(
      toc.pageRangesPrinted.length,
      0,
      "toc-structure fallback must not print",
    );
  }
});
