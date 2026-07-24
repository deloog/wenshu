# PA-02 实施记录 · 正式商务 fixture 映射为受控模板模型

> 日期：2026-07-24　任务书：PA-02 开工指令（Claude 审计者门禁定义）　状态：已实现，待 Claude 独立审计；实施者不自行关闭。
> 交付：新包 `@wenshu/template-map`（`packages/template-map`），只做声明式绑定，不做 CSS/布局/分页/渲染。

## 范围

- **范围内**：`mapTemplate(input, fontSet, documentSchemaVersion?)` 把不可信模板 JSON 映射为 `ControlledTemplate`——先经 G1-05 `validateTemplate`（未知字段、DSL 版本、执行面、预算全拒绝），再做两条绑定：①`supported_document_schema` 精确匹配 `wenshu.report/${DOCUMENT_SCHEMA_VERSION}`（document-model 冻结常量）；②`fonts.primary/version/weights` 必须解析到已批准字体清单（`parseApprovedFontSet` 收窄 G1-13 font-manifest.json，权重须逐一命中注册表）。
- **范围外（未做）**：CSS 映射、布局计算、分页、PDF 导出、迁移执行；`migration_rules` 仍由 schema 强制为空。
- **模型面**：`ControlledTemplate` 只携带契约字段与字体逻辑身份（family/version/weight/style/postscriptName）；测试断言序列化模型不含 `.otf`/`sha256`/`assets/`——无文件访问面。

## 关键设计取舍（书面化待审）

1. **绑定守卫的可决定性**：`supported_document_schema` 的不匹配输入会先被 G1-05 schema const 拒绝（邻层守卫），映射层绑定自身若不可达将重蹈 PA-A1「无测试承重」——故 `mapTemplate` 第三参 `documentSchemaVersion` 默认取 document-model 常量、允许测试注入模拟版本漂移，绑定守卫有决定性测试。
2. **跨契约一致性**：新增测试断言 template.schema.json 的 `supported_document_schema` const 与 `wenshu.report/${DOCUMENT_SCHEMA_VERSION}` 一致——G1-04/G1-05 两冻结契约的版本不得漂移。
3. **字体只逻辑解析**：`fonts.primary` 不当路径、不触发下载；注册表解析只取逻辑身份字段，文件路径与哈希留在 G1-13 清单层。
4. **纯函数设计**：`mapTemplate`/`parseApprovedFontSet` 不读文件、不触环境；fixture 测试在测试层读真实 fixture 与清单。

## 验收对照（任务书 ①–⑤）

| 门禁 | 测试 | 结果 |
|---|---|---|
| ①未知字段拒绝 | unknown fields are rejected（注入 `unknown_future_rule` 于合法 fixture） | ✔ TEMPLATE_SCHEMA |
| ②DSL/版本不兼容拒绝 | future DSL versions and non-empty migration rules | ✔ |
| ③越权能力注入被拒 | forbidden execution-surface keys ×8（script/eval/file/path/url/network/capability/permission 注入合法 fixture） | ✔ 各自专属错误码 + 诊断不回显注入值 |
| ④fixture 持续通过 | formal-business fixture maps to a controlled template model | ✔（16 validators、三字重、绑定值逐项断言） |
| ⑤绑定一致 | document schema binding（含注入漂移决定性）+ 跨契约 const 一致 + 字体绑定三形态 + 注册表 fail-closed | ✔ |

## 变异自证（实施者执行，变异后逐字节还原）

| 变异 | 结果 |
|---|---|
| 删文档契约绑定守卫 | 漂移注入测试**变红** ✔ |
| 删字体 family/version 绑定 | 字体绑定测试**变红** ✔ |
| 删字重注册绑定 | 字体绑定测试**变红** ✔ |

> 校验教训记录：一次跨文件 StrReplaceFile 编辑静默未命中（第二处替换未生效但工具报成功），导致首跑出现意外红灯；已养成「编辑后 grep 确认」习惯并修复。G1-05 安全守卫本身的变异归 template-model 既有契约测试承重（本包测试在映射边界复验，不重复变异）。

## 实施者验证

- `pnpm --filter @wenshu/template-map test`：**9 pass / 0 fail**。
- `pnpm verify` **exit 0 全绿**（含 quality/typecheck/supply/contracts 与 production build）。
- 零新增第三方依赖（SBOM 147→147，install 时供应链门禁已确认）；lockfile 仅新增 template-map importer（工具生成，未手编）。
- `contracts:test` 已串入 `@wenshu/template-map`（wiring 测试承重）；测试按 `.contract.test.ts` 命名自动登记层级。
- 冻结物零改动：schema/fixture/字体/生成物未触碰。

## 已知限制

- `ControlledTemplate` 与 schema 同形字段为透传（page/layoutTokens/paginationRules/validators/exportProfile），PA-04 消费时如需派生结构再行扩展；v0 不预设。
- 字体注册表绑定只验证 family/version/weight 逻辑一致性；字节身份与加载证据属 G1-13 清单门禁与 PA-03/PA-05 运行时门禁。
