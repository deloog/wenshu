import { RenderCheckError } from "./errors.ts";
import type { FontFacePlan } from "./fonts.ts";

export interface FontFaceReport {
  readonly weight: number;
  readonly status: string;
  readonly check: boolean;
}

export interface FontLoadReport {
  readonly faces: readonly FontFaceReport[];
  readonly widths: Readonly<Record<string, number>>;
}

/**
 * 页面侧字体探针表达式：用 Font Loading API 显式加载每个字重并加入 document.fonts，
 * 逐字重报告 load 状态与 document.fonts.check，再用 canvas 探针文本量宽对比兜底。
 * 探针文本混合 CJK 与拉丁/数字，保证目标字体与默认字体宽度必然不同。
 */
export function buildFontProbeExpression(
  fontBaseUrl: string,
  plan: readonly FontFacePlan[],
  probeText: string,
): string {
  // 探针使用系统上必不存在的独占注册名：宽度只能来自我们加载的字体文件，
  // 杜绝与系统已装同名字体混淆（fallback 检测的决定性前提）。
  const family = "Wenshu Render Probe";
  const faces = plan.map((face) => ({
    weight: face.weight,
    url: `${fontBaseUrl}${face.fileName}`,
  }));
  return `(async () => {
  const plan = ${JSON.stringify(faces)};
  const family = ${JSON.stringify(family)};
  const probe = ${JSON.stringify(probeText)};
  const faces = [];
  for (const face of plan) {
    const font = new FontFace(family, "url(" + face.url + ")", { weight: String(face.weight) });
    try {
      const loaded = await font.load();
      document.fonts.add(loaded);
      faces.push({
        weight: face.weight,
        status: loaded.status,
        check: document.fonts.check(String(face.weight) + " 16px \\"" + family + "\\""),
      });
    } catch (error) {
      faces.push({ weight: face.weight, status: "error", check: false });
    }
  }
  const canvas = document.createElement("canvas").getContext("2d");
  const widths = {};
  for (const face of plan) {
    canvas.font = String(face.weight) + ' 16px "' + family + '"';
    widths[face.weight] = canvas.measureText(probe).width;
  }
  return { faces, widths };
})()`;
}

/**
 * 缺字重、加载失败、check 为假或字重间量宽不可区分一律明确失败。
 * 探针 family 为独占注册名（系统必不存在同名），font matching 只能命中我们加载的
 * FontFace——「实际生效」由匹配算法构造保证；宽度不用于与默认字体比较，因为系统
 * 可能装有度量相同的同名字体（此时宽度相等是假阳性，而非 fallback 证据）。
 * 宽度只做字重间区分：同一文件被喂给多个字重（错字重）时量宽撞合，即被抓。
 */
export function assertFontsUsable(
  report: FontLoadReport,
  plan: readonly FontFacePlan[],
): void {
  const seenWidths = new Map<number, number>();
  for (const face of plan) {
    const entry = report.faces.find((candidate) => candidate.weight === face.weight);
    if (entry === undefined || entry.status !== "loaded" || !entry.check) {
      throw new RenderCheckError(
        "RENDER_FONT_LOAD_FAILED",
        `font weight ${face.weight} is not usable in the browser`,
      );
    }
    const width = report.widths[String(face.weight)];
    const collision = width !== undefined ? seenWidths.get(width) : undefined;
    if (width === undefined || collision !== undefined) {
      throw new RenderCheckError(
        "RENDER_FONT_FALLBACK",
        `font weight ${face.weight} is indistinguishable from weight ${collision ?? "?"}`,
      );
    }
    seenWidths.set(width, face.weight);
  }
}

/** 渲染 DOM 语义摘要表达式（标题层级、表格 scope、figure 关联、引用、分页标记）。 */
export const SEMANTIC_SUMMARY_EXPRESSION = `(() => {
  const all = (selector) => [...document.querySelectorAll(selector)];
  return {
    title: document.querySelector("header h1")?.textContent ?? null,
    headings: all("main section h2, main section h3, main section h4").length,
    sectionsLabeled: all("main section").every((section) => {
      const id = section.getAttribute("aria-labelledby");
      return id !== null && document.getElementById(id) !== null;
    }),
    tables: all("table").length,
    thScoped: all("th").every((th) => th.getAttribute("scope") === "col"),
    figures: all("figure").length,
    figuresWithCaption: all("figure").every((figure) => figure.querySelector("figcaption") !== null),
    imagesWithAlt: all("img").every((img) => (img.getAttribute("alt") ?? "").length > 0),
    pageBreaks: all('[role="separator"]').length,
    quotes: all("blockquote").length,
    lists: all("ul, ol").length,
  };
})()`;

/** 渲染文本节点序列表达式（与文档文本序列逐字对账）。 */
export const TEXT_SEQUENCE_EXPRESSION = `(() => {
  const walker = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) {
    const value = walker.currentNode.nodeValue;
    if (value !== null && value.trim().length > 0) {
      texts.push(value);
    }
  }
  return texts;
})()`;
