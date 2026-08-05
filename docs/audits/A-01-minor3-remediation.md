# A-01 契约加固（A-02 复审 MINOR-3）实施记录与证据

> 任务：按业主裁定（2026-08-05，归口 A-01 契约加固，不拆 A-13）补钉冻结
> `states-1.0.0.json` 1.0.0 的全部用户可见字段，防静默改写机械化覆盖
> 从 `forbiddenSemantics` 扩展到 12 态 × 5 字段。本文档为实施侧证据；
> 最终结论以 Claude 独立审计为准。
> 实施环境：wenshu-dev-primary（Windows 10），**Node v24.13.0 ≠ 参考机器
> 24.17.0**（已登记 G1-14 / A-02-followups §4 的存量差距，本棒全部复跑
> 在 24.13.0 上完成，「参考机器复跑」成色受此限制）。

## 1. 指令审计结论：无阻塞冲突

| 核查项 | 结论 |
|---|---|
| G2-04 检查 8a（审计报告落盘须登记） | 本报告名 `A-01-minor3-remediation.md` 不匹配 `REPORT_SUFFIX = "-claude-audit-report.md"`（tools/quality/src/roadmap-checks-evidence.ts），天然豁免，同 PA-A4-A8-remediation 先例 |
| file-size 门禁（测试文件 >500 行 ERROR，≥300 WARN） | 改动前 369 行（WARN 存量）；预算 131 行内完成钉定，实测落地 **478 行**，距硬顶 22 行。可行，未触线 |
| 任务书 §4.1 已锚定声称 | 经实测复核全部属实（见 §2 基线表，方法：字面量 grep + 逐测试读码，不凭测试名推断） |
| §4.2 已锚定格的变异归属 | empty-project / crash-recovery 的 `requiredPresentation` 变异红在既有断言 + 新钉定测试双侧，符合任务书「红即有效」精神（§4 矩阵第 2、58 行） |
| §5 限制句解除时点 | 「未加固前任何文档不得宣称 1.0.0 防静默改写已机械化全覆盖」**本棒不撤**；须待独立审计签署后方可解除，解除时注明覆盖范围 = 12 态 × 5 字段。已在 A-01-followups #5 处置注记中写明 |
| 硬边界自查 | ① `states-1.0.0.json` 零字节改动（§6）；② 钉定只落契约测试层，消费者零复制（§6）；③ 不用逐字对账充数——断言全部比对测试内写死字面量，反向证据见 §5 |

## 2. 基线表（改动前实测，12 态 × 5 字段）

实测方法：把 JSON 中 12 态的每个字段值作为字面量 needle，对
`packages/ux-state/test/` 三个测试文件逐一 grep；命中处再读码确认是
「内容钉定」还是「非内容断言」（如非空检查、schema const）。

| 状态 | label | requiredPresentation | a11y.textEquivalent | a11y.focusEntry | cancelable |
|---|---|---|---|---|---|
| empty-project | 未钉 | **已钉**（`presentation entries are content-pinned`） | 未钉 | 未钉 | 未钉 |
| importing | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| import-partial | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| ai-processing | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| ai-result | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| pagination | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| page-issues | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| save-result | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| pre-export | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| offline-degraded | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| permission-denied | 未钉 | 未钉 | 未钉 | 未钉 | 未钉 |
| crash-recovery | 未钉 | **已钉**（`pinned content: crash-recovery row 12`） | 未钉 | 未钉 | 未钉 |

补充实测说明：

- 契约测试中唯一的 `cancelable` 命中（旧 line 124）钉的是 **pagination
  扩展字段** `state.pagination.cancelable`，与顶层 `cancelable` 不同字段，
  顶层 12 态均未钉。
- 范围外但已钉的字段（本棒不重复、不放宽）：`forbiddenSemantics` 12/12
  （A-01 修复轮逐字钉死）、`a11y.noColorOnly` 12/12（schema const + 断言）、
  结构不变量（12 态 id/顺序/uxSpecRow/transitions 闭图/状态数 12）。
- 缺口合计 58 格（label 12 + requiredPresentation 10 + textEquivalent 12
  + focusEntry 12 + cancelable 12），与任务书口径一致。
