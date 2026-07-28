# PA-11A 实施记录 · 目录页码两遍渲染与页眉页脚压印 + 签署基线协同重签

- 任务：PA-11A（路线图 PA-11 行的前半：目录页码真实化 + 页眉页脚；后半 PA-11B 为双向对账与红线检查）
- 日期：2026-07-28
- 包：`@wenshu/document-model`（0.2.0 additive toc）、`@wenshu/markdown-import`、`@wenshu/report-render`、`@wenshu/pdf-export`（pagination/stamp/pipeline）、`@wenshu/pdf-evidence`（基线钉刷新 + oracle 排除口径）、`@wenshu/report-checks`（压印排除 + 基线钉刷新）
- 设计：[ADR-0010](../adr/0010-PA-11A目录页码两遍渲染与页眉页脚压印受控补偿.md)
- 状态：已实现，待独立审计

## 1. 交付物

### 1.1 目录页码（禁手写，派生自实际渲染）

- 文档契约 additive 升 **0.2.0**：`toc` 块入 Block oneOf；冻结 0.1.0
  schema 保留，reader 双版本分发（PA-06B 先例）。markdown 导入
  `[[TOC]]` 标记产 toc 块；渲染为 `<nav class="toc">`。收录规则唯一
  归口 `document-model/collectTocEntries`（level 1–2、排除封面同文
  题名子树），render 与 checks 共用同一出口（pdf-export 转出，
  下游零新增直接依赖）。
- `pdf-export/pagination.ts`（169 行纯函数模块）：
  - `measureTocPageNumbers(bytes, entries)`：/Outlines 先序遍历 +
    文档序游标消歧同文标题（封面题名双现）；非 /XYZ dest、缺大纲、
    无匹配、Dest 指向未知页对象——一律 fail-closed
    （`PDF_EXPORT_PAGINATION_FAILED`），绝不猜测页码。
  - `resolveStableTocPages(initial, reRender)`：≤3 轮不动点收敛纯
    函数（不触浏览器），供变异测试锚定；超限 fail-closed。
- pipeline 两遍渲染：pass1 占位 → printToPDF → 大纲测量 →
  resolveStableTocPages（回调内填充+重渲染+重测）→ 文本层修复 →
  压印 → 终检对账。签署基线实测一轮收敛。

### 1.2 页眉页脚 PDF 层压印（受控补偿，ADR-0010 §2）

- `stamp.ts`（180 行主流程）+ `stamp-glyphs.ts`（163 行逐字复刻）+
  `stamp-update.ts`（127 行增量写出与零交叠自检），拆分后均合规。
- 字形零新增：A 路子集字体 ToUnicode 单字符映射复刻（部首码位归一
  等价）；B 路 origins ActualText 复刻（「文」等无单字符映射字）；
  两路均无 fail-closed。
- 位置公式唯一：模板边距派生（页眉 baseline 810.42、页脚 25.2、
  x=51.02、9pt）；封面（pageIndex 0）豁免；压印带与既有 run 零交叠
  自检先于字节改写。
- 压印字体统一 tag 前缀 `STAMP_FONT_TAG_PREFIX = "PA11F"`（单源常量，
  report-checks 排除口径与 oracle 排除口径共用，禁止几何启发式识别）。
- `stripStampsForReconcile`：归一后缀锚定剥离，缺失/underflow
  fail-closed——压印未生效或错位不能静默放过。

### 1.3 签署基线协同重签（PA-05 签署协议）

- 页码/页眉页脚改变分页与文本层（20→21 页），基线只能由签署环境
  （Win11 22621 VM + Edg/150.0.4078.83）产出。注入方式：停机可写
  挂载 VHDX 替换 payload（bootstrap.ps1），收获：只读挂载。
- 锚定提交 `3c33500`（VM 内逐位核对）；双跑导出 run1/run2，
  **run1 = 权威产物**。
