import type { Block, TocEntry, WenshuDocument } from "@wenshu/document-model";

import { PdfExportError } from "./errors.ts";
import type { GeometryTextRun, PdfGeometry } from "./geometry.ts";
import { normalizePdfText } from "./reconcile.ts";

/**
 * A-04E-2b 增量分页纯逻辑核（ADR-0033：页槽缓存 + 哨兵级联检测 + 锚定页码更新）。
 *
 * 本模块只有纯函数：不碰浏览器、不碰文件、不碰字节。所有 IO 在
 * incremental-controller.ts。设计纪律：
 * - 级联只认证据不认假设——窗口延伸/收束由逐页 run 比对决定（tag-free 键
 *   逐字段口径见 ADR-0033 §4：仅剔除每打印调用重分配/可漂移的 objectId、
 *   font.tag、bbox.height，字体身份/图成员/文本来源等语义字段全部参与比对）；
 * - 一切歧义 fail-closed 退整份重排（PDF_EXPORT_INCREMENTAL_FALLBACK），不猜；
 * - 页数变化（delta≠0）本棒不发明旧尾页改号压印，由控制器诚实退整份重排
 *   （后台可取消路径，ADR-0014 ①③ 由此 exercised）。
 */

/** 级联退整份重排的唯一失败码：不是错误态，是诚实的降级信号。 */
export function failIncremental(reason: string): never {
  throw new PdfExportError("PDF_EXPORT_INCREMENTAL_FALLBACK", reason);
}

// ---------------------------------------------------------------------------
// 页文本索引与锚定定位
// ---------------------------------------------------------------------------

/**
 * run 的跨打印可比键（逐字段口径依据 ADR-0033 §4，A2B-F1 收紧）。
 * 剔除仅三个打印相关字段：font.objectId/font.tag（每打印调用独立分配的资源
 * 标识，F2）、bbox.height（实测 ranged vs 整份同页 20/705 漂移）；其余语义
 * 字段全部参与比对（实测同页 ranged vs 整份 705/705 相同，收紧零误报）；
 * pageIndex 是比较轴而非内容事实（槽位 PDF 页码为窗相对），不入键。
 */
export function runKeyTagFree(run: GeometryTextRun): string {
  return JSON.stringify([
    normalizePdfText(run.text),
    run.baselineY,
    run.bbox.x,
    run.bbox.y,
    run.bbox.width,
    run.fontSize,
    run.blockOrder,
    run.viaActualText,
    run.figureMcid,
    run.font.family,
    run.font.weight,
    run.font.subset,
    run.font.embedded,
  ]);
}

export function pageRuns(
  geometry: PdfGeometry,
  pageIndex: number,
): readonly GeometryTextRun[] {
  return geometry.textRuns.filter((run) => run.pageIndex === pageIndex);
}

/** 逐页归一化拼接文本（锚定搜索的索引；run 序即阅读序）。 */
export function buildPageTextIndex(geometry: PdfGeometry): readonly string[] {
  return Object.freeze(
    geometry.pages.map((page) =>
      pageRuns(geometry, page.index)
        .map((run) => normalizePdfText(run.text))
        .join(""),
    ),
  );
}

/**
 * 锚文本定位页（0 基）：恰好命中一页才返回；0 命中（文本已变/不存在）或
 * 多页命中（锚不唯一）均 fail-closed——定位不准的受影响区比整份重排更危险。
 */
export function locateAnchorPage(
  pageTextIndex: readonly string[],
  anchorText: string,
  context: string,
): number {
  const needle = normalizePdfText(anchorText);
  if (needle.length === 0) {
    failIncremental(`empty anchor text (${context})`);
  }
  const hits: number[] = [];
  for (const [page, text] of pageTextIndex.entries()) {
    if (text.includes(needle)) {
      hits.push(page);
    }
  }
  if (hits.length !== 1) {
    failIncremental(
      `anchor not uniquely located (${context}): ${hits.length} pages match`,
    );
  }
  return hits[0] as number;
}

// ---------------------------------------------------------------------------
// 受影响块锚文本解析（文档模型 → 可定位文本）
// ---------------------------------------------------------------------------

const ANCHOR_LIMIT = 32;

function anchorOfBlock(block: Block): string | undefined {
  switch (block.type) {
    case "section":
      return block.title;
    case "paragraph":
      return block.text;
    case "list":
      return block.items[0]?.text;
    case "quote":
      return block.text;
    case "table":
      return block.caption ?? block.columns[0]?.header;
    case "figure":
      return block.caption ?? block.altText;
    case "pageBreak":
    case "toc":
      // 结构块自身无可定位文本
      return undefined;
  }
}

