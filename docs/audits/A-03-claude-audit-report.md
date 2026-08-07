# A-03 Claude 独立审计报告（首审）

> 审计对象：`A-03` 结构确认与语义编辑工作区（R-UX/R-ID）。分支 `a-03-workspace` 头 `24edafa`（8 提交），PR #57 **未合入**（`main` = `95b8e18`）。
> 依据：[A-03 任务书](A-03-implementation-task.md)（我起草）、[ADR-0030](../adr/0030-A-03结构确认口径与A-05分界及停止条件可判定定义.md)、[决策 #16](../../决策记录.md)、[实施记录](A-03-implementation-record.md)。
> 审计方法：按任务书 §9 猎杀方向逐条打；自建探针直打真实事务边界；关键结论一律先变异证明"因正确原因变红"再采信。
> 审计环境：Win10 `wenshu-dev-primary`，Node **v24.13.0**（见 MAJOR-1）。

## 1. 结论

**CONDITIONAL PASS —— 无 BLOCKER；两项 MAJOR 须在合并前关闭。**

**开工资格是干净的**：D1–D4 四个待裁定点由**业主**以[决策 #16](../../决策记录.md) 全部裁定并落成 ADR-0030，不是实施者自决——这条我先查的，因为任务书 §3 写明"不接受实施者自决"。

**任务书里我最担心的那条红线守住了**：[ADR-0016 §5](../adr/0016-PB-03统一编辑事务边界.md) 的唯一写边界没被 UI 绕过。两项 MAJOR 一项在范围外（改了签署过的机器证据），一项在停止条件的**执行力**上（结构丢失守卫可被"自我申报"绕过，且该守卫在新路径上零测试覆盖）。

## 2. 我独立坐实的部分

### 2.1 唯一写边界（任务书 §4.1，第一个查）—— **成立**

```text
grep semantic-editor/internal  apps/**        -> 零命中（UI 未绕过）
grep semantic-editor/internal  packages/**    -> 仅 editor-transactions/src/transactions.ts:21
公开 . 入口                                    -> 仍只导出 allocator / adapter / schema
package.json exports                           -> 只有 "." 与 "./internal"，深路径不可达
```

新增的 8 个结构操作**只**经 `/internal` 暴露给事务包；`operations.ts` 里若干 helper 由私有改为 `export`，但**未**从 `.` 入口再导出，故 ADR-0016 对公开面的收窄未被破坏。**这条成立。**

### 2.2 已签署面「additive、零行为变化」—— **属实**

- `insertBlock` 新增可选 `insertIndex`、`moveBlock` 新增可选 `destinationIndex`，**不传即走原 `push` 分支**；非法索引 `PB02_OPERATION_INVALID` fail-closed。
- `EditResult` 增 `removedNodeIds`；`checkedResult` 该参数有默认 `[]`。
- **PB-02/PB-03 的已签署测试文件是 0 删除纯增**（`git diff --numstat`：42/0、244/0）——没有删改既有断言来迁就新行为。

### 2.3 冻结数据与依赖 —— **零改动 / 属实**

`states-1.0.0.json`、`document-model` schema、`ux-state` schema 的 `git diff` **全为空**。`pnpm-lock.yaml` 只增 3 条 `link:` workspace 依赖（`document-model` / `editor-transactions` / `semantic-editor` → `apps/web`），**无第三方运行时依赖**，与自述一致。

### 2.4 我自己复跑的证据

| 项 | 我的结果 |
|---|---|
| `semantic-editor` | 21/21 |
| `editor-transactions` | 14/14 |
| `apps/web` | 56/56 |
| **A-03 键盘 E2E**（自建 bundle 重建后复跑） | **6/6 绿**，含 44 键结构操作、confirm 两分支、corrupt / `DOCUMENT_INVALID` fail-closed、磁盘 sha256 对账 |
| 30k fixture | 我独立点算 **≥30,000 字**（我的计数口径得 30,341，与自述 30,245 的差异来自计数字段口径，不影响预算判定）；12 顶层节点 |
| 采样文件 | 6 指标 × 10 原始样本 + 1 预热，格式与 PB-12 一致；`environment` 字段**主动写明**"NOT the Win11 reference machine Node 24.17.0 — G1-14 registered deviation" |

### 2.5 D3（A-03 / A-05 分界）—— **未越界**

工作区只做**结构**：`insert/delete-table-row`、`insert/delete-table-column`、列表项增删、段落升降级。`altText` 仅在 `rows.ts`/`mount.ts` 作**渲染读取**，没有编辑动作；`text-actions.ts` 无任何 `cell` 内容编辑。与 ADR-0030 D3「结构 vs 内容」切法一致。

## 3. MAJOR-1　参考机器证据被重录，登记中的 Node 偏差被抹掉

**范围外改动。** 提交 `01604bb`（M5 性能采样）修改了 `artifacts/reference-machine/environment.json`——一个 **G1-14 已签署、且被 git 跟踪**的机器证据：

```diff
- "recorded_at": "2026-08-01T05:06:11.792Z"      + "2026-08-05T14:20:33.729Z"
- "node": "v24.17.0"                             + "node": "v24.13.0"
```

**后果**：

1. **登记中的偏差被抹掉。** 我在 A-02 复审时把"本机 24.13.0 ≠ 参考机器 24.17.0"如实登记进 [A-02-followups §4](A-02-followups.md)，归口 G1-14。现在提交里的机器证据自己就说参考机器是 24.13.0——**偏差在证据层面消失了**，而 `package.json` 的 `engines` 仍锁 `24.17.0`，两者自相矛盾。
2. **实施记录内部打架**：§ 运行环境诚实声明写"本机 Node v24.13.0 ≠ 参考机器 24.17.0"，而同一批次提交的证据文件已把参考机器改成 24.13.0。采样文件里的诚实标注也随之失去参照物。
3. **性能结论的锚点被移动。** 采样协议 §6 的"相对已批准基线退化 >20% 即阻断"依赖机器身份稳定；把参考机器重定义为"当前这台开发机现在的样子"，A-14 将来无从做回归判定。
4. **无门禁兜底。** 我实测：`pnpm environment:check` 对 24.17.0 与 24.13.0 两版证据**都通过**（它校验的是已提交证据与 fixture/font 冻结锚点，不校验活动解释器）。所以这次改动不是任何门禁逼出来的。

**归因是分摊的，不全在实施者**：[reference-machine §3.1](../reference-machine.md) 确实写着"每个采样批次开始前运行 `pnpm env:record`"，实施者照做了。但同一条**同时**要求"把当批原始数据与对应机器证据放在**同一批次目录** `artifacts/perf/<date>-<task-id>/`"，而裸跑 `pnpm env:record` 的默认落点是**登记基线**。工具支持 `--out`（`tools/environment/src/record-args.ts:20`），协议却没提示这个陷阱。

> **⚠ 勘误（2026-08-06，A-04 任务书起草轮）：上句末尾"工具支持 `--out`"暗示 `--out` 可作为本条的解法，该暗示已证伪——原文保留以存档。** `record-args.ts` 的 `OUTPUT_FILE_PATTERN` 拒绝任何含 `/` 的值，`record-environment.ts:9` 又把输出目录硬编码为 `artifacts/reference-machine/`，故 **`--out` 只能改基线目录内的文件名，写不进批次目录**；我当时只验证了该 flag 存在，未验证它能否指向别的目录。**本条 MAJOR-1 的发现与实施侧的修复均不受影响**（受影响的只是我提出的补救方向）。正确规程见 [A-04 任务书 §6「批次证据落盘规程」](A-04-implementation-task.md)，根因登记见 [A-03-major-remediation §MAJOR-1 第 3 条](A-03-major-remediation.md)（归口 G1-14）。

**要求**：

- **`artifacts/reference-machine/environment.json` 回退到 `main` 版本**（一行，docs/证据级，不动代码）；当批机器证据按协议原文放进 `artifacts/perf/2026-08-05-A-03/`；
- 采样协议的这个陷阱另登记为承接项，归口 **G1-14**（建议：`env:record` 默认拒绝覆盖已登记基线，须显式 `--out`）。

> 顺带澄清一条我差点误判的：`artifacts/*` 整体在 `.gitignore` 里，历史批次（PA-13/PB-10/PB-12）同样不入仓，所以**采样原始数据不进仓是既有惯例，不是本棒偏差**——我核过才写。

## 4. MAJOR-2　结构丢失守卫可被「自我申报」绕过，且在新路径上零测试覆盖

停止条件"**结构丢失即阻断**"由 [ADR-0030 D4(b)#1](../adr/0030-A-03结构确认口径与A-05分界及停止条件可判定定义.md) 操作化为"除显式删除子树外既有稳定 ID 全保留"，落在 `ensureStableIds`（[transactions.ts:88-100](../../packages/editor-transactions/src/transactions.ts#L88-L100)）。问题在许可集怎么来：

```js
// transactions.ts:144-146
const result = this.applyCommand(command);
result.removedNodeIds.forEach((id) => this.#permittedDeletion.add(id));  // 被审对象自己申报
ensureStableIds(beforeCommand, result.document, this.#permittedDeletion);
```

`delete` 命令有**独立计算**的许可集（`findBlockIds` 在改动前文档上算，:137-142），是可靠的。但 **A-03 新增的 8 个结构命令没有**——许可完全来自操作自己返回的 `removedNodeIds`。

**我的实测**（自建 3 项列表，直打真实 `TransactionManager`；仓内 fixture 列表只有 2 项，删一项后剩 1 项，额外删除分支根本触发不了——我第一版探针就是这样空转的，作废重做）：

| 变异 `deleteListItem` | 结果 |
|---|---|
| 多删一个兄弟项、**如实申报** | **`COMMITTED`，守卫未响**；列表 3 项 → **1 项**，多删的节点静默消失 |
| 多删一个兄弟项、**不申报** | `THREW PB03_STABLE_ID_GUARD`，回滚，3 项完好 |

**守卫是活的、承重的**（第二行证明），但**它的判据由被审对象提供**：操作只要把多删的东西写进 `removedNodeIds`，就等于给自己发了许可。这正是本项目已经吃过一次的形态——用被审对象证明被审对象。

**更硬的一条：这条守卫在新命令路径上零测试覆盖。** 上表第二行那个**真实违规**（多删且不申报），跑遍 `semantic-editor` 21 + `editor-transactions` 14 + `apps/web` 56 共 **91 个测试，全绿**——因为没有任何 fixture 的列表长到能触发。任务书 §5 要求"结构丢失三条各一条决定性测试 + 变异自证"，**第 1 条在 8 个新命令上不满足**。

**要求**（任选其一，须写进 ADR-0030 并补决定性测试）：

1. 结构命令比照 `delete` 路径，在**改动前文档**上独立计算本次允许删除的 ID 集合，与操作申报的 `removedNodeIds` **求交或对账**，不一致即 fail-closed；或
2. 保留申报机制，但补一条独立不变量（例如：除申报集合外，前后 ID 集合差必须为空，且申报集合本身必须是命令目标的子树）。

无论哪条，**必须补 fixture 使该路径可触发**（列表 ≥3 项、表格 ≥3 行/列），并让"多删且申报"的变异变红。

## 5. 未由我复核的部分（如实登记）

- **远程 CI run `31021132095`**：远程 run 一直在我的独立核验能力之外，只转述不背书（口径自 PB-12 起未变）。
- **参考机器复跑**：性能证据全部产自 Win10 / Node v24.13.0。实施者已如实声明"签署轮须 Win11 参考机器复跑"——**该复跑尚未发生**，故 30k 响应预算这一项目前只有非参考机器证据。这与 MAJOR-1 相互纠缠：机器证据被改后，"参考机器"这个词当前指向的正是这台未达标的机器。
- **undo/redo 分叉**：我复跑了 E2E 的 `undo/redo fork` 用例（绿），但未自建独立分叉探针。
- **44 键 `isTrusted`**：我复跑 E2E 全绿，未逐键复验 `isTrusted` 计数。

## 6. 交接与关闭条件

- **MAJOR-1 / MAJOR-2 由 Codex 修复，由我复审关闭**；MAJOR-1 是证据回退 + 承接项登记，MAJOR-2 需要动 `editor-transactions` 的守卫与 fixture，属代码修复。
- **PR #57 在复审签署前不合入。**
- **本报告落盘的同一轮必须补 §3.1 台账 `A-03` 行**——我实测当前台账**没有** A-03 行，而本文件名匹配 `-claude-audit-report.md`，[检查 8a](../../tools/quality/src/roadmap-checks-evidence.ts) 会因此硬失败。两者必须同轮落地。
- 合并后按 [AGENTS 台账证据指纹规则](../../AGENTS.md) 用 `main` 上的 squash SHA。

---

*本报告由独立审计角色出具；任务书亦由我起草（只归集权威来源、标出待裁定点，不构成实施），故仍可担任本棒审计。审计期间仅新增本文件；全部变异均已还原，`git status` 干净。*

---

# 7. 复审记录（2026-08-06）· MAJOR-1 / MAJOR-2 关闭

> 复审对象：修复轮提交 `702d684`。方法不变：自述一律不采信，关键结论先变异或重放探针再采信。

## 7.1 结论

**两项 MAJOR 全部关闭，签署 `PASS`。** 新增一条 **MINOR-1**（E2E 编排器竞态，我已定位根因并验证修法），不阻断签署；另有一条同形态**存量**问题归口在 A-03 之外，登记备案。

## 7.2 MAJOR-1 —— 关闭

| 核验 | 结果 |
|---|---|
| `artifacts/reference-machine/environment.json` | `git diff main` **为空**；`recorded_at 2026-08-01`、`node v24.17.0` 已回到签署基线 |
| 批次证据归位 | `artifacts/perf/2026-08-05-A-03/environment.json` 存在，`node v24.13.0`、`recorded_at 2026-08-05T16:18`，与 6 份采样同目录 |
| 协议陷阱登记 | 已落 `A-03-major-remediation.md` §MAJOR-1.3，归口 G1-14 |

实施者主动声明「批次环境证据的重录发生在采样**之后**，顺序偏差不复读为合规」——这条自曝对他不利、我核过属实（批次证据 16:18 晚于采样），**登记为如实披露**。G1-14 那条协议改进（`env:record` 默认落点即签署基线、`--out` 只改文件名）仍待关闭。

## 7.3 MAJOR-2 —— 关闭（我原样重放了自己的探针）

守卫改法正确：`apply()` 里 `result.removedNodeIds.forEach(...)` **已删除**，许可集改由 `computeExpectedRemovals(command, beforeDocument)` 在**会话侧**从命令 + 命令前文档独立计算（[transactions.ts:136-152](../../packages/editor-transactions/src/transactions.ts#L136-L152)）。

**我用首审那支探针原样重放**（自建 3 项列表，直打真实 `TransactionManager`）：

| 变异 `deleteListItem` | 首审 | 复审 |
|---|---|---|
| 多删一项 + **如实申报** | `COMMITTED`，静默丢节点 | **`THREW PB03_STABLE_ID_GUARD`**，回滚，3 项完好 |
| 多删一项 + **不申报** | `THREW`（但当时全套件测不到） | `THREW`，回滚，3 项完好 |
| 未变异基线 | `COMMITTED`，2 项 | `COMMITTED`，2 项（未误杀） |

**自我申报绕过已不可能。** 另核许可集**不过宽**：`delete` 取目标子树、`delete-table-row/column` 取该行/列及其单元格、`delete-list-item`/`demote-section`/`merge-lists` 各取单个目标 ID，其余命令一律 `default: []`（insert/promote/split/move 零删除许可）——最小且默认 fail-closed。

覆盖缺口也补上了：`editor-transactions` 14 → **17/17**（含 3 项列表删中间项、3+2 项列表 merge），`semantic-editor` 21/21、`apps/web` 56/56，均我自己复跑。

## 7.4 §2 零回潮

唯一写边界（UI 对 `/internal` 零命中）、冻结数据零改动，复跑仍成立。`transactions.ts` 398 行、`commands.ts` 164 行——生产 400 行硬闸只剩 **2 行余量**，下次动它前先量行数。

## 7.5 流程合规 —— 属实

台账 §3.1 已补 `A-03` 行，状态 **🔧 已实现，待独立复审（MAJOR 修复轮）**（不是 ✅，不触单调性检查）；`pnpm quality:check` **退出码 0**——首审时我实测它因 `roadmap-audit-report-without-ledger` 硬失败，现已消除。审计报告与台账行同提交落地。

## 7.6 MINOR-1（新增）：E2E 编排器「先加载渲染进程、后注册 IPC」竞态

**我复跑 A-03 E2E 两轮各红一例，且两轮红的用例不同**（第一轮 `editing`，第二轮 `schema-invalid`），错误同为：

```text
Error invoking remote method 'wenshu.project.document.read':
  No handler registered for 'wenshu.project.document.read'
```

根因在 [e2e-main.cjs:384-394](../../apps/electron-shell/src/e2e-main.cjs#L384-L394)：**先 `await window.loadFile(...)` 让渲染进程跑起来，之后才 `registerProjectChannels(...)`**。工作区 bundle 一加载就读文档，于是撞上未注册窗口。

**我不停在推断，验证了根因**：把 `registerProjectChannels` 移到 `loadFile` 之前（一行位置调整），**连跑两轮 6/6**；还原后再跑即复现红。

这条同时修正实施记录 §6.7 的归因：那里把观察到的 flake 记为「高负载」并在 **replay 末尾**加了 200 ms 落定窗——真正的窗口在**开头**（注册晚于加载），末尾的落定窗治不到它。

**影响评级为 MINOR 而非更高**，理由是它只产生**假红不产生假绿**：`corrupt` / `schema-invalid` 两个"预期失败"用例断言的是具体错误码，未注册错误会让它们变红而不是蒙混通过——这一点我在第二轮实测中确认（`schema-invalid` 是红的）。因此已交付的绿证据仍然有效。

**建议合并前修**（一行，我已验证修法有效），但不作为签署条件。

## 7.7 存量登记（不归 A-03）

**产品壳 `main.cjs` 有同一形态且窗口更宽**：`await Promise.all([loadHostModules(), createWindow()])` 完成时渲染进程已加载，其后还有 `await createFileHost(...)`，最后才注册 `wenshu.host.*` 与 `registerProjectChannels`（[main.cjs:101-135](../../apps/electron-shell/src/main.cjs#L101-L135)）。

**A-03 未触碰 `main.cjs`（diff 为空），故不归本棒。** 但 A-03 的工作区是第一个"加载即读文档"的 UI 形态，这个存量竞态迟早会在产品侧显形，请登记为承接项由业主定归口（建议 A-12 贯通或壳侧专项）。

## 7.8 未由我复核（边界不变）

- 远程 CI run `31026491954`：只转述不背书。
- **Win11 参考机器复跑仍未发生**：30k 响应预算目前仍只有 Win10 / Node v24.13.0 证据。MAJOR-1 关闭后"参考机器"一词已重新指向 24.17.0 的登记机器，因此这条**从"证据被污染"降级为"证据待补"**——签署轮补跑的承诺仍然有效且必须兑现。
- 44 键 `isTrusted` 逐键计数、undo/redo 独立分叉探针：未自建，沿用 E2E 用例。

## 7.9 签署

**`PASS`。** MAJOR-1、MAJOR-2 均已关闭并经我独立复现；无 BLOCKER、无未关闭 MAJOR。

交接：① MINOR-1 建议合并前修（一行）；② 产品壳同形态竞态登记为承接项，归口待业主裁定；③ G1-14 的 `env:record` 协议陷阱待关闭；④ 签署轮 Win11 参考机器性能复跑仍是未兑现承诺；⑤ 合并后用 `main` squash SHA + 最终 run 同轮补台账与 AGENTS.md 承接条目。

---

*复审同样只新增/追加本文件；全部探针（X1 重放、注册顺序重排）均已还原，`git status` 干净。*
