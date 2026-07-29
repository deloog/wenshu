# PB-03 实施记录 · 统一事务、校验、undo/redo 与取消

- 状态：已实现，待 Claude 独立审计。
- 前置：PB-02 Claude 独立审计 PASS；G1-04 与稳定 ID 规则未改动。

## 交付

- `@wenshu/editor-transactions` 的 `TransactionManager` 是唯一可见文档写边界。
  human 与 ai 只作为同一 `EditorActor` 输入，均经 begin/apply/commit 或 rollback。
- PB-02 原始操作从公共入口移除；仅事务包可通过明确的 internal 子路径使用。
  session 的最终提交需要模块私有 capability，直接调用不能改变 manager snapshot。
- 操作仅作用于私有暂存文档。任一 PB-02 操作抛错、稳定 ID 守卫失败、adapter/schema
  验证失败或取消都回滚到事务前文档；输出只有 committed 或 rolled_back。
- 事务传递并合并 PB-02 `affectedNodeIds`；不实现增量分页、事务审计、存储、UI、
  CRDT 或语义工具。

## 证据

- 中途插入后注入 ID 守卫失败：manager document 与事务前 deep-equal，回滚原因为
  `operation_failed`。
- 32 个已提交事务：逐个 undo 回 origin，再逐个 redo 与每一提交快照 deep-equal；
  redo 越界稳定返回当前文档。
- 异步 AI session 在首次 staged operation 后由 `AbortController` 取消：终态为
  `rolled_back/cancelled`、manager 文档无副作用；重复 cancel deep-equal。
- 80 个固定种子事务含失败注入：每次要么 committed，要么 manager 逐字段不变。
  public semantic-editor surface 上不存在 raw 操作，非 manager capability 无法提交。

## 已执行检查

- `pnpm --filter @wenshu/editor-transactions test`：8/8 pass。
- `pnpm --filter @wenshu/editor-transactions typecheck`：pass。
- `pnpm --filter @wenshu/semantic-editor test`：6/6 pass（PB-02 回归）。
- `pnpm supply:check`：170 packages、许可证 clean、SBOM no drift，pass。
- `pnpm verify`：pass（2026-07-29，本机 Windows）。本机 Node 24.13.0 低于
  冻结的 24.17.0，不把本机验证冒充 Ubuntu CI；远程 CI 将在交审前完成。
