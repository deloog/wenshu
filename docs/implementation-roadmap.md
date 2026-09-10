# 文枢原子化实施路线图

> 版本：1.7　日期：2026-07-30　状态：**GR 已通过**（v1.0 专项审计 0 项未关闭阻断；审计后依次依据独立复审新增 PA-00、PB-05A、G2-03、G2-04）
>
> **1.7 变更（G2-04 签署）**：`G2-04` 经 Claude 独立审计 `PASS`（首审 CONDITIONAL PASS，MA-01/MI-01 复审关闭，首审 23 条 + 复审 23 条独立探针零失败）；§3.1 台账补录 `G2-04` 条目（签署后台账补录即为本门禁 8a 检查所要求的动作，G2-03 曾因漏补被该检查前身抓出）。
>
> **1.6 变更（G2-04 审计 MI-01 关闭）**：裁定 `G1-09` 确实依赖 `G1-06`——其任务行散文自证（范围内含「处理 Host 复审 NF-02」、完成证据含 Host 值拒绝测试，均为 G1-06 Host 契约产物），且消费者列删除前是路线图中该依赖的最后结构性记载。据此补回权威手写源：`G1-09` 依赖列 `G1-03 → 全任务` 改为 `G1-03/06 → 全任务`，`G1-06` 消费者列恢复 `G1-09`（依赖边 238→239，高于登记下限）；其余三处消费者列删除（`G1-03C → G1-08`、`A-01 → A-07P`、`A-02D → A-03`）经审计核验无同等散文证据，维持删除。裁定理由与「消费者列与依赖列冲突且存在散文证据时须先裁定哪侧为真」规则见 [ADR-0024](adr/0024-G2-04路线图手写真源收敛与不变量门禁.md) 增补。
>
> **1.5 变更（G2-04 实施）**：确立三类权威手写源（§4~§8 任务表依赖列、任务 `R-*` 标注、§3.1 台账状态字段与证据链接）与四类派生校验对象（§3 关键路径、§9 波次、§10 矩阵、消费者列），语义声明见 §9/§10/§11，由路线图不变量门禁（`pnpm quality:check`，解析 fail-closed）机械校验；修正任务书 §2.3 登记的全部不一致：§3 三条无传递依赖依据的边、§9 五个含直接依赖的可并行组、四条无依据消费者声明、补 `G2-03` 台账条目、17 行台账追加自身审计报告链接；`PA-15`/`PA-14U` 状态偏离经已批准偏离登记表显式豁免。维护方式变化见 [ADR-0024](adr/0024-G2-04路线图手写真源收敛与不变量门禁.md)。
>
> **1.4 变更（业主批准，2026-07-30）**：新增 `G2-04` 路线图不变量门禁任务（§8、§10 `R-TEST` 验证列）。该任务将把本文件的依赖关系、`R-*` 标注与完成状态确立为三类权威手写源，§3 关键路径、§9 波次、§10 矩阵与消费者列改为派生校验对象；其自身范围内包含修正本文件现存的 31 处不一致。任务书经实施者两轮独立审计（`FAIL` → `CONDITIONAL FAIL` → 关闭）后定版，见 [任务书](audits/roadmap-invariants-gate-task.md)。**与 `PB-10` 并行，不作为其前置。**
>
> **1.3 变更（业主批准，2026-07-30）**：① 新增 `G2-03` 分层门禁任务（§8、§10 `R-HOST`/`R-TEST` 验证列），并据其时序要求为 `PB-10` 增列 `G2-03` 依赖——**`PB-10` 须待 `G2-03` 完成后开工**；② 补录 §3.1 执行台账中缺失的 `PA-06`～`PB-09` 共 22 条记录（此前台账止于 `PA-05`，落后实际进度约 22 个任务，`PB-09` 等前置的完成证明只能在 `docs/audits/` 与 Git 历史中找到）。本次未重排台账既有 27 行的顺序，未改动任何已签署任务行的内容。
> 权威上游：`CONSTITUTION.md`、冻结版立项纲领、`决策记录.md`、G0 专项规范与 `DEFINITION-OF-READY.md`。  
> 本文件回答“按什么依赖顺序实施和验证”；它不改变产品范围，也不授权绕过 DoR、审批矩阵或后续闸门。

## 1. 路线图边界

### 1.1 目标终点

路线图覆盖从空项目到封闭 Alpha 可验证首战闭环：导入 5,000–30,000 字通用专业分析报告草稿，应用声明式模板，稳定分页并检查页面问题，通过可撤销的 AI/人工事务修改，导出交付级 PDF、结构可编辑级 docx、正文迁移级 Markdown 与完整知识包，在 Windows Electron 主环境保存和恢复。

### 1.2 明确范围外

自动同步、模板市场、场景表格/Univer、知识图谱视图、严格公文、法律合同、学术排版、财务审计、PPT、任意 JavaScript 模板、docx 像素级导入保真、Android/iOS、全端 MCP server 不进入本路线图。3–5 页短文档/合同类观察只进入需求池；任何纳入首战的提案必须重新经过产品范围审批与路线图审计。

### 1.3 全任务共同控制

除任务另有更严格说明外，每项原子任务都必须：

- 开始前逐项满足 DoR；使用任务 ID 建分支/提交/证据目录，不因列入路线图自动获准实施。
- 采用“契约/预期行为 → 失败测试或探针 → 最小实现 → 真实验证 → 重构和文档”的内部顺序。
- 只修改任务列出的模块/文件类别；遇到未冻结公共契约先停在契约任务，不让多个消费者各自发明类型。
- 保持可回滚：代码和配置通过独立 Git 提交回退；迁移提供前滚/恢复验证；生成物不得成为唯一真源。
- 不产生现金支出、不发送真实用户数据、不登录外部账号；任务标记“审批”时必须先取得对应批准。
- 生成证据：命令、版本、测试结果、日志/截图/PDF/trace、失败与未执行项；完成后更新路线图状态和指定权威文档。
- 遵守生产代码 300/400、测试代码 300/500 行护栏；按职责和行为拆分，不机械切片。

## 2. 需求与风险标识

| ID | 已批准要求/风险 | 权威来源 |
|---|---|---|
| R-PDF | 固定长文稳定生成 10–20 页交付级 PDF；目录、表格、图片、字体、分页可检查 | PoC-A 实验说明 v1.1、宪法 13 |
| R-PA-METRIC | PoC-A 首次合格 PDF ≤60 分钟，人工干预 ≤20 分钟；重复/性能门槛不变 | 决策 #3、PoC-A 实验说明 |
| R-SCOPE | 首战仅通用专业分析报告与三种内容模块，不扩展文种 | 宪法 1、冻结纲领 §十 |
| R-TEMPLATE | 版本化声明式 JSON/DSL；一期禁止任意 JavaScript | 宪法 14、冻结纲领 §三 |
| R-ID | 所有内容对象有稳定 ID、版本、引用与出处 | 宪法 6、冻结纲领 §九 |
| R-TX | 人与 AI 汇入统一事务/校验边界，AI diff、accept/reject、undo | 宪法 7、冻结纲领 §五 |
| R-RECORDS | 编辑事务、CRDT 合并记录、语义审计事件三层分离 | 宪法 8、冻结纲领 §五 |
| R-DATA | 本地优先、真源/派生分离、开放格式、可导出恢复；Alpha 无自动同步 | 宪法 5/9/10、数据清单 |
| R-HOST | Web 核心不得直连平台 API；能力注册表版本化 | 宪法 11、技术基线 §4 |
| R-OUTPUT | PDF/docx/知识包/Markdown 四级承诺 | 宪法 3、冻结纲领 §三 |
| R-TEST | 真库、真实迁移、真实渲染/文件/E2E；并行先隔离 | 宪法 17/18、测试策略 |
| R-SEC | 不可信输入、权限最小化、模板/文件/模型/密钥安全 | 威胁模型、安全与密钥规范 |
| R-UX | 导入—确认—模板—预览—问题—修改—导出—保存的状态完整闭环 | UX 基线 |
| R-A11Y | WCAG 2.2 AA、键盘、读屏、200% 缩放、语义文档 | 无障碍基线 |
| R-PERF | 分页、检查、导出、恢复、取消与内存预算 | 性能预算 |
| R-COMPAT | Chromium/Electron 主判定；ArkWeb 风险探针；Word/WPS 兼容边界 | 兼容基线、ADR-0001 |
| R-LICENSE | MIT/Apache-2.0/BSD 与 SIL OFL；GPL/AGPL 禁入 | 宪法 20、技术基线 |
| R-COST | 未批准新增支出 0 元；付费模型与账号另过审批 | 成本护栏、审批矩阵 |

## 3. 阶段与关键路径

```text
G1 工程底座
  ├─ 仓库主干：G1-01 → G1-01R → G1-11
  ├─ 契约主干：G1-04 → G1-07；G1-05 → G1-10
  ├─ 真实验证主干：G1-03 → G1-03C → G1-11；G1-03 → G1-08 → G1-11
  └─ 平台工具：G1-12（DevEco）
          ↓ G1 审计 → G2-01/G2-02 首个功能变更门禁
PoC-A：PA-00 → PA-01 → PA-03 → PA-05 → PA-08 → PA-12 → PA-15
          ↓ 排版生死闸
PoC-B：PB-01 → PB-03 → PB-05 → PB-05A → PB-06 → PB-12；PB-03 → PB-07 → PB-08 → PB-09 → PB-12
          ↓ 事务/存储闸
Alpha：A-01 → A-04 → A-08 → A-12 → A-16
          ↓ 封闭 Alpha / G2、G3 专项闸
```

`PoC-A` 失败时停止其后依赖，执行轻排版降级评审；不得继续用 PoC-B/Alpha 功能掩盖排版失败。`PoC-B` 失败时不进入带 AI 写入和知识包承诺的 Alpha。

### 3.1 执行台账

