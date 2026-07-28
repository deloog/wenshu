# PA-12 实施记录 · PoC-A 汇总闸门（validator runner + 门禁报告契约 + 12 fault 样本 + 人工清单）

- 任务：PA-12（路线图 PA-12 行：汇总正常样本与 12 个故障样本门禁；R-PDF/R-TEST）
- 日期：2026-07-28
- 包：`@wenshu/report-checks`（唯一改动包；零新增第三方运行时依赖）
- 设计：[ADR-0012](../adr/0012-PA-12汇总闸门报告契约与门槛诚实性口径.md)
- 状态：已实现，待独立审计

## 1. 交付物

### 1.1 validator runner（消费不重造、确定性、fail-closed）

- `gate-runner.ts`（151 行）：`runGate(input, options?)` 对每个样本跑
  PA-07~11 全检查族——`runP0Checks` + `runP1Checks` **真实产出**（不重
  实现任何检查、不 mock 证据/产出），合并 findings 确定性排序
  （ruleId → pageIndex → nodeRef），汇总 manualChecks（仅 P1 域），
  产出版本化门禁报告并过自身契约（违反即 `GATE_INTERNAL` fail-closed）。
- `gate-input.ts`（73 行）：`GateInput`/`GateSampleInput`/`GateExemption`/
  `GateFaultSpec` 类型；豁免 `ruleId` 类型级限定 `P1RuleId`。
- 豁免校验（`validateExemptions`）：任何 P0 豁免尝试抛
  `GATE_P0_EXEMPTION_REJECTED`（不产报告）；未知规则 id 抛
  `REPORT_CHECKS_UNKNOWN_RULE`。P1 豁免 = 复用 PA-07 已审计的单规则
  禁用机制（规则从 `executedRules` 缺席），理由逐条记入报告。

### 1.2 门禁报告 schema（版本化 1.0.0，独占）

- `schema/gate-report.schema.json` + 生成类型 `src/generated/gate-report.ts`
  （已登记 `wenshu.generatedFiles`，漂移门禁覆盖）。结构：
  `gateReportVersion`/`source.baselineSha256`/`thresholds`/**executedRules**/
  `samples[]`（Normal|Fault 判别联合）/`evaluation`/`exemptions[]`/
  `manualChecklist[]`。
- **门槛常量 schema 级 `const` 钉死**（faultSampleCount=12、
  minDetectedFaults=10、maxNormalFalsePositives=2）：调低门槛必须升契
  约版本，生成类型同步字面量钉死。
- `validate-gate-report.ts`（193 行）reader：contract-runtime 结构预算
  + 版本前置 + ajv + **语义全量重算（不信任何自报数字）**——逐样本
  `detected`（只从 findings 重算，manualChecks 不充数）与
  `falsePositives`（=== findings.length，误报不可隐藏/重分类）、
  `evaluation` 五计数 + `p0DetectionRate` + `verdict`/`failureCodes`
  全量重算、`executedRules` 必须 ===「全 18 规则 − 已申报豁免」
  （防选择性跳过/伪装覆盖）、样本 findings/manualChecks 的 ruleId 必须
  属于已执行规则集、豁免不得含 P0。诊断只含 code+path，不回显内容。

### 1.3 12 fault 样本（真实缺陷、逐域覆盖、确定性派生）

- `gate-faults.ts` + `gate-faults-p0.ts` + `gate-faults-p1-layout.ts` +
  `gate-faults-p1-objects.ts` + `gate-faults-helpers.ts`：固定序目录，
  自签署基线（sha256 锚定 `5d7c06bc…0828`）`structuredClone` 内存派
  生，冻结物零漂移；锚点全部来自真实归属/表格/压印单源分析，缺失即
  `GATE_FAULT_ANCHOR` fail-closed。
- 覆盖（每域恰好一例，不挑软柿子、不重复充数）：

