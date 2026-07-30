# 分层门禁实施任务书（草案）

> 状态：**r6（2026-07-30）已裁定**。审计结论 CONDITIONAL PASS，MA-01 待关闭，见 §2.11 与 [审计报告](G2-03-claude-audit-report.md)。任务 ID `G2-03`，已登记路线图 §8 与 §10，DoR 全局前提已满足。
> **恢复实施前需业主确认一项**：§2.9 的 `tools/*` 归属补录（起草遗漏，冻结表需业主确认后生效）。其余 r4 裁定（§2.8）可直接执行。
> r1 GPT 复核、r3/r4 实施期停止上报的处置见 §11。
> 提出者：Claude（独立审计者）。实施者：Codex。最终审计：Claude。
> 权威来源：宪法 11、宪法 6、[技术基线 §2](../technical-baseline.md)（"Web 核心不能 import 或直调 Electron、ArkTS、Capacitor 等平台 API"）、[ADR-0003 决策 5](../adr/0003-v0-Host能力协议与平台隔离.md)（"Electron IPC、Node、ArkTS 类型不得进入公共协议"）、`R-HOST`、`R-TEST`。
> 证据基线：HEAD `fc1c5a9`（PB-09 已合并），工作树干净。

## 0. 业主裁定（已完成，2026-07-30）

业主已批准以下两项，DoR 全局前提第 3 条（"任务存在于通过审计的路线图中，并有稳定任务 ID"）由此满足：

1. **任务 ID `G2-03` 与路线图登记。** 本任务是 G2 类工程门禁，与已签署的 G2-01（DoD/评审）、G2-02（分支保护/供应链门禁）同级。已按[路线图 §11](../implementation-roadmap.md) 变更规则登记至路线图 §8 任务表与 §10 双向追踪矩阵（`R-HOST`、`R-TEST` 两行的验证列）。
2. **§3 分层归属表已冻结。** 该表自本版起是门禁的判定依据。**实施者不得为让检查变绿而调整归属**；若实测证明某处归属不可行，按 §9 停止并上报，由业主重新裁定后更新本表。归属变更须走 ADR。

## 1. 单一目标

每次 CI 运行都能在合并前拦下"核心层获得平台能力或宿主文件能力"的依赖方向违规，使宪法 11 与技术基线 §2 从人工审计事项变为机械门禁事项。

## 2. 为什么现在做（事实基础）

### 2.1 当前平台隔离是干净的

全仓实测：`electron` 仅出现在 `apps/electron-shell/src/main.cjs`、`apps/electron-shell/src/preload.cjs`；`@ohos.web.webview` 仅出现在 `apps/arkweb-shell/entry/src/main/ets/pages/Index.ets`；`packages/**` 零平台导入。**本任务因此是防回归门禁，不是修复任务。**

### 2.2 但"分层"从未被声明，所以无法校验

`packages/*` 下 20 个包实际混着三类东西，仓库里没有任何文件声明哪个包属于哪一层。按 `src/` 目录（不含 `test/`、`scripts/`）是否导入 Node 内建实测：

| src 无 `node:*` 导入（13 个） | src 有 `node:*` 导入（7 个） |
|---|---|
| config、contract-runtime、document-model、editor-diff、editor-transactions、host-contract、project-contract、report-checks、semantic-audit、semantic-tools、template-css、template-map、template-model | markdown-import、pdf-evidence、pdf-export、project-storage、report-render、semantic-editor、test-support |

没有归属声明，就写不出可判定的规则——这与路线图依赖关系的问题同源：**门禁只能检查已定义的关系。**

### 2.3 已有一处实证违规，且是人工审计漏掉的

- [packages/semantic-editor/src/ids.ts:1](../../packages/semantic-editor/src/ids.ts) 硬导入 `node:crypto` 的 `randomBytes` 生成稳定 ID；全仓 `crypto.getRandomValues` 零命中。
- [packages/editor-diff/src/review.ts:72](../../packages/editor-diff/src/review.ts) 在 `src` 中直接 `new RandomIdAllocator()`，把 Node-only 实现固化进生产路径。
- 后果：宪法 6 的稳定 ID 不变量，其默认实现无法在浏览器运行，与技术基线 §1"统一 TypeScript Web 核心跨浏览器/Electron/ArkWeb 复用"冲突。`apps/web` 尚未消费 editor-diff，故当前无功能故障。
- **`IdAllocator` 接口已存在**，注入平台中立实现的抽象点是现成的，修复面小。
- [PB-02 审计报告 §32](PB-02-claude-audit-report.md) 曾判定该包"分层严格"。该判定针对"是否夹带事务/CRDT/UI"，结论本身成立，但未覆盖"该层是否仍可在浏览器运行"。**一次人工分层审计放过了平台耦合，机械规则不会。**

### 2.4 时点：PB-10 是边界真正落地的任务

`PB-10`（实现原子保存、崩溃恢复与 host 文件边界，`R-HOST/R-DATA`）尚未开始（`docs/audits/` 无 PB-10 条目）。而 [packages/project-storage/src](../../packages/project-storage/src) 今天已直接使用 `node:sqlite`、`node:fs`、`node:fs/promises`、`node:path`。PB-10 若把该路径留在核心层，今天没有任何机制会失败。门禁应在 PB-10 开工前就位。

### 2.5 附带发现（供应链归属错位，MINOR）

