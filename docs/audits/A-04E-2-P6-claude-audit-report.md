# A-04E-2-P6 独立审计报告（Claude）

> 审计对象：PR #66（分支 `a-04e-2-p6`；首审 HEAD `6e80ef2aaa3700dc26bfef2847e33c62c85cf75b`，复审 HEAD `2b6d29b6a1b11722633e48034dd0f8876db8efe9`）
> 任务书：[A-04E-2-P6-implementation-task](A-04E-2-P6-implementation-task.md)（§3 验收 + §9 七条猎杀方向）｜实施记录：[A-04E-2-P6-implementation-record](A-04E-2-P6-implementation-record.md)｜设计：[ADR-0034](../adr/0034-A-04E-2-P6取消target隔离与2s逐轮判定口径.md)
> 裁定链：决策 [#27](../../决策记录.md) D3（授权/唯一验收 2s）→ [#28](../../决策记录.md)（run-p6-3 批后标定破下限书面豁免）
> 审计方式：只读独立审计。VM 批次证据（zip sha256 核验后解包至 `tmp/p6-audit/`）在本机全量重放/重算；变异与篡改探针在仓外 `git worktree --detach 6e80ef2a`（node_modules junction）与证据副本上执行；审计后主工作树 `git status` 干净、HEAD 未动，探针 worktree 已移除。
> 审计日期：2026-09-19
>
> **结论：PASS**（2026-09-19 复审：P6-F1 关闭，见 §8）——首审 CONDITIONAL PASS：任务书 §9 七条猎杀方向全部核到；**验收唯一条款（决策 #27 D3：逐轮 settleAfterClickMs ≤ 2000）经独立重算坐实达成**（10/10 轮 ∈ [4.9, 868.6]ms）；一项 MINOR（P6-F1，实施记录行数声明失准）须修复后由原审计角色复审关闭。无 BLOCKER/MAJOR。

## 1. 锚定纪律与提交指纹

- 本地 HEAD（`git fetch origin pull/66/head`）= PR #66 `headRefOid` = CI run `35422572382` `headSha` = `6e80ef2a…f75b`，run `conclusion=success`、**10/10 job 全绿**（scope/contracts/static/typecheck/build-test/security/build-staging/e2e/build-production/unit-config）。提交版=审过版 ✓
- **批次锚定纪律**：`anchors.txt` main-head=`f64f348…614c3` 逐位等于期望、branch-head=`93f4ba4`（2 提交之第 1 个）。审计者核 `git diff 93f4ba4..6e80ef2a`：仅 ADR-0034、实施记录、决策记录三个文档文件，**零 src/测试/工具/配置改动**——批次证据对最终 HEAD 有效 ✓
- `决策记录.md` 本 PR +19/−0 纯追加（决策 #28），既往决策一字未动 ✓

## 2. VM 批次证据独立重放（`artifacts/perf/2026-09-18-A-04E-2-P6/`）

- **zip 身份**：本机 sha256 `c46c47c747eed26f…62102c34` 逐位等于声称值 `c46c47c7…02c34`；13,583,676 字节与记录 §3.1 一致 ✓
- **环境身份**：node `v24.17.0`、Edge `150.0.4078.83`（签署身份）、OS 10.0.22621（Win11）；`chain-attest.txt` depth-delta-1 同次引导；`drift.txt` edgeProcs 0→0；`settle.log` 900s 沉降执行完毕；`results.txt` 17 步全 exit 0 ✓
- **输入钉死**：`input/pa-13-performance-30-page.md` 本机 sha256 `4dedb1c2…b6258` 逐位等于期望 ✓
- **双标定门**：批前 `21658.5863` ∈ 带 [20553.4, 24300.2] ✓；批后 `19340.6732` 破下限 −5.9% → `CALIBRATION_DIVERGED_POST` 如实拦停于收尾 → **决策 #28 书面豁免**（四边界核验见 §4.3）
- **golden 等价门**：`golden-equivalence.log` `equivalent:true`、21 页、11,876 run；`summary.txt` golden normalized sha `4010C7FD…E03A` **与 A-04E-2a/2b 批次逐位一致**——本棒触碰 report-render CDP 连接层后签署管线产物仍逐位不变，产物零变化的硬证据 ✓；签署基线 sha `816B8EE9…B6C8` 未动 ✓
- **验收数值独立重算**（从 `harness-report.json` 原始记录，非采信记录转述）：10 轮 settleAfterClickMs = **15.7 / 44.7 / 20.0 / 520.4 / 5.4 / 868.6 / 4.9 / 4.9 / 5.8 / 26.6**——与实施记录 §3.1 表格逐值一致；min=4.9、max=868.6、**10/10 ≤ 2000**；10/10 `outcome=rejected` + `PDF_EXPORT_CANCELLED` + `cancelPath=target.closeTarget+abort-fallback` + `recovery.pageCount=30` + `oldSlotsUntouched=true`；run-01 `maxGap=359.3` 如实登记（A2B-N3 跟进数据采集形态）✓
- **判定器重放**：以 PR 版判定器对本机解包证据重跑——`PASS (all gates green)`，增量 p95=3679.3 仅留证（与记录一致；决策 #27 D1 永久登记未达成的纪律在 summary.txt 中明示）✓

## 3. 判定器有牙（审计者亲手篡改证据副本重放）

| 探针 | 操作 | 结果 |
|---|---|---|
| T1 超 2s 注入 | run-3 settle 篡为 266745.4（run-01 历史离群值） | **exit 1**：`G7 settleAfterClickMs 266745.4 > 2000` |
| T2 缺字段 | 删除 run-3 settle 字段 | **2 处同红**（G6 有限数 + G7 missing/not finite） |
| T3a 贴阈 | settle=2000 | PASS（≤ 口径边界正确） |
| T3b 越阈 | settle=2000.1 | **FAIL**（G7） |
| M-P6-3 致死双向 | 删 G7 块的变异判定器跑 T1 篡改报告 | **放行（PASS）**——删条款即放行谎报；真判定器对同一报告 exit 1 |

G7 逐轮判定、fail 而非警告、缺/非数/超限均拦截、无 p95 稀释——**判定器有牙，独立证实**；G1–G6 存量条款 diff 零删改（纯 +16 行 additive）✓

## 4. 猎杀方向逐项（任务书 §9）

### 方向 1：2s 条款造假路径 ✅ 不成立

- **测量口径同名同义**：`settleAfterClickMs = settledAt − cancelClickedAt`（点击取消按钮→后台 promise settle）diff 逐行核对——计时锚点一字未改，仅在其间插入 abort+closeTarget 动作；起点/终点/计时器不变，3.7–4.1s→≤2s 可归因 ✓
- **settle 非提前到发射**：若 settle 记于 abort 发射而非真结案，数值应均匀贴 0；实测离散分布 4.9–868.6ms 且与真实工作相关，形态上排除造假 ✓
- **逐轮非 p95**：G7 逐轮判定（T1 单轮篡改即败）；判定器 fail 非警告（exit 1 实证）✓

### 方向 2：假隔离 ✅ 不成立（归因性经变异实证）

- **M-P6-1 重放**（摘除工装 `bgTarget.close()`，abort 兜底保留）：settle 从基线 **4.26/3.49ms 跳到 1395.7/1214.9ms**（记录自报 1353.4ms，同量级）——2s 达成**归因于 closeTarget** 被正向/反向双向钉死；VM 口径旧路径 3.7–4.1s 在此形态下 G7 必红 ✓
- **在途打印真被拒**：`target-isolation.render.test.ts` ② 包装捕获原始 print 结局，断言 `rawPrintError.code === RENDER_TARGET_CLOSED`——结案来自 target 销毁而非等打印自然完成，该断言本身是「旧路径伪装」的检测器 ✓
- **target 不泄漏**：openTarget 半途失败收掉已建 target（unit 例）、close 幂等、finally abort+close 兜底、关闭后可再开新 target（render 例）✓

### 方向 3：会话污染伪装复用 ✅ 不成立

- 工装 `printSession` 全程单实例（批次报告单 `printBrowserProduct`/`printBrowserLaunchMs`），10/10 轮复跑 `recovery.pageCount=30`；`persistent-session.render.test.ts` 两例零改动通过（本机基线 127/127 内含）✓
- **M-P6-2 重放**（close 错调 `Browser.close`）：**恰 4 例变红**（会话复用 render 例 + opener 三 unit 例），与记录 §5 一致——会话本体被破坏即当场检出，「走新会话作弊」在测试网下不可藏匿 ✓

### 方向 4：错误误译 ✅ 不成立（双闸结构 + 决定性用例）

- `renderDocumentFull` 翻译条件 = `RENDER_TARGET_CLOSED` **且** `signal.aborted===true`；`RenderTarget` 本地归一另需「调用方已发起 close」前置——两道闸 ✓
- **M-P6-4 重放**（去掉 `signal.aborted` 条件）：恰 ③「非取消失败不误译」一例变红，②（真取消）仍绿——因正确原因变红 ✓

### 方向 5：产物漂移 ✅ 不成立

- golden 等价门 21 页 11,876 run 零差异 + normalized sha 跨三批逐位一致（§2）；`renderDocumentFull` 缺省路径 `executor = options?.renderTarget ?? session` diff 逐行等价；`cancellation.render.test.ts` ④（未触发 signal 完全 no-op）零改动通过 ✓
- 双标定门原样（批前出带不启动/批后出带 Fail-Stop）；run-p6-1/2 批前破上限（+60.2%/+36.1%，本机按带数值复算吻合）**均停下请示业主后改名重跑**——「不构成先例」边界在本次批次史上实际生效 ✓

### 方向 6：存量契约回潮 ✅ 零回潮

- 判定器 G1–G6 零删改（§3）；四层红线测试（persistent-session 2 例/cancellation 4 例含 :125-142 no-op 红线/incremental.render.test.ts:245-252 状态引用相等）**不在 PR 文件清单中**且本机全绿 ✓
- `incremental-controller.ts` 打印路径、`performance-budgets.md`、签署基线/带、冻结模板、`pnpm-lock.yaml`、签署冻结物（pdf-evidence fixtures/assets/fonts/docs/poc-a fixtures）**零触碰**（`git diff main...pr-66 --stat` 过滤实证）✓
- 本机基线：report-render **19/19**、pdf-export **127/127**（= 签署时 124 + 新增 3），与记录 §8 一致 ✓

### 方向 7：台账/同提交一致性 ✅ 合规（按任务书 §1/§7.4 修正后口径）

- 本 PR **不动** §3.1 台账与 AGENTS.md（文件清单实证）——与修正后任务书 §1「实施 PR 不动 §3.1；审计 PASS 后当轮同提交补登」一致 ✓
- **待办（实施者，审计 PASS 后当轮）**：台账行 + AGENTS.md 承接条目 + 本报告同一提交补登（G2-04 8a/8b/8c 机械守护：报告文件出现而无台账行 → 8a 拦；台账行不链报告 → 8b 拦；链接不可解析 → 8c 拦）

## 5. 发现

### 5.1 P6-F1（MINOR）实施记录文件行数声明失准——G2-04 承接③纪律（体量声明须引门禁输出，不自行计数）

**定位**：实施记录 §2「file-size 门」行。

记录声称：`browser.ts 378→381/400`、`render-full.ts 165→187/400`、`browser-target.ts 74 行`。
审计者 `wc -l` 实测（HEAD `6e80ef2a`）：`browser.ts` **380**、`render-full.ts` **185**、`browser-target.ts` **96**（`browser-find.ts` 53 与记录一致）。三处全错，其中 browser-target.ts 偏差 22 行（疑为 prettier 格式化前的计数——记录 §8 自述首轮被 prettier 拦 6 文件后 `--write`，但行数声明未随最终态更正）。

**影响边界（不夸大）**：全部文件仍远低于硬顶（生产 400/测试 500），`pnpm quality:check` 与 CI `static` 均绿——门禁本身未失守，任何验收结论不受影响；失准方向也不构成「贴线伪装」（browser-target.ts 实测 96 仍仅占上限 24%）。但 G2-04 承接③的存在理由正是「手写并列计数必然分叉」，本条为该规律的现场实例。

**建议**：该行改为引用门禁口径（一句话），或按 `wc -l` 终态更正三处数值。

### 5.2 观察项（NOTE，不阻断）

- **P6-N1**：ADR-0034 状态仍为「建议（实施期产物，随 P6 送审）」——签署/合入后应随台账同轮更新为已接受形态（2b 时期 ADR-0033 同口径处理）。
- **P6-N2**：`pnpm verify` exit=0 未由审计者独立重跑（全量构建成本），以 CI run `35422572382` 10/10 success 覆盖（A2B-N5 同款口径，如实登记）；本机独立重跑的是两包全量 19/19 + 127/127 与判定器全量重放。
- **P6-N3（审计边界）**：VM 内动作（Startup 入口切换、run-p6-1/2 失败批次改名留存、zip 回收）本机不可独立复跑，按 A2A-N3 同款口径归业主/VM 背书面；可机核部分（zip sha、锚定、环境身份、判定器重放、标定数值）全部独立坐实。
- **承接项状态**：A2B-N2（G6 无 2s 门）随 G7 落地**满足关闭条件**（待本审计 PASS 后正式关闭）；A2B-N3（run-01 266.7s 离群复现探针）维持跟进——本批 run-01 maxGap=359.3ms 已如实采集；A2A-N2 维持 followup 原状，本棒未在 CI/本机新增任何墙钟预算断言（新测试文件零 `2000` 墙钟断言，grep 实证）。

## 6. 审计手段与工作树纪律

- 变异重放（M-P6-1/2/4）在 `git worktree add --detach 6e80ef2a` 的仓外探针执行，node_modules 以 junction 挂载（root + pdf-export + report-render 三处）；逐条 `git checkout --` 还原，事后 `git status` 干净，worktree 已移除。
- 判定器篡改探针（T1/T2/T3a/T3b/M-P6-3）作用于证据目录的**副本**（`tmp/p6-audit-tamper/`），原件零触碰；变异判定器为独立副本文件，仓内判定器零改动。
- 工装重放（M-P6-1 基线+变异）使用 VM 证据内提取的 30 页语料（sha 逐位一致），输出落 gitignored `tmp/`。
- **本审计只新增本报告文件**，未触碰任何被审代码、测试、Schema、配置、lockfile、路线图或验收标准。

## 7. 结论与放行口径

**CONDITIONAL PASS。**

- **验收唯一条款达成且独立坐实**：决策 #27 D3「取消后 2 秒内停止消耗」——VM 正式批次 run-p6-3 判定器 G7 逐轮 `settleAfterClickMs ≤ 2000`，10/10 轮实测 ∈ [4.9, 868.6]ms（对照旧路径 3.7–4.1s），数值经审计者从原始证据独立重算逐值一致；判定器有牙经五条篡改/变异探针双向证实。
- **归因性成立**：M-P6-1 量级位移（4ms→1.2–1.4s）证明改善源于 closeTarget 而非测量口径；测量口径同名同义不变经 diff 逐行核对。
- **产物零变化**：golden normalized sha 跨 2a/2b/P6 三批逐位一致；缺省路径逐字等价。
- **豁免纪律**：决策 #28 四条边界逐字在案、「仅此一批」；批次史 run-p6-1/2 出带均停下请示——「不构成先例」边界实际生效。
- 一项 MINOR（P6-F1，记录行数失准）须由实施者修复、原审计角色复审关闭后方可标 ✅（DoD §9）。

| 编号 | 级别 | 摘要 | 建议处置 |
|---|---|---|---|
| P6-F1 | MINOR | 实施记录 §2 三处文件行数声明与 `wc -l` 终态不符（browser-target.ts 74→96 等）；门禁未失守、结论不受影响 | 改引门禁口径或按终态更正，一句话 |

> 审计者声明：本报告由 Claude 以独立只读审计角色作出，未参与 A-04E-2-P6 的任何实施与任务书起草修正执行；全部结论基于本机可复现的证据重放。VM 内动作与业主审批事实按 A2A-N3 同款口径归属背书面（P6-N3）。

---

## 8. 复审（2026-09-19）：P6-F1 修复核验——关闭，结论升 PASS

> 复审对象：修复提交 `2b6d29b6a1b11722633e48034dd0f8876db8efe9`（PR #66 新 HEAD，fetch 逐位一致）。
> 锚定：CI run `35428980621` `headSha` 逐位等于复审对象、**10/10 job 全 success**（提交版=审过版）。`git diff 6e80ef2a..2b6d29b`：仅实施记录一个文件（+3/−2，doc-only），零代码/测试/工具/配置改动——首审全部机制结论与批次证据对新 HEAD 继续有效。

### P6-F1（实施记录行数声明失准）——**关闭**

- 修复后 §2 文：「file-size 门（行数引用门禁口径实测，G2-04 承接③）：browser.ts 378→380/400；render-full.ts 165→185/400；browser-target.ts 96 行」。
- 审计者以 `git show pr-66:<path>` 取复审 HEAD 真源 `wc -l` 独立重测：**browser.ts 380 ✓、render-full.ts 185 ✓、browser-target.ts 96 ✓**——三处全部与记录改正值逐值一致；G2-04 承接③口径来源注明在案 ✓。
- 修复提交同时如实交代失准成因（prettier 重排后记录未更新），无掩饰。

### 复审结论

**P6-F1 关闭；A-04E-2-P6 独立审计结论由 CONDITIONAL PASS 升为 `PASS`。**

不变事项：首审 §1–§7 全部结论（验收达成、归因性、产物零变化、判定器有牙、豁免纪律、存量零回潮）维持有效；观察项 P6-N1～N3 按原口径登记（N1 ADR-0034 状态待业主签署后更新）。

**放行口径（实施者当轮执行）**：台账行 + AGENTS.md 承接条目 + 本报告**同一提交**补登（G2-04 8a/8b/8c 已在首审实测在牙——报告在盘未入库时 8a 如预期拦阻）；台账措辞签署前不得含「已完成」；A2B-N2 随本审计 PASS 正式关闭；A2B-N3/A2A-N2 维持 followup 原状；2c 立项动作须待决策 #27 D2 的 G0 级预算修订批准（不在本棒）。
