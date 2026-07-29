# ADR-0020：PB-05A 审计哈希、模型标识与 system 权限

- 日期：2026-07-29
- 状态：已实现，待 Claude 独立审计

## 决策

1. 语义审计事件 reader 同时接受 `0.1.0` 与 `0.2.0`。新写入的事件使用 `0.2.0`；它把
   `before_hash_subject` 和 `after_hash_subject` 明确为 `document` 或 `template`。
   `template_applied` 仅接受两侧均为 `template`，不伪造 document hash。历史 `0.1.0` 的非模板
   事件继续可读；没有可证明 subject 的 0.1 模板事件 fail-closed，需在真实迁移中重建为 0.2。
2. `subject_model_context.provider` 为小型结构化注册表，`model` 为受控格式的非秘密产品标识。
   Schema 不存在 credential/token/key 字段，且 `additionalProperties: false`；不再用关键词或熵
   启发式猜测凭证。凭证防护归受控配置边界，不能伪装成审计契约校验。
3. `system` 仅允许 `template_applied`；其余 action 均由 `user` 负责。该表由正反测试覆盖，
   而不是留给调用方约定。

## 后果

- PB-06 可以消费明确的 hash subject、结构化模型出处和权限矩阵，但本 ADR 不实现审计存储、
  序列化迁移或事件写入器。
- 这是 0.x 的兼容性扩展：reader 双读，发射端升至 0.2，不删除 0.1 的读取形状。
