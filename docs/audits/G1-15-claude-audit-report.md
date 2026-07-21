# G1-15 供应链初审与 SBOM/许可证基线独立审计报告

> 日期：2026-07-21　审计基线：`2744df4`（feat: record G1-15 supply chain baseline），范围 `2744df4^..d145ed2`
> 任务书：[G1-15-claude-audit-task.md](G1-15-claude-audit-task.md)　受审基线：[supply-chain.md](../supply-chain.md)、[实施记录](G1-15-implementation-record.md)
>
> 本报告由未参与实施的独立只读审计角色出具。依赖清单从 lockfile 独立重建、许可结论向 npm 官方与上游核验、守卫用变异测试判定。不采信实施记录、`supply-chain.md`、`sbom/sbom.json`、许可结论或"全绿"自述。

## 1. 边界与方法

- **写入边界**：本轮只新增本文件一处。未修改代码、测试、SBOM、manifest、lockfile、路线图、配置、Schema、生成物或 `.prettierignore`。
- **探针边界**：全部探针写在仓库外 `D:\tmp\g115*`，结束已删除。未安装/移除依赖、未 push、未触发 Actions；`sbom/sbom.json` `git diff` 为空。
- **独立路径**：包清单直接解析 `pnpm-lock.yaml` 的 `packages:`/`snapshots:` 段（不同于项目的 `node_modules/.pnpm` walker）；许可 SPDX 向 `npm view`（官方 registry）核验；`pnpm audit --json` 独立复跑；守卫用仓库外变异与合成输入判定。
- **工具链**：命令在冻结 D 盘 Node `24.17.0` + pnpm `11.15.1` 下执行；`--config.verify-deps-before-run=false` 仅抑制 pnpm 跑前自动装依赖。

## 2. 结论摘要

**结论：`FAIL — G1-15 不得完成，G1-16 不得签署`**

发现 1 项 MAJOR：**已提交 SBOM 是 Windows 平台专属产物，在声明的 CI 平台（ubuntu-24.04）上 `supply:check` 会因 `SBOM_DRIFT` 失败**——基线不可在 CI 环境重建，且因 G1-13/14/15 均未推送（`origin/main` 仍为 `baff4ef`）而从未在 CI 上暴露。依任务书 §6，SBOM 与实际树在 CI 平台不符属 FAIL 条件。

许可结论、漏洞审查、phantom 守卫、CR-01 修复、门禁互锁本身经独立核验**均成立**（见 §4–§7），修复面很窄——SM-01 一经解决即可复审转 CONDITIONAL PASS/PASS。

| 级别 | 编号 | 摘要 |
|---|---|---|
| **MAJOR** | `SM-01` | SBOM 从**平台专属安装树** `node_modules/.pnpm` 生成，内含 win32 专属二进制（`lightningcss-win32-x64-msvc`、`@rolldown/binding-win32-x64-msvc`）；CI 在 ubuntu 上重建得到 linux 二进制 → 字节不符 → `supply:check` 与"字节级重建"集成测试在 CI **失败**。任务书 §2 要求"以冻结 lockfile 为真源"（平台无关），实现却用安装树（平台相关） |
| MINOR | `SM-02` | phantom 守卫的 `@types/<pkg>` 豁免同时放过**值导入**：`import { x } from "foo"` 且只声明 `@types/foo` 时不报错（受 pnpm 严格解析兜底，但豁免过宽，未区分 type-only 与值导入） |
| NOTE | `SM-N1` | phantom 守卫只认 `dependencies`/`devDependencies`；`peerDependencies`/`optionalDependencies` 会误报（当前无工作区包使用，无实发） |
| NOTE | `SM-N2` | 三斜线指令仅在文件顶部被识别（TS 语义正确），覆盖边界记录备查 |

**CR-01**：修复本身（`tools/quality` 声明 `eslint@10.7.0` + 系统性 phantom 守卫）经独立核验成立（§7），但依任务书"PASS 时同时签署 CR-01 关闭"，本轮为 FAIL，故 **CR-01 暂不签署关闭**，待 SM-01 修复复审后连同签署。

