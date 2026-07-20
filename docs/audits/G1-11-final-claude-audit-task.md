# G1-11 远程首跑与 MINOR 收尾独立审计任务书（交给 Claude）

> 日期：2026-07-20　首审报告：[G1-11-ci-claude-audit-report.md](G1-11-ci-claude-audit-report.md)　收尾提交：`6ba1511`　审计范围：`0a6877c..6ba1511`

## 1. 角色与写入边界

你是 G1-11 原独立审计角色。本轮复核首次远程运行证据以及首审 CI-02～CI-05 四项 MINOR 的本地收尾；不要采信实施记录、台账或全绿自述。

- 只允许严格追加修改 `docs/audits/G1-11-ci-claude-audit-report.md`，首审和 CI-01 复核记录不得删除或改写。
- 不得修改代码、测试、workflow、lockfile、路线图、配置、Schema、生成物或其他文档。
- 仓库外探针只写 `D:\tmp\g111*`，结束后删除。
- GitHub 只允许只读查询 run/job/log；不得 push、创建 PR、重新运行、取消或触发 Actions。
- 完成时工作树只能有原报告一处修改。

## 2. 首次远程运行证据

独立使用 GitHub CLI/API 只读核验：

- 仓库 `deloog/wenshu` 的 run `29748496592`，URL `https://github.com/deloog/wenshu/actions/runs/29748496592`。
- event 必须为 push，head SHA 必须为 `0a6877c74c8df50610ec16103d2cbdb2be152952`，status/conclusion 必须为 `completed/success`。
- 8 个 job 名与 `CI_JOB_NAMES` 精确一致，每项 conclusion 均为 success；记录实际 started/completed 时间，不只采信文档表格。
- 从日志核验 Ubuntu workflow 确实完成 checkout、Node 24.17.0、Corepack/pnpm 11.15.1、冻结安装与真实 `pnpm ci:job`，不是空步骤。
- 核验缓存事实：首次多个 job 为 miss；`build-production` 成功保存完整键，较晚的 `security` 成功恢复；其他 post step 的同键竞争未使 job 失败。
- `cancel-in-progress` 未通过第二次同分支运行验证，文档必须继续写明未执行，不得由单次成功推定。

确认远程 `origin/main` 当前仍为 `0a6877c`，收尾提交 `6ba1511` 尚未推送；本轮只能判断是否允许最终同步，不能把未推送代码视为已远程验证。

## 3. CI-02：matrix 双向互锁

独立解析 workflow matrix 与 `CI_JOB_NAMES`，验证集合、顺序和数量均一致。仓库外副本至少做：

- 新增 `sneaky-extra`、删除、改名、重复、调换顺序；均应使 `ci-runner.unit.test.ts` 因完整数组不相等而失败。
- 合法原文件必须通过；不能靠硬编码“恰好 8”但不比名称来凑结果。
- `CI_JOBS` 自身的键集合互锁不得回归。

若新增方向仍可通过，CI-02 未关闭。

## 4. CI-03：Action 完整 SHA

从 workflow 提取全部 `uses:`，确认恰有 3 项且每项只能匹配“仓库名 + `@` + 40 位小写十六进制 SHA”。仓库外副本测试 `@v7`、`@v7.0.0`、`@main`、短 SHA、39/41 位、含非十六进制字符、增加第四个 Action；全部必须失败。三个现有完整 SHA 必须通过。

确认测试验证的是实际引用值，不是注释中的 `# v7.0.0`；不得因可移动标签会让远程 fail-closed 就忽略任务书原验收要求。

## 5. CI-04：空/损坏 pnpm 仓库

仓库外伪造虚拟仓库，至少验证：

- `.pnpm` 存在但为空、只有文件、只有 `node_modules` 保留目录、包条目下缺嵌套 `node_modules`、嵌套目录为空：全部非零/fail-closed。
- 一个合法普通包、一个合法 scoped 包、两者并存：发现集合正确；真实仓库仍为 115 个实际路径及非空许可分布。
- 删除 `directories.size === 0` 守卫必须让新增空仓库测试失败；恢复首审的 ENOENT 静默吞掉逻辑时，损坏条目不得被隐藏。

检查修复没有把合法空工作区或工作区自有包误算作第三方；`pnpm install --frozen-lockfile` 后真实安全作业仍通过。

## 6. CI-05：过程记录完整性

核对 [实施记录](G1-11-ci-implementation.md)“关键反例”是否现在完整包含首审任务书列举的四项实际过程：

1. 首轮 static 因 4 个格式问题失败；
2. 初版许可证只扫 11 个路径且分布为空；
3. 暂存后秘密扫描命中测试源码中的私钥头 fixture，改为运行时拼接；
4. 从包目录运行 workflow 测试因 cwd 假设产生 ENOENT，改用 `import.meta.url`。

只判断记录是否完整、措辞是否与事实一致，不要求把实施失误包装成成果；CI-05 不涉及运行时门禁。

## 7. 共同回归与判定

- 运行 `pnpm --filter @wenshu/ci test`、`typecheck`、`pnpm ci:verify`、`pnpm verify`；记录测试与文件计数。
- 复核 CI-01 NUL 反例、IA-01、RA-01/RA-02 无回归。
- 零手写 `any`/抑制指令/宽泛 ignore；lockfile、workflow、Schema、生成物在收尾范围零漂移。
- [首次远程证据](G1-11-first-remote-run.md)、[收尾台账](G1-11-followups.md)、路线图和索引不得把本地收尾冒充已推送，或提前标 G1-11 完成。

在原报告末尾追加“G1-11 远程首跑与 MINOR 收尾审计”章节，逐项签署 CI-02～CI-05，列出远程证据、反例、命令、未执行项、工作树边界和结论：

- 任一 BLOCKER/MAJOR，或 CI-02～CI-05 原反例仍成立：`FAIL — 不得最终同步`。
- 四项关闭且无新 BLOCKER/MAJOR：`CONDITIONAL PASS — 允许业主授权最终同步并复跑远程 CI`。

即使放行，G1-11 仍须等待 `6ba1511` 与本审计报告提交推送后产生的新远程 run 成功；本轮不得自行标记最终完成。
