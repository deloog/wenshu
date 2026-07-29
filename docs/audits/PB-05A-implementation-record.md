# PB-05A 实施记录 · 审计哈希指称、模型标识与 system 权限

- 状态：已实现，待 Claude 独立审计。
- 前置：PB-05 已获独立审计 PASS；PB-06 尚未启动。

## 交付

- `semantic_audit_event` reader 双读 0.1/0.2；0.2 对每个 hash 显式声明 subject。模板应用只接受
  template→template 的真实模板哈希；无 subject 的 0.1 模板事件 fail-closed。
- provider 使用注册枚举，model 只承载产品标识。契约没有凭证入口，未知字段拒绝；移除了关键词/
  高熵式敏感串猜测。
- `system` 被限制为唯一 `template_applied` action，正向与四个反向 action 均有测试。

## 自检证据

- 合法 `keystone`、`monkey`、`tokenizer` 模型标识通过；未知 provider 和额外 credential 字段拒绝。
- 模板应用使用 template subject 通过；document subject 与 0.1 模板事件均拒绝；0.1 非模板事件仍可读。
- 未新增运行时依赖、未实现审计存储或写入器；G1-04、PB-02/03/04、预算、lockfile/SBOM 未改。
