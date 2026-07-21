# G1-14W Windows 11 参考环境独立审计报告

> 日期：2026-07-21　审计基线：`60dc31d`（feat: add G1-14W windows 11 machine evidence），推送 HEAD `07c5f5c`
> 任务书：[G1-14W-claude-audit-task.md](G1-14W-claude-audit-task.md)　受审基线：[reference-machine.md §2](../reference-machine.md)、[实施记录](G1-14W-implementation-record.md)
>
> 本报告由未参与实施的独立只读审计角色出具。**关键结论不采信证据 JSON、差异表或 VM 内自述**——我以管理员权限**离线只读挂载 VHDX**，从注册表 hive、VM 内采集产物与注入克隆的 git 提交独立取证。

## 1. 边界与方法

- **写入边界**：本轮只新增本文件一处。未修改代码、测试、证据 JSON、文档、lockfile、路线图、决策记录或 VM 配置。
- **VM 处置**：`wenshu-ref-win11` 全程保持 **Off**（未启动）；对 VHDX `D:\VMs\wenshu-ref-win11\WinDev2407Eval.vhdx` 仅做 **`Mount-VHD -ReadOnly` 离线只读挂载**并在读毕 `Dismount-VHD`；`reg load`/`reg unload` 临时 hive 已卸载；未在 VM 内安装软件或改动系统状态。完成时 VHDX 未挂载、无残留 hive。
- **独立路径**：VHDX 注册表 `Microsoft\Windows NT\CurrentVersion`（不经采集器）、VM 内 `C:\wenshu-out` 产物、注入克隆 `.git/HEAD`、`Get-VM`/`Get-VMHardDiskDrive`；宿主 `Get-FileHash`、`git` 交叉核验。
- **工具链**：宿主命令在冻结 D 盘 Node `24.17.0` + pnpm `11.15.1` 下执行。

## 2. 结论摘要

**结论：`CONDITIONAL PASS`**

未发现 BLOCKER 或 MAJOR。任务书 §6 的否决线——镜像非官方、证据与 VM 内独立事实不符、`os.release` 非 Win11 build ≥ 22000、采集器硬编码或不真读系统、隐私字段混入、Win10 基线被篡改、差异记录冒充——**逐条经独立取证均不成立**。**Win11 证据经离线 VHDX 取证确认为真实采集，非本机伪造。**

| 级别 | 编号 | 摘要 |
|---|---|---|
| MINOR | `W14W-01` | VM 内 `log.txt` 转录只覆盖 版本/冻结安装/环境采集/环境包测试；`supply:check` 与完整 `pnpm verify` 的全绿仅由 `results.txt` 退出码台账记录，未进转录。实施记录"VM 内 pnpm verify 全部 exit 0"的日志佐证不完整（实质结论由宿主 + 远程 CI 独立成立，故非阻断） |
| NOTE | `W14W-N1` | 23GB 官方 zip 已在解压后清除，其 SHA-256（`B546C328…39684`）不可再独立复算；镜像正当性改由 VHDX 内 `BuildLabEx 22621.1…ni_release` 官方构建串独立佐证 |
| NOTE | `W14W-N2` | VM 内注入的 `Startup\wenshu-bootstrap.cmd` 与 `C:\wenshu-payload` 仍在，每次登录会重跑采集（可能覆盖 `C:\wenshu-out`）；实施记录已披露，建议 G1-14W 关闭后移除或明确登记为重采集入口 |
| NOTE | `W14W-N3` | 90 天评估期（2026-07-21 起）、1024×768（非 PA-05 目标分辨率）、Chromium 未安装——均已在 §2 文档如实登记；G1-14W 只登记机器身份，PA-05 尚有前置 |

## 3. 环境正当性与镜像身份（任务书 §2）

