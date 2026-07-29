# PB-06 实施记录 · 语义审计事件与出处链

- 状态：已实现，待 Claude 独立审计。
- 前置：PB-05、PB-05A 已签署并合入 main；PB-07 与本包 schema 隔离。

## 交付

- 新包 `@wenshu/semantic-audit` 提供受校验、顺序连续、事件 ID 唯一的进程内语义事件流。
- `recordAiDecision` 只从 PB-05 diff 取得 affected node ID，并记录裁决、模型出处与 PB-05A hash
  subject；不接收 diff 值、prompt、正文或按键。
- `explain` 按节点回答 AI 裁决、人工后续修改、材料来源与材料存在状态。

## 自检证据

- 重要 AI 裁决不包含 diff 值；来源/AI/人工/材料四问均有真实断言。
- 包含 `api_key` 与全文的未知字段由 project-contract fail-closed，事件流保持空。
- 无第三方新增依赖；未实现持久化、编辑历史、CRDT 或 UI。
