# Claude 独立复审任务书：G1-08

> 状态：待执行　审计者：Claude　实施者：Codex　日期：2026-07-20

请以原 [审计报告](G1-08-claude-audit-report.md) 为发现清单，审计 `dde75b0..HEAD` 的整改。不要采信 [整改记录](G1-08-remediation.md) 或绿色输出；逐项重跑原始反例并另找结构性绕过。

实施者自报 `pnpm verify` 101/101、独立契约层 91/91；这些数字仅用于帮助发现漏跑，不是审计证据。

必须至少复核：

1. 在临时假工作区把规范和非规范测试放入仓库根、`tests/`、`e2e/`、`src/`、任意新增顶层目录及深层目录，确认全仓发现完整；依赖/构建/缓存/测试产物目录仍被排除。
2. 在 Windows 上复跑 `Sneaky.Test.ts`、`legacy.Spec.ts`、`Foo.Unit.Test.ts` 等大小写变体：它们必须进入候选且因非规范命名使审计失败，不能被 runner 当作已登记层级。
3. 对同一 run/layer/index 发起至少 8 路并发准备，必须恰好一个取得 prepared claim，其余快速失败；尝试利用预置空目录、文件、junction、claim 篡改和清理 API 抢占或删除兄弟 worker。
4. 验证 `test:contract` 的发现集合与实际执行集合一致且包含 config；新增一个临时契约测试时不能静默漏跑。
5. 空 render/integration/e2e 默认必须非零退出；仅显式 `--allow-empty` 可返回 0，输出始终是 `not-registered` 而非 PASS。
6. 绕过 TypeScript 传多段/未知 layer 必须被公共构造器拒绝；名为跳过目录的链接必须先拒绝而非静默忽略。
7. 复跑 `pnpm verify`、严格 TypeScript、零手写 `any`/抑制、文件体量、lockfile 与无数据库/E2E 冒充检查。Host NF-01/NF-04 已由首审确认关闭，只需做回归抽查。

只允许在原 `docs/audits/G1-08-claude-audit-report.md` 后追加复审章节；不得修改实现、测试、配置、lockfile、路线图、整改记录或验收标准。存在未关闭 BLOCKER/MAJOR 必须 `FAIL`；仅有已明确归属且不阻断消费者的一般问题方可 `CONDITIONAL PASS`。
