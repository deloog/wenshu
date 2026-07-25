# PA-05 实施记录 · 真实锁定 Chromium 导出基线 A4 PDF

> 日期：2026-07-24　任务书：PA-05 开工指令（Claude 审计者门禁定义）　状态：实施中，待 VM 基线证据与 Claude 独立审计；实施者不自行关闭。
> 交付：新包 `@wenshu/pdf-export`（`packages/pdf-export`），只产出基线 PDF，不做 validator 判定/修复。

## 硬前置处置

- ① PR #10（PA-04）已合入 main ✔。
- ② 引擎复核：已按 `docs/pdf-engine-evaluation.md` 要求书面复核，**维持 Chromium**（复核段已追加到该记录，2026-07-24）。
- ③ Win11 参考环境：`wenshu-ref-win11`（G1-14W 已签署），基线 PDF 在 VM 内由其内建 Edge（Chromium，随冻结镜像锁定）产出；版本与打印参数留证于 evidence.json。

## 范围与架构

- **`pipeline.ts`**：`produceBaselinePdf`——固定 fixture →（决策 #9 公共根导入）→ PA-03 语义 HTML → PA-04 白名单 CSS → 单文件打印文档（CSS 内联）→ 本地静态服务器（字体/资产经 renames 回映射）→ CDP `Page.printToPDF`（参数逐项显式留证：A4 英寸、四边 mm→in、printBackground、preferCSSPageSize、displayHeaderFooter=false、scale=1、tagged PDF + outline）。
- **`browser.ts`（report-render 增量，已申报）**：`printToPdf`、`productVersion`、`launchBrowser(executableOverride?)`——锁定浏览器路径由调用方显式供给。
- **`inspect.ts`**：零新增依赖的 Skia PDF 检查器（只支持自家管线 PDF，未知结构 fail-closed）：对象/FlateDecode 流解析、Info 元数据、MediaBox、FontDescriptor（名称/字重/Type3 CharProcs 或 FontFile 内嵌判定）、逐页文本层提取（ToUnicode CMap + **tagged PDF ActualText 优先**——Skia 把共享字形映射到康熙部首码位时用 ActualText 给正字）。
- **`metadata-policy.ts`**：元数据卫生规则（见下）的机器判定。
- **`reconcile.ts`**：PDF 对账——归一（显式部首补充表 + NFKC + 去布局空白）后逐字比对；期望文本 = 文档文本序列 + 有序列表渲染标记 + 冻结 SVG 资产内嵌文本（阅读序 img→figcaption）。

## 元数据卫生政策（书面规则，对应验收⑤）

| 字段 | 规则 |
|---|---|
| `Title` | 保留，必须等于文档自身标题（受控值） |
| `Producer` | 只允许引擎常量 `Skia/PDF m<N>`（留证） |
| `Creator` | 只允许引擎 UA 常量（Chromium/Edge 形态，含 OS 家族、无个人/机构身份） |
| `Author`/`Company`/`Keywords` 等一切其他字段 | **禁止存在**（上游作者/机构/工具身份零容忍） |
| `CreationDate`/`ModDate` | 允许（时间戳，确定性差异来源，如实记录） |
| XMP | 不得含 author/company/creator 身份 |

说明：本管线从 Markdown/ HTML 自家生成 PDF，不存在 Word/WPS/AI 工具元数据输入面；政策为**验证+留证**（无重写字段需求），最终元数据转储于 evidence.json。

## 关键发现（实施过程实证，如实登记）

1. **Skia 命名**：冻结 OTF（Source Han Sans CN）在 PDF FontDescriptor 中以联合设计别名 `Noto Sans SC`（Chrome）或原名（Edge）登记，子集 + Type3 CharProcs 内嵌；本基线实际使用 400/700 两档字重（500 已注册待模板后续使用）。
2. **tagged PDF 的 ActualText**：Skia 把共享字形 ToUnicode 映射到康熙部首码位（如 文→⽂），并用 ActualText 给出正字；提取必须 ActualText 优先，否则正文错码。SVG 内嵌文本无 ActualText，残留部首由补充表 + NFKC 归一。
3. **Skia m150 ToUnicode 缺漏（调查中）**：本机 Chrome 150.0.7871 与 Edge 150.0.4078 均有个别字形实例无 ToUnicode 映射、无 ActualText（实测 23 处，含「个」约 10 处），tagged/untagged 均现。文本层可搜索性因此受损。**正等待 VM 内 Edge（较旧 Skia）的基线结果判定是否为版本相关**；若为 m150 引入的行为，锁定 VM 内旧版 Edge 即规避。
4. **页尺寸抖动**：双引擎实测 MediaBox 594.96–595.92pt（A4=595.28pt），Skia 取整抖动 <1pt，验收容差按 1pt。

## 实施者验证（契约/逻辑层）

- `pnpm --filter @wenshu/pdf-export test`：unit 7 全绿；render 层在 dev 宿主上仅对账断言因发现 3 暂红（如实保留，不掩盖）。
- 单元覆盖：compose/打印参数/元数据政策/归一/SVG 提取/对账守卫/wiring。
- 渲染层（真实浏览器）：A4、字体内嵌、元数据政策、对账、确定性（同环境两次导出内容级一致，字节差异限于时间戳域）。
- VM 基线证据：`test-results/pa-05/`（待收获补记）。

## 交接与已知限制

- PA-E2 近似复核：真实分页效果首见，keep-with-next/figure-keep/表头重复的真实表现待 VM PDF 上复核登记。
- 若 VM Edge 文本层完整：基线成立；若同样缺漏：升级为引擎级发现，提交审计裁决（不手调、不掩盖）。
