# G1-13 固定中文字体与许可证独立审计报告

> 日期：2026-07-21　审计基线：`f352930..2d9e4eb`（HEAD `2d9e4eb`「feat: freeze G1-13 Chinese font baseline」）
> 任务书：[G1-13-claude-audit-task.md](G1-13-claude-audit-task.md)　受审基线：[font-baseline.md](../font-baseline.md)、[实施记录](G1-13-implementation-record.md)
>
> 本报告由未参与实施的独立只读审计角色出具。上游身份直接向 Adobe 官方 GitHub（仓库、release、tag tree、release-asset digest）只读取证，字节/元数据/字符覆盖用独立于项目校验器的脚本重算；不采信实施记录、manifest、源码锚点或"全绿"自述。

## 1. 边界与方法

- **写入边界**：本轮只新增本文件一处。未修改任何代码、测试、字体、LICENSE、manifest、lockfile、路线图、配置、Schema、生成物或其他文档。
- **探针边界**：全部破坏性验证在仓库外副本 `D:\tmp\g113fp1`～`fp5` 中进行，结束后已全部删除。未安装系统字体、未 push、未创建 PR、未触发 Actions。
- **独立工具**：上游对账用 `gh api`（GitHub 官方只读）；对象身份用 `sha256sum`、`git hash-object`；OTF 结构用我自写的**裸字节 sfnt/table 解析器**（不经 fontTools）；字符覆盖用独立 Python 脚本重建，仅在读取 cmap 时借用 fontTools（与项目 TS 校验器不同的解析路径）。
- **工具链**：冻结 D 盘 Node `24.17.0` + pnpm `11.15.1`（命令加 `--config.verify-deps-before-run=false` 抑制 pnpm 跑前自动装依赖，不改变被测脚本、不放宽断言）。

## 2. 结论摘要

**结论：`CONDITIONAL PASS`**

未发现 BLOCKER 或 MAJOR。任务书 §7 的六条否决线——来源/授权不明、任一登记字体非官方固定对象、冻结字符缺失却声称覆盖、字体/许可证可静默篡改、自洽双改可变绿、门禁可保持绿色地漏跑——**逐条经反例验证均不成立**。

| 级别 | 编号 | 摘要 |
|---|---|---|
| MINOR | `FT-01` | 精确文件集合相等守卫是拦截"多一个未登记**文件**"的唯一决定性检查，却**无决定性测试**：现有集合测试只加未登记**目录**，被 per-entry 非文件守卫代打；删除集合相等守卫后多余文件可漏过，测试仍全绿 |
| MINOR | `FT-02` | manifest 字重唯一性守卫（`Set(weight).size !== 3`）**无测试覆盖**：删除后契约测试仍全绿（运行时集合相等兜底，非可利用漏洞，但守卫本身无单测） |
| NOTE | `FT-03` | OTTO magic、LICENSE 文本标记、字节长度、per-entry 非文件四个守卫均被上层 SHA-256/集合相等**完全遮蔽**，无独立测试；但在冻结锚点下不可达，属纵深防御 |
| NOTE | `FT-04` | manifest 记录的 `glyph_count`/`cmap_codepoint_count`/`coverage` 数值不在自动门禁内重算（门禁不依赖 fontTools），仅由字节哈希传递性保证；与 `font-baseline.md` §5 声明一致 |

三项发现均为测试覆盖决定性问题，字体真伪、覆盖真实性、守卫实际行为均已独立证实（见 §3–§6）。MINOR 归属与最迟关闭点见 §8。

## 3. Adobe 官方来源与对象身份（任务书 §2）

### 3.1 直接向 Adobe 官方只读取证

不以项目文档为来源，用 `gh api` 访问 `adobe-fonts/source-han-sans`：

