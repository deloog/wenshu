/**
 * normalized-pdf-sha（A-04E-2a 正式工具，移植自 tmp/pa11a-bootstrap.ps1:27-43
 * 的 PowerShell NormalizedHash——同环境确定性/输出不变证据的唯一算法口径）：
 * Skia 每次打印写入墙钟 /CreationDate//ModDate（PA-05 元数据政策书面允许的
 * 确定性差异来源），归一化全部 `D:<14 位数字>` 时间戳后取 sha256。
 * 字节口径与 PowerShell 版逐位一致：latin1(ISO-8859-1) 读入 → 替换 → sha256，
 * 输出大写十六进制（沿用既有 determinism.txt 证据格式）。
 * 用法：node tools/a-04e/normalized-pdf-sha.mjs <pdf> [<pdf> ...]
 * 输出：<SHA256>  <path>（每行一个）；文件不可读即非零退出（fail-closed）。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node normalized-pdf-sha.mjs <pdf> [<pdf> ...]");
  process.exit(2);
}

for (const file of files) {
  const text = readFileSync(file).toString("latin1");
  const normalized = text.replace(/D:\d{14}/g, "D:00000000000000");
  const sha = createHash("sha256")
    .update(Buffer.from(normalized, "latin1"))
    .digest("hex")
    .toUpperCase();
  console.log(`${sha}  ${file}`);
}