- **VM 独立核验**（`Get-VM`）：`wenshu-ref-win11` 存在，`State=Off`、`Generation=2`、`ProcessorCount=4`、`MemoryStartup=4294967296`（4 GiB）；磁盘 `D:\VMs\wenshu-ref-win11\WinDev2407Eval.vhdx`。与证据 `cpu.logical_cores=4`、`memory≈4GB`、决策 #4（Gen2 + vTPM + Secure Boot + 4 vCPU + 动态内存）一致。
- **镜像身份**：官方 zip 已清除（`W14W-N1`），无法再复算其 SHA-256。改由**离线注册表**独立佐证镜像即微软官方 WinDev 评估版：`BuildLabEx = 22621.1.amd64fre.ni_release.220506-1250`——`ni_release`（Nickel = Win11 22H2）、构建 22621、`EnterpriseEval` 版本，正是 `WinDev2407Eval.HyperV` 镜像的构建串。主系统未被改动（仅启用 Hyper-V 这一已批准动作），VHDX 在 D 盘。

## 4. Win11 证据真实性（核心，对应 W-N3 —— 离线 VHDX 独立取证）

### 4.1 `os.release` 独立确认为 Windows 11 build ≥ 22000
离线只读挂载 VHDX，`reg load` 其 `SOFTWARE` hive，读 `Microsoft\Windows NT\CurrentVersion`（**完全不经采集器**）：

| 注册表键 | 值 |
|---|---|
| `CurrentBuildNumber` | **22621** |
| `DisplayVersion` | 22H2 |
| `BuildLabEx` | 22621.1.amd64fre.**ni_release**.220506-1250 |
| `EditionID` | EnterpriseEval |
| `ProductName` | Windows 10 Enterprise Evaluation |

**`CurrentBuildNumber = 22621 ≥ 22000` → 确为 Windows 11 22H2**，与证据 `os.release = "10.0.22621"` 精确一致。（`ProductName` 仍显示 "Windows 10" 是 Windows 11 的**已知注册表遗留**——微软未更新该串；权威信号是 build ≥ 22000 与 `ni_release`；Node `os.version()` 依 build 号正确输出 `"Windows 11 Enterprise Evaluation"`，与证据一致。）

### 4.2 证据非本机伪造（反伪造核心）
- **VM 内采集产物 == 已提交证据（字节级）**：VHDX 内 `C:\wenshu-out\environment.win11.json` 的 SHA-256 = `E5356D7F…AA2D8`，与仓库 `artifacts/reference-machine/environment.win11.json` **逐字节相同**。→ 已提交证据来自 VM 采集器输出，非在宿主手工编辑。
- **采集器 = 已审计代码**：VM 内注入克隆 `F:\wenshu-payload\wenshu\.git/HEAD` → 提交 `3c2f287e29f8…`，与 `anchor.txt` 一致；`3c2f287` 是推送 HEAD `07c5f5c` 的**祖先**，且其 `collect.ts`/`evidence.ts`/`record-args.ts`/`check.ts`/`record-environment.ts` 与当前审计版 **diff 全为 0**（byte-identical）。→ 证据由已审计、无硬编码的采集器产出。
- **采集确在 Win11 22621 上发生**：VM 内 `log.txt` 转录头 `Machine: WINDEV2407EVAL (Microsoft Windows NT 10.0.22621.0)`、`PSVersion 5.1.22621`；采集行 `Environment evidence recorded: wenshu-poc-a-win11 -> environment.win11.json (win32 10.0.22621, 4 cores, 100% scale)`；集成测试 `real collection on the Windows reference machine matches the contract` 通过、`collected 10.0.22621 / 4 cores / 100% scale`。
- **真读系统、无硬编码**：证据各字段与我独立观测的 VM 事实（`Get-VM` 4 vCPU/4 GiB、注册表 build 22621）吻合；采集器源码（已审计 `3c2f287`）实测量均来自 `os` 模块/CIM 探针，无写死机器值（G1-14 §3.2 已确立，本轮 diff 0 未回归）。冻结安装 `Already up to date / Done in 834ms`、"0 下载外源" 表明 VM 内离线、未取外源。

### 4.3 零隐私
证据只含契约 11 个顶层键（`cpu,disk,display,evidence_id,frozen_inputs,machine_label,memory,os,recorded_at,runtime,schema_version`），无多余键。精确扫描 `WINDEV2407EVAL`、`WINDEV`、`"User"`、`DESKTOP-` **命中均为 0**；无 MAC/序列号/IP/绝对用户路径。（集成测试的 hostname/username 零泄漏断言承重性已在 G1-14 §3.5 确立，采集器未改。）

