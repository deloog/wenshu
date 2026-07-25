# ADR-0005：PA-06 几何证据独立 oracle 选型（pdfjs-dist 纯验证用途）

- 日期：2026-07-25
- 状态：已接受（实施决策，随 PA-06 独立审计复核）
- 关联：宪法 18（禁 mock 核心依赖）、R-TEST、PA-06 开工指令命门「几何可靠性 + 独立交叉验证」

## 背景

PA-06 把 PA-05 签署基线 PDF 解析为版本化几何/文本证据模型，供 PA-07~12 消费。提取端是 PA-05 的自写零依赖 Skia 子集解析器（regex 对象扫描 + FlateDecode + ToUnicode + 仿射跟踪），存在「产出即真源」的自证风险：如果解析器对坐标理解有系统性错误，它对账文本仍可能自洽。开工指令因此要求：抽取的页/文本/图片框必须与**独立 oracle** 交叉验证，且第三方解析器若引入必须过供应链基线。

候选：

1. **poppler（pdftotext -bbox / pdftohtml -xml）**：PA-05 审计已实证对本管线 PDF 的 CJK 提取为零（Type3 `/Differences` 为无名 glyph），只能覆盖 ASCII 片段，且引入外部二进制依赖、CI 可用性无保证。否决。
2. **锁定 Edge 150（PDFium）渲图 + 无障碍树取坐标**：与签署环境同引擎大版本，但取数链路脆弱、依赖本机/VM 浏览器、ubuntu CI 不可复现，无法成为可重放的常规门禁。否决（保留为审计者手工深查手段）。
3. **pdfjs-dist（Mozilla pdf.js，Apache-2.0）**：与自写解析器零共享代码的完整 PDF 实现（独立对象解析、独立 ToUnicode、独立文本定位、operator list 暴露路径 minMax 与变换链）；纯 JS、Node 24 可跑、CI 可复现、lockfile 钉版本。

## 决策

1. 生产提取路径保持**零第三方依赖**的自写解析器（`@wenshu/pdf-export` 几何扩展），pdfjs-dist 仅作 **devDependency**，只出现在 `packages/pdf-evidence/scripts/oracle-crosscheck.ts` 与 oracle 测试中——oracle 与被测对象代码零共享。
2. 交叉验证口径（书面化于 oracle-crosscheck.ts 头注）：页框 ≤1pt；逐行基线/行首 x ≤0.5pt、行宽 ≤1pt；figure 框四边 ≤2pt；文本按 PA-05 归一口径（部首→CJK、NFKC、去空白）逐行比对。
3. pdf.js 不支持 ActualText（span 内回退 ToUnicode 解码，得部首形/figure dash）——此类行记为**信息项分歧**而非不一致，其几何仍逐行参与交叉验证；分歧非零本身反向证实「ToUnicode + ActualText 是唯一语义面」（PA-05 既定事实）。
4. 供应链义务随引入一并完成：Apache-2.0 过许可门禁；SBOM 重建并提交（147→160 包）；`@napi-rs/canvas` 平台二进制许可证覆盖登记（npm registry 核验 MIT，含 win32-x64 变体双平台覆盖——ubuntu CI 首轮 security 作业实证单边覆盖不足后补齐）；`pnpm audit` 复跑结果记录于 PA-06 实施记录。
5. 若 pdfjs-dist 未来版本引入不宽松许可或不可接受的传递依赖，立即按供应链基线替换 oracle，不使用镜像或豁免。

## 结果

- 几何命门获得可 CI 复现的独立第二真源：350 行文本几何 + 20 页框 + 2 figure 框在签署基线上交叉一致（0 不一致）。
- 生产面零新增依赖，验证面新增一个宽松许可依赖，SBOM/许可/漏洞记录齐备。
- PA-07~12 消费者可信任证据契约的几何事实，不必各自重验解析器。

## 升级条件

pdf.js 版本升级改变 oracle 口径（坐标定义、ActualText 支持、operator list 结构）、基线引擎大版本升级改变发射形态、或下游发现容差内系统性偏差时，必须重审本决策与容差表，并重跑交叉验证矩阵。
