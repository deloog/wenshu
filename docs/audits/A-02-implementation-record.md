# A-02 实施记录 · 新建/打开项目与只读导入流程（含 `file.import.select` 契约冻结）

> 任务：`A-02`（R-UX/R-DATA）　实施：Codex 分工　日期：2026-08-03
> 任务书：[A-02-implementation-task](A-02-implementation-task.md)　设计：[ADR-0029](../adr/0029-A-02导入入口file.import.select冻结与覆盖落盘裁定.md)　业主裁定：[决策 #15](../../决策记录.md)
> 状态：**已实现，待独立审计**（PR 挂起不合入）。

## 1. 前置裁定（业主书面）

- **D1 → 选项①**：不接受"导入源限已授权目录"的产品收窄，本棒冻结 `file.import.select` payload schema；A-02 按「契约任务 + UI 任务」执行（决策 #15）。任务书审计的选项②裁定按其自失效条款作废。
- 三条子裁定：①-a 输出不得含任何系统路径（值级预检不得放宽）；①-b 版本形态须书面选定 + 既有 0.2.0 注册表仍校验通过的决定性测试；①-c 选择器只在 L3 壳、不得旁路协议。
- 两条补充设计点（任务书审计追补二）：R-1 契约层不新增读原语（红线）；R-2 handle 一次性/会话级；R-3 handle 单文件作用域。
- **D2**：目标目录必须事先不存在；拒绝 + 引导另选/另建；merge-into-existing 契约级排除。
- **D3**：原件副本落 `materials/`、`assets/` 子目录（Host 写结构性不可达）+ `protectImportedFile` 平文件名登记（登记名与真实落点一致）；不引入可寻址子路径写能力。

## 2. 工作分解与提交（main 本地，推送前）

| 提交 | 内容 |
|---|---|
| `1fb69ad` | 任务书 + 任务书审计报告入库（MINOR-1 已修：矩阵改引"现行 14 行"） |
| `a5e7c55` | ADR-0029 + 决策 #15 互引 |
| `deaf1a7` | host-contract：additive 协议 **0.3.0** 冻结 `file.import.select` |
| `1cfb59a` | project-storage：FileGrant（单文件、一次性、会话级）+ handler |
| `5be7b01` | markdown-import：from-text 入口 + `importMarkdownProject` 执行器 |
| `38a2412` | ux-state：`./data` 纯数据子路径 + 导入流程控制器（additive） |
| `5d4822b` | apps/web：流程 UI + 浏览器 Host 诚实降级 + tsconfig 处置 |
| `511e6a4` | electron-shell：`wenshu.project.*` 编排通道（main/e2e 共享） |
| `214553a` | style：A-02 已入库 15 文件 prettier 重排（repo-wide format:check 卫生，零逻辑） |
| `36cd161` | electron-shell：A-02 真实文件 E2E 场景 + 测试（见 §4.5） |

## 3. 关键设计决定（详见 ADR-0029）

- **①-b 形态 = 0.3.0 additive 次版本**：PB-10 自身先例即新文件 + 新协议号；0.2.0/0.1.0 schema 字节稳定，既有冻结守卫（7 项精确清单、reused defs byte-identical）原样有效。reader 三路分发，未来版本 fail-closed；`future-version` fixture 已推进到 `0.4.0`。
- **handle = FileGrant**：钉定单一绝对路径 + 选择时刻 sha256/size 快照；`consumeFile` 原子取出即注销（一次性）；进程死亡即失效（内存表）。读取重算 sha256，漂移 → `INTEGRITY_FAILURE`。
- **执行器在 markdown-import（L2）**：新增对 project-storage 的 workspace 依赖（L2→L2 有 knowledge-package 先例）；事务骨架照 PB-11（CONFLICT→mkdtemp 兄弟目录→写入→rename→失败 rm）；`IMPORT_TEMP_MARKER` 单源，孤儿由 `recoverGrantDirectory` 既有双前缀回收。
- **资源匹配按 basename**：多选每个文件一张 FileGrant；引用在已选集中 0 个→`asset_not_provided`、≥2 个→`asset_ambiguous`；**不读任何未选文件**（R-3）。失败 figure 不进文档，逐项入 `failedAssets`（reconciliation 经 `excludedFigures` 如实扣回仍闭合）。
- **编排通道非协议**：`wenshu.project.*` 只携带 grant_id/平目录名/显示元数据，无路径；协议管平台能力（选择器/授权），编排是应用逻辑（PB-11/PB-12 先例）。
- **浏览器 Host 诚实降级**：`file.import.select` 登记 `unsupported`（`BROWSER_HOST_NO_IMPORT_PIPELINE`，manual_file_picker fallback）；7 项既有 supported 登记不改（A-01 已消费"文档明示"路径，本棒评估维持——见 §5 #3）。
- **生产 bundle 零 Ajv**：流程区 dev-only 动态挂载（`import.meta.env.DEV`），生产构建整支剪除；瘦身后 Ajv 唯一来源是浏览器 Host 经 host-contract 进链，dev 联调身份与之相容；生产渲染诚实指引文本。此取舍已登记待审计裁定（见 §6）。

## 4. 验证记录（本机 wenshu-dev-primary Win10，Node v24.13.0）

> 说明：pnpm 报 `Unsupported engine: wanted node 24.17.0` 为 PB-10 C4 登记的既有环境问题，未动。

### 4.1 契约层（提交 `deaf1a7`/`1cfb59a`）

- `@wenshu/host-contract`：**71/71 pass**（含 4 条新增 v0-3-0 invalid fixture 全以稳定 issue code 拒绝；v0-3-0 冻结集精确清单、schema id 精确字符串、信封复用叶子与 0.1.0/0.2.0 byte-identical）。
- **决定性测试（业主要求）**：既有 0.2.0 注册表（`file.import.select` 为 `/0.1.0` 占位，经 `payloadRegistryVersion: "0.2.0"` 构造）在新代码下 `validateHostContract` 仍 ok；0.2.0 请求/终态全链路不变。
- `@wenshu/project-storage`：**42 测试 41 pass / 1 skipped / 0 fail**（skip = 本机特权 token 绕过 ACL deny 时诚实跳过，POSIX 路径保持决定性，与 PB-10 既有 Windows 口径一致）。R-2 反例（消费一次后再用 → NOT_FOUND）、R-3 反例（同目录他文件结构性不可读 + 选择后改源 → INTEGRITY_FAILURE）均决定性。

### 4.2 执行器（提交 `5be7b01`）

- `@wenshu/markdown-import`：**unit 22/22、contract 5/5、integration 22/22，fail 0**。覆盖：partial 逐项收集、逃逸归类、全资源失败 blocks 空 → `IMPORT_RECONCILE_FAILED`（诚实整体失败）、路径↔文本入口 document+renames deepEqual、CONFLICT/PERMISSION_DENIED/NOT_FOUND/INVALID、三阶段取消 temp 零残留、选择后改源 → INTEGRITY_FAILURE、歧义 → asset_ambiguous、`protectImportedFile` 登记可命中、进度四阶段单调、**每个异常路径前后源文件 sha256 断言不变**。

### 4.3 ux-state / apps/web（提交 `38a2412`/`5d4822b`）

- `@wenshu/ux-state`：**40/40 pass**（parity 守卫：`UX_STATES_DATA` deepEqual 经 Ajv 校验的 `UX_STATES`；12×12+未知 id 转移矩阵全等；1.0.0 字节纪律断言）。
- `@wenshu/web`：**30/30 pass**；`typecheck` 干净；**bundle 145,462 B → 12,351 B（gzip 5.09 kB），`grep -i ajv` 零命中**（A-01 #1 关闭证据）。
- 控制器四态 `requiredPresentation/forbiddenSemantics/a11y` 与 states-1.0.0.json 逐字对账（测试断言）；非法转移抛 `ImportFlowTransitionError`；未发明第 13 态（成功/取消/整体失败如实落非状态机 `project-view`，源码注释写明）。
- tsconfig：全局 `types:["node"]` 已删，逐文件 reference 仅 `vite.config.ts`+`test/**`（A-01 #2 处置）；`typecheck` 逐字脚本与 typecheck-coverage 全覆盖双锁均绿。

### 4.4 壳与回潮（提交 `511e6a4`）

- `security:test`（真实产品壳 + 探针）**PASS**：renderer `require/process` undefined、contextIsolation/sandbox/nodeIntegration 断言全过、preload 暴露面零回潮。
- **`pnpm test:e2e` PB-12 七链环 8/8 全绿**（161s，kill seed=12648430）——协议 0.3.0 落地后 0.2.0 请求全链路零回潮（双版本 in vivo）。
- `quality:check` / `lint` 全绿。

### 4.5 A-02 真实文件 E2E（提交 `36cd161`，本机实测）

`node --test apps/electron-shell/test/a-02-project-import.e2e.test.ts`：**6 例 = 5 pass + 1 诚实 skip（124s）**。每例子场景 spawn 真实 Electron（e2e-main + 场景 bundle）对真实 fixture 文件跑真实协议与编排通道，编排器只做写 fixture / 起杀进程 / 对账磁盘实物；**每例运行前后全部源文件 sha256 快照逐字节比对**（停止条件级不变量）。

| 子场景 | 实测结果 |
|---|---|
| happy+open | select→new→import→open 全链 PASS；`document.json`/`materials/`/`assets/` 磁盘实物与源字节逐一对账（documentSha256===磁盘文件摘要；materials/资源=内容寻址名且字节===未动源文件）；重开项目 document_sha256 与导入一致、标题逐字；空项目 `report-a` 保持空（D2 不合并）；零 temp 残留；轨迹 `empty-project→importing→project-view:import-succeeded→project-view:project-opened` |
| partial | 引用但**未选**的 img2.png 逐项降级 `asset_not_provided`（retryable）；R-3 实测：同目录未选文件从未被读取、从未落盘；`import-partial` 态逐项枚举失败，forbiddenSemantics「不整体吞掉结果」逐字随行 |
| cancel | 首个真实进度事件即发 cancel（32 MiB bulk 资源撑窗口）；**attempt 1 即真取消**（progress events=2），cancelled 为诚实终态（不带 digest/错误码），无半写 target、零 temp 残留；窗口丢失语义=仅重试一次且 scenario 失败绝不重试 |
| permission-denied | **本机诚实 skip**（特权 token 绕过 ACL deny，探针实测后跳过不伪装拒绝）；ubuntu CI 以 chmod 0o555 真实行使。断言面：真实 PERMISSION_DENIED、错误载荷恰为 `{status,code,import_id}` 三键（无任何路径回显）、importAttempts===1（noRetryLoop）、permission-denied 态「不循环弹窗」逐字 |
| target-exists（D2） | 第二次 project.new → `{status:"exists"}` 单键（不带改名）；import 入已存在目录 → CONFLICT；原目录保持空、零残留 |
| handle-reuse（R-2 E2E 反例） | 同一 source handle 第二次 import → fail-closed `NOT_FOUND`；第一次导入产物完整、第二次零残留 |

- **①-a 红线在 E2E 层钉死**：`file.import.select` 每条 file 条目键集断言**恰为** `grant_id/file_name/content_sha256/size_bytes`，file_name 禁分隔符/冒号（project-import-shared.ts:145-185）。
- **状态视图逐字对账**：每个发出的流程视图与冻结 ux-state 1.0.0 数据 `requiredPresentation/forbiddenSemantics/a11y/label/cancelable` 逐项 JSON 相等断言；进度事件经真实通道进控制器，dispatch 错误记录不吞咽并断言为空。
- **PB-12 零回潮**：本提交后全套 `pnpm test:e2e` **14 例 = 13 pass + 1 skip**（PB-12 七链环+提案拒写 8 例全绿，kill seed=12648430）；`security:test` PASS（sandbox/contextIsolation/白名单零回潮）；`format:check`/`lint`/`typecheck`/`quality:check` 全绿（quality 无新增 WARN——场景按 400 行闸拆分四模块）。
- e2e-main 增项：脚本化目录选择队列 `E2E_SELECT_DIRECTORY`（逐次消费、末项重复）+ `project-import` 场景模式；编排器 summary 增可选 `sub`/`projectImport` 字段（additive，PB-12 解析零影响）。

web 侧子记录见 [A-02-web-implementation-record](A-02-web-implementation-record.md)（ux-state data/import-flow/web flow UI 的变更清单、裁定与验证表，与本记录 §4.3 同源）。

## 5. 承接项处置（任务书 §6 三类口径）

**由 A-02 关闭（4 项）：**

| 项 | 处置 |
|---|---|
| PB-11-followups #4（原件保护平文件名模型边界） | **关闭**。D3 裁定布局 (b)：副本落子目录（结构性不可达）+ 平名登记覆盖唯一可寻址同名列，登记名与真实落点一致；未引入可寻址子路径写能力，重估触发条件不成立（ADR-0029 §3）。 |
| PB-11-followups #6（覆盖/合并策略） | **关闭**。D2 裁定：目标存在即拒绝（`{status:"exists"}`/CONFLICT）+ 引导另选/另建；merge 契约级排除（ADR-0029 §2）；UI 冲突如实呈现不静默换名。 |
| A-01-followups #1（Ajv 145 kB） | **关闭**。ux-state `./data` 纯数据子路径 + apps/web 全量改道；bundle 145,462 B → 12,351 B、ajv 零命中（§4.3）；parity 守卫防漂移。 |
| A-01-followups #3（浏览器 Host 是否改 degraded） | **关闭**。评估结论：维持 A-01 已消费的"文档明示"路径（浏览器 Host 非持久、仅开发联调），7 项 supported 登记不改；`file.import.select` 如实登记 `unsupported` + `BROWSER_HOST_NO_IMPORT_PIPELINE` fallback（§4.3），UI 呈现诚实降级不循环弹窗。 |

**遵守但不构成关闭（3 项）：**

| 项 | 处置说明 |
|---|---|
| A-01-followups #2（types:["node"]） | 本棒扩大 apps/web 代码面，**已处置**：删全局 types，逐文件 reference（§4.3）；双锁验证绿。条目归口为"A-02/后续"，是否关闭留待独立审计裁定。 |
| A-01-followups #4（additive 纪律） | 遵守：states-1.0.0.json 与 index.ts 导出语义零改动（parity 测试钉定）；`./data`、`./import-flow` 均为 additive 子路径。 |
| PB-10-followups #1（protectImportedFile 调用责任） | 行为要求已真实履行：执行器对每个落盘原件副本登记（登记名=真实落点名），变异③（删调用）测试红（§4.4 变异表）。条目已由 PB-12 关闭，不再关一次。 |

**明确不归 A-02（未触碰）**：PB-12 N2/N3 → A-12；PB-11 #1/#2/#7 → A-15；PB-10 #4 ArkWeb → 设备矩阵。

## 6. 已知边界（如实声明）

1. **流程区 dev-only 动态挂载**：生产构建剪除 dev 分支意味着打包器不覆盖该分支；typecheck 与 30 例单测覆盖其逻辑，dev 端真实浏览器运行未实测（证据限制，补验时点：A-12 贯通或本棒审计要求时）。
2. **cancel 竞态**：执行器按阶段查 signal；极小文件可能在 cancel 到达前完成——E2E 用 32 MiB bulk 资源撑窗口，本机 attempt 1 即真取消（§4.5）；窗口丢失只重试一次，双失则测试红（不伪装）。
3. **权限拒绝在 win32 本机**：特权 token 可绕过 ACL deny，测试以诚实 skip 结案；决定性在 POSIX/ubuntu CI（与 PB-10 口径一致）。
4. **符号链接/realpath**：FileGrant 钉定路径沿用字符串语义，穿透评估归 A-15（PB-11 #7 同类，ADR-0029 §5 已登记）。
5. **盘符引用**（`C:/x.png`）在 parse 期即被 IMPORT_REMOTE_REF 整单拒（既有 parser 行为），from-text 逃逸校验的盘符分支不可达。
6. **pdf-export 两条 browser cancel 测试**在全套件并行时偶发超时红（单独复跑 4/4 全绿），依赖锥不含本棒任何改动，判存量环境 flake，记录监控。
7. **import-flow.ts 305 行**触发 file-size 300 行 WARN（非阻断）。

## 7. 变异自证汇总（全部红后改回，diff 确认源一致）

| # | 变异 | 目标测试 | 结果 |
|---|---|---|---|
| ① | `assertWithinTemp` 恒通过 | project-import.unit | 红（escape 用例不再抛） |
| ② | 删「目标已存在→CONFLICT」 | project-import-failures.integration | 红 |
| ③ | 删 `protectImportedFile` 调用 | project-import.integration | 红 |
| ④ | 取消路径不清理 temp | cancellation 两例 | 红 ×2 |
| ⑤ | consistency 0.3.0 分支放宽（允许 /0.2.0 id） | host-v0-3.contract | 红 |
| ⑥ | `consumeFile` 不注销 | file-import-select.integration（R-2） | 红 |

（E2E 层反例已落 §4.5：handle-reuse NOT_FOUND、target-exists CONFLICT、①-a 键集精确断言均为真实 Electron 端决定性断言，非变异注入。）

## 8. 首审 MAJOR-1 处置（待 Claude 复审关闭）

**发现**（[A-02-claude-audit-report](A-02-claude-audit-report.md) MAJOR-1）：审计探针
`buildPayloadHostRegistry({ protocolVersion: "0.2.0" })` 得到
`file.import.select: supported/0.3.0`（与 0.3.0 注册表完全相同），判「0.2.0 注册表
把该能力登记为 supported/0.3.0，违背 §5 同版本语义不变」。

**实施者独立复现结论：所报缺陷的表象成立、归因不成立**——`protocolVersion` 不是
builder 的选项（PB-10 签署版起就不存在该键，0.2.0 旧建路径的合法 opt-out 键是
`payloadRegistryVersion`）。传入不存在的键被**静默忽略**，落到默认 0.3.0 构建，
于是观察到「与 0.3.0 注册表完全相同」。真实 0.2.0 路径复现（同机同时）：

```text
payloadRegistryVersion: "0.2.0" → protocol_version 0.2.0,
  file.import.select = 0.1.0 / unsupported / PB10_PAYLOAD_UNFROZEN  （恰为 PB-10 签署占位形态）
protocolVersion: "0.2.0"（不存在的键）→ protocol_version 0.3.0,
  file.import.select = 0.3.0 / supported                              （= 审计探针观察）
```

①-b 决定性测试自 `deaf1a7` 起即按原文构造且绿（host-v0-3.contract.test.ts「decisive
dual-version: a frozen 0.2.0 registry still validates unchanged」：经
`payloadRegistryVersion: "0.2.0"` 构造，断言 0.1.0/unsupported/PB10_PAYLOAD_UNFROZEN）。
「builder 不产出该形态」不成立。但**静默忽略未知选项键**这一健壮性缺口真实存在——
它正是误探得以发生的原因，且对 JS 侧消费者（无 TS excess property check）是真实
fail-open 人机工程风险。按选项一的精神做结构化根治而非措辞澄清：

**修复**（本棒 additive，零行为变化于合法调用）：

1. `buildPayloadHostRegistry` 未知选项键 **fail-closed 抛错**（`Unknown payload
   registry option: <key>`）——审计探针形态现在直接抛错，不再静默给出最新版注册表。
2. 决定性测试升级为**字节级形态钉定**：builder 0.2.0 产出的 file.import.select 声明
   与 PB-10 签署冻结 fixture（`fixtures/valid/v0-2-0-registry.json`）对应条目
   `deepEqual`；另断言 0.2.0 构建全文不含任何 `/0.3.0` schema id。
3. 新增 fail-closed 测试：`protocolVersion`/`payloadregistryVersion`/`version` 三种
   误写键全抛错。

**验证**：host-contract **72/72 pass**（71+1 新增）；typecheck 干净；下游
project-storage 41/41、web 30/30 零回潮；`pnpm verify` 全绿。

**变异自证**（均红后回退，diff 确认源一致）：

| # | 变异 | 结果 |
|---|---|---|
| ⑦ | 删 0.3.0 分支的版本守卫（0.2.0 构建发 supported/0.3.0） | 红 ×2（强化后决定性测试 + 既有 builder 自洽测试） |
| ⑧ | 删未知键拒绝 | 红（新 fail-closed 测试） |

§5 措辞未动（契约语义未变——0.2.0 冻结语义自始至终保持）；「0.2.0 可含 0.3.0 能力」
的书面裁定路径未启用。

**复审进展（2026-08-04）**：Claude 复审**撤销 MAJOR-1**（审计报告 §6：归因错误在
审计者——`protocolVersion` 在 PB-10 签署版与当前分支都从不存在；实测三误写键现
全部 THREW，误探形态不可能再发生；「①-b 决定性测试无从构造」一并撤回）。复审
新增 **MINOR-1**：合法键 + 非法值（`payloadRegistryVersion: "0.1.0"`）不抛错、
静默落到 0.3.0——键轴已收口、值轴不对称。已修复（本棒 additive）：值轴 fail-closed
（非 `"0.2.0"` 的已定义值一律 `Unknown payload registry version` 抛错）+ 决定性
测试（`"0.1.0"`/`"0.3.0"`/`"2.0.0"`/`""` 四例全抛，含 `as` 断言绕过形态）；
**变异⑨**（删值轴守卫）新测试红、回退后 73/73 绿。

**仍待 Claude 复审补齐**（首审 §4 六项，未经独立复核不应合并放行）：原件哈希不变
三条异常路径字节级比对（**A-02 唯一停止条件级要求**）、A-01 契约消费方式、
followups #2 表态、承接项归属、决策 #15↔ADR-0029 互引、CI 侧 permission-denied
实证（现成证据：run `30918444973` e2e 日志 `permission-denied reconciled
(linux: chmod 0o555)`；MINOR-1 修复轮新 run 出来后以新 run 为准）。
