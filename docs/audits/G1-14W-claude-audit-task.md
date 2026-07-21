# G1-14W Windows 11 参考环境独立审计任务书（交给 Claude）

> 日期：2026-07-21　实施基线：G1-14W 实施提交（见 git log 中 `feat: add G1-14W windows 11 machine evidence`）　报告目标：`docs/audits/G1-14W-claude-audit-report.md`

## 1. 角色与写入边界

你是独立只读审计者。不要采信实施记录、reference-machine.md 差异表、证据 JSON 或 VM 内 verify 全绿自述；从微软官方渠道、VHDX 字节与 VM 内独立路径取证。

- 只允许新增或修改审计报告 `docs/audits/G1-14W-claude-audit-report.md`。
- 不得修改代码、测试、证据 JSON、文档、lockfile、路线图、决策记录或 VM 配置；可启动/停止 `wenshu-ref-win11` VM 并在其内执行只读核查，但不得在其中安装软件或改动已注入载荷以外的系统状态。
- 仓库外探针只写 `D:\tmp\g114w*`，结束后删除；不得 push、创建 PR 或触发 Actions。
- 完成时工作树除实施方既有改动外，只能多出审计报告一处审计者修改。

## 2. 环境正当性与镜像身份

- 独立核验镜像来源：`WinDev2407Eval.HyperV.zip` 来自 `download.microsoft.com`（经 `aka.ms/windev_VM_hyperv`），23,299,441,890 字节；重算 SHA-256 与实施记录 `B546C328…39684` 一致；确认属微软官方 90 天评估渠道（决策 #4 及其补充背书）。
- 确认 VM 为隔离 Hyper-V 实例（Gen2、vTPM、Secure Boot），磁盘在 D 盘，主系统未被改动（除启用 Hyper-V 这一已批准动作）。

## 3. Win11 证据真实性（核心，对应 W-N3）

- 启动 VM，用独立于采集器的路径（CIM `Win32_OperatingSystem/Processor/ComputerSystem/VideoController/LogicalDisk`、注册表 `AppliedDPI`）逐项对账 `environment.win11.json`：**`os.release` 必须为 Windows 11 build ≥ 22000（实际 10.0.22621）**、version 含 Windows 11、x64、CPU/内存/显示 96DPI/100%、磁盘、Node v24.17.0/pnpm 11.15.1。
- 在 VM 内仓库外重跑采集器（临时 label/out），输出与已提交证据除 `recorded_at`/磁盘可用量外一致，证明真读系统、无硬编码。
- 零隐私：证据不含主机名（WINDEV2407EVAL）、用户名（User）、MAC/序列号/IP；集成测试断言仍承重。
- Win10 基线未被篡改：`environment.json` 与 G1-14 审计版字节一致（git 证实只新增 `environment.win11.json`）；冻结 fixture/font 锚点两份证据一致。

## 4. 采集路径诚实性（重点审查离线载荷注入）

- 审查实施记录披露的注入式采集：载荷来自本机已审计提交 `3c2f287` 的清洁克隆、Node/pnpm 与工具链锁定版本一致；bootstrap 只读系统状态、仅写 `C:\wenshu-out` 与证据文件。
- 判断"本地克隆等效远程清洁克隆"的理由是否成立（提交已与 origin/main 一致、秘密护栏不在 VM 内处理凭证）；如不成立，指出并给出合规替代。
- VM 内 `verify` 全绿日志（`C:\wenshu-out\log.txt`）是否真实覆盖 install/environment/supply/verify 全链，无选择性截取。
- 宿主侧 `pnpm environment:check` 现校验两份证据（输出 2 evidence files），`pnpm verify` 全绿。

## 5. 差异记录与限制诚实性

- reference-machine.md §2 差异表逐项属实（OS build、vCPU、动态内存、1024×768 vs 1920×1080、C:\ vs D:\、运行时一致）；不得暗示分辨率已满足 PA-05 预期或 Chromium 已登记。
- 90 天评估期、en-US 镜像、Startup 引导残留等限制均已书面化。

## 6. 结论规则

报告列出执行命令、独立系统证据、反例、未执行项、工作树边界及 BLOCKER/MAJOR/MINOR/NOTE：

- 镜像非官方渠道、证据与 VM 内独立事实不符、`os.release` 非 Windows 11 build ≥ 22000、采集器在该环境硬编码或不真读系统、隐私字段混入、Win10 基线被篡改、差异记录冒充（如假称 1920×1080 或 Chromium 已就绪）：`FAIL — G1-14W 不得完成，G1-16 不得签署`。
- 无 BLOCKER/MAJOR，且 MINOR 均有明确归属和最迟关闭点：可给 `CONDITIONAL PASS`。
- 完全满足且无未关闭发现可给 `PASS`。审计者只给结论，不修改路线图或自行关闭任务；由 Codex 根据报告整改或完成台账。