| 任务 | 状态 | 完成/阻断证据 |
|---|---|---|
| G1-01 | ✅ 已完成 | 本地 `main` 根提交 `dcbddc9`；工作树、ignore 与秘密模式探针通过 |
| G1-01R | ✅ 已完成 | 业主已授权创建 [GitHub 私有远程](remote-repository.md)；`deloog/wenshu` 为 PRIVATE、默认分支 `main`、仅业主账号具管理权限，本地与 `origin/main` 首次推送提交一致 |
| G1-02 | ✅ 已完成 | `toolchain.versions.json`、ADR-0002；官方版本/许可证/来源/完整性证据已冻结，未安装业务依赖 |
| G1-03 | ✅ 已完成 | D 盘 Node/pnpm、冻结 lockfile、TypeScript strict + Vite 工作区；Claude 复审 `CONDITIONAL PASS`，首审阻断/重大项全部关闭，见 [审计报告](audits/G1-03-to-G1-06-claude-audit-report.md) |
| G1-03C | ✅ 已完成 | [环境配置基线](configuration.md)：运行时 Schema 与 Vite 配置均进入真实校验；Claude 复审通过 |
| G1-04 | ✅ 已完成 | [v0 文档对象契约](document-model.md)：路径、预算与测试 typecheck 反例通过；Claude 复审通过，NF-03 已登记到 PA-00；[审计报告](audits/G1-03-to-G1-06-claude-audit-report.md) |
| G1-05 | ✅ 已完成 | [v0 模板 DSL 契约](template-dsl.md)：继承访问器与有效基线注入反例通过；Claude 复审通过；[审计报告](audits/G1-03-to-G1-06-claude-audit-report.md) |
| G1-06 | ✅ 已完成 | [v0 Host 契约](host-contract.md)与 [ADR-0003](adr/0003-v0-Host能力协议与平台隔离.md)：值级路径、预算和会话状态机反例通过；Claude 复审通过，NF-01/02/04 已登记到 G1-08/09；[审计报告](audits/G1-03-to-G1-06-claude-audit-report.md) |
| G1-07 | ✅ 已完成 | [v0 项目/知识包/语义审计/兼容契约](project-contract.md)与 [ADR-0004](adr/0004-v0项目知识包与语义审计边界.md)：Claude 复审 `CONDITIONAL PASS`，首审 1 BLOCKER、2 MAJOR 全部关闭；新增 MINOR 已登记到 [PB-05A/G1-09](audits/G1-07-followups.md)；[审计报告](audits/G1-07-claude-audit-report.md) |
| G1-08 | ✅ 已完成 | [测试骨架与并行隔离基线](test-infrastructure.md)：Claude 复审 `CONDITIONAL PASS`，首审 3 MAJOR、5 MINOR 全部关闭；新增 RA-01/RA-02 已登记为 [G1-11 硬门禁](audits/G1-08-followups.md)；[审计报告](audits/G1-08-claude-audit-report.md) |
| G1-09 | ✅ 已完成 | [工程质量与本地验证标准](engineering-standards.md)：Claude 最终复核 `CONDITIONAL PASS`；`RA-01～RA-04` 与 `CF-01` 全部关闭，118 项验证通过；新增 CR-01 已登记到 [G1-15](audits/G1-09-followups.md)；[审计报告](audits/G1-09-claude-audit-report.md) |
| G1-10 | ✅ 已完成 | [fixture 完整性基线](fixture-integrity.md)：Claude 最终复核 `PASS`，FX-01～FX-03 全部关闭；150/150 验证通过，7 个原件与 manifest 锚点零漂移；FX-06 已登记到 [PA-00](audits/G1-10-followups.md)；[审计报告](audits/G1-10-claude-audit-report.md) |
| G1-11 | ✅ 已完成 | [并行 CI 基线](ci.md)本地验证通过；Claude 已关闭 CI-01～CI-05；[首次与最终 GitHub 运行](audits/G1-11-first-remote-run.md)均 8/8 成功，最终运行覆盖提交 `baff4ef`；审计报告 [CI](audits/G1-11-ci-claude-audit-report.md)/[隔离门禁](audits/G1-11-isolation-gates-claude-audit-report.md) |
| G1-12 | ✅ 已完成 | [DevEco 环境说明](deveco-environment.md)：官方 6.1.1.290 与 SHA-256 核验；IDE/SDK/可增长缓存在 D 盘；Empty Ability 真实编译产出 HAP；本机 BIOS 虚拟化未开启，模拟器运行明确后置 |
| G1-13 | ✅ 已完成 | [固定字体基线](font-baseline.md)：Adobe 官方 Source Han Sans CN 2.005R、OFL-1.1、400/500/700 三字重、哈希锚点及 884 个 fixture 必需码点覆盖；Claude 最终复核 `PASS`，FT-01/FT-02 已关闭；FT-01 多余文件在大小写敏感 Linux CI 上的表现留作补充证据点；[审计报告](audits/G1-13-claude-audit-report.md) |
| G1-14 | ✅ 已完成 | [参考机器、采样协议与资源预算说明](reference-machine.md)：Claude 独立审计 `CONDITIONAL PASS` 后复审 EN-01～EN-03 全部关闭（`PASS`），无未关闭发现；可作为 PA-13/A-14 基线；[审计报告](audits/G1-14-claude-audit-report.md) |
| G1-14W | ✅ 已完成 | [决策 #4](../决策记录.md) + 补充：微软官方 Win11 Enterprise Evaluation（22621）Hyper-V VM，`environment.win11.json` 已登记（96DPI/100%、运行时与冻结锚点同基线）；Claude 审计 `CONDITIONAL PASS` 后复审 W14W-01 `PASS` 关闭（离线 VHDX 取证证真、反伪造三链、全链转录 7/7）；无未关闭发现，NOTE 均为 PA-05 书面跟进项；[审计报告](audits/G1-14W-claude-audit-report.md) |
| G2-02 | ✅ 已签署（2026-07-23） | [分支保护与依赖门禁](branch-protection.md)：Claude 复审 `PASS` 签署——G2-M1 双向绑定封死（bump/降级/删除/改分类均被拦）、8 pin 对齐、405 实证、留痕可识别；G2-N2（direct 过滤决定性用例）已登记随维护处理；**G2 双门禁齐备，PA-00 可按 DoR 启动**；[审计报告](audits/G2-02-claude-audit-report.md) |
| PA-04 | ✅ 已完成 | [@wenshu/template-css](../packages/template-css)：ControlledTemplate 逐项白名单映射为声明式 CSS（@page/@font-face/字级四色/分片属性），值发射器重校验杜绝 CSS 注入（Claude 13 类突破载荷端到端对抗 13/13 结构性拒绝、选择器全白名单、url( 恰 3 处），真实浏览器 getComputedStyle 双端逐 token 断言；四处发射器变异独立复跑全红；近似/先行项（keep_with_next→break-after:avoid、sparse_pages→PA-05、.toc→PA-11）登记；Claude 审计 `PASS`，经 [PR #10](https://github.com/deloog/wenshu/pull/10) 合入（`d8c9b7e`，CI 8/8）；跨包 MIME 修复经核最小正确；**交棒 PA-05**（锁定 Chromium 用本门 CSS 导出基线 A4 PDF）；[审计报告](audits/PA-04-claude-audit-report.md) |
| PA-02 | ✅ 已完成 | [@wenshu/template-map](../packages/template-map)：formal-business fixture 经 G1-05 校验映射为受控模板模型（文档契约版本绑定 + G1-13 字体逻辑注册绑定），9/9 契约测试、三处变异自证变红、零新增第三方依赖；Claude 独立审计 `PASS`，经 [PR #8](https://github.com/deloog/wenshu/pull/8) 合入（`d1811f7`，CI 8/8）；[实施记录](audits/PA-02-implementation-record.md) + [审计报告](audits/PA-02-claude-audit-report.md) |
| PA-05 | ✅ 已完成 | [@wenshu/pdf-export](../packages/pdf-export)：锁定 Win11（10.0.22621）+ Edg/150.0.4078.83 导出基线 A4 PDF（20 页），零新增依赖检查器（元数据政策/A4/字体全内嵌仅冻结 OTF/Type0/Type3）；位置感知提取（仿射矩阵+MCID 块序）+ ToUnicode 修复层（洞/错标对齐修补+增量更新，原字节前缀不变），文本层逐字对账；SVG 内联治图表系统字体回退（Skia img 沙箱零 webfont 实证）；Claude 独立审计 `PASS`（跨工具交叉验证：poppler 证 CJK 提取为零、PDFium 渲图视觉确认标题逐字一致、修复层三结构论断成立），经 [PR #11](https://github.com/deloog/wenshu/pull/11) 合入（`89726f4`，CI 8/8）；[实施记录](audits/PA-05-implementation-record.md) + [审计报告](audits/PA-05-claude-audit-report.md)；**交棒 PA-06~12**（基线 PDF 就位且忠实） |
| PA-03 | ✅ 已完成 | [@wenshu/report-render](../packages/report-render)：v0 文档→语义 HTML（标题层级/aria-labelledby/table scope/figure-figcaption/role=separator，全文本转义零 CSS），真实浏览器字体门禁（独占探针 family + FontFace 逐字重加载/check + 字重间量宽互异，缺字体/哈希漂移/错字重/fallback 四负例明确失败），渲染文本与文档逐字对账；零新增第三方依赖（手写最小 CDP 客户端）；Claude 独立审计 `PASS`（ubuntu CI 9.45s 与本机 Windows Chrome 双端真实浏览器证真、五处变异独立复跑全红），经 [PR #9](https://github.com/deloog/wenshu/pull/9) 合入（`7c67cdf`，CI 8/8）；[实施记录](audits/PA-03-implementation-record.md) + [审计报告](audits/PA-03-claude-audit-report.md) |
| PA-01 | ✅ 已完成 | [@wenshu/markdown-import](../packages/markdown-import)：严格子集解析（fixture 构造全覆盖、范围外 fail-closed）、全文逐字对账（恒等式真实承重点=文档↔行账目检查+schema 门禁，两者已有决定性测试，复审仓外重跑 8/8 变异全红）、v0.1.0 schema 通过、稳定 ID 幂等、PA-00 资产重命名；零新增第三方依赖；粗体剥离与[[TOC]]消费取舍已书面交棒 PA-04；首审 `FAIL`（PA-A1）后 PA-A1/A2/A3 修复经复审独立复验（变异矩阵、CRLF 未归账字符 0、CRLF/LF 文档 JSON 一致）；PA-A4～A8 登记 [followups](audits/PA-01-followups.md)，**PA-A5/A6 须在 PA-02 开工前形成决策记录**，PA-A8 须 PA-03 消费文本前关闭；签署生效：远程 run `30067276449`（ubuntu-24.04）8/8 复现，contracts job 逐条测试记录与本地一致；[审计报告](audits/PA-01-claude-audit-report.md) |
| PA-00 | ✅ 已完成 | [决策 #7](../决策记录.md)+[document-model §7](document-model.md)：裁定导入时安全规范化重命名（Schema 零变更），矩阵 13 行无未覆盖合理输入；Claude 首审 `CONDITIONAL PASS` 后复核 `PASS`，**NF-03 与 FX-06 均签署关闭**（36 敌意用例零漏网、PR #5/#6 8/8 全绿）；**PA-01 放行**；[审计报告](audits/PA-00-claude-audit-report.md) |
| G2-01 | ✅ 已完成 | [DoD](../DEFINITION-OF-DONE.md)（七维度+反例映射）、[PR 模板](../.github/PULL_REQUEST_TEMPLATE.md)、[评审清单](review-checklist.md)、[缺陷证据标准](defect-evidence.md) 已冻结；Claude 审计 `PASS`（反例抽验与自构蒙混路径全被拦截）；[审计报告](audits/G2-01-claude-audit-report.md) |
| G1-16 | ✅ 已签署（2026-07-21） | **G1 工程底座已由 Claude 独立审计签署**（[报告](audits/G1-16-claude-audit-report.md)）：SG-01 三项处置核验到位、干净树可复现（空 store 冷装 116/116）、11 份审计报告终局全 PASS、五道承重检查双侧执行、零功能实现；PA 系列可按各自 DoR 启动；承接项：NF-03/FX-06→PA-00、PB-05A、G1-12 审计推迟（决策 #6）、Win11 VM 评估期/Chromium 为 PA-05 前置 |
| G1-15 | ✅ 已完成 | [供应链基线](supply-chain.md)：Claude 首审 `FAIL`（SM-01 MAJOR：安装树平台依赖）后复审 `PASS`，SM-01/SM-02 全部关闭、CR-01 已签署关闭；SBOM 以冻结 lockfile 为真源（147 包、跨平台字节一致、33 条受审许可覆盖经 npm 核验）；首个 ubuntu 远程 CI 矩阵（run `29802405342`，覆盖 `1a717b6`）8/8 成功，SM-01 跨平台确证完成；[审计报告](audits/G1-15-claude-audit-report.md) |
| PA-06 | ✅ 已完成 | [@wenshu/pdf-evidence](../packages/pdf-evidence)：几何证据模型；含子拆分 PA-06B 证据契约 v1.1.0。[ADR-0005](adr/0005-PA-06几何证据独立oracle选型.md)、[ADR-0006](adr/0006-PA-06B证据契约v1.1.0成员标记与绘制框.md)；Claude 审计 [PA-06 `PASS`](audits/PA-06-claude-audit-report.md)、[PA-06B `PASS`](audits/PA-06B-claude-audit-report.md)；[实施记录](audits/PA-06-implementation-record.md) |
| PA-07 | ✅ 已完成 | P0 内容/页面尺寸/越界/遮挡检查；Claude 审计 [`PASS`](audits/PA-07-claude-audit-report.md)；[实施记录](audits/PA-07-implementation-record.md)、[followups](audits/PA-07-followups.md) |
| PA-08 | ✅ 已完成 | 标题/孤行寡行/异常空白 P1 检查；[ADR-0007](adr/0007-PA-08检出报告契约v1.1.0与P1诚实降级.md)（检出报告契约 v1.1.0 与 P1 诚实降级）；Claude 审计 [`PASS`](audits/PA-08-claude-audit-report.md)；[实施记录](audits/PA-08-implementation-record.md)、[followups](audits/PA-08-followups.md) |
| PA-09 | ✅ 已完成 | 表格跨页/表头重复/行切断检查；[ADR-0008](adr/0008-PA-09表格跨页检查严重级与DOM对账归属.md)；Claude 审计 [`PASS`](audits/PA-09-claude-audit-report.md)；[实施记录](audits/PA-09-implementation-record.md)、[followups](audits/PA-09-followups.md) |
| PA-10 | ✅ 已完成 | 图片/题注/来源/比例/越界检查；[ADR-0009](adr/0009-PA-10图片检查严重级与比例容差及转换红线.md)；Claude 审计 [`PASS`](audits/PA-10-claude-audit-report.md)；[实施记录](audits/PA-10-implementation-record.md)、[followups](audits/PA-10-followups.md) |
| PA-11 | ✅ 已完成 | 目录/页眉页脚/实际页码生成与对账；实施拆为 PA-11A（两遍渲染与压印受控补偿，[ADR-0010](adr/0010-PA-11A目录页码两遍渲染与页眉页脚压印受控补偿.md)）与 PA-11B（严重级与配对口径，[ADR-0011](adr/0011-PA-11B目录页码与页眉页脚检查严重级与配对口径.md)）；Claude 审计 [PA-11A `PASS`](audits/PA-11A-claude-audit-report.md)、[PA-11B `PASS`](audits/PA-11B-claude-audit-report.md)；实施记录 [11A](audits/PA-11A-implementation-record.md)/[11B](audits/PA-11B-implementation-record.md) |
| PA-12 | ✅ 已完成 | 正常样本与 12 个故障样本汇总门禁（validator runner + 门禁报告契约）；[ADR-0012](adr/0012-PA-12汇总闸门报告契约与门槛诚实性口径.md)；Claude 审计 [`PASS`](audits/PA-12-claude-audit-report.md)；[实施记录](audits/PA-12-implementation-record.md) |
| PA-13 | ✅ 已完成 | 重复性、取消、资源清理与性能预算；Claude 审计 [`PASS`](audits/PA-13-claude-audit-report.md)——**报告诚实性通过，但分页预算 `not_met`**（冻结 ≤8s，实测 p95 24.300s），该 `not_met` 是 PA-15 判 DEGRADE 的承重证据，不得读作预算达标；[实施记录](audits/PA-13-implementation-record.md)；PR #23（`7c1b11d`） |
| PA-14E | ✅ 已完成 | 安全 Electron 壳复验同一 fixture（contextIsolation/sandbox/无 Node integration）；Claude 审计 [`PASS`](audits/PA-14E-claude-audit-report.md)；[实施记录](audits/PA-14E-implementation-record.md)；PR #24（`7757f2b`） |
| PA-14H | ✅ 已完成 | 最薄 ArkWeb 壳与布局风险探针；Claude 审计 [`PASS`](audits/PA-14H-claude-audit-report.md)；[实施记录](audits/PA-14H-implementation-record.md)；PR #25（`0898570`）。设备实测受本机 BIOS 虚拟化未开启限制，按任务边界如实标为人工前置 |
| PA-14U | ⏸ 已后置（阶段 2） | 按业主决策 C 后置：0 号用户效率实测未执行，[PA-15 闸门报告](audits/PA-15-poc-a-final-gate-report.md) 记为 `deferred` 并明令"**不得把后置写成已达标**"。PA-A7/J1/K1/L1/L2/L4 等人工项一并转入阶段 2 的 0 号用户执行清单。**本项未完成，PoC-A 未取得同口径用户效率实测** |
| PA-15 | ✅ 已完成 | [PoC-A 最终闸门报告](audits/PA-15-poc-a-final-gate-report.md)：结论**建议 DEGRADE**（非 PASS）；Claude 审计 [`PASS`](audits/PA-15-claude-audit-report.md)（判定闸门报告诚实、DEGRADE 证成）；PR #26（`494b4cf`）。后续 [ADR-0013 引擎重评](adr/0013-DEGRADE后排版引擎重评估.md)（Typst 快 100× 但 10/10 被检查器拒 → 维持 DEGRADE）与 [ADR-0014 增量分页](adr/0014-增量分页可行性与DEGRADE口径.md)（增量分页登记为 PB/Alpha 待建架构要求）。业主批准见 [决策 #11A](../决策记录.md)：批准 DEGRADE，授权 PoC-B **非排版部分**先行，全量分页 `not_met` 结论不被追认。**签署时依赖 `PA-14U` 处于后置状态**（见该行），故 PoC-A 不含同口径用户效率实测；此为业主决策 C 批准的偏离，非遗漏，任何状态检查在 `PA-14U` 关闭前都应持续报出该不一致 |
| PB-01 | ✅ 已完成 | 语义编辑内核七维探针与 ADR；Claude 审计 [`PASS`](audits/PB-01-claude-audit-report.md)。开工依据为 [决策 #11A](../决策记录.md)（DEGRADE 裁定 + 非排版 PoC-B 先行授权），非"PoC-A 通过" |
| PB-02 | ✅ 已完成 | [@wenshu/semantic-editor](../packages/semantic-editor)：稳定 ID 最小编辑操作；[ADR-0015](adr/0015-PB-02稳定ID操作层与ProseMirror适配.md)（含业主批准 ProseMirror，[决策 #12](../决策记录.md)）；Claude 审计 [`PASS`](audits/PB-02-claude-audit-report.md)；[实施记录](audits/PB-02-implementation-record.md)；PR #30（`04bfa19`） |
| PB-03 | ✅ 已完成 | [@wenshu/editor-transactions](../packages/editor-transactions)：统一事务、校验、undo/redo 与取消；[ADR-0016](adr/0016-PB-03统一编辑事务边界.md)；Claude 审计 [`PASS`](audits/PB-03-claude-audit-report.md)；[实施记录](audits/PB-03-implementation-record.md)；PR #31（`6fd94ee`） |
| PB-04 | ✅ 已完成 | [@wenshu/semantic-tools](../packages/semantic-tools)：高层语义工具到事务的编译器；[ADR-0017](adr/0017-PB-04冻结语义工具与模型写边界.md)；Claude 审计 [`PASS`](audits/PB-04-claude-audit-report.md)；[实施记录](audits/PB-04-implementation-record.md)；PR #32（`56fa950`） |
| PB-05 | ✅ 已完成 | [@wenshu/editor-diff](../packages/editor-diff)：可定位 diff、accept/reject 与后续 undo；[ADR-0018](adr/0018-PB-05可定位diff与裁决边界.md)；Claude 审计 [`PASS`](audits/PB-05-claude-audit-report.md)；[实施记录](audits/PB-05-implementation-record.md)；PR #34（`c49d1d5`） |
| PB-05A | ✅ 已完成 | 语义审计哈希指称、模型标识与 system 权限冻结，关闭 G1-07 NF-01/02/03；[ADR-0020](adr/0020-PB-05A审计哈希模型标识与system权限.md)；Claude 审计 [`PASS`](audits/PB-05A-claude-audit-report.md)；[实施记录](audits/PB-05A-implementation-record.md)；PR #36（`5ad6683`） |
| PB-06 | ✅ 已完成 | [@wenshu/semantic-audit](../packages/semantic-audit)：语义审计事件与出处链；[ADR-0021](adr/0021-PB-06语义审计事件与出处链.md)；Claude 审计 [`PASS`](audits/PB-06-claude-audit-report.md)；[实施记录](audits/PB-06-implementation-record.md)；PR #37（`d48fcb5`） |
| PB-07 | ✅ 已完成 | 可合并操作模型探针与三层记录隔离（`probes/pb-07-yjs`）；[ADR-0019](adr/0019-PB-07离线CRDT探针与三层记录隔离.md)；Claude 审计 [`PASS`](audits/PB-07-claude-audit-report.md)；[实施记录](audits/PB-07-implementation-record.md)；PR #33（`6f19a84`） |
| PB-08 | ✅ 已完成 | 存储引擎选型（`probes/pb-08-sqlite`）：桌面 `node:sqlite` 真实文件 + Chromium 双标签 `@sqlite.org/sqlite-wasm` OPFS 双面实测；[ADR-0022](adr/0022-PB-08SQLite与OPFS存储引擎选型.md)；Claude 审计 [`PASS`](audits/PB-08-claude-audit-report.md)；[实施记录](audits/PB-08-implementation-record.md)；PR #38（`edf5715`）。**ArkWeb 的 Worker/WASM/OPFS 等价持久化与锁语义标记 `needs_device_to_verify`，三端实际搬运待验证**，不得读作"三端同 API/同物理路径" |
| PB-09 | ✅ 已完成 | [@wenshu/project-storage](../packages/project-storage)：版本化迁移、隔离真库集成与恢复；Claude 审计 [`PASS`](audits/PB-09-claude-audit-report.md)（复审关闭 MINOR，磁盘满诊断保留）；[实施记录](audits/PB-09-implementation-record.md)；PR #39（`fc1c5a9`） |
| PB-10 | ✅ 已完成 | Host 协议 additive 升级到 `0.2.0`，冻结 7 项能力 payload Schema；[@wenshu/project-storage](../packages/project-storage) 实现 grant、原子写、崩溃恢复与真实 Host；`apps/web` 浏览器受控 Host；`apps/electron-shell` 消费侧依赖接入；[ADR-0025](adr/0025-PB-10原子保存崩溃恢复与Host文件边界.md)；[实施记录](audits/PB-10-implementation-record.md)；[审计任务](audits/PB-10-claude-audit-task.md)；Claude 审计 [`CONDITIONAL PASS`](audits/PB-10-claude-audit-report.md)（首审 FAIL → 5 MAJOR/6 MINOR 修复，C1–C4 与 C1-R1 全部关闭）；PR #46（合入 `7a18cd5`，CI run `30634559772` 8/8 success） |
| PB-11 | ✅ 已完成 | [@wenshu/knowledge-package](../packages/knowledge-package)：知识包导出与干净环境重导入，闭合 G1-07 m-01（防篡改为字节级 SHA-256 重算；§6 验收句“所有真源篡改拒绝”按 [ADR-0026 §7.1](adr/0026-PB-11知识包导出与干净环境重导入.md) 收窄口径理解——业主 2026-08-01 书面批准（[决策 #13](../决策记录.md)）：检出单点/不自洽篡改，自洽改写需签名、登记 PB-12/A-15）；[ADR-0026](adr/0026-PB-11知识包导出与干净环境重导入.md)；[实施记录](audits/PB-11-implementation-record.md)；[审计任务](audits/PB-11-claude-audit-task.md)；Claude 审计 [`CONDITIONAL PASS`](audits/PB-11-claude-audit-report.md)（首审 FAIL → MAJOR-1 grant 边界修代码 fail-closed、MI-01～MI-06 同轮处置，复审 C1 说谎型炸弹决定性测试补齐，条件全清）；PR #50（合入 `ed0dc27`，CI run `30648388219` 8/8 success）+ 修复轮 PR #51（合入 `890f86f`，CI run `30676314586` 8/8 success）；[承接项](audits/PB-11-followups.md) |
| PB-12 | ✅ 已完成 | 真实 E2E（Electron 壳 + preload 白名单 IPC + 0.2.0 Host 协议，fake 只在 AI 计划）与 PoC-B 文档型闸门：七链环编排（修改→diff→裁决→undo→保存→强杀→恢复→知识包重导入，真 spawn 真 SIGKILL）+ `recoverGrantDirectory` 双前缀扩展（消费 PB-11-followups #3）+ CI 第 9 job `e2e` + 恢复端到端采样 p95 664.0 ms（预算 10 s）+ 变异守卫 M1~M4；[ADR-0027](adr/0027-PB-12真实E2E入口强杀恢复口径与PoC-B闸门门槛.md)（门槛 §4 钉死）；[闸门报告](audits/PB-12-poc-b-final-gate-report.md)（6 门槛全 met，PoC-B 通过/降级最终裁定归业主）；[实施记录](audits/PB-12-implementation-record.md)；[审计任务](audits/PB-12-claude-audit-task.md)；[承接项](audits/PB-12-followups.md)；Claude 审计 [`PASS`](audits/PB-12-claude-audit-report.md)（首审 FAIL：唯一 MAJOR-1 ContentBase64 广告区间内崩溃 → 修复轮程序式非回溯校验语言等价 + file-host 校验相包络，MI-01～MI-04 同轮处置；复审 §8 PASS——两层复现、25237 例语言对拍 0 分歧、M4 端到端变异为红、§2 通过项零回潮，无未关闭发现）；PR #52 squash 合入 main `cab6711`，main 最终验证 CI run `30693560894` 9/9 success |
| A-01 | ✅ 已完成 | Alpha 信息架构与状态机冻结（R-UX/R-SCOPE）：缺失设计稿 a566a20 正式废弃（[决策 #14](../决策记录.md)，业主裁定 D1）；新 L0 契约包 [@wenshu/ux-state](../packages/ux-state)（ux-spec §4 十二行状态机版本化冻结 `1.0.0`：requiredPresentation/forbiddenSemantics 逐字锚定+12 状态全钉定、a11y 必填入 schema 不推 A-13、D3 增量分页 `repaginationScope` const + `fullRepagination` 契约级禁止、崩溃恢复三字段消费 PB-12 N3 语义输入归口不变）+ apps/web 最小可运行原型（12 状态画廊 + IA 八区骨架，验收工装非设计系统）；G2-03 MI-03 本棒关闭（包根配置文件 auxiliary 规则集 + 反例）；PB-10 followups #5 本棒消费（文档明示浏览器 Host 非持久）；`types:["node"]` 全局洞 eslint 收口；枚举双来源 7+4+dual=12（审计者 §5 自我更正一致）与承接项归口按业主更正执行；[ADR-0028](adr/0028-A-01Alpha信息架构状态机冻结与缺失设计稿处置.md)；[冻结对账表](alpha-ux-freeze.md)；[实施记录](audits/A-01-implementation-record.md)；[审计任务](audits/A-01-claude-audit-task.md)；[承接项](audits/A-01-followups.md)；Claude 审计 [`PASS`](audits/A-01-claude-audit-report.md)（首审 CONDITIONAL PASS：无 BLOCKER/MAJOR；唯一 MINOR-1 forbiddenSemantics 可静默清空 → 修复轮 12 状态逐字钉定+清空即红决定性测试，变异重演审计攻击恰该测试红；复审 §9 PASS——清空/语义反转/凭空加禁令三路强攻全拒，修复面只动契约测试未动 schema/12 状态数据，§2 通过项零回潮，无未关闭发现）；变异自证 M1~M4 全红回退；PR #53 squash 合入 main `8fc9a7d`，main 最终验证 CI run `30704747170` 9/9 success |
| A-02 | ✅ 已完成 | 新建/打开项目与只读导入流程（R-UX/R-DATA）：业主 D1 裁定冻结 `file.import.select`（[决策 #15](../决策记录.md)），host-contract additive 协议 `0.3.0`（0.1.0/0.2.0 冻结字节零改动、0.2.0 注册表经 `payloadRegistryVersion` 保持 /0.1.0 占位形态可建）+ project-storage 单文件 FileGrant（一次性 consume-on-read、漂移 INTEGRITY_FAILURE）+ markdown-import from-text 入口与 `importMarkdownProject` 执行器（temp→verify→rename 事务、CONFLICT 拒并、三阶段取消零残留、原件保护登记）+ ux-state `./data` 纯数据子路径与四态导入流程控制器（未发明第 13 态）+ apps/web 流程 UI 与浏览器 Host 诚实 unsupported（bundle 145,462B→12,351B、ajv 0；A-01 #1/#3 关闭，#2 已实质处置待审计裁定）+ electron-shell `wenshu.project.*` 编排通道（①-c 只在 L3 壳）+ 真实文件 E2E 六子场景（①-a 键集精确断言、R-2 复用 NOT_FOUND、D2 CONFLICT、原件 sha256 全程不变；本机 5 pass+1 诚实 skip，ubuntu CI 全 6 例真实行使）；变异自证①~⑩全红回退；[ADR-0029](adr/0029-A-02导入入口file.import.select冻结与覆盖落盘裁定.md)；[实施记录](audits/A-02-implementation-record.md)；[web 侧子记录](audits/A-02-web-implementation-record.md)；[审计任务](audits/A-02-claude-audit-task.md)；[承接项](audits/A-02-followups.md)；Claude 审计 [`PASS`](audits/A-02-claude-audit-report.md)（首审 CONDITIONAL PASS：唯一 MAJOR-1 经实施者独立复现为探针假象、复审由审计者撤销——结构性根治未知选项键/值 fail-closed；第二次复审 §4 六项全部补核：原件哈希五路径字节级比对+四道断言变异自证坐实、取消终态无 digest 无 code 坐实、§2 零回潮；MINOR-1/2 已关闭、MINOR-4 已就地标注经审计者复核、MINOR-3 登记 [A-01-followups #5](audits/A-01-followups.md) **业主裁定归口 A-01 契约加固**（钉定只落契约测试层）；业主已签收 permission-denied 原件不变仅 CI 证据的证据等级）；PR #55 squash 合入 main `21d14e8`，main 最终验证 CI run `30970309312` 9/9 success |
| A-03 | ✅ 已完成 | 结构确认与语义编辑工作区（R-UX/R-ID）：业主 D1–D4 裁定（[决策 #16](../决策记录.md)）+ [ADR-0030](adr/0030-A-03结构确认口径与A-05分界及停止条件可判定定义.md)；editor-transactions additive 8 结构命令 + apps/web 工作区（DOM-free controller 唯一写边界）+ `wenshu.project.document.read` 只读通道（grant 门控 + 主进程 validateDocument fail-closed）+ 键盘 E2E 6/6（44 键 sendInputEvent 可信管线）+ 30,245 字确定性 fixture 性能采样（p95 ≤72.1ms < 100ms 预算，Win10/Node v24.13.0 证据，Win11 参考机器复跑为签署轮待兑现——业主已签收该证据等级）；[任务书](audits/A-03-implementation-task.md)；[实施记录](audits/A-03-implementation-record.md)；[承接项](audits/A-03-followups.md)；Claude 审计 [`PASS`](audits/A-03-claude-audit-report.md)（首审 CONDITIONAL PASS：MAJOR-1 参考机器证据被批次 env:record 重录 → 登记基线恢复 main 版+批次证据归位+env:record 落点协议陷阱登记 G1-14；MAJOR-2 结构丢失守卫可被操作自我申报绕过 → session 删除许可集改由 `computeExpectedRemovals(command, preDocument)` 独立计算、3 项列表覆盖缺口补齐、审计探针变异复刻「多删+如实申报」首审 COMMITTED/复审 THREW PB03_STABLE_ID_GUARD；[MAJOR 修复记录](audits/A-03-major-remediation.md)；复审 PASS——两项 MAJOR 审计者独立复现关闭、许可集 default:[] 最小默认 fail-closed 另核通过；复审新增 MINOR-1 e2e 通道注册在 loadFile 之后 → 合并前修复前移+实施记录 §6.7 flake 归因更正，审计者三轮 6/6 复验；A-02 happy 路径 wireProgress 迟到进度事件存量竞态本棒 CI 轮暴露，已就地登记 [A-02-followups #5](audits/A-02-followups.md)）；PR #57 squash 合入 main `9d8fce8`，main 最终验证 CI run `31058691089` 9/9 success |
| A-04E | ✅ 已完成 | 已签署引擎渲染耗时分解评估（[决策 #17/#18](../决策记录.md)，R-PDF/R-PA-METRIC）：插桩 renderBreakdown 签署形态（additive 公开面，anchor `770dfb0`）+ Win11 参考 VM 正式十轮清洁批次（`artifacts/perf/2026-08-06-A-04E/`（本地留档，按仓库惯例不入 git）：双标定门 cal-pre 23427.2/cal-post 23700.5 均 ∈ [20553.4,24300.2]、十轮残差 ≤0.38ms 账目闭合、极差 3951=PA-13 的 1.05×、输出 normalized sha 与 PA-13 v6 跨批次全等 `c707ac42…429e`）+ 冷热探针（冷 navigate 11707.8→462.4=25×、print 冷热仅 1.16×、热态整份 4.73s<8s）+ run-6 漂移批留档显式标注不可引用（`artifacts/perf/2026-08-06-A-04E-run6-drift-invalid/`（同左），export 翻面已证伪为漂移伪影）；+8.4% 绝对水平偏移如实登记、本批绝对数值与 PA-13 不可互换引用；[ADR-0032](adr/0032-A-04E渲染分解结论口径与阶段二边界.md)（路径已定位：冷 navigate 为成本中心、浏览器与缓存跨重排存活；可达性强证据；≤8s 证明属阶段二单独裁定）；[任务书](audits/A-04E-implementation-task.md)；[实施记录](audits/A-04E-implementation-record.md)；Claude 审计 [`PASS`](audits/A-04E-claude-audit-report.md)；PR #58 squash 合入 main `8f35d4a`，main 最终验证 run `31149958521` 9/9 success。**A-04E-2a**（决策 #19 出口 1，阶段二首批）✅：决策 #21 D1′ 单遍回填管线（compose 期 `888` 占位 + 单遍渲染 + 大纲测量 + 字节级原地回填，`resolveStableTocPages` 退役）+ R5 持久会话接缝（管线绝不 close 外部会话）；VM 双批次——run-2a-9 持久会话稳态 formal p95=5352.8046ms ≤ 8000（任务书 §5.1 承重口径，余量 33%；批后标定破下限经决策 #23 书面豁免 + 决策 #24 追加更正，最苛刻可辩护修正 +30.00% 后 ≈6958.6ms 仍达标）、run-2a-8 CLI 冷启形态 p95=18409.5 为 §5.1 预告的结构性 not_met 形态如实登记；两批 golden 等价门 21 页 11876 run 零差异、确定性两口径 10/10、签署基线与签署带零改动；[任务书](audits/A-04E-2-implementation-task.md)（§5.1）；[实施记录](audits/A-04E-2a-implementation-record.md)；Claude 审计 [`PASS`](audits/A-04E-2a-claude-audit.md)（两轮 + A2A-F1/F2/F3 复审关闭）；PR #64 squash 合入 main `8b6b8c0`，main 验证 run `34539051926` 10/10 success。A-04E-2b（D4 验证宿主/30 页语料/ADR-0014 四项）未开工，待裁定 |
| G2-03 | ✅ 已完成 | 核心/工具/壳分层门禁（宪法 11 与技术基线 §2 平台隔离从人工审计转为机械门禁）：L0~L3/web 分层归属表冻结，方向/平台 API/node 内建/幽灵依赖/未用生产依赖五类拦截，31 条反例逐条独立复跑（含 6 条防误报反向）；`semantic-editor`→`editor-diff` 平台耦合关闭（[ADR-0023](adr/0023-G2-03平台中立稳定ID随机源.md)）、`project-storage` 生产依赖归属纠正且 SBOM 重建通过；Claude 审计 `PASS`（首审 MA-01 复审关闭），经 [PR #41](https://github.com/deloog/wenshu/pull/41) 合入（`13e84da`，CI 8/8）；[审计报告](audits/G2-03-claude-audit-report.md)；[实施记录](audits/G2-03-implementation-record.md) |
| G2-04 | ✅ 已完成 | 路线图不变量门禁（依赖关系、`R-*` 标注与完成状态收敛为三类权威手写源，§3 关键路径/§9 波次/§10 矩阵/消费者列改为派生校验对象）：10 条判定接入 `pnpm verify` 与 CI `static` job，解析 fail-closed 输出六项计数对照登记下限，例外仅在封闭登记表；任务书 §2.3 登记的 31 处现存违反全部关闭；实施侧 29 条反例逐条独立复跑 + 审计侧自建镜像自构 46 条探针（首审 23 + 复审 23）零失败；[ADR-0024](adr/0024-G2-04路线图手写真源收敛与不变量门禁.md)（含 MI-01 裁定增补：消费者列与依赖列冲突且有散文证据时先裁定哪侧为真）；Claude 审计 `PASS`（首审 CONDITIONAL PASS，MA-01/MI-01 复审关闭），经 [PR #44](https://github.com/deloog/wenshu/pull/44) 合入（`4afcc4e`，CI 8/8）；[审计报告](audits/G2-04-claude-audit-report.md)；[实施记录](audits/G2-04-implementation-record.md) |

## 4. G1：工程底座原子任务

| ID | 单一目标与来源 | 依赖 → 消费者 | 范围内 / 范围外与文件 | 完成证据与真实验证 | 风险、停止/回滚、并行与审批 |
|---|---|---|---|---|---|
| G1-01 | 建立本地 Git 基线与忽略规则。R-TEST/R-SEC | G0/GR → 全任务 | `git init`、默认分支、`.gitignore`、基线提交；不创建远程 | 用户文件、安装包、产物、密钥、数据库均被 ignore 探针阻止；工作树基线可复现 | 发现现有历史/冲突即停；只回滚新元数据。可独立；远程仓库需另批 |
| G1-01R | 建立私有远程仓库、默认分支与最小权限。R-TEST/R-SEC | G1-01、业主外部行为批准 → G1-11/16/G2-02 | 私有远程、origin、默认分支；不公开、不发布 | 本地/远程提交一致；未跟踪密钥/产物；权限与可见性截图留证 | 未获批准或需登录/2FA即阻断本任务，不伪造远程；删除远程需另批准。不得与根历史改写并行 |
| G1-02 | 锁定免费稳定运行时、包管理器、Electron/Chromium候选并写 ADR。R-COMPAT/R-LICENSE/R-COST | G1-01 → G1-03/03C/08/11 | 版本文件、ADR、许可证初审；不安装业务依赖 | 官方支持范围、哈希/来源、替代路径和 Windows 10/11 差异有证据 | 许可/支持不明即不选；回滚 ADR。G1-03实现须等待本任务，其他契约设计可并行；0 元 |
| G1-03 | 建立最小 TypeScript strict + Vite 工作区骨架。R-HOST/R-TEST | G1-01/02 → G1-08/PA/PB/A | `apps/web`、`packages/*`、`tools`、统一脚本；不做产品功能 | 冻结锁文件安装、dev/build/typecheck 在干净目录通过 | 构建不可复现即停；回滚骨架提交。串行占用根配置 |
| G1-03C | 建立 dev/test/staging/production 配置分层与启动前校验。R-SEC/R-TEST | G1-03 → G1-11/16 | 配置 schema、`.env.example`、缺失/未知配置错误；不含真实密钥 | 四环境配置契约测试；缺配置快速失败；日志不回显秘密 | 禁止提交真实 `.env`；回滚配置提交。独占配置入口，可与 G1-04/05/06/07 并行 |
| G1-04 | 冻结 v0 文档对象与稳定 ID schema。R-ID/R-DATA | G1-02 → G1-05/PA-01/PB-02 | schema、示例、兼容规则、生成类型；不实现编辑器 | 合法/非法 fixture 契约测试；类型由 schema 生成且漂移检查通过 | 无法表达三种内容模块即停；schema 主版本可回滚。权威契约独占修改 |
| G1-05 | 冻结 v0 模板 DSL schema 与执行安全边界。R-TEMPLATE/R-SEC | G1-04 → PA-02/PA-04 | schema、白名单、版本/迁移占位；无解释器实现 | 拒绝函数/脚本/未知能力/路径与网络字段的契约测试 | 任意执行面未封闭即停；回滚 schema。与 G1-06 可并行，文件隔离 |
| G1-06 | 冻结 v0 host 能力、错误、取消、进度契约。R-HOST/R-UX | G1-02 → G1-09/PB-10/A | schema/类型；浏览器/Electron/ArkWeb 实现不在本任务 | 能力支持/拒绝/取消/超时/降级的契约样例通过 | 平台类型泄漏到核心即停；回滚契约。与 G1-05 并行，契约文件隔离 |
| G1-07 | 冻结 v0 项目、知识包、语义审计与版本兼容契约。R-DATA/R-RECORDS/R-OUTPUT | G1-04/06 → PB-05/07/08 | schema 与迁移原则；不选择数据库实现 | round-trip fixture、缺字段/未来版本拒绝契约测试 | 真源与派生无法区分即停。权威契约独占；无外部审批 |
| G1-08 | 建立单元/契约/渲染/集成/E2E 测试骨架和隔离目录。R-TEST | G1-03/04/05/06 → 全实现 | 测试配置、worker 目录/端口构造器、证据目录；不写功能测试冒充通过；处理复审 NF-01/NF-04 | 两 worker 并行写独立目录；失败保留日志/seed；测试层名称审计；Host 文档导出名与代码一致，终态后 cancel 返回稳定协议问题码 | 隔离失败则相关层串行；回滚配置。可与 G1-09 并行；NF-01/NF-04 不得由实施者自行标为已关闭，留待该任务审计确认 |
| G1-09 | 建立工程标准、格式/lint/typecheck、文件体量与生成漂移护栏。R-TEST | G1-03/06 → 全任务 | `engineering-standards` 与本地检查；不增加宽泛豁免；处理 Host 复审 NF-02 与 G1-07 m-05/NF-04 | 显式/隐式 `any` 禁用护栏；逐包枚举并证明 `src/test/scripts` 与 TS 配置文件均进入 typecheck；非法 fixture 断言稳定 issue code 与预期 JSON path，覆盖 G1-07 当前归入 `PROJECT_INTEGRITY` 的七类判定；Host 值拒绝 NUL/控制字符及带任意前缀的盘符、POSIX/UNC、`file:` 和穿越片段；300 行预警、生产>400/测试>500失败的正反 fixture；单一 verify 入口 | 工具误报先修规则，不加全局 ignore。第三方/生成声明必须在边界收窄，不得用 `as any` 或 `@ts-ignore`。Host NF-02 必须在 PA-14E/PB-10 等真实 Host 消费协议值前经独立审计关闭；G1-07 m-05/NF-04 须在首个依赖稳定问题码分支的消费者前关闭。独占根工具配置 |
| G1-10 | 固定 PoC fixture 哈希、只读复制和证据 manifest。R-PDF/R-TEST | G1-04/05/08 → PA 全部 | fixture manifest/校验工具；不修改冻结原件 | 篡改任一字节会失败；运行只写隔离副本 | 原 fixture 不一致即停并审计。可与 G1-09 并行，文件隔离 |
| G1-11 | 建立并行 CI 骨架与本地同构 verify。R-TEST/R-LICENSE | G1-01R/03C/08/09 → G1 审计/全任务 | 快速 job：format/lint/type/unit/contract/build/secret/license；不创建付费服务；关闭 G1-08 RA-01/RA-02 后才接并行 runner | 本地与私有远程 CI 同构；无依赖 job 并行；缓存键含锁文件/运行时；故意失败能快速定位；证据写入在运行时验证品牌与磁盘 claim；`evidence/` 非空时成功清理必须拒绝且证据完整 | CI 服务需登录时停在人工授权；不启用付费额度。并行 runner 首次调用证据/清理 API 前必须独立审计 RA-01/RA-02；不得用静默 force 删除失败证据。独占流水线配置 |
| G1-12 | 从华为官方安装并锁定 DevEco、SDK、缓存到 D 盘。R-COMPAT/R-COST | GR/G1-02 → PA-14H/PB-11 | IDE/SDK/模拟器路径、版本、哈希、环境说明；不写 ArkTS 业务 | D 盘主体/SDK/缓存、命令行版本、空项目官方诊断；记录不可避免 C 盘占用 | 登录/协议/下载源/空间不符即停；用官方卸载回滚。与 G1-04/05/06/07/08/09/10 可并行；不购买账号 |
| G1-13 | 获取并登记固定中文字体及许可证。R-PDF/R-LICENSE | G1-02/10 → PA-03 | Adobe 官方字体、LICENSE、哈希、最小字重；不从镜像下载 | 干净字体清单、字符覆盖和篡改检测通过 | 授权/哈希不明即停并删除未采纳副本。可与 G1-12 并行；0 元 |
| G1-14 | 建立参考机器、性能采样与资源预算说明。R-PERF | G1-02/03/10 → PA-13/A-14 | 环境清单、采样协议；不宣布未测阈值通过 | OS/CPU/RAM/DPI/磁盘/版本/fixture 哈希自动记录 | 噪声不可控则增加重复而不改阈值。可与 G1-12/13 并行 |
| G1-14W | 落实 PoC-A 预注册的 Windows 11 64位参考环境。R-COMPAT/R-PA-METRIC | G1-14 → PA-05/13 | 现有合法设备或隔离VM的环境证据；不擅自升级当前Windows 10、不购买设备 | 100%缩放、96DPI、字体/Chromium/硬件信息可复现；与当前Win10基线差异记录 | 无可用Win11环境时必须请业主决定延期或批准实验环境变更；该变更需更新决策与重审。可与G1-12/13并行 |
| G1-15 | 完成供应链初审与 SBOM/许可证基线。R-LICENSE/R-SEC | G1-02/03 → G1 审计 | 直接/传递依赖清单、用途、许可、漏洞与工作区依赖声明完整性；不批准例外；显式核查当前树中的 MPL-2.0、Python-2.0 与 BlueOak-1.0.0 传递依赖；处理 G1-09 CR-01 | GPL/AGPL/未知许可阻断 fixture；SBOM 可重建；工作区包不得使用未声明依赖；MPL 文件级义务、Python 工具分发边界和 BlueOak 宽松许可是否可接受均有书面结论 | 不明或未获业主批准的许可即移除候选。CR-01 最迟 G1-16 前关闭；可与 G1-11 并行；例外须业主批准 |
| G1-16 | 审计并签署 G1 工程底座。全部 G1 | G1-01/01R/02/03/03C/04/05/06/07/08/09/10/11/12/13/14/14W/15 → G2-01/02 | G1 报告、未完成项和命令索引；不做功能实现 | 从私有远程干净克隆后一键安装/verify；契约、真实测试设施、CI、工具链证据齐全 | 任一阻断未闭环不得进入功能实现；文档任务串行 |

## 5. PoC-A：排版生死闸原子任务

| ID | 单一目标与来源 | 依赖 → 消费者 | 范围内 / 范围外与文件 | 完成证据与真实验证 | 风险、停止/回滚、并行与审批 |
|---|---|---|---|---|---|
| PA-00 | 裁定导入资源文件名策略并关闭复审 NF-03 与 G1-10 FX-06。R-PDF/R-ID/R-COMPAT | G1-04/10 → PA-01/A-02D | 仅比较并决定“导入时安全规范化重命名”或“升级 Schema 支持受控 Unicode/扩展名大小写”；补齐或如实收窄 fixture 的 Windows/POSIX 可移植字符规则；不实现解析器 | 中文、空格、大写扩展名、目录含点、webp、Windows 保留字符（小于号、大于号、双引号、竖线、问号、星号）的固定决策矩阵；结论写入 `document-model.md` 与 `fixture-integrity.md`；若改 Schema，按 `0.x` 次版本升级并重跑消费者契约、独立审计；FX-06 须由独立审计签署 | 未决不得开始 PA-01；不得原地放宽 `0.1.0`，不得由实施者自行关闭 FX-06。文档/Schema 决策串行 |
| PA-01 | 将固定 Markdown 解析为 v0 类型化文档且内容对账。R-PDF/R-ID | G1-04/08/10/16、G2-01/02、PA-00 → PA-02/03 | 只支持 fixture 用到的标题、段落、列表、引用、普通表格、图片、标记 | 单元+契约；节点稳定 ID；字符/表格/图片引用无丢失重复 | 无法无损表达即停修 schema；回滚解析器。与 PA-04 设计不可并行改 schema |
| PA-02 | 将正式商务 fixture 映射为受控模板模型。R-TEMPLATE | G1-05/10/16, PA-01契约 → PA-04 | 只实现模板 v1 所需 token/规则；无任意 JS | 契约测试覆盖未知字段、版本不兼容、越权能力拒绝 | 需要逐页内容特例即失败并回到模板规则。可与 PA-03 并行 |
| PA-03 | 构建语义 HTML 渲染与字体加载检查。R-PDF/R-A11Y | PA-01,G1-13 → PA-04/05 | 章节、表格、figure/figcaption、来源；不分页 | 浏览器真实加载字体；DOM语义/文本对账；缺字体明确失败 | fallback 未被发现即阻断。与 PA-02 并行，文件隔离 |
| PA-04 | 实现模板 token 到 CSS/布局规则的白名单解释。R-TEMPLATE | PA-02/03 → PA-05 | 纸张、边距、层级、表格、图片、保持规则；不直接打印 | 单元/契约+真实浏览器样式断言；恶意字段无效 | 解释器出现 eval/网络/文件能力即失败。串行消费模板契约 |
| PA-05 | 用真实锁定 Chromium 导出基线 A4 PDF。R-PDF | PA-03/04,G1-14W → PA-06/07/08/09/10/11/12 | 固定Windows 11环境打印；不做 validator 修正 | PDF 可打开/搜索/复制、A4、内容对账；导出元数据按明示规则清理/标注并留证（不残留上游草稿工具的作者/组织属性），打印参数留证 | 页数/内容错误先定位，不手调 fixture。可与 PA-06 设计并行；引擎对照评估见 [pdf-engine-evaluation](pdf-engine-evaluation.md) |
| PA-06 | 提取 PDF 页面、文本与几何证据模型。R-PDF/R-TEST | PA-05 → PA-07/08/09/10/11 | 页面框、文本框、图片框、字体信息；不判断质量 | 与真实 PDF 解析器集成；损坏/加密/空 PDF 失败分类 | 解析器许可或几何不可靠则替换，不用 mock。共享证据契约独占 |
| PA-07 | 实现 P0 内容、页面尺寸、越界、遮挡检查。R-PDF | PA-06 → PA-12 | P0 检查及页/节点定位；不含 P1 | 正常 fixture 无 P0；对应 fault fixture 全检出 | 漏检 P0 阻断；回滚单规则。可与 PA-08/09 在冻结证据契约后并行 |
| PA-08 | 实现标题、孤行寡行与异常空白 P1 检查。R-PDF | PA-06 → PA-12 | 标题/首段、widow/orphan、密度证据 | 单故障 fixture 检出并定位；正常误报受门槛限制 | 无法确定性判断的降为显式人工检查，不伪装自动覆盖。与 PA-07/09 并行 |
| PA-09 | 实现表格跨页、表头重复与行切断检查。R-PDF | PA-06 → PA-12 | 普通表格；不含合并单元格/电子表格计算 | 真实 PDF + DOM 对账；表格 fault 全覆盖 | 表格无法通用分页则触发 PoC-A风险评审。与 PA-07/08 并行 |
| PA-10 | 实现图片、题注、来源、比例与越界检查。R-PDF | PA-06 → PA-12 | 两张 fixture 图；受控 SVG→等价资源允许并留痕 | 图/题注/来源同页、清晰、比例正确；fault 检出 | 转换改变内容/来源即停。可与 PA-07/08/09 并行 |
| PA-11 | 生成并核对目录、页眉页脚和实际页码。R-PDF | PA-05/06 → PA-12 | 自动目录、封面例外、页码；不手写页号 | 标题与目录双向对账；页码重复运行一致 | 浏览器能力触顶则记录受控补偿，不逐页写死。串行影响分页 |
| PA-12 | 汇总正常样本与12个故障样本门禁。R-PDF/R-TEST | PA-07/08/09/10/11 → PA-13/15 | validator runner、报告 schema、人工检查清单；校验只标注位置与依据、不代改；规则可单条豁免并记录理由（PoC-A 阶段 P0 不可豁免） | P0全检出，P0+P1≥10/12，正常误报≤2；证据含页码/节点 | 不达门槛不得调低规则；逐项修复或判失败。独占门禁报告 |
| PA-13 | 验证重复性、取消、资源清理与性能预算。R-PERF/R-PA-METRIC | PA-05/12,G1-14/14W → PA-15 | 10次重复、30页采样、取消；不优化牺牲正确性 | 页数/P0P1/关键几何一致；分页≤8s、检查≤5s、导出≤30s、取消目标 | 超预算先剖析；不得删内容/降质量。可与 PA-14E/14H 并行，独立运行目录 |
| PA-14E | 在安全 Electron 壳复验同一 fixture。R-COMPAT/R-HOST | PA-05/12,G1-02/03 → PA-15 | Electron renderer、窄 preload/host、PDF复验；不做桌面产品功能 | 页数/字体/换行/validator与Chromium对账；contextIsolation、sandbox、Node integration检查 | 安全配置或排版不一致即阻断桌面主判定。与 PA-14H 平台目录隔离后并行 |
| PA-14H | 建立最薄 ArkWeb 壳并完成布局风险探针。R-COMPAT/R-HOST | PA-05/12,G1-06/12 → PA-15/PB-10 | 生命周期、静态Web资源、最小host桥和同fixture；不复制Web业务 | IDE和命令行构建、模拟器/可用设备运行、页数/字体/换行/不支持能力记录 | 账号/设备缺失如实标人工前置；可隔离差异允许条件通过。与 PA-14E 并行 |
| PA-14U | 由0号用户运行PoC-A固定任务并测量首次可接受成品。R-PA-METRIC/R-UX | PA-12/13、可用最小操作入口 → PA-15 | 与BASE-01相同fixture/标准；AI只记录，不代替用户裁决 | 记录总时间、人工干预、调整次数、页数、P0/P1、would_send；总时≤60、人工≤20 | 未完成或不愿发送即如实失败，不追加练习美化结果。人工任务与平台探针可并行 |
| PA-15 | 形成 PoC-A 闸门报告并执行通过/降级决定。R-PDF/R-PA-METRIC | PA-12/13/14E/14H/14U → PB/A | 结论、证据、122.3分钟对照、总时≤60/人工≤20；不扩功能 | PDF合格标准、故障、重复、性能、人工干预逐项签署；**状态：DEGRADE（业主已批准，见决策 #11A）** | 30 页分页 p95 24.300s/8s `not_met`；停止 PB/Alpha 对当前 Chromium 排版路径的依赖并启动轻排版重审；非排版 PoC-B 仅按决策 #11A 先行；产品指标变更需业主批准 |

## 6. PoC-B：AI 编辑事务与本地状态闸

| ID | 单一目标与来源 | 依赖 → 消费者 | 范围内 / 范围外与文件 | 完成证据与真实验证 | 风险、停止/回滚、并行与审批 |
|---|---|---|---|---|---|
| PB-01 | 用七维探针比较语义编辑内核候选并写 ADR。R-TX/R-COMPAT/R-LICENSE | G1-15/16, PA-15 DEGRADE 裁定 + 业主批准非排版 PoC-B 先行（决策 #11A） → PB-02 | 最小候选探针；不做完整编辑器或排版路径 | 固定操作、事务、导出、CRDT耦合、ArkWeb性能评分可复现 | 许可/维护不合格即淘汰；回滚探针；不得以 PoC-B 掩盖或追认 Chromium 排版 `not_met`。可与 PB-04 设计并行 |
| PB-02 | 实现稳定 ID 的最小文档编辑操作。R-ID/R-TX | G1-04,PB-01 → PB-03/04 | 插入、删除、移动、改写节点；不含协同UI | 属性测试：普通编辑后未受影响 ID 稳定；schema 始终有效 | ID依赖位置即失败；回滚操作层。串行奠定事务 |
| PB-03 | 建立统一事务、校验、undo/redo 与取消。R-TX | PB-02 → PB-04/05 | 人工/AI共同提交边界；不记录沉重审计到每次按键 | 单元+组件+集成；失败事务原子回滚；undo/redo往返相等 | 半提交或无法取消即阻断。权威事务模块独占 |
| PB-04 | 实现高层语义工具到事务的编译器。R-TX/R-SEC | PB-03 → PB-05/A-07 | 冻结工具集：重写、插入、提纲、普通表格、引用、移动子树 | 契约测试、权限拒绝、越权参数、prompt injection fixture | 模型不得直接写存储/DOM；越界即停。可与 PB-06 在契约冻结后并行 |
| PB-05 | 实现可定位 diff、accept/reject 与后续 undo。R-TX/R-UX | PB-03/04 → A-07 | 节点/字段级差异；不做多人合并UI | 组件/E2E：未接受不改真源，部分接受可撤销 | diff丢上下文或错误合并即阻断。独占 diff 契约 |
| PB-05A | 冻结语义审计哈希指称、模型标识与 system 权限，关闭 G1-07 NF-01/02/03。R-RECORDS/R-SEC | G1-07,PB-05 → PB-06 | 基于真实 diff 语义裁定每类 action 的 hash subject；用结构化注册标识和明确的“凭证不得进入契约”边界替代敏感子串黑名单；列出 system 唯一允许 action；必要时升级 Schema/ADR，不实现审计存储 | `template_applied` 无需伪造文档哈希；合法 `keystone`/`monkey`/`tokenizer` 标识不被误杀且凭证字段无入口；system 权限正反矩阵；Schema 变更按 `0.x` 规则并通过独立审计 | 未裁定不得开始 PB-06；不得让同一哈希字段在不同 action 间隐式变义，也不得以高熵猜测冒充密钥防护。契约文件串行 |
| PB-06 | 实现语义审计事件与出处链。R-RECORDS | G1-07,PB-03/04,PB-05A → A-09 | 重要事件、材料引用、前后哈希、裁决；不记录每次按键 | 能回答来源/AI修改/人工后改/材料存在；隐私字段审计 | 日志含密钥/全文泄漏即阻断。可与 PB-07 并行，schema隔离 |
| PB-07 | 验证可合并操作模型并隔离三层记录。R-RECORDS/R-DATA | PB-02/03,G1-07 → PB-08 | CRDT候选最小探针；Alpha不做自动同步 | 两副本离线编辑后合并；编辑历史/CRDT/语义审计不混用 | 无法稳定映射ID/事务则更换候选并重审 ADR。与 PB-06 并行 |
| PB-08 | 选择 SQLite/OPFS 与桌面同格式存储并写 ADR。R-DATA/R-TEST | G1-07/08,PB-07 → PB-09/10 | 真实候选数据库、Worker/多标签探针；不做云同步 | 真实引擎、真实迁移、并发/锁/大文档探针；非 Map/JSON 替代 | 三端同格式不可行则记录适配边界，不伪称同库。独占存储 ADR |
| PB-09 | 建立版本化迁移、隔离真库集成与恢复。R-DATA/R-TEST | PB-08 → PB-10/11 | schema v0→v1、seed、备份/恢复；不手改数据库 | 每 worker 独立真实库；迁移、重复运行、中断、损坏、磁盘/权限失败 | 数据丢失即阻断；恢复副本优先，迁移历史不可改。可分片并行但库/目录隔离 |
| PB-10 | 实现原子保存、崩溃恢复与 host 文件边界。R-HOST/R-DATA | G1-06,PB-09,G2-03 → PB-11/A-02 | 浏览器受控host与Electron文件host；不覆盖导入原件 | 强杀/重开≤10s；上次成功成品不损坏；拒绝权限有降级 | 路径逃逸/半写文件即阻断。平台实现文件隔离后并行 |
| PB-11 | 实现知识包导出与干净环境重导入。R-OUTPUT/R-DATA | G1-07,PB-06/09/10 → PB-12/A-11 | 内容、模板、审计、附件、manifest；不含派生索引真源化；闭合 G1-07 m-01 | 干净环境 round-trip 对账 ID/版本/引用/审计/附件；从真实序列化字节计算并核验 `truth.project` 与 `truth.audit` entry 哈希；所有真源篡改拒绝 | 仅“文件存在”或只信 manifest 自报哈希不算通过；回滚导入事务。与 ArkWeb 壳探针可并行 |
| PB-12 | 完成真实 E2E 与 PoC-B 闸门报告。R-TX/R-DATA/R-TEST | PB-05/06/07/08/09/10/11 → Alpha | AI计划可用契约fake；核心事务/真库/文件/恢复必须真实 | 修改→diff→裁决→undo→保存→强杀→恢复→知识包重导入全链通过 | 任一真源/恢复/撤销阻断未闭环不得进入 Alpha；指标变更需业主批准 |

## 7. 封闭 Alpha 首战闭环原子任务

| ID | 单一目标与来源 | 依赖 → 消费者 | 范围内 / 范围外与文件 | 完成证据与真实验证 | 风险、停止/回滚、并行与审批 |
|---|---|---|---|---|---|
| A-01 | 冻结 Alpha 信息架构、状态机和缺失设计稿处置。R-UX/R-SCOPE | PA-15/PB-12 → A-02/02D/03/04/04T/05/06/07/08/09/10P/10X | 只含 UX 基线上限；不做完整设计系统 | 每个加载/部分成功/失败/取消/离线/恢复状态有可验收原型 | 找回旧稿或正式废弃，不猜其内容。可与 A-10P/10X 设计并行 |
| A-02 | 实现新建/打开项目与只读导入流程。R-UX/R-DATA | A-01,PB-10 → A-03/12 | Markdown/固定结构入口；docx候选另任务 | 真实文件E2E：取消、部分失败、权限拒绝、原件哈希不变 | 任何原地修改即阻断。可与 A-05 并行，目录隔离 |
| A-02D | 验证并实现 docx 结构可编辑级导入适配。R-COMPAT/R-LICENSE/R-SCOPE | A-02,G1-15 → A-12 | 只提取首战支持的标题、正文、列表、普通表格、图片；不追像素级保真 | 真实 docx fixture 与恶意/损坏/超限文件；原件只读；不支持内容有报告 | 候选依赖许可/安全不合格即替换；视觉差异不冒充保真。可与 A-04T 并行 |
| A-03 | 实现结构确认与语义编辑工作区。R-UX/R-ID | A-02,PB-01/02/03 → A-07/12 | 文字、标题、列表、普通表格、图片；不含复杂表格 | 键盘编辑、稳定ID、undo/redo、30k字响应预算 | 主线程冻结/结构丢失即阻断。独占编辑器模块 |
| A-04 | 将 PoC-A 模板/分页/检查整合为可取消预览。R-PDF/R-UX | A-03,PA-15,A-04E → A-08/12 | 正式商务先行，再增不超过三套模板 | 旧预览保留到新预览成功；问题可定位；真实 PDF 引擎 | 若整合破坏 PoC-A 基线，回退到已签署引擎。可与 A-06 并行 |
| A-04E | 评估已签署 Chromium 引擎渲染耗时分解与 ≤8s 可达性路径（A-04 挂起期间另开，决策 #17/#18）。R-PDF/R-PA-METRIC | PA-13,PA-15,G1-14W,A-03 → A-04 | 阶段一只测不改：插桩分解、双标定门正式批次、冷热探针；不实现持久会话、不接排版依赖、Typst 供应链不预批 | Win11 参考 VM 清洁批次：双标定门带内、十轮账目闭合、输出 normalized sha 与 PA-13 v6 跨批次一致、冷热探针与批次互证 | ≤8s 证明与持久会话实现属阶段二单独裁定（ADR-0032）；VM 停机挂载注入、离线、跑完自关 |
| A-04T | 增加“简洁研究、深色咨询”两套受控模板。R-SCOPE/R-TEMPLATE | A-04,PA-02/04 → A-12 | 同一 DSL/schema、独立版本和迁移；不增加行业文种 | 每模板固定快照/PDF/validator/字体/对比度验证；无逐页内容特例 | 任何模板不能通过同一门禁则不进入Alpha模板集。与 A-02D 并行，模板目录隔离 |
| A-05 | 实现附件、图片替代文本与普通表格编辑。R-SCOPE/R-A11Y | A-02/03 → A-12 | 普通图片/表格；不含场景表格计算 | 文件/尺寸上限、表头语义、alt、跨页回归真实通过 | 超限预检，不静默压缩/丢弃。可与 A-06 并行 |
| A-06 | 实现引用与出处查看/定位。R-RECORDS/R-UX | PB-06,A-01 → A-07/09 | 材料引用、来源状态；不做知识图谱 | 引用到材料双向定位；材料缺失明确显示 | 不自动伪造来源；可与 A-04/05 并行 |
| A-07P | 实现 provider 中立 AI 适配器、BYOK 安全存储与预算前置检查。R-TX/R-SEC/R-COST | G1-06,PB-04/06 → A-07/12 | 至少一个可替换provider契约；密钥仅经host安全存储；不内置项目代付 | 录制响应用于日常测试；经业主提供凭证与费用批准后做最小真实调用烟测；超时/取消/限额/脱敏通过 | 无凭证/费用批准时真实烟测保持显式阻断，不伪造；适配器仍可契约验收。独占provider契约 |
| A-07 | 实现 AI 目标/约束、计划、diff 与裁决界面。R-TX/R-UX | A-07P,PB-04/05,A-03/06 → A-12 | 不自动接受修改；界面不耦合具体provider | 取消、越权拒绝、部分接受、reject、undo E2E；模型不可用仍可本地工作 | 未接受写入真源即阻断。与 A-08 分模块并行 |
| A-08 | 实现页面问题列表、建议修复与有记录豁免。R-PDF/R-UX | A-04,PA-12 → A-12 | P0/P1/P2、定位、可撤销修复；P0默认阻断正式导出 | 问题→节点→修复→重检；豁免有原因且不无限提示 | 不得让 AI 关闭validator来“修复”。与 A-07 并行 |
| A-09 | 实现版本历史、正式版本与语义审计视图。R-RECORDS/R-DATA | PB-06/09,A-06/07 → A-10X/11/12 | 重要版本/事件；不展示高频事务噪声 | 恢复旧版产生新版本且可撤销；出处链可读 | 历史删除/覆盖需另审批。可与 A-10P 并行 |
| A-10P | 实现交付级 PDF 导出、导出前门禁与安全另存。R-OUTPUT/R-UX | PA-15,A-04/08 → A-12 | PDF、字体/引用/页面检查、覆盖确认；不做其他格式 | 真实导出在两个阅读器打开/搜索/复制；失败保留上次成品；P0默认阻断 | 不允许通过跳过validator导出“正式版”。与 A-09 并行 |
| A-10X | 整合 docx、Markdown、知识包三类可迁移导出。R-OUTPUT/R-DATA | PB-11,A-03/06/09 → A-11/12 | 分别标明结构可编辑/正文迁移/完整保真；不夸大视觉承诺 | docx用WPS打开继续编辑；Markdown内容对账；知识包干净重导入 | Word延期留痕；任一格式失败不影响其他格式且有清晰报告。与 A-10P 并行，输出目录隔离 |
| A-11 | 实现本地项目列表、搜索、手工备份与重导入。R-DATA | PB-09/10/11,A-09/10X → A-12 | Alpha本地能力；不做自动同步/账号 | 真实SQLite/文件E2E、干净导入、派生索引可删重建 | 搜索索引不得成为真源。与 A-10P 后半可并行，库隔离 |
| A-12 | 贯通 Alpha 关键真实 E2E。R-TEST/R-UX | A-02/02D/03/04/04T/05/06/07P/07/08/09/10P/10X/11 → A-13/14/15/15M/16 | 首战正常/失败/恢复闭环；第三方付费模型日常回归可用录制响应 | 导入→确认→模板→预览→问题→修改→四级导出→保存/恢复真实通过；批准后补真实模型烟测 | 共享数据库/目录/端口隔离后分片；不能隔离则串行 |
| A-13 | 完成 WCAG AA 自动与人工验证。R-A11Y | A-12 → A-16 | 键盘、Windows读屏、200%、高对比、减少动态 | 自动扫描+仅键盘E2E+读屏记录；PDF物理尺寸不随UI缩放 | 自动通过不替代人工；缺平台能力列明。可与 A-14/15 并行 |
| A-14 | 完成性能、内存、长任务取消与退化门禁。R-PERF | A-12,G1-14 → A-16 | 30k字/30页上限、10次重复 | 全预算原始数据；相对基线退化>20%阻断；取消资源释放 | 不以删检查/降质量优化。独立机器状态下与 A-13/15 并行 |
| A-15 | 完成安全、隐私、依赖与恶意输入专项。R-SEC/R-LICENSE/R-COST | A-02/02D/03/04/04T/05/06/07P/07/08/09/10P/10X/11/12,G1-15 → A-16 | 路径/压缩炸弹/模板注入/prompt injection/密钥/日志 | 静态+动态+真实文件边界；SBOM/许可/密钥扫描；零真实用户数据 | 高危未闭环不得Alpha；无批准不跑付费模型。与 A-13/14 并行 |
| A-15M | 在真实Mac上验证Electron关键闭环与打包前兼容。R-COMPAT | A-12/13/14/15,PA-14E → A-16/G3-01 | 使用已有合法Mac环境；不购买设备、不签名发布 | 打开项目、编辑、分页、导出、恢复关键冒烟；版本/日志/差异留证 | 无Mac时作为Alpha就绪阻断并请业主提供设备或调整平台承诺；不得用Windows冒充 |
| A-16 | 形成封闭 Alpha 就绪报告与20–30人验证方案。全部 | A-12/13/14/15/15M → G2/封闭Alpha | 招募、对照、证据、付费问题；不公开发布 | 产品级原有相对指标保持；数据最小化和退出/删除流程明确 | 对外招募、费用、发布另获业主批准；未批准只保留方案 |

## 8. G2/G3 必需门禁任务

| ID | 单一目标 | 依赖 | 完成证据 | 边界 |
|---|---|---|---|---|
| G2-01 | 在首个功能变更前冻结 DoD、PR模板、评审和缺陷证据。R-TEST/R-A11Y/R-SEC | G1-16 → PA-01及全部功能任务 | DoD逐项覆盖测试、文档、迁移、回滚、可访问性、安全与产物；反例任务不能被误判完成 | 只改治理文件，可独立回滚；不因单人开发取消评审清单，无外部审批 |
| G2-02 | 建立私有远程分支保护、必需检查、依赖更新和供应链门禁。R-TEST/R-LICENSE | G1-01R/11/15/16 → PA-01及全部PR | 未通过检查不可合并；管理员绕过留痕；依赖更新跑回归；故意失败验证门禁 | 需要仓库管理员登录/2FA，未授权即阻断功能PR；不公开仓库、不启用付费额度 |
| G2-03 | 建立核心/工具/壳分层门禁，使宪法 11 与技术基线 §2 的平台隔离从人工审计转为机械门禁。R-HOST/R-TEST | G1-09/11、G2-02、PB-09 → PB-10 及其后全部功能任务 | 18 条反例逐条独立复跑（含 3 条防误报反向反例）；说明符与语法形式覆盖计数及"被扫描但导入列表为空文件数"；`semantic-editor`→`editor-diff` 平台耦合关闭并写 ADR；`project-storage` 生产依赖归属纠正且 SBOM 重建通过 | 零新增第三方依赖；不改 Schema、契约版本、lockfile 冻结版本或既有验收口径；不实现 PB-10 的 host 文件边界；分层归属表由业主冻结，实施者不得自行放宽或加豁免（不可行须停止上报）；独占 `tools/quality` 与根 `verify` 入口。任务书见 [audits/layering-gate-implementation-task.md](audits/layering-gate-implementation-task.md) |
| G2-04 | 建立路线图不变量门禁：把依赖关系、`R-*` 标注与完成状态收敛为三类权威手写源，其余记载（§3 关键路径、§9 波次、§10 矩阵、消费者列）改为派生校验。R-TEST | G1-09/11、G2-03 → 全部后续任务的路线图维护 | 29 条反例逐条独立复跑（含 11 条防误报反向反例）；解析计数输出且不低于登记下限；31 处现存违反全部关闭（检查 5/6/7 的 12 处 + `G2-03` 台账条目 + 17 行审计报告链接追加） | 零新增第三方依赖；不改 Schema、契约版本、lockfile 冻结版本或既有验收口径；不修 §10 的 64 处归属不一致；不重排既有台账；不改已签署任务行的实质内容；**解析必须 fail-closed——格式退化导致计数下降即失败，不得静默通过**；独占本文件与根 `verify` 入口。任务书见 [audits/roadmap-invariants-gate-task.md](audits/roadmap-invariants-gate-task.md) |
| G3-01 | 冻结桌面打包、签名、更新、回滚与发布验证方案。R-COMPAT/R-SEC | A-16 → 发布候选 | 生产同构包、升级/回滚、SBOM、隐私说明、冒烟矩阵的本地演练通过 | 证书、账号、真实发布与费用需业主批准；未批准只完成离线可逆演练 |
| G3-02 | 建立最小观测、诊断导出、事故与数据生命周期流程。R-SEC/R-DATA | A-16 → 发布候选 | 默认脱敏、本地诊断、用户主动导出、恢复/删除演练及保留说明 | 不默认上传遥测；任何外传或真实数据删除另审批；诊断功能可独立关闭 |

## 9. 并行实施波次

| 波次 | 可并行组 | 必须先冻结/隔离 | 串行关键点 |
|---|---|---|---|
| W1 | G1-02只读选型、G1-03C、G1-04/05/06契约设计、G1-08测试设计 | 各自文件；公共命名先约定 | G1-01/01R、G1-03根配置、契约最终合并 |
| W2 | G1-10/12/15；G1-13/14（待 G1-10 冻结后）；G1-14W（待 G1-14 完成后） | 下载/SDK/字体/参考环境/证据目录分离；0元 | G1-11 CI消费稳定命令；G1-16审计；G2-01/02 |
| W3 | PA-02与PA-03；PA-07/08/09/10；PA-13与PA-14E/14H；PA-14U（待 PA-13 完成后） | 文档/模板/证据契约先冻结；每运行独立目录 | PA-05、PA-06、PA-11、PA-12、PA-15 |
| W4 | PB-06与PB-07；平台 host 实现；迁移场景分片 | 事务/schema先冻结；每worker独立真库/目录/端口 | PB-03、PB-08、PB-12 |
| W5 | A-02D与A-04T；A-04/05/06；A-07P与A-08；A-07与A-08；A-09/10P；A-10X（待 A-09 完成后）；A-13/14/15；A-15M在独立Mac | UI状态/契约冻结；真库、浏览器、provider、输出和证据目录隔离 | A-03、A-12、A-16 |

W1 为历史组：其单元格以散文限定词表达阶段级并行（“G1-02只读选型”“G1-04/05/06契约设计”“G1-08测试设计”），不可机械判定，且全部任务已完成，已在 G2-04 例外登记表中显式豁免，不追溯改写。此后新增波次须使用可判定格式（任务级“；”分组；阶段级并行须机器可读），否则门禁失败。

并行任务禁止同时修改 `CONSTITUTION.md`、冻结纲领、同一 schema、锁文件、根构建配置或同一数据库文件。共享不可隔离的浏览器/模拟器/账号资源明确串行；不得靠重试掩盖资源争用。

## 10. 双向追踪矩阵

| 要求 | 实现任务 | 验证/闸门任务 |
|---|---|---|
| R-PDF/R-PA-METRIC | PA-00/01/02/03/04/05/06/07/08/09/10/11、A-04/05/08/10P | PA-12/13/14U/15、A-04E、A-12/14 |
| R-TEMPLATE | G1-05、PA-02/04 | G1-08/15/16、PA-12/15 |
| R-ID/R-TX | G1-04、PB-02/03/04/05、A-03/07 | PB-12、A-12 |
| R-RECORDS | G1-07、PB-05A/06/07、A-06/09 | PB-12、A-12/15 |
| R-DATA/R-OUTPUT | G1-07、PB-08/09/10/11、A-02/09/10P/10X/11 | PB-12、A-12/15 |
| R-HOST | G1-06、PB-10、A-02/10P/10X | G2-03、PA-14E/14H、PB-12、A-12/15 |
| R-TEST | G1-08/10/11、各任务测试 | G1-16、G2-03、G2-04、PA-12/13/15、PB-12、A-12 |
| R-SEC/R-LICENSE/R-COST | G1-05/12/13/15、PB-04/06/10、A-15 | G1-16、PA-15、PB-12、A-15/16 |
| R-UX/R-A11Y | A-01/02/02D/03/04/04T/05/06/07P/07/08/09/10P/10X | A-12/13/16 |
| R-PERF | G1-14、PA-13、A-14 | PA-15、A-16 |
| R-COMPAT | G1-02/12/13/14W、PA-14E/14H、PB-01/10、A-02D | G1-16、PA-15、PB-12、A-12/15M/16 |
| R-SCOPE | 全部任务的范围外约束 | PA-15、PB-12、A-16、路线图重审 |

反向规则：任何任务找不到本表中的已批准要求、风险或闸门来源，即为无来源任务，必须删除、移入需求池或取得批准后重审。

本矩阵为**编辑性覆盖摘要**，不是派生索引：“某任务算不算某需求的实现者”（主责 / 贡献性参与）是编辑判断，本表从未定义归属口径。门禁只校验表内任务 ID 的存在性与 `R-*` 的覆盖，不要求本表与任务 `R-*` 标注双向一致；不得把本表当作可机械校验的派生索引逐条对账。

## 11. 路线图变更与停止规则

- 本文件的三类权威手写源为：§4~§8 任务表的**依赖列**（直接依赖）、任务的 **`R-*` 标注**、§3.1 台账的**状态字段与证据链接**。其余四处为派生校验对象，不再视为并列真源：§3 关键路径是阶段主干的**编辑性摘要**（箭头表示“直接或传递前置”，每条边须在依赖列中有传递依赖依据；不生成——哪条链是关键路径是人的编辑判断）；§9 并行波次是**任务级**可并行组（组内不得含任务与其直接依赖）；消费者列是真实传递下游的**子集**（不要求完备，但声明的下游须在依赖链中存在）；§10 矩阵是**编辑性覆盖摘要**（见 §10 末声明）。上述不变量由 G2-04 门禁在 `pnpm verify` 与 CI `static` job 机械校验，例外只存在于检查器的显式登记表。

- 产品范围、成功指标、固定样本或输出承诺变化：先获业主批准，再更新决策与路线图并重审受影响部分。
- 核心架构、schema、编辑内核、数据库、渲染器、字体或关键依赖变化：写 ADR，更新消费者依赖并重审。
- PoC-A/PoC-B 失败：执行对应降级/停止，不提前启动下游任务。
- 任何测试通过依赖 mock 核心渲染、数据库、文件系统或入口：按阻断缺陷处理。
- 外部账号、真机、Mac、签名证书、付费模型或发布动作缺失：保留显式人工前置，不伪造通过，也不阻断与其隔离的本地任务。

## 12. GR 签署条件

只有独立的 `docs/implementation-roadmap-audit.md` 完成覆盖性、可追溯性、原子性、依赖、真实测试、并行、架构、交付和现实性审计，且所有阻断项在本文件中闭环后，才能把本文件状态改为“GR 已通过”。GR 通过只授权按顺序进入 G1，不等于所有任务自动满足 DoR。
