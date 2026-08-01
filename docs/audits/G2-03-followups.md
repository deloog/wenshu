# G2-03 最终审计后续项

> 来源：[G2-03 Claude 审计报告](G2-03-claude-audit-report.md)。G2-03 已获 `PASS`（首审 `CONDITIONAL PASS`，MA-01 经复审关闭），59 条独立探针零失败。本文件只登记不阻塞该完成结论的后续项。
> 建立依据：本仓惯例（`G1-07`～`G1-11`、`PA-01`、`PA-05`～`PA-11B` 等已有 `*-followups.md`）。G2-03 签署时这些项只写在审计报告正文，无归属与关闭点，故补建本文件。

## MI-01：`.ets` 文件在 ArkWeb 壳之外不可见

- **级别**：MINOR。
- **事实**：`layering.ts` 对 `.ets` 结尾的文件一律 `continue`，且只在路径位于 `apps/arkweb-shell` 之下时计入 `ignoredArkTsFiles`。`.ets` 亦不在 `CODE_EXTENSIONS` 内。因此若 `.ets` 出现在 `packages/**` 或其他 app 下，既不被检查也不被计数。
- **当前影响**：零。实测 `arkTsIgnored=3`，全部为 `apps/arkweb-shell/entry/src` 下的 ArkTS 源码；仓内他处无 `.ets`。
- **归属**：与 NO-03 同批，由业主在 ArkWeb 进入生产代码承诺前裁定。
- **验收**：`.ets` 出现在未登记 ArkTS 归属的 workspace 时必须失败或至少计数可见；须有真实文件反例。不得以"当前无此文件"替代规则。
- **最迟关闭点**：任何 `packages/**` 首次引入 ArkTS 源码之前。

## MI-02：`isUsedByScript` 用子串匹配，是脆弱的放行规则

- **级别**：MINOR。
- **事实**：反向生产依赖检查以 `script.includes(dependency)` 判定"依赖被 `package.json` 脚本命令使用"。子串匹配会把任何命令行中恰好出现该包名的情况判为已使用。
- **当前影响**：零。实测反向扫描在真库上零发现，且现有 workspace 包无"仅经脚本命令使用"的生产依赖。
- **风险方向**：这是**放行规则**，松匹配的失效方向是"把真正未使用的依赖判成已使用"，与 fail-closed 相反——与任务书 r4 裁定二拒绝自动识别 `node_modules` 资源路径的理由同源。
- **归属**：下一次触及 `tools/quality` 依赖检查的任务。
- **验收**：改为精确的命令行分词匹配，或改为与资源型依赖同样的显式登记；须有"包名出现在无关路径中"的误放行反例。
- **最迟关闭点**：首次出现"仅经脚本命令使用"的生产依赖之前。

## MI-03：包根配置文件不受分层检查（`apps/web/vite.config.ts`）

- **级别**：MINOR。
- **事实**：`ruleSetFor` 只对 `<workspace>/src` 施加严格规则集、对 `test/` 与 `scripts/` 施加辅助规则集，其余位置计入 `unclassifiedFiles` 后跳过。实测 `unclassifiedFiles=3`：`apps/arkweb-shell/hvigorfile.ts`、`apps/arkweb-shell/entry/hvigorfile.ts`（符合任务书 r3 §2.6 工具链边界裁定）、**`apps/web/vite.config.ts`**。
- **当前影响**：低。Web 核心入口的构建配置不受分层检查；但计数已在覆盖输出中公开披露，不构成隐藏豁免。
- **归属**：`A-01`/`A-02`，即 `apps/web` 首次承载真实产品代码时。
- **验收**：为包根配置文件确定规则集归属（可裁定为"构建配置沿用辅助规则集"），并给出反例；不得以"配置文件不发布"作为免检理由而不留书面裁定。
- **最迟关闭点**：`apps/web` 承载生产代码之前。
- **处置注记（2026-08-01，`A-01`）**：**已消费关闭**。裁定 = 构建配置沿用辅助规则集（`*.config.{ts,mts,cts}` 包根 + `hvigorfile.ts` 任意深度），书面裁定落 [ADR-0028 §4](../adr/0028-A-01Alpha信息架构状态机冻结与缺失设计稿处置.md)；反例三条（electron/L3 壳/@ohos 注入 `vite.config.ts` 分别触发 ELECTRON_FORBIDDEN/LAYER_DIRECTION_FORBIDDEN/ARKTS_FORBIDDEN）与正面三条（node:* 放行、计入 auxiliaryFiles、全仓 unclassified 14→11）均在 `tools/quality/test/layering.integration.test.ts`；触发时点即 D2 裁定原型可运行。

