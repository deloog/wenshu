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

---

# 9. 复审记录（2026-07-31）· 结论 CONDITIONAL PASS

> 复审对象：修复提交 `cb9c9a7`（`fix(pb-10): address Claude audit FAIL findings MAJOR-1~5 and MINORs`，20 文件）。
> 复审方法：隔离克隆更新到 `cb9c9a7` 后 `pnpm install --frozen-lockfile` → 全套件与 `pnpm verify` 独立复跑 → **对每一项 MAJOR 亲手复现修复效果**（不采信自述）→ **对两条新守卫做失效方向变异** → 真机跑通 Electron 壳。
> 首审报告正文经我逐字比对，**未被实施者改动一个字节**（`git show cb9c9a7:docs/audits/PB-10-claude-audit-report.md` 与我的原稿 diff 为空）——实施者未自行关闭任何发现，符合 AGENTS。

## 9.1 结论

**CONDITIONAL PASS —— MAJOR-1～MAJOR-5 全部关闭，MI-01/02/03/05/06 关闭；三项条件（C1～C3）与一项工作树卫生项须在合入前完成。** 无未关闭 BLOCKER/MAJOR。

## 9.2 MAJOR 逐项复核（我的独立结果）

| 发现 | 判定 | 我的独立证据 |
|---|---|---|
| **MAJOR-1** 浏览器备份恢复清零 | **关闭** | 快照改存真实 base64 字节。我的探针：含 **NUL 字节 + CJK + `ÿ`** 的载荷经 备份→编辑→恢复 后 **`BYTE-IDENTICAL TO ORIGINAL: true`**；另喂**篡改快照**（非法 JSON）→ `INTEGRITY_FAILURE` 且**当前文件完好**（新实现先建好 `restoredFiles` 再 `clear`，失败不毁数据）。**决定性变异**：我把恢复改回零填充 ⇒ `virtual backup snapshot and restore preserves document bytes` **变红**（6→5 pass/1 fail），守卫为真 |
| **MAJOR-2** Electron 调用签名 | **关闭** | `createHost` 已并入 `whenReady` 且 `hostDialog(window)` 拿到真 window；`handlePrintPdf(request)` 单参调用。**我亲自跑通真 Electron**：`pnpm --filter @wenshu/electron-shell security:test` **exit 0**，输出 `"hostSession":{"terminalKind":"success","capability":"print.pdf.export"}`——首审必抛的那条路径现在返回 success 终态；PA-14E 安全姿态零回退（`exposedKeys:["cancel","invoke","registry"]`、`requireType/processType: "undefined"`、`contextIsolation/sandbox: true`、`nodeIntegration: false`），基线复现 `Electron/43.1.1 Chromium/150.0.7871.114`、21 页、字体全嵌、P0=0 P1=0 |
| **MAJOR-3** 可覆盖导入原件 | **关闭（带承接 C3）** | 新增 `grant.protectedFiles` + `protectImportedFile/isImportedOriginal`，拦截点放在 `writeAtomically`，**三条写路径（save.atomic / save.as / export.write）一并覆盖**。我的探针：登记后 `export.write overwrite:true` → **`HOST_PERMISSION_DENIED`**、`save.atomic` 亦 → `HOST_PERMISSION_DENIED`、磁盘内容仍是 `ORIGINAL A`。另有真集成测试 `imported originals cannot be overwritten even with overwrite:true` 断言磁盘字节不变 |
| **MAJOR-4** 参考机器证据被旧 Node 覆盖 | **关闭（带卫生项 C4）** | `cb9c9a7` 提交的 `environment.json` 已是 `"node": "v24.17.0"`；恢复采样重测 median 36.0 / p95 40.0 ms（与我首审独立复测的 37.1 / 38.9 ms 同量级） |
| **MAJOR-5** 路线图门禁只报不拦 | **关闭（带条件 C1）** | `roadmap.findings.length > 0` 已补进退出码条件。**我重做首审那条注入实验**：把 `PB-09` 台账行的报告链接改成不存在的文件 ⇒ `pnpm quality:check` **exit code = 1**（首审时为 0）；还原后干净树 **exit 0** |

## 9.3 MINOR 复核

