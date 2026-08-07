# CI-01 实施记录 · CI 作业范围按变更面收口

> 任务书：[CI-01-implementation-task](CI-01-implementation-task.md)（D1/D2 业主 2026-08-07 裁定）；实施：Kimi（实施者角色）；日期：2026-08-07。
> 本记录只写实际执行的检查与结果；反例证据均附 run id 与日志原件引用。

## 1. 范围对账

| 任务书要求 | 落实 |
|---|---|
| verify.yml 按变更面决定运行哪些 job | scope job + step 级跳过（见 §2 形态修正史） |
| fail-closed 优先于省钱（§4.1） | 脚本七形态 fail-closed（§4）+ 工作流三层兜底（§2） |
| 浅克隆陷阱（§4.3） | scope job `fetch-depth: 0`；本仓 `.git` 45M/size-pack 826 KiB 实测复验 |
| 不得引入新第三方 action（§4.4） | 仅复用既有两枚 SHA 钉定 action（checkout/setup-node），零新增 |
| concurrency/permissions/fail-fast/版本钉定/SHA 零改动（§4.5/§9.6） | diff 逐项核对：均不在本棒 diff 内 |
| job 内容零改动（§4.2） | 九个 job 的命令/阈值/断言一字未动，仅步骤加 `if` 守卫 |
| run 可判读（§5.5） | scope job 日志落 event/base/head/文件清单/判定；跳过腿步态逐条 skipped（§3 证据） |
| 六条决定性反例 | §3，全部有证据 |
| 变异自证（§5.2） | §4 |
| §5.4 逐 job 证明 | §5（**含一处推翻 D1 初判的实证**） |

## 2. 机制设计与形态修正史（如实记录第一版失败）

**最终形态**：`scope` job（checkout `fetch-depth: 0` + setup-node + `node tools/ci/scripts/scope.ts`）输出 `docs_only`；verify 矩阵 job 级 `if: always() && !cancelled()` 保全全部 9 个 check run；**每个步骤**带守卫 `env.CI_SCOPE_DOCS_ONLY != 'true' || contains('static unit-config security', matrix.job)`。docs-only 时被跳过的 6 个 job 以「全步 skipped 的 success」存在。

**为什么是 step 级而不是 job 级（第一版失败实证）**：初版把判定写在 job 级 `if` 并引用 `matrix.job`——GitHub contexts reference 明确 `jobs.<job_id>.if` 只允许 `github/needs/vars/inputs`（官方原文："evaluated before strategy.matrix is applied"）。首跑（run `31153055169`）工作流解析失败、0 个 job、run 名退化为文件路径。这是「指令可执行性」踩坑的又一实例：YAML 合法（prettier 过）≠ 工作流合法，不真跑就发现不了。

**为什么不是动态矩阵**：`matrix.job: fromJSON(needs.scope.outputs.jobs)` 可让被跳 job 完全不出现，但分支保护必需检查为 8 个（`gh api .../required_status_checks` 实测：static/unit-config/contracts/typecheck/build-test/build-staging/build-production/security——e2e 非必需）；docs-only 时 contracts/typecheck/build×3 五个必需检查将永远 pending 堵死合并。故选择「check run 全在场 + 步态可读」。

**fail-closed 三层**：① 脚本层——判定失败/空输出/基线不可得/不可分类事件一律 `docs_only=false`（§4 七形态单测）；② 工作流层——scope job 失败/缺席时输出为空，`'' != 'true'` ⇒ 所有步骤守卫为真 ⇒ 满跑；job 级 `always()` 防 needs 失败导致整 job 缺席；③ 事件层——`workflow_dispatch` 等不可分类事件直接满跑。

## 3. 六条决定性反例（证据）

