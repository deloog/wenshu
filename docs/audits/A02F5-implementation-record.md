# A02F5 实施记录 · 消除 happy/partial/cancel 路径的「终态后迟到进度事件」竞态

> 任务书：[A02F5-implementation-task](A02F5-implementation-task.md)（决策 #20 D2/D3/D4 授权，D3 增补定形态 (b′)）；实施：Kimi（实施者角色）；日期：2026-08-07。
> 本记录只写实际执行的检查与结果；反例全部为确定性注入，不靠「跑 N 次没红」。

## 1. 范围对账

| 任务书要求 | 落实 |
|---|---|
| (b′)：保留订阅、终态前停止投递、事件继续记录 | `wireProgress` 加 `forwarding` 闸——`dispatchTerminal` 先停投递再转交控制器；迟到事件照常 `events.push`（§2） |
| 结构性首选：终态 dispatch 经 wiring 走 | `wiring.dispatchTerminal(event)`（只接受三类终态事件的 `TerminalImportFlowEvent` 类型）；三调用点全部改经 wiring |
| 反例 5 防漏机制 | 静态钉定：凡用 `wireProgress` 的场景文件禁止直接 `flow.dispatch` 终态事件（§3 反例 5s）；初版钉定过宽抓到 guards.ts 如实登记（§3） |
| 硬边界：断言不放宽/不改产品/wiringHelper 不动/不靠「没复现」 | `assertProgressWiringClean` 两条断言原样；`import-flow.ts` 与 `project-channels.cjs` diff 为空（§5）；`wiringHelper` 与 guards.ts 零改动；五条反例全确定性注入 |
| A-02-followups #5 就地关闭 | 已按 PB-12/A-01 先例就地写入关闭注记，两次复发 run id 为背景 |
| 审计报告命名 `A02F5-claude-audit.md` | 待审计者落盘（无 `-report` 后缀，避 G2-04 检查 8a） |

## 2. 改动清单（harness-only，产品零改动）

- `scenario/project-import-shared.ts`：`ProgressWiring` 加 `dispatchTerminal`（结构首选）；新增 `TerminalImportFlowEvent` 类型与 `emptyProgressWiring()`（未安装即调用 fail-closed）；`wireProgress` 加 `forwarding` 闸——停投递后事件仍记录不 dispatch。`assertProgressWiringClean` 两条断言**一字未动**。
- `scenario/project-import-basic.ts`：happy（`import-succeeded`）与 partial（`import-partial`）两处终态改经 `wiring.dispatchTerminal`；两处 `let wiring` 初始化改 `emptyProgressWiring()`。
- `scenario/project-import-abort.ts`：cancel（`import-cancelled`）终态改经 wiring；初始化同上。
- `test/progress-wiring.unit.test.ts`（新增，7 条）：五条确定性反例 + 静态钉定 + 空 wiring fail-closed。
- 文档：决策记录 #20 D3 增补（(b′) 形态）；A-02-followups #5 就地关闭注记；本记录。

**双向审查记录（开工前复验，决策 #20 D4 制度）**：任务书机制性断言 9/9 当命令复验成立（project-channels.cjs:127-136 同步时序/三处行号/两断言/wiringHelper 注释/四使用点/finally 退订晚于终态）；新增反例 5 节复验时实施侧独立指出「由类型/接口天然满足」偏强（flow 在场景内有其他合法 dispatch，类型无法收回直写），故结构性首选**外加静态钉定**使「忘记」对未来第四个场景也机械可检出——起草者「结构性优先」节的意图由此完全闭合。D1 风险分析（(b) 字面实现的 events.length>=1 新 flake）独立复验成立，支持 (b′)。

## 3. 五条决定性反例（全部确定性注入）

测试以**真 `wireProgress` + 真 `ImportFlowController`**（不 mock 状态机）运行，迟
到/非法事件由测试直接喂入捕获的回调：

| # | 构造 | 结果 |
|---|---|---|
| 1 | 终态 dispatch 后注入迟到事件 | ✅ `dispatchErrors` 空、`assertProgressWiringClean` 通过 |
| 2 | 终态后全部事件迟到（(b) 字面实现的死穴排序） | ✅ `events.length===2` 照常计数，无新 flake |
| 3 | 终态前（窗口开着时）真实非法 dispatch（empty-project 态喂 import-progress） | ✅ **仍红**：`dispatchErrors` 收 `IMPORT_FLOW_ILLEGAL_TRANSITION`、断言抛——修复没换来失明 |
| 4 | happy/partial/cancel 三形态正常流 | ✅ 全绿无过矫正 |
| 5d | 「忘记」经 wiring（直接 `flow.dispatch` 终态）后注入迟到事件 | ✅ 动态可捕：`dispatchErrors` 非空、断言红 |
| 5s | 静态钉定：扫描 scenario 全部 .ts，凡用 `wireProgress` 者禁止直接终态 `flow.dispatch` | ✅ 当前零违规；未来第四个场景漏走 wiring 机械可检出 |

