# G2-03 实施记录 · 核心/工具/壳分层门禁

- 日期：2026-07-30
- 状态：已实现，待 Claude 独立审计
- 基线：任务书 r5；实施分支 `agent/g2-03-layering`
- 运行时：Node `v24.17.0`、pnpm `11.15.1`、TypeScript `6.0.3`

## 交付

- `tools/quality/src/layering-registry.ts` 是唯一手写归属真源：29 个
  workspace、两个具名 Hvigor 排除项、`probes/` 顶层排除项与空的资源型依赖表均由
  此文件派生。
- `layering.ts` 使用 TypeScript AST 采集 ESM、re-export、动态 import、CJS
  `require()`、`import = require()` 与 reference；说明符按 bare/node/relative/
  absolute/drive 计数。路径说明符必须解析到登记 workspace，未登记目标以
  `UNREGISTERED_PATH_TARGET` fail-closed。
- `src/` 适用严格规则；`test/` 与 `scripts/` 使用 r5 的辅助规则集：仅 `node:*`
  放宽，`electron`、`@ohos.`、`@ohos/` 仍仅 L3；依赖方向保留严格方向并额外允许
  同层和 L2。包根等其余目录未套规则但在 `unclassifiedFiles` 计数中可见。
- 反向生产依赖扫描只检查 `dependencies`，子路径归一化为包名；`@types/*` 不再按
  前缀静默放行，读取本包 `tsconfig.json` 的 `compilerOptions.types`。
- 默认稳定 ID 随机源改为 `globalThis.crypto.getRandomValues`，没有位置输入；ADR-0023
  记录 PB-02～05 结论不变。`@sqlite.org/sqlite-wasm` 已从 project-storage 的生产
  依赖移除，SBOM 经工具重建。

## 真实执行结果

| 命令 | 结果 |
|---|---|
| `node --test tools/quality/test/layering.integration.test.ts` | 2/2 通过：L0 路径逃逸、L1 test CJS Electron 均失败；test/scripts 的 `node:*` 通过。 |
| `pnpm --filter @wenshu/quality test` | 18/18 通过；含 CJS/import-equals 采集、子路径归一化、未配置 `@types/node` 失败、tsconfig 配置后通过。 |
| `pnpm --filter @wenshu/quality typecheck` | exit 0。 |
| `pnpm --filter @wenshu/quality check` | exit 0；覆盖为 `workspaces=29 sourceFiles=326 auxiliaryFiles=139 unclassifiedFiles=3 emptyImports=37`，说明符 `bare=237,node=512,relative=697,absolute=0,drive=0`，语法 `esm=1272,export-from=156,dynamic=4,require=14,import-equals=0,reference=0`，ArkTS 忽略 3。 |
| `pnpm verify` | exit 0，273.5 秒。 |

## 未执行项与环境边界

- 任务书 r5 的 31 条独立反例矩阵尚待 Claude 构造并独立执行；本记录不把上述实现者
  定向测试冒充为独立验收。
- 本机曾存在由 Node 24.13 安装留下的 worktree `node_modules` 状态；在正确的
  Node 24.17.0 下，非 TTY pnpm 仍会要求重建该可再生目录。实现验证在隔离 worktree
  的 CI 语义中完成；不得以设置 `CI=true` 冒充该旧安装状态已经在所有用户会话消除。
- `@ohos/hvigor-ohos-plugin` 仍由 DevEco/ohpm 供给，版本未在仓内固定；这是已登记的
  R-COMPAT/供应链边界，不因具名扫描排除而视为解决。
- 质量护栏对 `tools/quality/src/phantom-dependencies.ts` 的 300 行预警仍存在；未放宽
  护栏，也未在本任务作无关拆分。
