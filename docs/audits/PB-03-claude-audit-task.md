# PB-03 · Claude 独立审计任务

## 审计目标

独立验证统一事务的原子性、undo/redo、取消和无旁路边界。审计者只能写自己的
报告，不能修改 PB-03/PB-02 实现、G1-04 契约、lockfile、SBOM 或验收口径。

## 必验收点

1. 构造事务：先 staged insert/move，再让后续操作 ID 守卫失败或 schema 校验失败；
   核 manager snapshot 与事务前逐字段 deep-equal，确认没有任何部分写入或第三终态。
2. 独立随机多事务序列，undo 到 origin、redo 到每一个提交快照，逐次 deep-equal
   并核既有 ID；覆盖空事务、undo/redo 越界和 redo 被新提交清除。
3. 在真实异步 `execute` 的 staged operation 后 abort，确认终态 cancelled、snapshot
   不变、重复 cancel 幂等；不得只测预取消。
4. 检查 human/ai 同用 `TransactionManager`；public semantic-editor 不导 raw ops，
   非 manager capability 不能令 staged document 可见。internal 子路径不得被其他
   应用/包作为写入口。
5. 核提交前调用 PB-02 adapter/validator 与 stable-ID guard，且无 history/UI/CRDT/
   语义工具/存储/分页夹带；G1-04/PB-02 冻结物和供应链零漂移。
