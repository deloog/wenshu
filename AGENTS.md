# AGENTS.md · 文枢 AI 协作操作手册

> 任何 AI 助手处理本项目时先读本文件。最高约束是 [CONSTITUTION.md](CONSTITUTION.md)；产品事实来自冻结版 [立项纲领](AI原生个人知识层立项纲领%20.md)；正式决定只追加到 [决策记录](决策记录.md)。

## 当前阶段

项目处于 **G1 工程底座**。G0 与 GR 已于 2026-07-20 签署通过，原子路线图及专项审计见 `docs/implementation-roadmap.md` 与 `docs/implementation-roadmap-audit.md`。当前只允许按路线图从 `G1-01` 起实施，并在每个任务开始前满足 DoR。外部仓库、账号、费用、设备和发布仍需对应批准；G1 审计通过前不得开始 PoC-A 功能实现。

只有 [G0 审计报告](docs/G0-前置准备审计.md) 明确通过后，才可设计原子化实施路线图；只有路线图及其专项审计通过 GR 后，才可进入 G1。

## 开工必读顺序

1. [CONSTITUTION.md](CONSTITUTION.md)
2. [AI 原生专业成品系统立项纲领](AI原生个人知识层立项纲领%20.md)
3. [文枢前置准备索引](docs/文枢-前置准备索引.md)
4. [决策记录](决策记录.md)
5. 与当前任务相关的专项规范、ADR、DoR 与 DoD

冲突时按以下优先级处理：法律/平台政策与用户明确要求 → 项目宪法 → 冻结纲领和已批准决策 → 专项规范 → 任务说明 → 临时对话。发现冲突时停止冲突部分并按审批矩阵处理，不自行选择最方便的解释。

## 项目一句话与当前首战

文枢把资料和想法变成真正可以交付的专业文件。首战仅验证：将 5,000–30,000 字 AI 草稿和参考材料稳定转化为 10–30 页通用专业分析报告 PDF，并显著减少人工排版。

## 权威文件地图

```text
CONSTITUTION.md                    项目最高不变量
AI原生个人知识层立项纲领 .md       冻结产品与技术纲领
决策记录.md                        已批准产品/经营决策，只追加
docs/文枢-前置准备索引.md           闸门状态与事实源映射
docs/approval-matrix.md            AI 何时必须暂停请示
DEFINITION-OF-READY.md             任务是否允许开始
DEFINITION-OF-DONE.md              任务是否允许标记完成（反例映射不可误判完成）
docs/technical-baseline.md         技术边界与选型基线
docs/testing-strategy.md           测试真实性、分层与并行
docs/adr/                           重大技术决策
docs/requirements-pool.md            需求池（不入冻结范围的新想法归口）
```

## AI 工作规则

1. 先确认当前闸门和任务权限，再采取行动。
2. 先检查目录、项目约束和已有修改；用户已有文件和改动不得覆盖、删除或冒充为 AI 成果。
3. 任务不满足 DoR 时，先补足安全、可逆、范围内的准备，不用幻觉填需求。
4. 需求、产品范围、成功指标和对外承诺不得由 AI 静默改变；新想法进入需求池。
5. 重大技术决定在既定边界内由 AI 按最佳实践作出并写 ADR，不把技术选择题推给非技术业主。
6. 变更保持小而内聚，不夹带无关重构；原子路线图通过后，每项实施任务必须有任务 ID。
7. 逻辑和缺陷按测试先行；Bug 先形成可重复失败证据，再修复。
8. 不得删除测试、降低类型/安全规则、扩大豁免或修改验收标准来让检查通过。
9. 完成声明必须列出实际执行的检查及结果；不能运行的检查必须说明原因、影响和补验时点。
10. 长期有效的约定、踩坑和决定必须回写权威文件，不能只留在聊天中。

## 实施与独立审计（强制）

