# G2-02 远程分支保护与依赖更新门禁

> 日期：2026-07-23　状态：已实现，待独立审计；G2-02 尚未由实施者自行关闭。
> 前置：G1-01R/11/15/16 已签署；远程 `deloog/wenshu`（PRIVATE，admin 权限经业主授权的 gh 会话）。

## 1. 保护规则（GitHub API 实际生效值）

| 项 | 值 | 效果 |
|---|---|---|
| 必需状态检查 | `static` `unit-config` `contracts` `typecheck` `build-test` `build-staging` `build-production` `security`（与 CI 矩阵同构 8 作业） | 任一失败/缺失即不可合并 |
| `enforce_admins` | `true` | 管理员同样受约束，绕过即留痕（审计日志/API 可查） |
| `allow_force_pushes` | `false` | 历史不可改写 |
| `allow_deletions` | `false` | main 不可删除 |
| 强制 PR 评审 | 未启用 | 单人开发：文档/台账直行 main 保留；**功能任务必须走 PR**（[DoD](../DEFINITION-OF-DONE.md) 与 PR 模板约束），评审纪律由 G2-01 治理文件承担 |

## 2. 依赖更新门禁

- [.github/dependabot.yml](../.github/dependabot.yml)：npm 周更、最多 3 个并发 PR；更新 PR 自动触发同一 8 作业矩阵回归，必需检查不过即不可合并。
- 许可扩张由 `licenses:check` 与 `supply:check`（147 包基线、GPL/AGPL/未知阻断）在 CI `security` 作业拦截；dependabot 无任何豁免配置。

## 3. 故意失败验证（2026-07-23 实测）

- 分支 `g2-02-gate-proof` 故意引入显式 `any` → PR #1 → CI run `30005677130` 失败（`static` 作业）。
- PR `mergeStateStatus: BLOCKED`；API 强制合并返回 **HTTP 405 `Required status check "static" is failing`**——admin 令牌亦被拦（`enforce_admins` 承重）。
- 证据固定后 PR 已关闭、分支已删除；main 全程零漂移。

## 4. 边界

- 未公开仓库、未启用付费额度、未改协作者权限；未启用强制 PR 评审是有记录的单人开发取舍（见 §1 末行）。
- 回滚：删除保护规则与 dependabot.yml 即可（GitHub API 可逆）。
