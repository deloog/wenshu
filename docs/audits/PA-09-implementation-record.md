# PA-09 实施记录 · 表格跨页/表头重复/行切断 P1 检查

> 日期：2026-07-26　任务书：PA-09 开工指令（路线图 PA-09 行：真实 PDF + DOM 对账；表格 fault 全覆盖）　状态：已实现，待独立审计；实施者不自行关闭发现。
> 交付：`@wenshu/report-checks` 新增表格归属命门模块（`p1-tables.ts` + `p1-table-pages.ts`）+ 2 条 P1 规则（`p1-table-header-repeat`、`p1-table-row-split`）+ 新码 `P1_TABLE_HEADER_NOT_REPEATED` / `P1_TABLE_ROW_SPLIT` / `P1_TABLE_STRUCTURE_REVIEW`（人工通道）。只检测定位，不修复；设计决策见 [ADR-0008](../adr/0008-PA-09表格跨页检查严重级与DOM对账归属.md)。

## 硬前置处置

- DoR：PA-08 已签署（P1 规则目录、manualChecks 诚实门通道、P1 确定性运行器就位，PR #15 `b108c68`）；证据契约 v1.1.0（PA-06B）冻结。本任务在同包新增规则，前置已解除。
- 停止条件判定（路线图 PA-09 行「表格无法通用分页则触发 PoC-A 风险评审」）：**不触发**。签署基线探针实测 Chromium 按 PA-04 CSS（`thead` header-group + `tr break-inside: avoid`）对唯一跨页表真实重复表头且整行未切断（详见下探针实测）。
- 禁重解析/禁 mock：规则输入仍为 `{evidence, expected, contentBox, paginationRules}`；集成测试经 `extractEvidence` 取真实签署基线证据（SHA-256 `d18da69f…ce6dfd` 锚定），fault 全部内存派生（`structuredClone`，冻结物零触碰）。
- 阈值溯源：`table_repeat_header: true` / `table_row_break_inside: "avoid"` 经 `validateTemplate` 受控路径注入；模板为 `false`/非 `"avoid"` 时规则空转。**零新增第三方运行时依赖**（复用 `@wenshu/pdf-export` 的 `normalizePdfText` 与既有 workspace 依赖）。

## 探针实测（设计钉定的证据）

一次性探针（测完即删）对签署基线实测：

1. **5 张表，仅 1 张跨页**：refs 形如 `/blocks/N/children/.../children/0`（表嵌套在 section 内，根非顶层 `/blocks/N`）——表发现正则须支持嵌套路径。跨页表 = 「主要风险与首期处置」（`/blocks/7/children/2/children/2/children/0`，7 行 × 4 列，pageIndex 11→12，行 0-1 在 p11、行 2-6 在 p12）。其余 4 表全部单页（pages [4]/[8]/[16]/[18]）。
2. **续页表头真实重复**：p12 页首 15 个表头 run（blockOrder 1-4，基线 757.9~772.9）全部位于首个数据行基线（740.7）之上——Chromium 真实重复表头，停止条件不触发。
3. **对抗形态真实存在**：基线 run 多为单字 run，短单元格「风险」会撞上章节标题「六、风险、边界与降级」的内部子串（须 run 边界对齐拒配）；同文单元格真实存在（须反向文档序解析）；单元格内换行、列宽不均真实存在（归属须容忍）。

## 范围与架构

