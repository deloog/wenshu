# A-04E-2b 独立审计报告（Claude）

> 审计对象：PR #65（分支 `a-04e-2b`，HEAD `11698bc5521938be569a1c881513dcae7993c5b7`，4 提交）
> 任务书：[A-04E-2-implementation-task](A-04E-2-implementation-task.md)（§5.2 验收口径 + §9 八个猎杀方向）｜实施记录：[A-04E-2b-implementation-record](A-04E-2b-implementation-record.md)｜设计：[ADR-0033](../adr/0033-A-04E-2b增量分页架构页槽缓存与哨兵级联.md)
> 裁定链：决策 [#25](../../决策记录.md)（开工/D4 工装）→ [#26](../../决策记录.md)（批后标定破下限豁免）→ [#27](../../决策记录.md)（②不追认/P4 走 G0 修订/P6 独立成棒/立即送审/P7 登记）
> 审计方式：只读独立审计。VM 批次证据在本机全量重放/重算；变异矩阵在仓外 `git worktree --detach` 探针中执行（node_modules 以 junction 挂载），主工作树全程零改动（审计前后 `git status` 干净、HEAD 未动）。
> 审计日期：2026-09-16（首轮）
>
> **⚠ 利益冲突声明（见 §3.1，先读）**：本报告作者在本轮之前应业主要求对 Q1/Q2 出具过技术复核与建议，决策 #27 D1–D6、分析文档 §0 更正记录 / §2.2 归因分解 / §3 P7 的**内容源出于审计者本人**。这些部分**不构成独立审计**，本报告对其只做「转录是否忠实、原始数据是否支持」的核对，不作独立背书。
>
> **结论：PASS**（2026-09-17 复审：三项 MINOR 全部关闭，见 §5）——首审 CONDITIONAL PASS：任务书 §9 八个猎杀方向全部核到；**②「≤1s 局部编辑」未达成经独立坐实**（p95=4370.7ms，n=30，超限 4.37×），①③④ 达成度与实施记录一致；三项 MINOR（A2B-F1/F2/F3）须修复后由原审计角色复审关闭。无 BLOCKER/MAJOR。

## 1. 猎杀方向逐项结果（任务书 §9）

### 方向 1：输出不变是不是真不变 ✅ 独立证真（附 A2B-F1 口径缺口）

- **签署基线等价门**：`golden-equivalence.log` = `{equivalent: true, pages: 21, runs: 11876}`，exit 0。golden normalized sha `4010C7FD427FB093287172CE32E53A76DE73F73A6B51E2FF4C822148FF13E03A` 与 **A-04E-2a 两批逐位一致**——本棒重构了 `pipeline.ts` 装配段（抽出 `prepare-context.ts`），跨任务、跨重构后签署路径输出仍逐位不变，是比记录自报的本机 `22DDEAE0…2069` 恒等性更强的证据（该本机数值未独立重跑，成本原因，由本条 VM 侧覆盖）。
- **增量↔整份逐页对账**：30 条编辑全部 `windowMismatchPages: []`、`tocPagesEqual`、`pageCountEqual`、`editedTextVisibleInWindow` 均真，**0/30 不合格**，累计比对 **24,310 run**（本机从 `harness-report.json` 独立重算）。
- **对账不循环**：参照系是 `render-full.ts` 独立整份重渲（`referenceTotalMs≈5400ms`，不计入更新耗时），非增量自报——逐行核读成立。
- **但比较口径本身过宽**：见 §2.1 A2B-F1。

### 方向 2：定宽是不是真定宽 ⚠ 本棒只验到平凡情形（见 A2B-F2）

- 占位定宽机制签署于 2a（审计者已在 A-04E-2a 复审中亲手重放五条变异证其在线）。2b 的新增面是**把该机制作用于窗格 PDF**（ADR-0033 D3 目录页槽重打）。
- 实测：**`tocSlotUpdated = 0 / 30`**——该路径在整个 VM 批次从未执行；`updatedRange` 去重仅 `[7,7] / [13,14] / [21,21]`，全部 `delta=0` 且目录页码零漂移。`grep` 证 `test/` 下对 `tocSlotUpdated`/`tocRange`/`tocSlotPdfBytes` **零覆盖**。
- 纯逻辑侧（`updateTocPages` 窗后移位）有决定性用例——M4 变异实测变红。失守的是 IO 分支。详见 §2.2。

### 方向 3：预算证据的机器与链深 ✅ 独立证真

- `chain-attest.txt`：`depth-delta-1 signed-config attested`（同次引导写入，宿主注入期链检已过）✓
- `settle.log`：900s 沉降窗口执行完毕（业主 2026-09-07 裁定形态）✓
- `drift.txt`：批前 `edgeProcs=0`、批后 `edgeProcs=0` ✓
- 环境身份：Edge `150.0.4078.83`、node `v24.17.0`、`anchors.txt` main-head `f64f348…614c3` 逐位等于期望 ✓
- 输入 sha `4dedb1c2dee256c1f929f54a0e7922eb66daea072df8567cc129e331c25b6258` 逐位等于期望 ✓
- `results.txt` 17 步全 exit 0 ✓
- **`git status --short artifacts/reference-machine/` 为空** ✓（任务书 §9-3 指定项）
- **双标定门**：批前 `23148.06` ∈ 带 [20553.4, 24300.2] ✓ / 批后 `20308.9683` 破下限 −1.2% → `CALIBRATION_DIVERGED_POST` 如实拦停于收尾，证据链未截断（决策 #18 D3 形态）→ 决策 #26 书面豁免。**豁免方向的量化复核见 §1 方向 8**。

### 方向 4：有没有降质换时间 ✅ 独立证真

- 语料：`initial-full.pdf` 本机实测 **30 页**（非 21 页冒充），输入 sha 逐位一致；批次脚本 `source-hash` 门拒跑形态存在。
- 窗格产物实测 2 页 / 级联后 3 页，与 `pageRangesPrinted` 一致。
- 签署带 `[20553.4, 24300.2]` 一个数字未动（分支 diff 实证）。
- **未发现任何以降质换时间的形态**；相反，②的结论是如实登记的「未达成」，不存在凑过。

### 方向 5：签署物零改动 ✅ 独立证真

分支相对 main 的改动文件清单中**零触碰** `packages/pdf-evidence/fixtures`、`assets/fonts`、`report-checks`、`docs/poc-a/fixtures`（`git diff --name-only main...HEAD` 过滤实证）。无模板快照重签，D3 裁定路径未触发。

供应链：`@wenshu/editor-transactions`、`@wenshu/semantic-editor` 仅进 `packages/pdf-export/package.json` 的 **devDependencies**，lockfile 对应 devDeps 段（`link:../…` workspace 包）；**生产依赖零新增、外部供应链零新增** ✓

### 方向 6：增量是不是真增量 ✅ 独立证真

- **插桩同源性（核心）**：`incremental-controller.ts:239-259` 中 `const range` 在循环内一次计算，同一变量既传入 `printToPdf({pageRanges: range})` 又被 `pageRangesPrinted.push(range)` 记录，中间无重赋值；第二处 `:339-344` 同形态。`grep` 证 `src/` 下 `printToPdf` 仅 5 处——增量路径 2 处（均被记录），`pipeline.ts` 2 处与 `render-full.ts` 1 处属整份路径。**「记一套、打另一套」的形态在结构上不成立。**
- **批次实测**：`kind` = `incremental` **30/30**；打印区间去重仅 `{7-8, 13-14, 13-15, 21-22}`；最大窗 **3 页**；**印满全文（≥30 页）的轮次 = 0**。
- **判定器不采信自报**：G5 的 `windowKey` 由判定器**自行从真实槽位 PDF 提取几何**算出（`verify-a04e2b-harness.mjs:146-153` 调 `a04e2b-slot-keys.ts`），报告无法就槽位内容撒谎——设计正确，并经 M-b2 实证（见方向 8）。

### 方向 7：工装有没有冒充产品 UI ✅ 合规（决策 #25 D1）

- `a04e2b-harness-page.ts:63` 页面横幅：`A-04E-2b 一次性验证工装 · 非产品 UI（决策 #25）`；`:28` `<title>` 同款标注。
- 六个工装文件头部均含「工装（决策 #25 D1，非产品）」声明。
- 批次证据 `harness-report.json` 内 `toolingNotice` 字段落盘：「一次性验证工装 · 非产品 UI（决策 #25 D1）；本驱动只做测量与记录，判定归 VM 批次脚本」——**证据自带标注，不依赖文档承诺**。
- 工装位于 `packages/pdf-export/scripts/`，未进 `src/`、未进 `apps/`，与 A-04 产品面零接触。

### 方向 8：台账与流程 ✅ 忠实（附 A2B-F3）

- **提交指纹三方逐位一致**：本地 HEAD = PR #65 `headRefOid` = CI run `35074468475` `headSha` = `11698bc5521938be569a1c881513dcae7993c5b7`，run `conclusion=success`（提交版=审过版）。
- **批次锚定纪律**：`anchors.txt` branch-head=`dfeb13e`（4 提交的第 1 个）。审计者核 `git diff dfeb13e..11698bc`：其后三个提交**零 `src/` 改动、零测试改动、零 package.json/lockfile 改动**，唯一非文档新增是 `scripts/a04e2b-print-floor-probe.ts`（49 行探针，`grep` 证未被 `src/`/`test/`/`tools/` 引用）。**批次证据对最终 HEAD 依然有效。**
- **决策 #26 豁免方向的量化复核**（#26 承接派活）：批前→批后同管线漂移 −12.3%（23148.06→20308.97）。审计者独立压测——使「未达成」翻转需缩放 ×0.2288（即 **−77.1%**），而最大可辩护的环境修正（按批前/批后比）仅 −12.3%，**差 6.3 倍**；按带下限/带上限修正分别得 p95=3880.8 / 4588.2，**无一达标**。故 #26 D2「任何方向的环境修正均不改变未达成结论的方向」**独立成立且余量极大**（与 #23 的「+13% 不可复现」问题不同形态，本条无夸大）。
- **豁免边界表述**：#26 D3 有四条边界，实施记录只复述三条——见 §2.3 A2B-F3。
- **AGENTS.md**：新增完整 `A-04E-2b` 条目，②写明「永久登记未达成、任何后续裁定不得追认」与 #27 D1 一致；状态写「**独立审计送审中**」，未以「已实现」冒充「已审计」——DoD §3 满足 ✓
- **决策 #27 落账**：`决策记录.md` 本轮 +39/−0（纯追加，#26 及以前原文一字未动）✓；D1–D5 表述与分析文档 §6 逐条一致 ✓（D6 及其所据内容见利益冲突声明 §3.1）。
- `A-04E-2a-followups.md` #8 由「未开工」回填为「已裁定开工（决策 #25）」✓

### 附：ADR-0014 四项达成度独立核对

| 项 | 记录声称 | 审计独立核对 |
|---|---|---|
| ① 真增量 | 达成 | ✅ 30/30 incremental、印满全文 0 轮、插桩同源（方向 6） |
| ② ≤1s 局部编辑 | **未达成 p95=4370.7ms** | ✅ **坐实**——本机从 `harness-report.json` 独立重算：n=30、nearest-rank 秩 29、**p95=4370.7ms**、min=1691.9、max=4430.8、预算 1000ms、**超限 4.37×** |
| ③ 不冻结+可取消 | 部分达成 | ✅ 探针击键延迟 max **3.1026ms**、事件循环 maxGap max **37.2ms**、`PDF_EXPORT_CANCELLED/rejected` **10/10**、`oldSlotsUntouchedDuringBackground` **10/10**、`stalePageDemonstrated=3` ×10；**结案稳态 3701.3–4058.4ms > 2s 预算**（run-02…run-10）、**run-01 离群 266745.4ms** 逐条复核属实，均未被均值掩盖 |
| ④ 增量↔整份等价 | 达成 | ✅ 0/30 不合格、24,310 run 比对（方向 1）；**但比较口径过宽，见 A2B-F1** |

### 附：变异自证与判定器有牙（审计者亲手重放，非采信记录）

**记录 §5 变异 M1–M5**——在仓外探针中把变异**改进真实 `src/`** 后跑全量 115 例（干净基线 115/115）：

| 变异 | 改动 | 结果 | 变红用例 |
|---|---|---|---|
| M1 | `locateAnchorPage` 删唯一性 fail-closed（`hits.length !== 1` → `=== 0`） | **114/1** | `locateAnchorPage fails closed on ambiguous anchor (multi-page hit)` |
| M2 | 删 `!input.sentinelEqual` 扩窗分支 | **114/1** | `cascade: sentinel mismatch extends the window by one page` |
| M3 | `runKeyTagFree` 纳入 `font.tag` | **113/2** | `runKeyTagFree ignores font tag but pins text/geometry` + render 端到端对账 |
| M4 | `updateTocPages` 窗后条目不移位（删 `+ delta`） | **114/1** | `updateTocPages: entries before window unchanged, in window relocated, after shifted` |
| M5 | `applyWindowToState` 不合并窗页证据 | **114/1** | render 端到端对账 |

五条**全部因正确原因变红**，与记录 §5 表格逐条吻合。探针 `src/` 事后还原零改动。

**记录 §6 判定器变异**——对判定器输入做真实形态篡改后重跑 `verify-a04e2b-harness.mjs`：

- **对照组**（原件）：`PASS (all gates green)`，且 p95/分区 p95/探针延迟/maxGap **逐值复现 VM 侧 `verify-harness.log`**——判定器确定性成立、重放环境有效。
- **M-a 假增量**（`pageRangesPrinted` 篡为 `1-30`）→ **3 处同红**：`printed span 30 covers whole document (30) — fake incremental` + `updatedRange start 7 !== first printed range start 1` + G5 跨轮 ranges 分叉。
- **M-b2 槽位调包**（换**真实 PDF**：edit-3 窗格冒充 edit-1）→ **红**：`cross-run windowKey diverged`，两键值并列输出。
- **M-c 取消谎报**（`errorCode` 篡改 + `oldSlotsUntouched` 置 false）→ **2 处同红**（G6 双条款）。

**判定器有牙，独立证实**，与记录 §6 逐条吻合。

### 附：本机第一手复测

- 主树 `pnpm --filter @wenshu/pdf-export test`：**tests 115 / pass 115 / fail 0**，exit 0。
- 仓外探针干净基线：同为 115/115。
- 体量护栏：`incremental.unit.test.ts` 415、`incremental.render.test.ts` 304（测试上限 500）；`incremental-controller.ts` 387、`incremental.ts` 370、`render-full.ts` 165、`incremental-state.ts` 141、`prepare-context.ts` 114（生产上限 400）——**全部合规且无一贴线** ✓
- 地板探针输出 `plain-1page: 99,83,84,82,83` / `cjk-1page: 60,59,57,57,57`，与分析文档 §2.3「~83ms / ~57ms」吻合；脚本头部明写「**本探针读数不得用于任何归因承重**」，与决策 #27 D6 一致 ✓（输出落 gitignored `tmp/`，同 PA-13/2a 惯例；脚本入仓故可复现）

## 2. 发现（全部经审计者亲手复现）

### 2.1 A2B-F1（MINOR）tag-free 比较口径过宽——七类语义变化被判等，且实测收紧零误报

**定位**：[`incremental.ts:29-36`](../../packages/pdf-export/src/incremental.ts#L29-L36) `runKeyTagFree`；消费者 [`incremental-state.ts:31-48`](../../packages/pdf-export/src/incremental-state.ts#L31-L48) `pagesEquivalentTagFree`、[`a04e2b-harness-reconcile.ts:67`](../../packages/pdf-export/scripts/a04e2b-harness-reconcile.ts#L67)、`a04e2b-slot-keys.ts:30`（G5 键）。

键 = `[normalizePdfText(text), baselineY, bbox.x, fontSize]`。ADR-0033 F2 只证明了「字体资源 **tag** 每次 print 调用独立分配」，而实现把**整个 `font` 引用**（`objectId/tag/family/weight/subset/embedded`）连同 `bbox.width`、`bbox.height`、`viaActualText`、`figureMcid`、`blockOrder` 一并丢弃。`geometry.ts:146-173` 证 `family` 取自 FontDescriptor `/FontFamily`，缺失时回落 `name.replace(/^[A-Z]+\+/, "")`——**子集前缀被显式剥掉，故 `family`/`weight` 按构造即打印不变**。

**证据①（失明，带对照组）**：取 run-01-edit-1 窗格真实几何自比，单点改一个字段——

| 探针 | 判等 | 期望 |
|---|---|---|
| 对照①原样自比 | true | ✓ |
| 对照②改 `text` | **false** | ✓ 探针有效 |
| 对照③改 `baselineY` | **false** | ✓ 探针有效 |
| M8 改 `font.family`（换字体族） | **true** | ✗ 失明 |
| M9 改 `font.weight`（换字重） | **true** | ✗ 失明 |
| M10 改 `bbox.width`（字形宽度漂移） | **true** | ✗ 失明 |
| M11 改 `viaActualText` | **true** | ✗ 失明 |
| M12 改 `figureMcid`（图内/图外，决策 #10 域） | **true** | ✗ 失明 |
| M13 改 `font.embedded`（内嵌→否） | **true** | ✗ 失明 |

**证据②（丢弃是过宽的，非必要）**：同一页 ranged(窗格) vs 整份，705 个 run 逐字段比对——`font.tag` **697/705 不同**（F2 成立，该丢）、`bbox.height` **20/705 不同**（打印相关，该丢）；而 `family / weight / subset / embedded / bbox.width / viaActualText / figureMcid / blockOrder` **全部 705/705 相同**。即：**保留这八项在真实数据上零误报，却能换回上表六类检出力。**

**证据③（影响边界，不夸大）**：以严口径（tag-free 键 + 上述八项）全量扫描 30 条编辑的窗格 vs 整份共 **70 个页对**——两口径都判等 30、都判不等 40（真实内容变化）、**「tag-free 判等而严口径判不等」= 0**。**盲区在本批次从未触发，④「达成」的结论未被推翻**。

**影响**：④ 是 ADR-0014 四项之一且已签 达成，其证据建立在一个对字体身份失明的口径上；而 ADR-0033 D4 恰恰记录了「ranged print 字体子集只含窗页字形」——**本架构已知会在字体域发生分歧，而门正好在该域失明**。这与 A-04E-2a 决策 #22 约束④要求的「证明口径是同构比较而非抹除」是同一条纪律，本棒未对 tag-free 建立该性质。

**建议**：① 把键收紧为「剔除 `objectId`/`tag`/`bbox.height`，保留其余」，并用本报告证据②说明零误报；② 补决定性变异用例（M8–M13 形态各一），形态照抄 `backfill-toc-mutation.unit.test.ts`（2a 先例）；③ 在 ADR-0033 §4 把「口径为何丢弃某字段」逐条给出打印变异性依据，而非统称 F2。

### 2.2 A2B-F2（MINOR）目录页槽重打路径零执行证据——VM 0/30 且测试零覆盖

**定位**：[`incremental-controller.ts:326-347`](../../packages/pdf-export/src/incremental-controller.ts#L326-L347)（`tocPagesDrifted` → 重打目录页 `printToPdf` → `backfillTocPageNumbers(tocBytes, …)`）。

**证据**：① 批次实测 **`tocSlotUpdated = 0 / 30`**，30 条编辑全部 `delta=0` 且目录页码零漂移，`updatedRange` 仅 `[7,7]/[13,14]/[21,21]`；② `grep` 证 `packages/pdf-export/test/` 下对 `tocSlotUpdated` / `tocRange` / `tocSlotPdfBytes` **零命中**（仅工装脚本引用）。故该分支**无单元测试、无 render 测试、无 VM 执行**。

**影响**：这是控制器两个 `printToPdf` 调用点之一，且是**把 2a 签署的 `backfillTocPageNumbers` 首次作用于窗格 PDF 这一新输入类**——ADR-0033 D3 自陈「回填机制签署于 2a，此处只是作用于窗格」，但 D4 同时记录窗格 PDF 的字体子集与整份不同，而 backfill 的占位识别依赖「占位槽映射到单字符 `8` run」。该假设在窗格 PDF 上**未被任何证据验证**。ADR-0014 ④ 明列「**目录/页码更新**」，本棒只验到其平凡情形（表不变）。

**缓解（如实登记）**：`backfillTocPageNumbers` 本身 fail-closed 且其守卫已在 A-04E-2a 复审中由审计者亲手变异证实在线，故失败形态是抛 `PDF_EXPORT_BACKFILL_FAILED` 而**非静默产出错误页码**——无静默损坏风险。纯逻辑侧 `updateTocPages` 的窗后移位有决定性用例（M4 实测变红）。因此定级 MINOR 而非 MAJOR。

**建议**：二选一——① 补一条 render 用例：构造「窗内标题跨页移动但总页数不变」的夹具触发 `tocPagesDrifted`，断言目录页槽重打后回填正确且与整份重渲的页码表相等；或 ② 若判定该情形 v1 不可达，则在控制器加显式 `fullRequired` 并删除该分支（消除不可达代码），同时在 ADR-0033 D3/§5 与记录 §7 如实登记。**不接受**「保留分支但不测」。

### 2.3 A2B-F3（MINOR）决策 #26 豁免边界表述缺一条——「不构成先例」未落入实施记录

**定位**：[`A-04E-2b-implementation-record.md:57`](A-04E-2b-implementation-record.md)。

决策 #26 D3 原文有**四条**边界：①仅限 run-2b-5 本次批次；②仅限破下限方向；③签署带一个数字不改；④**后续任何批次标定出带（任一方向）仍须停下请示，本豁免不构成先例**。实施记录只复述前三条（「豁免仅限本次本方向，签署带未动」），**第④条缺席**。

决策 #26 承接明确派活「审计者须核豁免边界表述与本条一致」，故该指定核对项不完全通过。

**影响**：这是**连续第二次**批后标定破下限豁免（#23 → #26），「不构成先例」恰是防豁免蔓延的那一条；A-04E-2a 的实施记录当时是写了这一条的（见 2a 记录 §3.2）。落差本身即是漂移信号。数据与结论不受影响。

**建议**：实施记录 §3.1 该行补齐第④条边界（一句话）。

### 2.4 观察项（NOTE，不阻断）

- **A2B-N1（口径边界，沿用 A2A-N1）**：本机复跑环境 node v24.13.0 / Chrome 152 ≠ VM 签署锚 node v24.17.0 / Edge 150.0.4078.83；本机数值仅作机制核验，预算与正式对账结论以 VM 批次为准。记录已在抬头声明该纪律 ✓
- **A2B-N2**：`verify-a04e2b-harness.mjs` 的 G6 只校验 `settleAfterClickMs` 为有限数（`:180-186`），**不校验 2s 稳定性预算**——run-01 的 266745.4ms 照样过 G6。这符合「判定器管机制、预算判定归批次脚本收尾」的分工，且记录如实写了「③部分达成」，但意味着**取消结案回归目前无任何自动门**。建议 P6 棒把 2s 作为判定器条款落地（P6 验收本就是这一条）。
- **A2B-N3**：run-01 取消结案 **266745.4ms** 离群机理未解释，记录与 AGENTS.md 均已登记复现探针为跟进项（决策 #26 承接核对项——**登记如实** ✓）。审计者补一条形态观察：该轮同时是 `maxGapMsDuringBackground` 唯一异常值（37.2ms vs 其余 1.3–4.7ms），两者同轮出现，复现探针宜一并采集事件循环间隙。
- **A2B-N4（文档残渣）**：实施记录 §3 抬头已更正为「已跑」，但其下仍留模板占位行「（跑批后在此回填：批次号、双标定值、p95 与分区 p95、G1–G6 结果、等价门结果、预算结论。）」；§8 验证清单末条仍写「批后标定破下限**待业主裁定**」，而决策 #26 已于 2026-09-16 裁定。两处属过时残渣，建议随 F3 一并清理。
- **A2B-N5（审计边界）**：`pnpm verify` exit=0 未由审计者独立重跑（全量构建+全套件，成本原因），以 PR #65 CI run `35074468475` **10/10 success** 覆盖；按 A2A-N3 同款口径，远程 CI 属能力边界而非独立验证，如实登记。本机独立重跑的是 pdf-export 包全量 115/115。

## 3. 程序说明

### 3.1 利益冲突声明（重要）

本报告作者在本轮审计之前，应业主要求对 A-04E-2b 的处置方向出具过技术复核与建议。其中**以下内容源出于审计者本人**，本报告**不对其作独立审计背书**：

- 分析文档 §0 更正记录、§2.2「VM 批次内窗宽两点线性分解（固定 ≈509ms + 边际 ≈501ms/页）」、§3 P1/P2 的更正评估、§3 P7（首窗自适应放宽）及 §4 组合表中的 P7 行；
- 决策 #27 的 D1（否决重解释）、D2（P4 走 G0 修订）、D3（P6 独立成棒）、D4（立即送审）、D5（P7 登记）、D6（分析文档更正确认）——其建议由审计者提出，裁定权属业主。

对这些部分，本报告只做两件事并如实报出：① **转录忠实性**——分析文档 §2.2 的 1510.4 / 2011.3 / 1263.8–1792.8 / 1968.9–2060.0 / 500.9 / 508.6 / 34% / 66% 与审计者从 `harness-report.json` 的独立重算**逐位一致**；② **原始数据支持**——上述分解所依据的窗宽分组（2 页 n=30、3 页 n=10）可从批次原件复算。**但「该归因是否正确」不能由提出者自证**，若需独立背书，应由另一审计角色或后续轮次完成。

此外，本报告对 ①②③④、双标定门、变异矩阵、判定器、插桩诚实性、台账与签署物的结论，**与上述利益冲突面无依赖关系**——这些是本棒实施者的交付物，审计者未参与其实施。

### 3.2 审计手段与工作树纪律

- 变异矩阵（M1–M5）在 `git worktree add --detach 11698bc` 建立的仓外探针中执行，node_modules 以 junction 挂载；每条变异**改进真实 `src/`** 后跑全量 115 例，逐条 `git checkout --` 还原，事后核 `src/` 零改动。
- 判定器变异（M-a/M-b2/M-c）对批次证据目录的**副本**操作（含真实槽位 PDF 替换），原件零触碰。
- tag-free 口径探针（M8–M13 + 三条对照 + 70 页对全量扫描）在 scratchpad 中以只读方式加载仓内 `src/` 模块执行，未写入仓库。
- **本审计只新增本报告文件**，未触碰任何被审代码、测试、Schema、配置、lockfile、路线图、验收标准或既有证据。主工作树审计前后 `git status` 干净、HEAD 未动。

## 4. 结论与放行口径

**CONDITIONAL PASS。**

任务书 §9 八个猎杀方向全部核到，核心事实独立坐实：

- **②「局部编辑受影响页 ≤1s」在 CDP printToPdf 架构下未达成**——p95=**4370.7ms**（n=30、nearest-rank 秩 29、超限 **4.37×**），且经独立压测，翻转该结论需 −77.1% 的环境修正而实测漂移仅 −12.3%（**差 6.3 倍**），任何方向的标定修正均不可能改变结论方向。**该事实可作为后续 G0 级预算修订的依据**（决策 #27 D4 的送审目的达成）。
- ① 真增量、③ 不冻结+可取消（部分达成，2s 超限与 266.7s 离群如实登记）、④ 增量↔整份等价，达成度与实施记录一致，无夸大。
- 变异自证 M1–M5、判定器 M-a/M-b2/M-c 全部由审计者亲手重放、**因正确原因变红**；插桩诚实性结构成立；签署物与签署带零改动；供应链零新增；台账未以「已实现」冒充「已审计」。

三项 MINOR 须由实施者修复、原审计角色复审关闭：

| 编号 | 级别 | 摘要 | 建议处置 |
|---|---|---|---|
| A2B-F1 | MINOR | tag-free 口径过宽：七类语义变化判等；实测收紧零误报；盲区本批未触发故 ④ 结论未被推翻 | 收紧键 + 补 M8–M13 形态决定性用例 + ADR 逐字段给依据 |
| A2B-F2 | MINOR | 目录页槽重打路径 VM 0/30 且测试零覆盖；系 2a 签署回填首次作用于窗格 PDF；fail-closed 无静默风险 | 补触发该分支的 render 用例，或判定不可达则删分支并登记 |
| A2B-F3 | MINOR | 决策 #26 豁免边界四条只复述三条，缺「不构成先例」（#26 承接指定核对项） | 实施记录 §3.1 补齐一句 |

观察项 A2B-N1…N5 为不阻断登记项，其中 **N2（取消结案无自动门）建议并入 P6 棒的验收设计**，**N4（文档残渣）**建议随 F3 一并清理。

**放行口径**：在三项 MINOR 修复并经原审计角色复审关闭前，A-04E-2b 不得标 ✅（DoD §9）。**②「未达成」的登记不因任何修复而改变**——决策 #27 D1 的「永久登记、不得追认」在本报告独立坐实的事实基础上成立。P6 棒任务书的起草（决策 #27 承接）与本轮 MINOR 修复可并行，互不阻塞。

> 审计者声明：本报告由 Claude 以独立只读审计角色作出，未参与 A-04E-2b 的任何实施；全部结论基于本机可复现的证据重放。**唯一例外是 §3.1 声明的利益冲突面，该部分不构成独立审计。** VM 内动作与业主审批事实按 A2A-N3 同款口径归属背书面。

---

## 5. 复审（2026-09-17）：A2B-F1/F2/F3 修复逐项核验——全部关闭，结论升 PASS

> 复审对象：PR #65 修复提交 `1c0ce551331c55fb63f37be2ffdd705e3fd71b51`（工作树 HEAD 逐位一致、`git status` 干净）。
> 锚定纪律：CI run `35166780440` `headSha` 逐位等于复审对象、`conclusion=success`、10/10 job 全绿（提交版=审过版）。`pnpm verify` 未由审计者独立重跑（全量构建成本），按 A2B-N5 同款口径以该远程 run 覆盖，如实登记。
> 复审方式：变异探针在仓外 `git worktree --detach 1c0ce551`（node_modules junction）执行，逐条 `git checkout --` 还原，事后 `git status` 干净、worktree 已移除；本机第一手重跑包全量与 quality:check。

### 5.1 A2B-F1（tag-free 口径过宽）——**关闭**

- **收紧属实**：`runKeyTagFree` 键现为 `[归一化 text, baselineY, bbox.x, bbox.y, bbox.width, fontSize, blockOrder, viaActualText, figureMcid, font.family/weight/subset/embedded]`——只剔 `font.objectId`/`font.tag`/`bbox.height` 三个打印变异字段，`pageIndex` 为比较轴不入键，与 ADR-0033 §4.1 逐字段表逐项一致。
- **ADR-0033 §4.1 逐字段依据成立**：剔除项各附实测漂移数（tag 697/705、height 20/705），保留项附 705/705 实测与「子集前缀解析期剥除」构造性论证——不再是统称 F2。
- **决定性变异（审计者亲手重放）**：仓外探针把键退回旧宽口径（只留 4 字段）→ 包内 30 例 **29/1**，唯一变红即新增 `runKeyTagFree pins every semantic field (A2B-F1 decisive mutations)`——因正确原因变红。
- **「收紧零误报」独立重验**（不止采信首审证据②）：复审探针取签署语料真实 Chromium 打印，整份 vs 单页 ranged 三页（5-5/8-8/14-14，共 1806 run）逐 run 比收紧键——**keyMismatch=0**；被剔字段漂移实测 tag 868/703/233、height 44/20/49，保留语义字段全部零漂移。其中 8-8 页 705 run、height 漂移恰 20/705，与首审证据②逐值吻合（tag 数 703 vs 697 系本机 Chrome 152 vs VM Edge 150 环境差，方向一致）。
- 新增两例单测（三剔除字段判等 + 13 类语义变异判不等）形态照抄 2a 先例，覆盖首审 M8–M13 全部六类。

### 5.2 A2B-F2（目录页槽重打零执行证据）——**关闭**（按首审建议①构造夹具）

- **路径真实执行**：`incremental-toc-slot.render.test.ts`（真实 Chromium，无 mock）合成自校准夹具，编辑后断言链完整——`kind=incremental`、`pageCount` 不变（delta=0）、`tocPages.get("ch1s1")` 漂移（≠ 旧页）、**`tocSlotPdfBytes !== null`**、**`pageRangesPrinted` 末轮恰为目录页单页区间**；槽位与整份重渲独立 oracle（`renderDocumentFull` 全路径，非增量自报）目录页**逐 run 收紧键全等** + `tocPages` 与 oracle 大纲测量 `deepEqual`。
- **校准声明独立坐实**：复审各次跑测的 `[calib]` 日志显示 **3 轮收敛**（attempt 0→2：`linesBelow=2`、`slack=12=addLines+8`），与用户声明逐值一致；排版参数（行距 17.25/容量底线/每行 43 字）均自基线渲染几何实测，无环境硬编码。
- **y 轴根因经变异证真**（M-F2d）：把 `pageCapacity` 退回 y 向下误读（`Math.max` 当页底）→ capacity=772.17（页顶）、`linesBelow=-17`/`slack=-17`、校准当场发散、测试变红——「y 向上取 min」是承重逻辑，根因分析成立。
- **五条变异全部因正确原因变红**（审计者亲手重放）：
  - M-F2a `locateTocPageIndex` 退回单 run 匹配 → 6 例中拆字命中/空白容忍/行内嵌套拒绝 **3 例红**；
  - M-F2b 删「独立成行」判据 → 行内嵌套拒绝 + 仅存行内出现返 null **2 例红**；
  - M-F2c 控制器禁用目录页槽重打分支 → render 测试红（`tocSlotPdfBytes` 为 null）；
  - M-F2d y 轴误读（上条）→ 红；
  - M-F2e 跳过 `backfillTocPageNumbers` 直接交原始 tocBytes → 红于 oracle 对账 `toc slot run count drifted vs full re-render`——「槽位↔整份逐 run 全等」断言真实承重，2a 签署回填作用于窗格 PDF 这一新输入类**已有端到端证据**（首审核心关切消解）。
- **顺带真缺陷（locateTocPageIndex 字距拆字盲区）修复形态正确**：连续 run 窗拼接 + 空白 run 容忍 + 独立成行判据 + 多页/零页 fail-closed；`incremental-state.unit.test.ts` 6 例覆盖命中/容忍/两类拒绝/双 fail-closed。该盲区属「批次未触发只因 30 条编辑零漂移」的潜伏缺陷，修复方向与签署语料实测形态（封面说明行内嵌「目录」）一致。

### 5.3 A2B-F3 + N4（豁免边界缺第④条 / 文档残渣）——**关闭**

- 决策记录 #26 D3 原文四条边界逐字核对：①仅限 run-2b-5 本次批次；②仅限破下限方向；③签署带一个数字不改；④**后续任何批次标定出带（任一方向）仍须停下请示，本豁免不构成先例**（决策记录.md:674-675）。
- 实施记录 §3.1 现完整复述四条（含④），§8 验证清单末条同步改记「已获决策 #26 书面豁免（四条边界见 §3.1）」；§3 模板占位行「（跑批后在此回填…）」已删除。N4 两处残渣均清理。

### 5.4 修复提交范围与验证独立重跑

- 修复提交 `1c0ce551` 触及 8 文件：ADR-0033 §4.1、审计报告原件落盘、实施记录、`incremental.ts`/`incremental-state.ts`、三个测试文件——**全部在三项 MINOR 范围内，无夹带**；签署冻结物、lockfile、路线图、契约零触碰。
- 审计者本机第一手重跑：`pnpm --filter @wenshu/pdf-export test` **124/124 pass**（exit 0，含新增 9 例逐条 ✔ 核名）；`pnpm quality:check` 绿（504 文件，仅存量 WARN）；新测试文件 435/97 行低于 500 行门。
- 体量护栏（`wc -l` 实测）：`incremental-state.ts` 180、`incremental.ts` 386（生产上限 400）；`incremental-toc-slot.render.test.ts` 435、`incremental-state.unit.test.ts` 97、`incremental.unit.test.ts` 458（测试上限 500）——全部合规、无一贴线 ✓。

### 5.5 复审结论

**A2B-F1、A2B-F2、A2B-F3 三项 MINOR 全部关闭；A2B-N4 残渣随清。A-04E-2b 独立审计结论由 CONDITIONAL PASS 升为 `PASS`。**

不变事项：②「≤1s 局部编辑」**未达成**（p95=4370.7ms）的永久登记不因本修复改变（决策 #27 D1）；A2B-N1/N2/N3/N5 观察项按原口径登记（N2 建议并入 P6 棒验收设计）。
