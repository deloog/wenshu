# PA-A5/A6 实施（决策 #8/#9）· Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-24
> 实施基线：`d037ca8`（代码）+ `8d5eaf6`（台账）；决策基线 `9754715`/`ebc82cc`（#8/#9 均已业主批准）
> 实施记录：`docs/audits/PA-A5-A6-implementation-record.md`　上游：`origin/main` = `bec3a63`（6 个提交未推送）
> 写入边界：本轮仅新增本文件；未改代码/测试/Schema/fixture/配置；仓外探针写于 `D:\tmp\pa56*`，收尾已删除；GitHub 只读，未 push、未触发 Actions。

---

## 1. 结论

**PASS —— PA-A5/PA-A6 实施通过，两项发现关闭**（签署以远程 CI 22/22 复现为生效条件，见 §6）。

- 决策 #8/#9 的每一条实现约束都经我**独立重放验证为正确**，非采信实施记录或"变异自证"自述。
- 实施记录声称的**四处变异我全部独立复现变红**（含实施者曾因 heredoc 转义假绿一次的变异 3——我改用非 heredoc 注入，确认其决定性）。
- 两个 MINOR（PA-B1 越根检查过宽、PA-B2 kind 守卫无专属测试）**均不阻断关闭**：PA-B1 fail-closed 方向安全，PA-B2 与决策 #8 自身「代码评审检查点」定位一致。
- 前置条件一项：本改动**重度跨平台敏感**（documentId 由相对路径派生 + 分隔符归一），基线尚未推送。我已在 Windows 侧证实归一正确，签署在"远程 ubuntu CI 复现 22/22"下生效。

---

## 2. 决策 #8（节点 ID 复合摘要种子）实现核验

**代码检查（`document.ts`）：**
- `stableId` 位置参数由 `ordinal: number` 改为 `seed: string`；调用点种子串与决策逐项一致：节点 `${ordinal}`、列表项/列 `${ordinal}:${index}`、行 `${ordinal}:${rowIndex}`、单元格 `${ordinal}:${rowIndex}:${cellIndex}`。
- 十进制位宽打包（`ordinal*100`、`*1000`、`*10000`）**全部移除**，无残留。
- 承重不变量落地为入口守卫 `if (!/^[A-Za-z-]+$/u.test(kind)) throw`——同时拒绝数字与冒号，正是单射论证依赖的「kind 非数字、与内容无歧义分界」前提。
- documentId 派生外形不变（`doc_` + 32 hex），Schema 零变更。

**独立实证：**
- **注入性**（PA-A5 原反例）：101 行表格（第 101 行撞键）现**成功导入、validateDocument 通过、209 个 ID 全部唯一**；对照旧打包 `(o1,r100,c0)=(o2,r0,c0)=20000` 的溢出已消除。
- **kind 守卫是活的**：变异把一个 kind 改为数字 `"2"` → **11 个测试立刻变红**，证明"违反即抛错、现存测试自动承重"成立（见 §4 变异 5a）。
- schema 门禁错误信息（`importer.ts`）实测为 `assembled document does not satisfy the v0.1.0 contract: DOCUMENT_SCHEMA at /title`——只带 `code + JSON path`，不回显正文/标题内容，符合 document-model §5。

---

## 3. 决策 #9（documentId 跨修订稳定标识）实现核验

**代码检查（`importer.ts`）：**
- 签名改为 `importMarkdownDocument(sourcePath, importRoot)`，**importRoot 必填**。
- 根内校验：`relative(resolve(importRoot), resolve(sourcePath))`，`=== ""`（源即根）/ `startsWith("..")`（越根）/ `isAbsolute`（异盘）任一为真即 `IMPORT_ROOT_INVALID` fail-closed。
- documentId = `doc_` + SHA-256(`wenshu/import/v0\n${namespace}\n${title}`).slice(0,32)。
- **跨平台归一**（关键）：`documentNamespace = relativeSource.split(sep).join(posix.sep)`——OS 分隔符切分、POSIX 拼接。
- 资产解析未动，§7.2 拒绝不变。

