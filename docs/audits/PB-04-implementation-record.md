# PB-04 实施记录 · 高层语义工具到事务编译器

- 状态：已实现，待 Claude 独立审计。
- 前置：PB-03 Claude 独立审计 PASS；G1-04 文档契约与稳定 ID 规则零改动。

## 交付

- 新增 `@wenshu/semantic-tools`，公共表面只有 `ModelToolGateway`、六项冻结工具定义及
  所需契约类型。它不导出 raw 操作、事务 manager 或编译函数。
- `rewrite`、`insert`、`outline`、`table`、`citation`、`move_subtree` 均先严格解码、
  检查工具/节点权限和目标，再编译为 PB-03 的 `ai` 事务。提交结果只返回 committed 的
  `affectedNodeIds` 或稳定拒绝码。
- 解码器拒绝未知键、非 plain object、accessor、未知工具、非法 ID/节点类型、非法表格
  形状及越界字符串。结构化 prompt-injection 载荷不能注入路径、命令、操作或额外工具。
- 编译/事务失败由 PB-03 原子回滚；循环移动的真实 PB-02 守卫触发后，document snapshot
  与调用前 deep-equal。未实现 UI、diff、存储、模型提供方、CRDT 或动态工具。

## 自检证据

- 六个工具依次实跑，均以 `ai` 事务提交；工具名集合逐项等于冻结的六项。
- 五个结构化 prompt-injection fixture（额外 command/path/operation/tool 与未知工具）逐条
  被拒，且每次 snapshot 与调用前 deep-equal。
- 无权限与允许但不存在的目标均在写入前拒绝；循环移动使真实事务回滚且无副作用。
- 公共 gateway 对象无可枚举内部字段；公共包不存在 `TransactionManager`、raw insert 或
  compile 导出；编译器不 import `@wenshu/semantic-editor/internal`，不引用 DOM/storage。
- `pnpm --filter @wenshu/semantic-tools test`：6/6 pass；`typecheck`、`pnpm lint`、
  PB-03 8/8 与 PB-02 6/6 回归均 pass；`pnpm supply:check` 为 170 包、13 个直接依赖、
  许可 clean、SBOM 无漂移；`pnpm verify` 已于 2026-07-29 在本机通过。本机 Node 24.13.0
  低于冻结 24.17.0，未把本机结果冒充远程 Ubuntu CI；交审前仍须远程 CI。
