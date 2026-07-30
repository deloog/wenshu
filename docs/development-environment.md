# 文枢开发环境基线

> 状态：G1-03 已验证　日期：2026-07-20

## Windows 本机路径

| 用途 | 固定路径 | 说明 |
|---|---|---|
| Node 24.17.0 | `D:\Applications\Node\node-v24.17.0-win-x64` | 官方 ZIP，SHA-256 已登记 |
| Node 安装包 | `D:\Installers\Node\node-v24.17.0-win-x64.zip` | 官方留档，可重验 |
| pnpm shim | `D:\DevTools\pnpm` | Corepack 管理，版本由 `packageManager` 锁定 |
| Corepack 缓存 | `D:\DevCaches\Corepack` | 不使用 C 盘默认缓存 |
| pnpm store | `D:\DevCaches\pnpm-store` | 依赖内容寻址仓库 |

本机原有 C 盘 Node 24.13.0 和全局 pnpm 10.11.1 未被卸载或覆盖。项目会话必须把上述 D 盘路径置于 `PATH` 前部，避免误用旧全局版本；本任务未永久修改用户或系统 `PATH`。

## Windows 会话初始化

```powershell
$env:PATH = 'D:\DevTools\pnpm;D:\Applications\Node\node-v24.17.0-win-x64;' + $env:PATH
$env:COREPACK_HOME = 'D:\DevCaches\Corepack'
$env:PNPM_HOME = 'D:\DevTools\pnpm'
$env:PNPM_STORE_DIR = 'D:\DevCaches\pnpm-store'
```

初始化后只使用根 `package.json` 中的统一命令：

```powershell
pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store
pnpm dev
pnpm typecheck
pnpm build
pnpm verify
```

## Git worktree 的依赖安装

`git worktree` 创建的额外工作树各自持有独立 `node_modules`，不与主工作树共享。每个 worktree 必须在完成上文会话初始化**之后**单独执行 `pnpm install --frozen-lockfile`。

若某个 worktree 的 `node_modules` 是在 C 盘旧 Node（24.13.0）下安装的，此后即使按上文把 D 盘 Node 置于 `PATH` 前部，pnpm 仍会判定安装上下文已变、要求重建该目录；在无 TTY 的非交互会话中会直接中止：

```text
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY
```

正确处置是在交互式会话中按初始化步骤重新安装该 worktree 的依赖。**不得设置 `CI=true` 或 `confirmModulesPurge=false` 绕过**——那会在无人确认的情况下删除目录，并掩盖"安装上下文与锁定运行时不一致"这一真实状态。

在非交互会话中确需只读校验时，可直接调用检查脚本（例如 `node tools/quality/scripts/check-repository.ts`）以绕过 pnpm 的依赖状态检查。**该做法只适用于诊断，不得作为验收证据的取得方式**——验收证据必须经根 `package.json` 的统一命令产生，以保持与 CI 同构。

## G1-03 完成证据

- D 盘 Node：`v24.17.0`；D 盘 Corepack pnpm：`11.15.1`。
- `pnpm install --frozen-lockfile` 在隔离干净副本通过，所有包从 D 盘 store 复用。
- `pnpm typecheck` 通过 TypeScript 6.0.3 strict 配置。
- `pnpm build` 通过 Vite 8.1.5，生成物保持在 ignored `dist/`。
- `pnpm dev` 在 `127.0.0.1:4173` 返回 HTTP 200 和预期占位文本，检查后服务停止且端口释放。
- 首次 `verify` 因命中旧全局 pnpm 10.11.1 按预期失败；建立 D 盘 Corepack shim 后通过。没有降低 engine 或版本约束。

隔离验证副本位于 ignored `tmp/g1-03-clean-20260720-1001`，只作本机证据，不是项目真源。