- 确定性判定：run1/run2 原始字节 sha 不同——差异仅
  CreationDate/ModDate 时间戳（元数据政策允许项）；剥离时间戳后
  normalized sha 完全一致（`816B8EE9…B6C8`）。判定口径书面化于
  bootstrap 与收获物 `determinism.txt`。
- 重签过 PA-05 级验证链：21 页、36 toc 条目、reconcile ok，
  results.txt 全 0。收获物：`test-results/pa-11a/harvest/{run1,run2}`
  （不入库）；提交基线 fixture 已替换为 run1 副本。

## 2. 新签署基线事实（探针实测，禁猜）

- sha256 `5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828`
  （旧 `d18da69f…6dfd` 作废）。
- 21 页；11876 textRuns；40 压印 run（pageIndex 1–20，封面豁免；
  tags PA11F1/PA11F2/PA11F8）；页脚 `N / 21`，页眉 `⻓⽂交付效率观察`
  （部首码位，归一后 = 长文交付效率观察）。
- figures：p8 mcid=0（58 成员，paint 421.48×238.84 @x87.01 y784.92，
  题注 ro 4453–4455，来源 ro 4456–4529）；p10 mcid=4（80 成员，
  paint 421.50×182.65 @x87.00 y553.92，题注 ro 6256–6258）。
- 跨页表（主要风险与首期处置）p12→p13；续页 p13 页首 15 表头 run
  真实重复（首数据 ro 7768）；表块 root 不变。
- 执行摘要首段（/blocks/1/children/0）仍在 p2，6 行——标题/寡行/
  孤行 fault 载体页位不变。
- P1 人工核验项 **33** = 标题灰区 10（页位 1,4,4,5,7,9,10,12,14,18）
  + 逐页密度 21（= 页数）+ 图片清晰度 2；自动发现 0。

## 3. 级联刷新清单（全部探针重测）

| 位置 | 刷新 |
|---|---|
| pdf-evidence baseline.integration | sha/20→21 页/figures p7,p9→p8,p10/paint 钉/成员页断言；reconcile 改注入式 tocExpectation（pages 从证据 toc 条目实测） |
| pdf-evidence oracle.integration + oracle-crosscheck + oracle-pdfjs | **压印排除口径**（§4.1）；0 失配 21 页 387 行 2 图 |
| report-checks p0.integration | figure overlap 钉 p7→p8（含 relatedNodeRef `figure:8:0`） |
| report-checks p1-figures.integration | FIG1 page/mcid/题注 ro/来源 ro 段、fault 目标页 8→9、finding 钉 @8/@9、legibility nodeRef（字典序 `figure:10:4` 在 `figure:8:0` 前）、成员数 58/80 复核 |
| report-checks p1-tables.integration | 跨页 11/12→12/13 全链（fault 注入页、命中页、continuationPage） |
| report-checks p1.integration | 人工项 32→33；稀疏 fault 页 8→9（§4.2）；验收⑤空页 fault 删除改搬移（§4.3） |
| report-checks fixtures 11 个 JSON | 契约 fixture 内基线 sha 全部换新 |
| report-checks stamp-scope.ts（新增） | 压印 run 排除 helper（解析期事实 tag 前缀）；P0/P1 runner 输入侧排除 |

## 4. 实施期关键决策与修复（如实登记）

### 4.1 oracle 交叉验证压印排除口径

pdf.js 对自家压印 Type3 字符的几何是**近似**（worker `isCharBBox`
启发式分支：Type3 且 fontSize≤1 或 isCharBBox 时用
glyphHeight×fontMatrix，transform 缩放 0.24），而 operator list 的
Tm 逐位正确——属 oracle 侧 Type3 位置近似，非产物缺陷。决策：交叉
验证域收窄到**引擎产出字节**（oracle 本职）；压印行两侧以解析期事实
排除（证据侧 `font.tag` 前缀过滤、违规记 mismatch；pdf.js 侧尾部锚定
剥离、fail-closed 验证后缀）。正当性：压印行已被对账链多层覆盖——
strip 后缀锚定+逐字对账（reconcile）、零交叠自检、Tf/Tm 次序变异、
多 tag 变异、封面豁免变异；自家算子不在独立 oracle 的交叉验证域。

