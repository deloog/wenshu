# G1-16 G1 工程底座签署独立审计报告

> 日期：2026-07-21　审计基线：`52b04e2`（docs: add G1-16 signoff package），台账 `62c99d7`；干净树锚定 `f278335`
> 任务书：[G1-16-claude-audit-task.md](G1-16-claude-audit-task.md)　受审基线：[g1-signoff.md](../g1-signoff.md)、[实施记录](G1-16-implementation-record.md)、[cleanroom 日志](G1-16-cleanroom-verify.txt)
>
> 本报告由 G1 工程底座最终独立审计角色出具。**不采信签署报告、实施记录、台账状态或验证日志自述**——干净树由我自己从提交对象重建、依赖由我自己在**空 store** 冷装、`verify` 由我自己复跑。

## 1. 边界与方法

- **写入边界**：本轮只新增本文件一处。未修改代码、测试、证据、文档、lockfile、路线图、决策记录或任何 G1 产物。
- **探针边界**：仓库外探针只写 `D:\tmp\g116`，结束已删除。未 push、未创建 PR、未触发 Actions。
- **工具链**：冻结 D 盘 Node `24.17.0` + pnpm `11.15.1`。

## 2. 结论摘要

**结论：`CONDITIONAL PASS`　——　暂不签署 G1，待一项 MINOR 关闭后即可签署**

干净树可复现性、五道承重门禁、SBOM/证据/字体锚点、零功能实现等**核心结论全部独立验证成立**，且我以**空 store 冷装**给出了比实施方更强的证据。唯一阻止签署的是签署报告本身的**审计覆盖表述失准**（`SG-01`）——4 项任务标 ✅ 却无任何独立审计报告，而报告作了"全部由独立审计者签署关闭"的通括声明。修正成本极低（措辞 + G1-12 处置声明）。

| 级别 | 编号 | 摘要 |
|---|---|---|
| MINOR | `SG-01` | 签署报告 §2 末句"全部 BLOCKER/MAJOR 均已由独立审计者签署关闭"作通括声明，但 **G1-01 / G1-01R / G1-02 / G1-12 四项无任何独立审计报告**（`docs/audits/` 无对应文件），其 ✅ 与已审计任务并列呈现、未作区分 |
| NOTE | `SG-N1` | `secrets:check` 依赖 `git ls-files`，在无 `.git` 的干净树（tarball/archive 解出）**无法运行**（fail-closed 报错）；任务书 §2 要求"在干净树跑 secrets:check"实际不可直接满足，我以项目自带扫描器 + 自建文件清单替代，0 命中 |
| NOTE | `SG-N2` | `docs/audits/G1-10-claude-audit-report.md` 含 2 个字面 NUL 与 1 个 `0x1F` 字节（文件仍为合法 UTF-8），使 grep 等文本工具将其判为 binary。**此为我方（审计者）撰写 NUL/控制字符反例时的排版残留**，不影响任何门禁（干净树 317 文件扫描 0 命中） |

## 3. 干净克隆验证复核（核心，任务书 §2）

### 3.1 git 协议确已不可用（独立复现实施方披露）
我先按任务书"git 协议若恢复可用优先"尝试 `git clone https://github.com/deloog/wenshu.git`，**失败**：`fatal: fetch-pack: invalid index-pack output`。随后 `gh api .../tarball/f278335` 下载在 **10 分钟超时**未完成。→ 实施方所述"git 协议与 codeload 持续停滞"**经我独立复现属实**，非托词。

### 3.2 干净树以内容寻址方式重建（比 tarball 更强）
- 远程身份：`gh api` 确认 `deloog/wenshu` **`private: true` / `visibility: private`**、`fork: false`、默认分支 `main`；`f278335` 在远程存在，SHA 为 `f278335e4a00ef981e3e5a851b330c4a090b89c9`。
- 本地 `git rev-parse f278335` **完全相同**。git 为内容寻址，SHA 相同即树内容相同——故我用 `git archive f278335` 解出的树，**在密码学意义上等同远程该提交的树**。
- 干净树实测：**315 个文件、无 `.git`、无 `.env`/`*.key`/`*.pem`**，无本机未提交内容。

