# PA-10 图片/题注/来源/比例/越界检查 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-26
> 实施基线：PR #19 分支 `pa-10-figure-checks` tip `2578249`；base `origin/main`
> 远程验证：run `30233990326` **8/8 pass**（ubuntu-24.04，skipped=0）
> 审计方法：仓外 worktree 隔离安装、**独立触发 fidelity 红线/aspect 失真 + 分域零重判核 + 诚实门核 + 基线对齐官方**；探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PA-10 通过,可合并 PR #19。** 无 BLOCKER/MAJOR/MINOR。承接项 PA-L1~L4(非发现)入 PA-12。

- **转换红线(本门命门)是真 verbatim 对账**:图成员 run 逐字比源 SVG——篡改图例/光栅化/换图必触发 `P1_FIGURE_CONTENT_MISMATCH`,不可静默。
- **比例正确**:基线 2 图 paintBBox 宽高比与源 SVG viewBox **精确相等**;失真检出、贴容差合法、无 viewBox 降人工。
- **分域零重判**:figure 几何越界/遮挡仅 PA-07 负责,PA-10 无任何几何码、零重域。
- **诚实门**:清晰度逐图降人工、绝不入 findings;基线 0 自动发现、2 legibility 人工核验。
- 消费 v1.1.0 证据(禁重解析/禁 mock)+ 文档图结构 + 源 SVG(零依赖白名单解析);零新增第三方依赖;冻结物零漂移。

## 2. 转换红线 · fidelity（命门,独立 + CI 双证）

`p1-figure-fidelity` 把图成员 run(`figureMcid` 解析期成员事实)归一拼接**逐字对账源 SVG 文本**(PA-05 `normalizePdfText` 口径)。我独立注入:

| 注入 | 结果 |
|---|---|
| 篡改一个成员 run 文本 | `P1_FIGURE_CONTENT_MISMATCH` ✔ |
| 光栅化(删该图全部成员 run) | `P1_FIGURE_CONTENT_MISMATCH` ✔（丢矢量文本必现） |
| 成员 run 字体未嵌入 | `P1_FIGURE_FONT_NOT_EMBEDDED` ✔ |

CI 同证:`altered legend text is detected (conversion red line)`、`rasterized figure (no member runs) cannot pass silently`、`non-embedded member font is detected`。**红线"转换改变内容/来源即停"必然触发,无法伪装通过**;基线直渲 SVG 无转换、停止条件如实不触发。与 p0-content 分域书面证成(p0=全局有序存在性;本规则=逐图绑定对账,可识别"文本全局仍在但绑错图"),单点篡改两面如实并报。

## 3. 比例、题注/来源、分域、诚实门

| 门禁 | 结果 |
|---|---|
| **比例基线** | 源 viewBox 比 1.7647/2.3077 = paintBBox 比 **精确相等**（偏差~0）→ 0 aspect 发现 ✔ |
| 比例失真 | paintBBox 宽减半 → `P1_FIGURE_ASPECT_DISTORTED@7` ✔（CI `distortion…detected`、`in-tolerance legal`） |
| 无 viewBox | fail-closed 降 `P1_FIGURE_ASPECT_REVIEW` 人工 ✔（CI `missing viewBox…never a finding`） |
| 题注孤立 | `P1_FIGURE_CAPTION_SEPARATED` 检出+定位（CI `caption isolated to next page detected and located`） |
| 来源孤立/越页/次序 | 检出（CI figure-source 用例，模板 `figure_keep_with_caption` 溯源） |
| **分域零重判** | figure 越界/遮挡仅 PA-07；PA-10 无几何码,实测 figure 越界注入 PA-10 零几何 finding ✔ |
| **诚实门** | legibility 仅 `manualChecks`、绝不入 findings；基线 0 自动 + 2 legibility 复核（我实测 = 官方 figureReview=2）✔ |

## 4. 严重级、门禁、供应链

- **严重级证成 sound(ADR-0009)**:内容/字体/比例缺陷**不阻断渲染、不缺字全局、不越界不遮挡(PA-07 P0 域)**,属图文呈现质量 → **P1**。分域正交(几何=PA-07 P0;逐图对账=PA-10 P1;全局存在=p0-content)。
- **阈值溯源**:aspect 容差 0.01(ADR-0009,基线偏差<0.0001,余量两数量级);题注门 `figure_keep_with_caption` 取模板;源比取源 SVG viewBox(声明式,零依赖白名单解析,禁几何启发式)。
- **门禁**:report-checks **120/120**(含 8/8 决定性变异);PR CI **8/8**(ubuntu,skipped=0);`pnpm verify` exit 0;PA-08 人工钉数与既有规则不回潮。
- **供应链/冻结**:零新增第三方运行时依赖,SBOM **160→160**;证据契约 v1.1.0/基线/字体/模板/源 SVG **零漂移/零改动**;诊断只带定位(页/figure ref)+数值依据,不回显正文。

## 5. 承接项（非发现,入 PA-12）

- **PA-L1**:图 legibility 2 项人工核验(承接 PA-J1 口径,自动检出只计 findings、manualChecks 不并入)。
- **PA-L2~L4**:实施方 followups 登记的其余承接项(比例/来源/转换留痕相关)——PA-12 送审时我随 PA-J1/PA-K1 一并复核是否真实承接、是否落入 12 fault 样本或人工清单。均非阻断。

## 6. 结论与交接

**PA-10 独立审计 PASS,可合并 PR #19。** 合并由业主/Codex 执行。

- 未关闭且不阻断:PA-A7、PA-J1、PA-K1、PA-L1~L4——全部挂 PA-12 汇总闸门送审时由我复核真实承接。
- **PA-11(目录/页眉页脚/页码,串行)开工前置解除**,PA-10 后接;PA-07/08/09/10 汇入 PA-12。
- 提醒下游:图片检查消费 v1.1.0 证据(figure paintBBox/成员 figureMcid)+ 源 SVG viewBox;转换红线针对内容/来源忠实;分域正交于 PA-07 几何。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
