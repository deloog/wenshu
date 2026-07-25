# PA-05 用真实锁定 Chromium 导出基线 A4 PDF · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-25
> 实施基线：PR #11 分支 `pa-05-pdf-export` tip `b3e8207`；base `origin/main` = `94f8abd`（PR#10 已合入）
> 远程验证：PR #11 check-runs **8/8 pass**（ubuntu-24.04）
> 审计方法：仓外 worktree 隔离安装、本机真实浏览器复跑 + 本机重生成 PDF + **独立工具交叉验证（pdftotext / 原始字节 / PDFium 渲图）** + 变异；探针收尾已删除。
> 写入边界：本轮仅新增本文件；未改代码/测试/Schema/fixture；GitHub 只读。

---

## 1. 结论

**PASS —— PA-05 通过，可合并 PR #11。** 无 BLOCKER/MAJOR；发现均为观察项（含 1 项范围界定说明）。

- 管线（导入→PA-03 语义 HTML→PA-04 白名单 CSS→CDP `printToPDF`）产出 **20 页 A4 PDF**，可打开/可搜索/可复制、字体内嵌、元数据干净、内容对账。
- **本轮我强制以非自写工具交叉验证**（自写解析器有"产出与验证同源"的自证风险）：元数据（原始字节 grep）、A4（MediaBox）、字体内嵌（Type3/CharProcs）、**PDFium 渲图视觉确认 CJK 正确** —— 全部独立成立。
- **浏览器版本已锁定**（VM Edge 150），关闭 PA-03/PA-04 遗留的"浏览器未锁定"观察项。
- 一处需明确的范围边界见 §3（ToUnicode 修复层的验证口径）。

---

## 2. 独立交叉验证（绕过自写解析器）

我在本机以 PR#11 管线重生成一份基线 PDF（Chrome/150.0.7871.186，20 页，977,156 字节——与 VM 的 977,170 字节仅差 14 字节，同为 Skia m150），再用**独立工具**核验：

| 维度 | 独立工具/方法 | 结果 |
|---|---|---|
| 元数据无上游泄露 | 原始字节 `grep /Author /Keywords /Company` | **全 0**，无 Word/WPS/Office/AI/个人机构痕迹 ✔ |
| 元数据受控值 | evidence.json + 原始字节 | Title=文档标题、Producer=`Skia/PDF m150`、Creator=HeadlessChrome UA 常量、XMP 无 ✔ |
| A4 物理尺寸 | 原始字节 `MediaBox` | `[0 0 594.96 841.92]`，与 A4（595.28×841.89）差 <0.35pt，容差 1pt 内 ✔ |
| 字体内嵌 | 原始字节 `/Type3 /CharProcs /FontFile` | Type3 143 + CharProcs 143 全内嵌、FontFile 0（Type3 正确）、零系统字体 ✔ |
| 引擎兼容性事实 | **poppler `pdftotext` 实测** | CJK 提取为 **0**（仅 ASCII/数字），**证实实施记录 finding 6 诚实**——poppler 非有效 oracle，语义面=ToUnicode+ActualText（PDFium 语义）✔ |
| **文本视觉正确性（破循环）** | **Chrome PDFium 渲图 + 读图** | 首页标题渲染为「AI 辅助长文交付流程效率观察报告」，与源标题**一字不差**；页数 20/20 ✔ |

其中 PDFium 渲图是关键一刀：它绕过自写解析器、直接确认页面**视觉上**的 CJK 字形正确，从而证明自写解析器的提取与真实渲染一致，不是"自证自洽"。

## 3. ToUnicode 修复层 —— 验证口径与结论（本门最锋利处）

修复层用源文本推断补 Skia 文本层的洞/错标，对账又拿修复后文本与源比——存在**循环验证嫌疑**。我的判定：

**修复在结构上是安全的，且"掩盖错字形"不成立：**
1. 修复**只改 ToUnicode CMap 与 ActualText（文本层元数据），从不改字形绘制算子**——故**修复不可能改变页面视觉**，只改"提取出什么文本"。"掩盖错字形"在结构上不可能：错字形是浏览器绘制问题，与修复无关。
2. 修复是 **fail-closed** 的：增量更新后重新提取、断言对账通过 + 无残留洞 + **原始字节前缀不变**（代码显式 `equals` 校验）；任何不可解分歧、同码不一致推断均抛错。故修复**要么产出"文本层==源"要么失败**，不会静默产出乱码。
3. 真正待验的"绘制字形是否=源字符"——我已在**同引擎大版本（Chrome 150 = VM Edge 150 Skia major）、同源、同字体**下 PDFium 渲图视觉确认正确；该保真度可传递到 VM。

