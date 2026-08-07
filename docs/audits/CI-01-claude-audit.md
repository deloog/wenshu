# CI-01 Claude 独立审计报告

> 审计对象：CI 作业范围按变更面收口。分支 `ci-01-config` 头 `1a88138`，PR #60 **未合入**（`main` = `d2c4149`）。
> 依据：[CI-01 任务书](CI-01-implementation-task.md)（我起草）、[实施记录](CI-01-implementation-record.md)。
> 审计方法：按任务书 §9 顺序，第一个查 fail-open；机制性断言一律自建构造验证，不采信自述与单测结论。
> **文件命名说明**：本报告刻意不使用 `-claude-audit-report.md` 后缀——CI-01 无 §3.1 台账行，用该后缀会让[检查 8a](../../tools/quality/src/roadmap-checks-evidence.ts) 硬失败（任务书 §7 已预告）。

## 1. 结论

**不签署。发现一项 BLOCKER。**

`decideScope` 本身写得好——七种存疑形态全部 fail-closed，`docs/poc-a/` 的保守排除是一处真发现。**但判定的输入被污染了**：`git diff --name-only` 未带 `--no-renames`，重命名在该模式下只显示目标路径，于是"把源码文件移进 `docs/`"这一类改动会被判成纯文档，**跳过 6 条腿并报 10/10 全绿**，而源文件已被删除。

这不是理论风险，我构造复现了。它直接违反任务书 §4.1 自己的措辞：**「任何『算不出改了什么就跳过』的实现直接 BLOCKER」**——此处比"算不出"更糟，是"算出来的是错的"。

## 2. BLOCKER-1　重命名检测使判定失效（fail-open）