### 3.3 空 store 冷装（决定性——回答共享 store 之问）
| 安装方式 | 结果 |
|---|---|
| 共享 store（`D:\DevCaches\pnpm-store`，同实施方与 CI） | 6 s，`reused 116, **downloaded 0**` → **未触达 registry**，不能证明可复现 |
| **空 store（`D:\tmp\g116\coldstore`）** | 18.9 s，`**reused 0, downloaded 116**`，**exit 0** |

我另查最近 CI（run `29818057945` contracts 作业）亦为 **Cache hit → `downloaded 0`**，故实施方、CI、我的首轮三者**都未**验证冷路径。**我以空 store 补验后确认：冻结 lockfile 可从 npm registry 完整解析并拉取全部 116 包，一键安装确实可从零复现。**

**裁定**：`tarball 替代` **不削弱**结论——tarball 与我用的 archive 均为同一提交树，且我的重建路径经 SHA 内容寻址证明忠实；`共享 store` **本会削弱**结论（三方原始证据均为暖缓存），但**经我空 store 冷装补验后已消除**。无需实施方再补验。

### 3.4 干净树 `verify` 独立复跑（冷装树上）
`pnpm verify` **exit 0**，与签署报告逐项吻合：

| 指标 | 签署报告 | 我的独立复跑 |
|---|---|---|
| 测试 | 185 ✔ | **185/185 pass, 0 fail** ✔ |
| quality | 119 源码/配置、313 仓库文件 | **119 / 313** ✔ |
| layers | 34 | **34** ✔ |
| fixtures / fonts | 7 / 3 | **7 / 3** ✔ |
| environment | 双证据 | **2 evidence files（wenshu-dev-primary, wenshu-poc-a-win11）** ✔ |
| supply-chain | 147 包无漂移 | **147 packages (10 direct), no drift** ✔ |
| typecheck / build | 14 包 / 通过 | **14 包 Done / production build 通过** ✔ |

计数逐项相同，反证实施方 tarball 树与提交树内容一致。

### 3.5 干净树无秘密
`secrets:check` 因依赖 `git ls-files` 在无 `.git` 树中 fail-closed 报错（`SG-N1`，非秘密命中）。我改以**项目自带扫描器**（`tools/ci/src/secrets.ts` 的 `scanTrackedFiles`）驱动**我自建的文件清单**（317 个文件，排除 `node_modules`）：**0 命中**；`.env`/`*.key`/`*.pem`/`id_rsa*`/`*.p12` 文件名扫描亦为 0。

## 4. G1 任务闭环总复核（任务书 §3）

### 4.1 已审计任务：逐项有报告且终局已闭环
`docs/audits/` 实有报告：G1-03~06、G1-07、G1-08、G1-09、G1-10、G1-11（isolation-gates + ci）、G1-13、G1-14、G1-14W、G1-15。抽查终局结论：

- G1-10 `PASS — 可以标记完成`（FX-01~03 关闭）；G1-13 `PASS — 两项 MINOR 已关闭`；G1-14 `PASS — 三项 MINOR 已关闭`；G1-14W `PASS — 可以完成`；G1-15 `PASS — CR-01 关闭已签署`。
- G1-11-isolation-gates 终局为 **`CONDITIONAL PASS`**（RA-01/RA-02 已关闭 ✅、BLOCKER 0、MAJOR 0、MINOR 1 = IA-01），其正文中的 "FAIL" 字样系论述语（"不判 FAIL 因为…"），**非终局判定**；IA-01 已在 G1-11 CI 轮由我核验关闭。
- 台账（AGENTS.md 61–70 行）每条完成态均引用 Claude 独立审计结论，**无实施者自行关闭**；G1-16 自身标"待 Claude 独立审计签署"，未自签。

