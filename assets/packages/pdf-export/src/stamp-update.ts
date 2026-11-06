import { PdfExportError } from "./errors.ts";
import { extractGeometry } from "./geometry.ts";
import { parseObjects } from "./inspect.ts";
import type { StampSpec } from "./stamp.ts";

/**
 * 压印增量写出与压印带自检（PA-11A，stamp.ts 的字节半）：新内容流对象 +
 * 页字典重写（/Contents 追加 + /Font 增补）的增量更新编码，以及压印带与
 * 既有内容的零交叠几何自检（几何事实，非阈值发明）。
 */

function failUpdate(message: string): never {
  throw new PdfExportError("PDF_EXPORT_STAMP_FAILED", message);
}

export interface PageEntry {
  readonly objectId: number;
  readonly dict: string;
}

export function listPages(
  objects: Map<number, { readonly dict: string }>,
): readonly PageEntry[] {
  return [...objects.entries()]
    .filter(
      ([, object]) =>
        /\/Type\s*\/Page\b/.test(object.dict) &&
        !/\/Type\s*\/Pages\b/.test(object.dict),
    )
    .map(([objectId, object]) => Object.freeze({ objectId, dict: object.dict }));
}

/** 压印带与既有内容的零交叠自检（几何事实，非阈值发明）。 */
export function assertStampBandsClear(
  bytes: Uint8Array,
  spec: StampSpec,
  pageCount: number,
): void {
  const geometry = extractGeometry(bytes);
  if (geometry.pages.length !== pageCount) {
    failUpdate("geometry page count drifted during stamping");
  }
  const headerBottom = spec.pageHeightPt - spec.marginTopPt;
  for (const run of geometry.textRuns) {
    if (run.pageIndex === 0) {
      continue;
    }
    const runTop = run.bbox.y;
    const runBottom = run.bbox.y - run.bbox.height;
    const hitsHeader = runBottom < spec.pageHeightPt && runTop > headerBottom;
    const hitsFooter = runTop > 0 && runBottom < spec.marginBottomPt;
    if (hitsHeader || hitsFooter) {
      failUpdate(
        `stamp band overlaps existing content on page ${run.pageIndex + 1} (band ${
          hitsHeader ? "header" : "footer"
        })`,
      );
    }
  }
}

export interface StampAddition {
  readonly objectId: number;
  readonly body: string;
}

/** 增量更新写出（压印专用）：新内容流对象 + 页字典重写（/Contents 追加 + /Font 增补）。 */
export function buildStampUpdate(
  original: Uint8Array,
  additions: readonly StampAddition[],
): Uint8Array {
  const text = Buffer.from(original).toString("latin1");
  const prevStart = /startxref\s+(\d+)\s*%%EOF\s*$/u.exec(text)?.[1];
  if (prevStart === undefined) {
    failUpdate("original pdf lacks startxref");
  }
  const trailerMatch = /trailer\s*<<([\s\S]*?)>>\s*startxref/u.exec(text);
  const rootRef = /\/Root\s+(\d+\s+0\s+R)/u.exec(trailerMatch?.[1] ?? "")?.[1];
  const infoRef = /\/Info\s+(\d+\s+0\s+R)/u.exec(trailerMatch?.[1] ?? "")?.[1];
  if (rootRef === undefined) {
    failUpdate("original trailer lacks /Root");
  }

  const sorted = [...additions].sort((a, b) => a.objectId - b.objectId);
  const parts: string[] = [];
  const offsets = new Map<number, number>();
  let cursor = original.length;
  for (const addition of sorted) {
    const chunk = `${addition.objectId} 0 obj\n${addition.body}\nendobj\n`;
    offsets.set(addition.objectId, cursor);
    parts.push(chunk);
    cursor += Buffer.byteLength(chunk, "latin1");
  }
  const xrefStart = cursor;
  const xrefLines: string[] = [];
  let index = 0;
  while (index < sorted.length) {
    const startId = sorted[index]?.objectId ?? 0;
    let end = index;
    while (
      end + 1 < sorted.length &&
      (sorted[end + 1]?.objectId ?? 0) === (sorted[end]?.objectId ?? 0) + 1
    ) {
      end += 1;
    }
    const entries = sorted
      .slice(index, end + 1)
      .map(
        (addition) =>
          `${(offsets.get(addition.objectId) ?? 0).toString().padStart(10, "0")} 00000 n \n`,
      )
      .join("");
    xrefLines.push(`${startId} ${end - index + 1}\n${entries}`);
    index = end + 1;
  }
  const existingMax = [...parseObjects(original).keys()].reduce(
    (max, id) => Math.max(max, id),
    0,
  );
  const maxId = Math.max(existingMax, sorted[sorted.length - 1]?.objectId ?? 0);
  const trailer =
    `trailer\n<</Size ${maxId + 1} /Root ${rootRef}` +
    (infoRef === undefined ? "" : ` /Info ${infoRef}`) +
    ` /Prev ${prevStart}>>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const update = `${parts.join("")}xref\n${xrefLines.join("")}${trailer}`;
  const out = new Uint8Array(original.length + Buffer.byteLength(update, "latin1"));
  out.set(original, 0);
  out.set(Buffer.from(update, "latin1"), original.length);
  return out;
}
