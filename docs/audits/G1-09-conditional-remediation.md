# G1-09 条件通过后的补充整改记录

> 状态：已实施，待原 Claude 审计者针对性确认　日期：2026-07-20

本记录只说明实施动作和自检范围，不代表发现已经关闭。`RA-01`～`RA-04` 的关闭权仍属于出具 [G1-09 审计报告](G1-09-claude-audit-report.md)的独立审计者。

| 发现 | 实施动作 | 针对性确认重点 |
|---|---|---|
| RA-01 `.jsx` 无 ESLint 配置 | JavaScript 配置显式覆盖 `.js/.jsx/.mjs/.cjs`，并为 JSX 启用解析 | `eslint --print-config` 对 `.jsx` 返回推荐规则；含未使用变量的 JSX 探针必须失败 |
| RA-02 三种绝对路径漏检 | Host 值级预检统一拒绝边界位置出现的 `/` 或 `\\` 根路径起始；加入正斜杠 UNC、多斜杠 POSIX 与单反斜杠根路径反测 | 报告列出的四个原始反例及带前缀变体均拒绝；HTTP/HTTPS 与相对路径正例不回归 |
| RA-03 生成登记不去重 | 每包按解析后的绝对路径、不区分大小写去重；重复项产生明确 finding 且不重复授予生成文件身份 | 完全重复、大小写变体和等价路径不得重复登记；合法登记不回归 |
| RA-04 fixture 路径不唯一 | 负向 fixture 改为只缺 `revision`；运行时按已声明 `contract_kind` 选择对应 Schema 分支，避免顶层 `oneOf` 的无关错误污染；新增精确 issues 数组断言 | 结果必须恰好为 `PROJECT_SCHEMA@/revision`；改断言为 `/` 或 `/title` 均失败 |

## 自检结果

- `pnpm verify`：exit 0；质量护栏覆盖 58 个源码/配置文件和 190 个仓库文件；14 个测试文件全部完成分层；116 项测试全部通过；9 个包 typecheck 与生产构建通过；无体量预警。
- `.jsx` 破坏性探针：临时加入含未使用变量的 `.jsx` 后，ESLint 以 `no-unused-vars` 失败；探针随后删除，工作树无残留。
- Host：报告所列正斜杠 UNC、多斜杠 POSIX、单反斜杠根路径及其 `output=` 前缀变体全部返回 `HOST_PLATFORM_FIELD_FORBIDDEN@/output/grant_id`；相对路径、百分比、HTTP/HTTPS 正例全部通过。
- 生成登记：完全重复、大小写变体与 `./` 等价路径均只授予一次生成身份并产生重复登记 finding。
- 项目契约：只缺 `revision` 的对象恰好返回一项 `PROJECT_SCHEMA@/revision`，不存在 `/` 或 `/title` 伴随错误。

整改未新增依赖、未放宽 TypeScript 严格度，也未宣称进入 G1-11。