function findBlock(blocks: readonly Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) {
      return block;
    }
    if (block.type === "section") {
      const found = findBlock(block.children, id);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

/** 文档序展平（锚定失败时的前驱回退用）。 */
function flattenBlocks(blocks: readonly Block[]): readonly Block[] {
  const out: Block[] = [];
  const visit = (list: readonly Block[]): void => {
    for (const block of list) {
      out.push(block);
      if (block.type === "section") {
        visit(block.children);
      }
    }
  };
  visit(blocks);
  return Object.freeze(out);
}

/**
 * 受影响块 → 旧文档中的定位锚文本。
 * - 块在旧文档存在：锚 = 旧文本（编辑前内容在旧证据中可定位）；
 * - 块为新增（旧文档无此 id）：锚 = 新文档中文档序最近前驱块的文本
 *   （前驱在旧证据中的页即插入发生页）；无前驱（插在文档首）即 fallback。
 * 锚文本截取前 ANCHOR_LIMIT 个归一化字符，足够定位又不跨页自扰的概率最大化。
 */
export function resolveEditAnchor(
  oldDocument: WenshuDocument,
  newDocument: WenshuDocument,
  nodeId: string,
): string {
  const inOld = findBlock(oldDocument.blocks, nodeId);
  if (inOld !== undefined) {
    const anchor = anchorOfBlock(inOld);
    if (anchor === undefined || normalizePdfText(anchor).length === 0) {
      failIncremental(`affected block ${nodeId} has no locatable text`);
    }
    return normalizePdfText(anchor).slice(0, ANCHOR_LIMIT);
  }
  const flat = flattenBlocks(newDocument.blocks);
  const at = flat.findIndex((block) => block.id === nodeId);
  if (at === -1) {
    failIncremental(`affected node ${nodeId} absent from both documents`);
  }
  for (let index = at - 1; index >= 0; index -= 1) {
    const candidate = flat[index] as Block;
    if (findBlock(oldDocument.blocks, candidate.id) === undefined) {
      continue;
    }
    const anchor = anchorOfBlock(candidate);
    if (anchor !== undefined && normalizePdfText(anchor).length > 0) {
      return normalizePdfText(anchor).slice(0, ANCHOR_LIMIT);
    }
  }
  failIncremental(`inserted block ${nodeId} has no locatable predecessor`);
}

// ---------------------------------------------------------------------------
// 级联步进（纯状态机；IO 在控制器）
// ---------------------------------------------------------------------------

/**
 * P7 首窗自适应放宽一页（A-04E-2c，业主裁定采纳，ADR-0036）：首窗内容末页 =
 * 锚定末页 + FIRST_WINDOW_EXTRA_PAGES。zone-2 级联率实测 10/10（run-2b-5），
 * 首窗多打一页把两轮级联吸收为一轮；哨兵宽恒 1（末页仍哨兵）、级联延伸与
 * 终止性不变，等价性论证不变（与 ADR-0033 D2 哨兵同源）。
 */
export const FIRST_WINDOW_EXTRA_PAGES = 1;

/** 首窗内容末页（0 基）= 锚定末页 + P7 放宽宽数。 */
export function initialWindowEnd(anchorEndPage: number): number {
  return anchorEndPage + FIRST_WINDOW_EXTRA_PAGES;
}

export interface CascadeInput {
  /** 当前窗口 [start, end]，0 基闭区间（被认为受影响的旧页）。 */
  readonly windowStart: number;
  readonly windowEnd: number;
  readonly oldPageCount: number;
  /** 本次 ranged print 实际产出的页数（请求 windowEnd-start+2，含哨兵）。 */
  readonly printedPages: number;
  /**
   * 哨兵比对结果：新窗之后一页 vs 旧 end+1 页的 tag-free 等价性；
   * null = 无旧哨兵页可比（end+1 已越旧文档尾）。
   */
  readonly sentinelEqual: boolean | null;
}

export type CascadeStep =
  | {
      readonly kind: "closed";
      /** 新窗页数（不含哨兵）。 */
      readonly newWindowPages: number;
      /** 新总页数。 */
      readonly newPageCount: number;
      /** 页数差（新总页数 − 旧总页数）。 */
      readonly delta: number;
      /** true = 窗口退化覆盖整份（start=0 且收束于文档尾），按整份重排记账。 */
      readonly degeneratedToFull: boolean;
    }
  | { readonly kind: "extend"; readonly newWindowEnd: number }
  | { readonly kind: "fallback"; readonly reason: string };

/**
 * 级联判定。请求打印页数 = (windowEnd-windowStart+1) 窗页 + 1 哨兵页。
 * - 实际产出 < 请求：新文档在窗内到尾（EOF 收束）——新总页数 =
 *   windowStart+printedPages，无需哨兵（新文档在此之后无页）；
 * - 产出齐全且新旧哨兵页都可比：等价 → 收束（delta=新窗页数−旧窗页数）；
 *   不等价 → 旧 end+1 页内容已变，窗口吞入该页延伸一页；
 * - 产出齐全但无旧哨兵页（新文档长过旧文档尾）：无法验证 → 延伸，
 *   直到 EOF 收束。终止性：windowEnd 单调递增，上界由 EOF 收束保证。
 */
export function evaluateCascade(input: CascadeInput): CascadeStep {
  const windowPages = input.windowEnd - input.windowStart + 1;
  const requested = windowPages + 1;
  if (input.printedPages > requested) {
    return Object.freeze({
      kind: "fallback",
      reason: `ranged print returned ${input.printedPages} pages, more than requested ${requested}`,
    });
  }
  if (input.printedPages < requested) {
    // EOF 收束：新文档末页在窗内。
    const newPageCount = input.windowStart + input.printedPages;
    return Object.freeze({
      kind: "closed",
      newWindowPages: input.printedPages,
      newPageCount,
      delta: newPageCount - input.oldPageCount,
      degeneratedToFull: input.windowStart === 0,
    });
  }
  if (input.sentinelEqual === null) {
    return Object.freeze({
      kind: "extend",
      newWindowEnd: input.windowEnd + 1,
    });
  }
  if (!input.sentinelEqual) {
    return Object.freeze({
      kind: "extend",
      newWindowEnd: input.windowEnd + 1,
    });
  }
  const newWindowPages = input.printedPages - 1;
  const delta = newWindowPages - windowPages;
  return Object.freeze({
    kind: "closed",
    newWindowPages,
    newPageCount: input.oldPageCount + delta,
    delta,
    degeneratedToFull: false,
  });
}

// ---------------------------------------------------------------------------
// 目录页码更新（D3：窗内锚定重定位，窗后算术移位）
// ---------------------------------------------------------------------------

export interface TocUpdateInput {
  /** 旧页码表（1 基物理页）。 */
  readonly tocPages: ReadonlyMap<string, number>;
  /** 条目 → 标题锚文本（sectionId → title；调用方自 collectTocEntries 构建）。 */
  readonly anchors: ReadonlyMap<string, string>;
  /** 收束窗口起点（0 基）。 */
  readonly windowStart: number;
  /** 旧窗页数（收束前窗口覆盖的旧页数）。 */
  readonly oldWindowPages: number;
  /** 新窗逐页 run 序列（页序 = 自 windowStart 起）。 */
  readonly newWindowPageRuns: readonly (readonly GeometryTextRun[])[];
  readonly delta: number;
}

/**
 * 目录页码表更新。窗内条目：锚文本在新窗逐页证据中重定位（恰好一页命中，
 * 否则 fallback）；窗后条目（含哨兵页及以后）：页码 += delta（哨兵等价已
 * 保证内容未变，移位是纯算术）；窗前条目不变。返回新表；任何歧义 fail-closed。
 */
export function updateTocPages(input: TocUpdateInput): ReadonlyMap<string, number> {
  const windowEnd = input.windowStart + input.oldWindowPages - 1;
  const windowTexts = input.newWindowPageRuns.map((runs) =>
    runs.map((run) => normalizePdfText(run.text)).join(""),
  );
  const updated = new Map<string, number>();
  for (const [id, oldPage] of input.tocPages.entries()) {
    const pageIndex = oldPage - 1;
    if (pageIndex < input.windowStart) {
      updated.set(id, oldPage);
      continue;
    }
    if (pageIndex > windowEnd) {
      updated.set(id, oldPage + input.delta);
      continue;
    }
    const anchor = input.anchors.get(id);
    if (anchor === undefined) {
      failIncremental(`toc entry ${id} has no anchor text`);
    }
    const needle = normalizePdfText(anchor ?? "");
    const hits: number[] = [];
    for (const [offset, text] of windowTexts.entries()) {
      if (text.includes(needle)) {
        hits.push(offset);
      }
    }
    if (hits.length !== 1) {
      failIncremental(
        `toc heading for entry ${id} not uniquely relocated in window (${hits.length} hits)`,
      );
    }
    updated.set(id, input.windowStart + (hits[0] as number) + 1);
  }
  return updated;
}

/**
 * 窗格收束后的目录页码重算组合（控制器编排用）：空条目集直通；否则自目录
 * 条目构建锚文本、提取新窗逐页 run 证据，委托 updateTocPages（歧义 fail-closed）。
 */
export function recomputeTocPagesAfterWindow(input: {
  readonly entries: readonly TocEntry[];
  readonly tocPages: ReadonlyMap<string, number>;
  readonly windowStart: number;
  readonly oldWindowPages: number;
  readonly newWindowGeometry: PdfGeometry;
  readonly newWindowPages: number;
  readonly delta: number;
}): ReadonlyMap<string, number> {
  if (input.entries.length === 0) {
    return input.tocPages;
  }
  const anchors = new Map<string, string>(
    input.entries.map((entry) => [entry.id, entry.title]),
  );
  const newWindowPageRuns: (readonly GeometryTextRun[])[] = [];
  for (let page = 0; page < input.newWindowPages; page += 1) {
    newWindowPageRuns.push(pageRuns(input.newWindowGeometry, page));
  }
  return updateTocPages({
    tocPages: input.tocPages,
    anchors,
    windowStart: input.windowStart,
    oldWindowPages: input.oldWindowPages,
    newWindowPageRuns: Object.freeze(newWindowPageRuns),
    delta: input.delta,
  });
}

/** 页码表是否变化（决定目录页槽是否需要回填更新）。 */
export function tocPagesDrifted(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): boolean {
  if (before.size !== after.size) {
    return true;
  }
  for (const [id, page] of before.entries()) {
    if (after.get(id) !== page) {
      return true;
    }
  }
  return false;
}
