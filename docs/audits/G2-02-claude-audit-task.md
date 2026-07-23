# G2-02 远程分支保护与依赖更新门禁独立审计任务书（交给 Claude）

> 日期：2026-07-23　实施基线：`feat: add G2-02 branch protection and dependency gates` 提交　报告目标：`docs/audits/G2-02-claude-audit-report.md`

## 1. 角色与写入边界

你是独立只读审计者。用 `gh api` 只读核验远程实际生效规则，不采信文档、截图或实施记录自述。只允许新增/修改上述审计报告；不得修改仓库设置、分支、PR、治理文件或代码。

## 2. 审查要点

- **规则真实性**：`gh api repos/deloog/wenshu/branches/main/protection` 逐项核对：8 个必需检查与 CI 矩阵同构、`enforce_admins=true`、禁 force-push/删除；`gh api repos/deloog/wenshu` 复核 private:true。
- **门禁承重**：复核 PR #1 与 run `30005677130` 证据链（故意 `any` → static 失败 → BLOCKED → 405）；可自行构造一个临时失败分支/PR 复验（用完关闭删除，main 零漂移）。
- **管理员绕过留痕**：确认 `enforce_admins=true` 下 admin 令牌无法绕过必需检查；检查仓库审计事件/API 可查性。
- **依赖更新**：dependabot.yml 无豁免、更新 PR 必经 8 作业回归；许可拦截链（licenses:check + supply:check）仍然承重。
- **边界诚实**：未启用强制 PR 评审的取舍已书面化且与 G2-01 治理文件衔接；未公开仓库、未加协作者、无付费额度；main 自 G1 签署以来历史无改写（git log 对账）。

## 3. 结论规则

- 规则与实际不符、必需检查可绕过、force-push/删除可行、依赖更新可不经回归合入、仓库被公开或历史被改写：`FAIL — G2-02 不得完成，功能 PR 不得开始`。
- 无 BLOCKER/MAJOR 且 MINOR 有归属：可给 `CONDITIONAL PASS`；完全满足给 `PASS`。审计者只给结论，由 Codex 完成台账。
