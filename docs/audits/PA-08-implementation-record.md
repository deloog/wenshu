# PA-08 实施记录 · 标题/孤行寡行/异常空白 P1 检查

> 日期：2026-07-26　任务书：PA-08 开工指令（Claude 审计者门禁定义）　状态：已实现，待独立审计；实施者不自行关闭发现。
> 交付：`@wenshu/report-checks` 新增 P1 规则目录（4 规则）+ P1 确定性运行器 + 检出报告契约 additive v1.1.0（`manualChecks` 诚实门通道）。只检测定位，不修复；设计决策见 [ADR-0007](../adr/0007-PA-08检出报告契约v1.1.0与P1诚实降级.md)。

## 硬前置处置

- DoR：PA-06B 已签署（证据契约 v1.1.0 冻结：`textRuns[].figureMcid`、`figures[].paintBBox`，PR #14 `a9c3667`），PA-07 P0 域已补全（PR #13 `d157970`）。本任务消费 v1.1.0 证据，前置已解除。
- 禁重解析/禁 mock：四条规则输入只有 `{evidence, expected, contentBox, paginationRules}`——`WenshuPdfEvidence` 类型级不可能触达 PDF 字节；集成测试经 `extractEvidence` 取真实签署基线证据（SHA-256 `d18da69f…ce6dfd` 锚定），fault 全部内存派生（`structuredClone`，冻结物零触碰）。
- 阈值溯源：`paginationRules` 来自 `validateTemplate` 受控路径（冻结 `formal-business.template.json`），非内联断言；widows=2 / orphans=2 / heading_keep_with_next_lines=2 / max_consecutive_sparse_pages=1 原样注入规则。新增运行时依赖仅 `@wenshu/template-model`（workspace）；**零新增第三方运行时依赖**。

## 探针实测（设计钉定的证据）

实施前用一次性探针（测完即删）对签署基线实测，三条事实决定了规则形态：

1. **标题灰区**：模板 keepN=2，但 PA-04 已登记近似（CSS `break-after: avoid` 只保证 ≥1 行）。基线 10 处标题后继同页行数落 1..N-1 区间（8 例标题后接 1 行子标题、2 例标题后接单行完整段落）——按模板字面值自动判定 = 把合法排版报违规；故自动判定只钉 0 行（真分离），灰区降人工。
2. **基线零跨页段落**：widows/orphans 自动判定基线天然 0 误报；分裂路径只能靠 fault 注入演练（见测试清单）。
3. **密度连续分布**：合法页密度 2.0%（封面）~45.3% 无天然切点，模板无密度阈值定义 → 稀疏判定整体降人工+逐页密度证据；只有「整页零内容」是二值事实可自动判定（基线无空页）。
4. **归属匹配**：反向游标匹配 318/318 非 repeatable 块全归属，封面/正文同文标题未误归属（正向游标会把 `/blocks/0` 误钉到封面页）。

## 范围与架构

