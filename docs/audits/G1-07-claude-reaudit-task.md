# Claude 独立复审任务书：G1-07

> 状态：待执行　审计者：Claude　实施者：Codex　日期：2026-07-20

请以原 [审计报告](G1-07-claude-audit-report.md) 为发现清单，审计 `bc63ff0..HEAD` 的整改。不要采信 [整改记录](G1-07-remediation.md) 或测试绿色输出；重跑原始反例并另找结构性绕过。

必须至少复核：

1. 用户能够在同一事件中裁决并保留模型来源；AI/system 不能接受/拒绝 AI 修改或批准正式版本，单事件与完整 bundle 均须验证。
2. 穷举五类 action 与 actor/decision/subject model/节点/source refs/前后哈希组合，确认 rejected 不改变、accepted/applied 必要场景确实改变。
3. 改动上游导出版本、项目 Schema 引用常量或联合 fixture ID 的只读等价探针，确认跨包漂移门禁真实存在；不要实际修改仓库。
4. 复核非法日历日期、正文 locator、密钥形状 provider/model、path/role 反转，以及 m-01/m-05 的任务归属。
5. 复跑冻结安装、`pnpm verify`、`tsc --listFiles`、零 any/抑制、生成漂移与体量检查。

只允许编辑 `docs/audits/G1-07-claude-audit-report.md`，在原报告后追加复审章节；不得修改实现、Schema、测试、整改记录、路线图或 lockfile。存在未关闭 BLOCKER/MAJOR 必须 `FAIL`；只有一般问题且均有明确归属方可 `CONDITIONAL PASS`。
