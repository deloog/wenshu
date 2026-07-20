# G1-09 CF-01 整改记录

> 状态：已实施，待原 Claude 审计者复核　日期：2026-07-20

本记录不代表 `CF-01` 或 `RA-01` 已关闭；关闭权仍属于出具 [G1-09 审计报告](G1-09-claude-audit-report.md)的独立审计者。

## 实施内容

- 恢复不带 `files` 限定的 `eslint.configs.recommended`，使基础缺陷规则继续覆盖 TypeScript 与既有 JavaScript 文件。
- 新增仅匹配 `**/*.jsx` 的解析块，使 `.jsx` 进入扁平配置匹配面并启用 JSX 语法解析；该块不替换或复制 recommended 规则。
- 在质量工具包新增 `eslint-config.unit.test.ts`，通过 ESLint 官方 `calculateConfigForFile` 执行检查：四种 TypeScript 扩展名和 `.js/.mjs/.cjs` 必须保有 `no-debugger`、`use-isnan`、`valid-typeof`；`.jsx` 必须保有 recommended，TypeScript 还必须保有 `@typescript-eslint/no-explicit-any`。

## 待复核判据

- `.ts` 上实际启用的 recommended 规则恢复到 45 条，`.js` 与 `.jsx` 均为 64 条。
- 含 `debugger` 或无效 `typeof` 比较的 TypeScript 真实探针必须被 ESLint 拒绝；不得只检查配置对象。
- `.jsx` 的合法 JSX 能解析，未使用变量等缺陷能失败。
- `pnpm verify` 全绿，新增质量工具单元测试被分层发现并真实执行；无新增依赖、宽泛 ignore、`any` 或抑制指令。

## 自检结果

- ESLint 官方配置求解：recommended 的 64 条规则中，`.ts` 实际启用 45 条、`.js` 64 条、`.jsx` 64 条，与审计报告给出的目标矩阵一致。
- 真实负向探针：TypeScript 同时命中 `no-debugger` 与 `use-isnan`；JSX 命中 `no-unused-vars`。探针文件已删除，无工作树残留。
- `pnpm verify`：exit 0；质量护栏覆盖 59 个源码/配置文件和 193 个仓库文件；15 个测试文件完成分层；118 项测试全部通过；9 个包 typecheck 与生产构建通过；无体量预警。
- 新增配置测试作为质量工具包的第 6 个单元测试文件被自动发现并真实执行，两项断言均通过。
- `pnpm-lock.yaml`、`tsconfig.base.json`、冻结 Schema 与生成物均未修改；未新增依赖或 ignore。
