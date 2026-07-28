# PA-12 独立审计报告（Claude）· PASS —— PoC-A 核心闸门就位

- 任务：PA-12（PoC-A 汇总闸门：validator runner + 门禁报告契约 v1.0.0 + 12 fault 样本 + 人工清单）
- 审计者：Claude（独立只读审计）
- 日期：2026-07-28
- 结论：**PASS**
- 被审对象：PR #22（分支 `pa-12-gate`）；实施记录 [PA-12-implementation-record](PA-12-implementation-record.md)；设计 [ADR-0012](../adr/0012-PA-12汇总闸门报告契约与门槛诚实性口径.md)

> 本文件为实施方按 Claude 审计结论原文忠实归档；如需替换为 Claude 完整版报告，以审计者版本为准。

## 1. 命门（闸门做不了假）——审计者亲手伪造验证

对 runner 真实产出的门禁报告伪造 5 种谎报，reader `validateGateReport` 语义全量重算逐一拒：

1. 藏 P0 漏检 + 自报 pass → **拒**（重算 detectedFaults/p0DetectedFaults 揭穿）；
2. 豁免 P0 → **拒**（契约级禁止 + executedRules 不符）；
3. manualChecks 充数 → **拒**；
4. 选择性跳规则 → **拒**；
5. 瞒报误报 → **拒**。

reader 不信任何自报数字：detected 只从 findings 重算、executedRules 必须 = 18 − 豁免、verdict/FP/五计数全重算、P0 豁免契约禁止。路线图「不达门槛不得调低规则/伪装覆盖」红线做到了**契约级不可绕过**。审计者评价：「这是我审到现在诚实性最扎实的一棒。」

## 2. 锚定纪律

审计者在实施方未提交前已本地验过实质，但扣住形式签署要求提交分支 + CI；实施方照办后，审计者指纹逐位比对（gate-runner `f652886`、validate-gate-report `039c6ea`、schema `0fec926`）确认提交版 = 审过的那份。锚定分支复跑：pass 12/12、P0 4/4、FP 0；闸门 30 测试；全套件 176/176；CI 两轮 8/8。

## 3. 其余核验

- 12 fault 逐域覆盖（含 PA-K1 图遮正文、PA-11A 页码），非稻草人；
- 门槛 schema const 12/10/2 钉死；
- 14 承接项（PA-A7/J1/K1/L1~L4/M1~M5/N1/N2）逐项 disposition，manualChecks 不并入检出统计；
- PA-07~11 规则零改动、冻结物零漂移、零新增依赖。

## 4. 流程说明（审计者原话）

「这一棒和前 11 棒最大的不同，是它一度未提交堆在 main 工作树、无分支/PR/CI。我没有对那个状态发可合入 PASS——代码我信得过（命门亲手验过），但『待独立审计』的东西必须在可锚定、可复现、CI 绿的状态才签。」
