# PA-01 独立审计发现（PA-A1 MAJOR / PA-A2 / PA-A3 MINOR）整改记录

> 日期：2026-07-24　对应报告：`docs/audits/PA-01-claude-audit-report.md`（FAIL，PA-A1 阻断）　状态：已修复，待 Claude 复审关闭；实施者不自行关闭。
> 整改范围经请示确定为 PA-A1 + PA-A2 + PA-A3；PA-A4～PA-A7 不阻断本门，已登记到 [PA-01-followups.md](PA-01-followups.md)。

## PA-A1（MAJOR）— 两个关键守卫补决定性测试（已修复）

- 问题属实：`reconcile.ts`「文档内容 vs 行账目」检查与 `importer.ts` schema 校验门禁被整段删除后 12 个测试全绿；`syntaxChars` 由行长反推使逐行/汇总恒等式为构造恒真式，这两条才是对账与契约边界的真实承重点。
- 整改（仅新增测试，产品代码零改动）：
  - 新增 `test/reconcile.unit.test.ts`：对 `buildReconciliation` 传入被篡改文档（块文本加字 / 整块丢失两种形态），断言抛 `IMPORT_RECONCILE_FAILED` 且信息为 `document content …`；另保留未篡改正路径。
  - `test/fixture.integration.test.ts` 新增 schema 门禁测试：复用审计构造的 PA-A5 输入形态（101 行表格序数打包溢出 + 相邻表格首格同文撞 ID），断言 `importMarkdownDocument` 拒绝且信息指向 v0.1.0 契约。
- 变异自证（实施者复现审计变异手法，变异后均已逐字节还原）：
  - 删除 `reconcile.ts` 文档↔行账目检查 → reconcile 单测 **2 fail / 1 pass**（变红 ✔）。
  - 删除 `importer.ts` schema 门禁 → 集成测试 **1 fail / 4 pass**（变红 ✔）。

## PA-A2（MINOR）— 纯空白行按语法消费计入对账（已修复）

- 问题属实：仅含空格/制表符的合法空行记 `syntaxChars: 0`，击穿汇总恒等式，导入以内部不变量错误 `IMPORT_RECONCILE_FAILED` 死掉。
- 整改：`parser.ts` 空白分支 `syntaxChars` 记为 `line.length`（与 marker 行同类，空白即语法消费）。
- 测试：新增单测「whitespace-only blank lines are consumed as syntax, not rejected」——2 空格、1 制表符空行导入成功，逐行与汇总恒等式均成立。

## PA-A3（MINOR）— CRLF 行尾逐字归账对真实文件闭合（已修复）

- 问题属实：`replaceAll("\r\n","\n")` 规范化后 `\r` 无归属，Windows 默认行尾文件上 `sourceChars` 少算行数个字符，「全文逐字归账」对真实文件不成立。
- 整改：`parser.ts` 改为按 `\n` 切分后逐行剥离行尾 `\r`，每个 `\r` 计入**该行**的 `syntaxChars`（账目后置一次映射完成）；`sourceChars` 报告原始 `source.length`。LF 输入行为逐字节不变（`\r` 计数为 0，无映射开销）。
- 测试：
  - 单测「CRLF sources account every carriage return as per-line syntax」：`sourceChars == crlf.length`、逐行恒等式（含 `\r`）逐行成立、CRLF 与 LF 块结构 deepEqual（`\r` 不进入内容）。
  - 集成测试「CRLF input reconciles against the raw file character count」：真实文件端到端导入，对账口径对原始字节数闭合（同用例顺带覆盖 PA-A2 空白行）。
- 连带落实报告 §6 观察项：golden fixture 集成测试补**逐行**恒等式断言（原仅汇总），每行 `contentChars + syntaxChars == 该行原始长度`。

## 实施者验证

- `pnpm --filter @wenshu/markdown-import test`：unit 10 + contract 4 + integration 5 = **19 pass / 0 fail**（原 12 + 新增 7）。
- 变异自证两处均变红（见 PA-A1），变异后源文件已还原，`git diff` 产品代码仅 `parser.ts`。
- `pnpm format:check` 通过；`pnpm verify` **exit 0 全绿**（含 quality/typecheck/supply/contracts 与 production build）。
- 冻结物零改动：fixture/字体/schema/生成物/lockfile/依赖均未触碰（SBOM 147→147 预期不变，由 verify 的 supply 门禁复核）。

## 明确未做（防范围蔓延）

- PA-A4（BOM）、PA-A5（序数打包非单射与报错真因）、PA-A6（documentId 语义）、PA-A7（front matter 非 title 键记账口径）按审计结论不阻断本门，登记于 [PA-01-followups.md](PA-01-followups.md)；其中 PA-A5/PA-A6 须在 PA-02 开工前形成决策记录。
- 未改动 `reconcile.ts`/`importer.ts` 任何产品逻辑；未改动 ID 方案与 documentId 语义。
