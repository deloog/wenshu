# PB-02 实施记录 · 稳定 ID 最小文档编辑操作

- 状态：已实现，待 Claude 独立审计
- 前置：PB-01 审计 PASS、业主决策 #12、G1-04 v0 文档契约。
- 范围：操作层、完整 G1-04 ↔ ProseMirror adapter、稳定 ID 分配与变更追踪；
  不含事务/history、协同、CRDT、UI、语义工具或分页实现。

## 交付物

- 新包 `@wenshu/semantic-editor`。`schema.ts` 用结构节点表达所有 0.2.0 内容
  块及 list/table 内部对象；`adapter.ts` 完整双向映射，反向出口总是调用冻结的
  `validateDocument`，诊断只抛稳定代码、不回显正文。
- `operations.ts` 提供 insert/delete/move/rewrite/copy。删除空容器、移动到自身
  后代、改写目标 ID/type 或任意既有子 ID 均失败关闭；每次成功操作返回
  `affectedNodeIds`。
- `ids.ts` 以 `crypto.randomBytes(16)` 分配内在 ID；分配器仅接受 ID 前缀，完全
  不接受位置或索引。测试可注入确定性 allocator；生产随机 ID 符合 G1-04
  `prefix + 128-bit lower-hex` 形式。

## 正确性证据

- `full.json` 经完整 adapter 往返 deep-equal；涵盖 G1-04 的全部块类型、嵌套
  section、表格、图片题注、toc 与 assets。
- 操作测试验证：插入/复制均为递归新 ID；移动/改写/他处删除保留未受影响 ID；
  每一步都反向验证 G1-04 schema 和全 ID 唯一。
- 固定种子随机普通编辑 120 步；每一步对账所有未受影响 ID，并验证 schema。
  “按位置重写 ID”的变异被稳定性断言检出。

## 供应链与边界

- 新运行时依赖：`prosemirror-model@1.25.11`（MIT）和传递
  `orderedmap@2.1.1`（MIT）；决策 #12 已批准。lockfile/SBOM 由既有命令生成，
  未手工编辑；无 GPL/AGPL/未知许可。
- G1-04 schema、生成类型和规则未改动。未新增平台 API 或 ArkWeb fake；设备性能
  继续是 `needs_device_to_verify`，不在本任务中宣称通过。

## 本机已执行

- `pnpm --filter @wenshu/semantic-editor test`：6/6 pass。
- `pnpm --filter @wenshu/semantic-editor typecheck`：pass。
- `pnpm supply:check`：170 packages（13 direct），MIT 许可与 committed SBOM
  无漂移，pass。
- `pnpm verify`：pass（2026-07-29，本机 Windows）；本机 Node 24.13.0 低于
  lockfile 声明的 24.17.0，仍不能替代 Ubuntu CI 证据。
