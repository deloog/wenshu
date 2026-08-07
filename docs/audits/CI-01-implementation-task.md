# CI-01 实施任务书 · CI 作业范围按变更面收口

> 任务 ID：`CI-01`（工程底座维护，不新增路线图任务行）　起草：Claude（独立审计角色）　日期：2026-08-07
> 触发：业主观察到远程仓库配额告急，要求核查 CI 机械化漏洞并约束执行 AI 行为。
> 本任务书**不放宽任何门禁内容**——只改「哪些 job 在什么变更下运行」，不改「每个 job 跑什么」。
> 起草者声明：本文件只归集既有权威来源、标出待裁定点并给出实测过的机制约束，不构成实施；CI-01 的独立审计仍由 Claude 担任。
>
> **本任务书中每条机制性断言均已在本仓当命令实跑验证**（AGENTS.md 长期踩坑①）。

## 0. 起草结论

**问题成立、量级明确、可安全收口，但这是一次动证据链的改动，须按门禁级别对待。**

实测数据（我在本仓跑的，非估算）：

```
近 100 次 run:  pull_request 64 / push 34 / dynamic 2
分支 top1 = main（36 次），高于任何特性分支
近 40 次 main 提交:  纯文档 27 / 触及代码 13   → 文档占 67.5%
```

每个纯文档提交都在跑满 **9 个 job**，含 ~6–7 分钟的 `e2e`（还要 `apt-get install` xvfb/GTK/NSS）与三个 vite build。

**但"文档 = 可以少跑"这个直觉是错的，我查出来了**：`tools/quality/test/roadmap-mirror.ts:15` 以**真实** `docs/implementation-roadmap.md` 为种子构造镜像并解析 §3.1 链接目标物化文件——而**加台账行是我们每一棒都做的动作**。所以 `unit-config` 会被文档改动影响，不能跳。

正确的收口是**更细的**，不是更粗的：见 §3 D1。

## 1. 任务标识与开工资格

| 项 | 值 |
|---|---|
| 性质 | 工程底座维护；**不新增路线图任务行**（故不触发[检查 8a](../../tools/quality/src/roadmap-checks-evidence.ts)——本文件与审计报告均不使用 `-claude-audit-report.md` 后缀，见 §7） |
| 影响面 | `.github/workflows/verify.yml`；可选新增一个纯脚本 |
| 依赖 | 无（现有工作流已是单文件、单 OS、含 `cancel-in-progress`） |
| 风险等级 | **中高**——CI run 是每一棒台账与审计报告引用的证据，改动它等于改证据的产生方式 |

### DoR 对照

| DoR 项 | 状态 |
|---|---|
| 闸门允许 | ✅ 工程底座维护，不动产品范围 |
| 一句话完成定义 | ✅ 纯文档变更只运行可能被文档影响的 job；其余变更行为完全不变 |
| 可验收标准 | ✅ §5 六条决定性反例 |
| 停止边界 | ✅ §4「fail-closed 优先于省钱」 |
| 是否改契约/依赖 | ⚠️ 待 D2；**不得引入新第三方 action** |
| 回滚 | ✅ 单文件改动，`git revert` 即回到现状 |

## 2. 范围

**范围内**：按变更面决定运行哪些 CI job；把六条执行侧行为约束落进 `AGENTS.md`。

**范围外**：任何 job 的内容（命令、阈值、断言）；`concurrency` / `permissions` / `fail-fast` / action SHA 钉定；本地 `pnpm verify` 的组成；产品代码。

## 3. 待裁定的三件事

### D1　跳过集合与判定边界

我按「这个 job 有没有可能被文档改动影响」逐个核过（依据在括号里）：

| job | 内容 | 文档能否影响 | 处置 |
|---|---|---|---|
| `static` | format:check / lint / quality:check | **能**——quality:check 含路线图不变量与 8a/8b/8c，直接读 `docs/`。**注意：`format:check` 不构成依据**——`.prettierignore:10` 为 `**/*.md`，markdown 完全不在 prettier 覆盖内（见下方勘误） | **必跑** |
| `unit-config` | test:foundation / web test / **quality test:integration** / config:check | **能**——`roadmap-mirror.ts:15` 以真实路线图为种子 | **必跑** |
| `security` | secrets:check / licenses:check / fonts:check / supply:check | **能**——密钥扫描覆盖全仓，审计报告里粘进 token 是真实风险 | **必跑** |
| `contracts` | contracts:check / project-storage / fixtures:check / environment:check | 看不出能——读 `packages/` 与 `artifacts/` | 建议跳，**须由实施者证明** |
| `typecheck` | tsc | 看不出能 | 建议跳，须证明 |
| `build-test` / `build-staging` / `build-production` | vite build | 看不出能 | 建议跳，须证明 |
| `e2e` | test:e2e | 看不出能 | 建议跳，须证明 |

