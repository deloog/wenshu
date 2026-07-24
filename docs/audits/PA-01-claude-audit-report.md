# PA-01 固定 Markdown 解析为 v0 类型化文档 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-24
> 实施基线：PR #7 合并提交 `bdd672f`（`merged=true`, `base=main`, `head=pa-01-markdown-import`, check-runs `success=8`）
> 台账提交：`b5ef200`　任务书：`docs/audits/PA-01-claude-audit-task.md`
> 写入边界：本轮仅新增本文件；仓外探针写于 `D:\tmp\pa01*`，收尾已删除；未 push、未建 PR、未触发 Actions。

---

## 1. 结论（先行）

**FAIL —— 不签署 PA-01 通过。**

阻断点唯一且明确：任务书 §4「守卫决定性」点名的四个关键守卫中，**有两个被整段删除后 12 个测试仍然全绿**（详见 PA-A1）。按 §5「无 BLOCKER/MAJOR 且 MINOR 有归属才可给 CONDITIONAL PASS」，存在 MAJOR 即不可签署。

同时必须如实记录，避免结论被过度解读：

- **§5 枚举的六项产品级 FAIL 条件，一项都未触发。** 无源字符失账或重复计入、无内容/表格/图片引用丢失、无「schema 未通过却声称通过」、范围外语法无一可混入、「标记」读法成立无范围缺项、无新增未申报依赖。
- **冻结 fixture 路径的产品代码，在 §2 的每一个维度上都经独立重算验证为正确。** 见 §2。
- 阻断点位于**测试对守卫的承重**，不在产品行为。修复面小（补两个测试），预计一轮即可复审关闭。

---

## 2. 内容对账（核心）—— 独立重算结果

方法：不使用被审的 `reconcile.ts`，用「子序列 + 多重集合 + 逐行重构」三重独立口径交叉验证。

### 2.1 逐字归账对**任意行**成立（非仅汇总）

| 检查 | 结果 |
|---|---|
| `sourceChars` 与源文件字符数 | 12664 == 12664 ✔ |
| `newlineChars` 与实际 `\n` 数 | 303 == 303 ✔ |
| 汇总恒等式 `content+syntax+newlines == source` | 11136 + 1225 + 303 = 12664 ✔ |
| **逐行恒等式** `contentChars + syntaxChars == 该行原始长度` | **303 / 303 行全部成立 ✔** |
| 行覆盖性：每个源行恰好归账一次 | 无重复、无遗漏、无越界行号 ✔ |

### 2.2 内容零丢失（不依赖实施方口径）

独立提取文档全部文本节点（title + section.title + paragraph/quote.text + list.items + table 列头/单元格 + figure.altText），共 303 个节点、11139 字符：

- **子序列检查**：文档文本是源文本的子序列，匹配 **11139 / 11139** ✔ —— 证明无凭空内容、无重排、无丢字。
- **多重集合检查**：无任何字符在文档中的出现次数超过源中次数（超量种类 0）✔ —— 证明无重复计入。
- **差额追责**：文档文本 11139 − `contentChars` 11136 = 3，完整追责到 `embeddedBreaks=3`，来源为 L18–L21 四行合并成的单个段落所含 3 个块内换行；该 3 个 `\n` 源自源换行符（已计入 `newlineChars=303`），扣减正确 ✔。
- 抽查含 `**`、反引号、表格、图片、front matter 的具体行，逐行恒等式均成立（例：L18 `**报告性质：** …` len=24 = content 20 + syntax 4；L121 含反引号与单星 len=79 = 75 + 4；L79 表头 len=30 = 14 + 16）。

### 2.3 表格

源中 5 个表格 vs 文档 5 个表格，**表头、对齐、每个单元格文本逐项比对全部一致 ✔**（表1 5列5行 / 表2 5列3行 / 表3 4列7行 / 表4 6列12行 / 表5 2列7行）。

> **我方探针错误一则，已作废**：初次比对时我把对齐预期写成 `left`/`right`，报出 5 张表「对齐不一致」。经核 schema `TableColumn.align` 枚举为 `["start","center","end"]`（CSS 逻辑属性），`---:` → `end`、`---` → `start` 的映射**完全正确**。此项非缺陷，特此更正记录。

### 2.4 图片资产

| 原引用 | 我独立实算 SHA-256 前16位 | 实际规范名 | 一致 |
|---|---|---|---|
| `chart-overview.svg` | `4066411570a1b6e4` | `assets/4066411570a1b6e4.svg` | ✔ |
| `chart-process.svg` | `55a1edc77f743853` | `assets/55a1edc77f743853.svg` | ✔ |

