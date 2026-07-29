# ADR-0015：PB-02 稳定 ID 操作层与 ProseMirror 适配

- 日期：2026-07-29
- 状态：已实现，待 Claude 独立审计
- 决策：以 `@wenshu/semantic-editor` 将 G1-04 文档完整映射到 ProseMirror
  文档树；所有公开操作在输出前必须反向适配并通过 `validateDocument`。

## 决策

1. ProseMirror 节点属性保存 G1-04 的 ID 与标量字段，section/list/table 的结构
   保留为真实子树；不将整份文档序列化为一个不透明节点。文档元数据和 assets
   保存在 ProseMirror 根节点属性。
2. 新建和复制使用 `IdAllocator` 分配 `node_`、`item_`、`col_`、`row_`、
   `cell_` 的 128 位随机不透明 ID。分配器 API 不接收位置、索引、标题或路径；
   操作层对既有 ID 集合去重，发生冲突重试，超过上限失败关闭。
3. 移动和改写复用既有节点/子节点 ID；删除只移除目标；插入和复制递归分配所有
   新对象 ID（table cell 的 `columnId` 同时重绑到新 column ID）。
4. ProseMirror content expression 保证文档、section、list、table、row 不形成
   空结构；adapter 的冻结 validator 再保证所有 G1-04 字段、交叉引用、唯一性和
   版本语义有效。因而任何公开操作的可观察结果均为有效 G1-04 文档。
5. 每次操作返回受影响稳定节点 ID，供后续增量分页消费者决定重渲染范围；不实现
   分页、事务/history、undo/redo、协同/CRDT、UI 或语义工具。

## 后果与验证

- `full.json` 覆盖 section、paragraph、list、quote、table、figure、pageBreak、toc
  和 assets 的往返逐字段对账。
- 固定种子 120 步普通编辑序列每步反向验证 schema、全 ID 唯一，并断言未受影响
  ID 保持；另有位置派生 ID 的负向变异。
- ProseMirror 与 `orderedmap` 按决策 #12 写入 lockfile/SBOM；MIT 许可由
  `pnpm supply:check` 复核。

## 不在本 ADR 的范围

统一事务、undo/redo、取消属于 PB-03；CRDT 属 PB-07；编辑器 UI 与 ArkWeb 性能
验证不在 PB-02。本 ADR 不修改 G1-04 schema 或稳定 ID 规则。