**独立实证：**
- **PA-A6 关闭**：公共根下 `2026-01/周报.md` 与 `2026-02/周报.md`（内容不同、同标题「周报」）→ `doc_9113095e…` ≠ `doc_c9315d1e…`；同路径改内容 → 同 ID（跨修订稳定）；改标题 → 新身份。三条性质全部成立。
- **跨平台归一在 Windows 上直接证真**：深层文件 `kb/a/b/c/doc.md` 的实际 documentId **等于**我手算的 POSIX 口径 `sha256("wenshu/import/v0\na/b/c/doc.md\n深层")`，且**不等于**反斜杠口径 `a\b\c\doc.md`。即本机 `relative` 返回的反斜杠被正确归一为 `/`，Windows 与 Linux 检出派生同一 ID。
- **根 fail-closed**：源在根外、源即根（相对路径空）、异盘根 → 均 `IMPORT_ROOT_INVALID` ✔。
- 资产越根仍 `IMPORT_ASSET_INVALID`，`..`/绝对/盘符/反斜杠拒绝不变（回归抽查）。

---

## 4. 守卫变异——独立重跑（不采信自述）

在仓外破坏性副本 `D:\tmp\pa56mut` 重建工作树逐项变异（基线 **22 pass / 0 fail**），还原后与仓库源码 `diff -r` 逐字节一致：

| # | 变异 | 结果 | 判定 |
|---|---|---|---|
| 1（他们） | cell 种子回退为算术打包 | 21/1 | 变红 ✔ |
| 2（他们） | 删 schema 门禁 | 21/1 | 变红 ✔ |
| 3（他们·曾假绿） | documentId 回退为仅 `sha256(title)` | 21/1 | 变红 ✔ |
| 4（他们） | 删越根检查 | 21/1 | 变红 ✔ |
| 5a（我补） | 把一个 kind 改成数字 `"2"` | **11/11** | 变红 ✔（守卫是活的） |
| 5b（我补） | 删 kind 非数字守卫本身 | **22/0** | 全绿（见 PA-B2） |

四处声称变异全部独立复现变红。实施者对变异 3 假绿的处置(识破 heredoc 转义、重做有效变异)在实施记录中如实登记——我复核为诚实。

---

## 5. 门禁与冻结物

- `pnpm --filter @wenshu/markdown-import test`：unit **10** + contract **5** + integration **7** = **22 pass / 0 fail**（原 19 + 新增 3），与自述一致。
- `pnpm verify`：**exit 0，全绿**（含 quality 的 phantom 守卫、typecheck、supply、contracts、production build）。
- 冻结 golden-report 复算：`12664 / 11136 / 1225 / 303` **与首审逐项一致**，346 个 ID 全唯一，两资产 SHA-256 一致，重导入幂等（documentId 为新派生但无任何冻结期望被钉死）。
- 冻结物零漂移：`git diff bec3a63..HEAD -- docs/poc-a/fixtures/ 'assets/fonts/**' '*.schema.json' 'packages/*/src/generated/' artifacts/ sbom/ pnpm-lock.yaml` **为空**。
- SBOM **147 → 147，零新增**；`markdown-import/package.json` 依赖未变。
- 调用点审查项（决策 #9 移交）：唯一生产调用点 `scripts/parse-fixture.ts` 传 `resolve(fixture,"..")`=`docs/poc-a/fixtures`（fixture 公共根），非源文件目录退化 ✔；测试均传构造的公共根 ✔。

---

## 6. 发现清单

### PA-B1 · MINOR · 越根检查 `startsWith("..")` 过宽，误拒名以 `..` 开头的合法路径

- **定位**：`packages/markdown-import/src/importer.ts:82`
- **证据**：根内合法子目录 `..foo/doc.md` 被 `IMPORT_ROOT_INVALID` 拒绝——`relative` 返回 `..foo/doc.md`，`startsWith("..")` 命中，但该目录并未越根。
- **影响**：fail-closed 方向（拒绝合法输入），**无安全漏洞**；`..foo` 类文件名极罕见。属可用性边界。
- **建议**：按路径**段**判定越根：`relativeSource === ".." || relativeSource.startsWith(".." + sep)`（用 OS `sep`），而非任意以 `".."` 开头的字符串。

### PA-B2 · 观察项 · kind 非数字守卫无专属测试（守卫活、但其自身被删不被 CI 察觉）

