# G1-14 参考机器、性能采样与资源预算说明实施记录

> 日期：2026-07-21　状态：已实现，待独立审计；本记录不关闭 G1-14。

## 实施范围

- 新增 `@wenshu/environment`（`tools/environment`）：机器证据契约 `0.1.0`（封闭键、ISO 时间戳、机器标签/平台/架构/版本格式、`round(dpi/96×100)=scale_percent`、`free_bytes≤total_bytes` 等不变量全部 fail-closed）、Windows 真实采集器、证据写入与已提交证据校验脚本；没有新增第三方运行时依赖。
- 真实采集并提交 `artifacts/reference-machine/environment.json`：Windows 10 Pro（10.0.19045）x64、i5-9400F 6 核、17,119,330,304 字节内存、1920×1080、100% 缩放、96 DPI、`D:\` 卷容量/可用、Node v24.17.0、pnpm 11.15.1，以及 fixture/font 两个承重锚点 SHA-256。
- 新增 [参考机器、采样协议与资源预算说明](../reference-machine.md)：环境清单、采样协议（预热 1 次 + 10 次重复、中位数/p95、原始数据留存、噪声只加重复不改阈值）、G0 预算原样引用并明确未实测不宣布通过、与 G1-14W 的 Win10/Win11 边界。
- `pnpm environment:check` 接入根 `verify` 与 CI `contracts` 作业（CI 仍为 8 个原作业）；新增 `pnpm env:record`；`.gitignore` 改为 `artifacts/*` 加精确否定，仅放行 `artifacts/reference-machine/environment.json`，`manual-baseline` 等其他产物仍被忽略。
- 未实现任何性能实测、阈值判定、Windows 11 环境（G1-14W）、渲染或 PDF；这些仍属 G1-14W/PA-13/A-14 及后续任务。

## 采集方式与边界

- OS/CPU/内存/运行时来自 Node `os`/`process`；磁盘来自 `fs.statfsSync`（仓库所在卷）；pnpm 版本来自根 `packageManager` 锁；冻结输入锚点直接引用 `@wenshu/fixtures`、`@wenshu/fonts` 的源码常量。
- 显示缩放探针只读：主用注册表 `HKCU\Control Panel\Desktop\WindowMetrics\AppliedDPI`，回退 CIM `Win32_DesktopMonitor.PixelsPerXLogicalInch`；分辨率取 CIM `Win32_VideoController`；经 `powershell.exe -NoProfile -NonInteractive -Command` 固定脚本执行，无用户输入插值，失败统一 `ENV_PROBE_FAILED` 且不回显 stderr。
- 非 Windows 平台调用采集器以 `ENV_PLATFORM_UNSUPPORTED` fail-closed；CI（ubuntu）由契约测试与已提交证据的静态校验覆盖，不伪造采集通过。
- 证据不记录主机名、用户名、MAC、序列号、IP 或绝对用户路径；采集除写 `artifacts/reference-machine/environment.json` 外不产生副作用。

## 已执行的反例与结果

- 契约反例 5 组全过：错误 schema/ID/多余键/非法时间戳与标签、未知平台/架构、零核/负内存、缺 `v` 前缀的运行时版本、120dpi 却声称 100% 缩放、非法挂载点、free>total、非法/缺失锚点均被 `ENV_EVIDENCE_INVALID` 拒绝。
- 真实采集集成测试：采集结果深等于契约解析结果；锚点等于源码常量；序列化证据不含 `os.hostname()` 与 `os.userInfo().username`。
- 开发中一次真实失败：CI 单测枚举 `contracts` 作业命令标签（`["contracts","fixtures"]`）在新增 `environment` 后按预期变红，更新枚举后复跑通过——证明作业清单测试真实承重。
- 显示探针主路径（`LogPixels`）在本机不存在时按 fail-closed 设计报错，据此改为 `AppliedDPI` 主探针 + CIM 回退；该失败过程留于会话记录。

## 实施者验证

- `pnpm verify` 退出 0：format、lint、quality（99 源文件/277 仓库文件）、test:layers（26 文件）、unit 37/37、config 7/7、contracts 全部、fixtures 4+14、fonts 3+4、environment 5+1、typecheck 13 包、production build 全绿。
- `pnpm env:record` 真实写入证据；`pnpm environment:check` 校验已提交证据与承重锚点一致。
- 零手写 `any`/抑制指令；新包仅声明实际使用的 `@wenshu/fixtures`、`@wenshu/fonts`、`@wenshu/test-support`；lockfile 仅新增本 workspace importer。
- 未执行项：非 Windows 平台的真实采集拒绝路径在本机无法实测（由分支代码与契约保证）；Windows 11 环境未落实，属 G1-14W。

## 待独立审计

实施者不得自行关闭 G1-14；审计任务书见 [G1-14-claude-audit-task.md](G1-14-claude-audit-task.md)。
