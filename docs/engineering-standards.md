# G1-09 工程质量与本地验证标准

> 状态：首审 `FAIL` 后已整改，待原审计者复审　日期：2026-07-20

## 1. 单一验证入口

`pnpm verify` 是本地与后续 CI 的唯一完整入口，依次执行格式检查、ESLint、仓库质量护栏、测试分层与单元测试、配置契约、生成漂移与全部契约测试、逐包严格类型检查和生产构建。任何子项非零退出都使总入口失败；不得另设一个更宽松的“绿色”入口。

格式基线由 Prettier 3.9.5 执行，静态检查由 ESLint 10.7.0、`@eslint/js` 10.0.1 和 typescript-eslint 8.64.0 执行。版本、许可证、官方来源与完整性值冻结在 `toolchain.versions.json`。构建目录、依赖目录、测试证据、临时探针和 Schema 自动生成声明是明确的机器产物边界；不得借此忽略手写生产或测试代码。

## 2. TypeScript 与禁止绕过

- 所有手写生产、测试、脚本和根级 TS 配置均由所在包的 `tsc -p tsconfig.json` 检查；`.ts`、`.tsx`、`.mts`、`.cts` 使用同一门禁，已知代码扩展名的大小写变体直接失败。
- 仓库检查逐包解析真实 tsconfig 文件集合；任一 `.ts/.tsx` 位于检查集合之外，或包缺少精确的 typecheck 命令，立即失败。
- `strict`、`noImplicitAny`、`useUnknownInCatchVariables`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 必须开启，`skipLibCheck` 必须为 false。
- TypeScript AST 独立拒绝显式 `any`；编译器负责拒绝隐式 `any`。同时拒绝 TypeScript 检查抑制指令和 ESLint 内联禁用，不能以降低严格度换取通过。
- 第三方和生成声明必须在适配边界收窄为安全项目类型。每个生成文件必须由所在包 `package.json` 的 `wenshu.generatedFiles` 精确登记并真实存在；`src/generated/` 中任何未登记文件直接失败，不能凭目录名取得豁免。已登记自动生成代码只豁免手写体量阈值，仍接受格式、lint、禁止语法和生成漂移检查。

## 3. 文件体量与拆分

手写 TypeScript 从 300 行起预警。生产代码超过 400 行失败，测试代码超过 500 行失败；边界的 299/300/400/401 与 299/300/500/501 均有正反单元测试。预警不是立刻机械切文件，而是要求在下一次实质修改时评估按领域、功能、责任、数据与副作用边界拆分。

禁止为规避行数而机械切片，也禁止形成无清晰归属的 `utils`、`types` 或 `helpers` 大杂烩。一个模块应有可说明的单一责任和稳定依赖方向。

## 4. 契约诊断与生成物

所有已提交非法 fixture 必须同时声明预期稳定 issue code 和精确 JSON path，测试只有两者同时命中才通过。项目契约已将原先过载的完整性问题拆为裁决、责任、哈希、时间戳、包路径、上游兼容和模型标识七类稳定码；普通 Schema、引用、重复 ID 与真源/派生问题继续使用既有码。

`pnpm generated:check` 动态发现并运行所有工作区包的 `generate:check`。它必须在生成文件未变时通过，任一生成文件字节偏离 Schema 生成结果时失败。质量门禁另核对生成文件登记表：有生成检查的包必须登记产物，登记缺失、文件不存在或生成目录混入未登记文件均失败。生成声明只能通过生成脚本恢复，不得手工维护。

## 5. Host 路径安全补强

Host 值级预检在任意字段和嵌套位置拒绝 NUL/控制字符，以及带任意普通前缀的盘符绝对路径、边界明确的盘符相对路径、POSIX/UNC 路径、`file:` URL 和 `..` 穿越片段。百分号编码最多解码 16 轮；疑似畸形编码、无效 UTF-8 或在预算内仍未稳定的值按不安全处理，普通文本中的裸 `%` 不按编码处理。相对文件名、受控 `word:word` 标识、百分比文本以及 HTTP/HTTPS URL 有正向对照，防止规则误杀。

这仍是具体 capability payload Schema 之前的纵深预检，不替代真实 Host 实现开工前冻结每项输入输出 Schema。

## 6. 常用命令

```powershell
pnpm format
pnpm format:check
pnpm lint
pnpm quality:check
pnpm generated:check
pnpm typecheck
pnpm verify
```

Windows 会话必须先按 [开发环境基线](development-environment.md) 使用 D 盘 Node、pnpm 与缓存。测试数据库、集成测试和 E2E 尚未进入本任务；后续仍须使用真实生产同类引擎、真实迁移和隔离资源，并对可安全并行的用例组织并行执行。
