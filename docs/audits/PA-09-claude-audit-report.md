# PA-09 表格跨页/表头重复/行切断检查 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-26
> 实施基线：PR #16 分支 `pa-09-table-checks` tip `7668291`；base `origin/main`
> 远程验证：run `30208719792` **8/8 pass**（ubuntu-24.04，skipped=0）
> 审计方法：仓外 worktree 隔离安装、**独立复现两类 fault + 结构误判防线核 + fail-closed 诚实核 + 停止条件核**；探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PA-09 通过,可合并 PR #16。** 无 BLOCKER/MAJOR/MINOR。一处诚实登记边界 **PA-K1**(承接项,非发现)。

- **结构误判致漏检(本门命门)防线成立**:证据无表结构,行/列/表头从 DOM 对账重建;子串撞名/同文单元格/换行/列宽不均全部正确归属,歧义 **fail-closed 降人工、不猜不藏**。
- **两类 fault 我独立复现全检出+定位**:续页表头缺失→`P1_TABLE_HEADER_NOT_REPEATED@12`;行切断→`P1_TABLE_ROW_SPLIT@11 .../rows/3`;签署基线 0 表格自动发现、0 结构复核。
- **停止条件不伪装**:基线唯一跨页表(7×4,p11→p12)续页表头真实重复、行未切断,风险评审如实判定不触发。
- 消费 v1.1.0 证据(类型级禁重解析/禁 mock)+ 文档表结构 + 模板 table 规则(validateTemplate 受控路径);零新增第三方依赖;冻结物零漂移。

## 2. 结构误判防线（命门,独立 + CI 双证）

证据是纯几何 run(无表结构),行/列/表头身份只能从文档侧 DOM 对账重建——"表结构误判致漏检"是路线图给 PA-09 的核心风险。归属三重防线(run 边界对齐 / 反向文档序游标 / 几何一致性:同格同页单块序 + 列带相邻不重叠),任一不过即歧义 **fail-closed**。我实测基线跨页表 **violations=0**(干净归属);CI 在 ubuntu 逐条 gate 全部防线:

| 防线 | CI 用例(ubuntu ✔) |
|---|---|
| 子串撞名(短单元格撞标题内部) | `embedded substring inside a single long run is rejected` |
| 同文单元格 | `duplicate text…loses to table occurrence`、`duplicate cell texts resolve by reverse document order` |
| 换行 + 列宽不均 | `wrapped multi-line cell and skewed column widths stay consistent` |
| 块序歧义 | `mixed block order within a cell fails closed` → `P1_TABLE_STRUCTURE_REVIEW` |
| 列序/列带歧义 | `inverted column x-order fails closed` → 人工,无自动判定 |
| 单元格文本缺失 | `cell text absent from evidence fails closed (no guessing)` |

**存活变异判定**:实施记录称"行内列 x 序"变异存活、作死码删除,理由"列带相邻不重叠 ⟹ 行内列 x 序必然成立"。此蕴含成立(列带 c 全域左于 c+1 ⟹ 任意行内 c 左于 c+1),且列带校验本身承重(`inverted column x-order fails closed` 用例 + 5 变异之一即其变红)——**是合法的逻辑蕴含删码,非覆盖缺口**。

## 3. Fault 检出、误报边界、分域（独立复现 + CI）

| 门禁 | 结果 |
|---|---|
| 续页表头缺失 | 删 15 个续页表头 run → `P1_TABLE_HEADER_NOT_REPEATED@12` 表根 ✔（我实测 + CI `missing header…flagged with counts`） |
| 行切断 | 移 1 数据 run 到前页 → `P1_TABLE_ROW_SPLIT@11 .../rows/3` 精确到行 ✔ |
| 整行同页跨页 | 合法不报 ✔（基线即此形态;CI `whole rows per page…is legal`） |
| 无表格 / 单页表格 | 零表格输出 ✔（CI `no-table…zero table output`） |
| 内容缺失 | 归 P0 域不夹带 ✔（CI `missing block…P0 domain, not P1`） |
| review 通道 | `*_REVIEW` 绝不入 findings（我实测 + 只在 manualChecks） |

## 4. 严重级、契约、门禁

- **严重级证成 sound(ADR-0008)**:两码 **P1**——续页表头缺失/行切断是排版质量缺陷,**内容仍在证据中(全 run 存在,非 `P0_CONTENT_MISSING`)、未越界未遮挡(非 PA-07 P0 域)**,只违反模板分页规则,与 ADR-0007 P1 口径一致。P0/P1 分域正确。
- **阈值溯源**:`table_repeat_header`/`table_row_break_inside` 取自 `validateTemplate` 受控路径;模板未承诺则规则空转。
- **门禁**:report-checks **93/93**(存量 73 不回潮 + 表格 14 单元 + 6 集成 + 5/5 决定性变异);PR CI **8/8**(ubuntu,skipped=0);`pnpm verify` exit 0;**PA-08 人工钉数 30 不回潮**;基线 0 表格发现。
- **供应链/冻结**:零新增第三方运行时依赖,SBOM **160→160**;证据契约/基线/字体/模板**零漂移**;诊断只带定位(页/表/行/单元格 ref)+数值依据,不回显正文。

## 5. 承接项 · PA-K1（诚实登记边界,非发现,须入 PA-12 风险册）

`headerRepeatedOnPage` docstring 诚实登记一个已知边界:**若续页首行数据与表头同文同列,文本+几何同构、不可区分**——此窄巧合下"表头未重复"可能被误判为已重复(潜在漏检)。基线存在"同列多行同值"单元格(ADR 记录),故该巧合并非纯理论。实施方已书面登记未藏。**诉求**:PA-12 汇总门禁的人工清单/风险册显式承接此边界(与 PA-J1 同机制),PA-12 送审时我复核其是否落入 12 fault 样本或人工核验覆盖。非阻断。

## 6. 结论与交接

**PA-09 独立审计 PASS,可合并 PR #16。** 合并由业主/Codex 执行。

- 未关闭且不阻断:PA-A7、PA-J1(PA-08 人工承接)、**PA-K1**(本报告新登记)。
- PA-09 是 **PA-12 汇总门禁**的表格来源(PA-12:P0 全检出、P0+P1≥10/12、正常误报≤2);人工核验项(表结构复核 + PA-K1 边界)须并入 PA-12/PA-14U 人工清单,自动检出只计 findings(承接 PA-J1 口径)。
- PA-10(图片)可在 v1.1.0 证据契约上继续并行;PA-11 串行。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
