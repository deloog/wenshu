import type { GeometryTextRun, PdfGeometry } from "./geometry.ts";
import { fail } from "./backfill-toc-shared.ts";

// ---------------------------------------------------------------------------
// 几何终验：回填前后除被替换/删除的数字 run 外逐一全等（决策 #21 首关口）
// ---------------------------------------------------------------------------

export function runsEqual(a: GeometryTextRun, b: GeometryTextRun): boolean {
  return (
    a.pageIndex === b.pageIndex &&
    a.text === b.text &&
    a.baselineY === b.baselineY &&
    a.fontSize === b.fontSize &&
    a.font.tag === b.font.tag &&
    a.font.objectId === b.font.objectId &&
    a.bbox.x === b.bbox.x &&
    a.bbox.y === b.bbox.y &&
    a.bbox.width === b.bbox.width &&
    a.bbox.height === b.bbox.height
  );
}

export function assertSameGeometry(before: PdfGeometry, after: PdfGeometry): void {
  if (before.pages.length !== after.pages.length) {
    fail("backfill changed the page count");
  }
  for (let index = 0; index < before.pages.length; index += 1) {
    const a = before.pages[index];
    const b = after.pages[index];
    if (
      a === undefined ||
      b === undefined ||
      a.index !== b.index ||
      a.rotate !== b.rotate ||
      a.mediaBox.length !== b.mediaBox.length ||
      a.mediaBox.some((value, i) => value !== b.mediaBox[i])
    ) {
      fail("backfill changed a page box or rotation");
    }
  }
  if (before.figures.length !== after.figures.length) {
    fail("backfill changed the figure count");
  }
  for (let index = 0; index < before.figures.length; index += 1) {
    const a = before.figures[index];
    const b = after.figures[index];
    if (
      a === undefined ||
      b === undefined ||
      a.pageIndex !== b.pageIndex ||
      a.mcid !== b.mcid ||
      a.altShort !== b.altShort ||
      a.altLong !== b.altLong ||
      a.bbox.x !== b.bbox.x ||
      a.bbox.y !== b.bbox.y ||
      a.bbox.width !== b.bbox.width ||
      a.bbox.height !== b.bbox.height ||
      a.paintBBox.x !== b.paintBBox.x ||
      a.paintBBox.y !== b.paintBBox.y ||
      a.paintBBox.width !== b.paintBBox.width ||
      a.paintBBox.height !== b.paintBBox.height
    ) {
      fail("backfill changed a figure span");
    }
  }
}
