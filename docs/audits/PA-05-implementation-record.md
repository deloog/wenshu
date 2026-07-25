# PA-05 实施记录 · 真实锁定 Chromium 导出基线 A4 PDF

> 日期：2026-07-24/25　任务书：PA-05 开工指令（Claude 审计者门禁定义）　状态：已实现（契约/逻辑层），待 VM 基线证据与 Claude 独立审计；实施者不自行关闭。
> 交付：新包 `@wenshu/pdf-export`（`packages/pdf-export`），只产出基线 PDF，不做 validator 判定/修复。

## 硬前置处置

- ① PR #10（PA-04）已合入 main ✔。
- ② 引擎复核：已按 `docs/pdf-engine-evaluation.md` 要求书面复核，**维持 Chromium**（复核段已追加到该记录，2026-07-24）。
- ③ Win11 参考环境：`wenshu-ref-win11`（G1-14W 已签署），基线 PDF 在 VM 内由其内建 Edge（Chromium，随冻结镜像锁定）产出；版本与打印参数留证于 evidence.json。

## 范围与架构

- **`pipeline.ts`**：`produceBaselinePdf`——固定 fixture →（决策 #9 公共根导入）→ PA-03 语义 HTML → PA-04 白名单 CSS → 单文件打印文档（CSS 内联）→ 本地静态服务器（字体/资产经 renames 回映射）→ CDP `Page.printToPDF`（参数逐项显式留证：A4 英寸、四边 mm→in、printBackground、preferCSSPageSize、displayHeaderFooter=false、scale=1、tagged PDF + outline）。
- **`compose.ts`**：装配打印文档，含**打印基线**（`img, svg { max-width: 100%; height: auto; }`）——见关键发现 1。
- **`browser.ts`（report-render 增量，已申报）**：`printToPdf`、`productVersion`、`launchBrowser(executableOverride?)`。
- **`inspect.ts`**：零新增依赖的 Skia PDF 检查器（只支持自家管线 PDF，未知结构 fail-closed）：对象/FlateDecode 流解析、Info 元数据、MediaBox、Type0/Type3 字体（FontDescriptor/CIDFont 后代/Type3 CharProcs 内嵌判定）、逐页文本层（ToUnicode CMap + tagged PDF ActualText）。
- **`extract.ts`**：**位置感知文本提取**：完整仿射跟踪（cm/Tm/Td/q/Q），MCID 逻辑块序 + 块内 y 桶降序 + x 升序排序，解决 Skia 按字体组发射算子导致的阅读序错乱；ActualText 文本在 span 自身 Tm 位置入 run；origins 逐码点对齐。
- **`reconcile.ts`**：PDF 对账——归一（部首补充表 + NFKC + 去布局空白与 Cf 格式字符）后逐字比对；期望文本 = 文档文本序列 + 有序列表渲染标记 + 冻结 SVG 资产内嵌文本（按 PDF 阅读序 y 升 x 升排序）；`repeatables` 表头跳过（见关键发现 4）。
- **`cmap-repair.ts`**：**ToUnicode 修复层**（见关键发现 2）。
- **`metadata-policy.ts`**：元数据卫生规则（见下）的机器判定。
- **`fonts.ts` / `server.ts`（report-render）**：冻结清单收窄、字节身份门禁、含包含校验的静态服务器（MIME 按扩展名，含 `.css`）。

## 元数据卫生政策（书面规则，对应验收⑤）

| 字段 | 规则 |
|---|---|
| `Title` | 保留，必须等于文档自身标题（受控值） |
| `Producer` | 只允许引擎常量 `Skia/PDF m<N>`（留证） |
| `Creator` | 只允许引擎 UA 常量（Chromium/Edge 形态，含 OS 家族、无个人/机构身份） |
| `Author`/`Company`/`Keywords` 等一切其他字段 | **禁止存在**（上游作者/机构/工具身份零容忍） |
| `CreationDate`/`ModDate` | 允许（时间戳，确定性差异来源，如实记录） |
| XMP | 不得含 author/company/creator 身份 |

说明：本管线从 Markdown/HTML 自家生成 PDF，不存在 Word/WPS/AI 工具元数据输入面；政策为**验证+留证**（无重写字段需求），最终元数据转储于 evidence.json。

## 关键发现（全部经实证，如实登记）

