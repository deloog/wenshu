/**
 * normalized-pdf-sha-persistent（A-04E-2a 第二批专用口径，业主 2026-08-08 裁定）。
 *
 * 与签署口径 tools/a-04e/normalized-pdf-sha.mjs 并存，互不改写：
 * 签署口径只归一化 `D:<14 位>` 时间戳，适用于「每次冷启浏览器」形态
 * （结构树 node ID 计数器每进程从 0 起，跨产物天然一致）。
 *
 * 持久会话形态下，Chromium 结构树 ID 计数器是会话进程全局递增的——同会话
 * 第二次打印的 /ID (nodeNNNNNNNN) 及其 /Headers 引用整体平移（实测：run1
 * 区间 00000208–00000598，run2 自 00001299 起跳；ID 语义只保证唯一，对布局/
 * 文本层/阅读序无影响，几何等价门不碰原始字节故不受此影响）。
 *
 * 本口径在签署归一化基础上追加【按首次出现序规范化重编号】：
 *   全文按字节序扫描 node\d{8}，第 1 个出现的相异 ID → node00000001，第 2 个
 *   → node00000002……/Headers 引用与 /ID 定义同流同步重映射。
 * 比较的是 ID 图在重命名意义下的同构，而不是无视 ID：
 *   - 结构相同的两份产物（仅会话内平移）→ 规范序列相同 → 判等；
 *   - 引用换指、结构节点增删、出现顺序变化 → 规范序列不同 → 判不等。
 * 严禁替换为「抹成常量」——那会让门失明（业主裁定原文）。
 *
 * 配套决定性校验：tools/a-04e/verify-persistent-caliber.mjs
 * （冷启产物上与签署口径判定一致性交叉校验 + 换指/增/删反例必须判不等）。
 *
 * 用法：node tools/a-04e/normalized-pdf-sha-persistent.mjs <pdf> [<pdf> ...]
 * 输出：<SHA256>  <path>（每行一个，沿用 determinism.txt 证据格式）；
 * 文件不可读即非零退出（fail-closed）。
 */
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** 签署归一化（时间戳）+ 结构树 ID 首次出现序重编号。保持字节长度不变。 */
export function normalizePersistentCaliber(text) {
  const dated = text.replace(/D:\d{14}/g, "D:00000000000000");
  const numbering = new Map();
  return dated.replace(/node\d{8}/g, (found) => {
    let mapped = numbering.get(found);
    if (mapped === undefined) {
      mapped = `node${String(numbering.size + 1).padStart(8, "0")}`;
      numbering.set(found, mapped);
    }
    return mapped;
  });
}

// 仅作为 CLI 直接调用时执行（verify-persistent-caliber.mjs 导入函数时不触发）。
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("usage: node normalized-pdf-sha-persistent.mjs <pdf> [<pdf> ...]");
    process.exit(2);
  }

  for (const file of files) {
    const normalized = normalizePersistentCaliber(
      readFileSync(file).toString("latin1"),
    );
    const sha = createHash("sha256")
      .update(Buffer.from(normalized, "latin1"))
      .digest("hex")
      .toUpperCase();
    console.log(`${sha}  ${file}`);
  }
}
