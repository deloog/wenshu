/**
 * Minimal markdown helpers for the roadmap parser: section heading lookup,
 * pipe-table row extraction, header/separator recognition, and link
 * extraction. Deliberately small and free of roadmap semantics.
 */

export interface Region {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

const LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/gu;
const SEPARATOR_CELL = /^:?-+:?$/u;

export function headingIndex(lines: readonly string[], prefix: string): number {
  return lines.findIndex((line) => line.startsWith(prefix));
}

export function cellsOf(line: string): readonly string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell));
}

/** Data + header rows of a region's pipe tables; separators removed. */
export function tableRows(
  lines: readonly string[],
  region: Region,
): readonly { readonly line: number; readonly cells: readonly string[] }[] {
  const rows: { line: number; cells: readonly string[] }[] = [];
  for (let index = region.start; index < region.end; index++) {
    const line = lines[index];
    if (line === undefined || !line.startsWith("|")) continue;
    const cells = cellsOf(line);
    if (isSeparatorRow(cells)) continue;
    rows.push({ line: index + 1, cells });
  }
  return Object.freeze(rows);
}

export function isHeaderRow(
  cells: readonly string[],
  labels: readonly string[],
): boolean {
  return labels.includes(cells[0] ?? "");
}

export function linksOf(line: string): readonly string[] {
  const targets: string[] = [];
  for (const match of line.matchAll(LINK_PATTERN)) {
    const target = match[1];
    if (target !== undefined) targets.push(target);
  }
  return Object.freeze(targets);
}
