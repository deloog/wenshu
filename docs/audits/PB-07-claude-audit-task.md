# PB-07 Claude 独立审计任务书

## 审计目标

确认 PB-07 只是诚实的离线 CRDT 候选探针：两副本真实合并且稳定映射节点 ID/事务；三层记录
不混用；候选供应链被隔离；没有把探针伪装成 Alpha 自动同步。

## 独立复现

```powershell
Set-Location probes/pb-07-yjs
npm ci --ignore-scripts
npm test
```

审计者应独立令两个副本各做离线编辑、交换 update，检查收敛和每个事务受影响节点是否仍存在。
再向任一记录层加入其他层字段（例如把 `transactionId` 塞进 semantic audit）确认被拒。

## 必核反例

1. 两副本离线编辑后是否仅靠真实 Yjs update 收敛，而不是共享同一文档或浏览器 fake；
2. 映射是否使用稳定 `node_<32 hex>` ID 与事务 `tx_<actor>_<counter>`，且每个引用指向存在节点；
3. 编辑历史、CRDT 合并记录、语义审计 schema 是否字段不交叉、`additionalProperties: false`；
4. 根 `pnpm-lock.yaml`、SBOM、G1-04/PB-02/PB-03/PB-04 是否零漂移，Yjs 是否仅在探针 lockfile；
5. 文档和 API 是否没有宣称 transport、自动同步、持久化或 Alpha 产品能力。

失败时不得将不能稳定映射 ID/事务的候选宣布可用；应要求换候选并重审 ADR。
