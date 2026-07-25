/**
 * P0_PAGE_SIZE：每页必须等于 A4（PA-05/06 既定容差 ±1pt）。
 */
import type { P0CheckInput, P0Rule } from "../check-input.ts";
import { makeFinding, pageRef } from "../finding.ts";
import type { Finding } from "../generated/check-report.ts";
import { A4_HEIGHT_PT, A4_WIDTH_PT, PAGE_SIZE_TOLERANCE_PT } from "../layout.ts";

function check(input: P0CheckInput): readonly Finding[] {
  const findings: Finding[] = [];
  for (const page of input.evidence.pages) {
    const widthDrift = Math.abs(page.widthPt - A4_WIDTH_PT);
    const heightDrift = Math.abs(page.heightPt - A4_HEIGHT_PT);
    if (widthDrift > PAGE_SIZE_TOLERANCE_PT || heightDrift > PAGE_SIZE_TOLERANCE_PT) {
      findings.push(
        makeFinding("p0-page-size", "P0_PAGE_SIZE", page.index, pageRef(page.index), {
          widthPt: page.widthPt,
          heightPt: page.heightPt,
          widthDriftPt: widthDrift,
          heightDriftPt: heightDrift,
        }),
      );
    }
  }
  return findings;
}

export const p0PageSizeRule: P0Rule = Object.freeze({
  id: "p0-page-size",
  check,
});
