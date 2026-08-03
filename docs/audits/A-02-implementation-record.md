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
| （待补） | E2E 场景与测试 |

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

### 4.5 A-02 真实文件 E2E（待补：E2E 场景落地后填写）

（取消 / 部分失败 / 权限拒绝 / 原件哈希不变逐路径断言、target-exists、handle-reuse 反例——见后续提交。）

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
2. **cancel 竞态**：执行器按阶段查 signal；极小文件可能在 cancel 到达前完成——E2E 用 bulk 资源撑窗口（见 §4.5）。
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

（E2E 变异与 handle-reuse 反例待 §4.5 补充。）