- **tag `2.005R`** 解析到 commit `6c709ca72d3d7c46ab42ebecc1a26e7d69595a37`。
- **release asset `19_SourceHanSansCN.zip`**：GitHub 官方 release API 返回 `size=50700226`、`digest=sha256:3a769d1b082ebd813cdb4c06ea57d29b340bce548edcc8e61976b78ca28e6236`——与 manifest 的 `release_asset_bytes`/`release_asset_sha256` **逐字符一致**（这是 GitHub 自身计算的资产摘要，独立于项目）。
- **官方 tag tree `SubsetOTF/CN`** 实际含 7 个字重（ExtraLight/Light/Normal/Regular/Medium/Bold/Heavy）。项目只取 Regular/Medium/Bold 三个（400/500/700），**未夹带其余四个字重、可变字体或其他地区包**。

### 3.2 四个对象 blob SHA-1 与官方 tag tree 逐项对账

我用 `git hash-object` 独立重算仓库内四个对象的 Git blob SHA-1，并与官方 tag tree 的 blob SHA 对账（**同一算法两处独立计算**）：

| 文件 | 字节数（独立） | 官方 tag tree blob SHA-1 | 仓库 blob SHA-1 | SHA-256（独立）一致 |
|---|---:|---|---|---|
| `SourceHanSansCN-Bold.otf` | 8,569,308 | `49a623f3…af89` | `49a623f3…af89` ✔ | ✔ |
| `SourceHanSansCN-Medium.otf` | 8,406,556 | `d870b354…63fc` | `d870b354…63fc` ✔ | ✔ |
| `SourceHanSansCN-Regular.otf` | 8,429,224 | `5e660599…c682` | `5e660599…c682` ✔ | ✔ |
| `LICENSE.txt`（tag root） | 4,463 | `3ff0ccab…b8d4` | `3ff0ccab…b8d4` ✔ | ✔ |

blob SHA-1 与官方 tag tree**全部相等**，且是从 Adobe 官方仓库路径而非镜像/字体聚合站/系统字体取得。三个 OTF 的 SHA-256 也与 `font-baseline.md` 表格逐一吻合。

### 3.3 目录与冻结模板一致性

字体目录实际仅 5 个真实文件（3 OTF + `LICENSE.txt` + `font-manifest.json`），无 ZIP、下载分段、其余字重或系统安装产物（`git ls-files` 全仓库范围内仅这 3 个 OTF 为二进制字体对象，无任何 `.ttf/.woff/.zip`）。冻结模板 `formal-business.template.json` 声明 `Source Han Sans CN`、`2.005R`、400/500/700，与本字体族/版本/字重一致；实施方**没有为适配下载结果反改冻结 fixture**（`docs/poc-a/fixtures/` 在 `f352930..HEAD` 零漂移）。

## 4. 许可证专项（任务书 §3）

- 项目 `LICENSE.txt` 的 blob SHA-1 与官方 tag root **逐字节一致**（§3.2），SPDX 独立确认为 `OFL-1.1`。
- 正文首行 `Copyright 2014-2025 Adobe (...), with Reserved Font Name 'Source'`，含 `SIL OPEN FONT LICENSE Version 1.1` 与 `Reserved Font Name 'Source'`——保留名称 `Source`、版权主体 Adobe 均确认。
- `font-baseline.md` §3 **正确**表述 OFL 边界：随字体保留完整许可证、不单独售卖、不改字体后冒用保留名、不把 OFL 扩张为应用/PDF/代码许可，后续发布仍须保留声明。**未**把 OFL 错写为"无条件免费"，**未**把字体许可扩张为代码许可。
- 篡改反测（§5）：LICENSE 首/中/尾任一字节改动均 `FONT_LICENSE_INVALID`；SPDX 改 MIT、许可证换成非 OFL 文本、"自洽"改写（改正文并同步改 manifest 的 bytes/sha256）均因**清单锚点**返回 `FONT_MANIFEST_INVALID`；诊断不回显许可证正文，也不含绝对路径或 ENOENT。

许可证文本、结论与分发义务清晰，来源已确证有权纳入仓库，无 MAJOR/BLOCKER。

## 5. 字体内部元数据与字符覆盖（任务书 §4）

### 5.1 三份 OTF 独立逐份解析（裸字节，不经 fontTools）

我自写 sfnt/`name`/`OS/2`/`maxp`/`cmap` 裸字节解析器，逐份检查（不是只查 Regular 后推定）：

