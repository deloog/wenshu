# A02F5 Claude 独立审计报告

> 审计对象：消除 happy/partial/cancel 路径的「终态后迟到进度事件」竞态。分支 `a02f5` 头 `df1b207`，PR #63 **未合入**（`main` = `4c4b365`）。
> 依据：[A02F5 任务书](A02F5-implementation-task.md)（我起草）、[决策 #20](../../决策记录.md) D2/D3 + D3 增补、[A-02-followups #5](A-02-followups.md)。
> 审计方法：按任务书 §9 逐条打；三次变异全部自建重放，不采信实施记录的自证结论。
> **命名说明**：本报告刻意不使用 `-claude-audit-report.md` 后缀——本棒无 §3.1 台账行，用该后缀会让[检查 8a](../../tools/quality/src/roadmap-checks-evidence.ts) 硬失败（任务书 §7 已预告）。

## 1. 结论

**签署 `PASS`。** 无 BLOCKER、无 MAJOR。两项 MINOR，均不阻断合并。

修法落的是 (b′) 且**做到了我要求的"结构性优先"**：终态 dispatch 只经 `wiring.dispatchTerminal` 走，内部先停投递再转交控制器；迟到事件继续记录、不再投递。**竞态是被消除的，不是被容忍的**——`assertProgressWiringClean` 两条断言一字未动。

## 2. 我独立坐实的部分

### 2.1 机制正确

[project-import-shared.ts](../../apps/electron-shell/scenario/project-import-shared.ts) 逐行核：

- `dispatchTerminal` 内 `forwarding = false` 在 `flow.dispatch(event)` **之前**——顺序对；
- 监听器里 `wiring.events.push(...)` 与 `onFirst?.()` 在 `if (!forwarding) return;` **之前**——**迟到事件仍被记录**，`events.length >= 1` 不受影响，这正是 (b′) 相对 (b) 字面实现的全部价值所在；
- `TerminalImportFlowEvent` 用 `Extract` 把可传事件收紧到三类终态；
- `emptyProgressWiring()` 的 `dispatchTerminal` 直接抛错——**wiring 未安装即调用是 fail-closed**，这一点我没要求，是实施侧自己加的。

### 2.2 三次变异，全部我自己重放

| 变异 | 结果 |
|---|---|
| **M1** 撤 `if (!forwarding) return;` | **2 例红**：反例 1（dispatchErrors 断言）与反例 2；**反例 3 保持绿** |
| **M2** 往 happy 路径直写内联终态 `flow.dispatch`（该文件用 `wireProgress`） | **恰 1 例红**：静态钉定，报错原文正确——**收窄后仍有牙** |
| **M3** 同上但改为变量形态（`const ev = {...}; flow.dispatch(ev)`） | **7/7 全绿**——钉定被规避，见 §3 MINOR-2 |

**M1 中反例 3 保持绿是本棒最关键的一条**：它证明修复**没有换来失明**——终态窗口内的真实非法 dispatch 照旧被记录并使断言变红。决策 #20 排除修法 (a) 的理由正是"别让断言对一整类错误失明"，这条现在有实证。

变异恢复我一律用反向编辑，未使用 `git checkout`（实施侧那次误用已入档，我不重蹈）。

### 2.3 边界与回归

| 项 | 我的核验 |
|---|---|
| 产品零改动 | `import-flow.ts` / `project-channels.cjs` 相对 main 的 diff **为空** ✅ |
| 断言未放宽 | `dispatchErrors.length === 0` 与 `events.length >= 1` 两条**一字未动** ✅ |
| `wiringHelper` / `guards.ts` | **零触碰** ✅ |
| 反例是否确定性 | 7 条全部为确定性注入（假 bridge 喂事件），**无一依赖"多跑几次没红"** ✅ |
| 状态机未被 mock | 反例用真 `createImportFlowController`——反例 3 的"仍红"才有意义 ✅ |
| A-02 E2E 回归 | 我自己复跑：**5 pass + 1 诚实 skip，0 fail** ✅ |
| 承接项关闭 | A-02-followups #5 就地关闭注记齐备，含两次复发背景 ✅ |
| 决策增补 | 决策 #20 D3 增补已落盘，理由写明（避 `events.length >= 1` 新 flake）✅ |

## 3. 两项 MINOR

### MINOR-1　实施记录的变异自证描述不准确

记录写「撤 forwarding 闸 → **反例 1 红**」，我实测是**反例 1 与反例 2 两例红**。

反例 2 除断言事件被记录外，还断言 `dispatchErrors` 为空并调用 `assertProgressWiringClean`——所以它跟着红是**正确行为，不是误伤**。但"红恰落反例 1"这个表述会让复审者预期恰好一例，对不上账。

**要求**：记录改为"红落反例 1 与反例 2（后者亦断言 dispatchErrors 为空），反例 3 不受影响"。一句话的事。

### MINOR-2　静态钉定只认内联字面量，可被变量形态规避

钉定正则：

```js
/flow\.dispatch\(\s*\{\s*type:\s*"(?:import-succeeded|import-partial|import-cancelled)"/u
```

我实测（M3）：把事件先存进变量再 dispatch，**7/7 全绿**，而那确实是一次绕过 wiring 的直写终态。

**判读要公道**：钉定要防的是"将来第四个场景**忘记**走 wiring"，而忘记时几乎必然写成自然的内联形态——**那个形态被 M2 证明能抓住**。变量形态不是"忘记"，是另一种写法恰好绕开。所以钉定覆盖了现实失效模式，但**不是防规避的**。

**要求**：不必改实现，但**记录里必须写明这个边界**——否则下一个人会把它当成完整的结构性保证。若日后想收紧，方向是类型层（让场景侧拿到的控制器包装不接受终态事件），而非把正则写得更花。

## 4. 未由我复核

- **远程 CI run `31180230710`**：远程 run 一直在我的独立核验能力之外，只转述不背书（口径自 PB-12 起未变）。
- **竞态本身不再复发**：本棒的验收本就不建立在"没复现"上（任务书 §4.4），我也不以此作为通过依据——通过依据是 M1/M2 与反例 3。

## 5. 一处值得记的过程事实

实施侧如实登记了两件对自己不利的事：静态钉定初版过宽（抓到 `guards.ts:166` 的既有合法形态）、以及**变异后误用 `git checkout` 冲掉未提交修复**。

第一件反而是正面证据——**初版能抓到直写，说明钉定本来就有牙**，收窄是精确化不是削弱（M2 已证）。第二件是真实风险，已入档，我在本轮审计中亦全程只用反向编辑恢复变异。

## 6. 签署与后续

**`PASS`。** 交接：① MINOR-1 记录措辞更正；② MINOR-2 边界写进记录；③ **PR #63 合并须业主裁定**；④ 本棒无台账行，合并后用 `main` squash SHA 记于实施记录。

两项 MINOR 均为文档措辞，**不需要我复审**——业主可在合并前直接确认。

---

*本报告由独立审计角色出具；任务书亦由我起草（只归集权威来源与实测机制、标出待裁定点，不构成实施），故仍可担任本棒审计——本轮所审为 harness 实现，非我撰写的文本。审计期间仅新增本文件；三次变异（M1/M2/M3）均以反向编辑还原，`git status` 干净。*