## MI-04：平台宇宙由"有壳登记"派生，无壳平台无法表达为处处禁止

- **级别**：MINOR。
- **事实**：`platformViolation` 的平台前缀集合为 `LAYERED_WORKSPACES.flatMap(w => w.platformNamespaces ?? [])`，即只有被某个 workspace 登记为自有平台的前缀才算平台说明符。实测：L0 包 `src` 中 `import "@capacitor/core"` **零发现**。
- **与规范的关系**：宪法 11 与[技术基线 §2](../technical-baseline.md) 均明文点名 Capacitor。任务书 §1 已在 r7 收窄表述，明确覆盖范围以已登记平台命名空间为界，不得读作"宪法 11 已被完全机械化"。
- **当前影响**：零。Capacitor 不在依赖树；Android/iOS 由技术基线 §3 与[路线图 §1.2](../implementation-roadmap.md) 列为首战范围外。修复前同样不覆盖，非回归。
- **归属**：引入任何 Capacitor 或移动端壳之前。
- **验收**：数据模型增加"无主平台命名空间"表达（全局禁止列表，仍在同一手写真源内），并以 `@capacitor/core` 在 L0 包中的反例验证；同时须有已登记壳导入自有平台的反向反例，避免修成"禁止全部平台"。
- **最迟关闭点**：任何移动端壳登记为 workspace 之前。

## NO-01：`phantom-dependencies.ts` 已达 349 行，触发体量预警

- **级别**：NOTE，不要求立即整改。
- **事实**：该文件当前 349 行，越过宪法 19 的 300 行预警线（硬上限 400）。它同时承担 AST 采集、正向（导入未声明）与反向（声明未使用）三职。实施记录已如实登记，未放宽护栏。
- **当前影响**：仅预警，不阻断。G2-03 已把平台判定拆出为 `layering-platform.ts`（39 行），拆分方向已有先例。
- **归属**：下一次修改该文件的任务。
- **验收**：按职责拆分（建议反向检查独立成模块），不得为过行数规则机械切碎（宪法 19）。
- **最迟关闭点**：该文件触及 400 行硬上限之前。

## NO-02：worktree 依赖安装与非交互会话下的 pnpm 中止

- **级别**：NOTE。
- **事实**：G2-03 的验证曾因 g203 worktree 的 `node_modules` 系在 C 盘旧 Node 24.13.0 下安装，导致 pnpm 判定安装上下文变化并在无 TTY 会话中以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 中止。
- **更正记录**：审计报告 NO-02 曾表述为"复现需要一条未写入任何文档的路径"。**该表述有误**——[开发环境说明](../development-environment.md) 早已记载 `D:\Applications\Node\node-v24.17.0-win-x64`、C 盘旧 Node 并存事实，以及"项目会话必须把 D 盘路径置于 `PATH` 前部"与具体初始化命令。是审计方未读该文档。
- **已处置**：本轮已在[开发环境说明](../development-environment.md)新增"Git worktree 的依赖安装"一节，写明 worktree 需独立安装、非交互中止的症状、正确处置，以及**不得用 `CI=true` 绕过**、直调检查脚本只适用于诊断而非取得验收证据。
- **剩余操作项**：`D:\wenshu-g203` worktree 的依赖需在交互式会话中按初始化步骤重装一次，之后其 `pnpm verify` 方可作为证据来源。**由业主执行，非代码变更。**
- **最迟关闭点**：下一次需要在该 worktree 取得验收证据之前。

## NO-03：Hvigor 插件版本在仓内未固定

- **级别**：NOTE，已在任务书 r3 §2.6 第 4 条登记。
- **事实**：`apps/arkweb-shell/hvigorfile.ts` 与 `entry/hvigorfile.ts` `require("@ohos/hvigor-ohos-plugin")`，该说明符在 `package.json`、`oh-package.json5`、`hvigor/hvigor-config.json5`（`dependencies: {}`）、`oh-package-lock.json5` 四处均未声明，由 IDE 自带 Hvigor 6.24.3 供给。
- **当前影响**：ArkWeb 构建依赖 IDE 自带版本，**不具备仓内可复现性**。换机或 DevEco 升级后产物可能变化而无从察觉。
- **不得混淆**：G2-03 对这两个具名文件的 npm 依赖归属扫描排除，**不代表该缺口已解决**；任务书 §2.6 第 4 条与实施记录均已明确。
- **归属**：`R-COMPAT`/供应链，属 `PA-14H` 边界。修复须触及 ohpm 侧清单并需华为 registry 访问。
- **最迟关闭点**：ArkWeb 进入任何交付承诺之前；由业主裁定立任务时点。