| 文件 | sfnt | CFF | PostScript 名 | 版本串 | usWeightClass | numGlyphs | 最佳 cmap 码点 |
|---|---|---|---|---|---:|---:|---:|
| Regular | `OTTO` | ✔ | `SourceHanSansCN-Regular` | `Version 2.005;addfeatures 5.0.0b21` | 400 | 31,072 | 30,926 |
| Medium | `OTTO` | ✔ | `SourceHanSansCN-Medium` | 同上 | 500 | 31,072 | 30,926 |
| Bold | `OTTO` | ✔ | `SourceHanSansCN-Bold` | 同上 | 700 | 31,072 | 30,926 |

全部与 manifest 的 `postscript_name`/`version_string`/`weight`/`glyph_count`/`cmap_codepoint_count` **逐项一致**；最佳 cmap 均为 `(3,10)` UCS-4 子表。（Medium 的 name ID 1 为 `Source Han Sans CN Medium`，属 OTF 排版子族命名惯例，manifest 记录的是排版族名 `Source Han Sans CN`，非缺陷。）

### 5.2 884 码点独立重建与逐字重差集

按 `font-baseline.md` §4 的公开算法**独立重建**必需字符集：读 `golden-report.md` 全文 + 用 XML 解析器提取两份 SVG 的真实文本节点（不把 XML 标记当正文）；排除空白与 general category 以 `C` 开头（控制/格式/代理/私用/未分配）的标量；去重升序、格式化为 `U+XXXX`、算 UTF-8 SHA-256。

- 重建结果 **884 个码点**，规范集 SHA-256 = `2dc1bf30ea2d8e61fdc58ef36d1c5cf0d35e1e381655a22cca130bc80c50973a`——与 manifest **数量与哈希均逐字符一致**。
- 组成分布（证明未静默漏掉任何类别）：CJK 表意 791、拉丁字母 47、数字 10、CJK 标点/全角 10、其他标点/符号 26。中文、英文、数字、标点、符号**都在**。
- 对三份字体最佳 cmap 分别求差集：Regular / Medium / Bold **各缺失 0**。

### 5.3 覆盖结论的边界

上述只证明**冻结 fixture 的静态字符覆盖**。它**不**替代 PA-03 的真实浏览器加载、CSS 字重选择或 fallback 验证。`font-baseline.md` §4/§5 已明确此边界，未把静态覆盖冒充运行时加载证据。

## 6. 清单、字节、门禁反例与守卫承重（任务书 §5、§6）

### 6.1 清单自身锚点

manifest 文件 2,595 字节，独立 SHA-256 = `2952b96f2d74300a26382349816020a21731b06cd811ce37ed60dafbdc684721`，与 `tools/fonts/src/verify.ts:9` 的 `FONT_MANIFEST_SHA256` **逐字符相同**。

### 6.2 文件系统 / 字节反例（仓库外真实 FS，全部含泄漏检测）

| 反例族 | 结果 |
|---|---|
| LICENSE + 3 OTF 各首/中/尾字节翻转（12 例） | LICENSE→`FONT_LICENSE_INVALID`，OTF→`FONT_FILE_INVALID`；恢复即通过 |
| 删除 OTF / 删除 LICENSE / 增加未登记文件 / 增加未登记目录 / 改名 OTF | 全部 `FONT_SET_MISMATCH` |
| 截断 OTF 为 0 / 交换 Bold↔Medium 内容 / 抹掉 OTTO magic | 全部 `FONT_FILE_INVALID` |
| OTF 换成 symlink / manifest 换成 symlink / 目录 junction / **根本身 junction / 根本身 dir symlink** | 分别 `FONT_SET_MISMATCH` 或 `FONT_MANIFEST_INVALID`，无一跟随链接 |
| manifest `{}` / 非法 JSON / >64KiB / 尾加换行 / 少一字重 / 多一字重 / tag 漂移 / 仓库改镜像 / SPDX→MIT / 覆盖数 0 / missing 5 / 乱序 | 全部 `FONT_MANIFEST_INVALID` |
| **自洽双改**：改 Regular 字节 + 同步改 manifest sha256；改 LICENSE 正文 + 同步改 manifest bytes/sha256 | 全部 `FONT_MANIFEST_INVALID`（清单锚点承重） |

