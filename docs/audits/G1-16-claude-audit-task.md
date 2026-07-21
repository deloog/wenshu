# G1-16 G1 工程底座签署独立审计任务书（交给 Claude）

> 日期：2026-07-21　实施基线：G1-16 实施提交（见 git log 中 `docs: add G1-16 signoff package`）　报告目标：`docs/audits/G1-16-claude-audit-report.md`

## 1. 角色与写入边界

你是 G1 工程底座的最终独立审计者。不要采信签署报告、实施记录、台账状态或验证日志自述；逐项独立复核。

- 只允许新增或修改审计报告 `docs/audits/G1-16-claude-audit-report.md`。
- 不得修改代码、测试、证据、文档、lockfile、路线图、决策记录或任何 G1 产物。
- 仓库外探针只写 `D:\tmp\g116*`，结束后删除；不得 push、创建 PR 或触发 Actions。

## 2. 干净克隆验证复核（核心）

- 独立从私有远程取锚定提交 `f278335` 的干净树（方式自选：git 协议若恢复可用优先，否则评估 codeload tarball 替代是否可接受），核对提交身份与 PRIVATE 可见性。
- 在干净树独立执行 `pnpm install --frozen-lockfile` + `pnpm verify`，记录退出码与计数，与 [G1-16-cleanroom-verify.txt](G1-16-cleanroom-verify.txt) 对账。
- 裁定实施方披露的 tarball 替代与共享 pnpm store 是否削弱"一键安装/verify 可复现"结论；如削弱，给出所需补验。
- 确认干净树无本机未提交内容、无 `.env` 或秘密（跑 `secrets:check`）。

## 3. G1 任务闭环总复核

- 对照路线图台账逐项抽查（不必全量重复既往审计，但须验证）：每项 ✅ 都有对应独立审计报告且 BLOCKER/MAJOR 均签署关闭；无实施者自行关闭的任务；开放项（NF-03、FX-06、PB-05A）都有明确归属且归属任务未逾期。
- 交叉验证关键承重链：contracts/fixtures/fonts/environment/supply 五个检查在 verify 与 CI 中真实执行；SBOM 147 包无漂移；双机器证据锚点一致；字体锚点一致。
- 复核限制索引诚实性：§3 每条限制在对应文档中确有书面出处，无"已解决"冒充。
- 确认 G1-16 之前无任何功能实现代码（PA/PB/A 系列零产出）。

## 4. 结论规则

报告列出执行命令、独立证据、未执行项、工作树边界及 BLOCKER/MAJOR/MINOR/NOTE：

- 干净克隆 install/verify 不可复现、任一 G1 任务被无独立审计签署而标完成、既往 BLOCKER/MAJOR 未闭环、限制被冒充已解决、或已出现功能实现：`FAIL — G1-16 不得签署，功能实现不得开始`。
- 无 BLOCKER/MAJOR，且 MINOR 均有明确归属和最迟关闭点：可给 `CONDITIONAL PASS`。
- 完全满足且无未关闭发现：给 `PASS` 并**签署 G1 工程底座**，同时明确 PA 系列可以按自身 DoR 启动。审计者只给结论；由 Codex 依报告完成台账。