- 默认分工：Codex 负责原子任务实施和审计问题修复；Claude 负责独立只读审计与复审。
- 同一变更的实施者不得担任最终审计者；实施自检、测试通过和实现者代码复查不能替代独立审计。
- 每项原子实施任务完成自检后标记“已实现，待独立审计”；独立审计 `PASS` 或合规的 `CONDITIONAL PASS` 后才可标记最终完成并启动依赖任务。
- 审计者只能修改指定审计报告，不得修改被审代码、测试、Schema、配置、lockfile、路线图或验收标准。
- BLOCKER/MAJOR 由实施者修复，原审计角色复审；实施者不得自行关闭发现。
- Claude 的短入口是 [CLAUDE.md](CLAUDE.md)，审计任务与报告统一放在 `docs/audits/`。
- `G1-03～G1-06` 与 `G1-07` 均已获 Claude 独立复审 `CONDITIONAL PASS`；首审 BLOCKER/MAJOR 已全部关闭，新增 MINOR 已登记到 `PB-05A`/`G1-09`。各消费者仍须满足自身依赖与 DoR。
- `G1-08` 已获 Claude 独立复审 `CONDITIONAL PASS`，首审 3 项 MAJOR 与 5 项 MINOR 全部关闭；新增 RA-01/RA-02 已登记为 `G1-11` 并行 runner 开工前硬门禁。
- `G1-09` 已获 Claude 最终复核 `CONDITIONAL PASS`：`RA-01～RA-04` 与 `CF-01` 全部关闭，现可作为 G1-11 前置。新增 `CR-01`（质量工具包未声明直接使用的 ESLint）已登记到 G1-15，最迟 G1-16 前由独立审计签署。
- `G1-11` 已完成：Claude 已关闭 RA-01/RA-02、IA-01 与 CI-01～CI-05；本地完整验证及首次、最终私有远程矩阵均 8/8 成功。`cancel-in-progress` 因两次运行未重叠而保留为证据限制。
- `G1-10` 已完成：Claude 最终复核 `PASS`，FX-01～FX-03 全部关闭；7 个 PoC-A 原件、manifest 锚点、隔离复制与证据门禁可作为后续前置。新增 `FX-06` 已登记到 PA-00，最迟 PA-01 消费冻结 fixture 前由独立审计签署。
- `G1-13` 已完成：Claude 独立审计 `CONDITIONAL PASS`（无 BLOCKER/MAJOR，六条否决线均不成立），两项 MINOR（FT-01 集合相等守卫、FT-02 字重唯一性守卫的测试决定性缺口）经 Codex 补决定性测试修复后由 Claude 独立重跑变异测试复核 `PASS` 关闭；FT-03/FT-04 为 NOTE 无需整改。字体身份、OFL-1.1 许可证、884 码点覆盖与篡改门禁可作为后续前置；已知限制：FT-01“多余文件”在大小写敏感 Linux CI 上的表现未实测，留作补充证据点。
- `G1-14` 已完成：Claude 独立审计 `CONDITIONAL PASS`（机器证据独立对账一致、无硬编码、预算诚实），三项 MINOR（EN-01～EN-03）经 Codex 修复后由 Claude 复审 `PASS` 全部关闭，无未关闭发现；可作为 PA-13/A-14 基线。
- `G1-14W` 已完成：Claude 审计 `CONDITIONAL PASS` 后复审 W14W-01 `PASS` 关闭（离线 VHDX 取证证真、全链转录 7/7、宿主已审计文件零改动）；Win11 参考环境身份真实登记，NOTE 均为 PA-05 书面跟进项。G1 全部 16 项前置中仅剩 G1-16 签署本身。
- `G1-16` 已签署（2026-07-21）：**G1 工程底座由 Claude 独立审计签署通过**，SG-01 处置核验到位、干净树可复现、11 份审计报告终局全 PASS、零功能实现。**PA 系列可按各自 DoR 启动**；承接项：NF-03/FX-06→PA-00、PB-05A、G1-12 审计推迟（决策 #6）、Win11 VM 评估期/Chromium 为 PA-05 前置。竞品调研调整批（决策 #5）为独立审计事项，不由 G1 签署放行。竞品调整批已完成：CA-01 经归档修复后 Claude 复审 `PASS`，决策 #5 忠实性背书成立，NOTE 两条非阻断。
- `G2-01` 已完成：Claude 审计 `PASS`（七维度逐项可判定、反例抽验与自构蒙混路径全被拦截）；DoD/PR 模板/评审清单/缺陷证据标准生效，功能任务必须走 PR。
- `G2-02` 已签署（2026-07-23）：G2-M1 复审 `PASS`（双向绑定、降级/删除/改分类均被拦），G2 双门禁齐备；G2-N2（direct 过滤合成用例）已随维护补测。三个 dependabot PR 按冻结工具链处置。**PA-00 可按自身 DoR 启动**。
- `G1-15` 已完成：Claude 首审 `FAIL`（SM-01 MAJOR）整改后复审 `PASS`，SM-01/SM-02 关闭、CR-01 已签署关闭；SBOM 以冻结 lockfile 为真源（147 包、跨平台字节一致、33 条覆盖经 npm 核验）；许可政策门禁与 MPL/Python/BlueOak/0BSD 书面结论见 [supply-chain](docs/supply-chain.md)；SM-03（MPL 措辞泛化）已随文档维护修复；首个 ubuntu 远程 CI 矩阵（run `29802405342`，覆盖 `1a717b6`）8/8 成功，SM-01 跨平台确证完成。

