# PoC-A → PoC-B 链条完整性 · Claude 独立审计说明

> 审计者：Claude（独立只读审计）　日期：2026-07-30
> 触发：业主询问「PA-15 是"建议 DEGRADE、等待业主批准",而 PB-01 依赖写"PA-15 通过",PB-01~09 已全部合并,链条似乎不完整」。
> 范围：只追证既有 PA-15 闸门报告 / engine-reassessment / incremental-pagination 报告 / `决策记录.md` / `docs/implementation-roadmap.md` / PB-01~09 合并事实;不改冻结物,不动路线图与台账(按 CLAUDE.md,那属 Codex/业主)。
> 写入边界：本轮仅新增本说明;GitHub 只读。

---

## 1. 结论

**实质成立,记录有缺口。** PB-01~09 建于**被授权的范围**内,产物与历轮签署**无需返工**;但**决策链的正式记录有两处缺口**,业主的直觉正确。

- **定级:MAJOR(治理/可追溯性),非代码 BLOCKER。** 缺的是把"已经发生并有据的决定"补录成账,不是推翻已建工作。
- **两处缺口(见 §4)**:①`决策记录.md` 缺"业主批准 DEGRADE + 授权 PoC-B 非排版先行"这条上游决策;②路线图 PB-01 依赖字面 "`PA-15通过`" 与 PA-15 的实际结论 **DEGRADE** 不符、易被误读为"PoC-A 通过",且 PA-15 行无 DEGRADE/批准状态标记。
- **处置**:由 Codex 补录台账条目 + 修正路线图表述,再由 Claude 独立复核关闭(见 §5)。

## 2. 我查证了什么

| 证据 | 定位 | 内容 |
|---|---|---|
| PA-15 闸门报告 | `docs/audits/PA-15-poc-a-final-gate-report.md` | 状态"**建议 DEGRADE;等待业主最终批准**";DEGRADE = 停 PB/Alpha 对**当前 Chromium 排版路径**依赖 + 启动轻排版重审 + 首评 Typst 出口 |
| PA-15 Claude 审计 | `docs/audits/PA-15-claude-audit-report.md` | **PASS(闸门报告诚实、DEGRADE 证成)**;明确"最终通过/降级由**业主**批准",非实施方/审计者 |
| 引擎重评 | `docs/audits/engine-reassessment-claude-audit-report.md` | **PASS**;Typst 快 100× 但 **10/10 被检查器拒**、不合规 → **维持 DEGRADE、暂无解**,不假"Typst 救场" |
| 增量分页 | `docs/audits/incremental-pagination-claude-audit-report.md`（ADR-0014,PR #28） | **PASS**;授权选项①"接受 ADR-0014 → **PoC-B 非排版部分(编辑事务/本地库)可先行**,增量分页作 PB/Alpha 待建架构要求";且"**DEGRADE 关于全量的结论仍成立、不被追认**" |
| 决策记录 | `决策记录.md` | 条目 #1–#12;#11=30页样本、**#12=批准 ProseMirror 进 PB-02**;**无"DEGRADE 批准 / PoC-B 开工授权"独立条目** |
| 路线图 | `docs/implementation-roadmap.md` | 154 行 PB-01 依赖 "`G1-15/16, PA-15通过`";148 行 PA-15 FAIL="失败即停止 PB/Alpha **排版依赖**并启动轻排版重审";69 行"PoC-A 失败…不得继续用 PoC-B/Alpha 功能**掩盖排版失败**" |
| 合并事实 | PR #29~#39 | PB-01~09 全部合并入 main |

## 3. 实质为何成立（PB-01~09 无需返工）

1. **DEGRADE 的作用域是"排版路径",不是整个 PoC-B。** 闸门报告、PA-15 审计、路线图 148 行 FAIL 三处一致:DEGRADE 停的是"PB/Alpha 对**当前 Chromium 排版(分页)路径**的依赖"。
2. **PB-01~09 恰是"非排版部分"。** 语义内核选型 / 稳定 ID 操作 / 统一事务 / 模型写边界 / 可定位 diff / 审计契约冻结 / 语义审计事件 / CRDT 探针 / 存储选型 / 版本化迁移——无一触及 Chromium 排版/分页路径。
3. **有据授权,且我已审过那道桥。** 增量分页报告(ADR-0014,我签 PASS)明确授权"PoC-B 非排版部分可先行";引擎重评(我签 PASS)确认"维持 DEGRADE、无解不假 PASS"。
4. **未掩盖排版失败(符合路线图 69 行)。** 增量分页报告写明"DEGRADE 关于全量的结论仍成立、**不被追认**",全量 24.300s `not_met` 作为**已登记的独立限制**保留——PoC-B 推进没有 paper over 排版 DEGRADE。
5. **部分留痕存在。** `决策记录.md #12`(ProseMirror 进 PB-02)间接印证 PoC-B 已被放行;对话中业主亦口头批准 DEGRADE 与该路径。

**故:PB-01~09 在授权范围内、逻辑自洽,产物与历轮独立签署成立,无需返工。**