### 4.4 Win10 基线未被篡改
`git diff 737ef71..07c5f5c -- environment.json` **为 0 行**；win11 证据仅在 `60dc31d` **新增一次**（无历史改写）。两份证据 `frozen_inputs` 锚点相同且与源码常量、独立重算的 manifest 哈希一致（fixture `97e05a1c…`、font `2952b96f…`）。

## 5. 采集路径诚实性（任务书 §4 —— 离线载荷注入）

- **注入式采集经离线取证核实**：载荷 = 本机仓库在 `3c2f287` 的清洁克隆（HEAD 独立确认）+ 锁定版 Node/pnpm/store；bootstrap 经 Startup 自动登录执行，只写 `C:\wenshu-out` 与证据。
- **"本地克隆 ≈ 远程清洁克隆"成立**：`3c2f287` 现为推送 `origin/main`（`07c5f5c`）的祖先，其采集器代码与审计版逐字节相同；克隆当时仅比 origin 多一条决策记录文档（网络中断未即时推送），现已推送。凭证不在 VM 内处理（秘密护栏）符合边界。理由**成立**。
- **首轮 `--` 透传失败已如实披露**：`pnpm env:record -- --label …` 的字面 `--` 被参数解析器 fail-closed 拒绝（参数校验按设计工作），改正后复跑通过；文档命令已更正。诚实。
- **日志覆盖不完整（`W14W-01`）**：`log.txt`（1744 B 转录）覆盖 版本/冻结安装/`env:record`/环境包 check（契约 6 + 集成 2），**未转录** `supply:check`（147 包）与完整 `pnpm verify`；这两步全绿仅见于 `results.txt` 退出码台账（`supply-check=0`、`verify=0`）。台账完整且未隐藏，但转录不覆盖全链——实质"repo 通过 verify/supply"由**宿主 185/185 + 远程 CI 8/8**（run `29802405342`，ubuntu security 作业 `Supply chain check passed: 147 packages … no drift`，本轮 G1-15 复审已独立确证）独立成立，故非阻断。见 §7。

## 6. 差异记录与限制诚实性（任务书 §5）

`reference-machine.md §2` 差异表逐项与证据、我的独立观测一致，**无冒充**：

| 维度 | 文档 | 独立核验 |
|---|---|---|
| OS | Win11 Enterprise Eval 10.0.22621（22H2） | 注册表 build 22621 ✔ |
| CPU | 同物理 CPU，4 vCPU | `Get-VM` ProcessorCount=4 ✔ |
| 内存 | 4GB（动态 4–8GB） | MemoryStartup=4 GiB ✔ |
| 显示 | 1024×768，96DPI，100%；**明示** PA-05 前如需 1920×1080 须调整重采 | 证据 1024×768/96/100 ✔；**未冒充** 1920×1080 |
| 磁盘 | C:\ 133GB | 证据 C:\ 133661978624 ✔ |
| 运行时/锚点 | 与 Win10 完全一致 | ✔ |

文档**未暗示**分辨率满足 PA-05 或 Chromium 已就绪——明确写"Chromium 候选尚未在 VM 内安装（属 PA-05 前置）"、"en-US 镜像"、"90 天评估期"。诚实。

## 7. 门禁与回归（宿主）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `pnpm environment:check` | 0 | `2 evidence file(s) (wenshu-dev-primary, wenshu-poc-a-win11) match frozen anchors`；集成测试"每份证据都被校验，非只查第一份"通过 |
| `pnpm verify` | 0 | 聚合 **185/185** |
| 远程矩阵（前序确证） | — | run `29802405342` ubuntu 8/8，含 `supply:check 147 packages no drift` |

零漂移：G1-14 采集器/契约（`collect.ts`/`evidence.ts`）、冻结 fixture/字体、Schema、生成物、workflow 在本范围未改；`.gitignore` 放行段（`environment*.json`）已在 793b423 复核通过，本轮未变。

## 8. 发现

