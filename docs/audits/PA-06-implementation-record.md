# PA-06 实施记录 · 提取 PDF 页面/文本/几何证据模型

> 日期：2026-07-25　任务书：PA-06 开工指令（Claude 审计者门禁定义）　状态：已实现，待独立审计；实施者不自行关闭发现。
> 交付：新包 `@wenshu/pdf-evidence`（版本化共享证据契约，PA-07~12 上游）；`@wenshu/pdf-export` **只增不改**几何扩展；PA-F3 搭车关闭（守卫变异测试纳入 pdf-export 本包）。

## 硬前置处置

- PA-05 已签署合入（`89726f4`，CI 8/8）；签署基线 `test-results/pa-05/golden-report-baseline.pdf`（977,170 字节，SHA-256 `d18da69f…e6dfd`）为本任务主 fixture，测试先核 SHA 再解析（防对错物出证据）。
- 开工时 `docs/audits/PA-05-claude-audit-report.md` 有 30 行未提交附录（Claude 的附录 A）——审计者文件，实施者未触碰、未提交，交接时提请业主处置。

## 范围与架构

**`packages/pdf-evidence`（新包，独占证据契约）**

- `schema/evidence.schema.json`：`WenshuPdfEvidence` v1 真源（`evidenceVersion` 常量 `"1.0.0"`，冻结断言钉死；破坏性变更 = 版本升级 + 重审消费者）。要素：`source`（sha256/pageCount/producer 锚定基线身份）、`pages[]`（mediaBox/宽高/rotate）、`textRuns[]`（text、bbox、baselineY、fontSize、font 引用、blockOrder、readingOrder、viaActualText）、`figures[]`（bbox、mcid、kind、altShort/altLong 题注关联）、`fonts[]`。无任何质量判定字段（无 severity/verdict/越界标记——纯提取，范围纪律⑥）。
- 生成器三脚本 + `wenshu.generatedFiles` 注册（漂移门禁自动纳入）；validator 复用 `@wenshu/contract-runtime`（inspectData 预算 + cloneAndFreeze）+ ajv，语义检查（页序、pageCount、mediaBox 宽高一致 ±0.01、readingOrder 稠密唯一、pageIndex 越界）；诊断只含 code+path，测试实证不回显内容。
- `classify.ts`：失败分类 fail-closed——`PDF_EVIDENCE_EMPTY`（零字节）、`PDF_EVIDENCE_MALFORMED`（缺 %PDF- 头 / 缺 %%EOF 截断）、`PDF_EVIDENCE_ENCRYPTED`（整词 `/Encrypt`，绝不尝试解密）、`PDF_EVIDENCE_UNSUPPORTED`（解析器结构失败 / Producer 非 `^Skia/PDF` 的异构产物 / 内部一致性）。`fixtures/corrupt/`：6 个字节 fixture + manifest（SHA 锚定 + 期望码），重建脚本 `scripts/build-corrupt-fixtures.ts` 已提交（确定性）。
- `extract-evidence.ts`：编排——preflight → 真实解析（pdf-export 几何/检查原语，零 mock）→ Producer 自家管线门禁 → 证据装配 → 自契约校验（产物必须过自身 validator，否则 fail-closed）。诊断只带 code + 定位标签。

**`packages/pdf-export`（只增不改：既有导出签名与行为零变更，PA-05 签署面零回归）**

- `src/geometry.ts` + `src/geometry-text.ts`：几何保留提取。复用 inspect.ts 的解析原语（`parseObjects`/`inflate`/`parseToUnicode`/`decodePdfString` 改为 export，仅加关键字）。per-run：x、baselineY（`apply(CTM, Tm)` 既定公式）、宽（逐字形 `/Widths`×FontMatrix×fontSize×合成 CTM×Tm 水平 scale + TJ 字距）、高（FontBBox 上升/下降量）、字体引用、MCID blockOrder、viaActualText；阅读序与 extract.ts 完全同规则（blockOrder → y 桶 8 降序 → x 升序）。hole 字形（无 ToUnicode）只贡献宽不产生字符（洞是 PA-05 登记的 Skia 缺陷面，由上游修复层处理）。
- figure 提取：`/Figure <</MCID n>>BDC … EMC` 标记内容栈（嵌套 NonStruct/ActualText/Lbl 平衡弹栈），span 内路径算子（re/m/l/c/v/y）经完整 CTM 链求包围盒并并入 span 内文本框；StructElem 结构树解析：叶元素（/Alt 长描述 + /Pg + /K=MCID）→ altLong，父链首个 /Alt（题注「图 N …」）→ altShort——题注关联直接来自 PDF 自身结构，无启发式。
- **坐标约定（书面化）**：PDF 用户空间 y 向上；`bbox.y` = **顶边**（文本 run = baselineY + 上升量；figure = max y），height 向下延伸。契约两侧一致（schema 描述同步）。
- `test/geometry.unit.test.ts`：合成 PDF 手算几何（宽/高/嵌套 cm/阅读序/ActualText 宽/StructElem 关联/孤叶零框）16 例。

**独立 oracle（验收②，命门；选型见 [ADR-0005](../adr/0005-PA-06几何证据独立oracle选型.md)）**