- **契约 v1.1.0**（additive）：`schema/check-report.schema.json` 升 1.1.0，新增必需 `manualChecks[]`（`{ruleId, code(P1_*_REVIEW), pageIndex, nodeRef, reason(静态≤200字符), basis}`）；`check-report-1.0.0.schema.json` 原样冻结保留（仅 title 调整生成命名），reader 双版本分发；语义校验扩展为 findings+manualChecks 的 ruleId 均 ⊆ 执行规则集。**P0 运行器继续生产 1.0.0（PA-07 签署行为零漂移）**，P1 运行器生产 1.1.0。
- `p1-attribution.ts`：反向游标块归属（同文取文本流较晚出现；`lastIndexOf` 位置参数含自身，游标严格在前——实施期实捕一条同文相邻块重复命中缺陷，单元测试锁死）；baselineY 2pt 聚行（与 p0-overlap 同视觉行口径一致）；正文行排除 figure 成员 run（解析期事实）。
- `rules/p1-heading-keep.ts`：0 行后继 → `P1_HEADING_SEPARATED`（自动）；1..N-1 行 → `P1_HEADING_KEEP_REVIEW`（人工，附行数+模板 keepN）；标题后紧邻表格/图片块跳过（PA-09/10 域）；有序列表 marker 与 item 首行合并计行。
- `rules/p1-orphan.ts` / `p1-widow.ts`：跨页段落（paragraph/quote/list-item，文档侧归属定身份）页尾行 < 模板 orphans / 页首行 < 模板 widows → 自动发现；贴阈值合法；无人工项（行数与阈值皆确定性事实）。
- `rules/p1-sparse-page.ts`：整页零 run 零 figure → `P1_EMPTY_PAGE`（自动二值）；**每页**产出 `P1_SPARSE_DENSITY_REVIEW` 人工核验（textAreaPt2/figureAreaPt2/coverageRatio/模板 maxConsecutiveSparsePages）——不设任何密度阈值。
- `p1-runner.ts`：固定规则序 → 按 id 禁用（未知 id fail-closed；禁用连同该规则人工项一并回退）→ 双通道确定性排序 → 产物过自身契约（fail-closed）→ 1.0.0 证据 fail-closed（行聚合依赖成员事实）。同输入字节级同报告。
- `expected-content.ts`：`ExpectedBlock` 增 `kind`（additive；P0 不消费），P1 分域的事实来源。
- `scripts/run-p1-baseline.ts`：可重放基线审计入口，退出码即结论（实测 `findings=0 manualChecks=30 (headingKeepReview=10, sparseDensityReview=20)`）。

## 实施者验证（真实执行清单）

- 包测试 **73/73**：契约 14 + P0 单元/集成（存量全绿，含 ExpectedBlock.kind 适配）+ P1 单元 21 + P1 集成 9。
  - 验收①：四类 fault 内存派生全检出+定位——标题分离（`/blocks/1`@p2，relatedNodeRef 段块）、寡行（@p2 linesAtPageEnd=1）、孤行（@p3 linesAtPageStart=1）、空页（`P1_EMPTY_PAGE`@5）；部分稀疏 fault 无自动判定、密度证据如实下降（after < before×0.7）且仍定位 p8。
  - 验收②：基线全 P1 **0 自动发现**；人工项有界钉数 10+20=30（sha 锚定稳定）；贴阈值分裂（4/2 行）不报。
  - 验收③：灰区只入 manualChecks（钉 `/blocks/0` followingLinesOnPage=1）、reason 全集 = 2 条静态口径文本、无 `P1_*_REVIEW` 混入 findings。
  - 验收④：finding 数值依据中 templateOrphans/templateWidows/templateKeepWithNextLines/templateMaxConsecutiveSparsePages 逐项 === 冻结模板值。
  - 验收⑤：报告契约版本化（生产 1.1.0 / 读取 1.0.0+1.1.0）；非法 fixture（缺 reason、manualCheck ruleId 未执行、1.1.0 缺 manualChecks、错误版本）各以稳定 code+path 拒绝；诊断不回显正文。
- **决定性变异自证 5/5 变红**（P1 三测试文件套跑）：M1 标题规则不触发（fail 4）、M2 寡行阈值含等号（fail 1）、M3 稀疏人工证据被吞（fail 7）、M4 归属游标含自身（fail 1）、M5 运行器丢弃 manualChecks（fail 5）；还原后 30/30 绿。
- `pnpm verify` exit 0（提交前最终重跑结果见交接说明；中途修复 prettier/eslint 各一轮，修复后全量重跑）。

## 已知限制与交棒

- 标题后紧邻表格/图片块不判（PA-09/10 专项域，留白是有意的分域）；quote attribution 短行不参与孤行寡行。
- 同文段落反向匹配取较晚出现（确定性口径）；未命中块跳过（内容缺失=P0 域）。
- 密度证据为面积和口径（未做重叠去重）：文本 run advance 框互有重叠时 coverageRatio 轻微高估——作为人工审查的相对比较数据足够，不作为自动判据（本来就没有）。
- PA-12 汇总：P0 报告 1.0.0 + P1 报告 1.1.0 双版本并存；「自动检出」只计 findings，manualChecks 不计入。
- PA-09/10 在本包各自新增规则目录；`P1_*_REVIEW` 码段与 manualChecks 通道已就位可复用。
