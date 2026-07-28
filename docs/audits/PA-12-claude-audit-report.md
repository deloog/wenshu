# PA-12 汇总闸门（validator runner + 门禁报告契约 + 12 fault + 人工清单）· Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #22 分支 `pa-12-gate` tip `0ffa81c`（feat 主体 `c2787dd`）；base `origin/main`
> 远程验证：run `30380359440`、`30380684062` 均 **8/8 pass**（ubuntu-24.04）
> 审计方法：**本地亲手伪造 5 种谎报验证闸门不可做假 + 锚定分支指纹逐位比对 + 闸门实跑 + 14 承接项逐项核**；探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PA-12 通过,可合并 PR #22,放行 PA-13/15。** 无 BLOCKER/MAJOR/MINOR。这是 PoC-A 核心闸门,诚实性架构是我审到现在最扎实的一棒。

- **闸门做不了假(命门)**:我亲手伪造 5 种谎报,reader `validateGateReport` 语义全量重算逐一拒——藏 P0 漏检自报 pass、豁免 P0、manualChecks 充数、选择性跳规则、瞒报误报,全部 REJECT。
- **闸门实跑**:`verdict=pass p0=4/4 detected=12/12 falsePositives=0`,12 fault 逐域全检出。
- **门槛 schema `const` 钉死**(12/10/2),调低须升契约版本;**P0 不可豁免**双防线;**manualChecks 不并入检出统计**。
- **消费不重造**:PA-07~11 规则**零改动**,消费真实 findings/manualChecks 不 mock;冻结物零漂移;零新增第三方依赖。

## 2. 闸门诚实性 · 不可做假（命门,本地亲手伪造验证）

reader `validateGateReport` 不信任何自报数字:结构预算 + 版本前置 + ajv + **`semanticIssues` 语义全量重算**——逐样本 detected 只从 findings 重算(manualChecks 绝不充数)、falsePositives===findings.length、executedRules 必须=全 18 规则−已申报豁免、五计数+verdict+failureCodes 全重算、P0 豁免契约级禁止。我对 runner 真实产出的门禁报告伪造谎报:

| 伪造谎报 | reader 结果 |
|---|---|
| 藏 P0 漏检(清 P0 findings)+ evaluation 自报 pass | **拒** `GATE_REPORT_SEMANTIC@/evaluation/detectedFaults,p0DetectedFaults` |
| 豁免 P0(p0-bounds) | **拒** `@/exemptions/0/ruleId` + `@/executedRules` |
| manualChecks 充数(finding 清空、码塞 manual、自报 detected=true) | **拒** |
| 选择性跳规则(executedRules 删 1 条) | **拒** `@/executedRules` + 相关 findings ruleId |
| 正常样本瞒报误报(加 finding 不改 FP) | **拒** |

**P0 漏检无法被自报 pass 绕过、P0 无法被豁免、人工项无法充数、规则无法被静默跳过、误报无法被瞒报**——这正是路线图"不达门槛不得调低规则/伪装覆盖"红线的契约级落实。

## 3. 闸门实跑与 12 fault（独立复现）

- **validator runner**(`gate-runner.ts`):对每个样本跑 `runP0Checks`+`runP1Checks` 真实产出、确定性排序汇总,产物过自身契约 fail-closed。
- **实测**:`verdict=pass p0=4/4 detected=12/12 fp=0 failures=[]`。
- **12 fault 逐域覆盖、非稻草人**:P0 页尺寸/越界/遮挡(**PA-K1 图遮正文落 PA-07**)/内容 ×4 + P1 标题分离/孤行/寡行/空页/表头未重复/图比例失真/**目录页码(PA-11A 红线)**/页脚页码 ×8;证据层确定性内存派生,锚点缺失即 fail-closed。
- **门槛 schema const**:`faultSampleCount const 12`、`minDetectedFaults const 10`、`maxNormalFalsePositives const 2`——写死在契约,调低必须升 `gateReportVersion`。

## 4. 承接项落地 · 14 项逐项（我的第三首要一刀）

`gate-checklist.ts` 逐项登记 **14 项**:PA-A7、PA-J1、PA-K1、PA-L1~L4、PA-M1~M5、PA-N1、PA-N2,各带 `disposition`(registered/carried/external);**口径正确**:自动检出只计 findings,人工核验项逐项列入报告 samples 的 manualChecks、**不当作已自动覆盖、不并入检出统计**;PA-J1/M1/N2 的 `relatedCount` 由 runner 以正常样本真实 manualChecks 数(**33**)动态填充。承接口径与我历轮报告(PA-J1/K1/L1~L4/M1~M5/N1/N2)一致。

## 5. 锚定终审 · 流程如实记录

我在实施方**未提交前**已本地做过实质验证(闸门不可做假的 5 谎报、12/12、门槛 const、176 套件),但**扣住形式签署**,要求提交到 feature 分支 + CI 绿再终审——因未提交在 main 上无不可变锚点、无 CI。实施方已照此:

- 提交到 `pa-12-gate`(main 工作树未直接提交)、PR #22、CI 两轮 8/8。
- **指纹逐位比对**:提交版 `gate-runner.ts=f652886…`、`validate-gate-report.ts=039c6ea…`、`gate-report.schema.json=0fec926…` 与我本地验证过的**完全一致**——提交版即我审过的那份,实质验证原样成立。
- 锚定分支复跑:闸门基线 `pass 12/12 P0 4/4 FP 0`、闸门测试 **30**(诚实性 7 + 变异 5 + 契约 + 集成)、全套件 **176/176** 全绿。

## 6. 门禁、供应链、冻结

- report-checks **176/176**、闸门 30 测试、决定性变异 5 红(manualChecks 充数/P0 豁免放行/P0 漏检放行/reader detected 重算拆除/executedRules 跳过防线);PR CI **8/8**×2(ubuntu);`pnpm verify` exit 0。
- **PA-07~11 规则零改动**(只新增 gate-* 文件)、消费真实产出禁 mock;**冻结物零漂移**(签署基线/字体/证据契约未动);**零新增第三方运行时依赖**;门禁报告 schema 版本化、生成漂移门禁、诊断只含 code+path 不回显内容。

## 7. 结论与交接

**PA-12 独立审计 PASS。** PoC-A 核心闸门就位——正常样本诚实、12 fault 逐域全检出、P0 不可豁免、闸门契约级不可做假、承接项真落地。合并由业主/Codex 执行。

- 未关闭且不阻断:PA-A7、PA-J1、PA-K1、PA-L1~L4、PA-M1/M3~M5、PA-N1/N2——均已在 PA-12 人工清单逐项登记承接,交 PA-14U 人工执行;PA-M2 已于 PA-11B 关闭。
- **PA-13(性能/重复/取消)、PA-14E/14H(壳复验)、PA-14U(0 号用户)开工前置解除**;PA-15 汇总 PoC-A 闸门报告与通过/降级决定。
- 提醒:PA-14U 人工清单须真实执行 PA-12 checklist 的 14 项人工核验(自动检出只计 findings)。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