### 4.2 稀疏 fault 载体页 8→9

重签后 p8 为图 1 所在页，图区覆盖率使「半数 run 移除」不再诚实反映
密度下降（0.4528→0.3654，未破 0.7 倍阈）。改纯文本页 p9（探针实测
0.3036→0.1511），测试意图（稀疏带如实降人工）不变。

### 4.3 验收⑤空页 fault 删除改搬移

中段整页删除会在归属命门反向文档序游标上制造内容空洞，归属
fail-closed 丢弃前序块（含 /blocks/1）——标题检出随之消失是**归属
歧义的如实降级**，非检出缺口。fault 改为将 p5 全部 run 搬至 p6
（游标完整），双发现（HEADING_SEPARATED@2 + EMPTY_PAGE@5）与回滚
隔离均实测恢复。

### 4.4 其他修复

- stamp-scope.ts：生成类型 `WenshuPdfEvidence.textRuns` 为可变数组，
  去掉内层 `Object.freeze`（filter 已产新数组，原证据不受影响）
  消 TS2322。
- p0.integration 遗留一处 `figure:7:` 钉（首轮 3 处编辑漏第 4 处），
  探针复核后补齐。
- probe-pa11a-baseline.ts：删除未使用变量（ESLint）。
- VM 重签第一轮失败两项如实登记：determinism=1（时间戳差异，见 §1.3
  判定口径）、env:record=1（`--out` 只接受纯文件名）——bootstrap
  重写后第二轮全绿。

## 5. 验证证据（本机 Win10 dev-primary，非签署环境）

- pdf-export：59/59 单元 + 2/2 render + **13 项决定性变异全绿**
  （pagination-mutation 8/8：大纲匹配降级/非 XYZ 放行/页码 0-based/
  轮次预算缩减/收敛判据失效/反馈游标丢失/占位符恰好一次/缺页码静默；
  stamp-mutation 5/5：交叠自检失效/封面豁免失效/Tf-Tm 次序颠倒/
  多 tag 登记丢失/strip 后缀锚定失效）。
- pdf-evidence：47/47（baseline.integration + oracle.integration
  钉刷新，0 失配）。
- report-checks：120/120（p0 10、p1 9、p1-tables 6、p1-figures 8
  及全部单元/契约）。
- 质量门：生产/测试文件行数合规（stamp 拆分后 180/163/127）；
  prettier/eslint/typecheck 随 verify 链。
- `pnpm verify`：exit 0（日志 tmp/verify-pa11a.log；远程 CI 矩阵
  随 PR 复现，以 CI 8/8 为生效条件）。

## 6. 门禁映射（开工指令逐条）

| 门禁 | 落实 |
|---|---|
| 页码派生自实际渲染，禁手写 | 大纲 /Dest 测量 + 不动点收敛；任何猜测路径 fail-closed；变异「缺页码静默渲染」变红 |
| 机制确定性 | VM 双跑 normalized sha 一致；签署环境外不产基线 |
| 能力触顶如实记录、受控补偿 | ADR-0010 全文；target-counter/页边盒双端实测不支持留痕 |
| 重签过 PA-05 验证链 | §1.3；results.txt 全 0，锚定提交逐位一致 |
| 冻结物零漂移（除协同重签） | 除基线 fixture 替换与钉刷新外零改动；lockfile/SBOM 零漂移 |
| 零新增第三方运行时依赖 | 成立（pdfjs-dist 仍 dev-only，PA-06 已登记） |
| 分域红线：不重判 PA-07~10 | 压印排除只收窄输入域，不改任何规则判定；PA-08=标题-正文起页分离 vs PA-11=标题-目录对应，边界不变 |

## 7. 交棒

- **PA-11B**：toc 双向对账、toc_page_numbers_match、页眉页脚一致性、
  实际页码红线；F03 fault 转可注入。重签基线已就位，可按 DoR 开工。
- 承接项台账：[PA-11A-followups](PA-11A-followups.md)。
