# G2-04 路线图不变量门禁 · 实施记录

> 任务：[任务书 r3](roadmap-invariants-gate-task.md)（已批准）。实施者：Codex。分支：`agent/g2-04-roadmap-invariants`（自 `7ff2fa3` 创建）。
> 运行时：Node `v24.17.0`（`D:\Applications\Node\node-v24.17.0-win-x64`）、pnpm `11.15.1`（D 盘 Corepack shim），按 [开发环境基线](../development-environment.md) 初始化；未使用 C 盘 Node 24.13.0。

## 1. 交付物

| 交付物 | 位置 |
|---|---|
| 不变量检查器（解析/检查/报告分模块） | `tools/quality/src/roadmap-markdown.ts`、`roadmap-model.ts`、`roadmap-parse.ts`、`roadmap-checks-structure.ts`（1a/1b/1c/2/3）、`roadmap-checks-consistency.ts`（4/5/6/7）、`roadmap-checks-evidence.ts`（8a/8b/8c）、`roadmap-invariants.ts` |
| 例外登记表（单一手写真源） | `tools/quality/src/roadmap-registry.ts`（已批准偏离 1 条、8a 例外 11 条、8b 豁免 6 条、历史波次 W1、计数下限六项） |
| 测试 | `tools/quality/test/roadmap-parse.unit.test.ts`（7）、`roadmap-checks.unit.test.ts`（10）、`roadmap-invariants.integration.test.ts`（1）、反例矩阵两文件（29 条）+ 镜像工作树助手 `roadmap-mirror.ts` |
| 接入 | `tools/quality/scripts/check-repository.ts`（经 `pnpm quality:check` 进入 `pnpm verify` 与 CI `static` job，未新增 job、未改矩阵结构） |
| 路线图修正与声明 | `docs/implementation-roadmap.md` v1.4 → v1.5 |
| ADR | [ADR-0024](../adr/0024-G2-04路线图手写真源收敛与不变量门禁.md) |

零新增第三方依赖（复用现成 `typescript` devDependency 与 Node 内建，未引入 markdown 解析库）。

## 2. 修复前红状态（留证：31 处违反全部暴露，8a 先在 G2-03 身上失败）

检查器接入后、路线图修正前的完整输出存于 `tmp/g204-red-before-fix.txt`（本机证据，非项目真源）。要点：

- 解析计数：任务 77 / 依赖边 238 / `R-*` 18 / 台账 49 / §3 边 23 / §9 组 12，全部贴下限，未解析行 0。
- findings 共 30 条，与任务书 §2.3 枚举逐一对应：检查 5 三条（`G1-07→G1-10`、`G1-03C→G1-08`、`PB-06→PB-09`）、检查 6 五条（W2×3、W3×1、W5×1）、检查 7 四条、8a 一条（`G2-03`）、8b 十七条（行号 84~105 与任务书 §5.4 名单一致）。
- 第 31 处（检查 3，`PA-15` ✅ 依赖 ⏸ `PA-14U`）经已批准偏离登记表关闭，非文档编辑。
- 检查器未暴露 §2.3 之外的任何新违反（停止条件未触发）。

## 3. 31 处违反的关闭方式