### 4.2 覆盖缺口（`SG-01`）
**G1-01 / G1-01R / G1-02 / G1-12 四项无任何独立审计报告**（`docs/audits/` 命中数均为 0），却在签署报告与路线图中标 ✅，且 §2 末句作"全部 BLOCKER/MAJOR 均已由独立审计者签署关闭"的通括声明——该句对这四项**不成立**（从未审计，也就谈不上关闭）。

我能**旁证**其中三项（不等于正式审计）：

| 任务 | 我的旁证 |
|---|---|
| G1-01 | 根提交 `dcbddc9`（`chore: establish project governance baseline`）存在；`.env`/`config.key`/`server.pem` 实测均被忽略（G1-14 `EN-02` 轮已验） |
| G1-01R | 本轮 `gh api` 确认远程 `private: true` / `visibility: private` |
| G1-02 | `toolchain.versions.json` 记 node 24.17.0 / pnpm 11.15.1，与根 `engines`、`packageManager` 及实际冻结二进制一致（历轮反复验证） |
| **G1-12** | **无任何审计覆盖**；路线图载其消费者为 **PA-14H/PB-11**（HarmonyOS 阶段），不在 PoC-A 关键路径，模拟器亦明确后置 |

**定级理由**：任务书 §4 的 FAIL 线含"任一 G1 任务被无独立审计签署而标完成"。但该条意在防止**规避审计**；这四项成于独立审计机制建立（首份任务书为 G1-03~06）之前，属基础设施类且三项经我旁证、G1-12 离 PoC-A 路径。故我判 **MINOR 而非 FAIL**，但**不判 PASS**——签署报告的通括表述必须先与事实对齐，否则 G1 签名会隐含四项不存在的审计背书。

### 4.3 承重链交叉验证
- **五道检查在 verify 与 CI 双侧真实执行**：`contracts:check`/`fixtures:check`/`fonts:check`/`environment:check`/`supply:check` 均在根 `verify` 链中，且均在 `CI_JOBS` 中（另含 `secrets:check`/`licenses:check`）；CI matrix 仍为 **8 作业**。
- **SBOM 147 包无漂移**、**双机器证据锚点一致**（两份 `frozen_inputs` 与源码常量、独立重算 manifest 哈希三方一致）、**字体锚点一致**——均在我的干净树复跑中直接输出。
- 开放项归属属实：`NF-03`（G1-03~06/G1-07 报告 + G1-07-followups）、`FX-06`（G1-10 报告/completion/followups → PA-00，最迟 PA-01）、`PB-05A`（G1-07-followups/G1-09）、`CR-01`（G1-09 → G1-15 已签署关闭）。

### 4.4 限制索引诚实性
签署报告 §3 每条限制均有书面出处：90 天评估期 / 1024×768 / Chromium 未装 → G1-14W 报告与 `reference-machine.md §2`；BASE-02、决策 #2/#3 → `G0-前置准备审计.md`；方法限制 FT-03/FT-04、G1-14 §9、漏洞扫描不入 verify → 各自审计报告。**无"已解决"冒充**。

### 4.5 零功能实现（PA/PB/A 未启动）
`apps/web/src` 仅 `main.ts` **7 行**骨架；工作区其余为 contracts（config/contract-runtime/document-model/host-contract/project-contract/template-model/test-support）与 tools（ci/environment/fixtures/fonts/quality/supply-chain）。`pdf|render|editor|paginat` 命中仅出现在 `host-contract/src/contract.ts` 与 `generated/*`——**契约声明而非实现**。**确认 G1-16 之前无任何功能实现代码**。

## 5. 发现

