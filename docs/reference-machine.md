# G1-14 参考机器、性能采样与资源预算说明

> 日期：2026-07-21　状态：已实现，待独立审计；G1-14 尚未由实施者自行关闭。
> 来源：原子路线图 G1-14（R-PERF）；预算数字继承 G0 已批准的 [性能预算](performance-budgets.md)，本文不新增、不修改任何阈值。

## 1. 参考机器与环境清单

参考机器身份由 `artifacts/reference-machine/environment.json` 承载，机器证据契约版本 `0.1.0`，由 `tools/environment`（`@wenshu/environment`）自动采集并校验。当前登记的机器为开发基线机 `wenshu-dev-primary`：

| 维度 | 当前值 | 采集方式 |
|---|---|---|
| OS | Windows 10 Pro（10.0.19045），x64 | `os.platform/release/version/arch` |
| CPU | Intel Core i5-9400F @ 2.90GHz，6 逻辑核 | `os.cpus()` |
| 内存 | 17,119,330,304 字节（≈16GB） | `os.totalmem()` |
| 显示 | 1920×1080，100% 缩放，96 DPI | 注册表 `HKCU\Control Panel\Desktop\WindowMetrics\AppliedDPI`，回退 CIM `Win32_DesktopMonitor.PixelsPerXLogicalInch`；分辨率取 CIM `Win32_VideoController` |
| 磁盘 | `D:\`，总 997,047,988,224 字节 | `fs.statfsSync`（仓库所在卷） |
| 运行时 | Node v24.17.0、pnpm 11.15.1 | `process.version` 与根 `packageManager` 锁 |
| 冻结输入 | fixture manifest 与 font manifest 的 SHA-256 锚点 | 直接引用 `@wenshu/fixtures` / `@wenshu/fonts` 的承重锚点常量 |

证据字段是封闭契约：`dpi` 与 `scale_percent` 必须满足 `round(dpi/96×100) = scale_percent`，`free_bytes ≤ total_bytes`，多余键、错误版本、非法锚点一律 fail-closed。

**隐私边界**：证据不记录主机名、用户名、MAC、序列号、IP 或任何绝对用户路径；集成测试断言序列化结果不含 `os.hostname()` 与 `os.userInfo().username`。

**采集边界**：真实采集仅支持 Windows 参考机器；其他平台调用采集器以 `ENV_PLATFORM_UNSUPPORTED` fail-closed（CI 上由契约测试与已提交证据的静态校验覆盖）。显示缩放探针只读注册表/CIM，不修改系统状态。

命令：

- `pnpm env:record`：在 Windows 参考机器上重新采集并写入 `artifacts/reference-machine/environment.json`。
- `pnpm environment:check`：校验已提交证据符合契约且冻结输入锚点与当前 fixture/字体锚点一致；已接入 `pnpm verify` 与 CI `contracts` 作业。

## 2. 双环境设计与 G1-14W 差异记录

本机是 Windows 10 开发基线机（`wenshu-dev-primary`），**不是** PoC-A 预注册的 Windows 11 64 位参考环境。PA-05/PA-13 的正式 PDF 导出与性能测量必须在 G1-14W 落实的 Windows 11 环境执行。

证据目录支持多份机器证据（`environment*.json`，每份独立 `machine_label` 且互不相同；`environment:check` 逐份校验契约与冻结锚点，不默认只查第一份）：

| 文件 | 机器标签 | 环境 | 状态 |
|---|---|---|---|
| `environment.json` | `wenshu-dev-primary` | Windows 10 Pro 19045 开发基线机 | ✅ 已登记（G1-14） |
| `environment.win11.json` | `wenshu-poc-a-win11` | Windows 11 64 位参考环境（决策 #4，Hyper-V 隔离 VM） | ⏳ 待采集（G1-14W） |

Win11 采集命令（在 Win11 参考环境内、清洁克隆后执行）：`pnpm env:record -- --label wenshu-poc-a-win11 --out environment.win11.json`。**在 Win10 上不得使用该参数组合**——那会伪造 Win11 证据。

**Win10 ↔ Win11 差异记录**：待 `environment.win11.json` 采集后在此逐项填写（OS build、DPI/分辨率、CPU/内存、Chromium 候选版本、与 Win10 基线的实测差异）。当前状态：未采集，不代表 Windows 11 环境已就绪。

## 3. 性能采样协议

PA-13/A-14 的性能测量统一遵守本协议；协议只规定方法，不宣布任何阈值已通过。

1. **环境登记**：每个采样批次开始前运行 `pnpm env:record`，把当批原始数据与对应机器证据放在同一批次目录，批次目录约定为 `artifacts/perf/<date>-<task-id>/`。
2. **机器状态**：接通电源、关闭无关重负载应用、保持登记的显示缩放与分辨率不变；批次内不得切换机器、显示器或缩放。
3. **预热与重复**：正式计时前预热 1 次且不计入数据；每个指标在同一环境重复 **10 次**（与 G0 稳定性预算一致），保留全部原始值，不得只存汇总。
4. **统计口径**：判定使用中位数与 p95；单次离群不直接判失败。
5. **噪声处理**：噪声不可控时增加重复次数或排查干扰源，**不得修改阈值**；原始数据与机器证据必须足以重建结论。
6. **回归判定**：关键指标相对已批准基线退化超过 20% 即阻断，除非有记录的质量收益与批准（继承 G0 回归规则）。

## 4. 资源预算说明

G0 预算表（启动 ≤2s、打开项目 ≤3s、键入 p95 ≤100ms、局部重排 ≤1s、30 页重分页 ≤8s、30 页导出 ≤30s、页面检查 ≤5s、崩溃恢复 ≤10s、峰值内存软目标 ≤1GB）与稳定性预算（10 次重复一致、2 秒反馈、取消后 2 秒内停止主要消耗）**全部维持 G0 原文，当前均未实测**。

- G1-14 只建立参考机器身份与采样方法；任何"阈值已通过"的声明必须等到 PA-13/A-14 在 G1-14W 环境按 §3 协议实测之后。
- 输入护栏的具体上限（单附件、图片数量/尺寸、表格行列、解压总量）仍按 G0 约定，待 G1 后续 fixture 实测后锁定。
- 性能优化不得降低 PDF 正确性、数据安全、可访问性或测试真实性。

## 5. 验证与回滚

- 验证：`pnpm environment:check`（契约 + 锚点 + 已提交证据静态校验）、`pnpm --filter @wenshu/environment test`（契约反例与真实采集集成测试）、`pnpm verify` 全链路。
- 回滚：删除 `tools/environment`、`artifacts/reference-machine`、本文及根命令/verify/CI 接线即可，不影响其他任务产物。
