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

## G1-03 完成证据

- D 盘 Node：`v24.17.0`；D 盘 Corepack pnpm：`11.15.1`。
- `pnpm install --frozen-lockfile` 在隔离干净副本通过，所有包从 D 盘 store 复用。
- `pnpm typecheck` 通过 TypeScript 6.0.3 strict 配置。
- `pnpm build` 通过 Vite 8.1.5，生成物保持在 ignored `dist/`。
- `pnpm dev` 在 `127.0.0.1:4173` 返回 HTTP 200 和预期占位文本，检查后服务停止且端口释放。
- 首次 `verify` 因命中旧全局 pnpm 10.11.1 按预期失败；建立 D 盘 Corepack shim 后通过。没有降低 engine 或版本约束。

隔离验证副本位于 ignored `tmp/g1-03-clean-20260720-1001`，只作本机证据，不是项目真源。
