# A-01 Claude 独立审计报告（首审）

> 审计对象：`A-01` 冻结 Alpha 信息架构、状态机与缺失设计稿处置（R-UX/R-SCOPE）。分支 `a-01-ux-freeze` 头 `9b9e109`，PR #53 **未合入**（`origin/main` = `cab9102`）。
> 审计方法：隔离干净克隆 + 全套件与 `pnpm verify` 独立复跑 + **自建对抗探针**（把 18 种畸形文档喂进真实 `validateUxStates`）+ **失效方向变异**（清空语义、破坏守卫）+ eslint 全局洞的绕过尝试 + 承接项归属逐条对账。审计只新增本报告一个文件。
> 审计环境：Win10 `wenshu-dev-primary`，D 盘冻结 Node v24.17.0 / pnpm 11.15.1。

## 1. 结论

**CONDITIONAL PASS —— 无 BLOCKER / 无 MAJOR；一项 MINOR 须在合并前关闭。**

这一棒把一个本来最容易变成"写得漂亮、下游各自解读"的冻结任务，做成了**可机检的契约**：12 状态、8 项信息架构、增量分页双闸、a11y 必填，我逐项亲手撬过，绝大多数攻击面都是 fail-closed 的。唯一的 MINOR 是：**ux-spec §4 的"不得"语义可以被静默清空而契约与测试都不拦**——我把 `ai-result` 的 `forbiddenSemantics` 清空（等于丢掉"未接受不改正式内容"这条红线），22 条契约测试**全绿**。这对一个要被 12 个消费者读的冻结件而言是需要补上的。

另需自我更正一处：**本任务书 §5.1 的来源拆分是我算错的**（见 §5）。

## 2. 我独立坐实的部分

