# PB-01 语义编辑内核七维探针

> 评估日期：2026-07-29；候选只存在于 `tmp/pb-01-isolated`，未进入 pnpm lockfile、SBOM 或运行时。

## 固定口径与结果

固定探针：创建/改写节点、undo/redo、稳定 ID 适配、导出到 G1-04 v0、协同事务、跨端、许可/维护。分数：`pass`、`conditional`、`not_evaluated` 或 `rejected`；不得以未测替代通过。

| 候选 | 固定操作/事务 | 稳定 ID + v0 往返 | CRDT | ArkWeb | 许可/维护 | 结论 |
|---|---|---|---|---|---|---|
| ProseMirror | **pass**：隔离 Node 探针插入、undo、redo 均成功 | conditional：节点身份须由文枢 adapter 保存；尚未实现 v0 映射 | conditional：需适配 Yjs | `needs_device_to_verify` | MIT；活跃多仓维护 | 建议的语义内核候选 |
| Lexical | not_evaluated | not_evaluated | conditional（有 lexical-yjs 生态） | `needs_device_to_verify` | MIT、月度发布；API 变动快 | 备选，不建议先引入 |
| Slate | not_evaluated | not_evaluated | conditional | `needs_device_to_verify` | MIT，但官方 beta/无 1.0 计划 | 维护硬闸不通过，淘汰 |
| Yjs | pass：隔离 transaction/undo/redo 成功 | 非文档内核 | **pass**：协同状态候选 | `needs_device_to_verify` | MIT；v14 为 RC，采用稳定线前不得升级 | 仅未来协同适配候选 |
| 自建类型树 | not_evaluated | 理论可对齐 | not_evaluated | `needs_device_to_verify` | 无外部许可负担 | 不应在 PB-01 重复实现编辑内核 |

探针输出：ProseMirror 固定操作/undo/redo=true；Yjs transaction/undo/redo=true。它不实现 PB-02 操作层，不把字符串 ID 冒充为内核原生稳定 ID，也不对未完成的 v0 导出往返计分。

ArkWeb 模拟器/设备因 BIOS 虚拟化未开、无真机而未测；浏览器 probe 不能替代 ArkWeb。

## 建议

建议业主批准 **ProseMirror 作为 PB-02 的隔离语义内核候选**，前提是 PB-02 首先实现并证明 G1-04 的稳定 ID adapter 与 v0 round-trip；Yjs 保持 PB-07 的协同候选，不随本决定进入供应链。选型及任何依赖写入 lockfile/SBOM 仍须业主批准。