## 4. 两处记录缺口（findings）

### 缺口 A（MAJOR）· 台账缺上游决策条目

`决策记录.md` 从 #11(30 页样本)直接跳到 #12(ProseMirror 进 PB-02),**中间缺一条**记录:业主批准 **PA-15 DEGRADE** + 接受 **ADR-0014**(增量分页登记为 PB/Alpha 待建能力、全量 `not_met` 仍立)+ **授权 PoC-B 非排版部分先行**。#12 只是 PoC-B 内部选型批准,不能替代其上游的开工闸门留痕。对一个以"决策留痕/证据文化"立项的项目,这是实质可追溯性缺口——**决定有据且已发生,但没有落到台账**。

### 缺口 B（MINOR–MAJOR）· 路线图表述误导

- `docs/implementation-roadmap.md:154` PB-01 依赖字面 "`PA-15通过`"。PA-15 的实际结论是 **DEGRADE(降级)不是通过**;"PA-15通过"若被读成"PoC-A 通过"即**误导**。应改为准确表述,如 "`PA-15 DEGRADE 裁定 + 业主批准 PoC-B 非排版先行(见决策 #N)`"。
- `docs/implementation-roadmap.md:148` PA-15 行**无状态标记**反映"DEGRADE + 业主批准";建议补 ✅DEGRADE(业主批准 <日期>)并链接决策条目。

## 5. 建议补录与复核方式

按 CLAUDE.md,路线图与台账由 **Codex/业主**维护,我不自行修改。建议:

1. **Codex 补台账条目**(新编号,日期 2026-07-29,置于 #11 与 #12 之间的时序):记业主批准 DEGRADE(停 Chromium 排版路径依赖 + 轻排版重审、首评 Typst 出口)+ 接受 ADR-0014 + 授权 PoC-B 非排版部分先行;**引用** PA-15 闸门报告 / engine-reassessment / incremental-pagination(ADR-0014)。
2. **Codex 修路线图**:PB-01 依赖 "`PA-15通过`" → 准确表述并引用上条决策;PA-15 行补 DEGRADE + 业主批准状态标记。
3. **Claude 复核关闭**:补录后我核对台账条目引用与 §2 证据一致、路线图表述与 DEGRADE 实际结论一致,再在本说明追加"缺口已闭合"。

## 6. 结论与交接

**PoC-A → PoC-B 链条:实质授权成立(PB-01~09 无需返工),形式记录有缺口(台账缺上游 DEGRADE/授权决策、路线图 PB-01 依赖表述误导)。** 这是治理/可追溯性 MAJOR,非代码阻断。

- 待 Codex 补录台账 + 修路线图,Claude 复核关闭;关闭前 PB-10 可暂缓(业主定)。
- 本说明本身即为该缺口的审计留痕:查证经过、什么成立、什么缺、如何补,均已入 main。

按 CLAUDE.md,本说明由审计者给出结论;台账与路线图修订由 Codex/业主执行;实施者不自行关闭发现;补录后由 Claude 复核关闭。

---

## 7. 复核关闭（2026-07-30）· 缺口 A/B 已闭合

- **补录基线**:PR #40 分支 `agent/poc-chain-record`(`3230098`,CI 8/8);净增量仅 `决策记录.md`(+19)+ `docs/implementation-roadmap.md`(4 行),**未夹带**未跟踪的分层门禁草案。
- **缺口 A 闭合(台账)**:新增 **决策 #11A**(日期 2026-07-29,2026-07-30 补录,置于 #11 与 #12 之间)——业主批准 DEGRADE、**明写 30 页分页 p95 24.300s/8s 仍 `not_met`、不得判通过或放宽预算**;仅在"不接入/不追认 Chromium 排版路径"边界内授权 PoC-B 非排版部分(编辑事务/diff/审计/CRDT 探针/本地库)先行;增量分页仍列 PB/Alpha 待建;**该授权不改 not_met 结论、不授权排版依赖/指标变更/降质**;依据链接 PA-15 闸门报告 / 引擎重评 / 增量分页(ADR-0014)三份齐全。与 §2 证据、§3 判定逐条一致。
- **缺口 B 闭合(路线图)**:PA-15 行补"状态:DEGRADE(业主已批准,见决策 #11A)"+ FAIL 列写实 `not_met`;PB-01 依赖 "`PA-15通过`" → "`PA-15 DEGRADE 裁定 + 业主批准非排版 PoC-B 先行(决策 #11A)`",并增"不得以 PoC-B 掩盖或追认 Chromium 排版 `not_met`"。误导表述已消除。
- **诚实性核**:补录**保留 not_met、不追认全量分页**,未 paper over 排版失败(符合路线图 69 行);无冻结物/预算改动。
- **结论:PoC-A→PoC-B 链条完整性 MAJOR 已复核关闭。** 补录内容准确、充分、诚实;**PR #40 可合并**,合并后缺口正式闭合于 main。PB-10 前置已无遗留。
