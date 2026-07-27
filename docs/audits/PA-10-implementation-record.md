# PA-10 实施记录 · 图片/题注/来源/比例/忠实检查

- 任务：PA-10（路线图 PA-10 行；Claude 开工指令定义门禁，本记录为实施方留痕）
- 日期：2026-07-27
- 包：`@wenshu/report-checks`（唯一改动包）+ ADR-0009 + 本记录/followups
- 状态：已实现，待独立审计

## 1. 交付物

新增 P1 图片域五条规则（每条一文件，`rules/p1-figure-*.ts`）：

| 规则 | findings | manualChecks | 判定 |
|---|---|---|---|
| p1-figure-caption | P1_FIGURE_CAPTION_SEPARATED | P1_FIGURE_CAPTION_REVIEW | 题注与图同页；模板门 `figure_keep_with_caption`（false 静默跳过） |
| p1-figure-source | P1_FIGURE_SOURCE_SEPARATED | P1_FIGURE_SOURCE_REVIEW | 来源紧随题注且同页（越页/次序颠倒/夹块均检出；文档未声明来源降人工） |
| p1-figure-aspect | P1_FIGURE_ASPECT_DISTORTED | P1_FIGURE_ASPECT_REVIEW | paintBBox 宽高比 vs 源 viewBox 固有比，容差 0.01（ADR-0009 溯源） |
| p1-figure-fidelity | P1_FIGURE_CONTENT_MISMATCH / P1_FIGURE_FONT_NOT_EMBEDDED | — | 成员 run 逐字对账源 SVG（转换红线）；成员字体未嵌入即缺陷 |
| p1-figure-legibility | —（诚实门，绝不产 findings） | P1_FIGURE_LEGIBILITY_REVIEW | 视觉清晰度无确定判据，逐图降人工附证据 |

基础设施：`p1-figures.ts`（归属分析，三重防线）、`p1-figure-locate.ts`
（文本对齐定位：归一整串 + run 边界 + 阅读序连续 + 单一 MCID 块）、
`svg-source.ts`（零依赖 viewBox 白名单解析，fail-closed）、
`expected-content.ts` additive 扩展（`figure-source` kind、
`figureOrdinal`/`figureAspect` 字段）、`finding.ts` additive 注册
（5 规则 id + 9 码）、`p1-runner.ts` 固定序追加注册。
**检出报告契约保持 1.1.0 零漂移**（新码全在既有码模式与双通道内），
冻结 1.0.0 schema、证据契约、基线 PDF、fixture、lockfile 零改动。

## 2. 探针钉定的基线事实（签署基线 sha256 d18da69f…6dfd）

- 2 图均 `vector-figure`：p7 mcid=0（paintBBox 421.48×238.84，成员 58），
  p9 mcid=4（paintBBox 421.50×182.65，成员 80）。
- **题注 run 为非成员**（figcaption /P 不在 /Figure span 内），阅读序紧随
  成员：p7 成员 ro 3807..3864 → 题注 3865..3867 → 来源 3868..3941
  （gap=0）；p9 成员 → 题注 5664..5666 → 来源 5667..5724（gap=0）。
- 成员 run 归一拼接 === 源 SVG 文本：58/58、79/79 逐字一致；成员字体全嵌入。
- 宽高比实测偏差 <0.0001（浮点尾数级）：p7 1.7647058823529413 vs
  1.7647058823529411；p9 两侧同 2.3076923076923075。
- 来源段含归一零长 run（纯空白），修复前被连续性防线误杀（见 §4 修复 1）。

## 3. 验收映射（每条对应真实验证）