内容寻址重命名符合 PA-00 §7.2（`assets/<sha256前16位>.<小写扩展名>`）✔。

### 2.5 `[[TOC]]`

`marker-toc` 计 1 条、`contentChars=0`（100% 语法消费）；文档块类型统计中 **`toc` 块为 0**，schema 亦无 `toc` 常量 —— 消费不落块成立，未与 PA-11 目录职责冲突 ✔。

### 2.6 稳定 ID 三性质

| 性质 | 结果 |
|---|---|
| 幂等性（同输入两次导入） | documentId、全部节点 ID 序列、完整文档 JSON 三者均逐字一致 ✔ |
| 重复内容不碰撞 | 三个完全同文段落获得三个不同 ID ✔ |
| 输入变更 → ID 变更 | 改第 2 段后恰好 1 / 3 个 ID 变化，未改动段落 ID 保持稳定 ✔ |
| golden-report 自身 | 346 个节点，重复 ID 组数 0 ✔ |

---

## 3. 取舍审查

**（1）「标记」读法（自定义标记 vs 强调标记）—— 成立。** 范围内块类型映射与 schema `Block` 常量集（`section/paragraph/list/quote/table/figure/pageBreak`）一致，schema 中 `strong|emphasis|inline|marks|bold|italic` 零匹配，v0.1.0 确无行内强调结构。`[[PAGE_BREAK]]`/`[[TOC]]` 作为自定义标记消费、其余 `[[X]]` 一律 fail-closed（实测见 §4）。未发现因读法导致的范围缺项。

**（2）行内强调剥离 —— 前提经实测成立。** fixture 中 10 处 `**` **全部为行首标签式**（`**报告性质：**`、`**样本版本：**` 等），**句中强调为 0 处**。故"内容 vs 表现"的边界划分在本 fixture 上不产生观感损失，"字重表现交棒 PA-04"的责任链成立。

> 提请注意（非缺陷，属风险登记）：该前提是 **fixture 的性质**，不是**输入的性质**。真实用户草稿出现句中强调是常态，届时 `**` 将被无声剥离为普通文字。责任链交棒 PA-04 只解决"字重如何呈现"，不解决"强调位置信息在模型层已丢失"。建议在 PA-15 交付观感风险清单中显式登记此项，而非默认由 PA-04 承接。

**（3）front matter 非 title 元数据按语法消费 —— 与 schema 一致，但记账口径失真。** schema 顶层 `additionalProperties: false` 且仅有 `schemaVersion/documentId/revision/title/language/blocks/assets`，**无任何元数据容器**，故丢弃 `subtitle`/`author`/`short_title` 等确为 schema 强制、非实施方偷懒。此项无「应入文档却被静默丢弃」的信息。但记账口径见 PA-A7。

---

## 4. 边界与门禁

### 4.1 范围外语法 fail-closed —— 31 类实测全部正确拒绝 ✔

正文中植入哨兵串（`绝密正文XYZZY机密内容`）检查回显。

| 类别 | 错误码 | 类别 | 错误码 |
|---|---|---|---|
| 代码围栏 ` ``` ` | `IMPORT_UNSUPPORTED_SYNTAX` | 四级标题 `####` | `IMPORT_UNSUPPORTED_SYNTAX` |
| HTML 块 `<div>` | `IMPORT_UNSUPPORTED_SYNTAX` | HTML 行内 `<b>` | `IMPORT_UNSUPPORTED_SYNTAX` |
| 缩进代码块（4空格） | `IMPORT_UNSUPPORTED_SYNTAX` | Setext `===` / `---` | `IMPORT_UNSUPPORTED_SYNTAX` |
| 行内链接 `[x](y)` | `IMPORT_UNSUPPORTED_SYNTAX` | 未知标记 `[[FOO]]`/`[[TOC2]]` | `IMPORT_UNSUPPORTED_SYNTAX` |
| 转义 `\*` | `IMPORT_UNSUPPORTED_SYNTAX` | 未配对 `**` / 反引号 | `IMPORT_UNSUPPORTED_SYNTAX` |
| 残缺表格（列数不符） | `IMPORT_UNSUPPORTED_SYNTAX` | 表格无分隔行 | `IMPORT_UNSUPPORTED_SYNTAX` |
| 空/缺 title/无/嵌套 front matter | `IMPORT_FRONTMATTER_INVALID` | 远程 `https://` | `IMPORT_REMOTE_REF` |
| 协议相对 `//host`、越根 `../`、绝对 `/`、反斜杠 | `IMPORT_ASSET_INVALID` | webp / 无扩展名 / 不存在 | `IMPORT_ASSET_INVALID` |

