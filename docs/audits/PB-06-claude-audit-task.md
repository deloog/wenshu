# PB-06 · Claude 独立审计任务

## 必验收点

1. 基于真实 PB-05 diff 记录 AI 接受/拒绝，确认仅 node ID、hash、裁决和模型出处进入事件；不记录
   字段值、prompt、正文或按键。
2. 独立构造材料关联与 AI 后人工修改，调用出处查询，逐项确认来源、AI 改了什么、人工后改什么、
   材料存在状态均能据实回答。
3. 喂含 `api_key`、`token`、`secret`、`password` 与敏感全文的输入，确认 Schema 拒绝、日志不落值。
4. 核所有 hash subject 与 PB-05A 一致；核本包不导入事务历史/CRDT、无持久化或 UI、供应链无漂移。