| 样本 | 域 | 注入缺陷 | 期望检出 |
|---|---|---|---|
| fault-p0-page-size | P0 尺寸 | p3 页宽 700pt | P0_PAGE_SIZE@page:3 |
| fault-p0-out-of-bounds | P0 越界 | p2 run 挪出版心右 5pt | P0_OUT_OF_BOUNDS@p2 |
| fault-p0-overlap | P0 遮挡（PA-K1 边界） | 非成员正文 run 整体挪入图 1 绘制框 | P0_OVERLAP↔figure:8:0 |
| fault-p0-content-missing | P0 内容 | 删除唯一段落全部覆盖 run | P0_CONTENT_MISSING@块 |
| fault-p1-heading-separated | P1 标题 | 正文首段移出 p2 | P1_HEADING_SEPARATED@2 |
| fault-p1-orphan | P1 孤行 | 首段仅首行留 p2 | P1_ORPHAN@2 |
| fault-p1-widow | P1 寡行 | 首段末行移 p3 | P1_WIDOW@3 |
| fault-p1-empty-page | P1 留白 | 删 p5 全部内容 | P1_EMPTY_PAGE@5 |
| fault-p1-table-header-not-repeated | P1 表格 | 删跨页表续页 p13 表头副本 | P1_TABLE_HEADER_NOT_REPEATED@13 |
| fault-p1-figure-aspect-distorted | P1 图片 | 图 1 绘制框宽 ×1.15 | P1_FIGURE_ASPECT_DISTORTED@8 |
| fault-p1-toc-page-mismatch | P1 目录页码（PA-11A 边界） | 条目 7 配对标题 p5→p6 | P1_TOC_PAGE_MISMATCH（标 6≠实 7） |
| fault-p1-footer-page-mismatch | P1 页码 | p4 页脚压印 5→6 | P1_FOOTER_PAGE_MISMATCH@4 |

- 与路线图 `docs/poc-a/fixtures/fault-cases.json`（文档级变异描述）的
  映射：F01/F02↔越界/尺寸、F03↔fault-p1-toc-page-mismatch（PA-M2 约
  定由本样本库承接注入化）、F06↔内容缺失、F07↔标题分离、F09↔孤/寡
  行、F11↔表头、F12↔题注/图片域；实现层选型（证据层内存派生）与理
  由见 ADR-0012 §1。

### 1.4 门槛评估（诚实计数，只基于真实 findings）

- `gate-evaluate.ts`（65 行）：`GATE_THRESHOLDS` 常量钉死（12/10/2）；
  逐样本 `detected`（布尔，码级，只计 findings）→ 三量重算 →
  `GATE_P0_MISSED`（P0 未全检出）/`GATE_DETECTION_BELOW_THRESHOLD`
  （<10/12）/`GATE_FALSE_POSITIVE_OVERFLOW`（>2）→ verdict。
- 样本集不全（<12 fault）天然不达标（检出数上界随样本数缩），无法
  靠挑样本/减样本凑过。

### 1.5 人工清单（PA-A7~N2 逐项承接）

- `gate-checklist.ts`（145 行）：14 项静态承接登记（disposition:
  carried/registered/closed/external + 权威台账引用）；PA-J1/M1/N2 的
  `relatedCount` 由 runner 以正常样本**真实** manualChecks 总数（33）
  动态填充。清单显式列出，绝不并入自动检出统计。

### 1.6 可重放审计入口

- `scripts/run-gate-baseline.ts`：签署基线装配 13 样本跑闸门，打印
  verdict/计数，`--out` 落盘完整报告（确定性）；verdict≠pass 退出 1。
  本机实测：`verdict=pass p0=4/4 detected=12/12 falsePositives=0`（产
  出留档 `test-results/pa-12/gate-report.json`）。

## 2. 验收标准对照

| 验收 | 证据（真实执行） |
|---|---|
| ①正常样本 0 自动发现 + 人工清单填充 | gate.integration「acceptance 1」：findings=0、falsePositives=0、manualChecks=33（10+21+2 分通道钉数）、executedRules=18 全规则 |
| ②12 fault P0 全检出、P0+P1≥10/12、每条带定位 | 「acceptance 2」：12/12 detected（P0 4/4=100%），逐样本钉 code@页+nodeRef 前缀+metrics 非空；PA-11A 红线（标 6≠实 7）与 PA-K1（relatedNodeRef=figure:8:0）专项钉 |
| ③门槛评估诚实 | 「acceptance 3」：evaluation 全字段钉定（detected 12/12、rate 1、FP 0、pass）、thresholds 常量钉死、产出过独立 reader 重算零分歧 |
| ④P0 不可豁免 + manualChecks 不充数 + 人工清单 | gate-honesty 7 连：P0 豁免抛 GATE_P0_EXEMPTION_REJECTED、未知规则 fail-closed、P0 漏检 verdict=fail+GATE_P0_MISSED、只降人工 fault detected=false 不充数、污染正常样本 3 误报 GATE_FALSE_POSITIVE_OVERFLOW、P1 豁免记录理由并如实付出检出代价（11/12）、三豁免 9/12 GATE_DETECTION_BELOW_THRESHOLD；「acceptance 4」14 项逐项钉 + J1/M1/N2 relatedCount=33 |
| ⑤契约/确定性/范围 | schema 1.0.0 版本化 + reader 单版本分发；「acceptance 5」两次跑 byte-identical、不回显正文；零 PA-07~11 规则改动（diff 只新增 + check-input 错误码 additive 扩展）；包测试 176/176；typecheck 绿；生成漂移检查绿 |