- apps/web 侧的「原文件只读」命中（test/flow.unit.test.ts:176）是 view-model
  直通测试的**夹具输入**（构造假 state 断言逐字搬运），不是对冻结文件的
  内容锚定——web 钉「逐字搬运」、契约层钉「内容不变」的分工不变。

## 3. 交付物

1. `packages/ux-state/test/ux-states.contract.test.ts`（369 → 478 行，纯增）：
   新增测试 `pinned content: all 12 states' user-visible fields verbatim
   (A-01 MINOR-3)`——单一字面量表覆盖 12 态 × 5 字段
   （`label` / `requiredPresentation` 逐条按序 / `a11y.textEquivalent` /
   `a11y.focusEntry` / `cancelable`），逐字段与加载文档比对。
   empty-project / crash-recovery 的 requiredPresentation 与既有钉定
   有意重复（同一字面量表一处维护，注释已写明）。
2. 本文档（基线表 + 变异矩阵 + 反向证据）。
3. `docs/audits/A-01-followups.md` #5 处置注记（已实施待审计，限制句留待
   审计签署后解除）。

未新增路线图任务 ID（任务书明确），故无台账行；不触碰
`host-v0-3.contract.test.ts`（499 行，距 500 顶 1 行）。

## 4. 变异矩阵（60 格 + 1 顺序补格，全红）

方法：`tmp/a01-minor3/mutation-matrix.mjs`（临时脚本，不入仓）逐格
注入变异 → 跑 `node --test test/ux-states.contract.test.ts` → 断言退出码
≠0 且失败定位于钉定测试 → 从字节备份恢复。变异手法：字符串值在第一
字符后插入 `x`；`requiredPresentation` 变异**最末条**（importing 的最末条
即「原文件只读」→「原x文件只读」，复刻 MINOR-3 原变异）；`cancelable`
布尔翻转；补格 61 为 empty-project requiredPresentation 逆序（验顺序钉定）。
不碰结构不变量（transitions/状态数/id），无污染邻域断言的探针失效。
每格跑完即恢复，全部结束后 `git diff` 核 JSON 零字节（§6）。