**我的建议**：纯文档变更 → 运行 `static` + `unit-config` + `security`，跳过其余 **6 个**（9→3）。

**净收益（已扣除新增成本）**：scope 判定本身是每次 run 都要跑的**第 10 个 job**，故按近 40 次 main 提交推算：省 27 × 6 = 162，减去 40 次 scope job = **净省约 122 个 job 次**。`e2e` 的 27 次仍是全省（scope job 是秒级的 checkout + diff，与 6–7 分钟的 e2e 不同量级）。**引用时请用净值 122，不要用毛值 162。**

> **勘误（2026-08-07，实施侧审查发现，起草者已复验）**：本表 `static` 行原写「prettier 覆盖 `.md`」，**不成立**——`.prettierignore:10` 为 `**/*.md`。带对照组的决定性测试：`docs/` 下故意写坏的 `.md` 得到 `All matched files use Prettier code style!`（零文件匹配，与真通过输出**完全相同**），同目录同样写坏的 `.ts` 则被正确 warn。
>
> **两点后果**：① `static` 必跑的唯一真实依据是 `quality:check`，`format:check` 不构成依据；② **`prettier --check <某个 .md>` 是静默空转，其"通过"不构成任何证据**——本仓 markdown 目前没有任何格式门禁。任何文档以"prettier 干净"作为验证依据的表述都应视为无效，包括起草者此前多份审计报告中的同类表述。

**注意分工**：上表右四行我写的是「看不出能」，不是「不能」。**"被跳过的 job 与文档无关"这一点必须由实施者用证据证明，不得引用本表作为依据**——本表只是起草者的初判。证明方法见 §5.4。

### D2　缩减适用的事件范围，与 fail-open 兜底口径

任何"按变更面缩减 CI"的机制都引入一个**新的失效模式**：判定错误 → 该跑的没跑 → 代码未经验证进入主干。这比省下的配额重要得多。

**须裁定**：

1. 缩减适用于 `pull_request` / `push:main` / 两者？（我的建议：**两者**——main 上的文档提交正是大头）
2. 兜底口径（我的建议，**不接受更弱的**）：**scope 判定发生任何异常、返回空、无法确定基线时，一律运行全部 9 个 job。** 省钱永远让位于 fail-closed。

### D3　六条行为约束是否落为 AGENTS.md 硬约束

配置改动能省的是"跑得太多"，省不了"推得太多"。下列六条针对执行侧，**零风险、立刻见效**，建议先于配置改动落地：

1. **本地 `pnpm verify` EXIT=0 之前不 push**；
2. **不用"再推一个提交"重跑 CI**——用 `gh run rerun --failed`（只重跑失败 job）或 `workflow_dispatch`；
3. **修复轮批量推**，不要一个 fix 一次 push；
4. **flake 复现在本机做**——CI 不是复现工具（A-03 MINOR-1 是本机复跑两轮抓到的，CI 一次未复现）；
5. **文档提交合并**——台账行 + AGENTS 条目 + followups 同一提交（`bb2e2e4` 是正例）；
6. **VM／长任务证据不进 CI**（A-04E 八轮 VM 全在本机，零 CI 消耗，此模式保持）。

## 4. 硬边界（越界即停）

1. **fail-closed 优先于省钱。** 判定失败即满跑。**任何"算不出改了什么就跳过"的实现直接 BLOCKER。**
2. **只改「跑不跑」，不改「跑什么」。** 任一 job 的命令、阈值、断言零改动。
3. **浅克隆陷阱（我实测确认）**：`.github/workflows/verify.yml` **未设置 `fetch-depth`**，`actions/checkout` 默认为 `1`，**浅克隆下 `git diff` 取不到基线**。必须显式解决——本仓 `.git` 仅 45MB、`size-pack` **827 KiB**，`fetch-depth: 0` 代价可忽略；或用 `gh api` 取变更文件清单。**无论选哪条，都必须先当命令跑通再写进工作流。**
4. **不得引入新第三方 action。** 本仓 action 全部按 SHA 钉定（`actions/checkout@9c091bb…`），新增依赖须走供应链审批（决策 #12 同款形态）。
5. **不得改动** `concurrency`（含 `cancel-in-progress: true`）、`permissions`、`fail-fast: false`、Node/pnpm 版本钉定、action SHA。
6. **不得让缩减 run 冒充满跑 run。** 每次 run 必须能机械判读它跑了哪些 job（见 §5.5）。