1. **图像溢出裁剪导致文本算子被丢**：冻结 SVG（1200px）在 469pt 版心内以约 600pt 绘制，右侧 ~22% 被裁，Skia 对完全落在裁剪区外的文本算子整体丢弃（11月、（分钟）失踪）。修法：`compose.ts` 打印基线 `img, svg { max-width: 100%; height: auto; }`——**非模板内容的装配层底线规则**，模板 token 不覆盖图像尺寸，已在此书面化（否则图表始终缺右侧内容）。
2. **Skia m150 文本层缺陷三类面**：(a) 个别字形实例无 ToUnicode 映射（洞）；(b) ToUnicode/ActualText 把字形错标为他字/康熙部首/异体（如 巡→既、户→戶 U+6236）；(c) ActualText span 在提取文本残留 U+FEFF。修复层：受约束对齐（部首/合字/全角等价 + 洞占位 + 有源单字符替换）推断正确字符 → CMap 追加 last-wins beginbfchar + ActualText 定位改写 → **PDF 增量更新**（原字节前缀不变）→ 重新提取逐字验证。**准确性更正（2026-07-25，据签署证据）**：修复层在**开发期本机 Chrome 150** 实测触发并验证（21 洞 + 1 错标全部修复）；**签署基线（VM Edge 150）实测 0 洞 0 修复（repair: repairedHoles:0, patchedFonts:0，见 evidence.json）**——修复层是经开发期验证、在签署基线上未触发的防御性基建；签署基线的文本层正确性来自 Edge 原生输出，对账是真正的独立内容检查，无修复循环风险（PA-F1 由此消解）。
3. **表格表头跨页重绘**：CSS `thead{display:table-header-group}`（PA-04 映射）使跨页表格表头在下一页重绘——渲染器生成内容。对账口径：表头串登记为 `repeatables`，首个出现按正文对齐，后续出现整体跳过（设计行为，非源文本重复）。
4. **MCID 是排序正解**：Skia 在图表/单元格区域按字体组发射算子，纯 y 排序会串行（实测两行逐字交错）；`/NonStruct <</MCID n>>` 逻辑块序 + 块内位置排序同时解决表格单元格行尾字基线抖动（如「构」以 y+20 单独成 BT）与正文行序。
5. **字体事实**：冻结 OTF 在 PDF 中以 SourceHanSansCN 或联合设计别名 Noto Sans SC 登记（随引擎），全部子集 + Type3 CharProcs 内嵌；本基线实际使用 400/700 两档字重（500 已注册待模板后续使用）。Skia 页框取整抖动 <1pt（双引擎实测 594.96–595.92pt，A4=595.28pt），验收容差 1pt。
6. **主流提取器兼容性**：poppler（pdftotext 实测）对本管线 PDF 的 CJK 提取为零（仅 ASCII/数字可提取）——Type3 字体 /Differences 为 /g0/g1 无名 glyph，ToUnicode 是文本层唯一语义面；PDFium 语义（ToUnicode + ActualText）与本检查器一致，故对账以本检查器为准（审计者可独立重放）。

## 实施者验证（契约/逻辑层）

- `pnpm --filter @wenshu/pdf-export test`：unit 7 + render 2 = **9 pass / 0 fail**（真实 Chrome 端到端：基线导出、A4、内嵌字体、元数据政策、修复后对账、同环境确定性）。
- 基线导出实测：20 页，`reconcile: ok`，SHA-256 留证；`pnpm verify` exit 0（以最新结果为准）。
- 关键测试覆盖：compose 基线、打印参数、元数据政策、归一/部首/合字/全角、SVG 阅读序、对账守卫、wiring、A4、内嵌/非冻结字体熔断、确定性（字节差异限时间戳域）。
- 变异自证（本轮实施中执行）：删 SHA 检查 → 篡改字体测试红；删转义 → 注入测试红；删字重 load 判定 → 404 测试红；丢段落文本 → 对账红；标签错误（kind 数字）→ 11 测试红；打包回退 → 长表/长列表撞 ID 红。

## 已知限制与交棒

- ~~浏览器版本未锁定~~ **已锁定**：基线 PDF 在 G1-14W Win11 参考环境（10.0.22621）由其内建 Edge `Edg/150.0.4078.83`（随冻结镜像锁定）产出。证据在 `test-results/pa-05/`（baseline PDF 977,170 字节、SHA-256 `d18da69f…e6dfd`、evidence.json 含打印参数/环境/元数据/对账/修复统计）；本机对 VM PDF 独立重抽复核：字体仅 SourceHanSansCN-Bold/Regular 两款 Type3 子集全内嵌、零系统字体、对账过。
- `inspect.ts` 只承诺自家管线（Skia/Chromium printToPDF 输出）的解析，不支持任意 PDF（fail-closed）。
- 本门不做 validator 判定/修复；`@page`/break 规则的真实分页效果、keep-with-next/figure-keep/表头重复的视觉正确性留 PA-06~12 裁决。
