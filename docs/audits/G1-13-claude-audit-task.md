# G1-13 固定中文字体与许可证独立审计任务书（交给 Claude）

> 日期：2026-07-21　实施基线：`f352930` 之后的 G1-13 工作树变更　报告目标：`docs/audits/G1-13-claude-audit-report.md`

## 1. 角色与写入边界

你是独立只读审计者。不要采信实施记录、manifest、源码锚点、上游哈希或测试全绿自述；从 Adobe 官方来源和仓库原始字节独立取证。

- 只允许新增或修改审计报告 `docs/audits/G1-13-claude-audit-report.md`。
- 不得修改代码、测试、字体、LICENSE、manifest、lockfile、路线图、配置、Schema、生成物或其他文档。
- 仓库外探针只写 `D:\tmp\g113*`，结束后删除；不得安装系统字体、push、创建 PR 或触发 Actions。
- 完成时工作树除实施方既有改动外，只能多出审计报告一处审计者修改。

## 2. Adobe 官方来源与最小集合

独立访问 Adobe 官方 `adobe-fonts/source-han-sans` 仓库、`2.005R` release 和 tag tree，不以项目文档作来源：

- 核对 `19_SourceHanSansCN.zip` 的名称、50,700,226 字节和发布 API SHA-256；确认项目使用 tag 下 `SubsetOTF/CN`，不是镜像、第三方字体站、系统字体或相似名称字体。
- 对三个 OTF 和 LICENSE 从仓库字节重算长度、SHA-256 及 Git blob SHA-1，并与官方 tag tree 独立对账；至少用一种不同于项目校验器的脚本/工具复算。
- 确认仅 Regular/Medium/Bold 三个静态 OTF，未夹带 ZIP、下载分段、其他地区包、额外字重、可变字体或系统安装产物。
- 检查冻结模板实际声明 `Source Han Sans CN`、`2.005R`、400/500/700，项目没有为了适配下载结果修改冻结 fixture。

任一来源、版本、对象身份或采纳路径无法确定，应停止并判阻断，不能用“文件能打开”替代官方来源证明。

## 3. 许可证专项

逐字节比较项目 `LICENSE.txt` 与 Adobe tag 原件，独立确认 SPDX 为 `OFL-1.1`、版权年份/主体和 Reserved Font Name `Source`。检查：

- 项目随字体保留完整许可证，文档没有把 OFL 错写为“无条件免费”或把字体许可扩张为代码许可；
- 未修改字体后继续冒用保留名称，未单独售卖字体，后续分发义务和停止条件写清；
- 删除、替换、截断或自洽改写 LICENSE 时门禁真实失败，诊断不回显许可证大段正文或绝对敏感路径。

若许可证文本、许可结论或分发义务不清，至少 MAJOR；来源不明或无权纳入仓库为 BLOCKER。

## 4. 字体内部元数据与字符覆盖

用独立字体解析路径逐份检查三个真实 OTF，不能只检查 Regular 后推定其余两份：

- OTF/CFF 结构可解析；PostScript 名、版本字符串、`OS/2.usWeightClass`、glyph 数和最佳 cmap 数与清单一致。
- 按 `font-baseline.md` 的公开算法，从 `golden-report.md` 全文和两份 SVG 的真实文本节点重建必需字符集；不得把 XML 标记当正文，也不得静默漏掉中文、英文、数字、标点或符号。
- 独立重算 884 个码点和规范集 SHA-256，对每个字重分别求 cmap 差集，必须各自缺失 0；报告列出工具版本和复算结果。
- 说明这只证明冻结 fixture 静态覆盖，不把它冒充 PA-03 的真实浏览器加载、CSS 字重选择或 fallback 通过。

## 5. 清单、字节与文件系统反例

在 `D:\tmp\g113*` 仓库外副本运行真实文件系统反例：

- LICENSE 与三个 OTF 分别改变首/中/尾至少一处时均失败；恢复后通过。
- 删除、增加、改名、大小写碰撞、目录、文件 symlink、目录 junction、根目录 junction/symlink、manifest symlink 均 fail-closed；平台不可执行项如实列为未执行。
- manifest 缺失、空、畸形、超 64 KiB、少/多字段、少/多字重、重复/乱序、来源/版本/许可证/覆盖漂移均拒绝且使用稳定分类。
- 单改字体、单改 manifest、同步改字体和 manifest（包括更新长度/哈希使其自洽）均不能变绿；删除源码 manifest 锚点或文件集合相等守卫，应让对应回归测试因正确原因失败。
- 错误消息不得包含绝对临时路径、字体字节片段、LICENSE 正文或底层 ENOENT/EACCES；平面目录不得存在未受限递归、链接跟随或明显资源失控。

特别判断测试是否真实承重：改变/删除 SHA-256 比较、清单锚点、链接拒绝、精确文件集合、许可证比较中的每个核心守卫，现有测试是否会失败；被其他条件代打而从未命中的分支应登记覆盖缺口。

## 6. 门禁、依赖与范围诚实性

- 运行 `pnpm fonts:check`、`pnpm test:layers`、`pnpm test:contract`、`pnpm test:integration`、`pnpm typecheck`、`pnpm ci:job security`、`pnpm verify`，记录文件/测试计数。
- 确认根 `verify` 与 CI `security` 都真实执行 fonts，不只是字符串存在；删除/改名该命令应被测试发现。CI 仍为 8 个原作业，没有空层或假绿色新作业。
- 集成测试必须使用真实 OTF、磁盘和隔离 worker，不 mock 被验证的文件系统；本任务不涉及数据库，不要求也不得虚构真库通过。
- 新包全部 `src/test/scripts` 进入 strict typecheck；零手写 `any`/抑制，文件体量护栏满足；只声明直接使用的依赖，lockfile 仅增加新 workspace importer 而无意外版本漂移。
- 对比 `f352930`，冻结 PoC-A 原件、既有 Schema/生成物、workflow 和其他字体零漂移；确认没有 C 盘系统字体安装、镜像下载、费用或外部发布。

## 7. 结论规则

报告列出执行命令、独立上游证据、反例、未执行项、工作树边界及 BLOCKER/MAJOR/MINOR/NOTE：

- 来源/授权不明、任一已登记字体不是官方固定对象、冻结字符缺失却声称覆盖、字体/许可证可静默篡改、自洽双改可变绿、系统 fallback 被冒充通过，或根/CI 门禁可保持绿色地漏跑：`FAIL — G1-13 不得完成，PA-03 不得启动`。
- 无 BLOCKER/MAJOR，且 MINOR 均有明确归属和最迟关闭点：可给 `CONDITIONAL PASS`。
- 完全满足且无未关闭发现可给 `PASS`。审计者只给结论，不修改路线图或自行关闭任务；由 Codex 根据报告整改或完成台账。
