# G2-02 远程分支保护与依赖更新门禁独立审计报告

> 日期：2026-07-23　审计基线：`b002503`（feat: add G2-02 branch protection and dependency gates），台账 `e5797f7`
> 任务书：[G2-02-claude-audit-task.md](G2-02-claude-audit-task.md)　受审基线：[branch-protection.md](../branch-protection.md)、[dependabot.yml](../../.github/dependabot.yml)、[实施记录](G2-02-implementation-record.md)
>
> 本报告由独立只读审计角色出具。**规则结论一律以 `gh api` 实际生效值为准**，不采信文档、截图或实施记录自述。

## 1. 边界与方法
- **写入边界**：本轮只新增本文件一处。未修改仓库设置、分支、PR、治理文件或代码。
- **远程操作**：全部为 `gh api` **只读**查询（repo、protection、pulls、runs、jobs、logs、commits、collaborators）。未创建/合并/关闭 PR，未改保护规则，未 push。
- 我复用实施方已固定的证据链（PR #1 / run `30005677130`）并独立复核其原始 API 与日志，**未另建临时失败分支**——既有证据已足以判定，另建 PR 属对远程的多余写操作（任务书允许但非必需）。

## 2. 结论摘要

**结论：`CONDITIONAL PASS`**

任务书 §3 的 FAIL 线——规则与实际不符、必需检查可绕过、force-push/删除可行、依赖更新可不经回归合入、仓库被公开、历史被改写——**逐条经 `gh api` 实测不成立**。无 BLOCKER/MAJOR。

审计期间我发现 dependabot **已实际运行并开出 3 个 PR**（实施记录未及记载），据此获得比实施方更强的门禁实证（§6.1）；同时暴露一处盲区：**冻结工具链记录 `toolchain.versions.json` 无任何自动绑定**（`G2-M1`）。

| 级别 | 编号 | 摘要 |
|---|---|---|
| MINOR | `G2-M1` | `toolchain.versions.json`（G1-02/ADR-0002 冻结工具链记录）**无任何检查读取或绑定**：全仓 grep 命中 0。依赖更新是破坏该冻结的唯一活跃向量，而 dependabot 现已开出 **typescript 6.0.3→7.0.2**、**@types/node 24→26** 两个大版本 PR。当前三个 PR 均被 CI 拦下，但若日后修好构建并重建 SBOM 后合入，catalog 与冻结记录将静默失同步且无检查发现 |
| NOTE | `G2-N1` | `enforce_admins=false` 的留痕机制在**常规运行下成立**；但严格说"不可抹除"存在理论例外——管理员可先翻转 `allow_force_pushes` 再改写历史。此为**单人自治仓库的固有上限**（业主始终是最终权威），非实现缺陷；建议文档措辞由"不可抹除"精确为"非经管理员主动翻转保护设置不可抹除，且该翻转本身是一次可见的管理员操作" |

## 3. 规则真实性（任务书 §2 第 1 点）　**通过（API 实测）**

`gh api repos/deloog/wenshu/branches/main/protection` 实际生效值：

| 项 | API 实测值 | 文档声称 | 判定 |
|---|---|---|---|
| 必需状态检查 | `static, unit-config, contracts, typecheck, build-test, build-staging, build-production, security`（8 项） | 同 | ✔ |
| `enforce_admins` | `false` | `false` | ✔ |
| `allow_force_pushes` | `false` | `false` | ✔ |
| `allow_deletions` | `false` | `false` | ✔ |
| `required_pull_request_reviews` | `null`（未启用） | "未启用"并书面取舍 | ✔ 如实 |
| 仓库可见性 | `private: true`、`visibility: private`、`fork: false` | PRIVATE | ✔ |

**与 CI 矩阵同构——我做了集合比对**：`.github/workflows/verify.yml` 的 matrix 8 作业与远程 8 个 required contexts 排序后 `diff` **完全相同（IDENTICAL SETS）**，无多余/缺失项。这意味着必需检查不会因作业改名而空转（改名会使 context 缺失 → 合并被拦）。