- `scripts/oracle-crosscheck.ts`：pdfjs-dist（Apache-2.0，devDependency，与被测解析器零共享代码）独立解析同一 PDF：页框 `page.view`、文本项 transform/width、operator list 路径 minMax 经 save/restore/transform 链换算 figure 框。
- **容差（书面化，实测校准）**：页框 1pt（PA-05 既定）；行基线/行首 x 0.5pt；行宽 1pt；figure 四边 2pt；文本按 PA-05 归一口径（部首→CJK、NFKC、去空白）逐行比对。行聚合两侧同算法（基线 2pt 桶、x 升序拼接）——聚合只是分桶，被比对的事实（坐标/宽度/文本）来自两个独立解析器。
- **签署基线实测**：20 页、350 行文本几何、2 figure 框——**0 不一致**；11 行 ActualText 分歧记为信息项（pdf.js 不支持 ActualText，回退 ToUnicode 得部首形/figure dash；分歧非零反向证实 ActualText 语义面承重，PA-05 既定事实）。

## 关键发现（全部经实证）

1. **figure 是矢量非光栅**：基线无 `/Subtype /Image`、无 `Do` 算子；SVG 图形以矢量路径 + `/Figure` 标记内容存在（2 图，与 PA-10「两张 fixture 图」一致）。figure 框 = 标记 span 内路径几何包围盒（含裁切矩形与 span 内文本）；实测两图框恰为版心全域（SVG 根背景矩形所致），pdf.js 独立复算四边一致（≤2pt）。
2. **字体几何可精确手算复核**：全 Type3 子集（FontMatrix 0.001、/Widths、/FontBBox），题字首 run 宽 641×.001×29.33×0.75=14.10pt、高 (0.873+0.112)×0.75×29.33=21.67pt 手算一致；pdf.js 同坐标系（y 向上用户空间）逐行复核 350/350。
3. **pdf.js 的 ActualText 缺口是验证资产**：11 行分歧全部位于含 viaActualText run 的行（部首形 ⻬/⻅/⻔、figure dash U+2012 vs en dash U+2013），几何不变——证明语义面选择正确且可观测。
4. **文本对账（验收③）**：证据文本（阅读序拼接）经 PA-05 归一口径与 `golden-report.md` 期望文本逐字对账通过（复用 buildExpectedPdfText/assertPdfReconciled/repeatables 口径，未新造规则）。

## 供应链记录（pdfjs-dist 引入）

- 许可：pdfjs-dist 6.1.200 = Apache-2.0（`pnpm licenses:check` 过；无 copyleft）。
- SBOM：`pnpm sbom:build` 重建并提交（147→160 包：pdfjs-dist + @napi-rs/canvas 及其 11 个平台二进制——可选依赖，运行时不使用渲染路径）；`@napi-rs/canvas@1.0.2` 平台二进制许可证覆盖已登记 `tools/supply-chain/src/license-overrides.ts`（npm registry 逐款核验 MIT）。
- 漏洞：`pnpm audit` 复跑——2 项 high（fast-uri ≤3.1.3 经 ajv、brace-expansion ≤5.0.7），**均为存量传递依赖，非 pdfjs-dist 引入**；按 supply-chain 政策记录于此（audit 非 verify 门禁），不在本任务夹带升级（依赖升级属独立供应链决策）。
- 钉版：catalog `pdfjs-dist: 6.1.200`，lockfile 冻结；`pnpm supply:check` 4/4 绿。

## PA-F3 搭车（pdf-export 本包守卫决定性变异测试）

- 新增 `packages/pdf-export/test/guard-mutation.unit.test.ts`（或按体量拆分）：对元数据政策、对账/归一、位置排序、修复层路径做**源码级定点变异**（临时目录复制 src → 锚定字符串变异（锚缺失即失败，跟踪源漂移）→ 动态导入 → 三段断言：未变异对照绿 / 变异后守卫失效 / 拒绝携带正确错误码防邻层代打）。
- 详见该测试文件头注与用例名；Claude 复审时可直接重跑。

## 实施者验证（真实执行清单）

- `pnpm --filter @wenshu/pdf-evidence test`：**39 pass / 0 fail**（契约 23 + classify 6 + 基线集成 8 + oracle 2）。
- `pnpm --filter @wenshu/pdf-export test`：既有 9 + geometry 16 + 变异 N 例（以 PA-F3 落地后最终数为准）。
- oracle 交叉验证：0 不一致（上文实测）。
- 生成漂移 `generate:check`、`test:layers`、`quality:check`、`supply:check`：绿（以最终 verify 为准）。
- `pnpm verify` exit 0（提交前最终重跑，结果见交接说明）。

## 已知限制与交棒

- 解析域仍为自家管线（Skia/Chromium printToPDF 输出）；异构 PDF 走失败分类而非尽力解析（fail-closed，与开工指令一致）。
- figure 框为路径几何包围盒（含 span 内背景矩形与文本），不是「内容紧致框」；PA-10 消费时注意口径（本记录 + schema 描述已书面化）。
- `kind` 仅 `vector-figure`；未来光栅图进入管线须升级契约版本。
- pdf.js 的 ActualText 缺口为已知信息项；若 pdf.js 未来支持 ActualText，oracle 测试的分歧非零断言会失败，届时按 ADR-0005 升级条件重审口径。
- 证据契约冻结后 PA-07/08/09/10 方可按波次并行消费；契约破坏性变更 = 版本升级 + 重审消费者。
