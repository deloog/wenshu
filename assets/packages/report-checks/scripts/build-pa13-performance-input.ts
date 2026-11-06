/**
 * PA-13 性能样本生成器。它从冻结 21 页 fixture 复制到调用方独占目录，
 * 再追加版本化的机械附录；绝不写入或修改冻结 `docs/poc-a/fixtures`。
 *
 * 该文件的重复次数是签署前校准参数：只能在参考 VM 的实际页数测得后冻结。
 */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SAMPLE_VERSION = "pa-13-performance-30-page-v1";
const DEFAULT_APPENDIX_REPETITIONS = 280;
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const sourceRoot = resolve(repoRoot, "docs", "poc-a", "fixtures");

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const outRoot = argValue("--out");
if (outRoot === undefined) {
  throw new Error("PA-13 sample builder requires --out <empty-directory>");
}
const targetRoot = resolve(outRoot);
const repetitionsArg = argValue("--repetitions");
const repetitions =
  repetitionsArg === undefined ? DEFAULT_APPENDIX_REPETITIONS : Number(repetitionsArg);
if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 2_000) {
  throw new Error("PA-13 --repetitions must be an integer in [1, 2000]");
}
await mkdir(targetRoot, { recursive: false });
await cp(sourceRoot, targetRoot, {
  recursive: true,
  filter: (path) => !path.endsWith("manifest.json"),
});

const goldenPath = resolve(sourceRoot, "golden-report.md");
const markdown = await readFile(goldenPath, "utf8");
const paragraph = "性能采样机械载荷：保留真实排版、检查和导出路径。";
const appendix = [
  "",
  "## 附录：性能采样材料",
  "",
  `样本版本：${SAMPLE_VERSION}。本段及其后续重复段落为机械性能载荷。`,
  "",
  ...Array.from({ length: repetitions }, () => paragraph),
  "",
].join("\n\n");
const targetPath = resolve(targetRoot, "pa-13-performance-30-page.md");
await writeFile(targetPath, `${markdown}${appendix}`, "utf8");
console.log(`PA-13 performance input: ${targetPath}`);
console.log(`sampleVersion=${SAMPLE_VERSION} repetitions=${repetitions}`);
