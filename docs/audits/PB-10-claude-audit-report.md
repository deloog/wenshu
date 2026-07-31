# PB-10 Claude 独立审计报告（首审）

> 审计对象：`PB-10` 原子保存、崩溃恢复与 host 文件边界（R-HOST/R-DATA），PR #46，分支 `pb-10` 头 `e8e3433`。
> 审计基线：`origin/main` `510ccdc` → `origin/pb-10` `e8e3433`（`git diff origin/main..origin/pb-10`，16 + 24 个文件）。
> 审计方法：**隔离干净克隆**（`D:\tmp\pb10-audit`，`pnpm install --frozen-lockfile`）+ 全套件独立复跑 + **自建对抗探针**（Windows 保留设备名／尾点名／长度边界／大小写碰撞／导入原件覆盖／失败写残留／路径回显）+ **失效方向变异**（白名单全放行、rename→直写）+ 调用签名缺陷的独立复现。审计只新增本报告一个文件，未改任何生产代码、测试、Schema、配置、lockfile 或路线图。
> 审计环境：Win10 `wenshu-dev-primary`，D 盘冻结 Node v24.17.0 / pnpm 11.15.1（按[开发环境基线](../development-environment.md)初始化会话）。

## 1. 结论

**FAIL —— PB-10 首审不通过，不得标记完成，不得放行 PB-11/A-02。** 五项 MAJOR 未关闭（其中 MAJOR-5 为越界发现，归属 `G2-04` 门禁）；无 BLOCKER（文件边界本身的路径逃逸与半写两条红线**守住了**）。

摘要：**真实文件边界（`@wenshu/project-storage`）这一棒做得扎实**——27+ 项敌意值在真实 host 入口被拒且不回显路径、四相位真 `SIGKILL` 强杀后工件非旧即新、失败保存字节不变零残留、值级守卫的失效方向变异被决定性测试抓红。**但两个"host"消费侧都不成立**：浏览器受控 Host 的备份恢复**用全零字节伪造内容并回报 `restored: true`**（MAJOR-1）；Electron 壳的接线存在两处调用签名错误，使 PA-14E 已签署的 `print.pdf.export` **必然抛错**，且该文件不在任何 typecheck/CI/verify 覆盖内、仓内根本没装 electron 二进制——**没有任何证据表明这段代码被执行过**（MAJOR-2）。另有验收口径「不覆盖导入原件」未被结构性满足（MAJOR-3，实测可覆盖）、参考机器证据被**错误运行时**覆盖并提交（MAJOR-4）。审计过程中另**顺带发现 `G2-04` 路线图不变量门禁根本不会让构建失败**——它把违规打印成 `ERROR` 却漏接了退出码，`pnpm quality:check` 实测仍 exit 0（MAJOR-5，非 PB-10 引入，但直接影响本任务据以补台账的那条承接规则）。

## 2. 我独立坐实的部分（这些是真的）