## 3. 依赖清单完整性（任务书 §2）

### 3.1 独立重建与对账

直接解析 lockfile `packages:` 段得 **146** 个唯一 `name@version`；已提交 SBOM 为 **115** 个包（9 直接 / 106 传递）。逐项集合差：

- **SBOM 中有、lockfile 中无：0** —— 无虚报/不存在的包。
- **lockfile 中有、SBOM 中无：31** —— 全部是**其他平台的原生二进制/可选包**：`@rolldown/binding-{android,darwin,linux,freebsd,...}`、`lightningcss-{android,darwin,linux,freebsd,win32-arm64}`、`fsevents`（darwin）、`@emnapi/*`/`@napi-rs/wasm-runtime`/`@tybys/wasm-util`（WASM 回退）、`tslib`。

即 SBOM = 本机（win32-x64）**已安装**子集；lockfile = 全平台超集。**这正是 `SM-01` 的根因**（§8）。

### 3.2 直接/传递判定（含 ajv 专项）

SBOM 的 `requested_by` 与 lockfile 交叉核验：

- `ajv@8.20.0`：`direct=true`，`requested_by=[@wenshu/config, document-model, host-contract, project-contract, template-model]` ✔（catalog 声明的契约依赖）。
- `ajv@6.15.0`：`direct=false`，`requested_by=[]` ✔（传递，父为 `eslint@10.7.0`，lockfile snapshot 实证）。

其余多版本包（`eslint-visitor-keys` 3.4.3/5.0.1、`ignore` 5.3.2/7.0.6、`json-schema-traverse` 0.4.1/1.0.0）均正确归为传递，无同名包被错误归类。父链抽查：`lightningcss@1.32.0 ← vite@8.1.5`、`argparse@2.0.1 ← js-yaml@4.3.0`、`minimatch@10.2.5`（多消费者）、`ajv@6.15.0 ← eslint@10.7.0` —— 均与文档一致，SBOM 无漏报/虚报。

### 3.3 官方注册表

lockfile 全部 146 个 resolution 均指向 `registry.npmjs.org`，无镜像/私有源替换；三个受审包 tarball 经 `npm view` 确认来自 `registry.npmjs.org`。

## 4. 许可证专项（任务书 §3）

### 4.1 独立重扫 115 包

独立分布：MIT=82、Apache-2.0=14、BSD-2-Clause=6、ISC=6、BSD-3-Clause=3、MPL-2.0=2、BlueOak-1.0.0=1、Python-2.0=1（合计 115）。**无 GPL/AGPL/未知/组合表达式**；政策门禁对全树命中 0。政策变异验证（`licensePolicyViolation`）：`GPL-3.0-only`/`AGPL-3.0`/`GPL-2.0-or-later`/`(MIT OR GPL-2.0)` → 阻断；`LGPL-2.1`/`UNKNOWN`/随机串 → "既非宽松亦未审"阻断；`MIT`/`Apache-2.0`/`MPL-2.0`/`Python-2.0`/`BlueOak-1.0.0` → 放行。

### 4.2 三项书面结论核验（向 npm 官方 + 上游）

| 包 | 文档 SPDX | `npm view` 官方 | 判定 |
|---|---|---|---|
| `lightningcss@1.32.0`（+win32 二进制，← vite 传递） | MPL-2.0 | MPL-2.0 | ✔ |
| `argparse@2.0.1`（← js-yaml ← eslint 传递） | Python-2.0 | Python-2.0 | ✔ |
| `minimatch@10.2.5`（传递） | BlueOak-1.0.0 | BlueOak-1.0.0 | ✔ |

- **MPL-2.0**：文件级弱 copyleft，义务仅及 MPL 许可文件本身；项目以 Vite 调用其发布二进制/库、不修改其源文件，故不涉及本项目代码开源义务。文档"不传染 + 禁止原地 patch + LICENSE 随包保留"结论**成立**。
- **Python-2.0**：宽松（无 copyleft，含背书/商标条款）；`argparse` 不是任何工作区运行时声明依赖（`grep` 确认），仅经 eslint/js-yaml 链在构建期存在，不入产品运行时。结论**成立**。
- **BlueOak-1.0.0**：现代宽松许可（MIT 等价）。结论**成立**。