- `p1-tables.ts`（301 行，命门）：表发现（嵌套 ref 正则 `<root>/columns/<c>/header`、`<root>/rows/<r>/cells/<c>`）→ 单元格归属三重防线（run 边界对齐 / 反向文档序游标 / 几何一致性：同格同页单 MCID 块序 + 列带相邻不重叠）→ 歧义 fail-closed 计数。**行内列 x 序曾实现后删除**：列带相邻不重叠 ⟹ 任意行内列 x 序成立（证明：列带两两 x 有序且不重叠时，任意行内 col_c.min ≥ band_c.min ≥ band_{c-1}.max ≥ 行内前列 max），变异测试证实该校验冗余（禁用它测试全绿），遂删并留本记录。
- `p1-table-pages.ts`（110 行）：页内行聚合、列带计算、`headerRepeatedOnPage`（表头文本须在续页**首个数据行基线之上**的对应列带内出现才计数——防同文数据单元格误认表头）。
- `rules/p1-table-header-repeat.ts`：跨页表续页表头缺失 → `P1_TABLE_HEADER_NOT_REPEATED`，定位页 + 表根 ref（relatedNodeRef = 缺失列头 ref），metrics 带 headersExpected/headersFound/templateRepeatHeader。歧义表降 `P1_TABLE_STRUCTURE_REVIEW` 并跳过。
- `rules/p1-table-row-split.ts`：同一 `/rows/<r>` 单元格 run 分处页界两侧 → `P1_TABLE_ROW_SPLIT`，定位页 + 表/行 ref，metrics 带 continuationPage/两侧单元格数/templateRowBreakInsideAvoid。整行同页的跨页（行界分裂）合法不报。
- `finding.ts`：P1RuleId +2（固定序 `p1-table-header-repeat`、`p1-table-row-split`），P1Code +3（`P1_TABLE_STRUCTURE_REVIEW` 只入 manualChecks）。P0 域零改动；存量 PA-08 规则零改动。
- 严重级证成（两码均 P1：排版质量缺陷，内容仍在证据中=非 P0_CONTENT，未越界/遮挡=非 PA-07 域）已书面化于 ADR-0008。

## 实施者验证（真实执行清单）

- 包测试 **93/93**（存量 73 全绿不回潮 + 表格单元 14 + 表格集成 6）；`tsc -p tsconfig.json` 干净。
  - 验收①：两类 fault 内存派生全检出+定位——删除 p12 重复表头 15 run → `P1_TABLE_HEADER_NOT_REPEATED`@12（表根 ref，headersExpected=4/headersFound=0）；行 2 首格 run 移至 p11 → `P1_TABLE_ROW_SPLIT`@11（`<root>/rows/2`，continuationPage=12）。
  - 验收②：签署基线 0 表格自动发现、0 `P1_TABLE_STRUCTURE_REVIEW`；PA-08 人工项钉数 30 不回潮；无表格期望块输入零表格输出。
  - 验收③：归属对账——5 表全归属 violations=0、跨页表唯一且为钉定 ref、页集 [11,12] 钉定。
  - 验收④：对抗形态单元测试——嵌入子串拒配、同文单元格反向序、换行格+列宽不均归属正确、三类歧义 fail-closed（混合块序/列序倒置/文本缺席各降人工项且零自动判定）、表头在数据行下方不计数、`table_repeat_header=false` 空转、行界分裂合法、无表/单页零输出。
  - 验收⑤：阈值溯源——metrics 中 templateRepeatHeader/templateRowBreakInsideAvoid 逐项 === 冻结模板值；单规则回滚隔离（禁用 row-split 后其发现归零、header-repeat 仍在）；同输入字节级同报告；诊断不回显正文。
- **决定性变异自证 5 注入 5 变红 + 1 冗余实证删除**（表格两测试文件套跑 20 例）：M1 表头位置条件移除（fail 1）、M2 混合块序 fail-closed 移除（fail 1）、M3 行内列 x 序移除（**存活** → 证明被列带校验蕴含，删码后 93/93 绿）、M3' 列带重叠移除（fail 1）、M4 行切断规则钝化（fail 2）、M5 表头缺失规则钝化（fail 3）；每次注入后 `git checkout` 还原，最终态 93/93 绿。

## 已知限制与交棒

- 合并单元格/跨列表在路线图范围外；其归属歧义由几何校验 fail-closed 兜住（降 `P1_TABLE_STRUCTURE_REVIEW` 人工核验），不做几何启发式猜测。
- 归属依赖单元格文本在证据中可匹配；表格文本缺失属 P0 域（attribution 跳过），不在表格规则重复报告。
- `P1_TABLE_STRUCTURE_REVIEW` 人工项并入 PA-12/PA-14U 人工清单（PA-J1 口径）；PA-12 汇总门禁的表格 fault 检出域由本两条规则承接（P0+P1 ≥10/12 口径中占 2 类）。