## 4. 门禁承重（任务书 §2 第 2 点）　**通过（因果链逐环实测）**

我独立复核了完整因果链，而非只看结论：

1. **故意缺陷真实存在**：提交 `d614385b`「test: deliberate gate failure for G2-02 proof」新增 `apps/web/src/gate-proof.ts`（+2 行）。
2. **CI 确因该缺陷失败**：run `30005677130`（event `pull_request`，分支 `g2-02-gate-proof`）conclusion **`failure`**；8 作业中 **7 成功、`static` 失败**。
3. **失败原因正确**：`static` 作业日志实录 `##[error] 1:15 error Unexpected any. Specify a different type @typescript-eslint/no-explicit-any` → `✖ 1 problem` → `Process completed with exit code 1`。**是被显式 `any` 拦下，不是无关红**。
4. **合并确被阻断**：PR #1 `mergeable_state: **blocked**`、`merged: false`、`merged_at: null`、`state: closed`——实施方所述 API 强制合并 405 与此一致。
5. **证据固定后清理**：PR 已关闭、分支已删；main 零漂移（§6）。

**关键点**：初配 `enforce_admins=true` 时连 admin 令牌亦被 405 拦下——这证明必需检查本身是硬的；最终配置放宽的只是"管理员豁免"这一维度，**检查规则未被削弱**。对非管理员，8 项检查在任何配置下均绝对生效。

## 5. 管理员绕过留痕（任务书 §2 第 3 点）　**取舍成立**

任务书要求核验三点，逐条：

- **绕过是否仅管理员可行** ✔：`enforce_admins=false` 语义上只豁免管理员；协作者列表实测**仅 `deloog`（admin）一人**，无其他协作者。故不存在"非管理员也能绕过"的面。
- **绕过痕迹是否永久留存** ✔（实证）：我做了**经验性验证**而非只读文档——对最近三个直推提交查 `commits/{sha}/pulls`，`b002503`、`067845d`、`e5797f7` 的关联 PR 数**均为 0**，即**我能精确识别出哪些提交绕过了 PR**。配合 `allow_force_pushes=false` + `allow_deletions=false`（API 实测），这些痕迹无法被常规手段抹除。**留痕机制不是纸面声明，是可核查的事实**。
- **直行 main 与功能任务强制 PR 的边界是否可执行** ✔：文档限定管理员直推仅用于"文档/台账类提交"，功能任务强制走 PR 由 **G2-01 治理文件**（DoD §9、PR 模板"无 ID 不得合入"、评审清单）承担。本轮实际发生的三次直推**全部是 docs/治理提交**（`docs:` 前缀 + 我在 G2-01 审计中已确认其零功能漂移），与声明边界一致，边界**当前被实际遵守**。

**配置迭代如实披露** ✔：文档 §2 记录初配 `enforce_admins=true` 导致 `GH006: 8 of 8 required status checks are expected` 阻断一切直推、文档工作流无法继续，据此调整为 `false`。这是**真实失败的留痕**而非事后合理化，与项目一贯的诚实披露一致。

**残余（`G2-N1`）**：文档称痕迹"永久留在 git 历史与 events API 中，**不可抹除**"。严格说存在理论例外——管理员可先将 `allow_force_pushes` 翻为 `true`、改写历史、再翻回。这是**单人自治仓库的固有上限**（业主是保护规则本身的所有者），任何技术手段都无法在同一账号内消除；且该翻转本身是一次可见的管理员操作。故列 NOTE 而非缺陷，仅建议措辞精确化。

## 6. 依赖更新门禁（任务书 §2 第 4 点）　**通过（含实证），并发现一处盲区**