三项均为书面留档、非夹带例外；未发现第四种非宽松许可。

## 5. 漏洞与工具诚实性（任务书 §4）

- 独立 `pnpm audit --json`（2026-07-21，npm 官方咨询源）：`{info:0, low:0, moderate:0, high:0, critical:0}`，与文档 0/0/0/0/0 **一致**。
- "漏洞查询不入 verify 门禁"的理由（需网络、破坏离线确定性）**成立**；替代机制（复跑时点：依赖变更、G1-16 签署前、上游公告时）**明确**。此为时点性证据，非持续门禁——文档已如实声明。

## 6. 门禁与守卫决定性（任务书 §5）

### 6.1 决定性变异（仓库外/合成输入）

| 变异 | 结果 |
|---|---|
| SBOM 改一字节（版本 1.32.0→1.32.1） | 重建 ≠ 篡改 → 漂移检出 ✔ |
| 某包许可改为 `GPL-3.0-only` | `checkLicensePolicy` **唯一**命中该包 ✔ |
| manifest 删除一个实际 import 的依赖声明 | phantom 守卫报错 `must declare <dep>` ✔ |
| catalog 改名致 `catalog:` 无法解析 | `SBOM_INVALID`"specifier cannot be resolved" **fail-closed** ✔（非静默归为传递） |
| 已提交 SBOM 缺失/非 JSON | `check-sbom` `readFile`/`JSON.parse` 抛错转 `SBOM_INVALID` fail-closed（源码 L15–26） |

### 6.2 phantom 守卫（TS 编译器 API，非正则）

`collectModuleSpecifiers` 用 `ts.createSourceFile` + AST 访问，合成用例逐一命中：静态 `import`、`import type`、多行 import、`export { } from`、`export * from`、动态 `import()`、scoped `@scope/pkg`、**顶部**三斜线 `/// <reference types=...>` —— **全部检出**；`./local`、`node:fs` 正确忽略。决定性：`import from "eslint"` 而未声明 → 报错；已声明 → 干净。

**`SM-02`（缺口）**：`import { realValue } from "foo"` 而只声明 `@types/foo` → **不报错**（豁免放过值导入）。见 §8。

### 6.3 CR-01 关闭核验

- `tools/quality` `devDependencies` 现声明 `eslint: 10.7.0`，与根 `10.7.0` 一致。
- phantom 守卫接入 `check-repository.ts`（`quality:check` 与 CI `static` 作业），遍历**全部**工作区包的静态/动态 import、re-export、三斜线引用——系统性防护，非单点修复；决定性变异证明删声明即报错。
- CR-01 修复本体**成立**；但依任务书 CR-01 关闭签署与 PASS 绑定，本轮 FAIL 故**暂不签署**，待 SM-01 修复复审。

### 6.4 门禁接线与互锁

- `supply:check` 接入根 `verify` 与 CI `security` 作业；`sbom:build` = `pnpm --filter @wenshu/supply-chain build:sbom`。
- 互锁**两侧齐全**：删 `CI_JOBS.security` 的 supply → `ci-runner` 变红；删 verify 链的 `pnpm supply:check` 或删脚本 → `wiring.contract.test.ts` 变红。CI 仍 **8 作业**，workflow 零改动。

## 7. 依赖、体量与范围（任务书 §5 末段）

- **零手写 `any`/抑制**：`tools/supply-chain/`、`tools/quality/src/phantom-dependencies.ts` 命中 0。
- **体量护栏**：最大 `inventory.ts` 223、`phantom-dependencies.ts` 162，均 < 生产 300/400；测试均 < 500。
- **strict typecheck**：14 包 `Done`（含 `@wenshu/supply-chain`）；`tsconfig.include=["src","test","scripts"]`。
- **依赖诚实**：`@wenshu/supply-chain` 仅声明 `@wenshu/fixtures`/`@wenshu/fonts`/`@wenshu/test-support`（inventory/测试实际使用）；`tools/quality` 新增 `eslint`；无新增第三方运行时依赖。
- **lockfile**：仅新增 `tools/supply-chain` importer 与 `tools/quality` 的 eslint 声明移动，无第三方版本漂移。
- **`.prettierignore`**：仅新增 `sbom/` 一行。
- **零漂移**：G1-14 审计基线（`tools/environment`、`artifacts/reference-machine`、`.gitignore` 放行段、`docs/reference-machine.md`）、冻结 fixture/字体/Schema/生成物/workflow 在本范围 `git diff` 全空；无费用、无外部发布。