[packages/project-storage/package.json:14](../../packages/project-storage/package.json) 把 `@sqlite.org/sqlite-wasm@3.53.0-build1` 声明为生产依赖，但该包 `src`/`test`/`scripts` 全无引用；真正的使用者 `probes/pb-08-sqlite/` 已在自己的 `package.json` 中声明同一依赖。现有 [phantom-dependencies](../../tools/quality/src/phantom-dependencies.ts) 只检查"导入但未声明"，不检查"声明但未导入"，故未被拦下。后果是 SBOM 把一个浏览器 WASM 依赖挂在不使用它的核心包名下。

### 2.6 DevEco/Hvigor 工具链边界（r3 裁定，实施中暴露）

实施者按 §9 停止条件正确上报：补齐 CJS `require()` 采集后，既有 `phantom-dependency` 检查开始能看见此前不可见的文件，在 `apps/arkweb-shell/hvigorfile.ts:1` 与 `apps/arkweb-shell/entry/hvigorfile.ts:1` 命中 `require("@ohos/hvigor-ohos-plugin")`，而该说明符在仓内四处清单均未声明。

**事实核验**：`@ohos/hvigor-ohos-plugin` 未出现在 `apps/arkweb-shell/package.json`、`oh-package.json5`（仅声明 `@ohos/hypium`、`@ohos/hamock`）、`hvigor/hvigor-config.json5`（`dependencies: {}`）或 `oh-package-lock.json5`；`pnpm-lock.yaml` 中 `@ohos` 零命中；`node_modules/@ohos` 不存在。它由 IDE 自带的 Hvigor 运行时在 DevEco 构建时解析。