**错误分类稳定；全部 31 条错误信息只携带行号，无一回显哨兵正文 ✔。** 本地相对与子目录相对引用作为允许面基线正常接受，未被误伤 ✔。

### 4.2 零新增第三方依赖 ✔

独立比对 `bdd672f^` 与 `HEAD` 的 SBOM：**147 包 → 147 包，新增 0、移除 0、新增 direct 0**。`packages/markdown-import/package.json` 依赖面仅 `@wenshu/document-model`（workspace:*）+ `@types/node`/`typescript`（catalog:）。`pnpm verify`（含 `quality:check` 的 phantom 守卫）通过。

### 4.3 `contracts:test` 接线真实承重 ✔

`package.json` 的 `contracts:test` 以 `&&` 链实际串入 `pnpm --filter @wenshu/markdown-import test`，删除本包会断链；集成测试另有断言校验该接线字符串存在。双重承重成立。

### 4.4 守卫决定性 —— **两项未达标（见 PA-A1）**

在仓外破坏性副本 `D:\tmp\pa01mut` 上逐项变异（基线 12 pass / 0 fail）：

| # | 变异的守卫 | 变异手法 | 测试结果 | 达标 |
|---|---|---|---|---|
| 1 | 行内剥离 | `inline.ts` 不再剥离 `**` | 11 pass / **1 fail** | ✔ 变红 |
| 2 | 对账恒等（汇总） | `reconcile.ts` `syntaxChars` 汇总恒为 0 | 11 pass / **1 fail** | ✔ 变红 |
| 2b | 对账恒等（文档↔行账目） | `reconcile.ts` 删除 `documentContentChars - embeddedBreaks !== contentChars` 抛错 | **12 pass / 0 fail** | ✖ **全绿** |
| 3 | schema 校验 | `importer.ts` 删除 `if (!validation.ok) throw` 整段门禁 | **12 pass / 0 fail** | ✖ **全绿** |
| 4 | ID 序号 | `document.ts` `ordinal` 恒为 0 | 11 pass / **1 fail** | ✔ 变红 |

### 4.5 复核命令与零漂移 ✔

- `pnpm --filter @wenshu/markdown-import test`：unit 5 + contract 4 + integration 3 = **12 pass / 0 fail**（与自述一致）
- `pnpm contracts:check`：通过
- `pnpm verify`：**exit 0，全绿**
- 冻结物零漂移：`git diff bdd672f^..HEAD -- docs/poc-a/fixtures/ 'assets/fonts/**' '*.schema.json' 'packages/*/src/generated/' artifacts/` **输出为空** ✔

---

## 5. 发现清单

### PA-A1 · **MAJOR** · 四个点名守卫中两个无测试承重

- **定位**：`packages/markdown-import/src/reconcile.ts:70-75`（文档内容 vs 行账目检查）、`packages/markdown-import/src/importer.ts:94-100`（schema 校验门禁）
- **证据**：见 §4.4 变异 2b 与变异 3 —— 两处守卫**整段删除后，12 个测试全部保持绿色**。
- **为何这两处最要紧**：`parser.ts` 中 `syntaxChars` 一律由 `<行>.length - inline.text.length` 反推（`parser.ts:147/171/203` 等），因此**逐行与汇总恒等式是构造上的恒真式**，`reconcile.ts:57` 那条检查在正常路径上几乎不可能触发。对账真正的承重点正是被删后仍全绿的第二条检查（它把**文档实际内容**与行账目绑定，能捕获 parse→assemble 之间的内容丢失）。同理，schema 门禁是保护 PA-02/PA-03 所依赖的契约边界的唯一闸门——我在 §5/PA-A5 中构造的 ID 碰撞输入，正是靠它才失败关闭。
- **影响**：CI 无法察觉这两个闸门被移除。今后任何重构若顺手删除或弱化它们，8 job 全绿依旧，而失效要到 PA-02/PA-03 消费畸形文档时才暴露——这正是 CONSTITUTION #18「可信失败优先于虚假通过」要防的形态。
- **建议**：补两个测试即可闭合。(a) 构造一个 parse 结果与 document 内容不一致的场景（或直接对 `buildReconciliation` 传入被篡改的 `document`），断言抛 `IMPORT_RECONCILE_FAILED`；(b) 构造一个必然违反 v0.1.0 契约的装配结果（例如复用 PA-A5 的 101 行表格 + 相邻同文单元格输入），断言 `importMarkdownDocument` 抛错而非返回。