| 项 | 我的独立结果 |
|---|---|
| 干净克隆可复现 | 隔离克隆 `pnpm install --frozen-lockfile` 成功；`pnpm verify` **exit 0** |
| 三套件 | host-contract **48/48**、project-storage **24/24**、web **6/6**（我复跑，全绿） |
| `0.1.0` 契约零漂移 | `packages/host-contract/schema/host.schema.json` 与 `src/generated/host.ts` **零改动**；唯一相关改动是把未来版本反例 `fixtures/invalid/future-version.json` 由 `0.2.0` 顺移到 `0.3.0`（`0.2.0` 变合法的必然后果，不是放宽） |
| 敌意矩阵（红线） | 28 项在**真实 host 入口**全部 `HOST_INVALID_REQUEST`；响应不回显敌意值；被拒信封不进 transcript。我另加探针：响应与 transcript **不含系统路径** |
| 半写文件（红线） | `test/crash-recovery.integration.test.ts` 是**真子进程 + 真 `SIGKILL`**（断言 `child.signalCode === "SIGKILL"` 且未 `DONE`），64 MiB 载荷使 `data-written-partial` 为**真部分写**；四相位后工件恒为"旧完整"或"新完整" |
| 失败写不损坏上次成品 | 我自建探针：声明哈希不符 → `HOST_INTEGRITY_FAILURE`，`keep.md` **字节不变**，残留 **0** |
| 值级守卫决定性 | 我把 `SAFE_FILE_NAME` 变异为**全放行**（失效方向，比实施者做的"恒 false"更危险的方向）→ `resolveGrantFile structurally refuses escapes` **变红**；把 `rename` 变异为直写 → 2 条测试**变红** |
| 恢复预算 | 我在干净克隆独立复测：median 37.1 ms、**p95 38.9 ms**，预算 10 000 ms（实施者报 41.1/54.0 ms，同量级，可信） |
| 供应链 | **零新增第三方依赖**；`sbom/` **零改动**；`pnpm-lock.yaml` 净增仅 3 条 workspace link |
| web 层纯净 | `apps/web/src` **零** `node:*`／`electron`／`@ohos` 导入，**零** `Buffer`/`process`/`__dirname` 全局 |
| 分层门禁 | `pnpm quality:check` 通过：分层 29 workspace／364 源文件零违规；体量护栏只有预警无失败（新增文件 `apps/web/src/host.ts` 342 行、`file-host.ts` 310 行，均在 300 预警、400 硬限之间） |
| 路线图解析 | 台账 52（下限 49）、依赖边 239（下限 238）、`R-*` 18、未解析行 0，**解析层面无违规**；但"门禁会拦"这一点不成立，见 MAJOR-5 |

## 3. MAJOR（阻断签署，须实施者修复后由我复审）

### MAJOR-1　浏览器受控 Host 的 `project.backup.restore` 伪造恢复内容并销毁原文

- **定位**：[apps/web/src/host/store.ts:145-170](../../apps/web/src/host/store.ts)，命门在 `:162` `void hash;` 与 `:163` `grant.files.set(name, new Uint8Array(Number(length)))`。
- **事实**：`handleBackupCreate` 只把「文件名 + 哈希 + 长度」序列化为清单（`:116-124`），**从不保存字节**；`handleBackupRestore` 据此把每个文件重建为**等长全零缓冲区**，并显式丢弃记录下来的哈希，然后返回 `restored: true`。
- **我的独立复现**（探针直接调用其导出函数，非复述自述）：

  ```text
  after save     : "REAL DOCUMENT CONTENT"
  after edit     : "EDITED"
  restore result : {"grant_id":"grant_9537…","backup_id":"backup_d34aece9…","restored":true}
  after restore  : "\u0000\u0000…\u0000"   (21 字节)
  length kept    : 21 | all zero: true
  ```

  即：**恢复"成功"，文档变成 21 个 0 字节，编辑前的真实内容永久丢失。**
- **为什么这是 MAJOR 而不是"模拟当然不真实"**：该能力在注册表里被登记为 `support_status: "supported"`、`fallback: {strategy:"none", reason_code:"PB10_IMPLEMENTED"}`（`buildPayloadHostRegistry` 默认全 `supported`，[apps/web/src/host.ts:54-62](../../apps/web/src/host.ts) 未下调）。[host-contract §5](../host-contract.md) 明文"**不能静默把 degraded/unsupported 当作 supported**"，§4 明文浏览器 Host "**不得冒充平台实现**"。一个宣称 `supported`、回报 `restored: true`、实际清零数据的能力，正是该条禁止的形态；R-DATA 的"可导出恢复"在此处是负数（恢复即数据丢失）。
- **测试为何没抓到**：`apps/web/test/browser-host.unit.test.ts:128-169` 的 "virtual backup snapshot and restore" **只断言 `kind === "success"`**，不校验任何内容字节——正是 DoD §2「守卫被代打」要拦的形态。
- **修复方向**（任选，须书面裁定）：① 快照真正保存字节；② 把 `project.backup.create/restore` 在浏览器 Host 登记为 `unsupported`（或 `degraded` + 明确 `reason_code`）并让 restore 返回失败；③ 若坚持"清单式模拟"，必须让 restore **不触碰 `grant.files`** 并显式降级。无论哪种，都要补一条**内容级**回归断言（恢复后字节 === 备份时字节）。