### 6.1 dependabot 已实际运行——三个 PR 全部被 CI 拦下（超出实施记录的实证）
审计期间我查得远程有 **3 个 open PR，全部来自 `dependabot[bot]`**，创建于 2026-07-23 12:15–12:16，`base: main`、均未合并——恰好等于配置的 `open-pull-requests-limit: 3`。这是**依赖门禁已上线并生效的活证据**，比实施方所依赖的单个人造 PR #1 更强：

| PR | 内容 | CI 实测 |
|---|---|---|
| #2 | `prettier 3.9.5 → 3.9.6`（补丁） | 7 成功 / **1 失败：`security`** |
| #3 | `typescript 6.0.3 → 7.0.2`（大版本） | **8/8 全失败**（typecheck、build-test、unit-config…） |
| #4 | `@types/node 24.13.3 → 26.1.1`（大版本） | 7 成功 / **1 失败：`security`** |

**三个 PR 无一可合并** ✔。尤其 #2：即便是补丁级升级，也因 `security` 作业内的 `supply:check` 检出 **SBOM 漂移**（已提交 SBOM 锁定 147 包精确版本）而被拦——**证明任何依赖版本变动都无法绕过完整回归**，与我在 G1-15 用变异测试确证的漂移守卫一致。#3 的 8/8 全红则说明大版本升级会真实击穿构建。

### 6.2 配置本身无豁免

`.github/dependabot.yml`：npm 生态、周更（周一 09:00 Asia/Shanghai）、并发上限 3、`versioning-strategy: increase`、commit 前缀 `chore`、标签 `dependencies`。

- **无豁免**：文件中 `ignore` / `allow:` / `automerge` / `auto-merge` 关键词命中 **0**——不存在跳过某依赖或自动合并的口子。
- **必经回归**：更新以 PR 形式进入，PR 触发同一 8 作业矩阵，且这 8 项正是 main 的必需检查（§3）→ **更新 PR 无法绕过完整回归合入**。
- **许可拦截链仍承重**：新依赖引入的许可扩张由 CI `security` 作业内的 `licenses:check` 与 `supply:check` 拦截（GPL/AGPL/未知阻断、147 包 SBOM 漂移检查）——二者的决定性我已在 G1-15 审计中用变异测试确证，本轮 §6.1 更获真实 dependabot PR 的实证。dependabot 文件末注亦明示"不由本文件豁免"。

### 6.3 盲区：冻结工具链记录无自动绑定（`G2-M1`）
`toolchain.versions.json`（G1-02 冻结、ADR-0002 背书）记 `typescript 6.0.3`、`node 24.17.0`、`prettier 3.9.5`；`pnpm-workspace.yaml` catalog 另行 pin `typescript 6.0.3`、`@types/node 24.13.3`。我全仓搜索**无任何脚本、检查或工作流读取 `toolchain.versions.json`**（`grep -rln` 命中 0）——即该冻结记录**纯属人工维护，无机器绑定**。

依赖更新恰是破坏该冻结的唯一活跃向量，而 dependabot 现已开出 typescript **大版本** 6→7、@types/node 24→26 两个 PR。当前它们被 CI 拦下（§6.1），但拦截原因是**构建破裂与 SBOM 漂移，而非"违反冻结工具链"**——若日后有人修好类型/构建破裂并重建 SBOM，8 项检查将全绿，PR 可合入，而 `toolchain.versions.json` 仍写 `6.0.3`，与实际 catalog 静默失同步，**无任何检查会发现**。

**定级理由**：不触任务书 FAIL 线（依赖更新确实"必经回归"，三个 PR 实测被拦），且该盲区源自 G1-02——我在 G1-16 审计中已登记 G1-02 属"文档证据、未经独立审计"四项之一。但依赖更新门禁正是 G2-02 的职责范围，且风险因 dependabot 上线而**由理论转为活跃**，故在此登记为 MINOR 而非旁观。

## 7. 边界诚实（任务书 §2 第 5 点）　**通过**

