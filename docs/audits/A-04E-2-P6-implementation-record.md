# A-04E-2-P6 实施记录 · 取消 target 隔离（closeTarget）

> 任务书：[A-04E-2-P6-implementation-task](A-04E-2-P6-implementation-task.md)（§3 验收、§5 验证设计、§9 猎杀方向）。
> 授权链：[决策 #27](../../决策记录.md) D3（取消 target 隔离授权修复，单独成棒、先于 2c，验收就一条 2s）。
> 设计：[ADR-0034](../adr/0034-A-04E-2-P6取消target隔离与2s逐轮判定口径.md)。
> 数值口径纪律（A2B-N1）：本机 Win10 + Chrome/152 + node v24.13.0 的一切数值**仅作机制核验**；预算判定与正式对账结论以 Win11 参考 VM 批次（Edge 150 签署环境、塌链深度 1、双标定门）为准，见 §3。

## 0. 双向审查记录（任务书 §1，开工前完成）

实施者开工前对任务书 §0 全部机制断言与行号引用逐条当命令/原文复验，**全部属实，零修正**：

| §0 断言 | 复验结果 |
|---|---|
| 1. `assertNotCancelled` 位置（cancellation.ts:14-24）与七处阶段门行号（render-full.ts:67/98/120、pipeline.ts:104/110/186、incremental-controller.ts:161/228/294） | ✅ 逐行核对一致 |
| 2. 会话级 abort 永久锁存（browser.ts:203-215、send 拒绝 :250-252）、工装选型说明（a04e2b-harness-cancel.ts:13-16） | ✅ 一致 |
| 3. 授权目标形态（分析文档 §P6：独立 target + closeTarget，预期 <100–300ms） | ✅ 原文一致 |
| 4. 2s 路径归属（harness-cancel.ts :118/:131-133/:182 的 settleAfterClickMs 口径；与 cancellation.render.test.ts 断言②会话级 abort 路径不混淆） | ✅ 一致 |
| 5. 后台整份唯一驱动是工装（:71-86 同 printSession 同 target） | ✅ 一致 |
| 6. file-size 护栏：browser.ts 378/400、incremental-controller.ts 387/400、render-full.ts 165、pipeline.ts 257、cancellation.render.test.ts 142/500 | ✅ `wc -l` 实测逐一致 |
| 7. CDP 多 target 先例 probes/pb-08-sqlite/chromium-tabs.ts:108-119 | ✅ 一致（仅参照，未形成依赖） |
| §1 授权（决策 #27 D3 逐字）、预算锚点（performance-budgets.md:24 原文）、A2B-N2（判定器 :180-185 G6 只校验有限数） | ✅ 逐字一致 |

## 1. 交付物与范围对账

| 任务书 §2 范围内项 | 落地 | 证据 |
|---|---|---|
| 1. report-render additive target 级 API（既有公开面零改动；超 file-size 余量先纯搬迁拆分） | `browser-find.ts`（findChromium 纯搬迁零逻辑改动，browser.ts 转出口保持旧 import 路径）；`browser-target.ts`（`RenderTarget` + `createRenderTargetOpener`）；`browser.ts` additive `openTarget()` + 连接层 detachedFromTarget 在途拒绝 + waitEvent sessionId 过滤；`errors.ts` additive `RENDER_TARGET_CLOSED` | 本记录 §2/§4 |
| 2. pdf-export 消费侧最小侵入 | `render-full.ts` additive 第六参 `options.renderTarget`；三处阶段门原样保留；`RENDER_TARGET_CLOSED` 仅在 signal 已中止时译 `PDF_EXPORT_CANCELLED`，否则原样抛出 | `render-full.ts`、ADR-0034 D3 |
| 3. 工装改造（取消主路径 closeTarget + abort 兜底 + finally 防泄漏；settleAfterClickMs 同名同义） | `a04e2b-harness-cancel.ts`：后台整份在 `printSession.openTarget()` 独立 target 上执行；取消 = abort + `bgTarget.close()`；finally abort+幂等 close；报告 additive `background.cancelPath`；`a04e2b-harness.ts` `cancellationSemantics` 如实更新 | 本记录 §4 本机工装实跑 |
| 4. 判定器 2s 条款（A2B-N2 落地） | `verify-a04e2b-harness.mjs` additive **G7**：逐轮 `settleAfterClickMs ≤ 2000`，缺字段/非有限数/超限均 fail；G1–G6 一字未删；头部 G 清单注释同步 | 本记录 §5 变异证据 |
| 5. 决定性测试与变异自证 | §4 测试清单 + §5 四项变异全红回退 | §4/§5 |
| 6. VM 正式批次复测 | §3（沿用 run-2b-5 全部纪律） | §3 |
| 7. ADR-0034 | 取消语义/会话复用红线/abort 兜底关系/2s 逐轮口径/产物零变化论证 | [ADR-0034](../adr/0034-A-04E-2-P6取消target隔离与2s逐轮判定口径.md) |

范围外零触碰：incremental-controller.ts 打印路径未动；performance-budgets.md/签署基线/签署带/冻结模板/lockfile 未动；零新增第三方运行时依赖（`pnpm-lock.yaml` 零改动）。

## 2. 关键机制实现（ADR-0034 D2 实证依据）

- **竞态实证**：closeTarget 杀在途 printToPdf 时，Chrome 对在途命令的应答是通用错误
  `Page.printToPDF: Printing failed`（无结构化码），且错误应答可能先于 detach 事件到达。
  两路覆盖归一：① 连接层 `Target.detachedFromTarget` → 该 session 在途命令/事件等待立即
  以 `RENDER_TARGET_CLOSED` 拒绝并清除（不等 30s 超时）；② `RenderTarget` 本地记录已发起
  close，其后该 target 上的通用协议错误归一译为 `RENDER_TARGET_CLOSED`。
- **file-size 门**：browser.ts 378→381/400（纯搬迁拆出 browser-find.ts 53 行 + additive
  连接层改动）；render-full.ts 165→187/400；browser-target.ts 74 行。
- **既有公开面零改动实证**：`persistent-session.render.test.ts`（close 计数 0、取消后同会话
  复用）、`incremental.render.test.ts`（取消后状态引用相等）、`cancellation.render.test.ts`
  四例（含未触发 signal 完全 no-op 红线）**零改动通过**（127/127 全绿）。

## 3. VM 批次（预算判定与正式结论的唯一来源）

> **已跑：run-p6-3 正式批次全链完成**（§3.1），证据 zip 双向核验落
> `artifacts/perf/2026-09-18-A-04E-2-P6/`（gitignored 惯例同前批）。
> 跑批规程：宿主 `vm-chain-depth-check.ps1` PASS（签署层配置+NIC 断开）→ 停机可写挂载
> VHDX 注入 payload（robocopy `/MIR /XJ`，排除 node_modules/tmp/test-results/.hvigor）→
> Startup 入口换 `startup-bootstrap-2-p6.cmd`（2b 入口备份留存）→ 引导 autologon 同次引导
> attest → `vm-a04e2-p6-pass.ps1` 全门批次 → 证据 zip 经 PS Direct 回收，sha256 双向核验。
>
> 批次内门序（与 run-2b-5 全表一致）：塌链 attest → main 锚定逐位（`f64f348`）→ node
> v24.17.0 → 900s 沉降 → 离线 install → env:record 四步 → 输入 sha 钉死 → 批前标定 →
> 工装 10 轮 → 判定器 G1–G7 → 签署基线等价门 → 批后标定 → G7 预算判定收尾（增量 p95
> 仅留证——决策 #27 D1 永久登记未达成）。

### 3.1 run-p6-3（正式批次，分支锚 `93f4ba4`，zip sha256 `c46c47c7…02c34` 双向核验一致，13,583,676 字节）

- **门序全绿至收尾**：attest（同次引导）/锚定（main=`f64f348`、branch=`93f4ba4` 逐位）/node
  v24.17.0/Edge 150.0.4078.83（签署身份）/900s 沉降/离线 install/env:record 四步/输入 sha
  逐位/**批前标定 21658.6 ∈ 带 ✓** → 工装 10 轮 → 判定器 G1–G7 **PASS** → golden 等价门
  exit 0（21 页 11876 run 逐 run 全等，normalized sha `4010C7FD…E03A` 与 2b 两批逐位一致
  ——本棒对签署管线产物零变化的实证）→ **批后标定 19340.7 破下限 −5.9%** → STATUS=
  `CALIBRATION_DIVERGED_POST` 如实登记、证据链未截断 → **业主书面豁免翻正（[决策 #28](../../决策记录.md)，
  同 #26 形态，四条边界逐字沿用，仅此一批）**。
- **P6 验收（决策 #27 D3 唯一条款，判定器 G7 逐轮 settleAfterClickMs ≤ 2000）：达成**

  | run | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | settleAfterClickMs | 15.7 | 44.7 | 20.0 | 520.4 | 5.4 | 868.6 | 4.9 | 4.9 | 5.8 | 26.6 |

  对照旧路径（abort 阶段门等打印）：run-2b-5 稳态 3.7–4.1s。10/10 `PDF_EXPORT_CANCELLED`
  + 同会话复跑 30 页成功 + 旧槽位零替换 + `cancelPath=target.closeTarget+abort-fallback`。
  run-01 maxGapMs=359.3（本棒继续采集，A2B-N3 跟进项保留；冷启离群 266.7s 同类未再现）。
- **增量 p95=3679.3ms**（30 样本）：仅留证不作判定（决策 #27 D1 永久登记未达成）。
- **批次史**：run-p6-1（批前标定 38947.2 破上限 +60.2%，VM 内 Defender 扫描新注入 payload
  疑似诱因）→ 改名留存重跑 → run-p6-2（33054.1，+36.1%，逐轮收敛）→ 改名留存再跑 →
  run-p6-3 批前入带。失败证据原件留 VM `C:\wenshu-out\a-04e\a04e-2-p6-cancel-v1-FAILED-run-p6-{1,2}`
  （批次「证据目录已存在即拒跑」守卫逐轮生效，未混证）；两轮出带均经业主请示后处置。

## 4. 本机机制核验数值（仅机制证据，不作预算结论）

- **测试**：report-render 19/19（新增 `browser-target.unit.test.ts` 4 例 + `browser-target.render.test.ts`
  3 例：挂载序列/幂等 close/半途失败收 target/协议错误归一；真实 Chromium：独立 target
  导航+打印产物形态、在途命令 `RENDER_TARGET_CLOSED` 拒绝、关闭后会话本体 evaluate/打印/
  再开 target 全可用）；pdf-export **127/127**（新增 `target-isolation.render.test.ts` 3 例：
  ① 独立 target 整份渲染与签署管线同会话产物形态一致——页数/目录页码/提取文本逐项相等；
  ② 在途打印时关闭 target → `PDF_EXPORT_CANCELLED` 且底层在途 print 真实以
  `RENDER_TARGET_CLOSED` 被拒、会话本体立即再导出成功；③ 无信号关闭 target →
  `RENDER_TARGET_CLOSED` 原样抛出，不误译为取消）。
- **工装 `--runs 2` 实跑**（30 页语料 sha `4dedb1c2…b6258` 逐位一致）：6/6 编辑增量
  对账全绿；取消演示 2/2 `PDF_EXPORT_CANCELLED` + 同会话复跑成功 + 旧槽位零替换；
  **settleAfterClickMs = 3.9 / 3.4ms**（对照 2b 同工装旧路径本机 1176/1153ms、VM 3.7–4.1s）；
  maxGapMs 14.6/10.4；判定器 G1–G7 PASS。
- **判定器对本机证据**：PASS（all gates green），p95-incremental-totalMs=1889.4（本机口径，仅留证）。

## 5. 决定性变异自证（任务书 §5.2：每条因正确原因变红，就地注入/回退）

| 变异 | 改动 | 拦截点 | 结果 |
|---|---|---|---|
| M-P6-1 取消仍走旧路径 | 工装摘除 `bgTarget.close()`（abort 兜底仍在） | 归因性证据：settleAfterClickMs 3.9ms → **1353.4ms**（在途打印剩余时间重回结案耗时；VM 口径旧路径 3.7–4.1s → G7 必红） | ✅ 变红（量级位移证明 2s 达成归因于 closeTarget） |
| M-P6-2 closeTarget 误伤会话本体 | browser-target.ts close 错调 `Browser.close` | 会话复用用例 + opener 三例 unit | ✅ 4 例全红（会话本体被破坏即当场检出），回退复绿 |
| M-P6-3 判定器条款删除 | 删 G7 块，注入 settleAfterClickMs=266745.4（run-01 历史离群值）报告副本 | 变异判定器 exit=0 放行谎报（致死证明）；恢复后同一报告 exit=1（G7 拦截），真报告 PASS | ✅ 双向证据 |
| M-P6-4 错误误译 | render-full.ts 去掉 `signal.aborted` 条件（无条件翻译 RENDER_TARGET_CLOSED） | target-isolation ③（非取消失败不得误译为取消） | ✅ 变红，回退复绿 |

回退形态声明（2b 先例）：变异以就地锚定编辑注入、变红后逐条回退（git checkout 或逆编辑 +
关键段复读确认），无独立留证目录；回退正确性以全量测试复绿（report-render 19/19、
pdf-export 127/127）+ `pnpm verify` exit=0 确认。变异定义在表中精确定位，审计者可独立重放。

## 6. 承接项处置（任务书 §6 逐项）

| 承接项 | 处置结果 |
|---|---|
| A2B-N2（G6 无 2s 门） | **已落地为判定器 G7**（§1.4），随本棒审计关闭 |
| A2B-N3（run-01 266.7s 离群复现探针） | 不关闭、不解释；批次继续采集 `maxGapMsDuringBackground`（本机 14.6/10.4ms 正常带内） |
| A2A-N2（断言② 2s 余量负载敏感） | 不属本棒路径，维持 followup 原状；本棒未在 CI/本机新增任何墙钟预算断言 |
| 决策 #27 D3「先于 2c」 | 本棒签署前未启动 2c 任何立项动作 |

## 7. 已知边界（如实登记，非缺口）

1. **本机数值不作预算证据**（A2B-N1 口径）：本机 settle 3.4–3.9ms 仅证明机制（closeTarget
   杀在途打印、会话零污染）；2s 预算判定唯一来源 = VM 批次 G7。
2. **`RENDER_TARGET_CLOSED` 归一的语义边界**：调用方已发起 close 后该 target 上的通用协议
   错误归一为 target-closed（此时 target 确已销毁，操作本不可能完成）；取消终态码翻译另须
   signal 已中止（双层条件，误译有两道闸）。
3. **工装 settle 含检测轮询**：settleAfterClickMs 口径 = 点击 → promise settle（含 ≤25ms
   轮询间隔 + closeTarget 往返），与 2b 同名同义，未改计时器。

## 8. 验证清单（完成声明只列实际执行）

- `pnpm --filter @wenshu/report-render test`：**19/19 绿**。
- `pnpm --filter @wenshu/pdf-export test`：**127/127 绿**（签署时 124 + 新增 3）。
- 工装本机 `--runs 2` 实跑：2/2 取消演示绿、settle 3.9/3.4ms、判定器 G1–G7 PASS（§4）。
- 判定器变异：超 2s 注入变红、缺字段变红、删条款放行致死证明（§5 M-P6-3）。
- 变异自证 M-P6-1～M-P6-4：全红回退（§5）。
- `pnpm verify`：exit=0（2026-09-17 本机，含全部新工具脚本；首轮被 prettier 拦 6 文件，
  `--write` 修复后复跑全绿）。
- VM 批次：**run-p6-3 全链跑通**（G1–G7 PASS、golden 等价门零差异、批前标定入带；批后标定
  破下限已获[决策 #28](../../决策记录.md) 书面豁免，四条边界见 §3.1）；**验收达成：10/10 轮
  settleAfterClickMs ≤ 868.6ms ≤ 2000ms**。证据 zip sha256 `c46c47c7…02c34` 双向核验一致。

## 9. 状态

**已实现，待独立审计**（实施者未自行关闭任何审计发现；台账行与 AGENTS.md 承接条目按
任务书 §1/§7.4 在审计 PASS 后当轮与审计报告同一提交补登，未签署前台账不出现「已完成」）。
