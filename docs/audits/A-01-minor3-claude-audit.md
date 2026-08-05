# A-01 契约加固（MINOR-3）Claude 独立审计报告

> 审计对象：分支 `a-01-minor3-remediation` 头 `d1f6723`，PR #56 未合入（`main` = `95b8e18`）。
> 归口：[A-01-followups #5](A-01-followups.md)　实施证据：[A-01-minor3-remediation](A-01-minor3-remediation.md)　任务书：Claude 起草（2026-08-05）
> 起草者声明：本棒任务书由我以独立审计角色起草（只归集既有权威来源、标出待裁定点，不构成实施），实施由 Codex 完成，故我仍可担任本棒独立审计——与 A-02 同款约定。
> 审计环境：Win10 `wenshu-dev-primary`，Node **v24.13.0**（≠ 参考机器登记的 24.17.0，存量登记项，归口 G1-14）。
>
> **文件命名说明**：本报告**刻意不使用** `-claude-audit-report.md` 后缀。检查 8a（[roadmap-checks-evidence.ts:15](../../tools/quality/src/roadmap-checks-evidence.ts#L15) `REPORT_SUFFIX`）会要求该后缀文件的任务标识在 §3.1 台账中有条目，而 `A-01-minor3` 是承接项 remediation、**不新增路线图任务 ID**。后续请勿把本文件改名为该后缀，否则 8a 将硬失败。

## 1. 结论

**PASS。** 无 BLOCKER、无 MAJOR。任务书 §4 的验收标准全部达成，且关键结论均由我自建变异独立复现，未采信实施者自述。

新增一条 **MINOR-5**（残留，不阻断本棒），只影响 A-01-followups #5 限制句的**解除措辞**，见 §5。

## 2. 我独立坐实的部分

### 2.1 硬边界（任务书 §3）

| 边界 | 核验方式 | 结果 |
|---|---|---|
| 冻结数据零字节改动 | `git diff main...HEAD -- states-1.0.0.json` | **空**，未改 |
| 改动面 | `git diff main...HEAD --stat` | 3 文件、**+309 行纯增、0 删除**，无生产代码 |
| 钉定只落契约层 | `git diff -- apps/` + 全仓 grep 钉定字面量 | 消费者零触碰；字面量**只出现在** `ux-states.contract.test.ts` 一处 |
| 钉的是写死字面量 | 读码 [ux-states.contract.test.ts:186-281](../../packages/ux-state/test/ux-states.contract.test.ts#L186-L281) | 单一 `pinned` 字面量表比对 `listUxStates()` 加载值，**非 `deepEqual(loaded, loaded)` 自比**；`Object.keys(pinned).length === 12` 钉住表自身规模 |

### 2.2 自建变异矩阵（9 格，按 JSON 路径结构化注入，非字符串手术）

方法：解析 JSON → 按路径改值 → 落盘 → 跑 ux-state 三个测试文件 → **记录是哪个测试变红** → `git checkout` 还原。基线 exit=0、无失败。

| # | 变异 | 结果 |
|---|---|---|
| 1 | `importing.rp[4]` 「原文件只读」→「原x文件只读」（MINOR-3 原变异复刻） | 红，**精确命中新钉定测试** |
| 2 | `empty-project.label` + x | 红，命中 |
| 3 | `save-result.a11y.textEquivalent` + x | 红，命中 |
| 4 | `pre-export.a11y.focusEntry` + x | 红，命中 |
| 5 | `ai-processing.cancelable` true→false | 红，命中 |
| 6 | `page-issues.rp` **顺序逆序**（集合不变） | 红，命中——顺序确实被钉 |
| 7 | `crash-recovery.rp[0]` + x（预锚定胞） | 红，**同时**命中新钉定测试与既有 `pinned content: crash-recovery` |
| 8 | **删除** `offline-degraded` 整条状态 | 红，但**未命中钉定测试**——见 §3 |
| 9 | **删除** `importing` 整条状态 | 同上 |

五条以上、含任务书点名的「原文件只读」，全部因正确原因变红。

### 2.3 反向证据（防止钉成恒真）

把 `assert.equal(state.label, pin.l)` 改成 `assert.equal(state.label, state.label)`，再打变异 #2：**24/24 转绿**。证明钉定比对的是写死字面量，而非同源自比。（我自建，与实施者的 24/24 独立同结论。）

### 2.4 基线表复核（不采信测试名，两侧各抽样）

把测试文件退回 `main`（改动前），保留 HEAD 的 JSON，逐格实测：

```text
empty-project.rp[0]        声称=已锚定  实测=已锚定  ✓
crash-recovery.rp[0]       声称=已锚定  实测=已锚定  ✓
save-result.label          声称=缺口    实测=缺口    ✓
pre-export.a11y.focusEntry 声称=缺口    实测=缺口    ✓
ai-processing.cancelable   声称=缺口    实测=缺口    ✓
ai-result.rp[1]            声称=缺口    实测=缺口    ✓
page-issues.a11y.textEq    声称=缺口    实测=缺口    ✓
offline-degraded.label     声称=缺口    实测=缺口    ✓
```

**8/8 与任务书 / 证据文档口径一致**，58 缺口 + 2 预锚定胞的划分成立。

### 2.5 计数口径核对（防止两处自述打架）

证据文档 §4 写「3 格同时在既有钉定断言变红」，交棒消息写「2 格预锚定胞」——**两者都对**：预锚定**胞**为 2 个（`empty-project.rp`、`crash-recovery.rp`），而矩阵**行**为 3 行（第 61 行是对 `empty-project.rp` 的第二次变异）。非矛盾，登记以免复审重提。

## 3. 一处归因澄清：删除态不是钉定测试抓的

变异 #8/#9 红了，但失败是**整个测试文件在模块加载期抛错**：

```text
Error: Frozen ux states 1.0.0 failed self-validation: UX_STATE_SCHEMA@/states
    at loadFrozenStates (packages/ux-state/src/index.ts:118)
```

即删除状态由**契约入口的 Ajv 自校验 fail-closed**拦下，不是钉定测试。原因是钉定测试的论域是 `listUxStates()` 返回的**已加载状态集**，结构上看不见"少了一条"。这不是缺陷（schema 层的拦截更早也更强，且我实测它确实抛），但**归因必须写清楚**：不能宣称"钉定测试覆盖了条目缺失"。

## 4. 门禁与回归（我复跑）

| 项 | 结果 |
|---|---|
| `pnpm quality:check`（含 file-size） | 通过；`ux-states.contract.test.ts` **478 行**，仅触发 300 行 WARN，距 500 硬顶 22 行 |
| 检查 8a 豁免声称 | **属实**——8a 只扫 `-claude-audit-report.md` 后缀文件，remediation 文档天然不在其论域 |
| `test:unit` | 327/327 |
| `test:contract` | 256/256（较 A-02 签署时 +2：MINOR-2 测试 +1、本棒钉定测试 +1，账对得上） |
| ux-state 套件 | 41/41（40 + 1） |
| prettier（三改动文件） | 全过 |
| 远程 CI run `30974009925` 9/9 | **未独立核验**——远程 run 在我的能力边界外，只转述不背书（自 PB-12 起口径不变） |

## 5. MINOR-5（新增，小，不阻断本棒）：`transitions` 内容仍未锚定

实测：把 `importing.transitions` 里的 `crash-recovery` 删掉，**41/41 全绿**。

```text
before: ["import-partial","ai-processing","permission-denied","crash-recovery"]
after : ["import-partial","ai-processing","permission-denied"]   -> 41/41 pass
```

现有图论测试只保证**闭合、无自环、可达**：新增悬空目标会被 `UX_STATE_TRANSITION_DANGLING` 拦下，但**删边只在破坏可达性时才被发现**——本例中 `crash-recovery` 仍可经 `ai-processing`/`pagination` 到达，于是静默通过。也就是说，冻结状态机的**边集**可以被静默收窄。

这与 MINOR-3 属同一类，但**在我起草的任务书范围之外**（§2 范围只列 5 个用户可见字段），故不判本棒失败。它的实际影响只有一个，但很重要：

> **A-01-followups #5 限制句解除时，措辞必须写明覆盖范围 = 12 态 × 5 个用户可见字段，并显式排除 `transitions` 边集。** 不得笼统写成"1.0.0 防静默改写已机械化全覆盖"——那句话在今天仍然不成立。

另注：schema 全层 `additionalProperties: false`，所以就**字段维度**而言，5 字段 + 既有 `forbiddenSemantics` + 结构字段（`uxSpecRow`/`evidenceSource` 各有既有钉）确实构成用户可见内容的全集——缺的是 `transitions` 这一**关系维度**。

## 6. 签署与后续

**签署 `PASS`。** 交棒清单：

1. **解除 A-01-followups #5 限制句**，按 §5 的措辞要求（12 态 × 5 字段，显式排除 `transitions`）；
2. **登记 MINOR-5** 为新承接项（建议同归口 A-01 契约加固，与 #5 同批处理或单独排期，由业主裁定）；
3. 业主合并裁定；合并后按 [AGENTS 台账证据指纹规则](../../AGENTS.md) 用 `main` 上的 squash SHA（**不写分支侧 SHA**）。

---

*本报告由独立审计角色出具。审计期间仅新增本文件；全部变异（自建 9 格 + 反向证据 + 基线抽样 8 格 + `transitions` 探针）均已还原，`git status` 干净。*
