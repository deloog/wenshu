# AGENTS.md · 文枢 AI 协作操作手册

> 任何 AI 助手处理本项目时先读本文件。最高约束是 [CONSTITUTION.md](CONSTITUTION.md)；产品事实来自冻结版 [立项纲领](AI原生个人知识层立项纲领%20.md)；正式决定只追加到 [决策记录](决策记录.md)。

## 当前阶段

项目处于 **PoC-B：AI 编辑事务与本地状态闸**。

> **本文件不承载任务状态。** 任何任务的完成、放行、开工资格，唯一权威来源是 [路线图 §3.1 执行台账](docs/implementation-roadmap.md)，由 `G2-04` 路线图不变量门禁机械守护（`pnpm quality:check`，解析 fail-closed）。**需要变更状态就改台账，不改本文件**；本文件只保留静态协作规则、权威文件地图、审计职责、命令与长期踩坑。此约定源于 `G2-04` 的结论：同一套关系并列手写多份，必然分叉。

**PoC-A 排版路径已由业主批准 DEGRADE**（[决策 #11A](决策记录.md)）——这是仍然生效的约束，不是进度记录：停止 PB/Alpha 对当前 Chromium 排版路径的依赖；全量分页 `not_met` 结论不被追认，增量分页是 PB/Alpha 待建架构要求；仅授权 PoC-B **非排版部分**推进。

每个任务开始前须满足 DoR；外部仓库、账号、费用、设备和发布仍需对应批准。

## 开工必读顺序

1. [CONSTITUTION.md](CONSTITUTION.md)
2. [AI 原生专业成品系统立项纲领](AI原生个人知识层立项纲领%20.md)
3. [文枢前置准备索引](docs/文枢-前置准备索引.md)
4. [决策记录](决策记录.md)
5. 与当前任务相关的专项规范、ADR、DoR 与 DoD

冲突时按以下优先级处理：法律/平台政策与用户明确要求 → 项目宪法 → 冻结纲领和已批准决策 → 专项规范 → 任务说明 → 临时对话。发现冲突时停止冲突部分并按审批矩阵处理，不自行选择最方便的解释。

## 项目一句话与当前首战

文枢把资料和想法变成真正可以交付的专业文件。首战仅验证：将 5,000–30,000 字 AI 草稿和参考材料稳定转化为 10–30 页通用专业分析报告 PDF，并显著减少人工排版。

## 权威文件地图

```text
CONSTITUTION.md                    项目最高不变量
AI原生个人知识层立项纲领 .md       冻结产品与技术纲领
决策记录.md                        已批准产品/经营决策，只追加
docs/文枢-前置准备索引.md           闸门状态与事实源映射
docs/approval-matrix.md            AI 何时必须暂停请示
DEFINITION-OF-READY.md             任务是否允许开始
DEFINITION-OF-DONE.md              任务是否允许标记完成（反例映射不可误判完成）
docs/technical-baseline.md         技术边界与选型基线
docs/testing-strategy.md           测试真实性、分层与并行
docs/adr/                           重大技术决策
docs/requirements-pool.md            需求池（不入冻结范围的新想法归口）
```

## AI 工作规则

1. 先确认当前闸门和任务权限，再采取行动。
2. 先检查目录、项目约束和已有修改；用户已有文件和改动不得覆盖、删除或冒充为 AI 成果。
3. 任务不满足 DoR 时，先补足安全、可逆、范围内的准备，不用幻觉填需求。
4. 需求、产品范围、成功指标和对外承诺不得由 AI 静默改变；新想法进入需求池。
5. 重大技术决定在既定边界内由 AI 按最佳实践作出并写 ADR，不把技术选择题推给非技术业主。
6. 变更保持小而内聚，不夹带无关重构；原子路线图通过后，每项实施任务必须有任务 ID。
7. 逻辑和缺陷按测试先行；Bug 先形成可重复失败证据，再修复。
8. 不得删除测试、降低类型/安全规则、扩大豁免或修改验收标准来让检查通过。
9. 完成声明必须列出实际执行的检查及结果；不能运行的检查必须说明原因、影响和补验时点。
10. 长期有效的约定、踩坑和决定必须回写权威文件，不能只留在聊天中。

## CI 与推送纪律（执行侧）

> 源于 CI-01 任务书 D3（业主裁定先行落地，配置改动另棒）。远程 CI run 是台账与审计报告引用的证据，配额与证据完整性同等重要。

1. 本地 `pnpm verify` EXIT=0 之前不 push。
2. 不用「再推一个提交」重跑 CI——用 `gh run rerun --failed`（只重跑失败 job）或 `workflow_dispatch`。
3. 修复轮批量推，不要一个 fix 一次 push。
4. flake 复现在本机做——CI 不是复现工具。
5. 文档提交合并——台账行 + AGENTS 条目 + followups 同一提交。
6. VM／长任务证据不进 CI——VM 批次在本机跑，保持零 CI 消耗。

## 实施与独立审计（强制）

- 默认分工：Codex 负责原子任务实施和审计问题修复；Claude 负责独立只读审计与复审。
- 任务书起草：由审计者起草（业主 2026-08-05 裁定，沿用 A-02/MINOR-3 模式）；实施者不起草自己执行的任务书。
- **任务书双向审查（开工前强制，业主 2026-08-07 裁定）**：实施者开工前须对任务书的机制性断言逐条当命令复验；发现实质错误回起草者修正后方可开工，审查记录进 PR 正文或实施记录。实证来源：A-04/A-04E/CI-01 轮实施侧连抓四条起草错误（`env:record --out` 不可执行、「第一个必须在 Win11」事实错、检查点顺序反、「prettier 覆盖 .md」连带历史报告空转表述），形态同为「部分验证即断言」，无一为起草者自查——审查不是单向的。
- 同一变更的实施者不得担任最终审计者；实施自检、测试通过和实现者代码复查不能替代独立审计。
- 每项原子实施任务完成自检后标记“已实现，待独立审计”；独立审计 `PASS` 或合规的 `CONDITIONAL PASS` 后才可标记最终完成并启动依赖任务。
- 审计者只能修改指定审计报告，不得修改被审代码、测试、Schema、配置、lockfile、路线图或验收标准。
- BLOCKER/MAJOR 由实施者修复，原审计角色复审；实施者不得自行关闭发现。
- Claude 的短入口是 [CLAUDE.md](CLAUDE.md)，审计任务与报告统一放在 `docs/audits/`。
> **以下逐任务条目是历史承接记录，不是当前状态。** 其中出现的「已完成」「放行」「可开工」等字样均为当时叙述，**不构成任何开工授权或完成认定**；当前状态与放行判断一律以[路线图 §3.1 执行台账](docs/implementation-roadmap.md)与 DoR 为准。本节只用于查阅跨任务的承接项、注意事项与长期踩坑；新增条目不得写入状态性措辞（见[评审清单 A](docs/review-checklist.md)）。
- `G1-03～G1-06` 与 `G1-07` 均已获 Claude 独立复审 `CONDITIONAL PASS`；首审 BLOCKER/MAJOR 已全部关闭，新增 MINOR 已登记到 `PB-05A`/`G1-09`。各消费者仍须满足自身依赖与 DoR。
- `G1-08` 已获 Claude 独立复审 `CONDITIONAL PASS`，首审 3 项 MAJOR 与 5 项 MINOR 全部关闭；新增 RA-01/RA-02 已登记为 `G1-11` 并行 runner 开工前硬门禁。
- `G1-09` 已获 Claude 最终复核 `CONDITIONAL PASS`：`RA-01～RA-04` 与 `CF-01` 全部关闭，现可作为 G1-11 前置。新增 `CR-01`（质量工具包未声明直接使用的 ESLint）已登记到 G1-15，最迟 G1-16 前由独立审计签署。
- `G1-11` 承接与注意：Claude 已关闭 RA-01/RA-02、IA-01 与 CI-01～CI-05；本地完整验证及首次、最终私有远程矩阵均 8/8 成功。`cancel-in-progress` 因两次运行未重叠而保留为证据限制。
- `G1-10` 承接与注意：Claude 最终复核 `PASS`，FX-01～FX-03 全部关闭；7 个 PoC-A 原件、manifest 锚点、隔离复制与证据门禁可作为后续前置。新增 `FX-06` 已登记到 PA-00，最迟 PA-01 消费冻结 fixture 前由独立审计签署。
- `G1-13` 承接与注意：Claude 独立审计 `CONDITIONAL PASS`（无 BLOCKER/MAJOR，六条否决线均不成立），两项 MINOR（FT-01 集合相等守卫、FT-02 字重唯一性守卫的测试决定性缺口）经 Codex 补决定性测试修复后由 Claude 独立重跑变异测试复核 `PASS` 关闭；FT-03/FT-04 为 NOTE 无需整改。字体身份、OFL-1.1 许可证、884 码点覆盖与篡改门禁可作为后续前置；已知限制：FT-01“多余文件”在大小写敏感 Linux CI 上的表现未实测，留作补充证据点。
- `G1-14` 承接与注意：Claude 独立审计 `CONDITIONAL PASS`（机器证据独立对账一致、无硬编码、预算诚实），三项 MINOR（EN-01～EN-03）经 Codex 修复后由 Claude 复审 `PASS` 全部关闭，无未关闭发现；可作为 PA-13/A-14 基线。
- `G1-14W` 承接与注意：Claude 审计 `CONDITIONAL PASS` 后复审 W14W-01 `PASS` 关闭（离线 VHDX 取证证真、全链转录 7/7、宿主已审计文件零改动）；Win11 参考环境身份真实登记，NOTE 均为 PA-05 书面跟进项。G1 全部 16 项前置中仅剩 G1-16 签署本身。
- `G1-16` 承接与注意：**G1 工程底座由 Claude 独立审计签署通过**，SG-01 处置核验到位、干净树可复现、11 份审计报告终局全 PASS、零功能实现。**PA 系列可按各自 DoR 启动**；承接项：NF-03/FX-06→PA-00、PB-05A、G1-12 审计推迟（决策 #6）、Win11 VM 评估期/Chromium 为 PA-05 前置。竞品调研调整批（决策 #5）为独立审计事项，不由 G1 签署放行。竞品调整批已完成：CA-01 经归档修复后 Claude 复审 `PASS`，决策 #5 忠实性背书成立，NOTE 两条非阻断。
- `G2-01` 承接与注意：Claude 审计 `PASS`（七维度逐项可判定、反例抽验与自构蒙混路径全被拦截）；DoD/PR 模板/评审清单/缺陷证据标准生效，功能任务必须走 PR。
- `G2-02` 承接与注意：G2-M1 复审 `PASS`（双向绑定、降级/删除/改分类均被拦），G2 双门禁齐备；G2-N2（direct 过滤合成用例）已随维护补测。三个 dependabot PR 按冻结工具链处置。**PA-00 可按自身 DoR 启动**。
- `PA-00` 承接与注意：Claude 复核 `PASS`，NF-03 与 FX-06 均签署关闭；导入文件名策略=导入时安全规范化重命名（决策 #7，矩阵 13 行见 document-model §7，远程 URL/越根路径拒绝、冲突 fail-closed）。**PA-01 放行，可按 DoR 启动**。
- `PA-05` 承接与注意：Claude 独立审计 `PASS`（跨工具交叉验证：poppler 证实 CJK 提取为零=实施记录诚实、PDFium 渲图视觉确认标题逐字一致、修复层三结构论断「只改文本层不改字形/fail-closed/同引擎大版本视觉保真可传递」成立），经 PR #11 合入（CI 8/8）；@wenshu/pdf-export 提供锁定环境基线 A4 PDF（20 页、对账 ok、元数据干净、字体纯冻结 OTF 子集）与零依赖 Skia PDF 检查器、位置感知提取、ToUnicode 修复层；**交棒 PA-06~12（基线忠实）**。承接：PA-F1（**已消解**：签署基线 VM Edge 150 实测 0 洞 0 修复，修复层为开发期验证（本机 Chrome 150 实测 21 洞+1 错标全部修复）但签署产物未触发的防御性基建，文本层正确性来自 Edge 原生输出、对账为真独立检查、无修复循环风险；实施记录已据签署证据更正）、PA-F3（**PA-06 已实施 13 例本包守卫决定性变异测试，待 Claude 复核重跑后关闭**）。
- `PA-06` 承接与注意：Claude 独立审计 `PASS`（几何交叉验证独立重放 0 不一致、失败四码独立喂件、供应链独立核、PA-F3 变异机理核，无 BLOCKER/MAJOR/MINOR；`d8c2bc5` 签署），经 PR #12 合入（`eacfe4c`，CI 8/8）：新包 `@wenshu/pdf-evidence` 独占版本化证据契约（`evidenceVersion` 1.0.0 冻结：页框/文本 run（bbox/基线/字号/字体引用/MCID 块序+阅读序）/figure 框（结构树题注关联）/字体信息；纯提取零质量判定字段）；pdf-export 只增不改几何扩展；几何经 pdfjs-dist 独立 oracle 交叉验证（容差书面化于 [ADR-0005](docs/adr/0005-PA-06几何证据独立oracle选型.md)）；失败分类四码 fail-closed；供应链：pdfjs-dist 6.1.200（Apache-2.0，dev-only）SBOM 147→160、许可/audit（2 项存量 high）已记录；**PA-F3 随审计 PASS 关闭**。实施记录：[PA-06-implementation-record](docs/audits/PA-06-implementation-record.md)。
- `PA-07` 承接与注意：Claude 独立审计 `PASS`（四类 P0 fault 独立注入全检出+定位、基线零误报独立跑、豁免边界合成猎杀「同块同行 6pt 豁免/8pt 检出/跨块跨行 6pt 检出」证实校准未牺牲真遮挡检出、CI 逐条 gate skipped=0），经 PR #13 合入（`d157970`，CI 8/8）；新包 `@wenshu/report-checks`（PA-07~12 共享检查家）交付 P0 四规则 + 确定性运行器（单规则可禁用回滚）+ 检出报告契约 v1.0.0（定位+数值依据，不回显正文）；唯一输入为 PA-06 冻结证据模型（类型级禁重解析/禁 mock）；零新增第三方运行时依赖。观察项 PA-I1 经业主裁定（[决策 #10](决策记录.md)，选项 B）后随 PA-06B 关闭；台账 [PA-07-followups](docs/audits/PA-07-followups.md)。实施记录：[PA-07-implementation-record](docs/audits/PA-07-implementation-record.md)。
- `PA-06B` 承接与注意：Claude 增量审计 `PASS`（漏检关闭/误报未回潮/成员制非几何/paintBBox 经 oracle 独立背书/additive 双版本逐项决定性独立验证，无未关闭发现），经 PR #14 合入（`a9c3667`，CI 8/8 ubuntu skipped=0）；证据契约 additive 升级 **v1.1.0**（`textRuns[].figureMcid`=解析期 /Figure span 成员事实禁几何启发式、`figures[].paintBBox`=绘制范围 clip 不计入），冻结 v1.0.0 schema 保留 reader 双版本分发；p0-overlap 豁免收紧为成员制（遮挡判据钉 paintBBox——审计判定为决策 #10 正确精化，实施期实证：figure bbox 版心全域系 clip 矩形撑起、clip 不绘制），「图遮正文不骑缝」fault 检出为 P0_OVERLAP 且签署基线仍 0 P0（成员 p7=58/p9=80 钉定）；oracle 交叉验证新增 paintBBox 双侧比对 0 不一致；决定性变异（成员标记退回几何/clip 计入 paint）CI 变红；**PA-I1 关闭，PA-08 可按 DoR 开工**；留存验收点：PA-12 的 12 fault 样本中「图遮正文」落 PA-07 检出域。设计：[ADR-0006](docs/adr/0006-PA-06B证据契约v1.1.0成员标记与绘制框.md)；审计：[PA-06B-claude-audit-report](docs/audits/PA-06B-claude-audit-report.md)。
- `PA-08` 承接与注意：Claude 独立审计 `PASS`（诚实门决定性验证通过——findings/manualChecks 通道契约级不串、灰区真测不准如实降人工、不发明阈值，判为「不伪装自动覆盖」模范实现；四类 P1 fault 自动检出+定位、阈值逐项溯源受控路径、基线 0 自动+30 人工项、贴阈值不误报、v1.1.0 契约 additive 且 P0 零漂移），经 PR #15 合入（`b108c68`，CI 8/8）；@wenshu/report-checks 新增 P1 四规则（p1-heading-keep/p1-orphan/p1-widow/p1-sparse-page）+ P1 确定性运行器；承接提醒 PA-J1：人工核验项（30 项）须在 PA-12/PA-14U 人工清单真实承接，不得当作已自动覆盖（台账 [PA-08-followups](docs/audits/PA-08-followups.md)）；检出报告契约 additive 升 **v1.1.0**（新增 `manualChecks` 诚实门通道，冻结 1.0.0 保留 reader 双版本，P0 运行器继续产 1.0.0 零漂移）。诚实门口径（[ADR-0007](docs/adr/0007-PA-08检出报告契约v1.1.0与P1诚实降级.md)，探针实测钉定）：自动判定只覆盖确定性核心——标题同页 0 行后继（P1_HEADING_SEPARATED）、跨页段落页尾/页首行 < 冻结模板 orphans/widows=2、整页零内容（P1_EMPTY_PAGE）；标题 1..N-1 行灰区（PA-04 注册近似与模板 keepN=2 之差）与稀疏判定（模板无密度阈值定义）显式降人工（P1_HEADING_KEEP_REVIEW / P1_SPARSE_DENSITY_REVIEW 逐页密度证据，无任何自定义阈值）。签署基线 P1 自动发现=0、人工项有界钉定 30（标题灰区 10+逐页密度 20）；四类 fault 内存派生全检出+定位；阈值逐项 === 冻结模板值；贴阈值合法不报；决定性变异 5/5 变红。实施记录：[PA-08-implementation-record](docs/audits/PA-08-implementation-record.md)；审计：[PA-08-claude-audit-report](docs/audits/PA-08-claude-audit-report.md)。**PA-09/10 可按各自 DoR 与 PA-08 波次并行开工**（P1 分域与 manualChecks 通道已就位）。
- `PA-11A` 承接与注意：Claude 独立审计 `PASS`（页码红线独立重算——TOC 36/36 条标注页码 === 标题实际印刷页、页脚 20/20 printed=pageIndex+1，两遍渲染真收敛非硬编码，审计者自纠其探针启发式 bug 未误报；重签环境正确——参考 VM Win11+Edg/150.0.4078.83 产出、锚定提交 `3c33500` VM 内逐位核对、本机 Win10 只跑测试不签，第一轮 determinism 时间戳失败如实登记，VM 签署动作本身不可独立复跑标为审计边界归业主/VM 背书面；oracle 压印排除正当——font.tag 前缀单源常量非几何启发式，排除后引擎内容 21 页/387 行/2 图 0 失配，压印页码另由 36/36+20/20 背书；级联对 PA-05~10 全面重验非机械改数——新基线 P0+P1 0 自动发现、manualChecks 33、三套件 47/120/5 全绿、字体/lockfile/SBOM 零漂移；无 BLOCKER/MAJOR/MINOR），经 PR #20 合入（`3bf76fa`，CI 8/8）；文档契约 additive 升 0.2.0（toc 块，冻结 0.1.0 保留双版本 reader，`collectTocEntries` 收录规则唯一归口 document-model）；pdf-export 新增 pagination.ts（大纲 /Dest 测量+≤3 轮不动点收敛纯函数，任何猜测路径 fail-closed）与 stamp 三件套（逐字复刻零新增字形/模板派生位置/零交叠自检/封面豁免/strip 后缀锚定自核验，`STAMP_FONT_TAG_PREFIX` 单源常量）；**新签署基线 `5d7c06bc…0828`（21 页、目录独立成页、封面外全页页眉页脚压印）取代 `d18da69f…6dfd`**；13 项决定性变异全绿；承接登记 **PA-M1～M5**（人工项 32→33 即 PA-J1/PA-L1 口径更新、PA-11B 检查器开工、oracle 排除口径已知边界、VM 重签入口与残留、normalized 确定性判定口径），台账 [PA-11A-followups](docs/audits/PA-11A-followups.md)；PA-12 累积承接：PA-J1/PA-K1/PA-L1～L4/PA-M1～M5。设计：[ADR-0010](docs/adr/0010-PA-11A目录页码两遍渲染与页眉页脚压印受控补偿.md)；实施记录：[PA-11A-implementation-record](docs/audits/PA-11A-implementation-record.md)；审计：[PA-11A-claude-audit-report](docs/audits/PA-11A-claude-audit-report.md)。**PA-11B（目录/页眉页脚/页码检查器，串行）开工前置解除，可按 DoR 开工。**
- `PA-11B` 承接与注意：Claude 独立审计 `PASS`（实际页码红线命门独立猎杀——移「八、结论」标题 p15→p13 检出 `P1_TOC_PAGE_MISMATCH[印16 实14]`，actualPage 随移动标题变、TOC 标注不变，证 check 从标题实际渲染位置读实际页、绝不循环拿标注冒充；审计者自构第 8 蒙混路径（删同文正文标题）被堵——归属未把标题错配到其 TOC 条目冒充，fail-closed 降人工；双向对账/页脚一致性齐备、基线 0 自动/33 人工、诚实门实测、无 BLOCKER/MAJOR/MINOR），经 PR #21 合入（`f637b74`，CI 8/8 ubuntu skipped=0）；@wenshu/report-checks 新增三条 P1 规则（固定序尾追加，存量 11 条零改动）：p1-toc-reconcile（目录↔标题双向对账：缺项/多项/栏标题未归属降全域人工）+ p1-toc-page-match（实际页码红线：标注页码===标题实际印刷页，实际页只从证据读，任一侧不可判定降 `P1_TOC_PAGE_REVIEW`）+ p1-stamp-consistency（页脚 N===pageIndex+1 且 total===页数、页眉===short_title 声明值、位置逐页均匀带内、封面豁免，缺 headerText 诚实降 `P1_STAMP_REVIEW`）；p1-toc.ts 目录域分析单源（tocIndex 同源序号配对，禁几何启发式）；压印识别 isStampRun/selectStampRuns 与排除口径共用同一 font tag 前缀；**7 项决定性变异全绿**（含「actualPage=标注冒充实际」红线命门、「0 基页码→基线 20 页全红」物理页防线、「压印识别失效→全报缺页脚」）；全包 146/146；**PA-M2 随审计关闭**；承接登记 **PA-N1**（归属级联语义下删除类 fault 目录域降全域人工，PA-08 已审定语义非缺口，审计报告 §4 背书）与 **PA-N2**（人工项口径仍 33，headerText 缺省时须重计），台账 [PA-11B-followups](docs/audits/PA-11B-followups.md)。设计：[ADR-0011](docs/adr/0011-PA-11B目录页码与页眉页脚检查严重级与配对口径.md)；实施记录：[PA-11B-implementation-record](docs/audits/PA-11B-implementation-record.md)；审计：[PA-11B-claude-audit-report](docs/audits/PA-11B-claude-audit-report.md)。**PoC-A 检查族齐备（PA-00~11+PA-06B 全 PASS）；PA-12 汇总闸门开工前置解除，届时逐项复核 PA-A7/J1/K1/L1~L4/M1/M3~M5/N1/N2 真实承接（口径：自动检出只计 findings、manualChecks 不并入闸门统计）。**
- `PA-12` 承接与注意：Claude 独立审计 `PASS`（命门亲手伪造 5 种谎报——藏 P0 漏检自报 pass/豁免 P0/manualChecks 充数/选择性跳规则/瞒报误报，reader 语义全量重算逐一拒，评「诚实性最扎实的一棒」；锚定纪律：提交指纹逐位比对 gate-runner f652886/validate-gate-report 039c6ea/schema 0fec926 确认提交版=审过版，锚定分支复跑 pass 12/12 P0 4/4 FP 0、闸门 30 测试、全套件 176/176；无 BLOCKER/MAJOR/MINOR），经 PR #22 合入（`8da4277`，CI 两轮 8/8）；@wenshu/report-checks 新增汇总闸门——`runGate` validator runner（对正常样本+12 fault 样本跑 PA-07~11 全检查族真实产出，不重实现/不 mock，产物过自身契约 fail-closed）+ 门禁报告契约 v1.0.0（独占 schema；门槛 12/10/2 以 schema `const` 钉死；reader 语义全量重算——逐样本 detected 只从 findings 重算、误报===findings 数、executedRules 必须=全规则集−已申报豁免、P0 豁免契约级禁止）+ 12 fault 样本库（签署基线证据层确定性内存派生，P0 尺寸/越界/遮挡/内容+P1 标题/孤行/寡行/留白/表格/图片/目录页码/页脚页码逐域一例，PA-K1 图遮正文落 PA-07、PA-11A 实际页码红线标 6≠实 7）+ 人工清单 14 项（PA-A7/J1/K1/L1~L4/M1~M5/N1/N2 逐项 disposition，J1/M1/N2 relatedCount=真实 manualChecks 33）；本机实测 verdict=pass p0=4/4 detected=12/12 falsePositives=0；诚实性对抗 7 连（P0 豁免抛 GATE_P0_EXEMPTION_REJECTED、P0 漏检 GATE_P0_MISSED 判 FAIL、manualChecks 不充数、误报超限 GATE_FALSE_POSITIVE_OVERFLOW、P1 豁免记录理由如实付出检出代价）；决定性变异 5 连红；包测试 176/176。设计：[ADR-0012](docs/adr/0012-PA-12汇总闸门报告契约与门槛诚实性口径.md)；实施记录：[PA-12-implementation-record](docs/audits/PA-12-implementation-record.md)；审计：[PA-12-claude-audit-report](docs/audits/PA-12-claude-audit-report.md)。**PoC-A 核心闸门就位；PA-13（性能/重复/取消）、PA-14E/14H、PA-14U 可按各自 DoR 开工，汇入 PA-15 闸门报告与通过/降级决定。**
- `PA-10` 承接与注意：Claude 独立审计 `PASS`（转换红线命门经独立决定性验证——篡改图例/光栅化删成员/字体未嵌入分别必触发 P1_FIGURE_CONTENT_MISMATCH/FONT_NOT_EMBEDDED 不可静默、基线直渲无转换停止条件如实不触发；比例基线两图 paintBBox 比与源 viewBox 精确相等、宽减半即检出、无 viewBox fail-closed 降人工；分域零重判——figure 越界/遮挡仅 PA-07、PA-10 无任何几何码、fidelity 与 p0-content 逐图绑定 vs 全局存在书面证成；诚实门 legibility 仅人工绝不入 findings、基线 0 自动+2 legibility 与官方 figureReview=2 一致；严重级 P1 证成 sound；120/120、变异 8/8、CI 8/8 ubuntu skipped=0、SBOM 160 零新增、冻结物零漂移），经 PR #19 合入（`73e8ef7`，CI 8/8）；@wenshu/report-checks 新增 P1 图片域五规则（p1-figure-caption 题注同页模板门/p1-figure-source 来源紧随题注同页/p1-figure-aspect paintBBox 比 vs 源 viewBox 容差 0.01 ADR 溯源/p1-figure-fidelity 成员 run 逐字对账源 SVG=转换红线+字体嵌入/p1-figure-legibility 诚实门）+ 归属三重防线（文本对齐+阅读序+几何一致性，歧义 fail-closed 降 *_REVIEW）+ 文档侧 figure-source 声明式标记与 figureOrdinal/Aspect 绑定 + 零依赖 viewBox 白名单解析；报告契约保持 1.1.0 零漂移；承接登记 **PA-L1～L4**（人工项 30→32 即 PA-J1 口径更新、PA-12 汇总图片来源与 fault 样本归属、转换留痕管线侧承接、归属歧义边界），台账 [PA-10-followups](docs/audits/PA-10-followups.md)；PA-12 累积承接：PA-J1/PA-K1/PA-L1～L4，统一口径自动检出只计 findings、manualChecks 不并入，PA-12 送审时审计者逐项复核。设计：[ADR-0009](docs/adr/0009-PA-10图片检查严重级与比例容差及转换红线.md)；实施记录：[PA-10-implementation-record](docs/audits/PA-10-implementation-record.md)；审计：[PA-10-claude-audit-report](docs/audits/PA-10-claude-audit-report.md)。**PA-11（目录/页眉页脚/页码，串行）可按 DoR 开工；PA-07/08/09/10 汇入 PA-12 汇总闸门。**
- `PA-09` 承接与注意：Claude 独立审计 `PASS`（命门「结构误判致漏检」独立+CI 双证：归属三重防线 CI 逐条 gate ubuntu skipped=0、基线跨页表 violations=0 实测；两类 fault 独立复现——删 15 续页表头 run → `P1_TABLE_HEADER_NOT_REPEATED`@12、移 1 数据 run → `P1_TABLE_ROW_SPLIT`@11 精确到行；存活变异判真死码非缺口；停止条件如实不触发；严重级 sound、`*_REVIEW` 绝不入 findings），经 PR #16 合入（`d28deab`，CI 8/8）；承接登记 **PA-K1**（非发现）：`headerRepeatedOnPage` 窄巧合——续页首行数据与表头同文同列时文本+几何同构不可区分，「表头未重复」可能误判为已重复（潜在漏检），基线存在同列同值单元格故非纯理论；诉求 PA-12 风险册/人工清单显式承接，PA-12 送审时审计者复核（台账 [PA-09-followups](docs/audits/PA-09-followups.md)）；未关闭不阻断项：PA-A7、PA-J1、PA-K1。交付物：@wenshu/report-checks 新增表格归属命门模块（p1-tables/p1-table-pages：嵌套 ref 表发现 + 单元格归属三重防线——run 边界对齐/反向文档序游标/几何一致性，歧义 fail-closed 降 `P1_TABLE_STRUCTURE_REVIEW` 人工项）+ 2 条 P1 规则（`p1-table-header-repeat`：跨页表续页页首表头缺失 → `P1_TABLE_HEADER_NOT_REPEATED`；`p1-table-row-split`：同一行单元格分处页界两侧 → `P1_TABLE_ROW_SPLIT`）；停止条件判定不触发（探针实测签署基线唯一跨页表 p11→p12 续页页首 15 表头 run 真实重复、整行未切断，无需 PoC-A 风险评审）；签署基线 0 表格自动发现、PA-08 人工钉数 30 不回潮；两类 fault 内存派生全检出+定位；阈值逐项 === 冻结模板值；包测试 93/93；决定性变异 5 注入 5 变红，另 1 项（行内列 x 序校验）存活经证明被列带校验蕴含后删码。严重级证成（两码均 P1）与 DOM 对账设计：[ADR-0008](docs/adr/0008-PA-09表格跨页检查严重级与DOM对账归属.md)；实施记录：[PA-09-implementation-record](docs/audits/PA-09-implementation-record.md)；审计：[PA-09-claude-audit-report](docs/audits/PA-09-claude-audit-report.md)。**PA-10（图片）可按 DoR 在 v1.1.0 证据契约上继续并行开工，PA-11 串行；PA-12 汇总闸门届时须核 PA-J1/PA-K1 真实承接。**
- `PA-04` 承接与注意：Claude 独立审计 `PASS`（CSS 注入命门经 13 类载荷端到端对抗全拒、四处发射器变异全红、ubuntu/Windows 双端计算样式实跑），经 PR #10 合入（CI 8/8）；@wenshu/template-css 提供白名单 CSS 解释器供 PA-05 锁定环境导出 A4 PDF。观察项：h 级 +1 偏移（PA-03 结构后果）、近似/先行规则、浏览器未锁定（PA-05 接入点）。
- `PA-03` 承接与注意：Claude 独立审计 `PASS`（无发现；ubuntu CI 9.45s 与本机 Windows Chrome 4.0s 双端真实浏览器同路径证真、五处变异独立复跑全红、303 节点逐字对账 deepEqual、注入 payload 全转义），经 PR #9 合入（CI 8/8）；@wenshu/report-render 提供语义 HTML 渲染与真实字体门禁（零新增第三方依赖），观察项：浏览器版本未锁定（G1-14W/PA-05 前置接入点）。
- `PA-01` 承接与注意：Claude 独立审计签署 `PASS`（无未关闭 BLOCKER/MAJOR）——首审 `FAIL` 唯一阻断 PA-A1 经仓外变异矩阵 8/8 全红关闭，PA-A2/A3 独立复验通过（CRLF 未归账字符 0、CRLF/LF 文档 JSON 一致）；签署生效条件已达成：远程 run `30067276449`（ubuntu-24.04）8/8 success 且与必需检查同名同数，contracts job 日志逐条复现 19/19，`.gitattributes eol=lf` 排除检出行尾分叉。复审新增 PA-A8（控制字符与行中孤立 `\r` 进入 paragraph.text）已登记 followups。**PA-02/PA-03 放行可按波次并行开工：PA-A5/A6 决策前置已满足——[决策 #8/#9](决策记录.md) 均获批准且实施已获 Claude 独立审计 `PASS`（签署以远程 CI 22/22 复现为生效条件；变异矩阵含 Claude 补做的 5a/5b 全部判定一致）。审计新增 PA-B1（越根判定误拒 `..foo`）已顺手修复待复核（23/23、变异自证变红），PA-B2 为观察项不整改。实施期审查项：核真实调用点传入公共根而非源文件目录（当前唯一生产调用点 parse-fixture 传 fixtures 公共根）。PA-A8（连同 PA-A4 BOM）已修复待 Claude 审计（[PA-A4-A8-remediation](docs/audits/PA-A4-A8-remediation.md)：控制字符 fail-closed + BOM 剥离计账，27/27、两处变异自证变红、verify exit 0），PA-03 消费文本渲染前须获签署。**
- `PA-02` 承接与注意：Claude 独立审计 `PASS`，经 PR #8 合入（CI 8/8）；@wenshu/template-map 提供受控模板模型（文档契约版本绑定 + G1-13 字体逻辑注册绑定，只做声明式绑定），供 PA-04 解释器消费。
- `G2-03` 承接与注意：**核心/工具/壳分层门禁**。Claude 首审 `CONDITIONAL PASS`（MA-01：L3 平台许可无差别，`arkweb-shell` 可导入 `electron`）后复审 `PASS` 关闭，59 条独立探针零失败。归属表 29 个 workspace 分 L0/L1/L2/L3+web，平台命名空间按 L3 条目登记、未登记即 fail-closed；覆盖 ESM/re-export/动态 import/CJS `require()`/`import = require`，相对与绝对路径解析到所属包，`@ohos.`（系统模块）与 `@ohos/`（ohpm 包）两命名空间一并禁。**承接：`test/`+`scripts/` 只放宽 `node:*`，平台导入仍仅 L3**；Hvigor 构建脚本与 `probes/` 为封闭排除项，不得扩大。跟进项见 [G2-03-followups](docs/audits/G2-03-followups.md)（MI-04：Capacitor 等无壳平台当前不覆盖，宪法 11 未被完全机械化）。
- `G2-04` 承接与注意：**路线图不变量门禁**。Claude 首审 `CONDITIONAL PASS`（MA-01 完成记录中的可证伪声明、MI-01 消费者列修正方向）后复审 `PASS` 关闭，46 条独立探针（首审 23 + 复审 23）零失败。确立**三类权威手写源**（§4~§8 依赖列、`R-*` 标注、§3.1 台账状态与证据链接）与四类派生校验对象（§3 关键路径、§9 波次、§10 矩阵、消费者列），10 条判定接入 `pnpm verify` 与 CI `static`；解析 fail-closed（六项计数对照登记下限，退化即失败），例外仅存于封闭登记表。**承接三条**：① 签署后必须**当轮**补台账条目，否则检查 8a 拦（本任务在自己身上现场演示过一次）；② 消费者列与依赖列冲突且散文有证据时须先裁定哪侧为真，不得默认删派生侧（[ADR-0024 增补](docs/adr/0024-G2-04路线图手写真源收敛与不变量门禁.md)）；③ 凡涉文件体量声明直接引用门禁输出，不自行计数。
- `G1-15` 承接与注意：Claude 首审 `FAIL`（SM-01 MAJOR）整改后复审 `PASS`，SM-01/SM-02 关闭、CR-01 已签署关闭；SBOM 以冻结 lockfile 为真源（147 包、跨平台字节一致、33 条覆盖经 npm 核验）；许可政策门禁与 MPL/Python/BlueOak/0BSD 书面结论见 [supply-chain](docs/supply-chain.md)；SM-03（MPL 措辞泛化）已随文档维护修复；首个 ubuntu 远程 CI 矩阵（run `29802405342`，覆盖 `1a717b6`）8/8 成功，SM-01 跨平台确证完成。
- `A-02` 承接与注意：经 PR #55 squash 合入（main `21d14e8`，main 验证 run `30970309312` 9/9）；host-contract 协议 0.3.0 冻结 `file.import.select`（①-a 输出无路径/①-b additive 新 schema 文件/①-c 选择器只在 L3 壳），FileGrant 一次性 consume-on-read + 漂移 INTEGRITY_FAILURE，`importMarkdownProject` 执行器（CONFLICT 拒并、取消零残留），ux-state `./data` 纯数据子路径 + 四态流程控制器（未发明第 13 态），web bundle 145,462B→12,351B ajv=0，E2E 六子场景原件 sha256 全程不变。设计：[ADR-0029](docs/adr/0029-A-02导入入口file.import.select冻结与覆盖落盘裁定.md)；实施记录/审计/followups 见 docs/audits/A-02-*。**承接**：① MINOR-3 归口业主已裁定 A-01 契约加固（12 态 requiredPresentation/a11y/label 逐字钉定，**只落契约测试层 ux-states.contract.test.ts，不得复制进消费者**——内容钉进消费者即成第二份真源），登记 [A-01-followups #5](docs/audits/A-01-followups.md)；② permission-denied 原件不变仅 ubuntu CI 证据（本机特权令牌绕过 ACL deny，诚实 skip 正确），业主已签收该证据等级；③ 本机 Node v24.13.0 ≠ 参考 24.17.0 归口 G1-14。**长期踩坑（本棒实证，跨角色适用）**：a) 断言前先确认 API 契约——审计 MAJOR-1 与实施者第一轮 verify 漏判同源于「拿未经确认的调用结果当结论」（不存在的选项键被 JS 静默忽略、管道吞退出码），builder 现已键/值双轴 fail-closed，shell 侧一律 `set -o pipefail` 或显式取退出码；b) 测试文件必须带分层后缀（`.unit/.contract/.integration/.e2e.test.ts`），test:layers 闸在 verify 内；c) file-size 硬闸生产 400/测试 500 行，加测试逼近上限时先量行数；d) 提交信息含反引号会被 bash 当命令替换，message 用单引号包裹。
- `A-01 契约加固`（A-02 MINOR-3 remediation）承接与注意：Claude 独立审计 `PASS`（自建 9 格结构化变异按 JSON 路径注入全精确命中钉定测试、恒真反向证据独立复现、基线表两侧抽样 8/8 与实施口径一致、签署基线复核 packages/ 零漂移），经 PR #56 squash 合入（main `2499bfd`，main 验证 run `30979875627` 9/9）；`ux-states.contract.test.ts` 新增单一字面量表 **12 态 × 5 用户可见字段**（label / requiredPresentation 逐条按序 / a11y.textEquivalent / a11y.focusEntry / cancelable）逐字钉定（478 行，file-size 硬顶余 22 行），冻结 `states-1.0.0.json` 零字节、消费者零复制；61 格变异矩阵全红定位于钉定测试 + 恒真反向证据，实施记录/审计见 docs/audits/A-01-minor3-*。**承接**：① **MINOR-5（transitions 边集未锚定）单独小棒排期，不并入已签署基线**——删边不破坏可达性时全仓无红（审计者实测删 importing→crash-recovery 后 41/41），归口 A-01 契约加固，登记 [A-01-followups #6](docs/audits/A-01-followups.md)；② 防静默改写机械化覆盖的对外口径 = 12 态 × 5 用户可见字段（连同既有 forbiddenSemantics / noColorOnly / 结构不变量），**显式排除 transitions 边集**——MINOR-5 关闭前任何文档不得宣称 1.0.0 内容+关系全维度覆盖；③ 审计报告文件名 `A-01-minor3-claude-audit.md` 刻意不带 `-claude-audit-report.md` 后缀（本棒无台账行，改名即触发 G2-04 检查 8a 硬失败），不得「顺手规范化」。**长期踩坑（本棒实证）**：a) 门禁只查仓内文件——审计报告未提交时 quality:check 依旧 passed，followups「来源」引用即成死链且无检查兜底，**签署报告必须随 PR 落盘**（A-02 §7 bbe860d 同款先例）；b) 变异证据要看归因——条目删除类红在模块加载期 Ajv 自校验（UX_STATE_SCHEMA@/states），钉定断言的论域是已加载状态集，二者不可互冒充；c) node:test 默认 spec reporter 的失败行是 `✖` 前缀，变异脚本解析勿只认 TAP `not ok`；d) Windows 下 `new URL(...).pathname` 得 `/D:/...` 会被 Node 当相对路径拼出 `D:\D:\...`，一律 `fileURLToPath`。
- `A-03` 承接与注意：Claude 审计 `PASS`（首审 CONDITIONAL PASS 两项 MAJOR 修复后复审签署），经 PR #57 squash 合入（main `9d8fce8`，main 最终验证 run `31058691089` 9/9）；editor-transactions additive 8 结构命令（PB-02/PB-03 已签署面零改动）+ apps/web 工作区（DOM-free controller 唯一写边界、生产构建剔除 12.58kB）+ `wenshu.project.document.read` 只读通道 + 键盘 E2E 6/6（sendInputEvent 可信管线）+ 30,245 字 fixture 采样 p95 ≤72.1ms。设计：[ADR-0030](docs/adr/0030-A-03结构确认口径与A-05分界及停止条件可判定定义.md)；实施记录/审计/followups 见 docs/audits/A-03-*。**承接**：① Win11 参考机器性能复跑未兑现——30k 字预算证据当前仅 Win10/Node v24.13.0，业主已签收该证据等级，签署轮须兑现（[A-03-followups #3](docs/audits/A-03-followups.md)）；② 产品壳 main.cjs 同为「先 loadFile 后注册通道」形态且窗口更宽，归口 PB-10/A-02 通道层最迟 A-12 前（#1）；③ transactions.ts 398/400 只剩 2 行余量，扩逻辑先提取辅助模块（#4）；④ A-02 happy 路径 wireProgress 遇「终态后迟到进度事件」即红的存量竞态（本棒 CI 轮暴露、重跑绿），登记 [A-02-followups #5](docs/audits/A-02-followups.md)；⑤ env:record 裸跑默认落点=签署基线的协议陷阱归口 G1-14。**长期踩坑（本棒实证）**：a) **守卫判据不得来自被守卫者的自我申报**——MAJOR-2 根因即 session 信任操作自报 removedNodeIds，修法是从 command+命令前文档独立计算许可集（computeExpectedRemovals），unknown 目标给 [] 让操作自行 fail-closed；b) 覆盖缺口会让真实违规跑遍全套件全绿——仓内列表最长 2 项时「多删一项剩一项」的违规分支根本进不去，审计探针靠自建 3 项 fixture 才显形；c) **flake 归因要拿到错误文本再写故事**——§6.7 原把注册时序竞态写成「高负载末键迟到」还加了末尾落定窗，真正窗口在启动端；拿不到失败输出就如实写「无法回溯确认」，不补说得通的故事；d) `pnpm env:record` 的 `--out` 只改文件名不改目录，批次前裸跑会覆盖 reference-machine 签署基线——任何采样批次先核对落点；e) Electron 方向键 sendInputEvent 用 Chromium legacy 名（Up/Down/Left/Right），`Arrow*` 名称 DOM key 得空串；f) 审计报告与台账行须同一提交落地，缺一路径 G2-04 检查 8a 硬失败。
- `A-04E` 承接与注意：Claude 独立审计 `PASS`（provenance 专项——仓内 `462f460` 探针与 VM 实跑 `74be468` 逐行对账成立；十轮从原始 evidence 重算：残差 0.27–0.38ms/极差 1.05×/双标定门读 calibration.txt 原件/anchor=`770dfb0`），经 PR #58 squash 合入（main `8f35d4a`，main 最终验证 run `31149958521` 9/9）；pdf-export 获 `renderBreakdown` 永久公开面 + `tools/a-04e/` VM 工具链 + run-8 清洁批次（批次证据 `artifacts/perf/2026-08-06-A-04E*/` 本地留档不入 git）。**承接**：① 阶段二按[决策 #19](../决策记录.md)——出口 1 授权实现+复测，**范围含增量架构**（9390>8000=+17.4%，持久会话单独不达标，ADR-0032 §6 增补）；② +8.4% 绝对水平偏移未解释，run-8 绝对数值与 PA-13 不可互换引用；③ run-6 漂移批不可引用（export 翻面=漂移伪影）；④ 签署带 [20553.4,24300.2] 一个数字未动；⑤ PR #58 CI 首跑 contracts 红一次（`cancellation.render.test.ts` 孤儿 profile 目录断言 `wenshu-render-snuYvK`）——同 tree 本地 verify 绿、head 仅两 docs 文件、`rerun --failed` 重跑绿，判 flake，PA-13 取消域清理竞态留作观察项。**长期踩坑（本棒实证）**：「两 PR 编辑区不重叠」式判断必须实跑合并验证（scratch worktree 或 `git merge-tree`）——ci-01 与 a-04e 在 AGENTS.md 同一锚点追加即冲突，区域不重叠 ≠ 无冲突。
- `A-04E-2a` 承接与注意：Claude 两轮独立审计 + 复审 `PASS`（首轮 CONDITIONAL PASS 三项 MINOR；复审由审计者把五条变异改进真实 src 全量重放、一对一打红对应用例后关闭 A2A-F1/F2/F3，实施者未自行关闭任何一项），经 PR #64 squash 合入（main `8b6b8c0`，main 验证 run `34539051926` 10/10）；决策 #21 D1′ 落地：compose 期 `888` 占位 + 单遍渲染 + 大纲测量 + 字节级原地回填（`backfill-toc.ts` 主入口 + shared/scan/pages/geometry 五模块，file-size 门纯搬迁拆分），`resolveStableTocPages` 退役；R5 持久会话接缝（管线 finally 绝不 close 外部会话，取消以 PDF_EXPORT_CANCELLED 至终态且同会话立即可再导出）；**8s 全量重排预算在持久会话稳态形态达成**——run-2a-9 formal p95=5352.8046ms ≤ 8000（余量 33%），run-2a-8 CLI 冷启形态 p95=18409.5 为任务书 §5.1 预告的结构性 not_met 形态如实登记；两批 golden 等价门 21 页 11876 run 零差异、确定性两口径 10/10、签署基线与签署带 [20553.4,24300.2] 零改动；批后标定破下限经决策 #23 书面豁免（仅此一批）+ 决策 #24 追加更正（修正幅度可复现口径=最苛刻 +30.00%，修正后 ≈6958.6ms 仍达标，#23 原文不动）。实施记录/审计见 docs/audits/A-04E-2a-*。**承接**：① A2A-N5——`backfill-toc-mutation.unit.test.ts` 499/500 行，下轮触碰先拆再扩（台账 [A-04E-2a-followups](docs/audits/A-04E-2a-followups.md)）；② A2A-N6——recal-x1/x2 实际时间戳 2026-09-07T04:16Z，「9/6 手动复测」系沿用 #23 日期标签的措辞非数据问题；③ A2A-N2——取消断言② 2s 边界余量 ~93ms，重负载机器可能误红（预算语义非检出缺口）；④ A-10P 备案——持久会话导出 PDF 的 node ID 不从 0 起（会话级计数器），非缺陷防误报；⑤ A-04E-2b 裁定链已落（决策 #25：D4=一次性验证工装、缓存设计基线 ~5.1–5.4s 钉定）——其承接见下方 `A-04E-2b` 条目。**长期踩坑（本棒实证）**：a)「VM 离线」是错误假设——Default Switch NAT 通外网，Update 能把签署环境 Edge 150→152，链门必须含 NIC 断开硬检查（快照回滚会把连网状态带回来）；b) robocopy 跨介质必加 `/XJ` + `MSYS_NO_PATHCONV=1`——pnpm store `v11/projects` 是回指符号链接，裸 /E 递归爆 40GB、/MIR 越界清空邻仓；c) pnpm 三盲区——install 可 TimeoutError 但 exit 0（必须 `--offline` 复装终验）、「Already up to date」不重建工作区链接（跨介质恢复后清 node_modules 重装）、无 TTY 时 fetch 中止（fetchroot 法：清单+lockfile 拷贝目录 CI=true install）；d) 开机期 ≠ 稳定态——同机标定批前 31.7s vs 稳定态 18.7s，批次必须含沉降窗口（900s）否则双向出带；e) corepack 按 cwd 解析 packageManager 钉版，批次脚本先 Set-Location 到仓根。
- `A-04E-2b` 承接与注意：增量分页架构（[ADR-0033](docs/adr/0033-A-04E-2b增量分页架构页槽缓存与哨兵级联.md) 页槽缓存+哨兵级联+锚定页码更新+诚实回落）实施完成，本机 verify exit=0、包测试 115/115、变异自证 M1–M5 全红回退、判定器 `verify-a04e2b-harness.mjs`（G1–G6）经三变异实证有牙；run-2b-5 VM 批次（锚 `dfeb13e`，zip sha256 `96511213…f5427` 双向核验）：①真增量/③不冻结/④等价达成，**②1s 局部预算未达成 p95=4370.7ms（决策 #26 豁免翻正批后标定后正式成立；业主 2026-09-16 裁定：永久登记未达成、任何后续裁定不得追认）**；取消结案稳态 3.7–4.1s > 2s 预算，run-01 冷启离群 266.7s 登记复现探针。裁定链：决策 #25（开工/D4 工装）→ #26（批后标定破下限豁免，同 #23 形态）→ #27（②不追认 + P4 双层预览须走 G0 级预算修订 + P6 取消 target 隔离授权独立成棒 + 立即送审 + P7 首窗放宽登记）。**承接**：① P6 独立成棒（验收一条 2s）先于 2c；② 2c 方案表须含 P7（zone-2 级联率实测 10/10，首窗放宽一页 p95 4370.7→~2.5s，等价性论证不变）；②-b **G0 级预算修订已批准**（[决策 #29](../决策记录.md)，2026-09-19；[ADR-0035](docs/adr/0035-G0预算修订建议局部编辑更新拆分两条命名预算.md)）：新增两条分别命名预算——局部编辑交互反馈（HTML 预览层）p95 ≤1s / 局部编辑页槽精确更新（PDF 预览层）p95 ≤5s（X 按选项 A=已签署测量+余量立账），原「≤1 秒」行保留并标注永久 not_met、不追认 ②；**2c 立项冻结解除**（仍须独立 DoR+双向审查+独立审计，层 1 ≤1s 为架构承诺型预算，2c 首批实测超标须如实登记 not_met）；PR #66 中 A-04E-2-P6 条目④的 2c 冻结措辞随本条被取代；③ [分析文档](docs/research/A-04E-2b-1s预算超限归因与加速路径.md) §0 更正记录——初版「整份 print-layout 主导」归因被 VM 两点线性分解（固定 ~509ms+边际 ~501ms/页）推翻，本机地板读数（~60–90ms）与 VM 矛盾且自相矛盾，不得承担归因；④ 批次踩坑：`Restart-VM -Force` 断电式重启丢重启前改名/写入（批次「证据目录已存在即拒跑」守卫当场拦下未混证）——VM 内一切变更优雅关机前必须重新核验；宿主 Defender 已按业主批准排除 `D:\VMs`+vmwp/vmms（未排除时标定系统性偏高 +0.2%～+14.5% 连续出带）；PS1 含 CJK 必须 UTF-8 BOM（既有教训本棒再次实证，无 BOM 时 GBK 解码把凭证行咬成 null）。**Claude 独立审计 `PASS`**（首审 CONDITIONAL PASS 三项 MINOR；复审 A2B-F1/F2/F3 全部关闭，审计者亲手重放：F1 收紧键退回旧宽口径恰新增决定性用例变红+1806 run 收紧零误报独立重验、F2 五条变异全红——含 y 轴误读根因证真与「跳过回填红于 oracle 对账」坐实槽位↔整份全等承重、F3 决策 #26 D3 四条边界逐字核对），经 PR #65 squash 合入（main `0beb932`，main 验证 run `35189804134` 10/10）；修复顺带关闭潜伏缺陷 `locateTocPageIndex` 字距拆字盲区（签署语料「目录」被拆成单字 run 序列，旧单 run 相等匹配永远定位不到目录页，批次未触发只因 30 条编辑全部零漂移）；修复后包测试 124/124。报告命名约定 `A-04E-2b-claude-audit.md`（不用 `-audit-report` 后缀——G2-04 检查 8a 对无台账行的该后缀硬失败）。实施记录/审计：docs/audits/A-04E-2b-*。
- 长期踩坑（A-04/A-04E 任务书起草轮两轮实证，跨角色适用）：**落笔前的验证必须覆盖断言的全部内容，部分验证 ≠ 验证**。① 指令是可执行对象，不是叙述——任务书/规程中的每条防护指令必须先当命令真实跑一遍（反例：`env:record --out` 只验证 flag 存在，实则 `record-args.ts` 的 `OUTPUT_FILE_PATTERN` 拒绝任何含 `/` 的值、`record-environment.ts` 输出目录硬编码 `artifacts/reference-machine/`，照做会复现 A-03 MAJOR-1；核验基线目录遗留必须用 `git status --short` 而非 `git diff`，untracked 对 diff 不可见）。② 全称/极值断言（「第一个/唯一/总是/不可能」）证伪成本极低（一条反例即倒），落笔前必须反查**全域**而非当前上下文（反例：「第一个必须在 Win11 VM 产出证据的任务」只回查了 A 系列上下文，PA-05/PA-13 即是反例，见 reference-machine §2）。与「断言本身是被审对象」同一条纪律的另一面。③ 涉及虚拟机/磁盘/文件系统的**保护性操作，顺序本身就是语义的一部分**：Hyper-V 差分盘链上「先打检查点再注入」会把写入落进父盘、扯断子盘链（0xC03A000E）——正确顺序是**先改后备**（注入 → 检查点 → 开机），或挂载时认准检查点之后新生成的活动子盘；检查点防「写坏内容」，防不了「写错盘」。配套反例（同一轮）：robocopy 跨 VHDX 挂载拷贝必须 `/XJ`，junction 跟随会把 525MB 炸成 13.4GB。④ 无人值守入口（Startup/计划任务）的**重定向目标可写性本身就是入口契约的一部分**：`cmd > C:\x.log 2>&1` 写 C:\ 根会被 UAC 拒（根目录建文件需提权），重定向失败整条命令**静默死亡**——无日志、无输出、无关机，与「入口从未运行」在产物层不可区分；鉴别靠离线取证 Prefetch（`Windows\Prefetch\*.pf` 最后运行时间证明 cmd.exe 起了而 powershell.exe 没起）+ Security 4624 登录时点。修法：日志落已证明可写目录并逐项在盘上核验；教训：入口改动后第一轮必须按「零产物=先怀疑入口死亡形态」排查，不是先怀疑脚本内容。⑤ **性能参考机上的保护性快照会改变被测配置本身**——每个检查点加一层差分盘，读盘未命中就要多穿一层；六轮事故重试串出 7 层后，测量结果与「深度 1 时签署的带」不再可比（门没有误报、机器没有漂移，是被测对象被改了）。测量前必须把链塌回签署时的层数；「保护」与「可比」在参考机上冲突时可比优先，回滚锚保留一个足够，不要每轮一个。修正测量配置 ≠ 调整阈值——签署带一个数字不动，测不进带就重签基线等于把签署值变成目标值。
- 长期踩坑（CI-01 审查轮实证，跨角色适用）：**「prettier 干净」不得对 `.md` 使用**——`.prettierignore:10` 排除全部 markdown，`prettier --check <某个 .md>` 是静默空转，其「通过」不构成任何证据；本仓 markdown 目前无任何格式门禁（业主 2026-08-07 已裁定为有意排除——中文长表格重排破坏可读性，`.prettierignore` 排除行上方已就地注释理由，移除前须业主裁定）。与「能静默空转的门不是门」同一条，只是这次空转的是校验工具本身；探针必带对照组——配一个被 prettier 覆盖的 `.ts` 对照文件一跑即现形。历史报告/任务书/台账中所有对 `.md` 的「prettier 干净」表述应视为无效（不表示那些文件有问题，而是当时手里没有任何证据）。

## 推送节奏（2026-07-23 起生效）

本节约束的是**推送远程仓库**；本地提交不受限，应照常原子化、频繁进行。成本依据：每次推送/PR 都会触发 9 作业 ubuntu-24.04 CI 矩阵（PB-12 起新增 e2e 真 Electron 作业），消耗 Actions 分钟额度，过频推送会快速消耗远程资源。

默认：不逐提交推送；纯文档、台账、审计报告类变更累积 10–20 个再推。以下时点必须推送，不看累积数：

1. **交独立审计之前**——审计签署的基线必须已在远程且经 CI 验证；未推送的只能签“本地成立”。
2. **每个原子任务完成时**——保证 CI 失败可按任务边界定位，无需在大批提交中二分。
3. **触碰跨平台敏感面时立即推**——SBOM/lockfile/依赖、workflow、路径与大小写逻辑、字体/fixture 字节。

前置条件：推送前本地 `pnpm verify` / `ci:verify` 必须绿。

告诫：本地 CI 绿是必要条件，不是充分条件——本地 win32、远程 ubuntu-24.04，二者可分叉。依据：SM-01（本地 185/185 全绿，ubuntu 上必然 SBOM_DRIFT），因当时累积 22 个提交未推而长期未暴露，最终判 MAJOR/FAIL。

## 文件与代码规则（进入 G1 后生效）

- 所有手写 TypeScript 生产代码和测试代码禁止显式或隐式 `any`；不可信输入从 `unknown` 开始，经 schema、类型守卫或断言函数收窄。
- 第三方声明和自动生成文件中无法控制的 `any` 不得穿透适配边界进入项目公共类型；禁止用 `as any`、`@ts-ignore` 或降低 strict 规则规避类型设计。
- 手写生产代码达到 300 行预警、超过 400 行 CI 失败。
- 手写测试代码达到 300 行预警、超过 500 行 CI 失败。
- 按领域、功能、职责、数据/副作用边界或测试行为拆分；禁止机械切片和 `utils/types/helpers` 大杂烩。
- Web 核心不得直连平台 API；跨端能力只经 host 能力注册表。
- 代码、类型、API、模板、文件格式和数据库结构以版本化契约为先。
- 生成物、lockfile 和迁移历史不得手工编辑。

## 测试底线（进入 G1 后生效）

- 单元测试可 mock 边界；集成测试不得 mock 被集成的核心依赖。
- 数据库集成测试使用真实生产同类引擎、真实迁移和隔离测试库/schema。
- E2E 穿过真实用户入口、可部署构建、服务端和真实数据存储。
- 并行测试必须隔离数据库、schema、目录、端口、账号和外部额度；不能隔离就串行。
- flaky 不能靠重试变绿；失败保留日志、截图、trace 和随机 seed。

## 台账证据指纹规则

- 路线图 §3.1 台账中的 PR/commit 证据指纹，必须指向 `main` 历史上真实存在的合入提交。
- 若 PR 采用 squash 合并，不得引用已被丢弃的分支侧提交 SHA；应改用 `main` 上生成的 squash 合入提交。
- CI run 号应为该任务最终验证远程矩阵的 run（通常为合入前最后一轮 PR run），确保从干净克隆可核对。

## 绝不触碰

- 不改写冻结纲领来容纳新想法。
- 不提交或展示密钥、真实用户资料、生产数据和未脱敏日志。
- 不在第一阶段模板中执行任意 JavaScript。
- 不引入 GPL/AGPL 依赖或来源不明的字体、图片、模型、数据集。
- 不绕过 G0、GR、CI、审批和发布闸门。
- 不替业主执行付费、发布、数据删除/导出或其他需明确批准的动作。

## 命令

Windows 会话先按 [开发环境基线](docs/development-environment.md) 将 D 盘 Node/pnpm 与缓存路径置入环境；不得直接使用本机旧全局 pnpm。当前唯一权威命令为：

- `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store`：冻结安装。
- `pnpm dev`：启动最小 Web 开发入口。
- `pnpm config:check`：运行 dev/test/staging/production 配置契约、快速失败和脱敏测试。
- `pnpm contracts:check`：检查文档/模板/Host schema 与生成类型漂移，并运行共享输入安全运行时及合法、非法、安全和生命周期 fixture 契约测试。
- `pnpm fixtures:check`：校验 PoC-A 冻结清单、7 个原件字节及隔离复制/证据契约；原件不一致立即失败。
- `pnpm fonts:check`：校验 PoC-A 固定中文字体的官方清单锚点、OFL 许可证、三个 OTF 字节身份，并运行真实文件系统篡改/链接反测。
- `pnpm environment:check`：校验已提交参考机器证据符合契约且冻结输入锚点与当前 fixture/字体锚点一致。
- `pnpm supply:check`：重建 SBOM 并与已提交清单字节比对、执行许可政策门禁、校验声明依赖与已安装版本一致。
- `pnpm sbom:build`：重建 `sbom/sbom.json`（确定性输出；仅在依赖树变更后运行并提交）。
- `pnpm env:record`：在 Windows 参考机器上采集机器证据；默认写 `environment.json`（Win10 基线），`pnpm env:record --label <label> --out <file>` 登记其他环境（如 `environment.win11.json`），非 Windows 平台 fail-closed。不得在 Win10 上使用 Win11 标签伪造证据。
- `pnpm test:layers`：审计所有测试文件是否显式标注 unit/contract/render/integration/e2e 层级。
- `pnpm test:unit` / `test:contract`：运行已登记的单元/契约测试。
- `pnpm test:render` / `test:integration` / `test:e2e`：运行对应已登记测试；没有真实用例时报告 `not-registered` 并以非零退出，不代表通过。
- `pnpm test:foundation`：运行测试层级审计与并行隔离设施单元反测。
- `pnpm format:check` / `pnpm lint` / `pnpm quality:check`：分别检查格式、静态规则和 any/抑制指令/文件体量/typecheck 覆盖。
- `pnpm ci:job <name>` / `pnpm ci:verify`：运行单个同构 CI 作业或最多 4 路并行的 9 作业本地矩阵；不替代串行完整 `verify`。
- `pnpm secrets:check` / `pnpm licenses:check`：扫描已跟踪/暂存秘密与实际安装依赖的许可证快速阻断项。
- `pnpm generated:check`：动态执行全部工作区包已登记的生成漂移检查。
- `pnpm typecheck`：严格类型检查。
- `pnpm verify`：唯一完整入口；串联全部质量、测试、生成、类型和构建门禁。
- `pnpm build`：生产构建。
- `pnpm --filter @wenshu/web build:test`：test 配置构建。
- `pnpm --filter @wenshu/web build:staging`：staging 配置构建。
- `pnpm verify`：当前 G1 统一验证入口（配置契约 + 文档契约/漂移 + strict typecheck + production build）。

配置规则见 [环境配置基线](docs/configuration.md)。真实 `.env`/`.env.*` 不得提交；任何新 `WENSHU_*` 字段必须先更新 schema、解析器与契约测试，错误日志只能记录字段名，不得记录原始值。

文档对象规则见 [v0 文档对象契约](docs/document-model.md)。`packages/document-model/schema/document.schema.json` 是类型真源；修改 schema 后必须重新生成并运行漂移检查，禁止直接编辑 `src/generated`。

模板规则见 [v0 模板 DSL 契约与安全边界](docs/template-dsl.md)。模板只有声明式白名单数据能力；不得加入函数、脚本、文件路径、网络、系统或自声明 capability，v0 迁移规则必须为空。

平台能力规则见 [v0 Host 能力与生命周期契约](docs/host-contract.md)。Web 核心不得 import 或直调 Electron、Node 文件 API、ArkTS 等平台接口；文件位置只经 Host 的 grant/handle 表达，禁止任意绝对路径穿透。

项目与知识包规则见 [v0 项目、知识包、语义审计与兼容契约](docs/project-contract.md)。真源 entry 必需且不可重建；派生 entry 非必需且必须可重建。语义审计不得承载正文、prompt、密钥、编辑器事务或 CRDT update；数据库表结构不得成为开放交换格式。

后续渲染、PDF 和打包命令将在对应原子任务建立后追加；不得从聊天记录猜命令或用临时命令冒充权威入口。