**零泄漏**：所有错误消息经检测均不含探针绝对根、盘符路径、原始 ENOENT/EACCES、LICENSE 正文片段或字体字节片段。平面目录无未受限递归、无链接跟随、无资源失控。

一处**探针自证**：`SOURCEHANSANSCN-BOLD.OTF` 大小写碰撞副本在本机"通过"——经核实这是 NTFS 大小写不敏感产生的**同一 inode**（写入后磁盘仍是 5 个文件），并非真实的第 6 个文件，故非缺陷；在大小写敏感的 Linux CI 上该名字会成为多余文件并被集合相等守卫拒绝。

### 6.3 守卫承重（拆除实验 + 决定性反例）

对 verify.ts 逐个删除守卫后跑该包集成测试，并对关键项补充**决定性反例**（直接加载去守卫的模块并构造针对性输入）：

| 守卫 | 拆除后包测试 | 决定性反例判定 |
|---|---|---|
| OTF **SHA-256** 比较 | **失败** ✔ | 承重且被覆盖 |
| **manifest 锚点** 比较 | **失败** ✔ | 承重且被覆盖 |
| LICENSE **bytes+sha256** 比较 | **失败** ✔ | 承重且被覆盖 |
| 文件系统异常转换（脱敏） | **失败** ✔ | 承重且被覆盖（`missing roots...` 用例收到裸 ENOENT/绝对路径） |
| manifest **排序**守卫 | **失败** ✔ | 承重且被覆盖 |
| **精确文件集合相等** | 仍全绿 ✖ | **真实漏洞**：去守卫后加一个未登记文件 → `PASSES`（守卫在时 → `FONT_SET_MISMATCH`）。见 `FT-01` |
| manifest **字重唯一性** | 仍全绿 ✖ | 运行时集合相等兜底（非可利用），无单测。见 `FT-02` |
| OTTO magic | 仍全绿 ✖ | 被 SHA-256 遮蔽（改 magic 必改哈希），不可达。见 `FT-03` |
| LICENSE 文本标记 | 仍全绿 ✖ | 被 LICENSE SHA-256 遮蔽，不可达。见 `FT-03` |
| OTF 字节长度 | 仍全绿 ✖ | 严格被 SHA-256 遮蔽（改长必改哈希）。见 `FT-03` |
| per-entry 非文件拒绝 | 仍全绿 ✖ | 双向兜底（同名非文件→下游 read 拦；多余目录→集合相等拦）。见 `FT-03` |

### 6.4 门禁互锁与命令

