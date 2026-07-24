import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { RenderCheckError } from "./errors.ts";

/** 一个字重的加载计划：逻辑身份 + 冻结清单的文件名与 SHA-256 锚点。 */
export interface FontFacePlan {
  readonly weight: number;
  readonly style: string;
  readonly postscriptName: string;
  readonly fileName: string;
  readonly sha256: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/** 从冻结 font-manifest.json 收窄加载计划；不可信输入 fail-closed。 */
export function parseFontPlan(input: unknown): readonly FontFacePlan[] {
  const manifest = asRecord(input);
  const files = manifest?.["files"];
  if (!Array.isArray(files) || files.length === 0) {
    throw new RenderCheckError(
      "RENDER_FONT_INTEGRITY",
      "font manifest has no usable files list",
    );
  }
  const plan: FontFacePlan[] = [];
  for (const [index, entry] of files.entries()) {
    const face = asRecord(entry);
    const weight = face?.["weight"];
    const style = face?.["style"];
    const postscriptName = face?.["postscript_name"];
    const path = face?.["path"];
    const sha256 = face?.["sha256"];
    if (
      typeof weight !== "number" ||
      !Number.isInteger(weight) ||
      typeof style !== "string" ||
      typeof postscriptName !== "string" ||
      typeof path !== "string" ||
      typeof sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(sha256)
    ) {
      throw new RenderCheckError(
        "RENDER_FONT_INTEGRITY",
        `font manifest entry ${index} is malformed`,
      );
    }
    const fileName = basename(path);
    if (fileName !== path) {
      throw new RenderCheckError(
        "RENDER_FONT_INTEGRITY",
        `font manifest entry ${index} path must be a bare file name`,
      );
    }
    plan.push(Object.freeze({ weight, style, postscriptName, fileName, sha256 }));
  }
  return Object.freeze(plan);
}

/** 字体字节身份门禁：缺文件或 SHA-256 漂移即失败，绝不静默降级。 */
export async function verifyFontFiles(
  fontDirectory: string,
  plan: readonly FontFacePlan[],
): Promise<void> {
  for (const face of plan) {
    let bytes: Uint8Array;
    try {
      bytes = await readFile(join(fontDirectory, face.fileName));
    } catch {
      throw new RenderCheckError(
        "RENDER_FONT_INTEGRITY",
        `required font file is missing (weight ${face.weight})`,
      );
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== face.sha256) {
      throw new RenderCheckError(
        "RENDER_FONT_INTEGRITY",
        `font file hash drift detected (weight ${face.weight})`,
      );
    }
  }
}