### PA-A2 · MINOR · 纯空白行使导入以「内部不变量违反」失败

- **定位**：`packages/markdown-import/src/parser.ts:68-74`
- **证据**：仅含 2 个空格或 1 个制表符的"空行"→ `IMPORT_RECONCILE_FAILED: line accounting does not cover the source`；纯空行基线正常接受。
- **根因**：该分支对 `line.trim().length === 0` 的行记 `syntaxChars: 0, contentChars: 0`，但该行实际长度非零，于是 `reconcile.ts:57` 的汇总恒等式被击穿。
- **影响**：含空白的空行是 CommonMark 合法空行，也是编辑器与 AI 输出的常态。这类**合法输入**不仅被拒，且错误类别是内部账目不符而非可操作的输入错误，用户无法据此定位问题。属 §4「错误分类稳定」的反面。
- **建议**：把空白行的 `syntaxChars` 记为 `line.length`（与 `marker-*` 行同类），空白即语法消费。

### PA-A3 · MINOR · CRLF 文件下 `sourceChars` 少算 `\r`

- **定位**：`packages/markdown-import/src/parser.ts:28`（`source.replaceAll("\r\n", "\n")`）与 `parser.ts:223`（`sourceChars: normalized.length`）
- **证据**：同一份内容的 CRLF 版真实字符数 37、`sourceChars` 报 30，**7 个字符无归属**；`golden-report.md` 转 CRLF 后真实 12967 字符、归账口径仍为 12664，**差 303 = 行数**。内部恒等式仍自洽（30 == 30），因为它是对规范化后文本成立的。
- **影响**：不构成内容丢失（`\r` 从不是内容，文档正文完整），但「全文逐字归账」这一 PA-01 的核心验收指标，在 **Windows 默认行尾**的文件上对真实文件并不成立。业主环境与首批用户均以 Windows 为主，该口径失真会被高频命中。
- **建议**：将规范化剥离的 `\r` 计入 `syntaxChars`，或在 `ImportReconciliation` 中同时报告 `rawSourceChars` 与 `normalizedSourceChars`，使对账口径对真实文件闭合。

### PA-A4 · MINOR · UTF-8 BOM 被拒且错误信息误导

- **证据**：带 BOM 的文件 → `IMPORT_FRONTMATTER_INVALID: document must start with a front matter fence`（首行实为 `\uFEFF---`）。
- **影响**：BOM 是 Windows 记事本/Excel 导出常态。失败关闭本身正确，但提示指向"缺少 front matter 围栏"，与真实原因（存在 BOM）无关，用户会去改一个没错的地方。
- **建议**：读入后剥离前导 BOM 并计入语法消费；或保留拒绝但给出专属错误信息。

### PA-A5 · MINOR · 序数打包非单射，长表/长列表触发失败关闭且真因不可见

- **定位**：`packages/markdown-import/src/document.ts:132`（`ordinal * 100 + index`）、`:148`（`ordinal * 1000 + rowIndex`）、`:152`（`ordinal * 10000 + rowIndex * 100 + cellIndex`）
- **证据**：构造 101 行表格 + 相邻表格首格同文的输入 → `IMPORT_RECONCILE_FAILED: assembled document does not satisfy the v0.1.0 contract`；101 条列表 + 相邻列表首条同文同样被拒。根因是 `rowIndex >= 100` 时 `rowIndex*100` 溢出进下一个 `ordinal` 的命名空间，与后继块的 `(rowIndex=0, cellIndex=0)` 撞键，同 kind 同文本即生成同一 ID，被 `document-model` 的 `DOCUMENT_DUPLICATE_ID` 守卫拦下。
- **影响**：**失败关闭，无静默碰撞，无数据损坏**——这是正确的一半。另一半是：合法的百行表格（财务/清单类文档常见）会被拒，且错误信息只说"不满足契约"，既未指明是 ID 重复，也未指向行号，实施者与用户都难以定位。
- **建议**：改用不依赖十进制位宽的复合摘要（如把 `ordinal`/`rowIndex`/`cellIndex` 一并喂进 SHA-256 输入串，而非算术打包）；并让 `importer.ts` 把 `validateDocument` 返回的 `issues`（含 `code` 与 `path`）带进错误信息。

### PA-A6 · MINOR · `documentId` 仅由 title 派生