- **门禁真实执行 fonts**（非字符串存在）：`pnpm ci:job security` 依次跑 secrets/licenses/**fonts**，输出 `Font check passed: 3 frozen OTF files.` 并跑真实契约+集成测试。
- **拆除即被发现**：从 CI `security` 删 `command("fonts",…)`、改标签、从根 `verify` 删 `pnpm fonts:check`、删脚本、指向别的包——五种拆法全部使 `ci-runner.unit.test.ts` 失败。
- **CI 仍 8 作业**：matrix 未变（static/unit-config/contracts/typecheck/build-test/build-staging/build-production/security），无为字体伪造的空作业。

| 命令 | 退出码 | 计数 |
|---|---|---|
| `pnpm fonts:check` | 0 | `Font check passed: 3 frozen OTF files.`；契约 2/2、集成 4/4 |
| `pnpm test:layers` | 0 | `Test layer audit passed: 24 files classified.` |
| `pnpm test:contract` | 0 | 12 个文件，**102/102** |
| `pnpm test:integration` | 0 | 3 个文件，**18/18**（含 fonts 3 项） |
| `pnpm typecheck` | 0 | **12** 个包 `Done`（含 `tools/fonts`），零 TS 错误 |
| `pnpm ci:job security` | 0 | secrets 264 tracked / licenses 115 paths / fonts 3 OTF 全通过 |
| `pnpm verify` | 0 | 聚合 **157/157**；`Quality guardrails passed: 90 source/config files, 264 repository files.` |

### 6.5 集成测试真实性

集成测试用真实 OTF、真实文件系统、运行时签发的 worker 隔离目录（`@wenshu/test-support`），`tools/fonts/test/` 中无 `mock`/`stub`/`fake`。本任务不涉及数据库，实施记录/基线文档均未虚构真库。

## 7. 依赖、体量与范围诚实性（任务书 §6）

- **零手写 `any`/抑制指令**：`tools/fonts/` 全目录命中 0。
- **体量护栏**：最大文件 `src/manifest.ts` 288 行（< 300 预警）、`src/verify.ts` 156、集成测试 148、契约测试 113，全部满足生产 300/400、测试 300/500。
- **typecheck 覆盖**：`tools/fonts/tsconfig.json` 的 `include` 为 `["src","test","scripts"]`，三类目录全部进入 strict 检查。
- **依赖只声明直接使用项**：`@wenshu/test-support`（`verification.integration.test.ts` 直接 import）为 dependency；`@types/node`、`typescript` 为 devDependency，均走 catalog；**无新增运行时第三方依赖**。
- **lockfile 无意外漂移**：唯一变化是新增 `tools/fonts` importer，版本全部来自 catalog（`@types/node` 24.13.3、`typescript` 6.0.3），无任何第三方包版本变动。
- **零漂移确认**：`git diff --name-only f352930..HEAD` 对 `docs/poc-a/fixtures/`、`*.schema.json`、`schemas/`、`packages/*/src/generated/`、`.github/workflows/` **全部为空**——冻结 PoC-A 原件、Schema、生成物、workflow 与其他字体均未被触碰。
- **无系统安装/镜像/费用**：全仓库仅 3 个 OTF 为跟踪字体二进制，无 `.ttf/.woff/.zip`；实施记录所述临时下载目录 `D:\tmp\wenshu-g113-font-20260721` 现已不存在；`tools/fonts/` 与 `font-baseline.md` 无 `C:\Windows\Fonts`/`AddFontResource`/`installFont` 之类系统字体安装痕迹。

## 8. 发现、归属与最迟关闭点

### MINOR

#### `FT-01`　精确文件集合相等守卫无决定性测试

**定位**：[tools/fonts/src/verify.ts:128-136](../../tools/fonts/src/verify.ts#L128-L136)。

**证据**：直接加载去掉集合相等守卫的模块，向合法字体目录**增加一个未登记文件** `EXTRA-UNREGISTERED.bin` → `verifyFontSet` **PASSES**（守卫在时 → `FONT_SET_MISMATCH`）。即该守卫是拦截"多一个未登记文件"的**唯一决定性检查**。但 `verification.integration.test.ts` 的集合测试只 `mkdir("unregistered")` 加一个**目录**，该目录先被 per-entry 非文件守卫（verify.ts:114）以 `FONT_SET_MISMATCH` 拦下，**从未命中集合相等分支**。因此删除集合相等守卫后整套测试仍全绿。

**影响**：符合任务书 §5「被其他条件代打而从未命中的分支应登记覆盖缺口」。字体真伪不受影响（当前 5 文件目录合法），这是**测试决定性缺口**而非可利用漏洞，故 MINOR。风险面：未来若集合守卫被无意改动，多余文件混入不会被 CI 发现。

**建议**：补一条集成用例——向副本加一个未登记**文件**（非目录），断言 `FONT_SET_MISMATCH`。

**归属/最迟关闭点**：Codex；G1-13 收尾或最迟 PA-03 消费字体前。

#### `FT-02`　manifest 字重唯一性守卫无测试覆盖

**定位**：[tools/fonts/src/manifest.ts:271-276](../../tools/fonts/src/manifest.ts#L271-L276)。

**证据**：删除 `if (new Set(files.map((f) => f.weight)).size !== 3)` 后，`manifest.contract.test.ts` 仍全绿——没有任何用例构造"三条目但字重重复"的清单。运行时集合相等会兜底（两条 Bold → 期望集合含 Bold 两次、磁盘只有一次 → `FONT_SET_MISMATCH`），故非可利用漏洞，但守卫本身无单测。

**建议**：补一条契约用例——两 Bold + 一 Medium（字重 {700,700,500}），断言 `FONT_MANIFEST_INVALID`。

**归属/最迟关闭点**：Codex；与 `FT-01` 同批。

### NOTE

#### `FT-03`　四个纵深防御守卫被哈希/集合遮蔽，无独立测试

OTTO magic、LICENSE 文本标记、OTF 字节长度、per-entry 非文件拒绝——逐个删除后包测试均不失败。经决定性反例确认：它们各自的独特职责都被更强的 SHA-256 或集合相等**完全遮蔽**（如"带正确 SHA-256 却非 OTF"在冻结锚点下不可达）。属纵深防御，**当前不可达**，仅记录，不要求整改；若后续想让它们可测，需要能绕过哈希的构造，实际不存在。

#### `FT-04`　覆盖/字形计数为一次性取证，门禁不重算

manifest 的 `glyph_count`/`cmap_codepoint_count`/`coverage` 由一次性 fontTools 取证得出，自动门禁**不**重新解析 OTF 重算（设计上不依赖 Python/fontTools），仅靠字节 SHA-256 的传递性保证"运行时消费的是完成取证的同一字节"。这与 `font-baseline.md` §5 声明一致，非缺陷；我已在 §5 独立重算证实这些数值真实。

## 9. 未执行项与限制

- **未在大小写敏感文件系统复跑**：本机 NTFS 大小写不敏感，`FT-01` 涉及的"多余文件"在 Linux CI 上的表现未实测；CI `security` 作业跑在 ubuntu-24.04，可作后续补充证据。
- **未实证读取/枚举权限失败**：Windows 下对本进程的 `icacls` deny 与独占锁均无效（G1-10 复核已确证），故未构造真实 EACCES；脱敏路径的信心来自 §6.3 中"文件系统异常转换"守卫拆除实验（该守卫承重且被覆盖）。
- **未执行 `pnpm install --frozen-lockfile`**：会改写 `node_modules`，超出只读边界；lockfile 漂移改用 `git diff` 核验。
- **未复算 ZIP 内部**：release-asset 身份用 GitHub 官方 digest 与三个 OTF/LICENSE 的 tag-tree blob SHA-1 双重确认；未下载 50 MB ZIP 解压比对（tag tree 对账已足以确证采纳对象来自官方）。
- 本报告只签署事实，不提供也不应用补丁，不修改路线图。

## 10. 最终结论

**`CONDITIONAL PASS`**

任务书 §7 的六条否决线逐条不成立：

1. **来源/授权已确证**：tag `2.005R` 的四个对象 blob SHA-1 与 Adobe 官方 tag tree 逐项相等，release-asset 摘要与 GitHub 官方 digest 一致；OFL-1.1 完整保留，有权纳入。
2. **每个登记字体都是官方固定对象**：字节、blob、SHA-256、PostScript 名、版本、字重、glyph/cmap 独立复算全部吻合；仅 Regular/Medium/Bold 三份，无夹带。
3. **冻结字符真实覆盖**：独立重建 884 码点 + 同一 SHA-256，三字重各缺失 0，CJK/拉丁/数字/标点齐全。
4. **字体/许可证不可静默篡改**：12 个逐字节反例 + 全部集合/链接/漂移反例 fail-closed，无泄漏。
5. **自洽双改不可变绿**：字体+清单、许可证+清单同步改写均被清单锚点拒绝；锚点经删除实验证明承重。
6. **门禁不可保持绿色地漏跑**：`fonts:check` 进入根 `verify` 与 CI `security` 且真实执行；五种拆法全部被测试发现；CI 仍 8 作业。

同时：`pnpm verify` 退出码 0、157/157 测试通过、90 源码/配置 + 264 仓库文件过护栏、24 测试文件分层、12 包 strict typecheck；零手写 `any`/抑制；lockfile 无第三方漂移；PoC-A 原件/Schema/生成物/workflow 零漂移；无系统字体安装或镜像下载。

放行附带条件：`FT-01`、`FT-02` 两项 MINOR（均为测试决定性缺口，非可利用漏洞）按 §8 归属与最迟关闭点登记并整改，由独立审计角色复核关闭；`FT-03`/`FT-04` 为 NOTE，无需整改。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具。审计者不修改路线图、不自行标记 G1-13 完成、不自行关闭发现；是否将 G1-13 记为完成、PA-03 是否可启动，由 Codex 依本报告更新台账后决定。

---

# FT-01～FT-02 定点复核（2026-07-21）：`2d9e4eb` 之后的工作树整改

> 复核范围：`2d9e4eb`（首审 HEAD）之后针对 FT-01/FT-02 的**未提交**工作树整改（仅两个测试文件，+27 行；生产代码零 diff）。整改记录见业主汇报与 `AGENTS.md` 台账。
>
> 本章由与首审同一独立审计角色出具。不采信"变异反证已做"的自述，自行重跑变异测试并独立判定两个新用例是否**决定性命中目标守卫、是否被邻近守卫代打**。

## 1. 边界

- 本轮只对本文件严格追加；首审 222 行未删除或改写。
- 未修改代码、测试、字体、LICENSE、manifest、lockfile、路线图、配置、Schema、生成物或其他文档；仓库外探针只写 `D:\tmp\g113rv1`，结束已删除；未 push、未触发 Actions。
- 工具链：冻结 D 盘 Node `24.17.0` + pnpm `11.15.1`（`--config.verify-deps-before-run=false` 仅抑制 pnpm 跑前自动装依赖）。

## 2. 整改面核对

- **零生产代码改动**：`git diff` 对 `tools/fonts/src/`、`tools/ci/src/`、`packages/**/src/`、`assets/`、`pnpm-lock.yaml`、`.github/`、`docs/poc-a/fixtures/` **全部为空**。整改严格限于两个测试文件（`manifest.contract.test.ts` +18、`verification.integration.test.ts` +9）。
- **冻结对象未动**：三个 OTF、`LICENSE.txt`、`font-manifest.json` 的 Git blob SHA-1 与首审 §3.2 逐一相同；`FONT_MANIFEST_SHA256` 锚点未变。
- **越权检查**：`AGENTS.md` 台账把 FT-01/FT-02 记为「已由 Codex 补决定性测试修复并经变异反证，**待 Claude 复审关闭**」，未自行关闭；未标记 G1-13 完成、未启动 PA-03。唯一未跟踪文件是本审计报告本身。
- 零手写 `any`/抑制；两测试文件 131、157 行，均 < 300 护栏。

## 3. FT-01 决定性复核　**已关闭**

新增断言（`verification.integration.test.ts`）：在同一用例内删除未登记**目录**后，写入未登记**普通文件** `EXTRA-UNREGISTERED.bin`（单 NUL 字节），断言 `FONT_SET_MISMATCH`。

我自行**变异测试**（仓库外副本，正确 `<dir>/tools/fonts` + `<dir>/assets` 布局）：

| 变异 | 集成套件 | 判定 |
|---|---|---|
| 无变异（对照） | **PASS** | 基线正常 |
| 删除**精确文件集合相等**守卫 | **FAIL**，红的正是该用例 | 新断言**决定性命中** set-equality ✔ |
| 删除 per-entry 非文件守卫 | 仍 PASS | 未被非文件守卫代打（普通文件本就通过非文件守卫；多余文件与目录都落到 set-equality）✔ |

首审 §6.3 的原始缺口——"删除 set-equality 守卫，测试仍全绿"——**已不可复现**：现在删除该守卫，该用例即因 `expected font integrity verification to fail` 变红。断言选用**普通文件**而非目录，正确绕开了会代打的 per-entry 非文件守卫，直击 set-equality 这一拦截"多一个未登记文件"的唯一决定性检查。

## 4. FT-02 决定性复核　**已关闭**

新增用例 `font weights must be unique across the three files`：以 `[Bold, Bold, Regular]`（保持规范排序）构造清单，断言 `FONT_MANIFEST_INVALID` 且消息恰为 `font weights must be unique`。

变异测试：

| 变异 | 契约套件 | 判定 |
|---|---|---|
| 无变异（对照） | **PASS** | 基线正常 |
| 删除**字重唯一性**守卫 | **FAIL**，红的正是该用例 | 决定性命中 weight-uniqueness ✔ |
| 删除**排序**守卫 | FAIL，但红的是既有 `...fail closed` 用例，**FT-02 用例仍绿** | FT-02 **未被排序守卫代打**（`[Bold,Bold,Regular]` 本已排序，只有 weight 分支能拒）✔ |

首审 §8 的原始缺口——"删除 weight-uniqueness 守卫，契约测试仍全绿"——**已不可复现**。第三行是决定性证据：排序守卫被移除时红的是另一个用例而非 FT-02，证明该输入确实保持规范排序、只由字重唯一性分支决定，未被排序或精确重复分支代打。断言还锁定了确切错误消息 `font weights must be unique`。

## 4b. 边界确认（未产生新遮蔽）

两个新用例都**只**约束各自目标守卫：FT-01 删非文件守卫不红、FT-02 删排序守卫不红，说明整改没有引入"由邻近守卫代打"的假覆盖，而是精确补上首审登记的两处决定性缺口。

## 5. 回归与命令（冻结工具链实跑）

| 命令 | 退出码 | 计数 |
|---|---|---|
| `pnpm fonts:check` | 0 | `Font check passed: 3 frozen OTF files.`；契约 **3/3**（+FT-02）、集成 **4/4**（FT-01 为既有用例内新增断言，用例数不变） |
| `pnpm verify` | 0 | 聚合 **158/158**（较首审 +1 = FT-02 新契约用例）；`Quality guardrails passed: 90 source/config files, 265 repository files.`；layers 24、typecheck 12 包 |

一处计数说明：仓库文件 264→**265** 的 +1 是**本审计报告自身**（唯一未跟踪文件），非实施方新增；源码/配置文件仍为 90（无新增源码/配置）。首审 §5.2 独立重建的 884 码点覆盖与三份 OTF 身份不受本轮测试改动影响，未回归。

## 6. 未执行项与限制

- **未在大小写敏感文件系统复跑**：本机 NTFS 大小写不敏感；FT-01 的"多余文件"在 Linux CI（ubuntu-24.04 `security` 作业）上的表现留作复审补充证据点（与业主汇报的限制一致）。此为环境限制，不影响本机变异测试已证实的决定性。
- 未执行 `pnpm install --frozen-lockfile`（会改写 `node_modules`）；未 push、未触发远程。
- 本章只签署事实，不提供也不应用补丁，不修改路线图。

## 7. 复核结论

**`PASS — G1-13 两项 MINOR 已关闭`**

- **FT-01 已关闭**：新增普通文件断言经变异测试证明**决定性命中**精确文件集合相等守卫，且不被 per-entry 非文件守卫代打；首审缺口不可复现。
- **FT-02 已关闭**：新增 `[Bold,Bold,Regular]` 用例经变异测试证明**决定性命中**字重唯一性守卫，且不被排序/精确重复守卫代打，并锁定确切错误消息；首审缺口不可复现。
- **无新增 BLOCKER/MAJOR/MINOR**：整改仅两个测试文件、+27 行、零生产代码 diff；冻结对象与锚点未动；`pnpm verify` 退出 0、158/158；零 `any`/抑制；体量护栏满足；lockfile、workflow、Schema、生成物、PoC-A 原件零漂移。
- `FT-03`/`FT-04` 仍为 NOTE，无需整改。

综合首审 `CONDITIONAL PASS` 与本轮两项 MINOR 关闭，从独立审计角度 **G1-13 的字体身份、许可证、字符覆盖、篡改门禁与测试决定性均已满足，无未关闭发现**。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本复核由未参与实施与修复的独立审计角色出具，只签署事实、不提供也不应用补丁。是否将 G1-13 标记完成、是否启动 PA-03，以及将本轮工作树整改提交，由业主/Codex 依本结论决定；审计者不代为标记路线图完成。
