# A-04E-2b 实施记录 · 增量分页架构（页槽缓存 + 哨兵级联 + ADR-0014 四项实测）

> 任务书：[A-04E-2-implementation-task](A-04E-2-implementation-task.md)（§5.2 为 2b 验收口径，§9 猎杀方向）。
> 裁定链：[决策 #25](../../决策记录.md)（2b 开工，D1 一次性验证工装、D4 非产品 UI、缓存设计基线 ~5.1–5.4s 钉定）。
> 设计：[ADR-0033](../adr/0033-A-04E-2b增量分页架构页槽缓存与哨兵级联.md)（页槽缓存/哨兵级联/锚定页码更新/诚实回落四决策；§77 行交代 ux-state 契约 fullRepagination 实现槽的历史错位——契约字节不动）。
> 审计报告命名约定：`A-04E-2b-claude-audit.md`（**不用** `-claude-audit-report.md` 后缀——G2-04 检查 8a 对无 §3.1 台账行的 `-audit-report` 文件硬失败）。
> 数值口径纪律（A2A-N1）：本机 Win10 + Chrome/152.0.7977.77 + node v24.13.0 的一切数值**仅作机制核验**；预算判定与正式对账结论以 Win11 参考 VM 批次（Edge 150 签署环境、塌链深度 1、双标定门）为准，见 §3。

## 1. 范围对账（任务书 §5.2 逐项）

| §5.2 项（ADR-0014 四项实测） | 落地 | 证据 |
|---|---|---|
| ① 局部编辑只重渲染受影响页（真增量） | 控制器 `pageRangesPrinted` 诚实插桩逐轮记录真实打印区间；工装对账确认窗页=受影响页；判定器 G3 拒「印满全文却报增量」（变异 M-a 实证变红） | `incremental-controller.ts`、`verify-a04e2b-harness.mjs` G3 |
| ② 局部编辑响应 ≤1s（30 页语料） | **VM 实测未达成**：p95=4370.7ms（30 样本，min 1691.9），结构性超限 ~4.4×（§3.1）；本机机制值曾显示早/晚段 ~0.9s 但 A2A-N1 口径下不作预算证据 | VM run-2b-5 `summary.txt`/`verify-harness.log` |
| ③ 全量重排期间 UI 不冻结 + 可取消 | 每轮演示：标题编辑→full-required→后台整份中 UI 探针 3 击（本机延迟 0.8–1.9ms、maxGapMs 1.9–2.3ms）→真实按钮取消→`PDF_EXPORT_CANCELLED`→同会话立即复跑成功 | 工装 cancelDemo 记录、判定器 G6 |
| ④ 增量结果与整份重排逐页等价 | 每编辑对整份重渲独立参照逐 run tag-free 对账（F2 口径：font.tag 是 print 会话产物，探针实证 1783/6169/4344 全 mismatch 含 tag、零差异不含 tag） | `a04e2b-harness-reconcile.ts`、判定器 G4/G5 |
| 语料 30 页/30000 字（21 页冒充 30 页即 BLOCKER） | 官方生成器重建 30 页语料，sha256 钉死 `4dedb1c2…b6258`（与 2a 同语料）；批次脚本逐位比对拒跑 | `vm-a04e2b-pass.ps1` source-hash 门 |
| §5.3 变异自证（定宽失效/输出不变对账/取消真取消/缓存失效正确，每条因正确原因变红） | M1–M5 全红回退（§5） | 就地注入/回退，无独立留证目录（§5 声明） |
| 不接受「跑 N 次没红」 | 判定器自身经三条决定性变异证有牙（M-a 假增量/M-b2 槽位调包/M-c 取消谎报，全因正确原因变红；M-b 首轮尾随字节为**非决定性输入**已如实登记——证据键基于提取 run 而非容器字节） | 本记录 §6 |

## 2. 交付物

- **核心实现**（`packages/pdf-export/src/`）：
  - `incremental.ts`（370 行）：增量分页纯逻辑核——锚定定位（`resolveEditAnchor`/`locateAnchorPage`，零命中/多命中 fail-closed）、哨兵级联窗口评估（`evaluateCascade`，终止性由 EOF 收束保证）、目录页码更新（`updateTocPages`/`recomputeTocPagesAfterWindow`）、tag-free run 键（`runKeyTagFree`）。
  - `incremental-controller.ts`（387 行）：IO 驱动半。页槽缓存=旧整份终态字节+窗格 PDF，**不做跨文档 PDF 拼接**，终稿导出永远走整份签署管线；逐页证据索引随每次增量成功就地合并更新；delta≠0 诚实退 full-required（不发明旧尾页改号压印）；窗格产物不压印（机制实证：ranged print 字体子集只含窗页字形，页眉字符无忠实字形，resolveStampReps fail-closed）。
  - `incremental-state.ts`（141 行）：预览状态构建与合并纯函数（file-size 门拆分，零语义改动搬迁 + 后续 `applyWindowToState` 同归口）。
  - `render-full.ts`：整份渲染独立路径——full-required 回落的后台整份重排 + 增量测试的独立参照 oracle。
  - `prepare-context.ts`：管线装配段提取（ExportContext + prepareExportContext），pipeline.ts 改为调用；**恒等性实证：重构前后 normalized sha 全等 `22DDEAE0…2069`**；BaselineOutput additive 加 `contentBytes`/`stampSpec`/`fixtureRoot`。
  - `errors.ts` 新增 `PDF_EXPORT_INCREMENTAL_FALLBACK`（诚实降级信号，非错误态）。
- **测试**：`test/incremental.unit.test.ts` 22 例（纯逻辑全分支 fail-closed 反例）+ `test/incremental.render.test.ts` 3 例（真实 Chromium 端到端：真增量+对账 / 取消真取消+会话复用 / 目录条目集变化诚实 full-required）；包全量 **115/115 绿**。
- **验证工装**（决策 #25 D1，横幅明示非产品 UI，不得演化）：`scripts/a04e2b-harness.ts` + `-page`/`-edits`/`-reconcile`/`-cancel`/`-ui` 五子模块（共 ~1064 行）。真实 TransactionManager 事务链编辑；窗格 PDF 注入工装页页槽（静态服务器 URL + `?v=` 缓存破坏 + `#page=k` 锚定）；槽位 PDF 全落盘 `slots/`；只测量记录，判定归 VM 批次脚本。
- **判定与批次工具**（`tools/a-04e/`）：`verify-a04e2b-harness.mjs`（G1–G6 机械判定 + 指标输出，判定器有牙经 §6 三变异实证）、`vm-a04e2b-pass.ps1`（VM 全门批次：塌链 attest/锚定/900s 沉降/离线 install/输入 sha/双标定/签署基线等价门/预算判定收尾）、`startup-bootstrap-2b.cmd`；`scripts/a04e2b-slot-keys.ts`（槽位证据键 CLI 出口，算法真源在 src）。
- **机制探针留证**：`scripts/a04e2b-incremental-probe.ts`（CDP pageRanges 直透/成本随窗缩放/ranged print 大纲无绝对 Dest 页码→目录页码须内容流内测量/tag 是 print 会话产物）、`scripts/a04e2b-pageranges-oob-check.ts`（越界语义：全越界报错、部分越界截断）。
- **依赖边界**：`@wenshu/editor-transactions` + `@wenshu/semantic-editor` 仅为 pdf-export **devDependency**（auxiliary 规则集合法）；生产依赖零新增，供应链零新增。
- **批次证据**：VM 批次原件（见 §3，跑批后登记 zip sha256 双向核验）。

## 3. VM 批次（预算判定与正式结论的唯一来源）

> **已跑：run-2b-5 全链批次完成**（§3.1），证据 zip 双向核验落
> `artifacts/perf/2026-09-12-A-04E-2b/`（gitignored 惯例同 PA-13/2a）。
> 跑批规程（备查）：宿主 `vm-chain-depth-check.ps1`（签署层配置+NIC 断开硬检查）→ 注入 payload → 引导 attest（同次引导 CHAIN-DEPTH-1.txt）→ `vm-a04e2b-pass.ps1` 全门批次 → 证据 zip 双向核验回本机。
>
> 批次内门序：塌链 attest → main 锚定逐位（`f64f348`）→ node v24.17.0 → 900s 沉降 → 离线 install → env:record 四步 → 输入 sha → **批前标定**（签署带 [20553.4, 24300.2]）→ 工装 10 轮 → 判定器 G1–G6 → 签署基线等价门（本棒重构 pipeline.ts 装配段，签署路径零回归实证）→ **批后标定** → 预算判定收尾（p95(增量编辑 totalMs，30 样本) ≤ 1000ms；不达标即 BUDGET_NOT_MET 如实登记，决策 #18 D3 不 DEGRADE）。

（跑批后在此回填：批次号、双标定值、p95 与分区 p95、G1–G6 结果、等价门结果、预算结论。）

### 3.1 run-2b-5（正式批次，分支锚 `dfeb13e`，zip sha256 `96511213…f5427` 双向核验一致）

- **门序全绿至收尾**：attest/锚定（main=`f64f348` 逐位）/node v24.17.0/900s 沉降/离线 install/env:record 四步/输入 sha 逐位/**批前标定 23148.06 ∈ 带 ✓** → 工装 10 轮 → 判定器 G1–G6 **PASS** → 签署基线等价门 exit 0（normalized sha `4010C7FD…E03A`，与 2a 两批逐位一致；vs 签署基线 `816B8EE9…B6C8` 不等属已登记增量更新结构，等价门为视觉不变性硬证）→ **批后标定 20308.97 破下限 -1.2%**（带 [20553.4, 24300.2]）→ STATUS=`CALIBRATION_DIVERGED_POST`，批次脚本如实登记、证据链未截断（决策 #18 D3 形态）。
- **ADR-0014 四项实测结论**：
  - ① 真增量：**达成**——G3–G5 绿，30/30 编辑 kind=incremental，pageRangesPrinted 证实只打窗页（早 7-8 / 中 13-14→13-15 级联扩窗 / 晚 21-22），无一轮印满全文。
  - ② ≤1s 局部编辑：**未达成**——p95(30 样本)=**4370.7ms**（min 1691.9；分区 p95：早 2034.8 / 中 4430.8 / 晚 2411.4）。分解（run-01 代表）：compose ~6ms + navigate ~550ms + ranged print ~1400–2060ms/轮 + post ~55ms；归因权威口径=VM 两点线性分解（固定 ≈509ms+边际 ≈501ms/页，见[分析文档](../research/A-04E-2b-1s预算超限归因与加速路径.md) §2.2 与 §0 更正记录）。结构性超限 ~4.4×，任何环境修正因子不改变结论。**业主裁定（[决策 #27](../../决策记录.md) D1）：永久登记未达成，台账不得被任何后续裁定追认。**
  - ③ 后台整份期间 UI 不冻结+可取消：**部分达成**——UI 探针 3 击延迟 ≤3.1ms、事件循环 maxGap ≤37.2ms（不冻结达成）；取消真实生效（10/10 `PDF_EXPORT_CANCELLED` + 同会话复跑成功 + 旧槽位零替换），但 **settleAfterClick 稳态 3.7–4.1s > 2s 预算**（abort 阶段边界生效+在途整份打印剩余，已登记口径的 VM 量化）；run-01 冷启离群 266.7s（机理未完全解释，登记跟进）。
  - ④ 增量与整份重排等价：**达成**——每编辑 oracle 对账（窗页逐 run tag-free 全等、tocPages/pageCount 相等、编辑文本可见）+ 10 轮跨轮证据键全等（G5）。
- **批次史**：run-2b-1（标定导出 profile 清理竞态 exit 1，环境性）、run-2b-2（标定 27829.7 破上限 +14.5%，宿主争抢）、run-2b-3（25001.7，+2.9%）、run-2b-4（24341.3，+0.17%）→ 业主批准宿主 Defender 排除（D:\VMs + vmwp/vmms，微软 Hyper-V 官方实践）后 run-2b-5 批前入带。失败证据原件留 VM `C:\wenshu-out\a-04e\a04e-2b-incremental-v1-FAILED-run-2b-{1..4}`。
- **运行事故登记**：run-2b-4 归档改名在硬重启（Restart-VM -Force）中丢失（批次「证据目录已存在即拒跑」守卫当场拦截，未混证）；run-2b-5 改优雅关机并改名后核验。教训：断电式重启前的一切改名/写入必须重新核验。
- **批后标定破下限处置**：业主书面豁免翻正（[决策 #26](../../决策记录.md)，同 #23 形态：批后机器变快=批内读数偏高偏保守，②未达成与取消结案超限的结论方向不受任何环境修正影响；豁免仅限本次本方向，签署带未动）。

## 4. 本机机制核验数值（仅机制证据，不作预算结论）

- 工装 `--runs 2` 实跑（Win10 + Chrome 152）：早段 901/898ms（窗 7-8）、中段 1849/1880ms（窗 13-14→13-15 哨兵级联扩窗、两轮打印）、晚段 916/901ms（窗 21-22）；6/6 编辑对账全等（tag-free run 全等、tocPagesEqual、pageCountEqual、editedTextVisibleInWindow）。
- 取消演示：full-required reason=toc entry set changed；探针 3 击延迟 0.8–1.9ms；maxGapMs 1.9–2.3ms；settleAfterClickMs 1176/1153（含在途打印剩余——取消语义如实登记：printSession 未挂 session 级 signal，abort 在阶段边界生效）；复跑成功、旧槽位零替换。
- 探针：两页窗 734.9ms / 六页窗 116.5ms vs 全量 1820ms（成本随窗缩放）；"31-31" 全越界报错、"29-32" 截断 2 页。
- 判定器对 2 轮本机证据 G1–G6 全绿，p95-incremental-totalMs=1880.8（本机口径）。

## 5. 变异自证（§5.3：每条因正确原因变红，不接受「跑 N 次没红」）

| 变异 | 改动 | 预期拦截点 | 结果 |
|---|---|---|---|
| M1 定宽失效 | `locateAnchorPage` 接受多命中（删唯一性 fail-closed） | 锚定歧义不再退 full-required | 2 测试红 ✓ |
| M2 级联失效 | 哨兵不一致也收束（删扩窗分支） | 级联扩窗测试红 | 红 ✓ |
| M3 对账失明 | `runKeyTagFree` 纳入 font.tag | render 对账测试红（tag 跨打印必然漂移→证明对账在比对真东西） | 红 ✓ |
| M4 页码漂移失明 | 窗后目录条目不移位（删 +delta） | updateTocPages 测试红 | 红 ✓ |
| M5 缓存失效错误 | 窗页证据不合并（旧缓存残留冒充新态） | render 测试红 | 红 ✓ |

回退形态声明（如实）：变异以就地锚定编辑注入、变红后逐条回退，无独立留证目录；回退正确性以全量测试复绿（115/115）+ 关键段复读确认。变异定义在表中精确定位，审计者可独立重放（2a 先例：审计者亲手重放变异矩阵）。

## 6. 判定器决定性变异（verify-a04e2b-harness.mjs 自身有牙）

| 变异 | 结果 |
|---|---|
| M-a 报告造假：编辑 1 的 pageRangesPrinted 篡改为 `1-30`（全量打印报增量） | 红 ✓（G3「printed span 30 covers whole document」+ updatedRange 不一致 + G5 跨轮分叉，三处同红） |
| M-b 槽位 PDF 尾随追加一字节 | **未检出——非决定性输入，如实登记**：证据键基于提取的 tag-free run 序列而非容器字节，`%%EOF` 后垃圾不改变提取证据；改为 M-b2 |
| M-b2 槽位调包：edit-3 窗格冒充 edit-1 窗格 | 红 ✓（G5 跨轮 windowKey 分叉，两键值并列输出） |
| M-c 取消谎报：errorCode 篡改 + oldSlotsUntouchedDuringBackground 置 false | 红 ✓（G6 双条款同红） |

## 7. 已知边界（如实登记，非缺口）

1. **affectedNodeIds 口径偏差**：rewriteBlock 的链上 affected 集含父节 id，父节标题同现目录页与该节页，控制器锚定多页命中会 fail-closed；工装传 controller 的是文本实际变更的叶块 id（与 render 测试同形态），链上逐字结果记于 `edits[].chainAffectedNodeIds`。
2. **取消语义**：printSession 未挂 session 级 signal（保留同会话复跑能力），abort 在管线阶段边界生效，结案耗时含在途打印剩余（本机 ~1.1–1.2s）。
3. **headless Chromium `<embed>` PDF 查看器截图空白**（Chrome 152 实测）：槽位 src 切换与事件记录真实发生，全部槽位 PDF 落盘供直接查验；不以截图作内容证据。
4. **窗格产物不压印**：ranged print 字体子集只含窗页字形，页眉 short_title 字符无忠实字形表示（resolveStampReps fail-closed 实证）；预览显示层以绝对页码 DOM 覆盖页眉页脚（工装职责，决策 #25 D4）；终稿导出永远走整份签署管线。
5. **delta≠0 诚实退 full-required**：本棒不发明旧尾页改号压印（ADR-0033 D4 边界）。

## 8. 验证清单（完成声明只列实际执行）

- `pnpm --filter @wenshu/pdf-export test`：**115/115 绿**（113 既有+重构后 + 2 新增 recomputeTocPagesAfterWindow 用例）。
- `pnpm quality:check`：绿（501 source/config files；incremental-controller.ts 417→387 行拆分后过 file-size 门）。
- `pnpm verify`：**exit=0**（2026-09-12 本机，含全部新工具脚本；期间修复两处拦截——file-size 门 incremental-controller.ts 417→387 行拆分、eslint no-undef 补 `URL` 显式导入）。
- 变异自证 M1–M5：全红回退（§5）。
- 判定器变异 M-a/M-b2/M-c：全红（§6）。
- 工装本机 `--runs 2` 实跑：6/6 对账全等（§4）。
- VM 批次：**run-2b-5 全链跑通**（G1–G6 PASS、等价门零差异、批前标定入带）；② 未达成（p95=4370.7 > 1000）、取消结案 3.7–4.1s > 2s、批后标定破下限待业主裁定（§3.1）。