### MINOR
#### `W14W-01`　VM 内 `log.txt` 未转录 supply/verify 全链
**证据**：VHDX 内 `C:\wenshu-out\log.txt` 转录止于环境包集成测试；`supply:check`/`pnpm verify` 的全绿只见于 `results.txt`（`supply-check=0`/`verify=0` 退出码）。实施记录"VM 内 pnpm verify 全部 exit 0…日志存 log.txt"的转录佐证不完整。
**影响**：非伪造（证据文件已独立证真）、非阻断（verify/supply 通过由宿主 185/185 + 远程 CI 8/8 独立成立）；但"VM 内 verify 全绿"的**可转录佐证**弱于其表述。
**建议**：Win11 重采时用 `Start-Transcript` 包裹**全链**，或将文档措辞收敛为"log.txt 覆盖环境采集、results.txt 为全链退出码台账"。
**归属/最迟关闭点**：Codex；G1-14W 台账更新或最迟 PA-05 前重采时。

### NOTE
- **`W14W-N1`**：官方 zip 已清除，其 SHA-256 不可再复算；镜像正当性由 VHDX `BuildLabEx …ni_release` 官方构建串佐证（充分但非 zip 原校验）。若日后需再证，可从官方渠道重下并复算。
- **`W14W-N2`**：VM 内 `Startup\wenshu-bootstrap.cmd` + `C:\wenshu-payload` 仍在，登录即重跑采集、可能覆盖 `C:\wenshu-out`；建议关闭 G1-14W 后移除或登记为受控重采集入口。
- **`W14W-N3`**：90 天评估期、1024×768（非 PA-05 目标）、Chromium 未装——均已文档化；G1-14W 只登记机器身份，PA-05 尚有前置。

## 9. 未执行项与限制
- **未在 VM 内以交互登录重跑采集器**：镜像 `User` 凭证不可知（PowerShell Direct 全凭证被拒，与实施方所述一致），无法交互登录运行临时 label/out 采集。改以**离线 VHDX 取证**等效替代且更强：VM 内采集产物字节等同已提交证据 + 采集器为已审计代码 + 机器确为 build 22621，三者联立证明"采集器真读了该 Win11 系统"。此路径差异如实登记。
- **未复算官方 zip SHA-256**（zip 已清除，`W14W-N1`）；未启动 VM（保持 Off，仅离线只读挂载）。
- 未 push、未触发 Actions；本报告只签署事实，不改路线图、不自行关闭 G1-14W。

## 10. 最终结论

**`CONDITIONAL PASS`**

任务书 §6 否决线逐条不成立：

1. **镜像官方**：VHDX `ni_release` 22621 官方构建串佐证微软 WinDev 评估版（zip 已清除故改此路径，`W14W-N1`）。
2. **证据与 VM 独立事实相符**：离线注册表 build 22621、`Get-VM` 4 vCPU/4 GiB，与证据逐项吻合。
3. **`os.release` = Win11 build 22621 ≥ 22000**：注册表独立确认。
4. **采集器真读系统、无硬编码**：VM 内采集产物字节等同已提交证据、采集器 = 已审计 `3c2f287`（diff 0）、证据匹配 VM 事实。
5. **零隐私**：无 host/user/MAC/序列号，仅契约键。
6. **Win10 基线未篡改**：`environment.json` diff 0，win11 证据仅新增一次。
7. **差异记录诚实**：未冒充 1920×1080 或 Chromium 就绪，限制均书面化。

一项 MINOR（`W14W-01`，VM 日志覆盖不全，非阻断、有归属与关闭点）与三条 NOTE 一并登记。宿主 `verify` 185/185、双证据校验通过、远程 CI 8/8。

从独立审计立场，**G1-14W 的 Win11 参考环境身份已真实登记、经离线取证独立证真，无 BLOCKER/MAJOR**。放行附带 `W14W-01` 整改与 `W14W-N1～N3` 跟进；G1-14W 关闭后，**G1-16（G1 签署）前置即齐**——G1-16 仍须按其自身任务书（私有远程干净克隆一键 install/verify + 签署）执行。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具，只签署事实、不提供也不应用补丁；不修改路线图、不自行标记 G1-14W 完成或启动 G1-16。VM 全程 Off，仅离线只读取证，读毕已卸载。