「钉定测试」= 本棒新增钉定测试；「既有钉」= 改动前已存在的锚定断言。
| # | 格 | 变异 | 退出码 | 变红测试 |
|---|---|---|---|---|
| 1 | `empty-project.label` | label=初x次/空项目 | 1 | 钉定测试 |
| 2 | `empty-project.requiredPresentation` | rp[2]=下x一步 | 1 | 钉定测试 + 既有钉(presentation) |
| 3 | `empty-project.a11y.textEquivalent` | te=空x项目引导以文字列出支... | 1 | 钉定测试 |
| 4 | `empty-project.a11y.focusEntry` | fe=焦x点落在「下一步」主操作 | 1 | 钉定测试 |
| 5 | `empty-project.cancelable` | cancelable=true | 1 | 钉定测试 |
| 6 | `importing.label` | label=导x入中 | 1 | 钉定测试 |
| 7 | `importing.requiredPresentation` | rp[4]=原x文件只读 | 1 | 钉定测试 |
| 8 | `importing.a11y.textEquivalent` | te=导x入进度以文字百分比与... | 1 | 钉定测试 |
| 9 | `importing.a11y.focusEntry` | fe=焦x点落在「取消」按钮 | 1 | 钉定测试 |
| 10 | `importing.cancelable` | cancelable=false | 1 | 钉定测试 |
| 11 | `import-partial.label` | label=导x入部分成功 | 1 | 钉定测试 |
| 12 | `import-partial.requiredPresentation` | rp[3]=可x重试项 | 1 | 钉定测试 |
| 13 | `import-partial.a11y.textEquivalent` | te=成x功与失败条目均以文字... | 1 | 钉定测试 |
| 14 | `import-partial.a11y.focusEntry` | fe=焦x点落在第一个可重试项 | 1 | 钉定测试 |
| 15 | `import-partial.cancelable` | cancelable=true | 1 | 钉定测试 |
| 16 | `ai-processing.label` | label=AxI 处理中 | 1 | 钉定测试 |
| 17 | `ai-processing.requiredPresentation` | rp[2]=预x计费用或 BYOK 状态 | 1 | 钉定测试 |
| 18 | `ai-processing.a11y.textEquivalent` | te=处x理阶段以文字说明当前... | 1 | 钉定测试 |
| 19 | `ai-processing.a11y.focusEntry` | fe=焦x点落在「取消」按钮 | 1 | 钉定测试 |
| 20 | `ai-processing.cancelable` | cancelable=false | 1 | 钉定测试 |
| 21 | `ai-result.label` | label=AxI 结果 | 1 | 钉定测试 |
| 22 | `ai-result.requiredPresentation` | rp[3]=axccept/reject | 1 | 钉定测试 |
| 23 | `ai-result.a11y.textEquivalent` | te=dxiff 增删以文字标... | 1 | 钉定测试 |
| 24 | `ai-result.a11y.focusEntry` | fe=焦x点落在第一处 diff 裁决控件 | 1 | 钉定测试 |
| 25 | `ai-result.cancelable` | cancelable=true | 1 | 钉定测试 |
| 26 | `pagination.label` | label=分x页中 | 1 | 钉定测试 |
| 27 | `pagination.requiredPresentation` | rp[2]=旧x预览保留到新结果可用 | 1 | 钉定测试 |
| 28 | `pagination.a11y.textEquivalent` | te=分x页阶段与进度以文字表... | 1 | 钉定测试 |
| 29 | `pagination.a11y.focusEntry` | fe=焦x点落在「取消」按钮 | 1 | 钉定测试 |
| 30 | `pagination.cancelable` | cancelable=false | 1 | 钉定测试 |
| 31 | `page-issues.label` | label=页x面有问题 | 1 | 钉定测试 |
| 32 | `page-issues.requiredPresentation` | rp[5]=允x许的人工豁免 | 1 | 钉定测试 |
| 33 | `page-issues.a11y.textEquivalent` | te=问x题严重度以文字分级（... | 1 | 钉定测试 |
| 34 | `page-issues.a11y.focusEntry` | fe=焦x点落在第一条阻断项的定位链接 | 1 | 钉定测试 |
| 35 | `page-issues.cancelable` | cancelable=true | 1 | 钉定测试 |
| 36 | `save-result.label` | label=保x存成功/失败 | 1 | 钉定测试 |
| 37 | `save-result.requiredPresentation` | rp[0]=明x确保存位置和版本 | 1 | 钉定测试 |
| 38 | `save-result.a11y.textEquivalent` | te=保x存结果以文字明确成功... | 1 | 钉定测试 |
| 39 | `save-result.a11y.focusEntry` | fe=失x败时焦点落在重试/诊断入口 | 1 | 钉定测试 |
| 40 | `save-result.cancelable` | cancelable=true | 1 | 钉定测试 |
| 41 | `pre-export.label` | label=导x出前 | 1 | 钉定测试 |
| 42 | `pre-export.requiredPresentation` | rp[2]=目x标路径和覆盖风险 | 1 | 钉定测试 |
| 43 | `pre-export.a11y.textEquivalent` | te=各x格式质量承诺与检查结... | 1 | 钉定测试 |
| 44 | `pre-export.a11y.focusEntry` | fe=焦x点落在格式选择控件 | 1 | 钉定测试 |
| 45 | `pre-export.cancelable` | cancelable=true | 1 | 钉定测试 |
| 46 | `offline-degraded.label` | label=离x线/模型不可用 | 1 | 钉定测试 |
| 47 | `offline-degraded.requiredPresentation` | rp[1]=AxI 功能解释降级 | 1 | 钉定测试 |
| 48 | `offline-degraded.a11y.textEquivalent` | te=降x级状态以文字说明哪些... | 1 | 钉定测试 |
| 49 | `offline-degraded.a11y.focusEntry` | fe=焦x点落在降级说明文本 | 1 | 钉定测试 |
| 50 | `offline-degraded.cancelable` | cancelable=true | 1 | 钉定测试 |
| 51 | `permission-denied.label` | label=权x限拒绝 | 1 | 钉定测试 |
| 52 | `permission-denied.requiredPresentation` | rp[2]=如x何重新授权 | 1 | 钉定测试 |
| 53 | `permission-denied.a11y.textEquivalent` | te=权x限需求原因与可降级路... | 1 | 钉定测试 |
| 54 | `permission-denied.a11y.focusEntry` | fe=焦x点落在「如何重新授权」说明（不自动重弹授权框） | 1 | 钉定测试 |
| 55 | `permission-denied.cancelable` | cancelable=true | 1 | 钉定测试 |
| 56 | `crash-recovery.label` | label=崩x溃恢复 | 1 | 钉定测试 |
| 57 | `crash-recovery.requiredPresentation` | rp[2]=是x否另存恢复副本 | 1 | 既有钉(crash-recovery) + 钉定测试 |
| 58 | `crash-recovery.a11y.textEquivalent` | te=恢x复检查点与丢失范围以... | 1 | 钉定测试 |
| 59 | `crash-recovery.a11y.focusEntry` | fe=焦x点落在「恢复/另存副本」选择控件 | 1 | 钉定测试 |
| 60 | `crash-recovery.cancelable` | cancelable=true | 1 | 钉定测试 |
| 61 | `empty-project.requiredPresentation#reorder` | rp reversed -> ["下一步","示例","支持的输入"] | 1 | 钉定测试 + 既有钉(presentation) |

