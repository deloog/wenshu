# G1-07 v0 项目、知识包、语义审计与兼容契约

> 状态：已实现，待 Claude 独立审计　契约版本：`0.1.0`　日期：2026-07-20

## 1. 目的与边界

本契约冻结项目真源清单、完整知识包 manifest、语义审计事件和版本兼容策略。它不选择数据库、不实现 ZIP 打包/文件读写/迁移执行，也不把编辑器事务或 CRDT 合并记录塞进语义审计。

机器真源是 [`packages/project-contract/schema/project-contract.schema.json`](../packages/project-contract/schema/project-contract.schema.json)。四类对象由 `contract_kind` 判别，TypeScript 声明从 Schema 生成，运行时入口接收 `unknown`。

## 2. 项目真源清单

`project` 记录项目 ID、修订号、标题，以及当前文档和模板的版本、稳定 ID 与 SHA-256。材料只记录稳定 ID、显示名、受控媒体类型和哈希；正文、模板和附件本体保存在各自真源文件中，项目清单不复制内容。

项目另记录语义审计事件 ID、有意义的正式版本和派生数据描述。正式版本同时固定文档哈希、模板哈希和批准事件，才能重现当时结果。派生数据只能是搜索/向量索引、渲染缓存或缩略图，必须声明 `rebuildable: true` 并引用真源哈希；它不能成为项目成立的必要条件。

## 3. 完整知识包

`knowledge_package` manifest 使用规范化 ASCII 包内相对路径和 SHA-256/字节数清单，不包含系统绝对路径。每个 entry 必须明确：

- `truth.*`：项目、文档、模板、语义审计和材料；必须存在、不可重建；
- `derived.*`：索引、缓存和缩略图；必须非必需且可重建。

包至少有且只有一个项目清单和审计流，并至少包含一个文档和模板。历史正式版本可以增加文档/模板真源 entry。`validateKnowledgeBundle` 对账项目 ID、审计 ID/连续序号、当前及正式版本哈希、材料哈希、出处引用和批准事件；仅验证“文件存在”不算闭合。

真实压缩包防穿越、实际文件哈希、干净环境重导入和事务回滚属于 `PB-11` 的真实文件验证，本任务不冒充这些能力已经实现。

## 4. 语义审计与三层记录

`semantic_audit_event` 只记录具有责任意义的事件：AI 修改裁决、AI 后人工修改、来源关联、模板应用、正式版本批准。事件包含稳定 ID、项目 ID、连续 sequence、时间、actor/action/decision、受影响节点、前后哈希、材料引用和最小模型元数据。

Schema 不提供正文、prompt、密钥、原始模型响应、编辑器按键或 CRDT update 字段，未知字段一律拒绝。AI actor 必须带 provider/model/invocation ID；非 AI actor 不得伪带模型上下文。`source_linked` 必须有材料引用，action 与 decision 使用固定组合。

编辑器事务、合并记录、语义审计事件保持三层分离；后续实现不得用本契约承载高频 undo/redo 或同步日志。

## 5. 版本与迁移原则

`compatibility` 对象固定五类 reader 的当前版本，并把以下原则做成可执行常量：

- 未知版本明确拒绝，不静默丢字段；
- 同一主版本的行为变化也需要显式 adapter；
- 删除、重命名或语义破坏必须升级主版本并写 ADR；
- 旧 Schema 和迁移历史在产生真实数据后必须保留；
- v0 `migration_paths` 必须为空，本任务不伪造尚未实现的迁移。

同 Schema 主版本的知识包必须完整重导入；跨版本导入先验证、预览和备份，失败不改变现有项目。真实迁移与恢复将在选定生产存储后使用真实引擎验证。

## 6. 安全、诊断与证据

输入最多 64 层、100,000 个对象/数组节点；拒绝函数、访问器、循环和非普通对象，成功后返回深复制、深冻结值。稳定问题码为 `PROJECT_SCHEMA`、`PROJECT_BUDGET_EXCEEDED`、`PROJECT_DUPLICATE_ID`、`PROJECT_INTEGRITY`、`PROJECT_REFERENCE_MISSING`、`PROJECT_TRUTH_DERIVED_MIXED`，诊断不回显正文或不可信值。

权威命令：

```powershell
pnpm --filter @wenshu/project-contract generate:check
pnpm --filter @wenshu/project-contract test
pnpm --filter @wenshu/project-contract typecheck
pnpm verify
```

实施者自检为 15/15，通过四类合法 fixture JSON round-trip、完整 bundle 对账、缺字段/未来版本、真源派生混用、审计内容泄漏、actor/action/decision、重复审计/孤儿真源、跨项目引用、预算/访问器和生成类型零 `any`。这些结果只代表实施者自检，最终状态等待 Claude 独立审计。