**一处如实说明的验证边界（PA-F1，观察项）**：**本机 Chrome 150 产出 0 洞 0 修复**（reconcile 直接通过），VM 的 Edge 150 才出 21 洞——修复路径**引擎构建特定**，本机无法复现那 21 处修复。故我对"21 洞修复"的验证依据是：**代码结构安全性 + fail-closed 重验 + 可传递的渲染保真度**，而非渲染 VM 那份具体产物。若需airtight闭合，可对 VM `test-results/pa-05/` 的实际 PDF 渲图逐处复核（我具 VM 只读权限，可按需执行）。鉴于 (1)(2)(3)，我判定当前证据足以支撑 PASS。

**对账口径**：`assertPdfReconciled` 比对的是**归一后**文本（部首→CJK、合字展开、全角 NFKC、去布局空白与 Cf 格式字符、跨页重绘表头跳过），非字节逐一。这是合理工程选择（这些是渲染等价形/布局产物），但内容保证是"**modulo 该书面归一**"的等价，非原始字节相等——特此登记口径。

## 4. 跨包改动、门禁与范围

- **跨包 `report-render/browser.ts`（+29）**：纯加法向后兼容——`findChromium(executableOverride?)`（锁定 Edge 路径）、`printToPdf`、`productVersion`（版本留证）；`launchBrowser()` 无参调用不变。**PR#11 CI 在 ubuntu 逐条复现 report-render 8/8**（golden 13299ms 真实浏览器、错字重、wiring），PA-03 未回退。
- **装配层范围（PA-F2，观察项，合法）**：`compose.ts` 两处均**书面登记为非模板装配层职责、不改冻结资产字节**：(a) 打印基线 `img,svg{max-width:100%}`——实证 Skia 对溢出版心的图像整体丢弃裁剪外文本算子（图表右侧内容丢失），此为内容保真底线（图像尺寸非模板 token，模板不覆盖）；(b) SVG 内联进 `<div role=img aria-label>`——实证 Skia 的 SVG-as-`<img>` 沙箱不使用任何 webfont（图表文字不渲染），内联 + 字体 data: URL 是渲染必需，a11y 由 role/aria 承接。二者非缺陷、非模板越界，是"忠实基线"所必需。
- **门禁**：`pnpm --filter @wenshu/pdf-export test` 本机 9/9（真实 Chrome 端到端）；PR CI 8/8（pdf-export 逻辑测试亦在 ubuntu 实跑）；SBOM **147→147 零新增第三方**（自写零依赖 Skia 检查器 + CDP printToPDF）；冻结物（fixture/字体/schema/生成物）**零漂移**；决策 #9 调用点契约遵守（传 fixtures 公共根）。
- **守卫变异（我独立重跑）**：元数据白名单守卫、对账守卫各置空后对应单测**变红** ✔。**注意**：实施记录"变异自证"列的是**上游包**守卫（SHA/转义/字重/打包），未覆盖 pdf-export 自身新守卫（元数据/对账/修复对齐/字体内嵌）——我已独立补两处确认承重（见 PA-F3）。

## 5. 发现（均为观察项，不阻断）

- **PA-F1**：21 洞修复路径引擎构建特定，本机（Chrome 150）0 洞无法复现；验证依据为结构安全 + fail-closed + 可传递渲染保真度，VM 实际产物渲图复核可选（见 §3）。
- **PA-F2**：装配层 `max-width` 与 SVG 内联——非模板、冻结资产不变、内容保真必需，已书面登记（见 §4）。合法。
- **PA-F3**：实施记录"变异自证"未覆盖 pdf-export 自身新守卫（只列了上游）；我已独立确认元数据/对账守卫承重，建议实施记录补齐本包守卫的变异登记。
- **对账为归一等价**（非字节相等），口径已登记（§3）。
- **确定性**：同环境重复导出内容级一致，字节差异限时间戳域（CreationDate/ModDate 允许）——合理。

## 6. 结论与交接

**PA-05 独立审计 PASS，可合并 PR #11。** 合并由业主/Codex 执行（注意本报告提交落 main、主树复位 main——主树当前在 `pa-05-pdf-export` 分支）。

- **基线 PDF 已就位且经独立交叉验证为忠实**，可作为 **PA-06（PDF 几何/文本证据模型）** 及 PA-07~12 检查链的来源。提醒 PA-06：文本层语义面是 ToUnicode+ActualText（poppler 不可用，PDFium 语义），几何来自 Skia（<1pt 抖动）。
- PA-E2 的近似（keep-with-next/figure-keep/表头重复）在真实 PDF 的分页表现属 PA-06~12 裁决；PA-05 只保证忠实产出。
- 未关闭且不阻断：PA-A7、PA-F1/F2/F3。
- 若业主要 21 洞修复的 airtight 闭合，我可执行 VM 只读渲图复核。

按 CLAUDE.md，本报告由审计者给出结论，台账由 Codex 完成；实施者不自行关闭发现。
