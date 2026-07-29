# PA-14E 安全 Electron 壳复验 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #24 分支 `pa-14e-electron` tip `fca3acd`；base `origin/main`
> 远程验证：CI **8/8 pass**
> 审计方法：**本机独立复现 Electron 复验 + 安全实测(亲跑 security:test) + 排版对账亲验 + 供应链/冻结核**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PA-14E 通过,可合并 PR #24。** 无 BLOCKER/MAJOR/MINOR。两个命门(安全配置、排版对账)我**在本机亲手复现验证**,非仅采信佐证——这一棒无 VM 背书边界。

- **安全配置(命门,我亲跑实测)**:真实 Electron 中 **renderer 触不到 Node**(`requireType/processType=undefined`、只暴露 `invoke/registry` 两键);运行时 webPreferences 全硬化(contextIsolation/sandbox=true、nodeIntegration=false、webSecurity=true、allowRunningInsecureContent=false、webviewTag=false)。
- **排版对账(命门,我亲跑)**:Electron 产物与签署基线一致——**21 页、字体全嵌入、几何 0.01pt 内、P0/P1=0**。
- **窄 host + 不泄漏**:preload 经 contextBridge 只暴露 2 个白名单 channel;registry 18 能力齐(assertValidRegistry 我实跑通过)、仅 print.pdf.export supported;session 经契约校验成功终态。
- **环境诚实**:Electron 43.1.1 内嵌 **Chromium 150**(与签署 Edge 150 同大版本);build 差异如实记录、不外推、不作性能样本;**性能/分页未在本任务宣称**。

## 2. 安全配置猎杀（首要命门,本机独立复现）

我在本机 `pnpm --filter @wenshu/electron-shell security:test` 亲跑,真实 Electron BrowserWindow 产出 renderer 运行时证据:

```
rendererSecurity: exposedKeys=["invoke","registry"]  requireType=undefined  processType=undefined
actualPreferences: contextIsolation=true sandbox=true nodeIntegration=false
                   webSecurity=true allowRunningInsecureContent=false webviewTag=false ...
hostSession: {terminalKind:"success", capability:"print.pdf.export"}
```

- **renderer 实证触达不了 Node**:`require`/`process` 均 undefined、window 仅 `invoke/registry` 两键——不是配置声明,是运行时实测。
- **preload 真窄(读 `preload.cjs`)**:`contextBridge.exposeInMainWorld` 只暴露 `registry()/invoke()`,走 channel 白名单(仅 `wenshu.host.registry`/`invoke`),**不暴露 require/process/原样 ipcRenderer**。
- **webPreferences 全硬化**:三项主硬化 + webSecurity/allowRunningInsecureContent/webviewTag/nodeIntegrationInSubFrames 均安全值。

## 3. 排版对账（命门,本机独立复现）

`verify-output.ts` 对账 Electron 产物 vs 签署基线 `5d7c06bc…0828`。我亲跑复现:

```
pageCount=21  fontsEmbedded=true  geometryTolerancePt=0.01  p0Findings=0  p1Findings=0
```

页数相同、全部字体嵌入、文本运行几何向量(页号/bbox/基线/块序)0.01pt 内一致、validator 零发现——**Electron 复验与 Chromium 签署基线排版一致**。

## 4. 窄 host、环境诚实、正确性不变

- **窄 host / 不泄漏**:registry 声明全部 18 能力(我先前诊断的 instance_id 28→32 位十六进制 + 1→18 能力两 bug **已修**;assertValidRegistry 我实跑通过即证),仅 print.pdf.export `supported`、其余 17 显式 `unsupported`(G1-06"不支持也须显式登记");session 经 `validateHostSession` 校验;平台类型不入核心。
- **环境诚实**:Electron 43.1.1 = Chromium **150**.0.7871.114,与签署 Edge **150** 同大版本(故几何 0.01pt 内一致合理);实施记录如实记 build 字符串不同、本次无影响、**不外推其它版本、不作性能样本、性能未宣称**——诚实隔离到位。
- **正确性不变**:`pipeline.ts` 改动是非侵入注入(`createBrowser?` 可选;未提供时保持既有 Chromium 启动路径),默认签署产物路径不变;pdf-export 59/59、report-checks 176/176 无回归佐证。

## 5. 门禁、供应链、冻结

- **门禁**:CI **8/8**;electron-shell typecheck exit 0;`pnpm verify` exit 0(实施方如实标注本机 Node 版本低于冻结工具链、不冒充参考机/CI)。
- **供应链**:Electron 为 **devDependency**(G1-02 冻结候选 43.1.1);新增 8 包(electron/@electron/get/undici/sumchecker 等)**许可全 MIT/Apache-2.0/ISC/BSD-2-Clause**,SBOM 登记、lockfile 冻结;运行时核心零新增第三方。
- **冻结物零漂移**:host 契约(`packages/host-contract`)、签署基线、字体、7 冻结原件**未动**——壳符合冻结契约,未改契约。诊断只留数值证据,不回显正文。

## 6. 结论与交接

**PA-14E 独立审计 PASS。** 合并由业主/Codex 执行。桌面主判定(安全配置 + 排版)在 Electron 壳上**成立**。

- 未关闭且不阻断:PA-A7、PA-J1/K1/L1~L4/M1/M3~M5/N1/N2(PA-12 人工清单)。
- PA-14E 与 **PA-14H(ArkWeb 壳)** 平台目录隔离并行;PA-14E/14H/14U + PA-13 汇入 **PA-15**(PoC-A 闸门报告与通过/降级决定)。
- 提醒下游:本结论限 Electron 43.1.1/Chromium 150 本次对账,不外推其它版本;真实平台若现页数/字体/换行/P0/P1/几何差异须重审(实施记录已书面登记)。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