| # | 构造 | 证据 | 结果 |
|---|---|---|---|
| 1 | docs-only 提交（新增 `docs/audits/CI-01-scope-counterexample-note.md` + roadmap 空白触碰，PR #61，base=ci-01-config） | run `31156853610`：scope 日志 `changed files (2): … docs_only=true`（job `92798115847` 日志原件）；**static 48s / unit-config 1m24s / security 36s 真实执行**；contracts 4s / typecheck 5s / build×3 4–5s / e2e 3s（对照满跑：contracts 4m12s、e2e 6m3s） | ✅ 恰 3 个真跑 |
| 2 | 纯代码提交 | 本 PR #60 首跑 run `31156360384`（5 文件含 verify.yml 与 tools/ci 源码） | ✅ 满跑 9 |
| 3 | 混合提交（代码 + docs） | run `31157232281`（本实施记录提交后 PR #60 总 diff = verify.yml + tools/ci 源码 + 本记录，scope 日志 `changed files (6) … docs_only=false`；e2e 6m6s、contracts 4m9s 真实执行） | ✅ 满跑 9 |
| 4 | 判定失效七形态 | §4 单测 + 变异自证 | ✅ 全部满跑方向 |
| 5 | 只改 roadmap（空白行触碰） | 同 #1 run：变更清单含 `docs/implementation-roadmap.md`，unit-config 1m24s 真跑（`roadmap-mirror.ts:15` 以真实路线图为种子，不能跳） | ✅ unit-config 执行 |
| 6 | docs/audits 新增文件 | 同 #1 run：变更清单含 `docs/audits/CI-01-scope-counterexample-note.md`，static 48s 真跑（8a/8b/8c 列举该目录） | ✅ static 执行 |

§5.5 步态原件：run `31156853610` 的 e2e job（`92798185562`）步态 = Set up job: success，其余 9 步（含 Run e2e）**逐条 skipped**。PR #61 已按探针约定关闭不合并、分支已删；探针文件未进 main。

## 4. fail-closed 单测与变异自证（§5.2）

`tools/ci/test/scope.unit.test.ts` 15 条：路径识别（含嵌套 .md、`docs/poc-a/` 保守排除）、docs-only 判真、五类非文档集判满跑、**判定失效七形态判满跑**（diff 非零退出/输出空/基线全零/基线缺失/基线畸形/head 缺失/workflow_dispatch）、push 事件 docs-only 判真。

变异自证：将 diff 失败分支改为 fail-open（`docsOnly: true, reason: "MUTANT"`）→ `pnpm --filter @wenshu/ci test` **fail 1，且红恰好落在反例 4 断言**（`fail-open detected: diff command non-zero exit`）；还原后 15/15 绿。红在别处即探针失效的要求满足。

工作流钉定断言（`ci-runner.unit.test.ts` 新增一条）：`fetch-depth: 0`、job 级 if 唯一且为 `always() && !cancelled()`（4 空格缩进级仅此一条）、step 守卫恰 6 条共享步 + e2e 组合守卫、action 引用全 SHA（5 枚 = 既有 3 + scope 复用 2）、`node tools/ci/scripts/scope.ts` 在位。

## 5. §5.4 被跳过 job 的 docs-insensitivity 证明（不引用任务书 D1 表）

方法：全仓 grep 追溯读取面 + 逐命令路径常量核对。**实证发现一处推翻 D1 初判**：

- **`fixtures:check`（contracts job）读取 `docs/poc-a/fixtures`**——`tools/fixtures/scripts/check-fixtures.ts` 路径常量 `"../../../docs/poc-a/fixtures"`。D1 表「contracts 读 packages/ 与 artifacts/」不成立。**处置**：`docs/poc-a/` 排除出文档面（`isDocumentationPath` 显式拒绝），任何触碰满跑；单测钉定两条（fixtures 路径与目录任意文件）。
- 其余读取面：contracts（generated:check 七个生成器只读包内 schema，`generate:check` 链不含 report-checks 批次人工工具；`gate-checklist.ts` 的 followups 引用为**字符串常量**、全 `src/` 零 fs 调用；ux-state 命中为注释）、typecheck（tsc 仅编译 TS，无 md 装载器）、build×3（vite 入口 apps/web，无 docs 引用）、e2e（electron-shell + web workspace 构建 + `assets/fonts`，无 docs 引用）。全仓 sweep（packages/apps/tools 排除 node_modules）对 `docs/audits|docs/adr|implementation-roadmap|决策记录|AGENTS.md` 的命中已全部核毕，无其他读取点。
- 保留三 job 的 docs 敏感性（正面证据）：static=quality:check 读 `docs/`（8a/8b/8c 与路线图不变量；prettier **不**覆盖 md，`.prettierignore:10`——任务书勘误段同源修正）；unit-config=`@wenshu/quality test:integration` 的 `roadmap-mirror.ts:15` 以真实路线图为种子 + `config:check`；security=`secrets:check` 走 `git ls-files` 全量。

## 6. 净省口径

引用时用净值：scope job 是每次 run 的第 10 个 job（实测 18s）。按近 40 次 main 提交（27 纯文档实测复算）：27×6 − 40×1 ≈ **122 job 次**，含全部 27 次 e2e（6m+ → 3s）。毛值 162 不得引用。