## 文件与代码规则（进入 G1 后生效）

- 所有手写 TypeScript 生产代码和测试代码禁止显式或隐式 `any`；不可信输入从 `unknown` 开始，经 schema、类型守卫或断言函数收窄。
- 第三方声明和自动生成文件中无法控制的 `any` 不得穿透适配边界进入项目公共类型；禁止用 `as any`、`@ts-ignore` 或降低 strict 规则规避类型设计。
- 手写生产代码达到 300 行预警、超过 400 行 CI 失败。
- 手写测试代码达到 300 行预警、超过 500 行 CI 失败。
- 按领域、功能、职责、数据/副作用边界或测试行为拆分；禁止机械切片和 `utils/types/helpers` 大杂烩。
- Web 核心不得直连平台 API；跨端能力只经 host 能力注册表。
- 代码、类型、API、模板、文件格式和数据库结构以版本化契约为先。
- 生成物、lockfile 和迁移历史不得手工编辑。

## 测试底线（进入 G1 后生效）

- 单元测试可 mock 边界；集成测试不得 mock 被集成的核心依赖。
- 数据库集成测试使用真实生产同类引擎、真实迁移和隔离测试库/schema。
- E2E 穿过真实用户入口、可部署构建、服务端和真实数据存储。
- 并行测试必须隔离数据库、schema、目录、端口、账号和外部额度；不能隔离就串行。
- flaky 不能靠重试变绿；失败保留日志、截图、trace 和随机 seed。

## 绝不触碰

- 不改写冻结纲领来容纳新想法。
- 不提交或展示密钥、真实用户资料、生产数据和未脱敏日志。
- 不在第一阶段模板中执行任意 JavaScript。
- 不引入 GPL/AGPL 依赖或来源不明的字体、图片、模型、数据集。
- 不绕过 G0、GR、CI、审批和发布闸门。
- 不替业主执行付费、发布、数据删除/导出或其他需明确批准的动作。

## 命令

Windows 会话先按 [开发环境基线](docs/development-environment.md) 将 D 盘 Node/pnpm 与缓存路径置入环境；不得直接使用本机旧全局 pnpm。当前唯一权威命令为：

