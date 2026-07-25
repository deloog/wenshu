# PA-06 提取 PDF 页面/文本/几何证据模型 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-25
> 实施基线：PR #12 分支 `pa-06` tip `fd297de`；base `origin/main`
> 远程验证：PR #12 run `30152032330` **8/8 pass**（ubuntu-24.04）
> 审计方法：仓外 worktree 隔离安装、**独立重放几何交叉验证 + 独立跑失败分类 + 供应链许可核 + PA-F3 变异机理核**；探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PA-06 通过，可合并 PR #12。** 无 BLOCKER/MAJOR/MINOR。交付强、诚实留痕到位。

- **命门（几何独立交叉验证）经我独立重放确认**：自写解析器 vs 独立 pdfjs-dist，**20 页 / 350 行 / 2 figure 几何不一致 = 0**，容差紧、CI 门禁化。
- **首次引入的第三方依赖处置正确**：pdfjs-dist 是 **devDependency（仅测试 oracle）**，运行时解析器仍零依赖自写；13 新包全 Apache-2.0/MIT。
- 证据模型作为 PA-07~12 的**版本化共享契约**已冻结；失败四码 fail-closed；PA-F3 搭车门禁到位。

## 2. 几何交叉验证（命门，独立重放）

我在仓外 worktree 独立跑 `oracle-crosscheck.ts`（自写几何 vs pdfjs-dist）against 入库签署基线：

- 结果：`ok:true`，**pagesChecked 20 / linesChecked 350 / figuresChecked 2，mismatches = 0**，actualTextDivergences = 11（独立文本类）。
- **容差紧、非松刷**：行基线/行起点 x **0.5pt**、行宽 **1pt**、页 1pt、figure 2pt（ADR-0005 书面化）。0 不一致有含金量。
- **CI 门禁化**：`independent oracle confirms page boxes, text line geometry and figure boxes` 在 **ubuntu-24.04 实跑 1919ms 通过**（skipped=0）——pdfjs-dist devDep 在 linux CI 安装、交叉验证真跑，非本地专属。
- **pdfjs-dist 真独立**：Apache-2.0，与自写检查器零共享代码，是合格的第二解析器 oracle。
- **页几何双独立源**：除 pdfjs-dist 外，页框 594.96×841.92 我在 PA-05 已用**原始字节 MediaBox** 独立确认。

**11 文本分歧经我核为良性,不藏错**：分类逻辑（`oracle-crosscheck.ts:99-108`）——文本差异仅当**自写行有 ActualText** 才记信息项，否则是硬 mismatch。而自写文本又被 `assertPdfReconciled` **逐字钉死到 golden-report.md**（承接 PA-05 归一口径）。故 11 处必是 pdf.js 回退 ToUnicode 部首形（pdf.js 一侧不完整、自写一侧对），**反向证实 ActualText 是文本层承重语义面**；双重保险（源对账 + 交叉验证）使这些分歧不可能掩盖自写解析器的错误。

## 3. 供应链（pdfjs-dist 引入，独立核）

- **依赖类型正确**：`pdf-evidence` 运行时依赖仅 `contract-runtime`/`pdf-export`（workspace）+ `ajv`；**pdfjs-dist 在 devDependencies（catalog）**——只做测试 oracle,**不进运行时**,证据模型的生产解析器仍是 pdf-export 自写零依赖几何。供应链面因此轻。
- **13 新包许可全过闸**：`pdfjs-dist@6.1.200 = Apache-2.0`、`@napi-rs/canvas@1.0.2` + 11 平台二进制 = MIT——全在 R-LICENSE 允许集（MIT/Apache-2.0/BSD/OFL）。SBOM **147→160**，字节比对一致。
- **跨平台许可覆盖**：`license-overrides.ts` 为 os/cpu 特定可选二进制补覆盖（win32 本机装 / linux CI 不装,两侧都覆盖）——SM-01 教训的正面执行。
- **`pnpm audit` 2 high 属存量**：`fast-uri`/`brace-expansion` 我核实 **PA-06 前 main 已含**,非 pdfjs-dist 引入,诚实留痕属实。

## 4. 失败分类、契约、范围（独立核）

