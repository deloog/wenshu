# G2-02 远程分支保护与依赖更新门禁

> 日期：2026-07-23　状态：已实现，待独立审计；G2-02 尚未由实施者自行关闭。
> 前置：G1-01R/11/15/16 已签署；远程 `deloog/wenshu`（PRIVATE，admin 权限经业主授权的 gh 会话）。

## 1. 保护规则（GitHub API 实际生效值，最终配置）

| 项 | 值 | 效果 |
|---|---|---|
| 必需状态检查 | `static` `unit-config` `contracts` `typecheck` `build-test` `build-staging` `build-production` `security`（与 CI 矩阵同构 8 作业） | PR 合并路径上任一失败/缺失即不可合并 |
| `enforce_admins` | `false` | **单人开发书面取舍**：管理员（业主）可直接推送文档/台账类提交；绕过必需检查的合并只允许管理员，且因禁 force-push 而**永久留在 git 历史与 events API 中，不可抹除（留痕机制）** |
| `allow_force_pushes` | `false` | 历史不可改写，绕过痕迹不可消除 |
| `allow_deletions` | `false` | main 不可删除 |
| 强制 PR 评审 | 未启用 | 单人开发：**功能任务必须走 PR**（[DoD](../DEFINITION-OF-DONE.md) 与 PR 模板约束），评审纪律由 G2-01 治理文件承担 |

## 2. 配置过程（如实披露）

初配 `enforce_admins=true` 后实测：必需检查同时阻断一切直接推送（`GH006: 8 of 8 required status checks are expected`），文档/台账直行 main 的工作流无法继续。据此调整为 `false` 并明确留痕替代机制（git 历史不可改写 + events API 可查），本段即调整证据。功能任务的硬性约束不变：无 PR 模板与 DoD 自查不得合入，CI 失败的 PR 对非管理员绝对不可合并。

## 3. 依赖更新门禁

- [.github/dependabot.yml](../.github/dependabot.yml)：npm 周更、最多 3 个并发 PR；更新 PR 自动触发同一 8 作业矩阵回归。
- 许可扩张由 `licenses:check` 与 `supply:check`（147 包基线、GPL/AGPL/未知阻断）在 CI `security` 作业拦截；dependabot 无任何豁免配置。

## 4. 故意失败验证（2026-07-23 实测，初配 enforce_admins=true 下）

- 分支 `g2-02-gate-proof` 故意引入显式 `any` → PR #1 → CI run `30005677130` 失败（`static` 作业）。
- PR `mergeStateStatus: BLOCKED`；API 强制合并返回 **HTTP 405 `Required status check "static" is failing`**——连 admin 令牌亦被拦。
- 证据固定后 PR 已关闭、分支已删除；main 全程零漂移。最终配置下该 405 对非管理员仍然成立；管理员合并失败 PR 属受控绕过（见 §1 留痕机制）。

## 5. 边界

- 未公开仓库、未启用付费额度、未改协作者权限。
- 回滚：`gh api -X DELETE repos/deloog/wenshu/branches/main/protection` + 删除 dependabot.yml。