### MINOR
#### `SG-01`　签署报告的审计覆盖表述失准
**定位**：[docs/g1-signoff.md](../g1-signoff.md) §2 表格与第 36 行。
**证据**：`docs/audits/` 中 G1-01 / G1-01R / G1-02 / G1-12 的审计报告命中数均为 **0**；四项在表中与已审计任务同列 ✅ 且无区分标注；§2 末句"全部 BLOCKER/MAJOR 均已由独立审计者签署关闭"对这四项不成立。
**影响**：G1 签名若照此发出，将隐含四项并不存在的独立审计背书——恰是最终闸门应当拦住的表述风险。实质工程风险低（三项经我旁证，G1-12 离 PoC-A 路径）。
**建议**（成本极低）：
1. §2 表格为该四项加注"文档证据，未经独立审计"或分组区分；
2. 第 36 行改为"**已审计任务**的全部 BLOCKER/MAJOR 均已由独立审计者签署关闭"；
3. 给 **G1-12** 明确处置：业主书面接受其文档证据并将独立审计推迟至 HarmonyOS 阶段（PA-14H/PB-11 前），或补一份简短独立审计。
**归属/最迟关闭点**：Codex（业主确认 G1-12 处置）；G1 签署前（即本轮复审）。

### NOTE
- **`SG-N1`**：`secrets:check` 依赖 `git ls-files`，无 `.git` 的干净树中无法运行（fail-closed）。非缺陷（CI checkout 带 `.git` 时正常），但任务书"干净树跑 secrets:check"不可直接满足；建议后续要么在干净树验证时说明改用等效扫描，要么让脚本在无 git 时回退到目录枚举。
- **`SG-N2`**：`G1-10-claude-audit-report.md` 含 2 个 NUL + 1 个 `0x1F`（仍为合法 UTF-8），系**我方撰写反例时的排版残留**，使文本工具判为 binary。不影响门禁；建议我方或 Codex 在后续维护时以转义写法替换。

## 6. 执行的命令与未执行项

**执行**：`git clone`（失败，佐证协议不可用）、`gh api`（远程身份/可见性/提交/CI 日志）、`git archive f278335`（干净树）、`pnpm install --frozen-lockfile`（共享 store 与**空 store** 两次）、`pnpm verify`（干净树，exit 0/185）、项目扫描器驱动的秘密扫描（317 文件 0 命中）、五道检查与 CI 接线核对、审计报告终局判定抽查。

**未执行/限制**：
- **未成功取得 codeload tarball**（10 分钟超时）——改以内容寻址的 `git archive` 重建，密码学上等价且更强；未能逐字节比对实施方那份 tarball，但 §3.4 计数逐项相同已反证其树内容一致。
- **未对 G1-01/01R/02/12 补做正式审计**（超出本任务书范围）——本轮只做旁证并登记 `SG-01`。
- 未 push、未触发 Actions；本报告只签署事实，不改路线图、不自行标记 G1-16 完成。

## 7. 最终结论

**`CONDITIONAL PASS — 暂不签署 G1 工程底座；`SG-01` 关闭后即可签署`**

任务书 §4 的 FAIL 线逐条核对：

1. **干净克隆 install/verify 可复现** ✔——干净树经内容寻址重建，**空 store 冷装 `downloaded 116` exit 0**，`verify` exit 0 且 185/185 与全部计数逐项吻合；共享 store 之疑经我补验消除。
2. **既往 BLOCKER/MAJOR 均已闭环** ✔——已审计的 11 份报告终局均为 PASS/CONDITIONAL PASS 且无未关闭 BLOCKER/MAJOR；G1-11 的 "FAIL" 字样系论述语非判定。
3. **限制未被冒充已解决** ✔——§3 每条限制均有书面出处。
4. **无功能实现** ✔——`apps/web/src` 7 行骨架，其余为契约与工具。
5. **"任一任务被无独立审计签署而标完成"** ✖ 部分触发——G1-01/01R/02/12 四项无审计报告；因其成于审计机制建立之前、三项经旁证、G1-12 离 PoC-A 路径，**判 MINOR 而非 FAIL**，但据此**不给 PASS**。

**签署条件（一次性、成本极低）**：按 `SG-01` 建议修正签署报告表述并明确 G1-12 处置；修正后我复审即签署 G1 工程底座，并据任务书说明 **PA 系列可按各自 DoR 启动**。在此之前，**G1 未签署，功能实现（PA/PB/A）不得开始**。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具，只签署事实、不提供也不应用补丁；不修改路线图、不自行标记 G1-16 完成或代为启动 PA。