- **未强制 PR 评审的取舍已书面化** ✔：文档 §1 表格明列"强制 PR 评审｜未启用"，并说明单人开发下评审纪律由 G2-01 承担（DoD/PR 模板/评审清单）。与 G2-01 的"不因单人开发取消评审清单"衔接一致——技术侧不强制第二人审批（单人无从满足），治理侧仍要求评审清单与独立审计。**未假装已有强制评审**。
- **未公开仓库、未加协作者、无付费** ✔：`private: true`；协作者仅业主一人（admin）；文档 §5 明示未启用付费额度。
- **main 历史无改写** ✔：本地 `main` 与 `origin/main` 同为 `e5797f7`；G1 签署提交 `b88f4b9` 与 G1-16 基线 `c9a1fe0` **仍是 `origin/main` 的祖先**（`git merge-base --is-ancestor` 均 YES）——自 G1 签署以来历史线性延伸、无改写。签署后新增 5 个提交全为 `docs:`/治理提交。

## 8. 最终结论

**`CONDITIONAL PASS` —— `G2-M1` 关闭后 G2-02 可标记完成**

1. **规则真实**：8 必需检查与 CI 矩阵**集合完全相同**、禁 force-push、禁删除、`enforce_admins=false`、仓库 private——全部 `gh api` 实测，与文档逐项一致。
2. **门禁承重**：因果链逐环实测——故意 `any`（+2 行）→ `static` 因 `no-explicit-any` 失败（7/8 其余成功）→ PR `blocked`、未合并；初配下连 admin 亦被 405 拦。
3. **绕过受控且留痕**：绕过仅管理员可行（协作者仅一人）；**我实证可精确识别绕过提交**（`commits/{sha}/pulls` 为 0），配合禁 force-push 使痕迹不可常规抹除；直推实际仅用于 docs/治理提交，与声明边界一致。
4. **依赖更新无豁免且已获实证**：dependabot 零豁免关键词；**其已开出的 3 个真实 PR 全部被 CI 拦下**（#2/#4 因 SBOM 漂移败于 `security`，#3 大版本升级 8/8 全红），证明任何版本变动都无法绕过完整回归。
5. **边界诚实**：未强制 PR 评审的取舍书面化并与 G2-01 衔接；未公开、未加协作者、无付费；**main 自 G1 签署以来无历史改写**。

**唯一未闭合项** `G2-M1`：冻结工具链记录 `toolchain.versions.json` 无自动绑定，而 dependabot 正活跃提出大版本升级。**建议**：加一条轻量检查，比对 `toolchain.versions.json` 与 `pnpm-workspace.yaml` catalog、根 `engines`/`packageManager`，不一致即失败，并接入 `verify` 与 CI（可挂在既有 `config:check` 或 `supply:check` 下，避免新造命令）。**归属/最迟关闭点**：Codex；**首个依赖更新 PR 合并前**。另一条 NOTE（`G2-N1`）随文档维护处理即可。

在 `G2-M1` 关闭前，**已交付的保护规则与依赖门禁本身可以生效**（它们经实测确实拦住了全部三个真实依赖 PR）；但**任何依赖更新 PR 不应在该检查落地前合入**，否则冻结工具链可能静默失同步。

G2-01 已签署；**G2-02 待 `G2-M1` 关闭后签署**。后续 PA 系列任务仍须各自满足 DoR、走 PR 与独立审计。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由独立审计角色出具，只签署事实、不提供也不应用补丁；不修改仓库设置、治理文件或路线图，由 Codex 依本结论完成台账。

---

# G2-M1 定点复核与 G2-02 签署（2026-07-23）：`834cb3d`

> 复核提交：`834cb3d`（fix: close G2-02 toolchain pin gate minor）　整改记录：[G2-02-g2m1-remediation.md](G2-02-g2m1-remediation.md)
>
> 本章由同一独立审计角色出具。**不采信整改记录所称的"决定性证明"**——我自建变异矩阵独立复跑，并另行构造两条实施方未测的绕过路径。

