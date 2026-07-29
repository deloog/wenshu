# G1-07 v0 项目、知识包、语义审计与兼容契约

> 状态：已完成（Claude 独立复审 `CONDITIONAL PASS`）　契约版本：`0.1.0`　日期：2026-07-20

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

`semantic_audit_event` 只记录具有责任意义的事件：AI 修改裁决、AI 后人工修改、来源关联、模板应用、正式版本批准。事件包含稳定 ID、项目 ID、连续 sequence、有效 UTC 时间、actor/action/decision、受影响节点、前后哈希、材料引用和最小模型元数据。

`actor` 表示真正作出动作的责任主体。`system` 的权限集合只有一个 action：`template_applied`；其余四种 action 均只允许 `user`。模型不是 actor，也不能接受修改或批准正式版本。`subject_model_context` 表示“被人类裁决或随后修改的 AI 产物来自哪个 provider/model/invocation”，因此人类裁决可以同时保留模型出处。`ai_change_decided` 和 `formal_version_approved` 强制 actor 为用户。

action、decision、受影响节点和前后哈希具有可执行组合规则：接受 AI 修改必须有节点且前后哈希不同；拒绝必须有节点且前后哈希相同；AI 后人工修改与来源关联必须产生哈希变化；正式版本批准必须保持被批准文档哈希一致。`template_applied` 的 0.2 事件以 `template` 为两侧 hash subject，绝不借用或伪造 document hash。0.1 非模板事件仍可读取；0.1 模板事件被拒，必须由未来真实迁移生成带明确 subject 的 0.2 事件。

Schema 不提供正文、prompt、凭证、原始模型响应、编辑器按键或 CRDT update 字段，未知字段一律拒绝。`provider` 是结构化注册表值（`anthropic`、`google`、`local`、`openai`、`test`），`model` 是非秘密的产品标识；不会以关键词或高熵猜测来判定密钥，因此合法 `keystone`、`monkey`、`tokenizer` 不会被误杀。凭证只能在契约外的受控配置边界处理，不能作为 provider/model 或任何审计字段传入。

编辑器事务、合并记录、语义审计事件保持三层分离；后续实现不得用本契约承载高频 undo/redo 或同步日志。

## 5. 版本与迁移原则

`compatibility` 对象固定五类 reader 的当前版本，并把以下原则做成可执行常量。项目包直接依赖 document/template 两个上游契约，运行时与测试同时断言 reader、项目引用 Schema 常量和上游导出版本一致；联合 fixture 还对账文档 ID 与模板 ID，避免兼容清单成为无人检查的副本。

- 未知版本明确拒绝，不静默丢字段；
- 0.x 新增语义使用显式版本和双读策略：当前 reader 接受审计事件 0.1/0.2，新的 hash-subject 语义只由 0.2 发出；
- 删除、重命名或语义破坏必须升级主版本并写 ADR；
- 旧 Schema 和迁移历史在产生真实数据后必须保留；
- v0 `migration_paths` 必须为空，本任务不伪造尚未实现的迁移。

同 Schema 主版本的知识包必须完整重导入；跨版本导入先验证、预览和备份，失败不改变现有项目。真实迁移与恢复将在选定生产存储后使用真实引擎验证。

## 6. 安全、诊断与证据

输入最多 64 层、100,000 个对象/数组节点；拒绝函数、访问器、循环和非普通对象，成功后返回深复制、深冻结值。稳定问题码包括通用的 `PROJECT_SCHEMA`、`PROJECT_BUDGET_EXCEEDED`、`PROJECT_DUPLICATE_ID`、`PROJECT_REFERENCE_MISSING`、`PROJECT_TRUTH_DERIVED_MIXED`，以及 G1-09 拆分出的 `PROJECT_AUDIT_DECISION_INVALID`、`PROJECT_AUDIT_RESPONSIBILITY_INVALID`、`PROJECT_AUDIT_HASH_INVALID`、`PROJECT_TIMESTAMP_INVALID`、`PROJECT_PACKAGE_PATH_INVALID`、`PROJECT_COMPATIBILITY_MISMATCH`。每个非法 fixture 同时断言问题码与精确 JSON path；诊断不回显正文或不可信值。

权威命令：

```powershell
pnpm --filter @wenshu/project-contract generate:check
pnpm --filter @wenshu/project-contract test
pnpm --filter @wenshu/project-contract typecheck
pnpm verify
```

整改后实施者自检为 21/21，新增覆盖“用户裁决并保留模型出处”、AI/system 不得裁决、接受/拒绝的节点与哈希语义、正式版本只能由用户批准、非法日历时间、结构化 locator、密钥形状标识、path/role 一致性，以及 document/template 跨包版本与 ID 联合契约。Claude 独立复审重跑首审反例后给出 `CONDITIONAL PASS`：首审 1 BLOCKER、2 MAJOR 全部关闭；新增 MINOR 的关闭责任登记于 [G1-07 条件通过后续项](audits/G1-07-followups.md)，不得由实施者自行宣称关闭。

G1-09 已实施 m-05/NF-04 的诊断粒度整改，但是否关闭仍须由独立审计确认。Schema 和序列化数据版本未变化；本次只细化尚无消费者依赖的运行时诊断码。