**位置**：[tools/ci/scripts/scope.ts:13](../../tools/ci/scripts/scope.ts#L13)

```js
const result = spawnSync("git", ["diff", "--name-only", range], { encoding: "utf8" });
```

git 自 2.9 起默认开启 `diff.renames`，而 `--name-only` 对重命名**只输出目标路径**。

**我的实测**（在 `origin/main` 的干净 worktree 上真跑）：

```text
git mv packages/pdf-export/src/pipeline.ts docs/pipeline-moved.ts

git diff --name-only HEAD~1 HEAD
  docs/pipeline-moved.ts                      ← 只有目标路径

git diff --name-only --no-renames HEAD~1 HEAD
  docs/pipeline-moved.ts
  packages/pdf-export/src/pipeline.ts         ← 被隐藏的删除
```

代入 `isDocumentationPath("docs/pipeline-moved.ts")` → `true`（不在 `docs/poc-a/` 下、位于 `docs/` 内）→ `changedFiles.every(...)` → `docsOnly = true` → **`typecheck` / `contracts` / `build-test` / `build-staging` / `build-production` / `e2e` 六条腿全部跳过**。

而 `packages/pdf-export/src/pipeline.ts` 已被删除——typecheck 与三个 build 必然失败。**它们没跑，check run 报 success，PR 面板显示 10/10 全绿。**

**更现实的一种形态**：把 fixture 从 `docs/poc-a/fixtures/` 移到 `docs/` 下别处。实施侧 §5.4 特意把 `docs/poc-a/` 排除出文档面以保护 `fixtures:check`（`contracts`，被跳过），**而重命名检测恰好绕过这层保护**——源路径不出现在 diff 里，保护形同虚设。

**修法**：`["diff", "--name-only", "--no-renames", range]`，一个 flag。

**但只加 flag 不够**，必须同时补 §3 那条测试，否则下一个同类问题照样溜过去。

## 3. MAJOR-1　测试边界恰好画在缺陷之外

[tools/ci/test/scope.unit.test.ts](../../tools/ci/test/scope.unit.test.ts) 对 `decideScope` 覆盖得很扎实——七种 fail-closed 形态逐条钉定。**但每一条都注入 `runDiff: diffWith([...])` 这个 mock**：

```js
runDiff: diffWith([...])      // 全部 12 处调用均为注入
```

也就是说 `tools/ci/scripts/scope.ts` 里**真实的 git 调用零测试覆盖**——而 BLOCKER-1 正长在那条未被覆盖的缝上。`decideScope` 再严谨也没用：**它拿到的输入已经是错的，而喂给它输入的那段代码没有任何测试**。

这与本项目已经吃过两次的形态相同：A-03 的守卫许可集由被审对象自己申报、A-04E 的门在 git 缺失时静默空转——**判据的来源没有被独立验证**。

**要求**：至少补一条**打真实 git 的**测试（临时仓库 + 真实 `git mv` + 断言分类结果为满跑）。mock 层的测试保留，但不能替代它。

## 4. MINOR-1　必跑集合用子串匹配

```yaml
if: ${{ ... || contains('static unit-config security', matrix.job) }}
```

`contains(string, string)` 是**子串**匹配，不是集合成员判断。当前 9 个 job 名下结果正确，且误匹配的方向是安全的（多跑而非少跑）。但它脆弱：将来新增名为 `unit`、`config`、`sec` 的 job 会被子串命中。

GitHub Actions 支持精确成员判断：

```yaml
contains(fromJSON('["static","unit-config","security"]'), matrix.job)
```

不阻断，建议改。

## 5. 我核过且成立的部分

| 项 | 结果 |
|---|---|
| `decideScope` fail-closed | 七形态齐全：事件不可分类 / base SHA 非法或全零 / head SHA 非法 / diff 非零退出 / **空 diff 判为未定** / 任一非文档文件 → 全部满跑 ✅ |
| 浅克隆陷阱（我上轮标注） | scope job 用 `fetch-depth: 0`，已解决 ✅ |
| `docs/poc-a/` 排除 | 我独立确认 `fixtures:check` 确实读 `docs/poc-a/fixtures`；保守排除方向正确 ✅ **（这是实施侧推翻我 D1 初判的一处真发现）** |
| `report-checks` 的 `docs/audits/` 引用 | 我查了 [gate-checklist.ts:24](../../packages/report-checks/src/gate-checklist.ts#L24)——`reference` 是冻结种子数组里的**纯数据字符串，不读盘**，不构成额外的洞 ✅ |
| 既有安全属性 | `concurrency`（含 `cancel-in-progress`）、`permissions`、`fail-fast: false`、Node/pnpm 版本钉定、action SHA 钉定**逐项未改**；新增 scope job 复用同一批 SHA ✅ |
| 改动面 | 相对 `origin/main` 仅 6 文件 `+397/−4`，无范围外产物 ✅ |
| 净省口径 | 已按实测改为净值 ~122（毛值 162 减 40 次 scope job），e2e 27 次全省 ✅ |

**两处过程缺陷的处理我认可**：job 级 `if` 无 matrix 上下文（首跑工作流解析失败 `31153055169`）下沉到 step 级；一次 verify 退出码被管道吞后改为直取。两处都如实登记、未掩饰。

## 6. 一处结构性提醒（非发现，但请写进记录）

被跳过的腿**报 success 而非 skipped**（job 级 `always()` + step 级全 `if`）。这是为兼容分支保护必需检查做的取舍，我理解，但后果要说清楚：

> **10/10 全绿既可能是"真跑过"，也可能是"什么都没跑"，check run 本身分辨不出来。**

于是整套机制的安全性**完全押在 scope 判定的正确性上**——而这正是 BLOCKER-1 击穿的地方。任务书 §5.5 要求的"机械可读的执行记录"因此不是锦上添花，是**唯一的事后分辨手段**，请确保 scope job 日志长期可追溯。

## 7. 关闭条件

1. **BLOCKER-1**：`--no-renames`；
2. **MAJOR-1**：补一条打真实 git 的测试，含 `git mv` 跨面重命名用例，断言判定为满跑；
3. **MINOR-1**：建议改 `fromJSON` 精确成员判断（不阻断）；
4. 修复后重跑任务书 §5.1 的六条反例，**并新增第 7 条**：源码文件重命名进 `docs/` → 必须满跑；
5. 变异自证：把 `--no-renames` 去掉 → 第 7 条必须变红。

修复后由我复审关闭。**PR #60 在复审签署前不合入。**

---

*本报告由独立审计角色出具；任务书亦由我起草（只归集权威来源、标出待裁定点，不构成实施），故仍可担任本棒审计——本轮所审为 `verify.yml` 与 `tools/ci/**` 的机制实现，非我撰写的文本。审计期间仅新增本文件；全部探针（重命名 worktree 构造）均已清理。*