## 1. 边界
- 本轮只对本文件追加；首审 115 行未删改。未修改代码、SBOM、保护规则或治理文件。
- 仓库外探针只写 `D:\tmp\g2m1*`，结束已删除。远程仍为只读（未合并/关闭任何 PR）。
- **审计基线零漂移**：`e5797f7..834cb3d` 对 `artifacts/`、`sbom/`、`pnpm-lock.yaml`、`.github/workflows/`、`.github/dependabot.yml`、`DEFINITION-OF-DONE.md`、`docs/poc-a/`、`assets/` **全部为空**——保护规则、SBOM、lockfile、workflow、依赖配置与 G2-01 治理文件未被触碰。我的三份审计报告以新文件提交，未被改写。

## 2. G2-M1　**已关闭**

`checkToolchainPins` 挂入既有 `check-sbom.ts`（**未新造命令**，随 `supply:check` 在根 `verify` 与 CI `security` 双侧执行——两侧我均实测输出 `8 toolchain pins aligned`）。

### 2.1 决定性变异矩阵（我自建，非复用实施方结论）

| 变异 | 结果 |
|---|---|
| 真实仓库 + 真实 SBOM（对照） | **PASS（8 pins）** |
| **SBOM `typescript` 6.0.3→7.0.2（即 dependabot PR #3 场景）** | **`TOOLCHAIN_DRIFT -> typescript`** ✔ 命中正确包名 |
| `eslint` / `@eslint/js` / `typescript-eslint` / `prettier` / `vite` 逐个漂移 | 5/5 命中且包名正确 ✔ |
| `engines.node` 改 24.18.0 | `-> node` ✔ |
| **`toolchain.json` 的 node 改 24.18.0（反方向）** | `-> node` ✔ **双向绑定成立** |
| `packageManager` 改 `pnpm@12.0.0` | `-> pnpm` ✔ |
| 多项同时漂移（typescript + vite） | `-> typescript, vite` **全部列出**，不止报第一个 ✔ |

**双向性是关键**：无论是"依赖升了、记录没跟"还是"记录改了、依赖没跟"，都被拦——这才真正锁住冻结记录，而非单向。

### 2.2 fail-closed（5 种残缺输入全部拒绝）
缺 `typescript` pin、pin 无 `version` 字段、`toolchain.versions.json` 不存在、非法 JSON、`package.json` 不存在——**5/5 抛 `TOOLCHAIN_DRIFT`**，无一静默跳过。

### 2.3 我另构的两条绕过路径——均被封死
实施方未测、我自行设计的规避方式：

| 绕过尝试 | 结果 |
|---|---|
| 把 `typescript` 在 SBOM 中降级为传递依赖（`direct=false`） | `-> typescript` **仍被拦** ✔ |
| 把 `typescript` 从 SBOM 整个删除 | `-> typescript` **仍被拦** ✔ |

即无法通过"改变分类"或"让包消失"来躲过冻结校验。

### 2.4 结论
首审 `G2-M1` 的原始风险——「修好类型/构建破裂并重建 SBOM 后，8 项检查全绿而 `toolchain.versions.json` 静默失同步」——**已被封死**：即便构建全绿、SBOM 重建完成，只要版本与冻结记录不一致，`supply:check` 即以 `TOOLCHAIN_DRIFT` 失败，而 `supply:check` 正是 main 的 8 项必需检查之一（`security` 作业）。

## 3. 单测承重（拆守卫应变红）

对 `toolchain.ts` 逐条件变异后复跑其 4 项单测：

| 变异 | 单测 |
|---|---|
| 对照（未改） | GREEN pass=4 |
| 版本比较恒真 | **RED**（`a bumped dependency without a toolchain record update is detected`） |
| `node` 比较恒真 | **RED**（`engines and packageManager drift are detected`） |
| `pnpm` 比较恒真 | **RED**（同上） |
| 移除抛错（忽略 mismatches） | **RED**（两项同时红） |
| **去掉 `&& entry.direct` 过滤** | **GREEN pass=4** ✖ → `G2-N2` |