## 5. 验收标准与决定性反例

### 5.1 六条决定性反例（每条都要能演示）

| # | 构造 | 期望 |
|---|---|---|
| 1 | 纯文档提交（改 `docs/audits/xxx.md`） | 恰好运行 `static`/`unit-config`/`security`，其余 6 个 skipped |
| 2 | 纯代码提交（改 `packages/**`） | **满跑 9 个** |
| 3 | 混合提交（文档 + 代码） | **满跑 9 个** |
| 4 | **scope 判定失效**（模拟 diff 命令非零退出／输出为空／基线不可得） | **满跑 9 个**（fail-closed） |
| 5 | 只改 `docs/implementation-roadmap.md`（加一行台账） | **`unit-config` 必须运行**——`roadmap-mirror.ts` 以真实路线图为种子 |
| 6 | 只改 `docs/audits/` 下新增一个报告文件 | `static` 必须运行（8a/8b/8c 列举该目录） |

### 5.2 变异自证

把 §4.1 的兜底改成 fail-open（判定失败即跳过）→ **反例 4 必须变红**；改回后全绿。红必须落在反例 4 对应的断言上，红在别处即探针失效、作废重做。

### 5.3 回归

`pnpm verify` 本地 EXIT=0；改动后至少各触发一次反例 1 与反例 2 的真实 run，贴 run id 与实际执行的 job 清单。

### 5.4 被跳过 job 的 docs-insensitivity 证明（不得引用 §3 D1 表）

对 `contracts` / `typecheck` / `build-test` / `build-staging` / `build-production` / `e2e` **逐个**给出证据：该 job 的全部命令读取的路径集合不含 `docs/`、`AGENTS.md`、`决策记录.md`。方法建议：实跑该 job 并记录其文件读取面，或逐命令追溯到源码中的路径常量（如 `environment:check` 读 `artifacts/reference-machine`、`fixtures:check` 读 `packages/fixtures`）。**"我看不出它会读"不算证据。**

### 5.5 run 可判读性

每次 run 必须留下机械可读的"本次执行了哪些 job"记录（scope job 的输出即可）。这是审计能核对"报告所引 run 是否覆盖被审代码"的前提。

## 6. 承接项处置

**我实测全仓 followups，无一条归口 CI-01。** 本棒不关闭任何既有条目、不代签。

## 7. 交付物

- `.github/workflows/verify.yml` 改动（+ 可选纯脚本，无新依赖）；
- `AGENTS.md`：六条执行侧行为约束（D3）；
- `docs/audits/CI-01-implementation-record.md`：六条反例的构造与结果、变异自证、§5.4 的逐 job 证明、实际 run id 与 job 清单；
- **审计报告命名为 `CI-01-claude-audit.md`（刻意不用 `-claude-audit-report.md` 后缀）**——CI-01 无路线图任务行，用该后缀会让[检查 8a](../../tools/quality/src/roadmap-checks-evidence.ts) 硬失败（A-01 契约加固棒已踩过同一形态，见该棒审计报告的命名说明）；
- PR（**挂起不合**）+ 远程 CI 全绿。

## 8. 流程纪律

PR 挂起 → 独立审计 → 修复 → 复审 → 合并。**审计报告随 PR 落盘**（死链无门禁兜底，A-01 契约加固棒实测）。本棒**无台账行**，故无 8a 同轮要求；合并后按惯例用 `main` squash SHA 记录于实施记录。

## 9. 独立审计的猎杀方向（预告）

1. **fail-open（第一个查）**——自构判定失效的多种形态（命令非零退出、输出空、基线 SHA 不存在、force-push 后 `before` 为全零），每一种都必须满跑；**任一形态下变成"跳过"即 BLOCKER**。
2. **浅克隆**——核基线获取机制在 `pull_request` 与 `push:main` 两种事件下都真实可用，不是恰好在某一种下能用。
3. **路径分类**——逐条核"这个路径为什么算文档"；重点核反例 5/6 真的会红。
4. **被跳过的 6 个 job**——不采信断言，只看 §5.4 的证据；证据不足即要求补，或把该 job 移回必跑集。
5. **run 引用完整性**——抽查近期报告/台账所引 run：若被审对象含代码改动而所引 run 是缩减 run，即 BLOCKER。
6. **既有安全属性零改动**——`concurrency` / `permissions` / `fail-fast` / action SHA / 版本钉定逐项比对。
7. **省下的配额是否真省到**——对比改动前后同类提交的 job 数，不接受"应该省了"。

---

*本任务书由独立审计角色起草，只归集既有权威来源并标出待裁定点，不构成实施。*