### MAJOR-2　Electron 壳接线有两处调用签名错误；PA-14E 已签署能力必然抛错，且这段代码无任何覆盖、从未被执行

- **定位**：[apps/electron-shell/src/main.cjs:86](../../apps/electron-shell/src/main.cjs)、`:98` 与 `:104`。
- **事实 A（实参丢失）**：`:55` 声明 `async function createHost(window)`，`:61` 用它构造 `hostDialog(window)`；但 `:86` 调用处写的是 `createHost()`——**没有传 window**。于是目录选择对话框以 `undefined` 作父窗口调用 `dialog.showOpenDialog`，丢失与主窗口的模态关系。
- **事实 B（形参错位，命门）**：`:104` 声明 `async function handlePrintPdf(request)`（**一个形参**），`:98` 却调用 `handlePrintPdf(window, request)`（**两个实参**）。JS 按位绑定，函数体内的 `request` 实际是 `BrowserWindow` 实例，真正的请求被丢弃；`:116` 取到 `request_id === undefined`，`:122` 拿 `BrowserWindow` 当消息喂给 `validateHostSession`。
- **我的独立复现**（把 `:98`/`:104` 的调用点与声明原样搬出，配真实 `buildPayloadHostRegistry` + `validateHostSession`）：

  ```text
  registry valid: true
  THROWS: Error: invalid electron host session: HOST_PLATFORM_FIELD_FORBIDDEN
  control (correct arity) -> success req_14e00000000000000000000000000000
  ```

  即：**经 IPC 调用 `print.pdf.export` 恒抛错**；`--reverify` 自证路径（`:137-146` 让渲染进程 `window.wenshuHost.invoke(pdfRequest)`）会因此 reject → 落到 `:197` 的 catch → `app.exit(1)`。**PA-14E 已签署的 Electron 壳复验与安全探针在本分支上是坏的。**
- **为什么没被任何门禁发现**：
  1. [apps/electron-shell/tsconfig.json](../../apps/electron-shell/tsconfig.json) 的 `include` 只有 `scripts/**/*.ts`——`src/*.cjs` **根本不在 typecheck 范围**（TypeScript 本可以直接报"Expected 1 arguments, but got 2"）；
  2. 根 `verify` 与 8 个 CI 作业（[tools/ci/src/jobs.ts](../../tools/ci/src/jobs.ts)）**都不跑** `reverify`/`security:test`；
  3. 干净克隆与共享工作树中 **`electron.exe` 均不存在**（`electron` 只装了 npm 包壳，`dist/` 未下载），本审计因此无法实跑 `reverify`；实施记录也只声称"通过 typecheck"、未声称跑过 `reverify`——**没有任何证据表明这段被重写的主进程代码曾被执行**。
- **与范围的关系**：路线图 PB-10 行的"范围内"写的是"浏览器受控host与**Electron文件host**"。实施记录称"electron-shell 仅完成依赖接入与 typecheck"——但 diff 实际重写了注册表来源、IPC 路由与 preload 通道（新增 `wenshu.host.cancel`），这已不是"依赖接入"；而"通过 typecheck"对 `.cjs` 而言是空承诺。**要么把接线修正并给出真实执行证据，要么把 Electron 侧改动整体退出本 PR 并在路线图/记录中如实标注 Electron 文件 host 未交付。**

### MAJOR-3　验收口径「不覆盖导入原件」未被结构性满足，实测可覆盖

- **定位**：[packages/project-storage/src/file-boundary/handlers.ts:192-204](../../packages/project-storage/src/file-boundary/handlers.ts)。
- **事实**：`file.export.write` 的唯一保护是 `payload.overwrite !== true`；只要调用方传 `overwrite: true`，即可覆盖**授权目录内任意文件**。边界层不存在"导入原件"这一概念——没有受保护名单、没有只读标记、没有来源追踪。
- **我的独立复现**：在授权目录放入 `imported-original.md`（内容 `ORIGINAL BYTES`），以 `overwrite:true` 导出同名文件：

  ```text
  export overwrite:true -> success | before: "ORIGINAL BYTES" -> after: "CLOBBERED"
  ```
