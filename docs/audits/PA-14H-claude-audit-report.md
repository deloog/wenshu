# PA-14H 最薄 ArkWeb 壳 + 布局风险探针 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #25 分支 `pa-14h-arkweb` tip `bd44f01`（实质代码 `bb8e35e` + SBOM 修复 `bd44f01`）；base `origin/main`
> 远程验证：CI **8/8 pass**（SBOM 修复后重跑,security 已转绿）
> 审计方法：**诚实性猎杀(读探针/记录/注册表) + 核心隔离核 + 我在审计中发现并促修 CI SBOM_DRIFT**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS（条件通过）—— PA-14H 通过,可合并 PR #25。** 无 BLOCKER/MAJOR/MINOR。**设备运行诚实后置为 PA-15 人工前置**——这是路线图/ADR-0001 明确允许的 ArkWeb 条件通过,不是失败,不影响桌面主判定。

- **诚实无冒充(本门命门)**:18 项 host 能力**全 `unsupported`(0 支持)**;ArkWeb 真实运行值全标 `not_measured_without_device_or_emulator` 交 PA-15;记录明确"**未以浏览器或构建通过冒充运行通过**"。
- **构建真实**:DevEco/Hvigor 真实构建 HAP(188KB,SHA 记录;承接 G1-12 工具链已证)。
- **窄 host / 平台不泄漏**:host 桥落 v0 契约;核心零 import ArkTS/平台。
- **审计中发现 CI SBOM_DRIFT 并促修**:security 作业曾因新增 arkweb-shell 包未重生成 SBOM 失败;经促修(最小提交 `bd44f01` 仅加一行)后 **CI 8/8 全绿**。

## 2. 诚实性猎杀（命门,设备后置任务的重中之重）

设备运行缺失(本机 BIOS 虚拟化未开、无授权真机/账号,承接 G1-12),诚实处置是本门首要:

- **18 能力全 unsupported、0 支持**:`HostBridge.ets` 按 v0 白名单登记全部 18 项,**全部 `support_status: 'unsupported'`**、无任何 `supported` 值;`verify-probe.mjs` 强制"不得声称支持任一能力"。合理——没跑就不声称支持任何东西。
- **真实运行值全后置、无冒充**:实施记录"运行与差异的诚实处置"——ArkWeb 页数/字体 fallback/嵌入/换行/几何/JS bridge 的真实运行值**均标 `not_measured_without_device_or_emulator`,交 PA-15 人工前置**;明确"**没以浏览器或构建通过冒充运行通过**";`verify-probe` 输出的 runtime 字段即 `not_measured_without_device_or_emulator`——探针只查静态事实(能力名、全 unsupported、HAP 存在、静态探针/fixture 字节),**不产渲染结果、不冒充**。
- **符合 ADR-0001 条件通过口径,不影响桌面主判定**(桌面主判定由 PA-14E Electron 成立)。

**判定**:这正是"设备缺失如实标人工前置=条件通过、伪装才是 FAIL"的模范执行。

## 3. 构建真实、窄 host、核心隔离

- **构建真实**:`build-hap.ps1` 设 DevEco env → `ohpm install` → `hvigorw assembleHap`,产出真实 HAP(188,569 bytes,SHA 记录);`verify-probe` 检 HAP 存在;G1-12 已证该工具链能出 HAP,CI 的 build 作业亦过。
- **窄 host / 不泄漏**:`HostBridge` 落 G1-06 v0 契约、18 能力显式登记(不支持也登记);**核心 TS 包零 import ArkTS/@ohos/平台**——`host-contract` 里的 `"arkts"` 是**拒绝清单**(防混入),非 import;浏览器 fake 不冒充真 ArkWeb。
- **最薄壳**:`HostBridge.ets`(77)+ `Index.ets`(24),无 Web 业务复制;静态资源由 `prepare-static-probe.mjs` 从冻结 `golden-report.md`+ 冻结模板生成。

## 4. 供应链 · 我发现并促修的 CI SBOM_DRIFT

- **发现**:首轮 CI `security` 作业失败 = `SBOM_DRIFT`(committed sbom 与安装依赖树不符)——**非许可/漏洞**(许可扫描 127 依赖全过),而是新增 `apps/arkweb-shell` 包后**未重生成 sbom.json**。我据此扣住签署、定位根因并促修。
- **修复核实**:`bd44f01` 仅 sbom.json **加一行 `"@wenshu/arkweb-shell"`**(对 @types/node 的请求来源),无夹带;`supply:check` 168 包许可 clean、无漂移;**新 CI 8/8 全绿**。`bb8e35e→bd44f01` 差异仅 sbom.json,arkweb 实质代码未变,实质审计原样成立。

## 5. 门禁、冻结

- **门禁**:CI **8/8**(security 修复后转绿);arkweb-shell typecheck/probe 本地过;鸿蒙 SDK/工具链属 G1-12 冻结、许可清。
- **冻结物零漂移**:签署基线、字体、host 契约、7 冻结原件未动;诊断只含数值/哈希/能力,不回显正文。

## 6. 结论与交接

**PA-14H 独立审计 PASS（条件通过）。** 合并由业主/Codex 执行。

- **交 PA-15 人工前置**:ArkWeb 真实运行值(页数/字体/换行/几何/JS bridge)`not_measured_without_device_or_emulator`——须在有模拟器(BIOS 虚拟化开启)/真机时补测;PA-15 汇总时连同 **PA-13 分页 not_met** 一并裁定(通过/降级)。
- 未关闭且不阻断:PA-A7、PA-J1/K1/L1~L4/M1/M3~M5/N1/N2(PA-12 人工清单)。
- **PA-14U(0 号用户实测)** 可开工;PA-13/14E/14H/14U 全数汇入 **PA-15**(PoC-A 闸门报告与通过/降级决定)。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