## 7. 检查执行记录

- 本地 `pnpm verify` **REAL_EXIT=0 两次**（首次 format 失败暴露 YAML 步名冒号未引用 + 两处 prettier，修复后复跑；退出码经无管道直取——本记录作者曾因管道吞码虚报一次 EXIT，见下）。
- 远程：PR #60 run `31156360384` 10/10（scope+9 满跑）与 run `31157232281` 10/10（反例 3 混合满跑）；PR #61 run `31156853610`（docs-only，3 真跑 6 步态 skipped）；首版工作流解析失败 run `31153055169`（§2）。
- 过程缺陷如实登记：① 首版 job 级 if 引用 matrix（§2）；② 一次 verify 退出码被管道吞（`pnpm verify | tail; echo $?` 取到的是 tail 的码），首次 verify 的 format 失败即由此迟发现一轮——与 AGENTS.md「管道吞退出码」同款，本棒后续全部直取退出码。

## 8. 独立审计修复轮（首审 BLOCKER-1/MAJOR-1，2026-08-07）

审计报告：[CI-01-claude-audit.md](CI-01-claude-audit.md)（随本轮提交入档；刻意不用 `-claude-audit-report.md` 后缀——CI-01 无路线图任务行，避免 G2-04 检查 8a 硬失败）。

**BLOCKER-1：重命名检测隐藏源路径 → 误判 docs-only（修复）**。审计者实证：`git mv packages/pdf-export/src/pipeline.ts docs/pipeline-moved.ts` 后 `git diff --name-only`（默认重命名检测）只报目标路径 → 分类器见纯 docs → 六腿全跳，而源文件已删、typecheck/build 必然失败，check run 却报 success。正犯任务书 §4.1「任何『算不出改了什么就跳过』的实现直接 BLOCKER」。修复：真实 git 调用从 `scripts/scope.ts` 提升为 `src/scope.ts` 导出 `runGitDiff`（命令行单一真源，script 复用），加 **`--no-renames`**——重命名报为删除+新增，两侧路径都进分类。

**MAJOR-1：真实 git 调用零测试覆盖（修复）**。12 处 decideScope 单测全注入 mock，喂输入的那段代码无任何测试，BLOCKER-1 正长在这条缝上（本项目第三次同形态：A-03 守卫许可集自报、A-04E 门静默空转、本次判据来源未覆盖）。新增 `scope.git.unit.test.ts` 3 条，临时仓库 + 真 `git mv`：
1. **跨面重命名（反例 7 单测形态）**：攻击前提断言先行成立（默认 diff 恰只报 `docs/pipeline-moved.ts`），修复后 `changedFiles` 含两侧路径、`docs_only=false`；
2. 真 docs-only 仍判真（防过矫正）；
3. PR 三点 range 对 merge base 真跑。

**MINOR-1（采纳）**：step 守卫 9 处 `contains('static unit-config security', matrix.job)` 子串匹配 → `contains(fromJSON('["static","unit-config","security"]'), matrix.job)` 精确成员（防假想 job 名 `static-analysis` 混入必跑集）；`ci-runner.unit.test.ts` 钉定断言同步更新并加负向断言（旧子串形态不得出现）。

**变异自证（修复轮）**：去掉 `--no-renames` → `node --test test/scope.git.unit.test.ts` **fail 1，红恰好落反例 7 断言**（`rename of source into docs/ must force a full run`，变异体 docsOnly 误判 true）；还原后 3/3 绿。

**反例 7（CI 实证，新增）**：探针分支 `git mv tools/ci/src/jobs.ts docs/jobs-moved.ts` → run `<待取证>`：scope 日志须列两侧路径且 `docs_only=false`、9 腿全真跑（移动后 import 断裂，typecheck/build 如实红 = 真跑的直接证明）；探针 PR 取证后关闭不合并。

**审计者要求入档的判读性警示（取舍后果写清）**：被跳腿以「全步 skipped 的 success」存在（§2，为兼容分支保护必需检查的取舍），check run 层面 10/10 全绿**不分辨**「真跑过」与「什么都没跑」——唯一事后分辨手段是 scope job 日志（§5.5，因此它不是锦上添花而是唯一手段）。整套机制的安全性完全押在 scope 判定上，BLOCKER-1 正是击穿点；`--no-renames` 与真 git 测试必须存在的原因即此。
