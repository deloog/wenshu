# PB-05 实施记录 · 可定位 diff、accept/reject 与 undo

- 状态：已实现，待 Claude 独立审计。
- 前置：PB-03、PB-04 均已签署；G1-04/PB-02/PB-03/PB-04 冻结物零改动。

## 交付

- 新增 `@wenshu/editor-diff`。`DiffReview` 在克隆的 preview `TransactionManager` 中执行
  PB-04 工具候选，权威 manager 只在 `accept` 重新经 PB-04 gateway 调用时改变。
- `FieldDiff` 是节点/字段级契约，包含稳定 ID、字段、前后标量值与 parent/ancestor/sibling
  上下文。移动为 `$parent` 变更，新增/删除拆为字段记录；无 whole-block replacement。
- 提案独立 pending/accepted/rejected/reverted；拒绝无写副作用，部分接受只提交该提案，
  `undoAccepted` 复用 PB-03 undo。
- 无多人合并 UI、存储、持久化或新的模型/写路径；工具执行依旧由 PB-04 限制为冻结六项。

## 自检证据

- 单元测试：rewrite 精确锚到 stable node/`text` 字段并保留文档祖先上下文；move 精确为
  `$parent`，不产生 `$block` 替换。
- 集成测试：生成候选、拒绝后权威文档前后 deep-equal；两个候选中只 accept 一个，另一个
  仍 pending/随后 reject，PB-03 undo 后权威文档 deep-equal 初始值。
- E2E 层：模型候选→reject 的真实入口不产生写入。
- 已执行：`@wenshu/editor-diff` 6/6、typecheck、lint；PB-03 8/8、PB-04 6/6 回归均 pass；
  `pnpm supply:check` 为 170 包、13 个直接依赖、许可 clean、SBOM 无漂移；完整
  `pnpm verify` 已于 2026-07-29 通过。本机 Node 24.13.0 不冒充冻结 Node 24.17.0 的
  Ubuntu CI；交审前仍须远程 CI。
