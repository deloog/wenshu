# PB-05 · Claude 独立审计任务

## 审计目标

独立验证未接受候选不改变真源、部分接受/undo、字段级定位和 PB-03/PB-04 唯一写边界。
审计者只能写审计报告，不得修改 PB-05/PB-03/PB-04、冻结契约、lockfile、SBOM 或门禁。

## 必验收点

1. 从真实 manager 建立 AI rewrite/insert/move 候选后直接 reject；逐字段 deep-equal 权威
   文档的前后 snapshot。确认 preview manager 从不替换权威 manager。
2. 生成至少两项互不依赖候选，只 accept 一项，确认未接受候选仍 pending/rejectable 且真源
   只含接受的字段；调用 `undoAccepted` 后与接受前 deep-equal。核 undo 由 PB-03 manager
   执行而非 PB-05 直接写 document。
3. 独立构造 rewrite、insert/delete 与 move，核每一 diff 都有 stable node ID、字段与
   parent/ancestor/sibling 上下文；move 必须是 `$parent`，不得以 whole-block 替换掩盖。
4. 检查 accept 仅经 PB-04 `ModelToolGateway` 和 PB-03 transaction；无 raw/internal/DOM/
   存储写入、无动态工具或多人自动合并。候选提交失败必须如实 rollback。
5. 核 G1-04/PB-02/PB-03/PB-04、预算、lockfile/SBOM 零漂移（除新增 workspace 包登记）；
   无 UI/CRDT/持久化越范围。