| 项 | 我的独立结果 |
|---|---|
| 干净克隆可复现 | `pnpm install --frozen-lockfile` 成功；`pnpm verify` **exit 0**；`quality:check` 通过（412 源文件 / 904 仓文件） |
| 套件 | `@wenshu/ux-state` **22/22**；`@wenshu/web` **17/17** |
| **12 状态逐行覆盖** | 契约含 12 个状态，`uxSpecRow` 1–12 与 [ux-spec §4](../ux-spec.md) 表逐行一一对应，顺序一致；[冻结对账表](../alpha-ux-freeze.md)每行标出 evidenceSource 与画廊/契约测试/原型测试三处证据 |
| **来源标注可机检** | `evidenceSource` 不只写在文档里，**也在机器契约中**，实测分布 `roadmap-completion-evidence: 7 / ux-spec-must-present: 4 / dual: 1`——与拆分口径完全一致，且我实测 `evidenceSource: "made-up"` 被 schema 拒 |
| **删状态删不掉** | 删 `crash-recovery`（12→11）→ 拒；重复 id → 拒；`uxSpecRow: 99` → 拒 |
| **D3 增量分页双闸（我四路强攻）** | `repaginationScope: "full"` → 拒；`fullRepagination: true` → 拒；**`fullRepagination: false` 也拒**（schema 用 `false` 把该属性整体禁掉，不是禁真值）；`stalePreviewRetained: false` → 拒；整块 `pagination` 删掉 → `UX_STATE_EXTENSION_MISSING`（代码层补位真的在工作） |
| **a11y 没被推给 A-13** | `textEquivalent`/`focusEntry`/`noColorOnly` 逐个删 → 全拒；整块 `a11y` 删 → 拒 |
| 转移完整性 | 悬空转移 → `UX_STATE_TRANSITION_DANGLING`；`canTransition` 对不存在状态返回 false |
| **IA = §3 上限** | `IA_AREAS` 恰 **8** 项（projects/editor/ai-workspace/preview/citations/versions/export/settings），与 §3 逐项对应；另有显式 `IA_EXCLUSIONS` 列出排除项，未越上限 |
| **D1 设计稿未被"猜"** | [决策 #14](../../决策记录.md) 已落盘：正式废弃 `a566a20`，明写"不引入外部稿中的任何未归档视觉元素"，并援引路线图停止条件与 D1；业主逐字批准有留痕 |
| G2-03 MI-03 关闭方向正确 | 包根配置文件由**完全跳过**改为 **auxiliary 规则集**——是**收紧**不是放宽（平台命名空间仍 fail-closed），且有专门反例测试 `package-root config files use the auxiliary rule set` |
| eslint 全局洞收口 | 我实测：裸 `process` → 报错；`globalThis.process` → 报错（`no-restricted-syntax` 专门堵了这条绕道）。这正是我在 PB-10 留的 NOTE、A-01 任务书 D2 点名的那个洞 |
| 供应链 | **零新增第三方包**（`ajv`、`json-schema-to-typescript` 早在 catalog）；SBOM 仅增 requester 条目 |
| 流程纪律 | PR #53 **未合入**；§3.1 台账**未提前补行**（只有 §7 任务表行）——实施记录里自曝的"台账提前写被 G2-04 拦"这条教训确实改过来了 |

## 3. MINOR-1　ux-spec §4 的"不得"语义可被静默清空

- **定位**：[packages/ux-state/schema/ux-states-1.0.0.schema.json](../../packages/ux-state/schema/ux-states-1.0.0.schema.json) —— `requiredPresentation` 有 `minItems: 1`，`forbiddenSemantics` **没有任何非空守卫**。
- **我的独立复现**：把 `states-1.0.0.json` 中 `ai-result` 的 `forbiddenSemantics` 清空（丢掉 ux-spec §4「AI 结果」行的**未接受不改正式内容**），跑套件：

  ```text
  ℹ tests 22   pass 22   fail 0     ← schema 不拦、22 条契约测试也不拦
  ```

- **为什么值得补**：[A-01 任务书 §4.5](A-01-implementation-task.md) 把 §4 的"不得"语义定为**验收点而非修辞**；这份契约要被 **12 个消费者**读，冻结件里能被静默抹掉的红线，等于把 `forbiddenSemantics` 降级成注释。
- **注意：不能一刀切加 `minItems: 1`。** 我核过实际分布——12 个状态里恰有 **6 个**的 `forbiddenSemantics` 为空（`importing`/`ai-processing`/`pagination`/`pre-export`/`offline-degraded`/`crash-recovery`），而 ux-spec §4 对应那 6 行**本来就没有"不得"语义**。空数组在这 6 个状态上是**忠实锚定，不是遗漏**。
- **修复方向**：对**确有禁令的那 6 个状态**（`empty-project`/`import-partial`/`ai-result`/`page-issues`/`save-result`/`permission-denied`）做逐状态钉定——契约测试里 pin 具体字符串，或 schema 按 id 条件要求非空；并补一条决定性测试（清空任一条 → 变红）。

## 4. NOTE（不作为条件）

- **eslint 收口的边界与实施者自报一致**：我另试了别名绕道（`const g = globalThis as Record<string, unknown>; g["process"]`），**未被拦**。但这类动态/别名访问本就超出静态 lint 能力，且 [A-01-followups #2](A-01-followups.md) 已如实登记"文本闸非类型闸、动态拼接不在静态分析范围"。**属已披露限制，不另开发现**；残余风险有界（`node:*` import 仍被分层门禁挡，且需要作者刻意绕）。
- **web bundle 含 Ajv（约 145 kB）** 已由实施者主动登记为 [followups #1](A-01-followups.md) 转 A-02，并写明"不得默认接受该体积"——主动暴露代价，记一笔。
- 实施记录 W2 行写 `unclassified 14→11`，我在 HEAD 实测为 **10**。两者取值时点不同（W2 之后 W3 又加了 `apps/web/src` 文件），该数字在 W2 行内标注即可，不构成不实。
- 契约把"扩展块按状态 id 必填"放在代码层（`UX_STATE_EXTENSION_MISSING`）而非 schema if/then，schema 内已写明理由（json-schema-to-typescript 会把 allOf-if/then 退化成无类型 record，剥夺 12 个消费者的类型化访问）。**取舍已披露且我实测代码层真的拦得住**，接受。

## 5. 审计者自我更正：任务书 §5.1 的来源拆分我算错了

[A-01 任务书 §5.1](A-01-implementation-task.md) 我写的是"6 类对应 7 行 + 其余 **5 行**来自 ux-spec §4"，并把「保存成功」单列进后一组。**这是算错的**：ux-spec §4 第 8 行是「保存成功/失败」**一整行**，其中"失败"归路线图的"失败"类、"成功"只由 §4 背书——我把一行拆成两行数，导致 7+5=12 看似成立、实则重复计了一行。

交付物的口径是 **7（路线图）+ 4（§4）+ 1（dual：保存成功/失败）= 12**，并把该行的 `evidenceSource` 标为 `dual`。**这一版是对的，我原来的拆分是错的**；且该口径已同时落进机器契约（实测分布 7/4/1）。记在此处，避免后续棒次沿用我那个错误拆分。

## 6. 验收标准逐条对账

| 验收点（任务书 §5） | 判定 |
|---|---|
| 12 行逐行有可验收原型、逐行可对账 | **成立**（契约 12 + 对账表逐行三处证据 + 画廊 12/12） |
| 两类来源分别写明、不含糊成一句 | **成立且优于要求**（细化出 dual，并做成机检字段） |
| 信息架构 = §3 上限，排除项显式 | **成立**（8 项 + IA_EXCLUSIONS） |
| 崩溃恢复能表达检查点/丢失范围/恢复副本 | **成立**（schema `required: [checkpoint, potentialLoss, recoveryCopy]`） |
| 权限拒绝对应 `HOST_PERMISSION_DENIED` + 降级、不循环弹窗 | **成立** |
| 离线/模型不可用：本地能力保持 + AI 降级解释 | **成立**（`required: [localCapabilitiesIntact, aiDegradationExplanation]`） |
| 契约化：schema + 校验 + 漂移检查接入 `verify`；非法转移有反例 | **成立** |
| 决定性守卫 | **大部分成立**；`forbiddenSemantics` 一处缺守卫（MINOR-1） |

## 7. 承接项归属复核（任务书 §6 两类不得混同）

| 项 | 要求 | 实际 | 判定 |
|---|---|---|---|
| G2-03 MI-03 | A-01 关闭 | 已关闭（auxiliary 归属 + 反例测试） | ✅ |
| PB-10-followups #5 | A-01 关闭 | 取"文档明示"路径关闭，并把"是否改 `degraded`/接持久化"转 [A-01-followups #3](A-01-followups.md) → A-02 | ✅ 未越权 |
| PB-11-followups #4/#6 | 只作输入，归口 A-02/A-11 | 未代签关闭 | ✅ |
| PB-12-followups N3 | 只作输入，归口 A-12 | 未代签关闭 | ✅ |

**无越权关闭。**

## 8. 交接与关闭条件

- **MINOR-1 由 Codex 修复、由我复审关闭**；实施者不得自行关闭发现。
- 新建 workspace `packages/ux-state`（L0）的报批出处已写入实施记录（"随计划批准获得业主授权"）。该批准属业主与实施者之间的事实，**我只能核到"已如实登记"，不能独立证真**——与 PB-11 MI-05 同一口径，请业主知悉。
- 远程 CI run 号仍在我的独立核验能力之外；我核的是本地 `verify`/套件全绿与分支未合入。
- **PR #53 在复审签署前不合入**；审计报告落盘的**同一轮**补 §3.1 台账 `A-01` 行（检查 8a 会真的拦），状态如实写，合并后按 [AGENTS 台账证据指纹规则](../../AGENTS.md) 用 `main` 上的合入 SHA。
- 复审时我会重跑：MINOR-1 的清空攻击（须变红）、§2 全部通过项的不回潮、以及 D3 四路强攻。

---

*本报告由独立审计角色出具；台账与代码修复由实施者完成。审计期间仅新增本文件。*

---

# 9. 复审记录（2026-08-01）· 结论 PASS

> 复审对象：`4b45671`（MINOR-1 修复）+ `4cfcfab`（审计报告落盘 + 台账当轮补），分支 `a-01-ux-freeze`，**未合入**（`origin/main` 仍为 `cab9102`）。
> 我的首审报告（§1–§8）经比对**逐字未被改动**。

## 9.1 结论

**PASS —— MINOR-1 已关闭，无未关闭发现。A-01 可标 ✅、合并 PR #53，`A-02` 起 12 个下游按各自 DoR 开工。**

修复面干净：改动只有契约测试 +29 行与文档，**未动 schema、未动 12 状态数据**——用"钉定"而不是"改契约"来关闭发现，是这条 MINOR 的正确解法。

## 9.2 MINOR-1 复核（我三路强攻，全部被抓）

新增测试把 12 个状态的 `forbiddenSemantics` **逐字钉定**（6 个有禁令的钉具体条款，6 个无禁令的钉空数组），并断言"恰 12 项、恰 6 项有禁令"。我没有只重演自己那一路，而是三个方向各打一次：

```text
基线                                                          23/23
攻击① 清空 ai-result（丢掉「未接受不改正式内容」——我首审那一路）  → 22/23，恰该钉定测试红
攻击② 改写 save-result 为「失败可以先标记为已保存」（语义反转）    → 22/23，恰该钉定测试红
攻击③ 给无禁令的 pagination 凭空加一条禁令（反方向）              → 22/23，恰该钉定测试红
```

**攻击②是我另加的、也是最危险的一路**——把红线悄悄改写成它的反面，比清空更难察觉；`deepEqual` 逐字比对把它一并挡住了。**双向防篡改成立，MINOR-1 关闭。**

补一句口径澄清，避免后续误读：schema 层**依然接受** `forbiddenSemantics: []`，这是**正确的**——12 个状态里恰有 6 个在 ux-spec §4 本就没有"不得"语义，一刀切 `minItems: 1` 反而会逼出伪造条款。防线正确地落在"逐字钉定"而非"非空"，我首审 §3 的修复方向也是这么写的。

## 9.3 §2 通过项不回潮（我的承诺项）

```text
D3 增量分页四路强攻      repaginationScope="full" / fullRepagination=true / =false / stalePreviewRetained=false
                        → 四路全拒；整块 pagination 删除 → UX_STATE_EXTENSION_MISSING
a11y 三字段 + 整块       → 四路全拒
删状态(12→11) / 重复 id / uxSpecRow=99 / evidenceSource="made-up" / 悬空转移 → 全拒
@wenshu/ux-state         23/23（首审 22，新增 1 条钉定守卫）
@wenshu/web              17/17
pnpm verify              exit 0
```

首审 §2 的全部通过项——12 状态逐行、来源标注机检、IA 恰 8 项、D1 决策 #14 留痕、G2-03 MI-03 收紧方向、eslint 全局洞收口、零新增依赖——本轮均未回潮。

## 9.4 台账与流程

- 台账 `A-01` 行**已于审计报告落盘同轮补上**（G2-04 检查 8a 的正确时点），状态如实写 `🔄 已实现，首审 CONDITIONAL PASS（MINOR-1 已修复，待复审）`，并链接本报告。实施记录里自曝的"台账提前写被 8a 拦"那条教训，这一轮执行到位。
- PR #53 **仍未合入**，`origin/main` 停在 `cab9102`——"审计签署前不合并"的纪律自 PB-12 起保持完整。
- 我 §5 的自我更正（任务书 7+5 拆分误算，正确为 7+4+dual）与交付物机检口径一致，无行动项；§4 三条 NOTE 均无需整改，计数时点注已补。

## 9.5 能力边界（两轮一致，请业主知悉）

- `packages/ux-state` 新建 workspace 的报批出处**我只能核到"已如实登记"**，不能独立证真（同 PB-11 MI-05 口径）。
- 远程 CI run 号不在我的独立核验能力之内；我核的是本地 `verify`/套件全绿、分支未合入、以及我自建攻击的红绿。

## 9.6 签署

A-01 从首审 `CONDITIONAL PASS`（1 MINOR）到终局，发现由实施者修复、由我复审关闭，实施者未自行关闭任何一条，本报告正文两轮未被改动一字。承重结论：**12 状态逐行冻结且删不掉、改不动、抹不掉**；**增量分页双闸挡住四路强攻**（D3 落实，PoC-A 的全量分页 `not_met` 没有被偷渡进 Alpha 状态机）；**a11y 在契约层必填**，没有推给 A-13；**信息架构恰 8 项**未越 ux-spec §3 上限；**设计稿正式废弃、未被猜测**（决策 #14）。

**A-01 独立审计签署：PASS。** 合并后请当轮把台账 `A-01` 行改 ✅，按 [AGENTS 台账证据指纹规则](../../AGENTS.md) 补 `main` 上的合入 SHA 与最终验证 run；`A-02` 起的 12 个下游自台账 ✅ 起具备开工资格，消费本冻结契约时须遵守 [A-01-followups #4](A-01-followups.md) 的 additive 升级纪律。
