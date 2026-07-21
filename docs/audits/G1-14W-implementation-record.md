# G1-14W Windows 11 参考环境实施记录

> 日期：2026-07-21　状态：已实现，待独立审计；本记录不关闭 G1-14W。

## 环境来源与正当性

- 业主批准（[决策 #4](../../决策记录.md) + 补充）：Hyper-V 隔离 VM + 微软官方 90 天评估渠道。
- 镜像：`WinDev2407Eval.HyperV.zip`，经 `aka.ms/windev_VM_hyperv` 跳转 `download.microsoft.com` 官方下载，23,299,441,890 字节（与官方 Content-Length 一致），SHA-256 `B546C32894785DBAAC07543D913BDE9D6598972F76A440D6B5C00B2E73739684`（本机自算留档），解压得 `WinDev2407Eval.vhdx`（44,832,915,456 字节）。ISO/多版本 ISO 官方页面需会话/注册，无法程序化取得，改用同渠道官方预建 VM（决策 #4 补充已记录）。
- VM：`wenshu-ref-win11`，Gen2、vTPM、Secure Boot（MicrosoftWindows 模板）、4 vCPU、动态内存 4–8GB、Default Switch、VHDX 在 D 盘；来宾服务接口已启用。

## 采集方式（诚实披露关键绕行）

- 镜像 `User` 账户密码不可知（官方文档密码对该镜像无效，PowerShell Direct 全部凭证组合被拒；离线只读挂载确认 AutoAdminLogon=User、OOBE 已完成）。
- 因此采用**离线载荷注入**：停机挂载 VHDX，注入 `C:\wenshu-payload\`（Node 24.17.0 便携版、corepack pnpm 11.15.1、pnpm store、从本机仓库清洁克隆于锚定提交 `3c2f287`）与 `C:\Users\User\...\Startup\wenshu-bootstrap.cmd`；首次自动登录即执行引导脚本：冻结安装 → 参数化采集（`--label wenshu-poc-a-win11 --out environment.win11.json`）→ `environment:check` / `supply:check` / `verify` → 结果与日志写入 `C:\wenshu-out` → 自动关机；宿主只读挂载收获。
- 清洁性：克隆源是本机 git 历史（与 `origin/main` 已推送提交一致；锚定提交 `3c2f287` 仅多一条决策记录文档，因当时网络中断未即时推送）；远程克隆需账号凭证，按秘密护栏不在 VM 内处理，故用本地克隆等效替代，已如实说明。
- 第一轮采集真实失败一次：`pnpm env:record -- --label ...` 的字面 `--` 被 pnpm 透传给参数解析器，fail-closed 拒绝（参数校验按设计工作）；改为不带 `--` 后第二轮全绿。文档中的命令已相应修正。

## VM 内实测结果（2026-07-21，日志存 `C:\wenshu-out\log.txt`）

- `node --version` v24.17.0、`pnpm --version` 11.15.1、`pnpm install --frozen-lockfile`（116 包、0 下载外源命中）、`env:record`、`environment:check`（双证据）、`supply:check`（147 包无漂移）、`pnpm verify` 全部 exit 0。
- 证据 `artifacts/reference-machine/environment.win11.json`：Windows 11 Enterprise Evaluation 10.0.22621、x64、i5-9400F 4 vCPU、内存 4,293,750,784 字节（动态）、1024×768、96DPI、100% 缩放、C:\ 133GB、Node/pnpm 与 Win10 基线一致、fixture/font 锚点一致。
- Win10↔Win11 差异已如实记录于 [reference-machine.md §2](../reference-machine.md)。

## 已知限制

- 显示分辨率 1024×768（Hyper-V 控制台默认）；缩放 100%/96DPI 满足 G1-14W 要求。PA-05 打印测量如需 1920×1080，须在 VM 内调整并重新采集。
- Chromium 候选未在 VM 内安装（PA-05 前置时补齐并登记）。
- 镜像为 en-US；评估期 90 天（2026-07-21 起），到期前须重估环境策略。
- VM 内 Startup 引导脚本仍在（每次登录会重跑采集流程）；后续使用 VM 时可保留作重采集入口或手动移除。
- Win10 基线 `environment.json` 全程未被修改（git 可证）。

## 待独立审计

实施者不得自行关闭 G1-14W；审计任务书见 [G1-14W-claude-audit-task.md](G1-14W-claude-audit-task.md)。
