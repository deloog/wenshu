# PA-08 标题/孤行寡行/异常空白 P1 检查 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-26
> 实施基线：PR #15 分支 `pa-08` tip `7404f76`；base `origin/main`
> 远程验证：run `30168494253` **8/8 pass**（ubuntu-24.04，skipped=0）
> 审计方法：仓外 worktree 隔离安装、**独立跑 P1 基线 + 通道完整性/灰区真实性/阈值溯源决定性验证**；探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PA-08 通过,可合并 PR #15。** 无 BLOCKER/MAJOR/MINOR。

- **诚实门(本门命门,路线图最难伪装的要求)达成**:自动判定只覆盖二值确定性事实,凡无确定性/无模板溯源的判定**如实降人工、绝不伪装自动覆盖**,且 auto/manual 契约级机器可分。
- **P1 四类自动检出**:标题分离/孤行/寡行/空页全检出并定位;签署基线**0 自动 P1**、误报有界。
- 阈值**逐项溯源冻结模板**(validateTemplate 受控路径,非内联);消费 v1.1.0 证据(类型级禁重解析/禁 mock);零新增第三方依赖;冻结物零漂移。

## 2. 诚实门（独立决定性验证 + CI gate）

路线图给 PA-08 的专门 FAIL:「无法确定性判断的降为显式人工检查,不伪装自动覆盖」。我独立复放 + CI 逐条确认:

- **通道完整性(我实测)**:签署基线 `findings=0, manualChecks=30`；**findings 无一个 `*_REVIEW` 码、manualChecks 全是 `*_REVIEW` 码**——自动与人工两通道干净分离,不串。空页 fault 注入后 `P1_EMPTY_PAGE` 入 findings、review 码仍只在 manual。
- **灰区是真的、非藏自动可判(我实测)**:heading 灰区首条 basis = `{followingLinesOnPage:1, templateKeepWithNextLines:2}`——真"1 后继行 < keepN=2"。这不是把清晰违规藏进人工:**0 后继行=自动 `P1_HEADING_SEPARATED`(违反 PA-04 实际承诺的 break-after:avoid≥1)**;1..N-1 行是"模板意图 keepN vs 已登记近似≥1"之差,渲染并未违诺,无确定性判据 → 降人工。CI:`1..N-1 following lines degrade to manual review, never a finding`。
- **稀疏零自定义阈值(设计+CI)**:模板只定义 `max_consecutive_sparse_pages`(连续页数),**未定义密度阈值**;实现绝不发明密度阈值,只对每页产 `P1_SPARSE_DENSITY_REVIEW` + 逐页密度证据供人工裁定。CI:`low-but-nonzero density stays manual-only (no disguised auto verdict)`、`acceptance 3: gray zone is manual-only…never disguised as pass`。

**判定**:这是对"不伪装自动覆盖"的模范实现——对测不准的东西不硬判、不发明阈值、如实附证据降人工,且通道契约级可分。

## 3. P1 自动检出与误报边界（独立 + CI）

| 门禁 | 结果 |
|---|---|
| 标题分离(0 后继行) | `P1_HEADING_SEPARATED` @正确页/块 ✔（CI acceptance 1） |
| 孤行(页尾 1 行 < orphans=2) | `P1_ORPHAN` 带 metrics ✔（CI） |
| 寡行(页首 1 行 < widows=2) | `P1_WIDOW` ✔（CI） |
| 空页(0 run + 0 figure) | `P1_EMPTY_PAGE` ✔（我实测 + CI） |
| **恰好 = 阈值分裂** | 合法、不报 ✔（CI `split exactly at the template threshold is legal`） |
| figure 成员 run | 排除(消费 v1.1.0 `figureMcid`)✔ |
| **基线误报** | **0 自动 P1**、manual 30(10 heading + 20 density,SHA 锚定稳定)✔ |

## 4. 阈值溯源、契约、门禁

- **阈值溯源**:widows/orphans/heading_keep = **2 均取自 `validateTemplate(...)` 受控路径**(我实测),CI `threshold traces to frozen template`——非内联硬编造。
- **契约 additive v1.1.0**:新增 `manualChecks` 人工通道;冻结 `check-report-1.0.0.schema.json` + 双生成物 + 双版本 validate;**`frozen 1.0.0 data stays valid under 1.1.0 reader` CI 绿**;**P0 运行器继续产 1.0.0 报告零漂移**(套件含 P0 非回归)。
- **门禁**:report-checks **73/73**(含 5/5 决定性变异、P0 非回归、P1 规则);PR CI **8/8**(ubuntu,skipped=0),诚实门/检出/阈值/additive/回滚/不回显正文逐条 gate;`pnpm verify` exit 0。
- **范围/供应链**:只吃 v1.1.0 证据(禁重解析/禁 mock);**零 P0/表格/图片夹带**(标题后接表格/图片跳过、留 PA-09/10);运行时新增仅 `@wenshu/template-model`(workspace,读模板阈值),**零新增第三方**,SBOM 160→160;冻结物(证据契约/基线/字体)**零漂移**;诊断只带定位+数值依据,不回显正文。

## 5. 结论与交接

**PA-08 独立审计 PASS。** 合并由业主/Codex 执行。

- 未关闭且不阻断:PA-A7。
- PA-08 是 **PA-12 汇总门禁**的 P1 来源(PA-12:P0 全检出、P0+P1≥10/12、正常误报≤2);**人工核验项(heading 灰区 + 逐页密度)须在 PA-12/PA-14U 人工清单中承接**,不得当作已自动覆盖。
- PA-09(表格)、PA-10(图片)可在 v1.1.0 证据契约上继续并行;PA-11 串行。
- 提醒:报告契约现 P0=1.0.0 / P1=1.1.0 双版本;P1 消费冻结模板 `pagination_rules` 阈值。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
