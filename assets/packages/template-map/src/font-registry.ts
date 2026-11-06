import { cloneAndFreeze } from "@wenshu/contract-runtime";

import type { TemplateMapIssue } from "./types.ts";

export interface ApprovedFontFace {
  readonly weight: number;
  readonly style: string;
  readonly postscriptName: string;
}

/** 已批准字体清单（G1-13 font-manifest.json）收窄后的受控注册表。 */
export interface ApprovedFontSet {
  readonly family: string;
  readonly version: string;
  readonly faces: readonly ApprovedFontFace[];
}

export type FontRegistryResult =
  | { readonly ok: true; readonly value: ApprovedFontSet }
  | { readonly ok: false; readonly issues: readonly TemplateMapIssue[] };

function failure(path: string): FontRegistryResult {
  return Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({ code: "TEMPLATE_MAP_FONT_REGISTRY_INVALID" as const, path }),
    ]),
  });
}

/** 把冻结字体清单收窄为受控注册表；不可信输入 fail-closed，只取逻辑身份字段。 */
export function parseApprovedFontSet(input: unknown): FontRegistryResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return failure("/");
  }
  const record = input as Record<string, unknown>;
  const family = record["family"];
  const version = record["version"];
  const files = record["files"];
  if (typeof family !== "string" || family.length === 0) {
    return failure("/family");
  }
  if (typeof version !== "string" || version.length === 0) {
    return failure("/version");
  }
  if (!Array.isArray(files) || files.length === 0) {
    return failure("/files");
  }
  const faces: ApprovedFontFace[] = [];
  const seenWeights = new Set<number>();
  for (const [index, entry] of files.entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return failure(`/files/${index}`);
    }
    const face = entry as Record<string, unknown>;
    const weight = face["weight"];
    const style = face["style"];
    const postscriptName = face["postscript_name"];
    if (typeof weight !== "number" || !Number.isInteger(weight) || weight <= 0) {
      return failure(`/files/${index}/weight`);
    }
    if (typeof style !== "string" || style.length === 0) {
      return failure(`/files/${index}/style`);
    }
    if (typeof postscriptName !== "string" || postscriptName.length === 0) {
      return failure(`/files/${index}/postscript_name`);
    }
    if (seenWeights.has(weight)) {
      return failure(`/files/${index}/weight`);
    }
    seenWeights.add(weight);
    faces.push(Object.freeze({ weight, style, postscriptName }));
  }
  return Object.freeze({
    ok: true,
    value: cloneAndFreeze({ family, version, faces }),
  });
}
