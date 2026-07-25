# PA-06B 证据契约 v1.1.0 + 遮挡豁免成员制（PA-I1 关闭）· Claude 增量审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-25
> 实施基线：PR #14 分支 `pa-06b-figure-membership` tip `1ac8f57`；base `origin/main`
> 依据：[决策 #10](../../决策记录.md)（业主裁定选项 B）+ [PA-07-followups.md](PA-07-followups.md) PA-I1 + ADR-0006
> 远程验证：run `30163188651` **8/8 pass**（ubuntu-24.04，skipped=0）
> 审计方法：仓外 worktree 隔离安装、**独立构造漏检/误报/反几何决定性用例 + 独立重放 oracle（含 paintBBox）**；探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PA-06B 通过,PA-I1 关闭,可合并 PR #14。** 无 BLOCKER/MAJOR/MINOR。决策 #10 的命门(成员制=解析事实、非几何)达成且 CI 门禁化。

- **漏检关闭(决定性)**:非成员正文 run 落入 figure 绘制范围 → **P0_OVERLAP 检出**(PA-I1 原例)。
- **误报未回潮**:签署基线 **0 P0**;clip 撑大区(非绘制)不再触发。
- **成员制非几何(决策 #10 命门)**:豁免判据是 `figureMcid`(解析期结构事实);变异「成员标记改回 bbox-in-bbox」CI 变红。
- **paintBBox 算准**:oracle 与独立 pdfjs-dist **0 不一致(含 paintBBox 双侧比对)**——未算小去藏遮挡。

## 2. 决策 #10 命门:成员制 vs 几何(独立决定性验证)

新 `p0-overlap` 豁免改为 `sameFigureContent` = 两框 `memberOf` 相同（run 取 `figureMcid`、figure 取自身 mcid），遮挡判据从 `bbox` 改为 **`paintBBox`(绘制范围,clip 不计)**。我复用签署基线 v1.1.0 证据深拷贝注入:

| 用例 | 结果 | 意义 |
|---|---|---|
| 基线 | P0_OVERLAP **0** | 误报无（138 个图表标签为成员、正文非成员且不碰 paintBBox） |
| **① 非成员 run 进 figure paintBBox** | **P0=1 ✔** | **漏检关闭**（图 paint 覆盖正文=P0）+ **反几何**（几何进 paint 且非成员→检出） |
| ② 非成员 run 进 clip bbox 但出 paintBBox（x=538,仍在 493 宽 clip 内） | **P0=0 ✔** | paintBBox 是判据;clip 撑大区（1076 误报根因）正确不报 |
| ③ 成员 run（figureMcid=0）进 paintBBox | **豁免 0 ✔** | 成员制生效（成员 vs 非成员之别是**成员身份**,非几何） |

①③ 对照证明:同样"几何落入 paintBBox",**成员豁免、非成员判 P0**——差别是结构成员身份,不是几何。决策 #10 命门达成。

## 3. paintBBox 语义与准确性（命门:算小则图遮又溜）

- **语义正确性**:实施期实证(ADR-0006)——基线 figure bbox=版心全域(493×729)源于 span 内 `re W* n` **clip 矩形(不绘制)**,paintBBox=真绘制区(p7=421×239 / p9=421×183)。遮挡本就该看**绘制像素**,clip 不可见不遮挡。"非成员重叠 bbox→P0"会在基线产 ~1076 误报,与门禁②不可兼得;判 paintBBox 是**唯一双门同立**的语义。这是对决策 #10 实现的正确精化,非范围漂移(成员命门未触)。
- **准确性(独立)**:oracle `oracle-crosscheck` 与 **pdfjs-dist 独立比对 0 不一致(含 paintBBox 双侧)**——self-written paintBBox 与独立解析器的绘制范围一致,证明未算小；变异「clip 计入 paint」CI 变红（`paint extent red…`）。
- **边界事实 CI gate**:`clip paths grow figure bbox but never the painted bbox`、`figure with only clip content registers a zero painted bbox`（只 clip 无 paint 的图遮挡框为零,正确）。

## 4. additive 契约、零回归、门禁

- **additive v1.1.0**:textRuns 增 `figureMcid`;冻结 `evidence-1.0.0.schema.json` + 双生成物 + 双版本 validate;**「frozen 1.0.0 data stays valid under 1.1.0 reader」CI 绿**;`1.1.0 run missing figureMcid` 报 schema 违规(新字段在 1.1.0 必填);语义校验(成员引用完整性、paint⊆bbox)有正反 fixture。消费者重审记录于 ADR-0006;`report-checks` runner 对 1.0.0 证据 fail-closed(强制新契约)。
- **零回归(独立)**:oracle 20 页/350 行/2 figure **0 不一致**;PA-07 四类 P0 与同行/跨块/跨行豁免边界全绿(report-checks 39/39);pdf-export 35/35、pdf-evidence 47/47。
- **门禁**:PR CI **8/8**(ubuntu,skipped=0),命门测试(成员反几何变异、paint 排 clip 变异、additive、决策 #10 parse-fact)逐条 gate;`pnpm verify` exit 0;冻结物(签署基线 PDF/字体/fixture)**零漂移**;**SBOM 160→160,零新增依赖**;两新文件均 <400 行门。

## 5. 结论与交接

**PA-06B 独立增量审计 PASS。PA-I1 关闭**——图遮正文(含完全覆盖、不骑缝)现归 PA-07 P0 遮挡域并被检出;豁免为纯结构成员制,决策 #10 命门 CI 门禁化;证据契约 v1.1.0 additive 升级、消费者已重审。

- 未关闭且不阻断:PA-A7。
- **PA-08(P1 标题/孤行寡行)开工前置已解除**;PA-08/PA-09/PA-10 可在 v1.1.0 证据契约上按波次并行,PA-11 串行。
- 提醒下游:证据契约现为 **v1.1.0**（textRuns 带 `figureMcid`、figures 带 `paintBBox`);遮挡语义针对绘制范围;成员判定为解析事实。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