## 3. 决定性变异（5 连红，`test/pa-12-mutation.unit.test.ts`）

机制同 pa-11b（真实 src 临时副本 + 单点锚定变异 + 动态导入，锚点缺
失/不唯一 fail-closed）：

1. 检出通道混入 manualChecks → 声明 REVIEW 码的对抗样本被冒充检出
   （或被自身契约兜底 GATE_INTERNAL）——红。
2. P0 豁免接受守卫拆除 → 不再以 GATE_P0_EXEMPTION_REJECTED 拦下
   （被契约语义兜底）——红。
3. P0 漏检判定拆除 → GATE_P0_MISSED 从 failureCodes 消失（或被兜
   底）——红。
4. reader detected 重算拆除 → 说谎报告（detected=true、findings 空）
   通过校验——红。
5. reader executedRules 重算拆除 → 选择性跳过规则的报告通过校
   验——红。

## 4. 闸门诚实性防线（四重独立）

1. 码命名空间隔离：`*_REVIEW` 人工码段与自动码不串（PA-08 起冻结）。
2. runner 产出过自身契约（GATE_INTERNAL fail-closed）。
3. reader 语义全量重算（不信自报数字；防说谎/防跳过/防豁免 P0）。
4. 变异测试五连红（CI 逐条 gate）。

## 5. 承接项落地对照（送审复核索引）

| 项 | 落地 |
|---|---|
| PA-A7 | 人工清单 registered（未关闭如实登记，markdown-import 域） |
| PA-J1 | 人工清单 carried + relatedCount=33（正常样本 manualChecks 逐项入报告） |
| PA-K1 | 人工清单 registered（窄巧合不声称覆盖）；图遮正文 fault 落 PA-07 域（fault-p0-overlap） |
| PA-L1 | carried（口径并入 M1=33） |
| PA-L2 | carried（图片域 fault + 图片规则在 executedRules；零重判） |
| PA-L3 | external（需求池，无当前 owner） |
| PA-L4 | registered（归属歧义边界） |
| PA-M1 | carried + relatedCount=33（10+21+2 分通道钉数） |
| PA-M2 | closed（页码 fault 由 fault-p1-toc-page-mismatch 承接） |
| PA-M3/M5 | registered（oracle 排除边界 / normalized sha 确定性口径） |
| PA-M4 | external（VM 环境承接） |
| PA-N1 | registered（toc fault 采用跨页注入保持归属完整） |
| PA-N2 | carried + relatedCount=33（headerText 缺省时须重计的提醒入清单） |

统一口径落实：**自动检出只计 findings，manualChecks 不并入闸门统计**
（契约语义重算强制 + 变异 1 红线）。

## 6. 范围声明

- 只动 `@wenshu/report-checks`：新增 gate-* 模块 + schema + fixtures +
  测试 + 脚本；`check-input.ts` 错误码 additive 扩展（3 个新码）；生
  成器 targets + `wenshu.generatedFiles` 登记。**零 PA-07~11 规则改
  动**、零冻结物改动、零新增第三方依赖。
- 正常误报诚实计数：签署基线 0 自动发现（≤2 门槛未动用）。
- 已知边界（如实登记）：fault 为证据层内存派生，不覆盖「渲染管线产
  出缺陷 PDF」的端到端路径（PA-14E/14H 壳复验域）；fault-cases.json
  文档级 12 例与样本库覆盖域同构、实现层不同（ADR-0012 §1）。

## 7. 检查执行记录（本机，Windows，D 盘 Node 24.17.0/pnpm 11.15.1）

- `node --test test/*.test.ts`：176/176 pass（含 gate 契约 12、集成 6、
  诚实性 7、变异 5）。
- `tsc -p tsconfig.json`：绿。
- `node scripts/check-generated.ts`：绿（生成漂移门禁）。
- `node scripts/run-gate-baseline.ts`：verdict=pass p0=4/4
  detected=12/12 falsePositives=0。
- `pnpm verify`（根全量）：结果见交审前推送附注（本地绿为前提，
  远程 ubuntu CI 8/8 为签署生效条件）。
