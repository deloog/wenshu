# PA-A5/A6 实施记录（决策 #8/#9 落地）

> 日期：2026-07-24　依据：[决策 #8/#9](../../决策记录.md)（均已批准）+ [document-model.md §8](../document-model.md)　状态：已实现，待 Claude 独立审计；实施者不自行关闭发现。

## 实施面（严格限定在决策钉死范围）

### 决策 #8（PA-A5 · 节点 ID 复合摘要种子）

- `document.ts`：`stableId` 位置参数由数字改为分层种子串——节点 `ordinal`；列表项/表格列 `ordinal:index`；表格行 `ordinal:rowIndex`；单元格 `ordinal:rowIndex:cellIndex`，以 `种子:kind:内容摘要` 喂入 SHA-256。十进制位宽打包全部移除，构造单射、无规模上限。
- **承重不变量落地**：`stableId` 入口守卫 `kind` 必须匹配非数字词汇表（`/^[A-Za-z-]+$/`，同时拒绝数字与冒号），违反即抛错——任何现存测试都会立刻变红，无需独立枚举测试。
- `importer.ts`：schema 门禁错误信息携带 `validateDocument` 稳定 issues（`code at /json/path`，分号连接），不回显正文/标题/资源内容（§5）。
- ID 外在形式不变：`前缀_` + 32 个十六进制字符（128 比特）；Schema 零变更。

### 决策 #9（PA-A6 · documentId 跨修订稳定标识）

- `importMarkdownDocument(sourcePath, importRoot)`：**importRoot 必填**，源文件必须解析在根内（相对路径为空、`..` 前缀或绝对即 fail-closed，新错误码 `IMPORT_ROOT_INVALID`）。
- documentId = `doc_` + SHA-256（`wenshu/import/v0\n<根内 POSIX 相对路径>\n<title>`）前 32 个十六进制字符；相对路径跨平台归一为 POSIX 分隔符，保证同一检出在 Windows/Linux 派生同一 ID。
- 资产引用语义未动：仍按源文件目录相对解析；§7.2 既有拒绝（`..`/绝对/盘符/反斜杠）使解析结果必然位于源文件目录内、进而位于声明根内，「不得越出声明根」为既有拒绝的自然推论，无新增攻击面。

## 测试与决定性

- 新增 contract 测试「long tables and lists stay injective beyond the old decimal packing limits」：PA-A5 原反例（101 行表格撞键 + 101 项列表撞键）现被接受、validateDocument 通过、全部 ID 唯一。
- PA-A1-b 触发器按决策替换：101 行撞 ID 输入（单射化后已合法）→ **title 501 字**（超 ShortText maxLength 500），断言 `DOCUMENT_SCHEMA at /title`。
- 新增 integration 测试：同名不同相对路径（`2026-01/周报.md` vs `2026-02/周报.md`）→ 不同 documentId、同路径重导入幂等、改标题 → 新身份；源文件越根与「根即源」均 `IMPORT_ROOT_INVALID`。
- 全部既有调用点更新（测试 + `scripts/parse-fixture.ts` 传 fixtures 目录为公共根）。

## 变异自证（实施者复现审计手法，变异后均逐字节还原）

| 变异 | 结果 |
|---|---|
| cell 种子回退为 `ordinal*10000+row*100+col` 算术打包 | 「long tables…injective」**变红** ✔ |
| 删除 schema 门禁（过长 title 输入） | 门禁测试**变红** ✔（新触发器决定性成立） |
| documentId 回退为仅 `sha256(title)` | 同名不同路径测试**变红** ✔ |
| 删除越根检查 | `IMPORT_ROOT_INVALID` 测试**变红** ✔ |

> 注：变异 3 首次以 heredoc 注入时因转义未生效却报绿，经复查识破并重做有效变异——已按「注入未生效」假阳性教训核验每次变异确实落地。

## 实施者验证

- `pnpm --filter @wenshu/markdown-import test`：unit 10 + contract 5 + integration 7 = **22 pass / 0 fail**（原 19 + 新增 3）。
- `parse:fixture` 冒烟：对账数值与冻结基线逐项一致（12664 = 11136 + 1225 + 303；counts 不变），documentId 已为新派生。
- `pnpm format:check` 通过；`pnpm verify` **exit 0 全绿**（含 quality/typecheck/supply/contracts 与 production build）。
- 冻结物零改动：fixture/字体/schema/生成物/lockfile 未触碰；零新增依赖（SBOM 147→147 由 verify supply 门禁复核）。

## PA-B1 修复（审计 MINOR，本轮顺手收口）

- 问题属实：越根判定 `startsWith("..")` 过宽，误拒 `..foo` 等名以 `..` 开头的合法子目录；fail-closed 方向安全但属行为缺陷。
- 修复：按路径段判定——`relativeSource === ".." || relativeSource.startsWith(`..${sep}`)`，合法点前缀目录放行，真正越根（`..` 段）与异盘（`isAbsolute`）依旧 fail-closed。
- 测试：新增「dot-prefixed directory names inside the root remain legal」。变异自证：回退为 `startsWith("..")` → 该测试**变红**，已逐字节还原。
- PA-B2（观察项，审计登记）：kind 守卫无专属测试，与决策 #8「代码评审检查点」定位一致，不整改。

## 实施期审查项（决策 #9 登记，移交审计）

- 「禁止逐文件退化」是调用方契约，导入器无法自证：请审计真实调用点（`scripts/parse-fixture.ts` 与测试）传入的是公共根而非源文件目录。当前唯一生产调用点 parse-fixture 传 `docs/poc-a/fixtures`（fixture 公共根）✔；测试均传构造的公共根 ✔。PA-02 落地新调用点时须复核同一条。

## 明确未做

- PA-A4/A7/A8 不在本轮范围（followups 归属不变，PA-A8 仍须 PA-03 前关闭）。
- 未触碰 schema/生成物/其他包；未改 `revision` 语义与项目层命名空间供给方式（项目层消费时再定）。
