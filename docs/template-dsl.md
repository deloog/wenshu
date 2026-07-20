# G1-05 v0 模板 DSL 契约与安全边界

> 状态：契约已冻结、修复已实现，待 Claude 独立复审　DSL 版本：`0.1.0`　日期：2026-07-20

## 1. 目的与范围

本契约把通用专业分析报告的模板规则冻结为可版本化、可校验的声明式 JSON。它只描述模板数据，不实现解释器、CSS 映射、分页、PDF 导出、迁移执行、模板市场或第三方代码运行。

权威真源是 [`packages/template-model/schema/template.schema.json`](../packages/template-model/schema/template.schema.json)。TypeScript 声明从 Schema 生成，不得手工编辑。现有 [`formal-business.template.json`](poc-a/fixtures/formal-business.template.json) 已补充 `dsl_version` 并作为真实合法 fixture 持续校验；其版式规则未改变。

## 2. 白名单结构

v0 只允许以下顶层字段，所有对象均拒绝未知字段：

| 字段 | 作用与限制 |
|---|---|
| `dsl_version` | 当前只接受精确值 `0.1.0` |
| `template_id` / `version` | 稳定模板标识与三段式语义版本 |
| `supported_document_schema` | 当前只支持 `wenshu.report/0.1.0` |
| `required_sections` | 封面、摘要、目录、正文、来源的受控子集 |
| `page` | A4、横/纵向及 5–50 mm 页边距 |
| `fonts` | 受控字体注册名、版本、字重和导出前失败策略 |
| `layout_tokens` | 字号、行距、段距和 6 位十六进制颜色 |
| `pagination_rules` | 标题/目录起页、孤行寡行、表头重复、行和图题保持规则 |
| `validators` | 固定的 16 项页面检查器白名单 |
| `export_profile` | 仅 PDF 和受控浏览器打印选项 |
| `migration_rules` | v0 占位，必须为空数组 |

字体 `primary` 只是逻辑注册名，未来解释器只能通过已批准字体清单解析；它不是文件路径，也不能触发字体下载。Schema 中的数值上下限属于安全和可读性护栏，不代表真实 Chromium 排版已经通过，实际效果仍由 PoC-A 真实渲染门禁裁决。

## 3. 明确禁止的执行面

模板是不可信输入。公共验证入口在普通 Schema 解释前扫描并拒绝：

- 函数值、getter/setter、非普通对象，以及 script、JavaScript、eval、expression、command、shell、exec、spawn 等动态执行字段；
- file、path、directory、filesystem、glob、symlink 等文件访问字段；
- URL、URI、endpoint、fetch、network、socket、webhook 等网络字段；
- capability、permission 等自声明能力字段；
- 超过 20 层或 5,000 个对象/数组节点的输入，以及循环对象。

模板没有 host、文件、网络、系统、环境变量或密钥能力。未知字段不会被忽略；安全失败只返回稳定问题码和 JSON 路径，不回显字段值。后续解释器也必须逐项映射白名单 token，禁止 `eval`、`Function`、动态模块加载或把模板拼接成可执行代码。

上述危险键名是 v0 的保留命名空间，属于 Schema 白名单之外的纵深防御；即使未来某个无害业务概念想使用同名字段，也必须先升级 DSL 版本、改用无歧义名称并重新安全审计，不能在 `0.1.0` 中放宽。

## 4. 版本与迁移

- `dsl_version` 表示 DSL 读取协议；`version` 表示某个模板资产自身的版本，两者不得混用。
- 当前 reader 精确拒绝未来 DSL 版本，禁止静默丢弃未知规则。
- v0 的 `migration_rules` 只能为空；未来启用迁移前必须发布新 DSL 版本，定义纯声明式迁移白名单、预算、预览、回滚和测试，不得把脚本藏入迁移规则。
- 模板升级不得静默覆盖项目所固定的旧版本。产生真实项目后，旧 Schema、旧模板与迁移链必须保留，历史正式版本应能重现或显式迁移。
- 删除/重命名字段、改变 token 含义或扩大执行能力属于破坏性或安全边界变化，必须写 ADR 并重审消费者。

## 5. 生成、验证与证据

- `pnpm --filter @wenshu/template-model generate`：从 Schema 生成 TypeScript 声明。
- `pnpm --filter @wenshu/template-model generate:check`：检查生成声明漂移。
- `pnpm contracts:check`：运行文档与模板 Schema 漂移检查及契约测试。
- `pnpm verify`：运行全部现有 G1 契约、严格类型检查和生产构建。

修复后共 15/15 项模板契约测试通过。4 个恶意 fixture 现在描述对合法最小模板的字段注入，而不是本身不完整的候选；测试另覆盖实际函数值、自有和继承访问器均不执行、未来版本、非空迁移、未知规则、诊断脱敏和生成声明零 `any`。故意修改生成文件时漂移检查必须失败，重新生成后恢复通过；最终结论仍等待独立复审。