**边界已由 G1-12 定过**：[deveco-environment.md](../deveco-environment.md) 记载 Hvigor 6.24.3 / OHPM 6.1.2.285 位于 `D:\DevEco Studio\tools\`，并明文"这套内置 Node/JBR 只服务于 HarmonyOS 工具链，不替代本项目已锁定的 Node 24.17.0"；同文档亦记录 Hvigor 自带 `pnpm@10.28.2` 且不影响本项目。即 **HarmonyOS 工具链是 IDE 供给的独立宇宙，不参与本项目锁定的 npm 依赖树**。

**裁定**：

1. **禁止**在 `apps/arkweb-shell/package.json` 声明该依赖。`@ohos/hvigor-ohos-plugin` 位于华为 ohpm 仓而非 npm；声明它会使 pnpm 向 npm registry 解析、破坏 `pnpm install --frozen-lockfile`（lockfile 中 `@ohos` 零命中），并把华为 registry 依赖错误写入 SBOM 与许可证基线。
2. **npm 依赖归属扫描须排除 Hvigor 构建脚本**，且排除必须显式、窄口径、fail-closed：
   - 仅排除具名文件 `apps/arkweb-shell/hvigorfile.ts` 与 `apps/arkweb-shell/entry/hvigorfile.ts`；
   - **不得**排除 `apps/arkweb-shell` 整体——`entry/src` 与 `scripts/*.mjs` 属 npm 宇宙代码，必须留在扫描范围内；
   - 出现未登记的新 `hvigorfile.ts` 时检查器必须失败，不得让豁免随目录增长静默扩大。
3. **分层规则不受影响**：`apps/arkweb-shell` 属 L3，`@ohos/*` 在 L3 合法。本发现是 npm 依赖归属问题，不是分层违规，§3 归属表无需变更。
4. **另立跟进项（不属 G2-03，待业主裁定时点）**：`@ohos/hvigor-ohos-plugin` 的版本在仓内完全未固定，ArkWeb 构建依赖 IDE 自带 Hvigor 6.24.3，**不具备仓内可复现性**。这是 `R-COMPAT`/供应链缺口，修复须触及 ohpm 侧清单并需华为 registry 访问，属 PA-14H 边界。G2-03 不处理，也不得以"已排除扫描"掩盖该缺口。

### 2.7 `@ohos.` 与 `@ohos/` 是两个命名空间（r3 精度修补）

- `@ohos.*`（点号）= HarmonyOS **系统模块**，如 `apps/arkweb-shell/entry/src/main/ets/pages/Index.ets:1` 的 `@ohos.web.webview`。地位类同 Node 的 `node:*`。
- `@ohos/*`（斜杠）= **ohpm 包**，如 `@ohos/hvigor-ohos-plugin`、`@ohos/hypium`。

§3 归属表中"禁止 `@ohos.*`"须理解为**两种形式一并禁止**：L0/L1/L2 均不得出现 `@ohos.` 或 `@ohos/` 任一形式，仅 L3 允许。实现时不得只匹配点号形式。

### 2.8 反向扫描域、资源型依赖与子路径归一化（r4 裁定，实施中暴露）

实施者第二次按 §9 停止上报：Hvigor 排除生效后，反向生产依赖扫描在 `probes/pb-08-sqlite/package.json` 命中 `@sqlite.org/sqlite-wasm`，其真实用法是 `browser-opfs.integration.test.ts:10` 的 `join(root, "node_modules", "@sqlite.org", "sqlite-wasm", "dist")`——文件系统资源路径，不属 §6.1 冻结的六种"算作已使用"形式。**处置正确。**

#### 裁定一：反向扫描域 = 已登记归属的 workspace 包，`probes/` 排除

- `pnpm-workspace.yaml` 只纳管 `apps/*`、`packages/*`、`tools/*`；**`probes/` 不是 pnpm workspace 成员**。
- `probes/pb-07-yjs` 与 `probes/pb-08-sqlite` 各自带 **npm** `package-lock.json`，是刻意隔离的独立依赖宇宙。
- 各探针**已自带供应链校验**：`probes/pb-08-sqlite/supply.contract.test.ts:21,27` 对自己的 lockfile 断言精确 tarball URL 与版本 `3.53.0-build1`。
- §2.5 反向扫描的目的是抓 **workspace 包**的生产依赖错位；原目标 `packages/project-storage` 是 workspace 包，排除 `probes/` 不削弱它。
- 排除须写入归属声明并 fail-closed：出现既未登记归属、也未登记排除的新顶层目录时检查器必须失败。

#### 裁定二：不把"`node_modules` 资源路径"作为自动识别的使用形式

拒绝理由不是它不算使用，而是**自动识别在这里会朝危险方向失效**：

- 本案的路径由 `join()` 的多个独立字符串字面量拼成（`"node_modules"`, `"@sqlite.org"`, `"sqlite-wasm"`, `"dist"`）。匹配单个字面量 `"node_modules/@sqlite.org/sqlite-wasm"` 的检查器**恰好会漏掉本案**；要抓住它需要常量折叠 `join`/`resolve` 参数，而变量、模板字符串、路径拼接链都能轻易绕过。
- 更关键：这是一条**放行规则**。放行规则一旦脆弱，失效方向是"把真正未使用的依赖误判为已使用"，与 fail-closed 原则相反。

**替代方案（须实现）**：若某个**已登记的 workspace 包**确因非模块原因需要某生产依赖（WASM 资源、二进制、fixture），必须在归属声明中登记为**资源型依赖**条目并写明理由；检查器只读该登记表（单一真源），未登记的未使用生产依赖仍然失败。

**该登记表当前应为空。** 已核实 workspace 包的第三方生产依赖只有 `ajv`（7 个包）、`prosemirror-model`（semantic-editor）、`yaml`（tools/supply-chain）、`@sqlite.org/sqlite-wasm`（project-storage），前三者均为常规模块导入。故反向扫描的**预期命中仍恰为 1 处**：`project-storage` 的 `@sqlite.org/sqlite-wasm`（§2.5）。出现第二处须书面裁定。

#### 裁定三：子路径说明符必须归一化为包名（正反两个方向）

`ajv` 的实际导入形式是 `import Ajv2020 from "ajv/dist/2020.js"`（见 `packages/config/src/index.ts:1`、`document-model/src/index.ts:1`、`host-contract/src/contract.ts:1` 等）。反向扫描若比对完整说明符，会把 **7 个包的 `ajv` 全部误报为未使用**。

归一化规则：非作用域包取首段（`ajv/dist/2020.js` → `ajv`）；作用域包取前两段（`@scope/pkg/sub` → `@scope/pkg`）。正向（导入但未声明）与反向（声明但未使用）**必须用同一套归一化**。

### 2.9 归属表补录：`tools/*`（r4，起草遗漏）

r0～r3 的 §3 归属表只覆盖 20 个 `packages/*` + 3 个 `apps/*` = 23 个包，**遗漏了 `pnpm-workspace.yaml` 同样纳管的 6 个 `tools/*` 包**（ci、environment、fixtures、fonts、quality、supply-chain）。按 §5.6 fail-closed，门禁会在这 6 个包上直接失败。

**这是起草遗漏，不是判断变更。** 补录为 **L2**，依据：

- 它们是仓库侧构建/校验工具，非交付产物，本就需要 `node:*`；
- `tools/quality` 依赖 `@wenshu/test-support`（L2）、`tools/environment` 依赖 `tools/fixtures` + `tools/fonts`，与 L2"可依赖 L0/L1/同层"一致；
- 已核实**无任何 `packages/*` 依赖 `tools/*`**，故不构成层序倒置。

因 §3 表已由业主冻结，本补录须由业主确认后生效；确认前实施者不得自行放行这 6 个包。

### 2.10 `test/` 与 `scripts/` 适用放宽规则集，而非豁免（r5 裁定）

r0～r4 的 §3 只写了"测试代码允许向上取用同层及 L2"，未说明平台导入。实现据此整体跳过 `test/` 与 `scripts/`，导致 **148 个文件（真库实测 335 个 source/config 文件中的 44%）完全不受分层检查**，L1 包的 `test/` 里 `require("electron")` 会通过。

**"收紧到与 `src/` 同规则"不可行**：真库实测 13 个 L0/L1 包的测试**全部**导入 `node:test` 与 `node:assert/strict`——本仓的测试运行器本身就是 Node 内建；`scripts/` 承担 schema→类型生成，本质需要 `node:fs`。施加 `src` 严格度会让每个 L0/L1 包立刻变红。

**裁定：把豁免从"全部"收窄为"仅 `node:*`"。**

| 目录 | `node:*` | `electron` / `@ohos.` / `@ohos/` | 层级方向 |
|---|---|---|---|
| `src/` | 按层判定（L0/L1/web 禁） | 仅 L3 允许 | 严格按 §3 归属表 |
| `test/` | **允许** | **仅 L3 允许（与 `src` 同）** | 放宽：同层 + L2 |
| `scripts/` | **允许** | **仅 L3 允许（与 `src` 同）** | 放宽：同层 + L2 |

平台导入不随 `node:*` 一起放开，理由：L1 包的测试若需要 `electron` 才能运行，这本身就是该 L1 代码存在隐藏平台依赖的征兆；且 `test/` 辅助代码被"临时"挪进 `src/` 是最常见的腐化路径，放开平台导入等于拆掉这条路径的护栏。测试代码不发布，但它是征兆，不是豁免理由。

实现层面：`isStrictSource` 应从"跳过"改为"选规则集"，`test/`、`scripts/` 之外的其他目录（如包根）保持现状处理并计入覆盖计数。

### 2.11 L3 的平台许可必须按壳区分（r6 裁定，审计发现 MA-01）

[G2-03 审计报告](G2-03-claude-audit-report.md) 的 MA-01：31 条反例中反例 7 失败——`apps/arkweb-shell` 导入 `electron` 未被拦。

**根因**：`layering.ts` 的 `platformViolation` 对 `electron` 与 `@ohos.`/`@ohos/` 两条判断都只问"来源是否 L3"，不问"是哪个壳"，因此两个壳可互相导入对方的平台 API。§3 归属表 L3 行明文"禁止：**另一个壳的平台 API**"，该反例自 r1 起在矩阵中，实现未覆盖。当前实际暴露为零（两壳均未导入对方平台 API），故为 MAJOR 而非 BLOCKER。

**裁定：平台命名空间按 L3 条目登记在归属声明中，不得硬编码进检查器。**

- `LayeredWorkspace` 新增可选字段，登记该 workspace 允许的平台命名空间前缀；`apps/electron-shell` 登记 `electron`，`apps/arkweb-shell` 登记 `@ohos.` 与 `@ohos/`。
- **fail-closed**：未登记平台命名空间的 workspace 一律不得导入任何平台说明符。新增 L3 壳在登记前自动被拒，不得因"是 L3"而默认放行。
- 理由与 Hvigor 排除（§2.6）、`probes/` 排除（§2.8）一致：例外必须显式、可复核、落在 §5.5 的单一手写真源里。检查器只读该表。
- `node:*` 的处理不变（L2/L3 的 `src` 与全部 `test/`+`scripts/` 允许），本裁定只涉及平台说明符。

**验收**：反例 7/16/32/33 构成的 2×2 矩阵四条同时成立（见 §6）。仅修反例 7 而未验证 #33 不成立——那会把"禁止对方平台"错做成"禁止全部平台"。

## 3. 分层归属（已由业主冻结，2026-07-30；`tools/*` 补录待确认，见 §2.9）

> 本表是门禁判定依据。基线为 HEAD `fc1c5a9` 的 20 个 `packages/*` + 3 个 `apps/*`。新增包必须先登记归属，否则门禁按 §5.6 fail-closed 失败。

| 层 | 成员 | 允许导入 | 禁止导入 |
|---|---|---|---|
| **L0 契约层** | config、contract-runtime、document-model、host-contract、project-contract、template-model | 仅同层与平台中立第三方 | `node:*`、`electron`、`@ohos.*`、L1/L2/L3 |
| **L1 纯逻辑层** | editor-diff、editor-transactions、semantic-audit、semantic-editor、semantic-tools、template-css、template-map | L0、同层、平台中立第三方 | `node:*`、`electron`、`@ohos.*`、L2/L3 |
| **L2 Node 侧工具/证据/存储层** | `packages/`：markdown-import、pdf-evidence、pdf-export、project-storage、report-checks、report-render、test-support<br>`tools/`：ci、environment、fixtures、fonts、quality、supply-chain（**r4 补录，见 §2.8**） | L0、L1、同层、`node:*` | `electron`、`@ohos.` 与 `@ohos/`、L3 |
| **L3 壳层** | apps/electron-shell、apps/arkweb-shell | L0、L1、L2、`node:*`、本壳平台 API | 另一个壳的平台 API |
| **Web 核心入口** | apps/web | L0、L1 | `node:*`、`electron`、`@ohos.*`、L2、L3 |

归属依据与需注意处：

- `report-checks` 归 L2 而非 L1，因为它在 `package.json` 中依赖 `pdf-evidence` 与 `pdf-export`（均为 L2）；归 L1 会立刻构成层序倒置。
- `template-css`、`pdf-export`、`report-render`、`pdf-evidence`、`report-checks` 的 `devDependencies` 含 `@wenshu/markdown-import` 等 L2 包，用于测试 fixture 构造。**`src/` 与 `test/`+`scripts/` 适用不同规则集，见 §2.10（r5 裁定）——注意是「换一套放宽规则」，不是「跳过不检查」。**
- L3 两个壳互不引用对方平台 API，是当前实测状态，需固化为规则。

## 4. 范围内 / 范围外

**范围内**

- 新增分层归属声明（单一真源，机器可读）与检查器实现。
- 接入现有 `pnpm verify` 与 CI `static` job（不新增 job，不改并行矩阵结构）。
- 关闭 §2.3 的 `semantic-editor` / `editor-diff` 平台耦合：**为 `IdAllocator` 的默认实现改用平台中立随机源**，并写 ADR 说明对 PB-02/03/04/05 既有结论的影响。
  - **不接受"把 `semantic-editor` 降到 L2"作为替代方案。** 该包是核心编辑逻辑，技术基线 §1 要求统一 Web 核心跨浏览器/Electron/ArkWeb 复用；降层等于承认核心编辑无法在浏览器运行，是用放宽归属换门禁变绿，属 §9 停止条件。
  - 平台中立随机源已确认可用：`globalThis.crypto.getRandomValues(new Uint8Array(16))` 在本仓锁定的 Node 与浏览器中均存在（Web Crypto 全局），位数与 `randomBytes(16)` 相同，不削弱 PB-02 的"ID 不依赖位置、内在随机"红线。实施者若选用其他随机源，须在 ADR 中给出等强度论证。
- 关闭 §2.5 的 `project-storage` 依赖归属错位。
- 为 phantom-dependencies 增补"声明但未导入"方向的检查。

**范围外**

- 不改任何 Schema、契约版本、既有测试断言口径、lockfile 中已冻结的第三方版本。
- 不改路线图（§0 由业主处理）。
- 不实现 PB-10 的 host 文件边界本身。
- 不重构 `report-render` / `pdf-export` 的 Node 用法——它们在 L2 内合法。
- 不处理路线图台账过期问题（另立任务）。

## 5. 实现约束

1. **零新增第三方依赖。** 不引入 dependency-cruiser 或同类工具：它会带来较大传递依赖树，触发许可证复审、SBOM 重建与冻结 lockfile 变更，与 `R-LICENSE`、[supply-chain 基线](../supply-chain.md) 的成本不成比例。复用现成 devDependency `typescript` 的编译器 API。

2. **只复用 AST 遍历，不复用说明符分类。** 可复用 [phantom-dependencies.ts](../../tools/quality/src/phantom-dependencies.ts) 的 `collectModuleImports`（它返回原始说明符，保留 `node:*`）。**不得复用同文件的 `packageNameOfSpecifier`**：该函数第 12–20 行对 `node:`、`./`、`../`、`/` 和盘符前缀一律返回 `undefined`，即恰好丢弃本门禁要检测的两类目标。说明符 → 层级的分类必须新写。

3. **相对路径必须解析到所属 workspace 包。** 每个 `./`、`../`、绝对路径与盘符说明符，须解析为真实文件路径，再映射到包含它的 workspace 包，然后套用层级规则。否则 L0/L1 可用 `../../report-render/src/x.ts` 直接穿透到 L2 源码，绕过"包名→层级"判定。

4. **必须覆盖 CommonJS 与 Node 全局能力。**
   - `collectModuleImports` 现只处理 `ImportDeclaration`、`ExportDeclaration ... from`、动态 `import()` 与 `/// <reference types>`（第 62–99 行），**完全不处理 `require()`**。
   - 后果已可实证：全仓唯一的平台导入全部是 CJS——`apps/electron-shell/src/main.cjs:1`、`preload.cjs:1` 的 `require("electron")` 与 `electron-session.cjs:1` 的 `require("node:fs/promises")`。`.cjs` 虽在 `CODE_EXTENSIONS`（[guardrails.ts:41](../../tools/quality/src/guardrails.ts)）内被扫描和解析，但其导入列表返回空。不补齐则 §1 的"拦下核心层获得平台能力"是夸大表述。
   - 至少须覆盖静态 `require("...")` 与 `import x = require("...")`。
   - 须**显式裁定** Node 全局能力策略：`process`、`Buffer`、`process.getBuiltinModule()`、`globalThis.process`。裁定结果可以是"本期不检测"，但必须写明并列为已知边界，不得默认沉默。

5. **归属声明是唯一手写真源。** 层的成员表只写一处；检查器从它派生，不得在检查器里再抄一份包名列表。

6. **fail-closed。** 出现未登记归属的新包，检查器必须失败，而不是默认放行。
7. 遵守宪法 19 体量护栏（生产 300 预警 / 400 上限）。
8. 不得用 `as any`、`@ts-ignore`、eslint 全局豁免绕过既有质量护栏（宪法 18）。

## 6. 验收标准

正向：

- [ ] `pnpm verify` 与 CI `static` job 在干净树上通过，且检查器实际遍历到全部 20 个 `packages/*` + 3 个 `apps/*`（须输出覆盖计数，不接受静默跳过）。
- [ ] 归属声明覆盖全部现有包，无未登记项。

反例矩阵——每条必须**独立复跑并观察到失败**，且失败信息指出违规文件、导入说明符与被违反的规则：

| # | 构造的违规 | 期望 |
|---|---|---|
| 1 | 在 L0 包 `src` 中 `import { randomBytes } from "node:crypto"` | 失败 |
| 2 | 在 L1 包 `src` 中 `import { app } from "electron"` | 失败 |
| 3 | 在 L1 包 `src` 中 `import webview from "@ohos.web.webview"` | 失败 |
| 4 | 在 L0 包 `src` 中 import 任一 L2 包（按包名） | 失败 |
| 5 | 在 `apps/web` 中 import 任一 L2 包 | 失败 |
| 6 | 在 L2 包 `src` 中 `import ... from "electron"` | 失败 |
| 7 | 在 `apps/arkweb-shell` 中 import `electron` | 失败 |
| 8 | 新增一个未登记归属的 `packages/foo` | 失败（fail-closed） |
| 9 | 在 L1 包 **`test/`** 中 import L2 包 | **通过**（不得误报） |
| 10 | 仅类型导入 `import type { X } from "electron"` 出现在 L1 `src` | 失败（裁定理由：类型泄漏亦为 ADR-0003 决策 5 所禁） |
| **11** | 在 L0/L1 包 `src` 中用**相对路径**穿透到 L2 源码：`import ... from "../../report-render/src/index.ts"` | 失败（§5.3） |
| **12** | 在 L0/L1 包 `src` 中用**盘符/绝对路径**指向 L2 源码 | 失败（§5.3） |
| **13** | 在 L0/L1 包 `src` 的 `.cjs`/`.js` 文件中 `require("node:fs")` | 失败（§5.4） |
| **14** | 在 L1 包 `src` 中 `require("electron")` | 失败（§5.4） |
| **15** | 在 L1 包 `src` 中 `import fs = require("node:fs")` | 失败（§5.4） |
| **16** | `apps/electron-shell/src/main.cjs` 现状的 `require("electron")` | **通过**（L3 合法；用于证明 §5.4 补齐后未把壳层误判为违规） |
| **17** | 生产 `dependencies` 中声明、但该包 `src`/`test`/`scripts` 全无任何形式引用的非类型包 | 失败（§6.1） |
| **18** | 包声明 `@types/node` 且仅经 `tsconfig.compilerOptions.types` 消费（如 `packages/template-model`） | **通过**（不得误报，见 §6.1） |
| **19** | 现状的 `apps/arkweb-shell/hvigorfile.ts` 与 `entry/hvigorfile.ts` 的 `require("@ohos/hvigor-ohos-plugin")` | **通过**（§2.6 工具链边界；须证明排除生效） |
| **20** | 新增一个未登记的 `apps/arkweb-shell/<其他目录>/hvigorfile.ts` 并 `require("@ohos/...")` | 失败（fail-closed，豁免不得随目录静默扩大） |
| **21** | 在 `apps/arkweb-shell/scripts/` 或 `entry/src/` 中 import 一个未声明的 npm 包 | 失败（证明未把 arkweb-shell 整体排除） |
| **22** | 在 L1 包 `src` 中 `import x from "@ohos/hypium"`（**斜杠**形式 ohpm 包） | 失败（§2.7，不得只匹配点号形式） |
| **23** | 在 L2 包 `src` 中 `import webview from "@ohos.web.webview"`（**点号**形式系统模块） | 失败（§2.7，L2 亦禁） |
| **24** | 现状的 `probes/pb-08-sqlite/package.json` 声明 `@sqlite.org/sqlite-wasm` | **通过**（§2.8 裁定一：`probes/` 在反向扫描域外；须证明排除生效） |
| **25** | 新增既未登记归属、也未登记排除的顶层目录（如 `experiments/`）并置入 workspace 包 | 失败（fail-closed） |
| **26** | 现状 7 个包的 `ajv` 生产依赖（仅经 `ajv/dist/2020.js` 子路径导入） | **通过**（§2.8 裁定三；若失败即归一化未实现） |
| **27** | 已登记 workspace 包声明一个仅经 `node_modules` 资源路径使用、且**未**登记为资源型依赖的生产依赖 | 失败（§2.8 裁定二：不靠自动识别放行） |
| **28** | 全部 6 个 `tools/*` 包（ci、environment、fixtures、fonts、quality、supply-chain） | **通过**（§2.9 补录为 L2 后；补录确认前应 fail-closed 失败） |
| **29** | 现状 L0/L1 包 `test/` 中的 `import test from "node:test"` | **通过**（§2.10；13 个 L0/L1 包全部如此，若失败即规则集过严） |
| **30** | 在 L1 包 **`test/`** 中 `require("electron")` | 失败（§2.10；当前实现会误放行——这是 P-2） |
| **31** | 在 L0 包 `src` 中相对导入逃逸到未登记位置，如 `import "../../../probes/pb-08-sqlite/chromium-tabs.ts"` | 失败（fail-closed；当前实现解析不到已登记 workspace 即沉默——这是 P-1） |
| **32** | 在 `apps/electron-shell` `src` 中 `import "@ohos.web.webview"` | 失败 `ARKTS_FORBIDDEN`（§2.11；与反例 7 构成对称） |
| **33** | 在 `apps/arkweb-shell` `src` 中 `import "@ohos.web.webview"` | **通过**（§2.11；本壳自有平台，修复不得误伤） |

反例 7/16/32/33 构成"两个壳 × 两个平台"的完整 2×2 矩阵，必须四条同时成立：

| | `electron` | `@ohos.` / `@ohos/` |
|---|---|---|
| `apps/electron-shell` | **通过**（#16） | **失败**（#32） |
| `apps/arkweb-shell` | **失败**（#7） | **通过**（#33） |

### 6.1 反例 17/18 的判定范围（须在实现前冻结，不得实现时临时豁免）

原 §2.5 的发现针对的是**生产依赖**错位，规则必须收窄到该范围，否则会误伤全仓：实测 **29 个包声明 `@types/node`、29 个 tsconfig 使用 `"types"` 字段**，一条笼统的"声明但未导入即失败"会让几乎每个包变红。

- **检查范围**：仅 `package.json` 的 `dependencies`。`devDependencies` 不在本规则内。
- **排除**：`@types/*` 作用域的包一律排除（其消费经 `tsconfig` `types` 或环境声明，不经模块导入）。
- **算作"已使用"的形式**（任一命中即通过）：`src`/`test`/`scripts` 中的 `import` / `export ... from` / 动态 `import()` / `require()` / `import = require()`；`/// <reference types="...">`；本包 `tsconfig.json` 的 `compilerOptions.types` 条目；本包 `package.json` `scripts` 命令行中出现的可执行名。
- **预期唯一命中**：`packages/project-storage` 的 `@sqlite.org/sqlite-wasm`（§2.5）。若实现后出现第二个命中，须逐个书面裁定后再纠正，不得批量删依赖。

关闭既有违规：

- [ ] `semantic-editor` / `editor-diff` 的平台耦合已按选定方案关闭，门禁在不加豁免的前提下变绿。
- [ ] `project-storage` 的 `@sqlite.org/sqlite-wasm` 归属已纠正，`pnpm supply:check` 与 SBOM 重建通过。
- [ ] 若选择"为 `IdAllocator` 提供平台中立默认实现"，须补充证据说明新实现的随机性来源，并确认 PB-02 的"ID 不依赖位置"红线未被削弱。

## 7. 验证设计

- **层级**：单元（规则判定函数）+ 契约（归属声明与实际包集合一致）+ 集成（检查器对真实仓库树运行）。
- **反例执行方式**：违规必须构造在真实文件上并真实运行检查器；不接受以字符串 fixture 模拟 AST 结果冒充。
- **禁止**：不得 mock 文件系统遍历或 TypeScript 解析来制造通过（宪法 17）。
- **必须显式报告的覆盖口径**（防止"扫过了"被当成"检查过了"）：
  - 每种说明符形式（裸包名 / `node:` / 相对 / 绝对 / 盘符）各自的命中计数；
  - 每种语法形式（ESM import / export-from / 动态 import / `require` / `import =`）各自的命中计数；
  - 被扫描但导入列表为空的文件数——`.cjs` 在补齐 §5.4 前会全部落入此类，该计数是补齐是否生效的直接证据。
- **失败/取消/降级**：检查器对无法解析的文件必须报错退出，不得静默跳过。`.ets`（ArkTS）**不在** `CODE_EXTENSIONS` 内（[guardrails.ts:41](../../tools/quality/src/guardrails.ts)），即 `apps/arkweb-shell` 的 `.ets` 源码当前完全未被扫描；须显式声明该文件类别的处理方式并在报告中列为已知边界，不得假装已覆盖。
- **证据**：完整命令、覆盖计数、11 条反例逐条的独立运行输出、以及既有 8 个 CI job 的回归结果。

### 7.1 预计触及的文件类别（DoR "列出预计触及的模块/文件类别"）

| 类别 | 预期位置 | 性质 |
|---|---|---|
| 分层归属声明 | `tools/quality/` 下新增，机器可读单一真源 | 新增 |
| 检查器实现 + 测试 | `tools/quality/src/`、`tools/quality/test/` | 新增 |
| 本地统一入口 | 根 `package.json` 的 `quality:check` 或新增脚本 → 并入 `verify` | 修改 |
| CI 接入 | `tools/ci/src/jobs.ts` 的 `static` job | 修改，**不新增 job、不改并行矩阵结构** |
| ID 平台耦合关闭 | `packages/semantic-editor/src/ids.ts`、`packages/editor-diff/src/review.ts` | 修改 |
| 依赖归属纠正 | `packages/project-storage/package.json` | 修改（须重建 SBOM） |
| phantom-dependencies 反方向 | `tools/quality/src/phantom-dependencies.ts` | 修改 |
| ADR | `docs/adr/` 新增一份（ID 随机源变更） | 新增 |

`packages/*/src` 下除上述两个文件外**不得有其他生产代码改动**；若门禁暴露出更多违规，按 §9 停止上报，不得顺手修改。

## 8. 权限与影响

- **依赖**：零新增第三方依赖（§5.1）。若实施者认为必须新增，属范围变更，须停止并请业主批准。
- **契约/数据/格式**：不改。归属声明为新增文件。
- **架构影响**：`semantic-editor` 的 ID 分配实现会变化，影响 PB-02～PB-05 既有结论的适用范围，须写 ADR 并在其中说明是否需要局部复审。
- **费用/外部系统/账号/凭证**：无。不产生现金支出，不调用外部服务，不传输用户数据。
- **并行**：独占 `tools/quality` 与根 `verify` 入口；不得与其他修改根构建配置的任务并行。可与文档类任务并行。
- **业主批准前置**：§0 两项。

## 9. 停止与回滚

- 若归属草案在实测中导致大面积无法判定的边界（例如 L1/L2 界线在多个包上都需要个案豁免），**停止实现检查器，先回到 §3 重新裁定归属**，不得靠加豁免让门禁通过。
- 若 `semantic-editor` 平台中立实现无法在不削弱 PB-02 ID 红线的前提下完成，停止并上报，不得为让门禁变绿而降低 ID 随机性或改判验收口径。
- 回滚方式：门禁与归属声明各自为独立 Git 提交，可单独回退；ID 实现变更单独成提交，回退后 PB-02～05 既有测试须仍全绿。

## 10. 交付物

1. 归属声明文件（机器可读，单一真源）。
2. 检查器实现 + 单元/契约/集成测试。
3. `pnpm verify` 与 CI `static` job 接入。
4. `semantic-editor`/`editor-diff` 平台耦合关闭 + ADR。
5. `project-storage` 依赖归属纠正 + SBOM 重建证据。
6. phantom-dependencies 反方向检查。
7. 实施记录：18 条反例的逐条独立运行输出、§7 的覆盖口径计数与未执行项。

## 11. 修订记录

### r1（GPT 独立复核，结论 NOT READY）

GPT 对 r0 草案提出 1 项 BLOCKER + 3 项 MAJOR。Claude 逐条回原文复验后的裁定：

| GPT 提出 | 复验结果 | 处置 |
|---|---|---|
| BLOCKER：DoR 未满足（无获批任务 ID、无路线图登记、归属表未冻结） | **成立，但即 r0 §0 自述状态**。r0 已声明"本任务书在这两项未定前不满足 DoR 全局前提第 3 条" | 不改文档。这是**开工闸门**，须业主裁定 §0 两项后方可送审 |
| MAJOR：相对跨包导入可绕过门禁（`phantom-dependencies.ts:14-15` 忽略 `./`、`../`） | **成立**。复验并发现范围更大：该函数第 12–20 行对 `node:`、`/`、盘符前缀同样返回 `undefined`，而 `node:*` 正是 L0/L1 的首要禁令 | 新增 §5.2（禁止复用 `packageNameOfSpecifier`）、§5.3（相对/绝对路径须解析到所属包）、反例 11/12 |
| MAJOR：CJS `require()` 与 Node 全局未覆盖，§1 目标夸大 | **成立，且比所述更严重**。全仓唯一的平台导入全部是 CJS `require`（`main.cjs:1`、`preload.cjs:1`、`electron-session.cjs:1`）。`.cjs` 在 `CODE_EXTENSIONS` 内被扫描解析，但导入列表返回空——是 AST 覆盖漏洞，不是扩展名漏洞 | 新增 §5.4（覆盖 `require`/`import =`，并须显式裁定 Node 全局策略）、反例 13–16、§7 覆盖口径计数 |
| MAJOR："声明但未导入"无可执行语义，会误伤 `@types/node` | **成立**。实测 29 个包声明 `@types/node`、29 个 tsconfig 使用 `"types"`，r0 反例 11 写成笼统规则会让几乎全仓变红 | 反例 11 重写为反例 17，并新增 §6.1 冻结判定范围（仅生产 `dependencies`、排除 `@types/*`、枚举六种"已使用"形式）、新增反向反例 18 |

r0 未被 GPT 提出、但复验中一并确认的边界：`.ets` 不在 `CODE_EXTENSIONS` 内，`apps/arkweb-shell` 的 ArkTS 源码当前完全未被扫描（已写入 §7）。

反例总数由 11 条增至 18 条，其中 3 条（9、16、18）是防误报的反向反例。

### r3（实施中按 §9 停止上报，Claude 裁定）

实施者补齐 CJS `require()` 采集后，既有 `phantom-dependency` 检查在两个 Hvigor 构建脚本上命中未声明的 `@ohos/hvigor-ohos-plugin`，按 §9 停止并上报，未顺手修复、未继续实现。**处置正确。**

| 事项 | 裁定 |
|---|---|
| 该依赖如何登记 | **不在 `package.json` 声明**。它属华为 ohpm 仓与 IDE 自带 Hvigor 6.24.3，G1-12 已定"HarmonyOS 工具链不参与本项目 npm 依赖树"。详见新增 §2.6 |
| 门禁如何处置 | npm 依赖归属扫描排除两个具名 `hvigorfile.ts`，窄口径、fail-closed；不得排除 `apps/arkweb-shell` 整体。新增反例 19–21 |
| 是否影响归属表 | 不影响。`apps/arkweb-shell` 属 L3，`@ohos/*` 在 L3 合法；§3 无需变更 |
| 顺带精度修补 | `@ohos.`（系统模块）与 `@ohos/`（ohpm 包）是两个命名空间，L0/L1/L2 两种形式一并禁止。新增 §2.7、反例 22–23 |
| 遗留缺口 | Hvigor 插件版本仓内未固定 → ArkWeb 构建不具仓内可复现性。**属 `R-COMPAT`/供应链缺口，另立跟进项，G2-03 不处理、也不得以"已排除扫描"掩盖**（§2.6 第 4 条） |

反例总数由 18 条增至 23 条，其中防误报的反向反例由 3 条增至 5 条（9、16、18、19、21）。

### r4（实施中第二次按 §9 停止上报，Claude 裁定）

| 事项 | 裁定 |
|---|---|
| `probes/pb-08-sqlite` 的 WASM 依赖 | **`probes/` 排除在反向扫描域外**。它不是 pnpm workspace 成员、自带 npm lockfile、自带供应链契约测试。不删依赖、不改探针。见 §2.8 裁定一、反例 24/25 |
| 是否新增"`node_modules` 资源路径"为使用形式 | **不新增自动识别**。本案路径由 `join()` 多个字面量拼成，匹配单一字面量的检查器恰好会漏掉它；且这是放行规则，脆弱的放行规则朝危险方向失效。改为**显式登记的资源型依赖表**（当前应为空）。见 §2.8 裁定二、反例 27 |
| 起草方未预见的第三项 | **子路径说明符须归一化为包名**。`ajv` 实为 `ajv/dist/2020.js`，不归一化会误报 7 个包。见 §2.8 裁定三、反例 26 |
| **起草遗漏（我的错误）** | §3 归属表漏了 `pnpm-workspace.yaml` 同样纳管的 6 个 `tools/*` 包，fail-closed 会直接卡死它们。补录为 L2，**须业主确认**。见 §2.9、反例 28 |

反例总数 23 → 28；防误报的反向反例 5 → 9（9、16、18、19、21、24、26、28 及既有 21）。

### r5（真库第一段独立执行后，Claude 裁定）

覆盖率实测暴露 `test/`+`scripts/` 被整体跳过（真库 335 个 source/config 文件中 148 个、44% 不受检查）。裁定见 §2.10：豁免从"全部"收窄为"仅 `node:*`"，平台说明符在辅助目录同样仅 L3 允许。新增反例 29/30/31。矩阵 28 → 31。

### r6（31 条反例独立执行后，Claude 裁定 MA-01）

[审计报告](G2-03-claude-audit-report.md)结论 **CONDITIONAL PASS**，30/31 通过。唯一失败的反例 7 暴露 L3 平台许可无差别放行。裁定见 §2.11：平台命名空间按 L3 条目登记在归属声明中并 fail-closed。新增反例 32/33，与 7/16 构成"两壳 × 两平台"完整 2×2 矩阵。矩阵 31 → 33，防误报的反向反例 9 → 11。

审计另记一处**审计方自身缺陷并已更正**：反例 12 首次报 FAIL 系探针转义错误（盘符路径单反斜杠进入 JS 字符串字面量，`\w`/`\r`/`\s` 被当转义序列），改用正斜杠重跑后盘符与 POSIX 两形式均正确触发，实现无缺陷。

> 本任务书由 Claude 起草，r1 依据 GPT 独立复核修订，r3/r4 依据实施期两次停止上报裁定，r5 依据真库第一段实测修订，r6 依据 31 条反例独立执行结果裁定。r4 含一处起草方遗漏（§2.9），r6 含一处审计方探针缺陷的更正记录。按 CLAUDE.md，起草与修订任务书不构成实施，Claude 仍担任本任务的最终审计者；若业主要求 Claude 直接实施其中任何一项，则该项须另换审计者。