| 违反 | 处置 |
|---|---|
| 检查 3 ×1（`PA-15`/`PA-14U`） | 登记表 `approvedDeviations` 显式登记（决策 C / PA-15 闸门报告），未登记的不单调一律失败 |
| 检查 5 ×3 | 只改 §3 ASCII（派生对象）：契约主干 `G1-04 → G1-07；G1-05 → G1-10`、真实验证主干 `G1-03 → G1-03C → G1-11；G1-03 → G1-08 → G1-11`、PoC-B `…PB-06 → PB-12；PB-03 → PB-07 → PB-08 → PB-09 → PB-12`，逐边有传递依赖依据；未生成任何新链 |
| 检查 6 ×5 | 只改 §9（派生对象）：W2 拆为 `G1-10/12/15；G1-13/14（待 G1-10 冻结后）；G1-14W（待 G1-14 完成后）`，W3 拆出 `PA-14U（待 PA-13 完成后）`，W5 拆出 `A-10X（待 A-09 完成后）`；W1 登记历史组豁免未改写 |
| 检查 7 ×4 | 只改消费者列（派生对象）：`G1-03C` 去掉 `G1-08`、`G1-06` 去掉 `G1-09`、`A-01` 去掉 `A-07P`、`A-02D` 去掉 `A-03`；26 处传递下游声明保持合法 |
| 8a ×1 | 补 `G2-03` 台账条目（追加于台账末尾，未重排既有 49 行），含自身审计报告链接、PR #41（`13e84da`）、ADR-0023 |
| 8b ×17 | 17 行纯追加链接，未改行内既有文字：G1-04/05/06 → 合并报告 `G1-03-to-G1-06`；G1-07/08/09/10/13/14/14W/15、G2-01/02、PA-00/01/04 → 各自报告；G1-11 → `G1-11-ci` + `G1-11-isolation-gates` 两轮报告 |

另写入：§9 W1 历史组说明与"此后新增波次须可判定格式"、§10"编辑性覆盖摘要"声明、§11 三类权威手写源与四类派生校验对象语义、版本 1.5 变更注记。

## 4. 解析计数（修复后，验收口径）

`pnpm quality:check` 每次运行均输出：

```text
Roadmap invariants: 任务数 77(下限 77)，依赖边数 238(下限 238)，R-* 定义数 18(下限 18)，台账条目数 50(下限 49)，§3 边数 27(下限 23)，§9 并行组数 13(下限 12)；未解析行 0
```

台账 49→50（补 `G2-03`）、§3 边 23→27、§9 组 12→13，均为允许的向上增长；任务、依赖边、`R-*` 不变。

## 5. 29 条反例逐条独立复跑

方法：每条在**真实路线图的独立副本**上构造（`roadmap-mirror.ts` 生成镜像工作树：真实文件、真实目录列举、真实链接解析，未 mock 文件读取或解析），经检查器真实入口 `checkRoadmapInvariants` 独立复跑。完整输出：`tmp/g204-counterexamples-negative.txt`（18 条）、`tmp/g204-counterexamples-reverse.txt`（11 条 + 汇总）。汇总：`pass 30 / fail 0`。

负向 18 条全部观察到失败且失败信息指出违规位置与规则：

| # | 构造 | 观察到的规则码（摘要） |
|---|---|---|
| 1 | PB-02 依赖列加 PB-12 造成环 | `roadmap-dependency-cycle`（PB-02 → PB-12 → … → PB-02） |
| 2 | PB-08 改 ⏸ 不登记偏离 | `roadmap-status-nonmonotonic`（PB-09 / PB-08） |
| 4 | 登记表删 PA-15 偏离 | `roadmap-status-nonmonotonic`（PA-15 / PA-14U） |
| 5 | 标注 R-FAKE | `roadmap-requirement-undefined` |
| 6 | 删 R-PERF 的 §10 出现 | `roadmap-requirement-uncovered` |
| 8 | §3 加 A-16 → PB-12 | `roadmap-critical-edge-unfounded` |
| 10 | §9 组加 PA-06（PA-07 的直接依赖） | `roadmap-wave-dependency-conflict` |
| 12 | §10 引用 PB-99 | `roadmap-id-unknown`（§10 矩阵） |
| 13 | PA-06 消费者加 G1-03（上游，非下游） | `roadmap-consumer-unfounded` |
| 15 | 新增 G3-99 报告无台账条目 | `roadmap-audit-report-without-ledger` |
| 17 | G1-03 行链接指向不存在文件 | `roadmap-ledger-broken-link` |
| 18 | 破坏 §4 表格格式 | `roadmap-count-floor`（任务数 58 < 77，**未静默通过**） |
| 20 | 依赖列写 PB-O9（字母 O） | `roadmap-id-suspicious`（未被静默丢弃；依赖边 237 < 238 同时报出） |
| 21 | 依赖列写 PB-19 | `roadmap-id-unknown`（依赖列） |
| 22 | 重复 G1-01 行 | `roadmap-id-duplicate` |
| 24 | §3/§9/§10/消费者列/台账各一个不存在 ID | `roadmap-id-unknown` ×5（五个位置逐条定位） |
| 25 | 删 PA-07 行报告链接 | `roadmap-ledger-missing-report-link`（PA-07） |
| 28 | 豁免表删 G1-12 | `roadmap-ledger-missing-report-link`（G1-12，豁免确在起作用） |

