# 文枢私有远程仓库基线（G1-01R）

> 状态：已完成　日期：2026-07-20　业主授权：本任务对话中明确同意

## 固定远程

| 项目 | 值 |
|---|---|
| GitHub 仓库 | `deloog/wenshu` |
| URL | `https://github.com/deloog/wenshu` |
| Git remote | `origin` → `https://github.com/deloog/wenshu.git` |
| 可见性 | `PRIVATE` |
| 默认分支 | `main` |
| 本地上游 | `main` → `origin/main` |
| 协作者范围 | 仅业主账号 `deloog`，具 admin/push/pull |

## 机器可读验收

GitHub CLI 使用系统凭据库中的业主会话，不把 token 写入仓库或日志。创建后执行：

```text
gh repo view deloog/wenshu --json nameWithOwner,isPrivate,visibility,url,defaultBranchRef,viewerPermission
=> nameWithOwner=deloog/wenshu, isPrivate=true, visibility=PRIVATE,
   defaultBranchRef=main, viewerPermission=ADMIN

git rev-parse main
git ls-remote origin refs/heads/main
=> 46cfb69c120f25fc0bac8b906ce92f78aca0eb98（首次推送两端一致）

gh api repos/deloog/wenshu/collaborators
=> deloog: admin=true, push=true, pull=true；无其他协作者
```

浏览器会话未登录 GitHub，访问私有页面按预期显示 404，因此没有把该页面当作可见性截图证据，也没有要求业主在自动化会话中输入密码。结构化 GitHub API 结果与 Git 提交哈希作为可重复执行的权威证据。

## 边界

- 未公开仓库、未创建组织、未邀请协作者、未启用付费服务。
- 本任务不设置分支保护或必需检查；这些外部设置归 G2-02，并需届时再次取得管理员授权。
- 删除或转移远程仓库属于新的破坏性外部行为，不在本授权范围内。