核心版本/node/pnpm/抛错四条**均承重**；仅 `entry.direct` 子条件无决定性测试。

## 4. 新增 NOTE

- **`G2-N2`**：`checkToolchainPins` 中 `sbom.packages.find(e => e.name === packageName && **e.direct**)` 的 `direct` 过滤**无测试覆盖**——去掉它 4 项单测仍全绿。
  **实际暴露面为零**：我核查 6 个 pin 包在当前 SBOM 中**各只有 1 条目且均为 direct**（typescript 6.0.3、eslint 10.7.0、@eslint/js 10.0.1、typescript-eslint 8.64.0、prettier 3.9.5、vite 8.1.5），故当前树中该过滤是等价无操作，测试自然无从区分。
  **但它是有意义的纵深**：若某 pin 包日后同时出现直接与传递两份（如 ajv 的 8.20.0/6.15.0 那样），去掉过滤后 `find` 会按 name+version 升序命中**较低版本的传递副本**，可能**掩盖真实漂移（假阴性）**或产生假阳性。
  **行为本身正确**（§2.3 已证 `direct=false` 与"整个删除"两种情形均被拦），仅缺测试。**建议**：加一条合成用例——构造某 pin 包同时含传递旧版与直接 pin 版的 SBOM，断言仍通过；再把直接版改漂移，断言被拦。归属 Codex，随下次 `supply-chain` 维护处理。
  依 G2-01 的 DoD §2「核心守卫有决定性测试…不被邻近守卫代打」，此项登记为 NOTE 而非放行不提。

## 5. 回归
- `pnpm supply:check`：`147 packages (10 direct), license policy clean, no drift, **8 toolchain pins aligned**`。
- `pnpm ci:job security`：secrets/licenses/fonts/**supply-chain** 全过，同样输出 8 pins aligned——**CI 侧确实执行**。
- `pnpm verify`：退出 0、**194/194**。
- 三个 dependabot PR 仍为 open/未合并（按首审建议保留为活跃证据）——`G2-M1` 落地后，它们再合并已不会造成冻结记录失同步。

## 6. 复核结论

**`PASS` —— 兹签署 G2-02；G2 双门禁齐备**

- **`G2-M1`（MINOR）已关闭**：冻结工具链记录现由 `checkToolchainPins` **双向**绑定至 `engines`/`packageManager`/SBOM 直接依赖，挂在既有 `supply:check` 上、verify 与 CI 双侧执行；dependabot PR #3 场景实测被拦且命中正确包名；5 种残缺输入 fail-closed；我另构的两条绕过路径（降级为传递、整个删除）均被封死；4 条核心子条件中除 `direct` 外均有承重单测。
- **无新增 BLOCKER/MAJOR/MINOR**；一条 NOTE `G2-N2`（`direct` 过滤无覆盖，当前暴露面为零）与首审 `G2-N1`（留痕措辞）随维护处理。
- **首审其余结论保持成立**：8 必需检查与 CI 矩阵集合相同、禁 force-push/删除、private、协作者仅一人、留痕可实证识别、main 无历史改写、依赖更新必经完整回归。

综合首审 `CONDITIONAL PASS` 与本轮 `G2-M1` 关闭，**G2-02 无未关闭发现，可标记完成**。

**G2-01 与 G2-02 均已签署，功能变更门禁（治理侧 + 远程侧）齐备。** 后续 PA 系列任务仍须各自满足 DoR、走 PR 与独立审计；本签署不预先放行 PA-00 或任何具体任务的内容。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本复核由未参与实施与修复的独立审计角色出具，只签署事实、不提供也不应用补丁；不修改代码、仓库设置或路线图，由 Codex 依本结论完成台账。