- **文档与事实的落差**：[ADR-0025](../adr/0025-PB-10原子保存崩溃恢复与Host文件边界.md) §"未选择与后续"写"不覆盖导入原件：`file.export.write` 提供 `overwrite` 标志，默认 fail-closed"。**"默认关闭"≠"不覆盖导入原件"**；A-02 的验收是"原件哈希不变"，PB-10 正是应当让它**结构上不可能**的那一层。
- **修复方向**：① 在 grant 内维护受保护条目（导入原件登记为只读，`overwrite` 对其无效并返回稳定 code）；或 ② 由业主书面裁定把该范围项下放到 A-02，并**同步修改路线图该行与 ADR 措辞**——不得以"默认 fail-closed"含糊带过。

### MAJOR-4　参考机器证据被非冻结运行时覆盖并提交，性能批次基线因此不成立

- **定位**：提交 `016b5bd`（"chore(env): record PB-10 batch baseline on wenshu-dev-primary"）→ [artifacts/reference-machine/environment.json:32](../../artifacts/reference-machine/environment.json)。
- **事实**：该提交把已登记的机器证据 `runtime.node` 从 **`v24.17.0` 改写为 `v24.13.0`**。`v24.13.0` 正是[开发环境基线](../development-environment.md)第 15 行点名的**C 盘旧全局 Node**，AGENTS「命令」节明文"**不得直接使用本机旧全局**"。即：`pnpm env:record` 是在**未初始化 D 盘工具链**的会话里跑的。
- **影响**：
  1. [reference-machine.md §1](../reference-machine.md) 的登记表仍写"运行时 Node v24.17.0、pnpm 11.15.1"——**已提交证据与其权威文档现在自相矛盾**，且文档未同步修改；
  2. 与 `toolchain.versions.json` 冻结的 v24.17.0 冲突；
  3. G1-14 §3 采样协议要求"每个采样批次开始前运行 `pnpm env:record`，把当批原始数据与对应机器证据放在同一批次目录"。现在这批机器证据描述的是一个**项目禁止使用的运行时**，于是"PB-10 恢复采样批次"要么记录了错误环境，要么整批就是在旧 Node 上跑的——两种都使该批次不能作为基线；
  4. `pnpm environment:check` 只做版本**字符串形状**校验（`NODE_VERSION_PATTERN`），不与冻结工具链交叉比对，故门禁全绿、漂移不可见。
- **修复方向**：按会话初始化步骤在 D 盘 Node v24.17.0 下**重跑** `pnpm env:record` 并重新提交，重跑恢复采样批次；另建议把"证据 runtime 必须等于 `toolchain.versions.json` 冻结版本"补成 `environment:check` 的一条判定（可登记为跟进项，不要求本轮完成）。

### MAJOR-5　（越界发现，归属 `G2-04`）路线图不变量门禁只打印不拦截，`verify`/CI 恒绿

- **定位**：[tools/quality/scripts/check-repository.ts:101-116](../../tools/quality/scripts/check-repository.ts)。
- **事实**：`roadmap.findings` 在 `:101-105` 被逐条打印为 `ERROR`，但 `:107-115` 决定退出码的条件里**列举了其余七类检查（errors / coverage / strictConfig / phantomDependencies / unusedProductionDependencies / layering / generatedRegistry），唯独没有 `roadmap.findings`**。因此任何路线图不变量违规都不会置 `process.exitCode = 1`。
- **我的独立复现**（两条互不依赖的实验，均在隔离克隆内做、做完还原）：

  ```text
  实验一（本报告落盘触发检查 8b staleness）
  ERROR roadmap-registry-stale …… 无独立报告豁免登记 "PB-10" 与现状不符（已出现独立报告）
  pnpm quality:check exit code = 0

  实验二（把 PB-09 台账行的报告链接改成不存在的文件，触发检查 8b + 8c）
  ERROR roadmap-ledger-missing-report-link docs\implementation-roadmap.md:133 ……
  ERROR roadmap-ledger-broken-link        docs\implementation-roadmap.md:133 ……
  pnpm quality:check exit code = 0
  ```
