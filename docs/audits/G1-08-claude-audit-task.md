# Claude 独立审计任务书：G1-08

> 状态：已完成（`FAIL`）　审计者：Claude　实施者：Codex　日期：2026-07-20

请独立审计 G1-08“测试骨架与并行隔离设施”。不要采信实施说明、测试绿色输出或路线图自述；先阅读 `AGENTS.md`、`DEFINITION-OF-READY.md`、`docs/testing-strategy.md`、`docs/test-infrastructure.md` 与 G1-08 路线图行，再检查实现并自行构造反例。

必须至少验证：

1. 所有 `*.test.ts` 均被层级审计发现，模糊命名、嵌套目录、Windows 路径和新增未分类测试不能绕过；空的 render/integration/E2E 只能报告 `not-registered`，不得显示为通过。
2. 两个并行 worker 的目录、数据库槽位、文件槽位、证据目录、项目 ID 与端口段互不冲突；用路径穿越、绝对片段、相同/极大 index、端口边界和并发创建寻找逃逸或碰撞。
3. 失败证据真实保存 seed 与诊断日志，既有证据不会被静默覆盖；成功清理策略不会删除其他 worker 或受控根目录之外的文件。
4. 本任务没有用 Map、JSON 文件或 mock 冒充数据库集成，也没有把未穿过真实入口/构建/存储的测试命名为 E2E。
5. `docs/host-contract.md` 引用真实导出；终态后的 cancel 在原始首审反例和新变体下返回稳定 issue code/path，且不破坏正常取消流程。
6. `pnpm verify`、各分层命令、严格 TypeScript 覆盖、零手写 `any`/`@ts-ignore`、文件体量与 lockfile 供应链边界均符合项目规则。

只允许创建或追加 `docs/audits/G1-08-claude-audit-report.md`；不得修改实现、测试、配置、lockfile、路线图或验收标准。存在 BLOCKER/MAJOR 必须 `FAIL`；仅有已明确归属且不阻断消费者的一般问题方可 `CONDITIONAL PASS`。
