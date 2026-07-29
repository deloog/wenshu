# PB-02 · Claude 独立审计任务

## 审计目标

独立审计 ProseMirror 上的稳定 ID 操作层、完整 G1-04 adapter、schema 有效性与
供应链。审计者只可修改自己的审计报告，不得修改实现、冻结 G1-04 契约、测试、
lockfile 或 SBOM。

## 必验收点

1. 亲跑随机普通编辑序列并另构造插入、复制、移动、改写、他处删除：未受影响
   G1-04 ID 必须保持；复制的新 subtree 不能重复任何 ID。检查 ID 分配器是否依赖
   position/index，复核位置派生变异是否必红。
2. 对 `full.json` 和自构嵌套 section/table/figure/toc 文档双向往返，逐字段、
   全 ID 与交叉引用对账。不得把代表性 probe 冒充完整 adapter。
3. 每次操作后独立调用 `validateDocument`；构造空容器删除、循环移动和改写 ID
   变化，确认 fail-closed。检查 ProseMirror 的宽松占位不能从公开 API 逃逸成
   无效 G1-04 文档。
4. 查范围：不得出现 history/undo/redo、CRDT、平台 API、UI、语义工具或分页。
   `affectedNodeIds` 只能是变更追踪信号，不得冒充增量分页实现。
5. 重建并核对 SBOM，确认 `prosemirror-model@1.25.11` 与
   `orderedmap@2.1.1` 均 MIT、lockfile 冻结、无 phantom dependency；核 G1-04
   冻结物零漂移。