- **影响**：`quality:check` 是 `pnpm verify` 与 CI `static` 作业的组成部分（[tools/ci/src/jobs.ts](../../tools/ci/src/jobs.ts)），所以**路线图台账、依赖列、`R-*` 标注、证据链接的全部 10 条判定当前都是"只报不拦"**；[路线图 §11](../implementation-roadmap.md) 与 [ADR-0024](../adr/0024-G2-04路线图手写真源收敛与不变量门禁.md) 声称的"由 G2-04 门禁在 `pnpm verify` 与 CI `static` job 机械校验""解析 fail-closed——格式退化导致计数下降即失败"，在退出码层面**未落实**。业主本次交办 PB-10 时依据的"签署当轮不补台账、检查 8a 会拦"这条承接规则，**当前也不会真的拦**。
- **归属与责任**：由 `b19beec`（G2-04 门禁实现）引入，**PB-10 未触碰该文件**，不计入 PB-10 的实施质量。G2-04 首审/复审的 46 条探针是直接喂 `checkRoadmapInvariants` 的镜像探针，未覆盖"退出码接线"这一层——这是我作为 G2-04 审计者当时的盲点，在此一并登记。
- **要求**：把 `roadmap.findings.length > 0` 补进退出码条件，并补一条**决定性测试**（注入任一路线图违规 → `check-repository` 退出码非 0）。可由 PB-10 修复轮顺带完成（G2-03 MI-02 已确立"下一次触及 `tools/quality` 的任务"的归属惯例），也可由业主另立小任务；但在修好之前，任何"路线图门禁保证了台账一致性"的表述都不得再被引用。

## 4. MINOR（不阻断结论，但须在关闭 MAJOR 时一并处置）

