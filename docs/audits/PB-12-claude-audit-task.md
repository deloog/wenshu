# PB-12 Claude 独立审计任务书

> 对象：分支 `pb-12-e2e-gate`（PR #52，审计签署前不合入）。范围：PB-12 全部交付（W1–W7）与 PoC-B 最终闸门报告。
> 审计者纪律：只读代码/测试/配置，只写 `docs/audits/PB-12-claude-audit-report.md`；BLOCKER/MAJOR 由实施者修复后原审计角色复审；实施自检不替代独立审计。

## 1. 背景速读

- 计划与三项裁定（D1/D2/D3）：ADR-0027（门槛 §4 已钉死，先于报告）。
- 实施记录：docs/audits/PB-12-implementation-record.md（含实测值与提交指纹）。
- 既有上下文：PB-10/PB-11 审计报告与 followups、决策 #11A（PoC-A 排版降级，不得追认）、决策 #13（知识包口径收窄）。

## 2. 重点猎杀方向（实施方自报的攻击面，须独立证伪）

1. **入口真实性**：E2E 是否真穿 Electron 壳与 0.2.0 Host 协议（而非内存直调）？建议：变异 preload/IPC 任一环节（如改通道名）应致链环红；检查 scenario 是否真经 `window.wenshuHost.invoke` 走协议（含 request_id/contract 校验路径）。
2. **fake 边界**：除脚本化 ToolRequest 外是否存在任何 mock/stub/内存替身？重点：编排器（pb-12-orchestrator.ts）只许 spawn/kill/读文件/断言；真库/文件/恢复零替身。
3. **强杀真实性**：signalCode===SIGKILL 是否真断言；导入中途杀点是否真落在暂存窗口（确定性轮询逻辑可否被「杀在暂存前/后」蒙混）；孤儿目录断言是否真验清理（removedResidue + readdir 双重）。
4. **恢复口径**：端到端计时起点/终点是否诚实（respawn spawn 时刻 → ready marker 出现；marker 写出前双前缀清理+store recover+工件 hash 校验是否真完成）；不得引用 PB-10 存储层批次冒充端到端。
5. **闸门报告诚实性**：对照 ADR-0027 §4 冻结门槛逐项核 met/not_met/deferred；试五种谎报形态（藏失败链环、manualChecks 式充数、选择性跳链环、瞒报误报/环境问题、门槛后移）是否都被报告结构防住；结论是否由实测值证成。
6. **承接 12 项真处置**：PB-12-followups §1 逐条核对「消费/转/关闭」是否有真实证据（如 #3 恢复复测数据、PB-11 #3 双前缀实现），无静默丢弃。
7. **W1 双前缀扩展**：符号链接免疫（Windows 联接点 + Linux symlink）、扫描预算 fail-closed、单源 marker、误删面（同形文件/非匹配目录零触碰）。
8. **e2e 通道安全**：非 e2e 模式暴露面零回潮（preload argv 旗标可否被渲染进程自伪造？additionalArguments 由主进程控制）；`e2e.knowledge.import` 的 sourceFileName 平文件名 fail-closed；watchdog/超时兜底。
9. **CI 第 9 job**：xvfb/ELECTRON_DISABLE_SANDBOX 接线是否仅在 e2e job 生效；本地与远程同一 `pnpm ci:job e2e`；matrix 与 CI_JOB_NAMES 一致性测试。
10. **诚实性对抗**：审计者自构第 N 种蒙混路径（如：让 recover 模式跳过 store recover、让 tamper 用例篡改的是不被校验的字节、让 save-loop 两版本内容相同使半写不可检出）应被现有断言拦住。

## 3. 必须独立重跑的验证

- `pnpm test:e2e` 全量（含既有 editor-diff e2e）；至少一次完整复跑。
- 四项变异守卫任抽两项独立复现（变异→红→回退）。
- W5 采样脚本复跑（`pnpm --filter @wenshu/electron-shell perf:recovery`，注意 PATH 前置断言本身应被试探：用错误 Node 跑应拒绝）。
- 远程 CI 最终 run 逐 job 核对 9/9 与本地命令同一性。

## 4. 签署条件

- 无未关闭 BLOCKER/MAJOR；闸门报告结论与独立实测一致；门槛（ADR-0027 §4）逐项有独立证据；承接 disposition 逐项核毕。
- 签署引用：main 合入提交 SHA（squash 后）+ 最终远程验证 run id，不引用分支侧 SHA。
