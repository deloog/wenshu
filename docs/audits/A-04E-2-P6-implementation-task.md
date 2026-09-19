# A-04E-2-P6 实施任务书 · 取消 target 隔离（closeTarget）

> 起草角色：审计者（依据[决策 #27](../../决策记录.md) 承接：「P6 棒任务书由审计者起草」）。
> 起草日期：2026-09-17。本任务书全部机制性断言在落笔前已逐条当命令/原文复验；
> 实施者开工前仍须按双向审查纪律（业主 2026-08-07 裁定）逐条复验，发现实质错误退回起草者修正后方可开工。

- 任务 ID：**A-04E-2-P6**（独立成棒，先于 2c；2c 未立项，不属本棒）
- 授权来源：决策 #27 D3 逐字——「取消 target 隔离（closeTarget）授权修复，**单独成棒、先于 2c**，验收标准就一条 2s（取消后 2 秒内停止消耗）；不并入 2c——2c 形态取决于 D2 流程周期，P6 现在不阻塞，并入还会毁掉归因性。」
- 预算锚点：[performance-budgets.md §稳定性预算](../performance-budgets.md) 原文：「批量 AI/分页任务都有超时、取消和资源清理；**取消后 2 秒内停止继续消耗主要计算资源为目标**。」
- 并入验收设计的审计建议：**A2B-N2**（[A-04E-2b-claude-audit.md](A-04E-2b-claude-audit.md) §2.4）——判定器 `verify-a04e2b-harness.mjs` 的 G6 只校验 `settleAfterClickMs` 为有限数（`:180-185`），不校验 2s 预算，run-01 的 266745.4ms 照样过 G6，**取消结案回归目前无任何自动门**；本棒把 2s 作为判定器条款落地。

## 0. 已核实的机制事实（起草依据，非推测）

1. **现状取消路径**：取消原语 `assertNotCancelled`（`packages/pdf-export/src/cancellation.ts:14-24`）只在管线阶段边界生效（`render-full.ts:67/98/120`、`pipeline.ts:104/110/186`、`incremental-controller.ts:161/228/294`），**在途 `printToPdf` 未被 signal 接线**，结案耗时含在途打印剩余时间——VM run-2b-5 实测取消结案稳态 3.7–4.1s（决策 #26 D2 登记超 2s 预算）。
2. **不接线的机制根因**：`packages/report-render/src/browser.ts:203-215` 的会话级 abort 是**永久锁存**（abort 后该会话 `send()` 一律拒绝，`:250-252`），挂会话级 signal 则 abort 后整会话不可复用，与工装 5c「同会话复跑」冲突（工装选型说明原文：`packages/pdf-export/scripts/a04e2b-harness-cancel.ts:13-16`）。
3. **授权目标形态**（[分析文档 §P6](../research/A-04E-2b-1s预算超限归因与加速路径.md)）：后台整份在同会话**独立 target** 执行，取消 = `Target.closeTarget`（预期 <100–300ms），会话本体不污染、可立即复用；对 run-01 冷启离群 266.7s 同类风险免疫。
4. **验收 2s 的路径归属**：是「持久会话后台整份取消结案」路径（工装 `a04e2b-harness-cancel.ts` 的 `settleAfterClickMs`，口径 = 点击取消按钮 → 后台 `renderDocumentFull` promise settle，`:118/:131-133/:182`），**不是** `cancellation.render.test.ts` 断言②的会话级 abort 杀进程路径（1907.3ms / 余量 ~93ms，A2A-N2 观察项，不属本棒，二者不得混淆）。
5. **后台整份目前唯一驱动是工装**（`a04e2b-harness-cancel.ts:71-86`，与增量预览共用同一 printSession 的同一 target）；生产侧尚无后台整份消费者，控制器只返回 `full-required` 标记。
6. **file-size 护栏现状**（生产 400 / 测试 500 硬顶）：`report-render/src/browser.ts` **378/400（余 22）**、`pdf-export/src/incremental-controller.ts` **387/400（余 13）**、`render-full.ts` 165、`pipeline.ts` 257、`cancellation.render.test.ts` 142/500。触碰前两个文件前必须先量行数，超顶先纯搬迁拆分（ADR-0033 时期 file-size 门纯搬迁拆分先例）。
7. **CDP 多 target 用法先例**：`probes/pb-08-sqlite/chromium-tabs.ts:108-119`（`Target.createTarget` + `Target.attachToTarget(flatten)`），只作参照，不得形成对 probes 的依赖。

## 1. 开工资格（DoR）逐条对照

- [x] 闸门与授权：决策 #27 D3 已批准（A-04E 阶段二序列，决策 #17/#18/#19/#25/#27 链）；不违反宪法/冻结纲领（只改取消机制，不改产物、不改预算文本）。
- [x] 前置完成：A-04E-2b 已 Claude 审计 `PASS` 并合入（PR #65，main `0beb932`）；判定器、工装、VM 批次纪律齐备。
- [ ] **台账行时序**：实施 PR **不动** §3.1 台账；`A-04E-2-P6` 台账行在审计 PASS 后当轮与审计报告**同一提交**补登（G2-04 机制实证：检查 8b 要求台账行链接自身审计报告、8c 要求链接可解析到存在文件——实施阶段审计报告尚不存在，提前加行无论链与不链必致 8b/8c fail；先例：A-04E-2b 台账行即审计 PASS 后当轮补登）。未签署前台账不得出现「已完成」措辞。
- [ ] 双向审查：实施者复验本任务书 §0 全部机制断言与全部行号引用。
- [x] 无隐含依赖：不依赖 2c/P4/P7 任何裁定；不新增外部批准事项（VM 批次沿用既有授权形态与既有参考 VM）。

## 2. 范围

### 范围内

1. **report-render additive target 级 API**：`BrowserSession` 既有公开面零改动；新增 target 级打开/关闭能力（`Target.createTarget` + `attachToTarget(flatten)` + `Target.closeTarget`），browser.ts 余量 22 行，预计须拆模块（纯搬迁，不改既有逻辑）。
2. **pdf-export 消费侧**：`renderDocumentFull`（签名现于 `render-full.ts:59-65`）以最小侵入支持在独立 target 上执行；三处阶段门保留作 fail-closed 兜底。
3. **工装改造**：`a04e2b-harness-cancel.ts` 后台整份改在独立 target 上起 `renderDocumentFull`；取消主路径 = 关闭该 target；`bgAbort` 保留为阶段门兜底与 finally 防泄漏（`:196-202` 形态），二者关系写进 ADR。`settleAfterClickMs` 测量口径**同名同义不变**（点击取消 → 后台 promise settle）。
4. **判定器 2s 条款（A2B-N2 落地）**：`tools/a-04e/verify-a04e2b-harness.mjs` additive 新增条款——逐轮 `settleAfterClickMs ≤ 2000`，缺字段/非有限数/超限均 fail；存量 G1–G6 条款一字不删（含 G6 的 `outcome==="rejected"` + `errorCode==="PDF_EXPORT_CANCELLED"` + `recovery.pageCount` + `oldSlotsUntouchedDuringBackground` + 3 条 probeClickLatencies），头部 G 清单注释同步更新。
5. **决定性测试与变异自证**（见 §5）。
6. **VM 正式批次复测**（见 §5.3），沿用 run-2b-5 全部纪律。
7. **ADR-0034**：target 隔离设计裁定（取消语义、会话复用红线、abort 兜底关系、2s 条款口径与逐轮判定理由、产物零变化论证）。

### 范围外（越界即停）

- 增量窗格打印不 target 化（取消对象仅后台整份）；不改 `incremental-controller.ts` 的打印路径（其 387/400 余量亦非本棒理由）。
- 不改 `performance-budgets.md`（2s 为冻结预算）、不碰签署基线/签署带 [20553.4,24300.2]/冻结模板/lockfile。
- 不解释 run-01 取消结案 266.7s 离群机理（A2B-N3 复现探针为独立跟进项；本棒只要求批次继续采集 `maxGapMsDuringBackground`，该字段已在 timelineMs 中，无需新测量）。
- 不立项 2c、不做 P4/P7；工装不得演化为产品 UI（决策 #25 D1）。
- 零新增第三方运行时依赖。

## 3. 验收标准（唯一一条的落实形态）

**VM 正式批次 10 轮逐轮 `settleAfterClickMs ≤ 2000ms`，判定器新条款机械拦截。**

- **逐轮而非 p95**：预算原文语义是单次操作「取消后 2 秒内停止消耗」，非分布语义；且目标形态预期 <100–300ms，逐轮 2s 余量充足，逐轮判定不制造不可达性。
- **测量口径不变**：`settleAfterClickMs` 仍为点击取消按钮 → 后台 promise settle。归因性约束（决策 #27 D3「并入会毁掉归因性」的正面形态）：本棒不得改变测量起点/终点/计时器，否则 3.7–4.1s → ≤2s 的改善无法归因于 closeTarget。
- **终态码归一**：target 关闭导致的在途命令拒绝必须 fail-closed 翻译为 `PDF_EXPORT_CANCELLED`（G6 存量条款不变，判定器仍断言该码）；任何非取消原因的后台失败不得被误译为取消。
- **预算判定落点**：判定器新条款（批次证据判定器，非 CI 单测）。本机/CI 测试**不得**新增 2s 墙钟断言（A2A-N2 教训：负载敏感断言会误红；本机断言定位是机制——target 已关闭、会话存活、可再导出——而非墙钟）。

## 4. 硬边界（不可回归红线）

1. **产物零变化**：未触发取消时本棒对产出 PDF 完全 no-op；VM 批次 golden 等价门（21 页逐 run 比对）与签署基线 normalized sha 对账须零差异。
2. **R5 会话所有权**：管线/控制器 finally 绝不 close 外部会话（`pipeline.ts:176-183`）；target 关闭 ≠ 会话关闭。`persistent-session.render.test.ts` 两例（close 计数 0；取消后同会话立即可复用）零改动通过。
3. **会话级 abort 永久锁存语义不变**（`browser.ts:203-215`）——target 隔离是让「立即取消」与「会话复用」兼得，不是改会话语义。
4. **增量状态不污染**：`incremental.render.test.ts:245-252`（取消后 `controller.state()` 引用相等、同会话同控制器立即可再用）零改动通过。
5. **存量取消测试全绿**：`cancellation.render.test.ts` 四例（含 :125-142 未触发 signal 完全 no-op 红线）零改动通过；包测试整体（签署时 124/124）全绿。
6. **双标定门原样保留**：cal-pre 出带即不启动、cal-post 出带即 Fail-Stop 证据保留；**破下限/破上限均无自动豁免——停下请示业主**（决策 #26 D3 第四条：「本豁免不构成先例」）。
7. **判定器存量条款零删改**，新条款 additive；判定器自身须配变异证据（注入超 2s 样本报告 → 新条款变红）。
8. 测试文件分层后缀、file-size 硬顶、单一 `pnpm verify` 入口等 G1-09 护栏不放宽。

## 5. 验证设计

### 5.1 测试层级

- **unit**（report-render）：target 级 API 生命周期——打开/关闭/重复关闭幂等或明确报错/关闭后会话本体可用；target 关闭对在途命令的拒绝形态与错误映射。
- **render**（pdf-export，真实 Chromium，本机机制证据）：① 独立 target 上 `renderDocumentFull` 产出与主 target 形态一致（页数/对账）；② 后台整份在途时关闭其 target → promise 以 `PDF_EXPORT_CANCELLED` 结案、会话本体存活、同会话立即再导出成功（对照 persistent-session 红线）；③ 未触发取消时 target 形态与产物零变化。
- **工装 + VM 批次**：验收主证据（§3）。

### 5.2 决定性变异自证（实施者提供，审计者重放）

至少覆盖：① 取消仍走旧「等在途打印」路径（closeTarget 被摘除）→ 2s 相关证据/用例变红；② closeTarget 误伤会话本体（如错调 `Browser.close`）→ 会话复用用例变红；③ 判定器新条款删除/放宽 → 注入 `settleAfterClickMs > 2000` 的报告副本变红；④ 非取消失败被误译为 `PDF_EXPORT_CANCELLED` → 错误映射用例变红。变异须改进真实 `src/` 全量重放、逐条还原，事后核 `src/` 零改动（沿用 2b 审计工作树纪律）。

### 5.3 VM 正式批次纪律（沿用 run-2b-5 全表）

Win11 参考 VM（node v24.17.0 / Edge 150 签署环境身份）；链门 `vm-chain-depth-check.ps1`（NIC 断开硬检查 + 差分链层数 = 签署层配置）；900s 沉降窗口；证据目录「已存在即拒跑」守卫与失败批次改名；锚定提交逐位核对；输入 fixture sha 钉死；批前/批后双标定门；golden 等价门；证据 zip sha256 双向核验并写入实施记录（该环节当前是规程人工步骤，实施记录须按 2b §3.1 形态如实登记批次号与哈希）；证据归档 `artifacts/perf/` 本地留档不入 git。本机（node v24.13.0 / Chrome ≠ VM）数值仅作机制核验，预算判定以 VM 批次为准（A2B-N1 口径）。

## 6. 承接项处置

| 承接项 | 处置 |
|---|---|
| A2B-N2（G6 无 2s 门） | **本棒验收设计落地**（§2.4/§3），随本棒审计关闭 |
| A2B-N3（run-01 266.7s 离群复现探针） | 不关闭、不解释；批次继续采集 `maxGapMsDuringBackground`，跟进项保留 |
| A2A-N2（断言② 2s 余量 ~93ms 负载敏感） | 不属本棒路径（§0.4），维持 followup 原状；本棒不得在 CI 新增墙钟预算断言（§3） |
| 决策 #27 D3「先于 2c」 | 本棒签署前不启动 2c 任何立项动作 |

## 7. 交付物

1. report-render target 级 API + pdf-export 消费侧 + 工装改造 + 判定器新条款（含全部测试与变异证据）。
2. ADR-0034。
3. 实施记录（`docs/audits/A-04E-2-P6-implementation-record.md`）：含 VM 批次号、逐轮 settleAfterClickMs 全表、双标定值、golden 等价结果、zip sha256 双向核验记录。
4. 路线图 §3.1 新增 `A-04E-2-P6` 台账行与 AGENTS.md 承接条目——与审计报告**同一提交**落地（G2-04 检查 8a/8b：台账行链接须可解析，签署后当轮补条目，不得跨轮）。审计报告命名 `A-04E-2-P6-claude-audit-report.md`（有独立台账行，后缀形态合规）。

## 8. 流程纪律

- 实施者开工前完成双向审查并记录于 PR 正文或实施记录。
- 完成自检后标记「已实现，待独立审计」；独立审计 `PASS`/合规 `CONDITIONAL PASS` 后才可标记完成；实施者不得自行关闭审计发现。
- 本地 `pnpm verify` EXIT=0 之前不 push；交审计前签署基线须在远程且经 CI 验证。
- 任何范围外发现（含 2c/P4/P7 关联念头）进需求池或 followups，不夹带进本棒。

## 9. 独立审计猎杀方向（预告）

1. **2s 条款造假路径**：测量起点/终点被偷换、settle 提前到 abort 发射而非真结案、判定器只警告不 fail、逐轮被稀释成 p95/均值。
2. **假隔离**：closeTarget 未真执行（target 列表对账）、取消仍等待在途 printToPdf、target 泄漏到下一轮。
3. **会话污染伪装复用**：取消后「再导出成功」是否走了新会话/新进程作弊。
4. **错误误译**：非取消失败被翻译成 `PDF_EXPORT_CANCELLED` 冒充验收通过。
5. **产物漂移**：golden 等价门/签署基线对账是否被绕过或弱化；标定门是否被跳过。
6. **存量契约回潮**：G1–G6 既有条款、四层不可回归测试（§4）是否零改动通过。
7. 台账/AGENTS.md/审计报告同提交一致性（G2-04 8a/8b/8c 实跑）。
