# A02F5 实施任务书 · 消除 happy/partial/cancel 路径的「终态后迟到进度事件」竞态

> 任务 ID：`A02F5`（[A-02-followups #5](A-02-followups.md) 的独立小棒，[决策 #20](../../决策记录.md) D2/D3/D4 授权；**不新增路线图任务行**）
> 起草：Claude（独立审计角色）　日期：2026-08-07
> 起草者声明：本文件只归集既有权威来源与实测机制、标出待裁定点，不构成实施；本棒独立审计仍由 Claude 担任。
> **本任务书的机制性断言均已在本仓当命令实跑核实**（AGENTS.md 长期踩坑①）。

## 0. 起草结论

范围很窄——**一个文件、一处时序、harness-only、不碰产品**。但有一处必须先确认：**决策 #20 D3 裁定的修法 (b)「终态 dispatch 前退订进度回调」按字面实现会引入一个新的 flake**，我建议改为同一意图的更安全形态 (b′)。见 §3 D1。

### 已核实的机制（不是推测）

**主进程在 `importMarkdownProject` 内部同步发完全部进度事件，之后才返回结果**（[project-channels.cjs:127-136](../../apps/electron-shell/src/project-channels.cjs#L127-L136)：`onProgress → webContents.send(...)`，`return { import_id, ...result }` 在其后）。

因此"迟到"**不是主进程在终态后继续发**，而是渲染侧两条独立通道之间没有顺序保证：

```text
主进程  webContents.send(progress)  ─┐
                                     ├→ 两条通道，无顺序保证
主进程  ipcMain.handle 回复(result) ─┘

渲染侧  await importProject() 先返回  →  flow.dispatch(terminal)   → 控制器进 project-view
        随后迟到的 progress 到达      →  flow.dispatch(import-progress)
                                      →  IMPORT_FLOW_ILLEGAL_TRANSITION
                                      →  wiring.dispatchErrors 非空
                                      →  assertProgressWiringClean 红
```

**这一点决定了 §3 的修法选择**：既然主进程没有"终态后仍在发"的行为，就没有需要保留可见性的产品缺陷——但**渲染侧仍可能出现"全部事件都迟到"的极端排序**，那正是 (b) 字面实现的风险所在。

### 现场

| 位置 | 内容 |
|---|---|
| [project-import-shared.ts:219-249](../../apps/electron-shell/scenario/project-import-shared.ts#L219-L249) | `wireProgress`：catch 后 `dispatchErrors.push(...)` |
| [project-import-shared.ts:300-306](../../apps/electron-shell/scenario/project-import-shared.ts#L300-L306) | `assertProgressWiringClean`：断言 `dispatchErrors.length === 0` **且 `events.length >= 1`** |
| [project-import-shared.ts:309-326](../../apps/electron-shell/scenario/project-import-shared.ts#L309-L326) | `wiringHelper`：`catch {}` + 注释「A late event after the terminal dispatch is ignored, never fatal.」 |
| 使用 `wireProgress` | [project-import-basic.ts:71](../../apps/electron-shell/scenario/project-import-basic.ts#L71)（happy）、[:210](../../apps/electron-shell/scenario/project-import-basic.ts#L210)（partial）、[project-import-abort.ts:58](../../apps/electron-shell/scenario/project-import-abort.ts#L58)（cancel） |
| 使用 `wiringHelper` | [project-import-guards.ts:153](../../apps/electron-shell/scenario/project-import-guards.ts#L153) |
| `offImportProgress()` | 现只在各子场景的 `finally` 调用（`project-import-basic.ts:155`/`:284`），**晚于**终态 dispatch（`project-import-basic.ts:102`） |

**同一文件里两个 wiring 对同一现象的处理相反**，而 happy 路径用的是严格的那个——这就是复发两次的直接原因。

## 1. 开工资格（DoR）

| 项 | 状态 |
|---|---|
| 闸门允许 | ✅ 决策 #20 D2/D3/D4 授权 |
| 前置完成 | ✅ 无前置；A-02/A-03/A-04E 均已合入 main |
| 一句话完成定义 | ✅ 三条使用 `wireProgress` 的路径不再因终态后迟到事件变红，且断言对真实 dispatch 缺陷的检出能力不下降 |
| 可验收标准 | ✅ §5 四条决定性反例（**全部为确定性注入，不靠"多跑几次没红"**） |
| 停止边界 | ✅ §4 |
| 是否改产品 | ⚠️ **否**——harness-only；改产品即越界（见 §4.2） |
| 回滚 | ✅ 单文件、纯时序改动 |

## 2. 范围

**范围内**：`apps/electron-shell/scenario/project-import-shared.ts` 的进度接线时序，以及三个子场景中相应的调用点。

**范围外**：`packages/ux-state/src/import-flow.ts`（控制器）、`apps/electron-shell/src/project-channels.cjs`（主进程通道）、任何产品代码、`wiringHelper` 的既有语义、其他 E2E 子场景。

## 3. 开工前必须确认的一件事

### D1　修法取 (b) 的字面实现，还是 (b′)？

[决策 #20](../../决策记录.md) D3 裁定 **(b)「终态 dispatch 前退订进度回调，从源头消除竞态」**。方向我完全同意（消除而非容忍），**但字面实现有一个新的失败模式**：

`assertProgressWiringClean` 同时断言 **`events.length >= 1`**。若在终态前退订，而本次运行恰好**全部**进度事件都排在 invoke 回复之后到达，则 `events` 为空 → **断言在另一条上变红**。这把一个 flake 换成了另一个 flake，而且更难诊断（错误文本变成"no import progress events observed"，看不出与竞态有关）。

**(b′)：保留订阅，但在终态 dispatch 前停止向控制器投递——事件继续记录。**

```text
(b)  终态前 offImportProgress()      → 竞态消除；events 可能为空 → 新 flake
(b′) 终态前 wiring.stopDispatch()    → 竞态消除；events 照常累积 → 无新 flake
                                       且迟到事件仍留痕（可诊断）
```

(b′) 与 (b) 的**意图完全一致**（都是消除竞态、不容忍、不放宽断言），只是把"断开数据源"换成"断开投递"。`offImportProgress()` 仍保留在 `finally`，语义不变。

**我的建议：(b′)。** 请业主确认——这是对已裁定条目的实现形态调整，我不自行改口径。

若坚持 (b) 字面实现，则必须**同时**处理 `events.length >= 1` 的新风险（例如把该断言移到退订之前求值），否则本棒会用一个新 flake 换掉旧 flake。

## 4. 硬边界

1. **不得放宽 `assertProgressWiringClean`。** 特别是**不得**把 `wireProgress` 改成 `wiringHelper` 那样 `catch {}` 吞掉——[决策 #20](../../决策记录.md) D3 已排除该选项（修法 (a)），理由是它让断言对**一整类真实 dispatch 缺陷失明**。
2. **不得改产品。** 控制器在终态拒绝 `import-progress` 是**正确**行为，不得为让测试变绿而放宽（决策 #20 D3 已排除修法 (c)）。
3. **不得改 `wiringHelper` 的既有语义**（`guards.ts` 依赖它）。
4. **不得用"跑 N 次没红"作为验收证据**——竞态的缺席不是修复的证据（§5 全部要求确定性注入）。

## 5. 验收标准与决定性反例

**四条全部为确定性注入**（在 harness 内直接构造迟到事件，不依赖真实竞态复现）：

| # | 构造 | 期望 |
|---|---|---|
| 1 | 终态 dispatch **之后**注入一个 progress 事件 | 不产生 `dispatchError`；`assertProgressWiringClean` 通过 |
| 2 | 同上，且检查 `wiring.events` | **计数不受影响**（(b′) 下事件仍被记录；(b) 下须证明 `events.length >= 1` 仍成立） |
| 3 | 终态 **之前**注入一个**非法** dispatch（真实缺陷形态） | **必须仍红**——证明修复没有让断言失明 |
| 4 | 正常 happy / partial / cancel 三路径 | 全绿，无过矫正 |
| **5** | **某个使用点"忘记"停止投递**（模拟将来新增子场景时漏调用） | **必须被检出**——见下方「结构性优先」 |

### 结构性优先（反例 5 的两种满足方式，任选其一）

(b′) 若实现为「三个使用点各自记得在终态前调 `stopDispatch()`」，那它就是一条**靠纪律维持的约定**——将来新增第四个子场景时漏调用，竞态原样复活且无人察觉。这与本项目一路坚持的「能静默空转的门不是门」是同一件事。

**首选（结构性）**：让终态 dispatch **经由 wiring 走**（例如 `wiring.dispatchTerminal(event)`：内部先停投递、再转交控制器），使"忘记"在结构上不可能发生。此时反例 5 由类型/接口天然满足，无需额外测试。

**次选（可检出）**：保留三处各自调用，但**补一条决定性测试**证明漏调用会被抓到（例如断言：终态后注入迟到事件时，任一未停投递的使用点必产生 `dispatchError`）。

**不接受**：只改三处调用点、不提供任何防漏机制——那是把本棒的修复寄托在下一个人记得住。

**变异自证**：撤掉修复（恢复终态后仍投递）→ **反例 1 必须变红**，且红在 `dispatchErrors` 相关断言上；反例 3 不受影响。红在别处即探针失效、作废重做。

**回归**：`apps/electron-shell` E2E 六子场景全绿；`pnpm verify` 本地 EXIT=0（直取退出码，不经管道）。

## 6. 承接项处置

本棒**关闭** [A-02-followups #5](A-02-followups.md)——关闭注记须按 PB-12/A-01 先例**就地写入该文件**，并注明两次复发的 run id 作为背景。不得代签其他条目。

## 7. 交付物

- `project-import-shared.ts` 时序改动 + 三个调用点；
- 四条确定性反例的测试 + 变异自证记录；
- `docs/audits/A02F5-implementation-record.md`；
- A-02-followups #5 就地关闭注记；
- **审计报告命名 `A02F5-claude-audit.md`**（刻意不用 `-claude-audit-report.md` 后缀——本棒无 §3.1 台账行，用该后缀会让[检查 8a](../../tools/quality/src/roadmap-checks-evidence.ts) 硬失败；CI-01 已踩同一形态）；
- PR（**挂起不合**）+ CI 全绿。

## 8. 流程纪律

PR 挂起 → 独立审计 → 修复 → 复审 → 合并。**审计报告随 PR 落盘**。**本棒无台账行**，合并后用 `main` squash SHA 记于实施记录。**开工前按[双向审查](../../AGENTS.md)逐条复验本任务书的机制性断言**（尤其 §0 那段主进程发送时序——我核过，但请你们独立再核一遍）。

## 9. 独立审计的猎杀方向（预告）

1. **断言有没有被放宽**（第一个查）——`assertProgressWiringClean` 两条断言原样；`wireProgress` 的 catch 未被改成吞掉。
2. **反例 3 是不是真的**——自建一个终态前的真实非法 dispatch，必须仍红；这是"修复没有换来失明"的唯一证据。
3. **产品零改动**——`import-flow.ts` 与 `project-channels.cjs` 的 `git diff` 必须为空。
4. **`wiringHelper` 语义未变**——`guards.ts` 路径不受影响。
5. **验收不是靠"没复现"**——检查四条反例是否都是确定性注入。
6. **`events.length >= 1` 的新风险**（若取 (b) 字面实现）——核它是否被真正处理，而非碰巧没触发。

---

*本任务书由独立审计角色起草，只归集既有权威来源与实测机制并标出待裁定点，不构成实施。*