- **定位**：`packages/markdown-import/src/document.ts:55`（`sha256(title)`）
- **证据**：两份正文完全不同、仅标题相同的文档，得到同一个 `documentId`（`doc_536dcd54ef1707cbb9bc31712aedd677`）。
- **影响**：对"同一文档跨修订保持稳定"是合理设计（`revision` 承担版本），但对**不同文档**而言构成身份碰撞。个人知识层里"周报""会议纪要""读书笔记"这类重复标题是常态，后续入库/去重/修订链一旦以 `documentId` 为主键，将把互不相干的文档判为同一份。
- **建议**：明确 `documentId` 的语义归属并写入决策记录；若定位为内容身份，应纳入正文摘要；若定位为跨修订稳定标识，应由上层提供命名空间（如导入根 + 文件路径）而非仅标题。

### PA-A7 · MINOR · front matter 非 title 键静默丢弃且记为「语法消费」

- **定位**：`packages/markdown-import/src/frontmatter.ts:9`（`ENTRY_PATTERN` 接受任意 `[a-z][a-z0-9_]*`）、`parser.ts:50-51`
- **证据**：10 条 front matter 中仅 `title` 有 `contentChars`（L5 = 17），其余 9 条（`fixture_id`/`fixture_version`/`document_schema`/`short_title`/`subtitle`/`author` 等）**整行计入 `syntaxChars`、`contentChars=0`**。解析器接受任意合规键名，随后无声丢弃。
- **影响**：schema 无处安放这些字段（§3(3) 已确认），丢弃本身被迫；问题在**记账语义**——把用户写下的真实元数据（`subtitle`/`author`）归入"语法消费"这一与 `#`、`|`、`>` 同类的桶，使"全文逐字归账成功"读起来像"什么都没丢"，而实际上有信息未进入文档且未被告知。这与 PA-A3 属同一类：恒等式成立不等于口径诚实。
- **建议**：二选一——(a) 对 title 之外的键 fail-closed，要求用户显式删除；(b) 保留接受但在 `ImportResult` 中返回 `droppedMetadata` 清单，并在对账中单列 `discardedChars`，与 `syntaxChars` 区分。

---

## 6. 观察项（不计严重级别）

- **对账恒等式的守卫力低于其表述。** `syntaxChars` 由行长反推，逐行与汇总恒等式恒真；`reconcile.ts:57` 唯一可被击穿的现实路径正是 PA-A2 的空白行。"全文逐字归账"的真实保证来自 `reconcile.ts:70` 的第二条检查与 schema 门禁——而这两条恰是 PA-A1 中无测试承重的两条。建议台账在描述该能力时同步修正表述强度。
- 集成测试断言的是**汇总**恒等式；本次审计验证的**逐行**恒等式（303/303）目前无测试覆盖。若接受 PA-A2 的修复建议，逐行断言可顺带补入。

---

## 7. 复现命令

```bash
# 门禁复核（均在冻结工具链 Node 24.17.0 / pnpm 11.15.1 下执行）
pnpm --filter @wenshu/markdown-import test     # 12 pass / 0 fail
pnpm contracts:check                            # 通过
pnpm verify                                     # exit 0

# 零漂移
git diff --name-only bdd672f^..HEAD -- docs/poc-a/fixtures/ 'assets/fonts/**' '*.schema.json' 'packages/*/src/generated/' artifacts/
```

审计探针（子序列对账、逐行归账、fail-closed 矩阵、ID 反例、Windows 输入形态、守卫变异）均在 `D:\tmp\pa01*` 的仓外副本上执行，收尾已删除。**本轮 `git status --short` 仅有本报告文件。**

---

## 8. 结论与交接

**FAIL —— PA-01 不签署通过。**

- **必须闭合**：PA-A1（MAJOR）。补齐两个测试，使「文档内容 vs 行账目」检查与 schema 校验门禁被移除时 CI 变红。
- **建议同轮处理**：PA-A2（空白行）与 PA-A3（CRLF）——两者都直接落在业主与首批用户的默认输入形态上，且修复各为数行改动。
- **可排期**：PA-A4、PA-A5、PA-A6、PA-A7 —— 均有明确归属与建议，不阻断本门。
- PA-A5/PA-A6 涉及 ID 语义，建议在 PA-02 开工前形成决策记录，避免模板映射阶段再回改标识体系。

修复后由 Codex 更新台账，Claude 复审关闭。按 CLAUDE.md，本报告由审计者给出结论，台账由 Codex 完成。