- **定位**：`packages/markdown-import/src/document.ts:32-35`
- **证据**：变异 5a（引入数字 kind）11 个测试变红——守卫**运行时自执行**，实施记录"违反即抛错、现存测试自动承重"的表述准确；但变异 5b（删守卫本身）**全绿**——守卫的移除无任何测试察觉。
- **定性**：**不是缺陷**。危害需「删守卫 + 加数字 kind」两步同时发生；单独任一步都不破坏当前单射（现 11 个 kind 全非数字）。这与决策 #8 自身定位一致——守卫是运行时护栏，其保全交由「代码评审检查点 + 新增 kind 时的决定性测试」。
- **建议（可选硬化）**：加一条直接断言（对派生路径传入合成数字 kind 断言抛错），使守卫在未来重构中不被静默剥离。非阻断；决策已把评审列为该守卫的保全手段。

---

## 7. 复现命令

```bash
pnpm --filter @wenshu/markdown-import test          # 22 pass / 0 fail（10/5/7）
pnpm verify                                          # exit 0
git diff --name-only bec3a63..HEAD -- docs/poc-a/fixtures/ 'assets/fonts/**' '*.schema.json' 'packages/*/src/generated/' artifacts/ sbom/ pnpm-lock.yaml   # 空
```

审计探针（PA-A6/根/跨平台归一/注入性行为验证、6 处守卫变异）均在 `D:\tmp\pa56*` 仓外副本执行，收尾已删除。**本轮 `git status --short` 仅本报告文件。**

---

## 8. 结论与交接

**PA-A5/PA-A6 实施 PASS，两项发现关闭**（生效条件：远程 CI 22/22 复现，见下）。

- **前置缺口**：6 个提交未推送，远程 CI 未验证。本改动 documentId 派生依赖**相对路径 + 分隔符跨平台归一**，是跨平台最敏感的一类；我已在 Windows 侧证实归一正确（实际 ID == POSIX 手算值），Linux 侧 `relative` 本就返回 `/`、归一为恒等，故跨平台一致性由构造 + 本机实证共同支撑。但按 AGENTS.md 推送节奏第 1/3 条与 G1-15「本地绿 ubuntu 红」先例，签署仍以远程 ubuntu run 复现 **22/22** 为生效条件。请业主/Codex 推送，我据远程 run 在本报告追加确认。
- **不阻断**：PA-B1（建议随手收口）、PA-B2（可选硬化）。
- **PA-A5/A6 前置解除后**，PA-02（模板映射）不再有 ID 语义悬置；PA-02/PA-03 可按波次推进。**PA-A8 仍须在 PA-03 消费文档文本渲染前关闭**；PA-A4/A7 归属不变。
- PA-02 落地任何新调用点时，须复核决策 #9 的调用点契约（传公共根而非源文件目录）——PA-B2 的护栏无法自证此项。

按 CLAUDE.md，本报告由审计者给出结论，台账由 Codex 完成；实施者不自行关闭发现。

---

## 附录 A · 远程 CI 确认 —— 签署生效（严格追加，2026-07-24）

> 确认基线：`origin/main` = `044b9f5`（`bec3a63..044b9f5` 九个提交已推送）

§8 的生效条件已达成，**PA-A5/PA-A6 签署即时生效；PA-B1 一并确认关闭。**

- **我独立核验的远程证据**：run `30079559019`（`name=verify`、`event=push`、`head_sha=044b9f5`、`conclusion=success`）；**8 job 全 success**，与分支保护必需检查逐项同名同数；runner `ubuntu-24.04`。
- **跨平台复现（未采信转述）**：从 `contracts` job 日志取到逐条测试记录，PA-A5/A6/B1 的决定性测试均在 ubuntu 实跑通过——`long tables and lists stay injective…`（PA-A5）、`same-title documents under different relative paths get distinct documentIds`（PA-A6）、`source outside the declared import root fails closed`（PA-A6 根）、`dot-prefixed directory names inside the root remain legal`（PA-B1）；markdown-import 计数 12+5+10=**27**（含 PA-A8/A4 后续，另案审计）。documentId 由相对路径 + 分隔符归一派生这一跨平台最敏感面，本机 Windows 已证 POSIX 归一、ubuntu 现证同一测试全绿，两平台一致确证完成。
- **结论**：PA-A5（节点 ID 单射）、PA-A6（documentId 跨修订稳定标识）**关闭**；PA-B1（越根段判定）**关闭**。PA-B2 仍为可选硬化观察项。PA-A8/A4 属 tip 提交，另见 `PA-A4-A8-claude-audit-report.md`。

本报告至此终结；后续任一发现的关闭均另起审计轮次。