- **失败四码 fail-closed（我独立喂 fixture 跑）**：`empty→PDF_EVIDENCE_EMPTY@file`、`encrypted→ENCRYPTED@trailer`、`truncated→MALFORMED@eof`、`foreign-filter/producer→UNSUPPORTED@structure`（自写检查器拒非自家管线结构）；valid 签署基线 →ok 20 页。均稳定 code+location,不回显内容。
- **契约稳定**：`EVIDENCE_VERSION 1.0.0` 冻结常量 + 生成漂移门禁 + 合法/畸形 23 契约测试;evidence.schema.json 版本化,供 PA-07~12 依赖形状。
- **范围纪律**：证据模型零质量判定字段（纯提取几何/文本,不判 P0/P1）;`pdf-export` **只增不改**——新增 `geometry.ts`/`geometry-text.ts`,`inspect.ts` 仅将 `PdfObject`/`parseObjects`/`inflate`/`decodePdfString`/`parseToUnicode` 由私有改 export（零逻辑改动,供 pdf-evidence 复用）,**PA-05 签署面零回归**（pdf-export 29/29）。

## 5. PA-F3 搭车门禁（我锚定的子门禁，已关闭）

- 机理**真决定性**：mutation 测试复制真实 src → **单点锚定变异（锚点缺失/不唯一即 fail-closed,与源绑定）** → 动态导入 → 断言守卫失败。非摆设。
- 覆盖 13 例（元数据 5 / 对账 3 / 排序 1 / 对齐 2 / 修复 2），纳入 pdf-export 本包 **29/29**；ubuntu CI 亦见 `repair fast path red` 等实跑。
- 我在 PA-05 已独立变异确认元数据/对账守卫承重,PA-F3 把决定性测试写进本包,防未来重构静默剥离——**PA-F3 关闭**。

## 6. 门禁、冻结物、完整性

- 本机套件:pdf-evidence **39/39**、pdf-export **29/29**（真实 pdfjs-dist oracle + 真实几何）;PR CI **8/8**（ubuntu,skipped=0）。
- **入库签署基线完整性**:`packages/pdf-evidence/fixtures/baseline/golden-report-baseline.pdf` 的 **SHA-256 = `d18da69f4663…aece6dfd`,与签署产物逐位一致**——CI 现以真实签署基线作 SHA 锚定 fixture 消费。
- **冻结物零漂移**:字体/既有 schema/PA-05 baseline 脚本/生成物未动(仅 pdf-evidence 自身新 schema/生成物)。
- **诚实留痕核实属实**:首轮 CI 两红(test-results 不入库致基线缺失 → 已提交不可变 SHA 锚定副本;win32 许可单边 → 已补双平台)修复于 `5c14648`,SM-01 正面执行(触碰 lockfile/SBOM 即推、问题当轮暴露)。渲染测试本机 Chrome(非锁定 Edge)属声明的只读消费签署产物。

## 7. 发现

无阻断/MINOR 发现。一处口径承接登记(非新问题):证据模型文本正确性与 §2 分歧分类均依赖 `normalizePdfText`(部首→CJK、NFKC、去布局空白/格式字符)——文本保证是"**modulo 该书面归一**"的等价,承接 PA-05 §3 已登记口径;几何保证(0 不一致)则是紧容差下的强独立验证,不受该口径影响。

## 8. 结论与交接

**PA-06 独立审计 PASS,可合并 PR #12。** 合并由业主/Codex 执行。

- 证据契约(evidence.schema.json 1.0.0)已冻结,**PA-07/08/09/10 可按波次并行消费**;PA-11(目录/页码)串行。提醒下游:文本语义面 ToUnicode+ActualText(poppler CJK 为零,已复证)、几何自写解析已经 pdfjs-dist 独立背书(0 不一致)、失败四码可依赖。
- 未关闭且不阻断:PA-A7。PA-F1/F3 已闭合,PA-G1 已由 Codex 更正(留一处可选精度点,见 PA-05 报告)。
- **业主待办**:`docs/audits/PA-05-claude-audit-report.md` 的 VM 复核附录 A（我上轮所写、约 30 行）仍未提交（实施方正确地未触碰审计者文件）,请提交入库;另主工作树当前在 `pa-06` 分支,本报告为未跟踪文件,提交请落 main、主树复位 main。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