**静态钉定初版失败如实登记**：首版钉定对全部场景文件一刀切，抓到 `project-import-guards.ts:166`（直接 `flow.dispatch({ type: "import-succeeded" })`）——核为**既有合法形态**：guards 路径用 `wiringHelper` 且在终态前已 `offImportProgress()`（:159 早于 :166），不在本棒范围（任务书 §4.3 wiringHelper 语义不动）。钉定按「凡用 `wireProgress` 者」精确化后绿。初版能抓到直写终态本身证明钉定有牙（审计者 M2 独立重放：happy 路径直写内联终态 → 恰 1 例红落静态钉定，收窄后仍有牙）。

**静态钉定覆盖边界（审计者 MINOR-2，必须周知）**：钉定正则只认**内联字面量**形态。审计者 M3 实测：把事件先存变量再 `flow.dispatch(ev)`，7/7 全绿——那确实是一次绕过 wiring 的直写终态，钉定抓不到。判读（审计者口径）：钉定要防的是「将来第四个场景**忘记**走 wiring」，而忘记时几乎必然写成自然的内联形态（M2 已证抓得住）；变量形态不是忘记，是另一种写法恰好绕开。**故本钉定覆盖现实失效模式，但不是防规避的完整结构性保证**，下一个人不得把它当作完整保证。若要收紧，正确方向是**类型层**（场景侧拿到的控制器包装不接受终态事件），不是把正则写得更花。

**变异自证**：撤掉 `if (!forwarding) return;` → fail 2：**红落反例 1 与反例 2**——反例 2 除断言事件被记录外亦断言 `dispatchErrors` 为空并调用 `assertProgressWiringClean`，跟着红是**正确行为非误伤**（审计者 M1 独立重放同两例红）；**反例 3 不受影响**（任务书要求，审计者判本棒最关键一条：修复没换来失明有实证非仅设计意图）；还原后 7/7 绿。

## 4. 回归与检查执行记录

- `node --test test/progress-wiring.unit.test.ts`：7/7 绿（直取 EXIT=0）。
- `pnpm --filter @wenshu/electron-shell typecheck`：EXIT=0（tsconfig 含 test/**/*.ts）。
- `pnpm ci:job e2e`（六子场景真 Electron 回归）：**E2E_EXIT=0 全绿**——happy+open 轨迹原件 `empty-project → importing → project-view:import-succeeded → project-view:project-opened`，无 dispatchErrors。
- `pnpm verify` 全量：**VERIFY_EXIT=0**（直取，无管道；首轮两处 prettier 红已修——`if (!forwarding) return;` 变异锚点 prettier 后仍在 282 行原位）。新测试文件被 unit 层发现执行（verify 日志列名）。

## 5. 产品零改动核验

`git diff main -- packages/ux-state/src/import-flow.ts apps/electron-shell/src/project-channels.cjs` 输出为空（0 行，提交前实测）。

## 6. 过程缺陷如实登记

- 变异自证后误用 `git checkout -- <file>` 恢复，把未提交的修复一并冲掉（该文件回到 HEAD），随即按编辑记录原样重新施加并复跑 7/7 绿。教训：变异恢复只用反向编辑，不用 checkout——尤其修复未提交时。审计者本轮全程只用反向编辑恢复变异，未重蹈。

## 7. 审计与合并指纹（本棒无台账行）

Claude 独立审计 **`PASS`**（无 BLOCKER/MAJOR；M1/M2/M3 三次变异全部自建重放——M1 反例 3 保持绿=「修复没换来失明」实证、M2 证收窄后静态钉定仍有牙、M3 暴露钉定边界已入 §3；两项 MINOR 均文档措辞，按口径修入后审计者明确不需复审）。审计报告：[A02F5-claude-audit.md](A02F5-claude-audit.md)（以新文件形式入链、未被改写；签署基线 df1b207..df37d18 只动三文档、apps/packages 零改动，审计者合并前亲核）。

业主 2026-08-07 放行合并：squash 合入 main **`f64f348`**，main 验证 run **`31186210641`** 10/10 成功（转述不背书）。分支 `a02f5`（本地+远程）已删。修复后两轮 CI（PR 轮 + main 轮）a-02 happy+open 未再复发——非通过依据（通过依据是 M1 反例 3 保持绿），仅作观察登记。