反向 11 条全部观察到**通过**：3（PA-15/PA-14U 已登记偏离）、7（R-* 标注现状）、9（§3 仅传递依赖边 `G1-11 → PA-01`，零发现）、11（W1 历史组）、14（26 处传递下游消费者）、16（11 条例外报告）、19（新增 G3-03 任务+台账条目+报告，计数 78/241/51 向上增长零发现）、23（8 个散文类 ID token 无一被 1c 误报，逐一断言真实存在）、26（G1-04 → 合并报告别名；反证：抽掉别名映射后同一行必失败）、27（6 行豁免且逐一断言确无报告文件）、29（3 份非任务报告未被任何台账行链接，零发现）。

> 反例 13 初版误选 `PB-12` 作为"不存在的下游"——经 PoC-A→PoC-B 依赖链它确是 PA-06 的传递下游，复跑零发现暴露了选材错误；改选真上游 `G1-03` 后按预期失败。记录在此：反向语义（子集判定）本身是正确的。
> 实施期解析器两处强化（均由反例思维驱动）：① ID 扫描补词边界——`MA-01`（G2-03 台账行散文）先前会被吞成 `A-01`；② §9 组判定剥离全角括号注记——时序注记"（待 G1-10 冻结后）"内的 ID 不计入组成员，已写入口径并有单元测试。

## 6. 验证结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 单元 | `pnpm test:unit` | 270/270 pass（含本任务 17 条新增） |
| 分层 | `pnpm test:layers` | 99 文件分类通过 |
| 集成（本任务） | `node --test tools/quality/test/roadmap-invariants.integration.test.ts` + 反例两文件 | 31/31 pass |
| 质量门禁 | `pnpm quality:check` | 通过；计数行如 §4；`roadmap-parse.ts` 经拆分后 299 行未触发预警（`roadmap-markdown.ts` 拆出） |
| 类型 | `pnpm typecheck` | 通过，零 error |
| Lint | `pnpm lint` | 通过 |
| 格式 | `pnpm format:check` | 通过 |
| 全量 | `pnpm verify` | 见 §8（本次提交前最终运行） |

## 7. 未执行项与边界

- `pnpm test:integration` 全层：`probes/pb-07-yjs`、`probes/pb-08-sqlite` 两个既有探针测试在本工作树失败（probes 不在 pnpm workspace，本地依赖未安装；`pnpm verify` 与 CI 矩阵均不含 integration 层，基线 `7ff2fa3` 同样如此）。与本任务无关，未处置。本任务三个 integration 测试文件已逐文件单独运行通过（31/31）。
- CI 远程矩阵：推送后观察（实施记录将按实际 run 更新）。
- 任务书"31 处"口径：30 处文档/登记修正 + 1 处（检查 3）经已批准偏离登记表关闭；任务书 §2.3 自枚举与之吻合。

## 8. 提交与推送

- 提交边界：检查器与登记表、路线图修正、ADR 与实施记录各自独立提交，可单独回退（任务书 §9）。
- 推送前置：`pnpm verify` 全绿（结果见上表末行）；推送后 CI `static` job 须 8/8。