- **MI-01 关闭**：`restoreFromSpecificBackup` 目标库不存在时显式抛 `STORAGE_RECOVERY_FAILED`，PB-09 原语义恢复；注释中失实的 "existing behavior unchanged" 已改正。
- **MI-02 关闭**：豁免登记项已移除，台账行直接链接本报告。（**顺带纠一处笔误**：台账 `PB-10` 行现在把 `[审计任务]` 链接写了两遍，删掉重复的一处即可。）
- **MI-03 关闭**：裸 NUL 已改 `\u0000`，我实测该文件 **NUL 计数 = 0**。`git diff --stat` 仍显示 `Bin` 是因为**对比的旧 blob 是二进制**，git 只要一侧是二进制就按二进制渲染——新 blob 本身是文本，后续 diff 可正常评审。
- **MI-05 关闭**：48/25/6 计数、变异表描述、`.wenshu-tmp-` 前缀、`resolveInside` 措辞均已按事实更正。
- **MI-06 关闭（留残余 NOTE）**：`SAFE_FILE_NAME` 与 payload schema 已同步拒绝裸保留设备名与尾点，我实测 `NUL`/`CON`/`com1`/`LPT9`/`a.` **全部 `HOST_INVALID_REQUEST`**。**残余**：带扩展名的形式（`NUL.md`/`CON.txt`/`COM1.dat`/`AUX.log`）仍被接受；我实测它们在本机 NTFS 上是**普通文件、内容可正确读回**（未被当作设备、无数据丢失），故不重开发现——但微软官方口径是"保留名后紧跟扩展名同样不推荐"，登记为 NOTE，若将来出现不走 `\\?\` 语义的调用路径需重新评估。
- **MI-04 未处置**（见 C2）。

## 9.4 合入前必须完成的条件

| ID | 要求 | 理由 |
|---|---|---|
| **C1** | 为路线图退出码接线补**决定性测试**（注入任一路线图违规 ⇒ `check-repository` 退出码非 0） | MAJOR-5 的修复目前**没有任何回归守卫**；这条 bug 的性质正是"门禁看起来在、实际不拦"，同样的静默回归可以再来一次。DoD §2 要求核心守卫有决定性测试 |
| **C2** | 把 `@wenshu/web` 的测试接入 CI（`contracts` 作业）与/或 `pnpm verify`（首审 MI-04，本轮未处置） | `jobs.ts` 中 `@wenshu/web` 只出现在三个 **build** 作业里，`test` 从未被跑过。**MAJOR-1 新加的那条字节级守卫目前在任何门禁里都不会执行**——修复有了，防线没有。对照 PB-09 曾把 `project-storage` 接进 `contracts` 作业 |
| **C3** | 在 ADR-0025 与实施记录中写明：`protectedFiles` 由**导入流程**登记，PB-10 自身没有导入能力（`file.import.select` 仍 `unsupported`），因此**未登记的既有文件仍可被 `overwrite:true` 覆盖**；并把"A-02/PB-11 导入时必须调用 `protectImportedFile`"登记为承接项 | 我实测未登记的既有文件 `imported-b.md` 仍被 `overwrite:true` 覆盖成功。当前 ADR 措辞"导入原件登记为只读…即便 `overwrite:true` 也无法覆盖"容易被读成"所有原件已受保护"。机制正确，但保证是**有条件的**，必须写明条件，否则 A-02 会以为这层已经兜住 |
| **C4** | 清理共享工作树 `D:\wenshu` | 复审时该树**不干净**：① `artifacts/reference-machine/environment.json` 有**未提交改动，`node` 又变回 `v24.13.0`**——MAJOR-4 的同一成因（会话未按[开发环境基线](../development-environment.md)初始化）在修复后**再次发生**，一旦被提交即 MAJOR-4 回归；② 仓根有一个空的游离文件 `0`（疑似 shell 重定向误建）。二者均非我造成（我的验证在隔离克隆内进行，仅 Electron 复验写入被 ignore 的 `test-results/`） |

## 9.5 复审执行的检查

```text
隔离克隆 D:\tmp\pb10-audit @ cb9c9a7（D 盘冻结 Node v24.17.0 / pnpm 11.15.1）
pnpm install --frozen-lockfile              成功
pnpm --filter @wenshu/host-contract test    48/48
pnpm --filter @wenshu/project-storage test  25/25
pnpm --filter @wenshu/web test              6/6
pnpm verify                                 exit 0
pnpm quality:check（干净树）                 exit 0
pnpm quality:check（注入路线图违规）          exit 1   ← MAJOR-5 已真正拦截
D:\wenshu：pnpm --filter @wenshu/electron-shell security:test   exit 0（真 Electron 43.1.1）
变异：恢复改回零填充                          web 测试变红（MAJOR-1 守卫为真）
探针：保留设备名/尾点、受保护原件、未登记原件、篡改快照、字节级 round-trip
```

首审 §2 的全部通过项在本轮**未回潮**（路径逃逸、半写、失败写不损坏成品、供应链零新增、web 层零平台导入、分层与体量护栏）。

## 9.6 关闭与放行

- **C1～C4 完成后即可标 ✅ 并放行 `PB-11`/`A-02`**；这四项都是文档/接线/清理级，无需再动文件边界核心逻辑，完成后由我做一次轻量确认即可，不需重跑完整复审。
- 台账 `PB-10` 行在 C1～C4 完成前保持 `🔄 已实现，待独立审计`，完成后改 ✅ 并按 G2-04 承接①在**同一轮**补齐证据链接（本报告 + 实施记录 + PR/commit + CI run）。
- 承接下一棒：`protectImportedFile` 的调用责任（C3）、ArkWeb 仍 `needs_device_to_verify`、以及首审 NOTE 中"≤10 s 度量的是存储层恢复而非端到端重开"——PB-12/A-12 须端到端重测，不得引用本批次冒充。

---

# 10. C1–C4 确认记录（2026-07-31）· 尚未放行

> 确认对象：`8dfef7e`（`fix(pb-10): close conditional pass C1-C4`）+ `846b4f0`（台账记录 CI run）。
> 我的原稿（§1–§9）经比对**逐字未被改动**。

## 10.1 结论

**C2/C3/C4 关闭；C1 不合规关闭——修复引入了一条新的门禁旁路（`C1-R1`，MAJOR）。** 在 `C1-R1` 关闭前：**PR #46 不应合并**，台账 `PB-10` 行应从 `✅ 已完成` 退回 `🔄 已实现，待独立审计`。

## 10.2 C1-R1（MAJOR，复审新增）　为让测试跑通，在生产门禁上开了一条环境变量旁路

- **定位**：[tools/quality/scripts/check-repository.ts:57-60](../../tools/quality/scripts/check-repository.ts)

  ```ts
  const roadmapPath = process.env["ROADMAP_PATH"]
    ? resolve(process.cwd(), process.env["ROADMAP_PATH"])
    : resolve(workspaceRoot, "docs/implementation-roadmap.md");
  ```

- **事实**：路线图门禁的**检查对象**现在可由一个环境变量任意改写。这是 `C1` 的回归测试为了喂入镜像文件而加的测试缝，但它开在**生产脚本**里。
- **我的独立复现**（隔离克隆，做完即还原）：把真实 `docs/implementation-roadmap.md` 的 `PB-09` 证据链接改成不存在的文件（正是检查 8b/8c 存在的意义），然后

  ```text
  不设 ROADMAP_PATH                      → pnpm quality:check exit = 1   ✅ 拦住
  ROADMAP_PATH=<仓内一份完好的诱饵副本>    → pnpm quality:check exit = 0   ❌ 真实路线图的违规完全没被检查
                                            且照常打印"Roadmap invariants: …未解析行 0"，看上去一切正常
  ```

- **为什么算 MAJOR**：这与 `MAJOR-5` 的修复目标自相矛盾——同一个提交一边把"门禁只报不拦"补上，一边给它开了一扇"改个环境变量就不查了"的门，失效方向仍是 **fail-open**，且**无任何登记与留痕**。[路线图 §11](../implementation-roadmap.md) 与 [ADR-0024](../adr/0024-G2-04路线图手写真源收敛与不变量门禁.md) 明写"例外只存在于检查器的显式登记表"；AGENTS 规则 8 明写不得为让检查通过而放宽规则。当前**实际暴露为零**（CI 不设该变量、日常开发也不会设），故判 MAJOR 而非 BLOCKER——与 `G2-03` 首审 MA-01（L3 平台许可无差别、实际暴露为零仍判 MAJOR）同一口径。
- **修复方向**（任选，勿保留 ambient 覆盖）：把"跑全部检查 + 决定退出码"抽成 `src/` 里的导出函数，显式接收 `{ workspaceRoot, roadmapPath }`；`scripts/check-repository.ts` 固定传真实路径，回归测试直接调用该函数并断言其返回的退出码为 1。这样测试缝在参数里，不在环境里。若坚持 spawn 形态，则该入口必须是独立的测试专用脚本，不能是 `pnpm quality:check` 走的那一个。

## 10.3 C1–C4 逐条确认

| 条件 | 判定 | 我的独立证据 |
|---|---|---|
| **C1** | **不合规关闭** | 测试本身是真的：`roadmap-exit.integration.test.ts` spawn 真实脚本、注入镜像违规、断言退出码与发现文本。**决定性我已验证**——我把 `roadmap.findings.length > 0` 从退出码条件里删掉 ⇒ 该测试**变红**（36→35 pass/1 fail）。但它以 `C1-R1` 为代价，故不予关闭 |
| **C2** | **关闭** | `unit-config` 作业新增 `--filter @wenshu/web test`；我独立复跑 web 6/6。**额外收益**：同批加入的 `--filter @wenshu/quality test:integration` 把 tools/quality 的 **36 条** integration 探针（含 G2-04 反例与分层反例）也接进了 CI——这些此前既不在 `verify` 也不在任何作业里，属实质加固 |
| **C3** | **关闭** | ADR-0025 与实施记录均已改写：明确 `protectedFiles` **须由导入流程登记**、PB-10 无导入能力（`file.import.select` 仍 `unsupported`）、**"未登记的既有文件仍可被 `overwrite:true` 覆盖"**、调用责任由 A-02/PB-11 承接。措辞与我实测一致，不再有"已全部兜住"的误读空间 |
| **C4** | **关闭** | `D:\wenshu` 工作树 `git status` 干净；`environment.json` committed 值为 `"node": "v24.17.0"`；游离文件 `0` 已删除 |

## 10.4 本轮复跑

```text
隔离克隆 @ 846b4f0（D 盘冻结 Node v24.17.0）
pnpm install --frozen-lockfile                       成功
pnpm verify                                          exit 0
pnpm --filter @wenshu/quality test:integration        36/36
pnpm --filter @wenshu/web test                        6/6
变异：删除 roadmap 退出码条件                          C1 测试变红（守卫为真）
探针：ROADMAP_PATH 旁路                                真实路线图违规下 exit 0（C1-R1）
```

## 10.5 台账与合并

- 台账 `PB-10` 行已被改为 `✅ 已完成`，但 §9.6 的放行前提是"C1～C4 完成后**由我做一次轻量确认**"——确认结果是 C1 未合规关闭，故该 ✅ **提前了**，应退回 `🔄 已实现，待独立审计`，待 `C1-R1` 关闭后同轮改 ✅（DoD §9）。
- 顺带一处笔误：该行现在把 `[实施记录]` 链接写了两遍（上一轮的重复 `[审计任务]` 已修，这轮换成了 `[实施记录]`），删掉重复的一处即可。
- `C1-R1` 是文件级小改（挪一个测试缝），改完请把 §10.2 的两条实验重跑一遍贴出结果；我确认后即可放行合并与 `PB-11`/`A-02`。

---

# 11. 最终确认（2026-07-31）· C1-R1 关闭，PB-10 签署放行

> 确认对象：`1eb19de`（`fix(pb-10): close C1-R1 — remove ROADMAP_PATH env seam from quality gate`）+ `5f66579`（记录）。我的原稿（§1–§10）逐字未被改动。

## 11.1 结论

**PB-10 独立审计终局：CONDITIONAL PASS，全部条件（C1～C4、C1-R1）已关闭，无未关闭 BLOCKER/MAJOR/MINOR。**
**PB-10 可标 ✅ 已完成；PR #46 可合并；`PB-11`/`A-02` 按各自 DoR 放行。**

## 11.2 C1-R1 复核（我的独立结果）

- **改法正确**：检查逻辑抽到 [tools/quality/src/check-repository.ts](../../tools/quality/src/check-repository.ts) 的 `checkRepository({ workspaceRoot, roadmapPath })`；生产脚本 [scripts/check-repository.ts](../../tools/quality/scripts/check-repository.ts) 只剩 10 行、**固定 `resolve(workspaceRoot, "docs/implementation-roadmap.md")`，不读任何环境变量**；测试改为直接调用该函数。测试缝落在参数上，正是 §10.2 建议的形态。
- **全仓无残留**：`ROADMAP_PATH` 只在我的报告（引述缺陷）与实施记录（描述修复）中作为文字出现，**生产与测试代码中为零**。
- **我重跑 §10.2 的两条实验**（隔离克隆，做完还原）：

  ```text
  真实 roadmap 注入违规、不设环境变量        → pnpm quality:check exit = 1   拦住
  真实 roadmap 注入违规 + ROADMAP_PATH 指诱饵 → pnpm quality:check exit = 1   旁路已死
      且 ERROR 明确指向真实的 docs\implementation-roadmap.md:133，不再被重定向
  ```

- **重构后守卫仍决定性**：我把 `roadmap.findings.length > 0` 置为 `false`（等价于把 roadmap 移出退出码条件）⇒ `roadmap findings cause check-repository to exit non-zero` **变红**（36→35 pass/1 fail）；还原后 36/36。退出码语义与首审前逐项对照一致，其余七类检查未被重构改动。
- **判定：`C1-R1` 关闭，`C1` 随之合规关闭。**

## 11.3 台账与本轮复跑

- 台账 `PB-10` 行已退回 `🔄 已实现，待独立审计`，重复链接已删除，现有链接 5 条无重复且包含自身审计报告（检查 8b/8c 满足）。**本确认出具后可改 `✅ 已完成`，并按 G2-04 承接①在同一轮补最新 CI run 与提交指纹。**
- 本轮：`pnpm install --frozen-lockfile` 成功；`pnpm verify` **exit 0**；`@wenshu/quality test:integration` **36/36**；工作树干净。首审 §2 与复审 §9 的全部通过项未回潮。

## 11.4 结转给后续棒次（非阻断）

| 项 | 归属 | 要求 |
|---|---|---|
| `protectImportedFile` 的调用责任 | `A-02`/`PB-11` 导入流程 | 导入原件创建/复制时必须登记，否则 `overwrite:true` 仍可覆盖（已写入 ADR-0025 与实施记录） |
| 带扩展名的 Windows 保留名（`NUL.md`/`CON.txt`） | 下一次触及文件名白名单的任务 | 当前实测为普通文件、内容可正确读回、无数据丢失；若出现不走 `\\?\` 语义的调用路径需重新评估 |
| ≤10 s 的度量口径 | `PB-12`/`A-12` | 本批次测的是存储层恢复（残留清理+开库+工件校验），**不是端到端"强杀后重开到可操作"**，须端到端重测，不得引用本批次冒充 |
| ArkWeb 文件桥 | 设备矩阵补齐前 | 仍 `needs_device_to_verify`，本棒未宣称三端贯通——该口径正确，请保持 |
| 浏览器受控 Host 为纯内存 | `A-02` 起 | `grant.files` 是 `Map`，刷新即失，未用 PB-08 裁定的 OPFS，却把 7 项能力登记为 `supported`；接入真实 UI 前建议改 `degraded` 或在文档明示"非持久" |

建议按仓内惯例（`G1-07`～`PA-11B`、`G2-03` 均有）另建 `docs/audits/PB-10-followups.md` 作为上述五项的单一归口，便于 `PB-11`/`A-02` 开工时逐条对账。此为建议，不作为放行条件。

## 11.5 签署

PB-10 从首审 `FAIL`（5 MAJOR / 6 MINOR）走到终局，全部发现均由实施者修复、由我复审关闭，实施者未自行关闭任何一条，本报告正文三轮未被改动一字。文件边界的两条红线——**路径逃逸**与**半写文件**——自始至终守住，并经我自建对抗探针、失效方向变异与真 `SIGKILL` 子进程三重独立坐实。

**PB-10 独立审计签署：CONDITIONAL PASS（条件全清）。**
