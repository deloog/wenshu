# G2-02 远程分支保护与依赖更新门禁实施记录

> 日期：2026-07-23　状态：已实现，待独立审计；本记录不关闭 G2-02。

## 实施范围

- GitHub API 配置 main 保护：8 个必需检查（与 CI 矩阵同构）、禁 force-push、禁删除；未启用强制 PR 评审。初配 `enforce_admins=true` 实测阻断一切直接推送（含文档台账），遂调整为 `false`：管理员绕过仅允许且永久留痕于不可改写的 git 历史/events API，非管理员合并失败 PR 仍绝对不可；功能任务走 PR 由 G2-01 治理文件约束。调整过程已如实写入 [branch-protection.md](../branch-protection.md) §2。
- `.github/dependabot.yml`：npm 周更 PR，自动触发完整 CI 回归；许可扩张由既有 `licenses:check`/`supply:check` 拦截。
- 故意失败验证：PR #1（显式 `any`）→ CI `static` 失败 → `mergeStateStatus: BLOCKED` → API 强制合并 HTTP 405（admin 亦被拦）→ 关闭 PR、删除分支。详见 [branch-protection.md](../branch-protection.md)。
- 设置与依赖清单已写入 [branch-protection.md](../branch-protection.md) 作为记录；审计者可经 `gh api` 只读复核实际生效值。

## 边界与回滚

- 未公开仓库、未启用付费额度、未改协作者；不使用截图/自述代替 API 证据。
- 回滚：`gh api -X DELETE repos/deloog/wenshu/branches/main/protection` + 删除 dependabot.yml。

## 待独立审计

实施者不得自行关闭 G2-02；审计任务书见 [G2-02-claude-audit-task.md](G2-02-claude-audit-task.md)。