| ID | 定位 | 事实与要求 |
|---|---|---|
| MI-01 | [packages/project-storage/src/backup.ts:69-88](../../packages/project-storage/src/backup.ts) | `restoreFromSpecificBackup` 新增 `if (existsSync(databasePath))` 才隔离。**PB-09 已签署行为被改**：库文件不存在时，旧实现 `rename` 抛 ENOENT → `STORAGE_RECOVERY_FAILED`，新实现**静默成功**且不执行 quarantine。代码注释与实施记录却写 "existing behavior unchanged"。须么恢复原语义，么在 ADR/记录中如实登记该变更并补回归测试 |
| MI-02 | [tools/quality/src/roadmap-registry.ts:133-136](../../tools/quality/src/roadmap-registry.ts) | 把 `PB-10` 塞进检查 8b 的**封闭豁免表**（该表语义是"确实没有独立报告"，G2-04 任务书登记为"closed table of 6, exhaustive"），与 AGENTS 规则 8「不得扩大豁免让检查通过」相抵触。**正确做法是 G2-04 承接①：台账行在签署当轮补**，而不是实施轮先补行、再补豁免。补充事实：受 MAJOR-5 影响，**不加这条豁免 `verify` 也不会红**，所以该改动既不必要、也没有换来它想要的绿——本报告落盘后它已变成 stale 登记（`roadmap-registry-stale`，同样只打印不拦截）。**须随修复移除**，并在签署轮改为在台账行直接链接本报告 |
| MI-03 | [packages/project-storage/test/file-host.integration.test.ts:26](../../packages/project-storage/test/file-host.integration.test.ts) | 敌意矩阵里 `"a\0hidden"` 写成了**裸 NUL 字节**（相邻项都用 `\t`/`\r`/`\u000b`/`\f` 转义）。Git 因此判定该文件为二进制（`Bin 0 -> 14128 bytes`），**418 行、14 KB 的安全矩阵在 PR diff 中完全不可评审**。改为 `\u0000` 即可 |
| MI-04 | [tools/ci/src/jobs.ts](../../tools/ci/src/jobs.ts) | `@wenshu/web` 的 6 条浏览器 Host 测试**不在 `pnpm verify`、也不在任何 CI 作业**中；`contracts:check` 的包清单同样没有它。对照 PB-09 曾把 `project-storage` 接进 `contracts` 作业。当前浏览器 Host 零回归门禁（MAJOR-1 的零字节恢复能长期存活，与此直接相关） |
| MI-05 | 实施记录/ADR | 数字与事实不符四处：① 记录写 host-contract "45/45"，实测 **48**；② 变异表称 rename→直写会让"残留清理与 **crash 测试**失败"，我实测只有 2 条**非 crash** 测试变红（四相位崩溃测试仍绿）；③ ADR 写残留前缀 `.tmp-`，代码是 `.wenshu-tmp-`；④ ADR §2 与记录称由 `resolveInside` "解析后 fail-closed 校验不逃逸"，**代码中没有这个函数**，实际是 `resolveGrantFile` 内的 `dirname(target) !== root` 字符串比较，**不做 realpath/符号链接解析**（按 Node/POSIX 语义：`rename` 不跟随符号链接故写入不会逃逸，但 `existingFileHash` 的 `readFile` 会跟随授权目录内的符号链接读到根外文件——Windows 建符号链接需权限，本项未实测，按语义判定） |
| MI-06 | [atomic-write.ts:7](../../packages/project-storage/src/file-boundary/atomic-write.ts) + [host-payloads-0.2.0.schema.json `SafeFileName`](../../packages/host-contract/schema/host-payloads-0.2.0.schema.json) | 白名单允许 Windows **保留设备名**与**尾点名**。我实测 `NUL`/`CON`/`PRN`/`AUX`/`COM1`/`LPT1`/`a.` **全部写入成功并真实落盘**，产生常规 Win32 工具难以打开/删除的工件（`nul` 小写因大小写不敏感命中已存在文件而 `HOST_CONFLICT`）。PA-00 [决策 #7](../../决策记录.md) 的 Windows 命名口径未被本白名单继承。同一正则在 schema 与代码中**各写一份**，存在漂移风险，建议单源化 |

## 5. NOTE（不要求整改，登记备查）

- **本地 `main` 已被污染**：`D:\wenshu` 的本地 `main` 比 `origin/main` **多 6 个提交**（`ff716e3`…`46d756a`，含 PB-10 全部契约与存储层生产代码）。本次审计一律以 `origin/main..origin/pb-10` 为基线。**在 PR #46 合入前不得推送本地 `main`**，否则等于绕过 PR 与必需检查。
- **≤10 s 的度量对象**：测的是"残留清理 + 打开项目库 + 工件校验"，不是用户可见的"强杀后重开到可操作"。JSON 报告与记录对此表述诚实（并主动标注"NOT the Win11 reference machine"），但 PB-12/A-12 必须端到端重测，不得引用本批次冒充。
- **崩溃相位测试不是原子性的决定性守卫**：去掉 `rename` 改直写后，四相位 `SIGKILL` 测试**仍全绿**（相位埋点仍围绕临时文件触发）。真正抓住该变异的是残留清理与 round-trip 两条断言。结论仍满足 DoD §2（套件整体变红），但相位测试的证明力不宜被高估。
- **浏览器 Host 是纯内存**：`grant.files` 是 `Map`，刷新即失，未使用 PB-08 [ADR-0022](../adr/0022-PB-08SQLite与OPFS存储引擎选型.md) 裁定的 OPFS。7 项能力却全登记 `supported`。即便 MAJOR-1 修好，也建议在注册表或 host-contract 文档中明示"非持久"。
- **`apps/web/tsconfig.json` 仍 `types:["node"]`**：分层门禁只看 import 不看全局，`Buffer`/`process` 仍可无 import 穿透 web 层。本次**未发生**（我已 grep 确认），但护栏有洞，与 G2-03 MI-03 同批可议。
- **`.cjs` 不进 typecheck 是普遍口径**：`quality:check` 的 typecheck 覆盖检查不要求 `.cjs` 入 tsconfig，故 MAJOR-2 的两处签名错误没有任何静态防线。建议在关闭 MAJOR-2 时一并给 `apps/electron-shell/src` 加上 `checkJs` 或迁 `.ts`。

## 6. 验收标准逐条对账

| 路线图 PB-10 验收点 | 判定 | 依据 |
|---|---|---|
| 强杀/重开 ≤10 s | **有条件成立** | 我独立复测 p95 38.9 ms ≪ 10 000 ms；但度量口径为存储层恢复（见 NOTE），且批次机器证据受 MAJOR-4 污染 |
| 上次成功成品不损坏 | **成立** | 四相位真 `SIGKILL` 后工件非旧即新；失败保存字节不变、零残留（我自建探针） |
| 拒绝权限有降级 | **成立** | 只读/拒绝授权 → `HOST_PERMISSION_DENIED` + `fallback.strategy` 明确；不回显路径；PB-09 磁盘满诊断保真已在前一棒关闭 |
| 路径逃逸即阻断 | **成立** | 28 项敌意值在真实 host 入口全拒；失效方向变异被决定性测试抓红 |
| 半写文件即阻断 | **成立** | 真子进程真强杀，四相位无第三态 |
| 范围内：浏览器受控 host | **不成立** | MAJOR-1 |
| 范围内：Electron 文件 host | **不成立** | MAJOR-2 |
| 范围内：不覆盖导入原件 | **不成立** | MAJOR-3 |

## 7. 复现命令与证据索引

```powershell
# 会话初始化（务必先做，否则会取到 C 盘旧 Node 24.13.0——MAJOR-4 的成因）
$env:PATH = 'D:\DevTools\pnpm;D:\Applications\Node\node-v24.17.0-win-x64;' + $env:PATH

git clone --no-hardlinks D:\wenshu D:\tmp\pb10-audit; cd D:\tmp\pb10-audit; git checkout pb-10
pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store
pnpm --filter @wenshu/host-contract test        # 48/48
pnpm --filter @wenshu/project-storage test      # 24/24
pnpm --filter @wenshu/web test                  # 6/6
pnpm verify                                     # exit 0
pnpm quality:check                              # 台账 52/下限 49；分层零违规
```

变异（在隔离克隆内改、跑完即还原，共享工作树零改动）：
1. `atomic-write.ts:7` `SAFE_FILE_NAME` → `/^[\s\S]*$/u`（**全放行**）⇒ `resolveGrantFile structurally refuses escapes` 变红（24 → 23 pass / 1 fail）。
2. `atomic-write.ts:101` `rename(tempPath, targetPath)` → `writeFile(targetPath, bytes)` ⇒ 2 条变红（24 → 22 pass / 2 fail）。
3. （MAJOR-5）把 `docs/implementation-roadmap.md` 中 `audits/PB-09-claude-audit-report.md` 链接改成不存在的文件 ⇒ 打印 `roadmap-ledger-missing-report-link` + `roadmap-ledger-broken-link` 两条 `ERROR`，但 `pnpm quality:check` **exit code 仍为 0**。

自建探针（源码见本报告 §3 引用的输出，探针文件用后即删，未入库）：Windows 保留名/尾点/长度边界/大小写碰撞矩阵、导入原件覆盖、失败写残留与路径回显、Electron 调用签名复现、浏览器备份恢复字节比对。

## 8. 交接与关闭条件

- **MAJOR-1～MAJOR-4 由 Codex 修复，由我复审关闭**；实施者不得自行关闭发现（AGENTS §实施与独立审计）。**MAJOR-5 属 `G2-04` 门禁缺陷**，请业主裁定由本修复轮顺带关闭还是另立任务；在它修好之前，`verify`/CI 绿**不能**再被当作路线图台账一致性的证据。
- 修复轮请一并处置 MI-01～MI-06；MI-02 的豁免登记项须随修复移除（它已是 stale 登记）。
- 台账 [§3.1 `PB-10` 行](../implementation-roadmap.md) 当前为「🔄 已实现，待独立审计」，与事实一致，本轮**不得**改 ✅。
- 复审时我会重点重跑：浏览器备份恢复的**字节级**断言、Electron 壳的**真实执行**证据（需先安装 electron 二进制并跑通 `reverify`/`security:test`）、导入原件保护的结构性反例、重跑后的 `environment.json` 运行时字段，以及本报告全部通过项的不回潮。
- 遗留提醒：ArkWeb 文件桥仍 `needs_device_to_verify`，本棒未宣称三端贯通——该口径**正确**，请在后续棒次继续保持。

---

*本报告由独立审计角色出具；台账与代码修复由实施者完成。审计期间仅新增本文件。*