| 门禁 | 验证 |
|---|---|
| ①fault 检出+定位 | 集成 F1 题注移次页→`P1_FIGURE_CAPTION_SEPARATED@8:figure:7:0`；F2 来源移次页→`P1_FIGURE_SOURCE_SEPARATED@7:figure:7:0`；F3 paintBBox 宽×1.15→`P1_FIGURE_ASPECT_DISTORTED@7`；F4 图例单字篡改→`P1_FIGURE_CONTENT_MISMATCH@7`；单元覆盖次序颠倒/夹块/未嵌入/光栅化 |
| ②基线零误报 | 签署基线 2 图 → 0 自动发现；人工项恰 +2（LEGIBILITY_REVIEW p7/p9），其余图片人工项 0；`run-p1-baseline.ts` exit 0 |
| ③分域无重判 | 分域猎杀：figure 出版心→仅 PA-07 P0_OUT_OF_BOUNDS、PA-10 零发现；非成员 run 叠入 paintBBox→仅 P0_OVERLAP、PA-10 零发现；ADR-0009 决策 4 证成 |
| ④转换红线/忠实 | fidelity 对账判据即留痕机制：光栅化（成员归零）/图例篡改单测均检出不可静默；基线直渲 SVG 无转换 → 停止条件如实不触发（§2 证据） |
| ⑤诚实门/范围/契约 | 清晰度逐图降人工附 metrics；*_REVIEW 契约级不入 findings（集成 honest-gate 用例）；零 PA-07/08/09/11 夹带；容差 ADR 溯源；`pnpm verify` exit 0（§6） |

## 4. 实施期修复（如实登记）

1. **零长 run 误杀**：来源段内纯空白 run 归一后零长，初版定位将其排除
   导致阅读序连续性防线误判合法段落为歧义（基线 2 图来源均降人工）。
   修复：零长 run 计入场内（p1-figure-locate.ts），基线复归 0 图片
   歧义项；M7 变异（复活该 bug）决定性变红。
2. 单测 helper 的 ExpectedBlock.text 未归一（全角冒号 NFKC 差异）——
   测试侧修复，helper 内经 normalizePdfText，符合块契约。
3. p1-tables.integration 的 expected 装配未传 viewBox 固有比 → 比例
   规则如实降 2 条 ASPECT_REVIEW；装配补齐后复归（非规则误报，
   属测试输入不完整）。
4. 图片单测按文件体量门拆分为 `p1-figures.unit.test.ts`（题注/来源，
   428 行）与 `p1-figure-quality.unit.test.ts`（比例/忠实/清晰度/
   viewBox，283 行）——prettier 重排后单文件 557 行超 500 失败线，
   按域拆分（PA-09 拆分先例）。

## 5. 决定性变异（8 注入 8 变红，均已还原并复绿）

| # | 变异点 | 变红证据 |
|---|---|---|
| M1 | p1-figures wrong-page 状态降级为 ok | 4 失败（F1/F2 + 单元越页 2 例） |
| M2 | FIGURE_ASPECT_TOLERANCE 0.01→0.5 | 2 失败（单元失真 + F3） |
| M3 | fidelity !== 改 === | 11 失败（F4 + 基线 + 单元忠实面） |
| M4 | 来源紧随 gap>0 改 >999 | 1 失败（单元夹块） |
| M5 | 单一 MCID 块防线删除 | 1 失败（单元跨块题注降人工） |
| M6 | caption 模板门失效 | 1 失败（单元门控跳过） |
| M7 | 零长 run 排除（§4.1 回归复活） | 2 失败（基线人工项钉数） |
| M8 | viewBox 4 元组校验失效 | 3 失败（svg-source 单元） |

## 6. 实际执行的检查与结果

- `pnpm --filter @wenshu/report-checks test`：120/120 pass（含既有 100 +
  新增 20；单测按体量门拆两文件）。
- `node packages/report-checks/scripts/run-p1-baseline.ts`：exit 0，
  findings=0，manualChecks=32（heading 10 + density 20 + figure 2）。
- `pnpm typecheck` / `lint` / `format:check` / `quality:check` /
  `test:layers` / `contracts:check`：全绿。
- 基线钉数诚实更新：p1.integration/p1-tables.integration 人工项 30→32
  （PA-10 诚实门新增 2 条，理由见 ADR-0009 决策 6 与 followups）。
- **`pnpm verify`：exit 0**（全门禁串联：format/lint/quality/foundation/
  config/contracts/fixtures/fonts/environment/supply/typecheck/build）。

## 7. 承接与边界

- LEGIBILITY_REVIEW ×2 须并入 PA-12/PA-14U 人工清单（PA-J1 口径 30→32），
  已登记 [PA-10-followups](PA-10-followups.md)。
- 已知边界登记于 ADR-0009 后果段（图后全文复述题注/来源的文档触发歧义
  降人工而非误报；来源前缀约定来自 golden 声明）。
- 转换留痕机制为检查期对账判据；若未来引入受控转换管线，转换记录须
  作为检查输入扩展登记（需求池/后续任务，不在本任务范围）。
