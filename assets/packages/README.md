# Packages

共享包只在对应契约任务冻结边界后创建。禁止预先建立 `utils`、`types` 或 `helpers` 大杂烩。

- `contract-runtime`：不可信 JSON 输入的共享预算、访问器拒绝与冻结原语；不承载业务类型。
- `document-model`：v0 类型化文档真源。
- `template-model`：v0 声明式模板 DSL。
- `host-contract`：v0 平台能力与会话协议。
- `project-contract`：v0 项目、知识包、语义审计与兼容策略。
- `test-support`：测试层级发现、并行 worker 隔离与失败证据保存；不承载产品逻辑或数据库替身。