### 7.1 命令与计数（本机 Windows，冻结工具链）

| 命令 | 退出码（本机） | 计数 |
|---|---|---|
| `pnpm supply:check` | 0 | `Supply chain check passed: 115 packages (9 direct), license policy clean, no drift.`；契约/集成 4 |
| `pnpm quality:check` | 0 | `114 source/config files, 302 repository files`（含 phantom 守卫） |
| `pnpm test:unit` | 0 | 43/43（含 phantom 单测 3 项） |
| `pnpm ci:job security` | 0 | secrets/licenses/fonts/**supply-chain** 全过 |
| `pnpm ci:job static` | 0 | phantom 守卫在 static 作业执行 |
| `pnpm verify` | 0 | 聚合 180/180 |

**关键限制**：上述均在 **Windows** 本机通过。CI 的 ubuntu-24.04 上，`supply:check` 与集成测试"字节级重建"会因 `SM-01` 失败——本机全绿不代表 CI 全绿。

## 8. 发现

### MAJOR

#### `SM-01`　SBOM 平台专属，CI（ubuntu）重建必然漂移
**定位**：[tools/supply-chain/src/inventory.ts:184](../../tools/supply-chain/src/inventory.ts#L184)（`collectStorePackages(join(root,"node_modules",".pnpm"))`）、[tools/supply-chain/scripts/check-sbom.ts:29-35](../../tools/supply-chain/scripts/check-sbom.ts#L29-L35)（无条件重建 + 字节比对）。

**证据**：
- 已提交 SBOM 含 win32 专属二进制：`lightningcss-win32-x64-msvc@1.32.0`（MPL-2.0）、`@rolldown/binding-win32-x64-msvc@1.1.5`（MIT）。二者 lockfile 标记 `os=win32,cpu=x64`；对应 `os=linux` 变体（`lightningcss-linux-x64-gnu`、`@rolldown/binding-linux-x64-gnu`）在本机安装树中**计数为 0**。
- SBOM 由安装树 `node_modules/.pnpm` 生成，故本机（win32）产出 115 个含 win32 二进制的包；`serializeSbom(rebuilt) === committed` 仅在**同平台**成立（本机实测字节相同）。
- CI `verify.yml` `runs-on: ubuntu-24.04`；`pnpm install --frozen-lockfile` 在 ubuntu 安装 `os=linux` 二进制、跳过 win32；`check-sbom` 重建得 linux 二进制 → `serializeSbom(rebuilt) !== committed` → 抛 `SBOM_DRIFT` → CI `security` 作业**失败**；集成测试"the installed dependency tree rebuilds the committed sbom byte-for-byte"同样失败。
- 因 `origin/main` 仍为 `baff4ef`（G1-13/14/15 均未推送），该 CI 失败**从未被观测**。

**影响**：`supply-chain.md` §1"确定性输出……同一代码树字节级相同"对跨平台**不成立**（同一 git 树在 Windows/Linux 产生不同 node_modules → 不同 SBOM）。作为**接入 ubuntu CI 的门禁**，交付基线无法通过其自身 CI 门禁 → 阻断 G1-15 完成与 G1-16 签署。任务书 §2 明确"**以冻结 lockfile 为真源**"，而实现以平台相关的安装树为源，属对任务框架的偏离。

**建议**（择一）：
1. 从 **lockfile**（平台无关的全平台超集，146 项）而非安装树重建 SBOM——符合任务书"lockfile 为真源"，跨平台确定；或
2. 在 inventory 中按 lockfile 的 `os/cpu` 收录全部平台变体（或统一剔除 os/cpu 门控的原生二进制并单列），使 SBOM 与运行平台无关；或
3. 若坚持安装树来源，则把 SBOM 生成/校验固定到单一规范平台并在 `check-sbom` 显式门控（非规范平台跳过或告警），但这会牺牲 CI 上的真实校验，不推荐。

**归属/最迟关闭点**：Codex；G1-15 复审前（阻断项，须先于 G1-16）。

### MINOR

#### `SM-02`　phantom `@types/*` 豁免放过值导入
**定位**：[tools/quality/src/phantom-dependencies.ts:145-150](../../tools/quality/src/phantom-dependencies.ts#L145-L150)。
**证据**：合成用例——包只声明 `@types/foo`、代码 `import { realValue } from "foo"`（值导入）→ `checkPhantomDependencies` **findings=0**。豁免条件 `owner.declared.has('@types/'+dependency)` 对**任何**导入形态生效，未区分 type-only 导入 / 三斜线类型引用与运行时值导入。
**影响**：真实运行时依赖 `foo` 可在只声明 `@types/foo` 时逃过 phantom 守卫。实际危害受 pnpm 严格解析兜底（未声明的 `foo` 运行/构建时无法解析），故 MINOR 非 MAJOR；但豁免逻辑过宽，与任务书"@types 豁免不会放过真实运行时依赖"的要求不符。
**建议**：仅对 `import type`/三斜线类型引用应用 `@types` 豁免（TS AST 可用 `node.importClause.isTypeOnly` 区分），值导入仍要求声明运行时包。
**归属/最迟关闭点**：Codex；与 SM-01 同批复审。

### NOTE
- **`SM-N1`**：phantom 守卫只读 `dependencies`/`devDependencies`；若某工作区包在 `peerDependencies`/`optionalDependencies` 声明并导入，会误报 phantom。当前无工作区包使用二者（已 `grep` 全仓库确认），无实发；扩展时应纳入。
- **`SM-N2`**：三斜线 `/// <reference types=...>` 仅在文件顶部被 TS 识别（顶部检出、中部忽略均已实测）——属 TS 语义正确行为，记录覆盖边界备查。

## 9. 未执行项与限制

- **未在 ubuntu 实跑 CI**：`SM-01` 的 CI 失败由本机安装树（win32-only）、lockfile `os/cpu` 标记与 `check-sbom` 无条件字节比对逻辑三者**推定**，未在真实 Linux 上执行（无权 push/触发 Actions）。推定链完整且各环节均有实证，但真实 CI 运行留作复审最终确证。
- **未执行 `pnpm install`/`--frozen-lockfile`**（会改写 `node_modules`）；SBOM 重建用现有安装树在内存中进行，未落盘。
- `pnpm audit` 为 2026-07-21 时点查询，随上游公告变化。
- 本报告只签署事实，不提供也不应用补丁，不修改路线图，不自行关闭 CR-01 或 G1-15。

## 10. 最终结论

**`FAIL — G1-15 不得完成，G1-16 不得签署`**

- **`SM-01`（MAJOR）**：SBOM 为 Windows 平台专属，ubuntu CI 重建必然 `SBOM_DRIFT`，交付基线无法通过其自身 CI 门禁；任务书要求以 lockfile 为真源而实现用平台相关安装树。此为阻断项。
- 其余各项经独立核验**成立**：依赖清单无虚报/漏报、分类正确、官方注册表；无 GPL/AGPL/未知，三项许可结论向上游核验无误；`pnpm audit` 0/0/0/0/0；SBOM 漂移/许可/phantom/catalog 变异均 fail-closed 且决定性；门禁两侧互锁、CI 8 作业、零漂移、零 `any`/抑制、体量达标。
- `SM-02`（MINOR）与两条 NOTE 一并登记，随 SM-01 复审关闭。
- **CR-01** 修复本体成立但依规则暂不签署关闭，待 SM-01 修复后连同签署。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具。发现阻断问题（`SM-01`）后停止签署通过；由 Codex 依本报告修复，再由本审计角色复审关闭 SM-01/SM-02 并签署 CR-01。审计者不修改路线图、不自行标记 G1-15 完成。