- `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store`：冻结安装。
- `pnpm dev`：启动最小 Web 开发入口。
- `pnpm config:check`：运行 dev/test/staging/production 配置契约、快速失败和脱敏测试。
- `pnpm contracts:check`：检查文档/模板/Host schema 与生成类型漂移，并运行共享输入安全运行时及合法、非法、安全和生命周期 fixture 契约测试。
- `pnpm fixtures:check`：校验 PoC-A 冻结清单、7 个原件字节及隔离复制/证据契约；原件不一致立即失败。
- `pnpm fonts:check`：校验 PoC-A 固定中文字体的官方清单锚点、OFL 许可证、三个 OTF 字节身份，并运行真实文件系统篡改/链接反测。
- `pnpm environment:check`：校验已提交参考机器证据符合契约且冻结输入锚点与当前 fixture/字体锚点一致。
- `pnpm supply:check`：重建 SBOM 并与已提交清单字节比对、执行许可政策门禁、校验声明依赖与已安装版本一致。
- `pnpm sbom:build`：重建 `sbom/sbom.json`（确定性输出；仅在依赖树变更后运行并提交）。
- `pnpm env:record`：在 Windows 参考机器上采集机器证据；默认写 `environment.json`（Win10 基线），`pnpm env:record --label <label> --out <file>` 登记其他环境（如 `environment.win11.json`），非 Windows 平台 fail-closed。不得在 Win10 上使用 Win11 标签伪造证据。
- `pnpm test:layers`：审计所有测试文件是否显式标注 unit/contract/render/integration/e2e 层级。
- `pnpm test:unit` / `test:contract`：运行已登记的单元/契约测试。
- `pnpm test:render` / `test:integration` / `test:e2e`：运行对应已登记测试；没有真实用例时报告 `not-registered` 并以非零退出，不代表通过。
- `pnpm test:foundation`：运行测试层级审计与并行隔离设施单元反测。
- `pnpm format:check` / `pnpm lint` / `pnpm quality:check`：分别检查格式、静态规则和 any/抑制指令/文件体量/typecheck 覆盖。
- `pnpm ci:job <name>` / `pnpm ci:verify`：运行单个同构 CI 作业或最多 4 路并行的 8 作业本地矩阵；不替代串行完整 `verify`。
- `pnpm secrets:check` / `pnpm licenses:check`：扫描已跟踪/暂存秘密与实际安装依赖的许可证快速阻断项。
- `pnpm generated:check`：动态执行全部工作区包已登记的生成漂移检查。
- `pnpm typecheck`：严格类型检查。
- `pnpm verify`：唯一完整入口；串联全部质量、测试、生成、类型和构建门禁。
- `pnpm build`：生产构建。
- `pnpm --filter @wenshu/web build:test`：test 配置构建。
- `pnpm --filter @wenshu/web build:staging`：staging 配置构建。
- `pnpm verify`：当前 G1 统一验证入口（配置契约 + 文档契约/漂移 + strict typecheck + production build）。

配置规则见 [环境配置基线](docs/configuration.md)。真实 `.env`/`.env.*` 不得提交；任何新 `WENSHU_*` 字段必须先更新 schema、解析器与契约测试，错误日志只能记录字段名，不得记录原始值。

文档对象规则见 [v0 文档对象契约](docs/document-model.md)。`packages/document-model/schema/document.schema.json` 是类型真源；修改 schema 后必须重新生成并运行漂移检查，禁止直接编辑 `src/generated`。

模板规则见 [v0 模板 DSL 契约与安全边界](docs/template-dsl.md)。模板只有声明式白名单数据能力；不得加入函数、脚本、文件路径、网络、系统或自声明 capability，v0 迁移规则必须为空。

平台能力规则见 [v0 Host 能力与生命周期契约](docs/host-contract.md)。Web 核心不得 import 或直调 Electron、Node 文件 API、ArkTS 等平台接口；文件位置只经 Host 的 grant/handle 表达，禁止任意绝对路径穿透。

项目与知识包规则见 [v0 项目、知识包、语义审计与兼容契约](docs/project-contract.md)。真源 entry 必需且不可重建；派生 entry 非必需且必须可重建。语义审计不得承载正文、prompt、密钥、编辑器事务或 CRDT update；数据库表结构不得成为开放交换格式。

后续渲染、PDF 和打包命令将在对应原子任务建立后追加；不得从聊天记录猜命令或用临时命令冒充权威入口。
