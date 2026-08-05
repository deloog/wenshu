# A-03 MAJOR-1/MAJOR-2 修复记录（2026-08-05）

> 对象：Claude 首审 CONDITIONAL PASS 的两项 MAJOR。合并前必须关闭。
> 修复者：Codex（实施者）；复审：Claude（原审计角色）。

## MAJOR-1 参考机器登记证据被批次重录覆盖

**根因**：`pnpm env:record` 输出目录硬编码 `artifacts/reference-machine/`，批次前裸跑把
签署基线（Win11 参考机器 / Node v24.17.0 / recorded_at 2026-08-01）覆盖成本机批次环境
（Win10 / v24.13.0）。

**修复**：

1. `artifacts/reference-machine/environment.json` 恢复 main 版内容（`git diff main`
   为空；recorded_at 2026-08-01T05:06:11.792Z、node v24.17.0），随本提交回落。
2. 批次环境证据落 `artifacts/perf/2026-08-05-A-03/environment.json`
   （recorded_at 2026-08-05T16:18:15.283Z、node v24.13.0）。如实说明：该重录发生在
   采样（14:30）之后、基线恢复之时，与采样协议「批次前」顺序有偏差；同机同会话同
   解释器版本，环境事实不变，但顺序偏差如实登记，不复读为合规。
3. **协议陷阱登记（归口 G1-14）**：env:record 的默认落点即登记基线，`--out` 只改
   文件名不改目录；任何批次前裸跑都会覆盖签署基线。诉求 G1-14 后续收口——批次
   录制入口与登记基线写入分离（如工具加 `--batch-dir` 或批次脚本代管），在收口前
   各采样批次一律先核对落点再执行。登记处：本文件即台账，G1-14 消费时引用。

## MAJOR-2 结构丢失守卫可被操作自我申报绕过

**根因**：session 许可删除集来自操作自报的 `removedNodeIds`——多删一个兄弟项并如实
申报即可让守卫自批（审计探针：3 项列表 merge-lists 多删+申报 → COMMITTED，3 项→1 项
静默丢失；且仓内 fixture 列表最长 2 项，违规分支根本进不去，覆盖缺口是问题的一部分）。

**修复**：

1. `packages/editor-transactions/src/commands.ts` 新增导出
   `computeExpectedRemovals(command, preDocument)`：从命令+命令前文档独立计算许可
   删除集（delete=子树全集；delete-table-row=行+单元格；delete-table-column=列+对应
   单元格；delete-list-item/demote-section/merge-lists=单节点；其余=[]；未知目标=[]，
   原始操作自行 fail-closed）。文档注释钉定判据来源纪律。
2. `packages/editor-transactions/src/transactions.ts` `apply()` 改以
   `computeExpectedRemovals(command, beforeDocument)` 填充许可集，不再读取
   `result.removedNodeIds`（保留为信息性返回值）。
3. 决定性测试（`test/structural-commands.unit.test.ts`，14→17）：
   - `computeExpectedRemovals pins the allowed-removal set per kind`：16 个命令类×
     期望集逐类钉定，含三类未知目标 fail-closed 分支；
   - `merge-lists over 3+2 item lists commits`：堵审计者指出的覆盖缺口，5 项逐一
     保序、仅源列表身份移除；
   - `delete-list-item from a 3-item list commits`：删中间项，剩余两项身份精确钉定。
4. **变异自证（审计者探针复刻）**：临时变异 `mergeLists` 弹掉目标列表一个兄弟项
   并如实申报进 removedNodeIds → merge 两个用例双双变红
   （`expected 'committed' actual 'rolled_back'`，守卫以 PB03 稳定 ID 判据回滚）；
   回退后 editor-transactions 17/17、semantic-editor 21/21 全绿。变异前该探针
   COMMITTED，修复后 THREW——判据来源已不可自我申报。

## 验证基线

- editor-transactions 17/17、semantic-editor 21/21（修复后全量）；
- `pnpm verify` EXIT=0（含 typecheck、file-size、quality:check）；
- transactions.ts 398/400 行（file-size 上限边缘，未超；后续任何改动须先量行数）。
