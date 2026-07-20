# G1-04 v0 文档对象契约

> 状态：契约已冻结、修复已实现，待 Claude 独立复审　Schema 版本：`0.1.0`　日期：2026-07-20

## 1. 目的与边界

本契约只定义文枢首战所需的文档真源结构，不实现编辑器、排版、持久化、平台 API 或模板执行。v0 可以表达标题层级、段落、列表、引用、普通表格、图片/图表引用和显式分页标记；复杂表格、富文本行内标记、公式、脚本和任意外部资源不在本版本范围内。

权威真源是 [`packages/document-model/schema/document.schema.json`](../packages/document-model/schema/document.schema.json)。TypeScript 声明由 schema 生成，不得手工编辑；运行时先做 JSON Schema 校验，再做跨对象引用与唯一性校验。

## 2. 顶层对象与内容模块

`WenshuDocument` 固定包含：

- `schemaVersion`：当前只接受精确值 `0.1.0`；
- `documentId`：文档稳定标识；
- `revision`：非负修订号；
- `title`、`language`：标题与受控语言标签；v0 只接受 `language[-Script][-REGION]` 子集，不宣称覆盖完整 BCP 47；
- `blocks`：至少一个内容块；
- `assets`：文档引用的受控资源清单。

内容块使用可判别联合：`section`、`paragraph`、`list`、`quote`、`table`、`figure`、`pageBreak`。对象默认拒绝未知字段。表格必须让每行恰好覆盖全部已声明列；figure 必须指向清单中的资源。资源路径采用正向 ASCII 相对路径白名单，拒绝盘符、绝对路径、URL、`.`/`..` 段和反斜杠；同时限定图片媒体类型和 64 位小写十六进制 SHA-256。

## 3. 稳定 ID 规则

所有 ID 都是不透明的“前缀 + 128 位小写十六进制值”，不得编码数组位置、标题、文件路径或业务含义：

| 对象 | 前缀 |
|---|---|
| 文档 | `doc_` |
| 内容块 | `node_` |
| 列表项 | `item_` |
| 表格列/行/单元格 | `col_` / `row_` / `cell_` |
| 资源 | `asset_` |

- 新对象创建或首次导入时分配一次 ID。
- 改写、移动、重新排版和导出不得改变既有 ID。
- 复制形成的新对象必须获得新 ID；导入冲突必须显式解决，不能静默覆盖。
- 当前文档内所有上述 ID 共享唯一性约束。

## 4. 版本与兼容规则

- 当前 reader 只接受 `0.1.0`，未来版本必须明确拒绝，禁止“尽力读取”后静默丢字段。
- 任何 schema 变化都先修改 JSON Schema、fixture 和兼容说明，再重新生成类型并通过漂移检查。
- `0.x` 阶段的新增或行为变化发布为新的次版本，并提供显式迁移/适配器；不得在原版本下改变语义。
- 删除、重命名、改变字段含义或使旧数据不可读属于破坏性变化，需要新主版本、迁移与架构决策审查。
- 生成物可删除重建，永远不是唯一真源；旧 schema 与迁移链在产生真实数据后不得改写。

## 5. 安全与诊断

公共验证入口接收 `unknown`，先以最多 64 层、100,000 个对象/数组节点的预算检查输入，再执行 Schema 与跨对象校验；超限会返回稳定问题而不是抛出运行时栈溢出。输入还会拒绝函数、访问器、循环和非普通对象，且不会读取继承访问器。成功后返回深复制、深冻结的类型化对象，避免调用方继续篡改输入。失败只返回稳定 issue code 与 JSON 路径，不回显正文、标题或资源内容。第三方库类型通过本地窄接口收口，项目手写 TypeScript 不使用 `any`。

当前稳定问题码为：`DOCUMENT_SCHEMA`、`DOCUMENT_BUDGET_EXCEEDED`、`DOCUMENT_DUPLICATE_ID`、`DOCUMENT_REFERENCE_MISSING`、`DOCUMENT_TABLE_COLUMN_MISMATCH`。

## 6. 生成、验证与证据

- `pnpm --filter @wenshu/document-model generate`：从 schema 生成 TypeScript 声明。
- `pnpm --filter @wenshu/document-model generate:check`：检查声明是否与 schema 漂移。
- `pnpm contracts:check`：运行文档与模板漂移检查及全部契约 fixture。
- `pnpm verify`：配置契约、文档契约、严格类型检查和生产构建的统一入口。

修复后自检证据：2 个合法 fixture 与 7 个非法 fixture 全部符合预期，共 15/15 测试通过；Windows 绝对路径、远程 URL 与深层输入均有负向测试；测试目录已纳入该包严格 TypeScript 检查。故意修改生成文件后漂移检查按预期失败，重新生成后恢复通过；最终结论仍等待独立复审。使用 Ajv `8.20.0` 做 JSON Schema 2020-12 运行时校验，使用 json-schema-to-typescript `15.0.4` 生成声明，两者均为 MIT 许可；精确版本与完整性由 lockfile 固定，完整供应链结论仍由 `G1-15` 签署。