结果：**61/61 全红且失败全部定位于钉定测试**（3 格同时在既有钉定断言
变红，符合预期）；无一格漏检、无一格红在错误归因。

手工交叉复核：单独手工注入 importing.requiredPresentation「原文件只读」
→「原x文件只读」（不经过矩阵脚本），同样精确红在钉定测试（exit=1，
fail 1）；恢复后 `sha256sum` 与 `git diff` 双重核对 JSON 零字节。

## 5. 反向证据（钉的是写死字面量，非自我对账）

把钉定测试中的 label 断言临时改为恒真式
（`assert.equal(state.label, state.label, state.id)`，即比较对象改读加载
文档自身），再注入与矩阵第 6 格相同的 importing.label 变异
（「导入中」→「导x入中」）：**契约测试 24/24 全绿、exit=0**——同一变异
在真实钉定下红（矩阵第 6 格）、在恒真改写后转绿，证明钉定比较的是测试
内写死字面量，不是同一份 JSON 的自我对账（A-02 §7.5 识别的充数形态）。
实验后测试文件与 JSON 均从字节备份恢复，41/41 复绿，现场核验见 §6。

## 6. 越界自查与现场完整性

- `git diff --stat -- packages/ux-state/src/states-1.0.0.json` 为空；
  `git status --short` 仅两个预期改动文件（契约测试 + 本报告前的
  followups 注记）。
- 全仓 grep 消费者层无钉定复制：`apps/web`、`apps/electron-shell`、
  `apps/arkweb-shell`、scenario 层均未新增对 1.0.0 字段字面量的内容断言
  （web 侧存量命中为 §2 所述夹具输入，非本棒产物）。
- 矩阵与反向实验全部改回后 ux-state 全套件 **41/41 绿**。

## 7. 回归

| 命令 | 结果 |
|---|---|
| `node --test test/*.test.ts`（packages/ux-state） | 41/41 pass（含新增钉定测试） |
| `pnpm test:unit` | 327/327 pass，exit=0 |
| `pnpm contracts:test`（含 ux-state） | 随 verify 内 contracts:check 全过（14 包，VERIFY_EXIT=0） |
| `pnpm typecheck` | 随 verify 全仓 tsc 全过 |
| `pnpm format:check` | 随 verify 第一步过；单文件 prettier 预检 unchanged；本报告提交前再单独复验 |
| `pnpm verify`（12 步，含 quality:check 即 file-size 门禁） | **VERIFY_EXIT=0 全绿**（本机 Node 24.13.0，engine WARN 为存量登记项） |

A-02 E2E：本棒改动面仅 `packages/ux-state/test/` 一个测试文件与两份
`docs/audits/` 文档，不触碰 host-contract / apps/web / E2E 路径，逻辑上
不影响 A-02 E2E（5 pass + 1 诚实 skip 口径不变）。

## 8. 已知限制与后续

- 限制句（A-01-followups #5）本棒保留，待独立审计签署后方可解除，解除
  时注明覆盖范围 = 12 态 × 5 字段。
- 钉定测试落地后文件 478 行，距 file-size ERROR 硬顶 22 行；后续在该文件
  加测试须留意预算（WARN 阈值 300 早已越过，属既有状态）。
- 本棒全部证据在本机 Node v24.13.0 产出，非参考机器 24.17.0；远程 CI
  （ubuntu-24.04，Node 按 workflow 钉定）为独立复现面。
