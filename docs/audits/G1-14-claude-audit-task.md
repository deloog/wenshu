# G1-14 参考机器、性能采样与资源预算说明独立审计任务书（交给 Claude）

> 日期：2026-07-21　实施基线：G1-14 实施提交（见 git log 中 `feat: record G1-14 reference machine baseline`）　报告目标：`docs/audits/G1-14-claude-audit-report.md`

## 1. 角色与写入边界

你是独立只读审计者。不要采信实施记录、`reference-machine.md`、已提交证据 JSON、锚点常量或测试全绿自述；从操作系统与仓库原始字节独立取证。

- 只允许新增或修改审计报告 `docs/audits/G1-14-claude-audit-report.md`。
- 不得修改代码、测试、证据 JSON、文档、lockfile、路线图、配置、Schema、生成物或 `.gitignore`。
- 仓库外探针只写 `D:\tmp\g114*`，结束后删除；不得安装软件、修改注册表/系统设置、push、创建 PR 或触发 Actions。
- 完成时工作树除实施方既有改动外，只能多出审计报告一处审计者修改。

## 2. 机器证据真实性（核心）

独立获取本机事实并与 `artifacts/reference-machine/environment.json` 逐项对账，不以项目文档或采集器输出为来源：

- 用独立路径（如 `winver`/CIM `Win32_OperatingSystem`、`Win32_Processor`、`Win32_ComputerSystem`、`Win32_VideoController`、注册表 `AppliedDPI`、`Get-PSDrive`/WMI 卷信息）重取 OS 版本、CPU 型号/核数、内存总量、主显示器分辨率/缩放/DPI、D 盘容量；至少用一种不同于项目采集器的工具复算。
- 在仓库外临时副本重跑采集器，确认输出与已提交证据除 `recorded_at` 与磁盘可用量外一致；判断采集器是否真的读系统——**检查源码中不存在硬编码的机器值**（如写死的 96 DPI、CPU 型号、内存数），硬编码即 BLOCKER。
- 核对 Node/pnpm 版本与 `toolchain.versions.json`、根 `engines`/`packageManager` 一致；两个冻结输入锚点与 `@wenshu/fixtures`、`@wenshu/fonts` 源码承重常量逐字符一致，且与 fixtures/fonts 工具各自重算的 manifest 哈希一致。
- 确认证据不含主机名、用户名、MAC、序列号、IP 或绝对用户路径；集成测试的零泄漏断言是否真实承重（删掉断言检查项测试是否变绿）。

## 3. 采集边界与 fail-closed

- 显示探针只读注册表/CIM：审查脚本无写入、无 `-Verb RunAs`、无用户输入插值；`execFile` 参数固定，stderr 不外泄。
- 非 Windows 分支以 `ENV_PLATFORM_UNSUPPORTED` 拒绝：审查分支逻辑；本机无法实测 Linux 路径时如实列为未执行项，不得冒充已验证。
- 探针失败（注册表项缺失、CIM 不可用、超时）统一 `ENV_PROBE_FAILED` 且不含绝对路径/系统错误原文；可用仓库外副本模拟（如临时改名脚本中的注册表路径）验证。
- 采集副作用仅限写 `artifacts/reference-machine/environment.json`；确认没有临时文件残留、没有写注册表或系统目录。

## 4. 契约决定性

对 `parseMachineEvidence` 做变异式审查：

- 删除/弱化每个核心守卫（封闭键、ISO 时间戳、标签模式、平台/架构白名单、`dpi↔scale` 不变量、`free≤total`、挂载点模式、版本/SHA 模式），现有契约测试是否因正确原因变红；被其他分支代打而从未命中的守卫登记覆盖缺口。
- 构造边界输入：多余/缺失键、嵌套对象多键、120dpi 配 100% 缩放、`2^53` 级字节数、`Number` 非安全整数、空字符串模型名、大小写变体标签。
- `check-environment.ts` 的锚点对账是否真实承重：在仓库外副本把证据 JSON 的锚点改一位，check 必须失败；把已提交证据删除，check 必须 fail-closed 而非跳过。

## 5. 采样协议与预算诚实性

- 对照 G0 [performance-budgets.md](../performance-budgets.md) 逐项核对 `reference-machine.md`：预算数字、稳定性规则、20% 回归线必须原样继承，**任何静默改阈值、新增阈值或把 G0 目标写成"已通过"均为 MAJOR 以上**。
- 采样协议（预热 1 次、10 次重复、中位数/p95、原始数据留存、噪声只加重复不改阈值）是否可执行、无自相矛盾；批次目录约定不得与 `.gitignore` 冲突到证据无法留存的自相矛盾程度。
- Win10 本机与 G1-14W Win11 预注册环境的边界是否写清；文档不得暗示 Windows 11 已就绪或 PA-05/13 可在本机正式测量。

## 6. 门禁、依赖与范围诚实性

- 运行 `pnpm environment:check`、`pnpm test:layers`、`pnpm test:contract`、`pnpm test:integration`、`pnpm typecheck`、`pnpm ci:job contracts`、`pnpm ci:verify`、`pnpm verify`，记录文件/测试计数。
- 确认根 `verify` 与 CI `contracts` 作业真实执行 environment 检查；在仓库外副本删除/改名该命令应被测试发现；CI 仍为 8 个原作业，远程 workflow 未变。
- `.gitignore` 变更专项：`artifacts/manual-baseline`、`tmp/`、`test-results/` 仍被忽略；仅 `artifacts/reference-machine/environment.json` 被放行；G1-01 的秘密/产物忽略探针不被削弱。
- 集成测试真实调用系统 API 与文件系统，不 mock 被测对象；契约测试不触碰系统状态。本任务不涉及数据库，不要求也不得虚构真库通过。
- 新包全部 `src/test/scripts` 进入 strict typecheck；零手写 `any`/抑制；文件体量护栏满足；只声明直接使用的依赖；lockfile 仅增加新 workspace importer 而无意外版本漂移。
- 对比实施基线，冻结 PoC-A 原件、字体、Schema/生成物、workflow、其他工具零漂移；确认没有性能实测结果冒充、没有系统设置修改、费用或外部发布。

## 7. 结论规则

报告列出执行命令、独立系统证据、反例、未执行项、工作树边界及 BLOCKER/MAJOR/MINOR/NOTE：

- 机器证据与本机独立事实不符、采集器硬编码机器值、证据可伪造而通过校验、静默改变 G0 预算或冒充阈值已通过、隐私字段混入证据、CI/verify 可保持绿色地漏跑 environment 检查，或 `.gitignore` 变更削弱既有忽略保护：`FAIL — G1-14 不得完成，PA-13/A-14 不得以其为基线`。
- 无 BLOCKER/MAJOR，且 MINOR 均有明确归属和最迟关闭点：可给 `CONDITIONAL PASS`。
- 完全满足且无未关闭发现可给 `PASS`。审计者只给结论，不修改路线图或自行关闭任务；由 Codex 根据报告整改或完成台账。
