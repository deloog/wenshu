# PA-07 实施记录 · P0 内容/页面尺寸/越界/遮挡检查

> 日期：2026-07-25　任务书：PA-07 开工指令（Claude 审计者门禁定义）　状态：已实现，待独立审计；实施者不自行关闭发现。
> 交付：新包 `@wenshu/report-checks`（PA-07~12 共享检查家；本任务交付 P0 规则目录 + 确定性运行器 + 检出报告契约 v1.0.0）。只检测定位，不修复。

## 硬前置处置

- DoR：PA-06 审计 **PASS**（`d8c2bc5` 签署）且 PR #12 已合入 main（`eacfe4c`）；本任务从 main 起 `pa-07` 分支，消费冻结证据契约 v1.0.0，不重解析 PDF。
- 类型级禁重解析：四条规则的输入只有 `{evidence, expected, contentBox}`——`WenshuPdfEvidence` 由 PA-06 规范生产器产出，检查函数签名上不可能触达 PDF 字节；集成测试经 `extractEvidence` 取得真实证据（非 mock、非自解析）。

## 范围与架构

- `schema/check-report.schema.json` v1.0.0：发现 = `{ruleId, code(P0_*), pageIndex, nodeRef, basis:{metrics 数值, relatedNodeRef?}}`——只有定位 + 数值依据，无正文；`rules` 列表表达实际执行的规则（单条回滚 = 从列表缺席）。生成漂移门禁 + contract-runtime/ajv 校验 + 语义（findings.ruleId ⊆ 执行规则集）。
- `rules/p0-page-size.ts`：每页 A4 ±1pt（PA-05/06 既定容差）。
- `rules/p0-bounds.ts`：文本/figure 框出页边或出版心。版心 = 模板 margin_mm（左/右 18、上/下 20）→ 51.02/544.26/785.20/56.69pt，与 PA-06 实测版心一致。容差 0.5pt（书面化：吸收 Skia 页框取整抖动与 FontBBox 字体级高估；fault 注入量 ≥3pt，远在阈上）。
- `rules/p0-overlap.ts`：见「关键发现 1」的豁免/阈值口径。
- `rules/p0-content.ts`：文档块级存在性（见「关键发现 2」）。
- `runner.ts`：固定规则序 → 按 id 禁用（未知 id fail-closed `REPORT_CHECKS_UNKNOWN_RULE`）→ 排序 (ruleId, pageIndex, nodeRef) → 产物过自身契约（不过 = 内部缺陷 fail-closed）。同输入同结果（字节级断言）。
- `expected-content.ts`：文档 → 逐块期望段（镜像 reconcile visitBlocks：有序列表渲染标记、表头 header-group repeatable、figure SVG 文本先于题注；归一复用 normalizePdfText）。块 ref = 稳定路径（`/title`、`/blocks/<i>/rows/<r>/cells/<c>` 等）。
- `scripts/run-p0-baseline.ts`：可复放基线检查（审计重放点），退出码即结论。
- 依赖：运行时 workspace 包 + ajv（catalog）；markdown-import 仅 devDep（测试构建期望）。**零新增第三方运行时依赖**。

## 关键发现（全部经实测校准）

1. **advance 框重叠 ≠ 遮挡（275 误报的根因与口径）**：初版遮挡规则在签署基线爆出 275 条「重叠」，全部是同 MCID 块、同基线行的相邻 run，重叠宽 0.30–5.50pt——证据宽度来自 Type3 `/Widths`（advance），而 Skia 实际排版有字距压缩（CJK 标点挤压 ≤0.5em）与 advance 高估，相邻框几何重叠是**排版设计行为而非遮挡**。书面化口径：(a) 同块同视觉行（基线差 ≤2pt）的 Td 链顺序文本，重叠宽 ≤0.6em（较小字号）豁免，>0.6em 仍判 P0；(b) 跨行/跨块/文本-figure 部分重叠（骑缝）任何显著交集（>max(0.5pt², 较小框 1%)）即 P0；(c) 完全包含于 figure 的 run 豁免（figure bbox 为版心全域、图表标签/题注是图自有内容，PA-06 形态事实）。校准后基线 20 页 11,262 run + 2 figure **0 误报**，fault 注入（整行覆盖/半压图边）**全检出**。
2. **内容检查必须块粒度且区分「重复文本」**：整串对账（PA-05）只有首 diff 无定位；块级匹配后，删除唯一段落 → 按块 ref 精确检出。文档标题与首节标题同文（实测 `/blocks/0` 与 `/title` 同串）——「乱序/重复出现不算缺失」的回退匹配会把单处删除误判为仍在；这不是规则缺陷（内容确实还有一处），测试选取唯一出现块注入删除。缺失页定位 = 前序已命中块所在页（近似口径书面化；nodeRef 块路径为精确定位）。
3. **贴边合法面**：贴版心沿 ±0.4pt、相触不相交的框均不触发（单元测试正反覆盖）。

## 实施者验证（真实执行清单）

- `pnpm --filter @wenshu/report-checks test`：**34/34**（契约 11 + 单元 16 + 集成 7）。
  - 验收①：签署基线（SHA 锚定）全规则 **0 发现**（323 期望块全命中）。
  - 验收②：四类 fault 内存派生全检出——700pt 页（页 3）、run 推出右版心 5pt（越界量≈5）、跨行覆盖（双方 ref 配对）、删唯一段落（块 ref + 期望长度）。
  - 验收③：贴边合法正反、单规则禁用只抑制本规则、未知规则 id fail-closed。
  - 验收④：findings 不残留标题标志串（基线 + fault 两种报告）、同输入字节级同报告。
- `pnpm format:check` / `lint` / `quality:check`（rules.unit.test.ts 370 行预警，不阻断）/ `test:layers`（59 文件）/ `generated:check`（12 包）：绿。
- `pnpm verify` exit 0（提交前最终重跑，结果见交接说明）。

## 已知限制与交棒

- 遮挡规则在「同行 ≤0.6em」豁免带内不判 P0——若未来出现同行微重叠真缺陷（如负字距事故），属已知口径边界；PA-12 汇总时如需收紧，改阈值即可（规则独立可回滚）。
- 内容缺失页定位为近似（前序块页）；精确锚是 nodeRef 块路径 + 期望长度。
- 版心来自 formal-business 模板；换模板时由调用方（PA-12 runner）注入对应版心，规则本身模板无关。
- P1 检查（标题/孤行寡行/表格/图片题注）未触碰——PA-08/09/10 在本包各自新增规则目录；`P1_*` 问题码段已在 schema 预留。
