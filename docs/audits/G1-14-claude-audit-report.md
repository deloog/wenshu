# G1-14 参考机器、性能采样与资源预算说明独立审计报告

> 日期：2026-07-21　审计基线：`921a31e`（feat: record G1-14 reference machine baseline），范围 `921a31e^..d188c56`
> 任务书：[G1-14-claude-audit-task.md](G1-14-claude-audit-task.md)　受审基线：[reference-machine.md](../reference-machine.md)、[实施记录](G1-14-implementation-record.md)
>
> 本报告由未参与实施的独立只读审计角色出具。机器事实用独立于采集器的路径（CIM/注册表）重取并逐项对账；契约守卫、锚点绑定、门禁接线用变异测试独立判定。不采信实施记录、`reference-machine.md`、已提交证据、锚点常量或"全绿"自述。

## 1. 边界与方法

- **写入边界**：本轮只新增本文件一处。未修改任何代码、测试、证据 JSON、文档、lockfile、路线图、配置、Schema、生成物或 `.gitignore`。
- **探针边界**：全部探针写在仓库外 `D:\tmp\g114ev*`，结束已删除。未安装软件、未改注册表/系统设置、未 push、未触发 Actions。采集器重跑仅写 `D:\tmp`，已提交证据 `git diff` 为空。
- **独立工具**：机器事实用 `Get-CimInstance`（`Win32_OperatingSystem`/`Processor`/`ComputerSystem`/`VideoController`/`LogicalDisk`/`PhysicalMemory`）+ 注册表 `AppliedDPI`，与采集器（Node `os` 模块 + 一条固定 PowerShell 显示探针）**路径不同**；锚点用 `crypto` 独立重算 manifest 哈希；契约/门禁用仓库外变异测试。
- **工具链**：所有采集与命令在冻结 D 盘 Node `24.17.0` + pnpm `11.15.1` 下执行（Bash 默认 shell 的 v24.13.0 不用于任何结论）；命令加 `--config.verify-deps-before-run=false` 仅抑制 pnpm 跑前自动装依赖。

## 2. 结论摘要

**结论：`CONDITIONAL PASS`**

未发现 BLOCKER 或 MAJOR。任务书 §7 的否决线——机器证据与本机不符、采集器硬编码机器值、证据可伪造而通过、静默改 G0 预算或冒充阈值已通过、隐私字段混入、CI/verify 可绿色地漏跑、`.gitignore` 削弱既有忽略保护——**逐条经取证均不成立**。

| 级别 | 编号 | 摘要 |
|---|---|---|
| MINOR | `EN-01` | 根 `verify` 链是否包含 `environment:check` **无测试**：删除该命令或删脚本，全套测试仍绿；只有 CI `contracts` 作业侧被互锁。与 fixtures/fonts 各有的 verify 接线测试不一致，也与任务书"删除该命令应被测试发现"不符 |
| MINOR | `EN-02` | `.gitignore` 用 `!artifacts/reference-machine/` 放行了**整个目录**，而非仅 `environment.json`：该目录下其他非密文件（`other.json`、`subdir/x.json`）变为可提交，比声称的"仅放行 environment.json"更宽 |
| MINOR | `EN-03` | `@wenshu/test-support` 在 `tools/environment` 声明为依赖却**全程未 import**，违反"只声明直接使用的依赖" |
| NOTE | `EN-N1` | 子记录（os/cpu/memory/display/disk/runtime）的封闭键增/缺键无逐一用例；`requireRecord` 函数本身经 root 与 frozen 用例覆盖，纵深无损 |
| NOTE | `EN-N2` | 采样协议 §3.1 说机器证据入批次目录，但 `env:record` 固定写 `artifacts/reference-machine/environment.json`；且 `artifacts/perf/*` 被忽略，原始数据本地留存但不入库——留存≠提交，与 G0 一致，留给 PA-13 工具明确 |

三项 MINOR 均有明确归属和最迟关闭点，见 §8。

## 3. 机器证据真实性（核心，任务书 §2）

### 3.1 独立 CIM/注册表事实 vs 已提交证据

用**独立于采集器**的 CIM/注册表路径逐项重取，与 `artifacts/reference-machine/environment.json` 对账：

| 维度 | 证据值 | 独立取证（CIM/注册表） | 判定 |
|---|---|---|---|
| os.release | `10.0.19045` | `Win32_OperatingSystem.Version` = `10.0.19045` | ✔ 精确 |
| os.version | `Windows 10 Pro` | CIM Caption 本地化 `Microsoft Windows 10 专业版`（同一版本，英文/中文差异；证据来自 `os.version()` 的英文串） | ✔ 一致 |
| os.arch | `x64` | `OSArchitecture` = `64 位` | ✔ |
| cpu.model | `Intel(R) Core(TM) i5-9400F CPU @ 2.90GHz` | `Win32_Processor.Name` 完全相同 | ✔ 精确 |
| cpu.logical_cores | `6` | `NumberOfLogicalProcessors` = 6 | ✔ |
| cpu.speed_mhz | `2904` | `MaxClockSpeed` = 2904 | ✔ |
| memory.total_bytes | `17119330304` | `Win32_ComputerSystem.TotalPhysicalMemory` = 17119330304（安装物理 16 GiB=17179869184，差值为固件保留，符合 `totalmem()` 语义） | ✔ 精确 |
| display width×height | `1920×1080` | `Win32_VideoController` = 1920×1080 | ✔ |
| display dpi / scale | `96` / `100` | 注册表 `AppliedDPI` = 96；`round(96/96×100)=100` | ✔ |
| disk.mount / total | `D:\` / `997047988224` | `Win32_LogicalDisk('D:').Size` = 997047988224 | ✔ 精确 |
| disk.free_bytes | `726036467712` | 现测 726035443712（≈1 MB 漂移，磁盘可用量随时间变化，允许） | ✔ 合理漂移 |
| runtime.node / pnpm | `v24.17.0` / `11.15.1` | 冻结 D 盘 `node --version`=v24.17.0；`pnpm --version`=11.15.1 | ✔ |

**每个可独立核验的字段都与本机事实相符**，无一处矛盾。

### 3.2 无硬编码机器值（BLOCKER 排查）

源码级 grep：`i5-9400F`、`17119330304`、`997047988224`、`2904`、`19045`、`1920`、`1080` 等**本机实测值在 `src/`、`scripts/` 中零命中**。唯一数字字面量是 `96`（标准 DPI 基准，用于 `round(dpi/96×100)` 缩放换算，属通用 Windows 常量而非本机测量值）与校验下界 `24/25/1/0`。所有实测量（OS/CPU/内存/分辨率/磁盘）均来自 `os` 模块或 CIM 探针。**不存在硬编码，BLOCKER 条件不成立。**

### 3.3 仓库外重跑采集器（是否真读系统）

在冻结 Node 下重新执行 `collectMachineEvidence("D:/wenshu",...)`，与已提交证据逐字段比较：**除 `recorded_at` 与 `disk.free_bytes` 外完全相同**（`recorded_at` 为新 ISO 时间戳，`free_bytes` 漂移 ~1 MB）。这证明采集器确实读系统且已提交证据是其忠实产物，而非静态编造。

### 3.4 锚点三方一致

独立重算两个 manifest 哈希，与证据 `frozen_inputs` 及源码承重常量三方比对：

| 锚点 | 独立重算 | 证据值 | 源码常量 |
|---|---|---|---|
| fixture manifest | `97e05a1c…72017` | 同 ✔ | `@wenshu/fixtures` `FIXTURE_MANIFEST_SHA256` 同 ✔ |
| font manifest | `2952b96f…684721` | 同 ✔ | `@wenshu/fonts` `FONT_MANIFEST_SHA256` 同 ✔ |

Node/pnpm 与 `toolchain.versions.json`（node 24.17.0 / pnpm 11.15.1）、根 `engines`/`packageManager` 一致。

### 3.5 隐私零泄漏（承重性）

证据封闭键内无 hostname/username/MAC/序列号/IP/绝对用户路径字段。集成测试的 `JSON.stringify(evidence).includes(hostname())` 断言**真实承重**：我把本机 `hostname()`（`DESKTOP-9JR98DS`）注入 `cpu.model` 后，该断言即命中（会使测试变红）；且封闭键在解析层拦截任何新增字段（`{...evidence, leaked_host}` → `ENV_EVIDENCE_INVALID`），双重堵住泄漏。清洁证据中 hostname 命中为 false（断言在正常路径通过）。

## 4. 采集边界与 fail-closed（任务书 §3）

- **显示探针只读、无注入**：`DISPLAY_PROBE_SCRIPT` 是固定常量字符串，经 `execFile("powershell.exe", ["-NoProfile","-NonInteractive","-Command", 固定脚本])` 执行；**无 `-Verb RunAs`、无写操作、无用户输入插值**（`machineLabel` 只进 `parseMachineEvidence` 受模式校验，从不进 PS 脚本；`repositoryRoot` 只用于 `join`/`statfsSync`/正则取盘符，不进 shell）。失败统一抛 `ENV_PROBE_FAILED` 且不回显 stderr；超时 30s、`maxBuffer` 有界。
- **探针失败 fail-closed**：`parseDisplayProbe` 对非 JSON、错误形状、非法值均 `ENV_PROBE_FAILED`，消息为固定文案不含系统错误原文。
- **非 Windows 分支**：`platform() !== "win32"` → `ENV_PLATFORM_UNSUPPORTED`（源码 + 集成测试结构均覆盖）。**本机为 Windows，Linux/darwin 拒绝路径未运行时实测，如实列为未执行项（§9）。**
- **副作用**：采集仅 `record` 脚本写 `artifacts/reference-machine/environment.json`；重跑确认无临时残留、无注册表/系统目录写入。

## 5. 契约决定性（任务书 §4）

### 5.1 边界输入（直接打 `parseMachineEvidence`）

31 组边界输入全部按预期：多余/缺失顶层键、子对象增/缺键、`120dpi@100%`（拒）/`120dpi@125%`（收）、`2^53` 字节（拒，非安全整数）/`MAX_SAFE_INTEGER`（收）、浮点/NaN/Infinity（拒）、空模型串（拒）、大小写/前导横杠/单字符标签（拒）、`free=total`（收）/`free=total+1`（拒）、子路径挂载（拒）、平台白名单、arch 白名单、node 缺 `v`/pnpm 带 `v`（拒）、非 ISO 时间戳（拒）、大写/63 位 SHA（拒）。

### 5.2 守卫变异（现有契约测试是否因正确原因变红）

仓库外把 `evidence.ts` 逐个守卫弱化后跑真实契约测试：

| 弱化的守卫 | 契约测试 | 命中用例 |
|---|---|---|
| 封闭键（`hasExactKeys`→恒真 / `requireRecord` 只判 `isRecord`） | **RED** ✔ | identity fields fail closed |
| schema_version / evidence_id | **RED** ✔ | identity |
| ISO 时间戳 / 标签模式 | **RED** ✔ | identity |
| 平台白名单 / arch 白名单 | **RED** ✔ | os/cpu/memory/runtime |
| node/pnpm 版本模式 | **RED** ✔ | os/cpu/memory/runtime |
| `dpi↔scale` 不变量 / `free≤total` / 挂载模式 | **RED** ✔ | display and disk invariants |
| frozen SHA 模式 | **RED** ✔ | frozen input anchors |
| `requireSafeInteger` 下界（min→-∞） | **RED** ✔ | os/cpu/memory/runtime |

**每个核心守卫都承重**；无"被其他分支代打而从未命中"的整守卫缺口。（子记录逐字段增/缺键未各自单测，但守卫函数已被 root 与 frozen 用例覆盖——登记为 NOTE `EN-N1`。）

### 5.3 `check-environment.ts` 锚点对账承重

复现 check 脚本决策（`parseMachineEvidence` + 锚点比对）于仓库外证据副本：

- 把 fixture 或 font 锚点**改一位** → `FAIL: anchors do not match` ✔；改成合法格式但错误的 `0×64` → 同样 FAIL ✔。
- **删除已提交证据** → 脚本 `readFile` 抛错被 try/catch 转 `ENV_EVIDENCE_INVALID`（源码 L17–25），**fail-closed 而非跳过** ✔。

## 6. 采样协议与预算诚实性（任务书 §5）

逐项对照 G0 [performance-budgets.md](../performance-budgets.md)：

- **9 个参考任务预算全部原文继承**：启动 ≤2s、打开项目 ≤3s、键入 p95 ≤100ms、局部重排 ≤1s、30 页重分页 ≤8s、30 页导出 ≤30s、页面检查 ≤5s、崩溃恢复 ≤10s、峰值内存软目标 ≤1GB——数字与 G0 逐一相同，**无静默改阈值、无新增阈值**。
- **稳定性预算继承**：10 次重复一致、2 秒反馈、取消后 2 秒内停止主要消耗。
- **20% 回归线原样继承**：`reference-machine.md` §3.6/§4 明确"退化超过 20% 即阻断……继承 G0 回归规则"；median/p95 + 原始数据留存一致。
- **未冒充"已通过"**：文档反复声明"当前均未实测""不宣布任何阈值已通过""任何'阈值已通过'的声明必须等到 PA-13/A-14 在 G1-14W 环境实测之后"——满足任务书对预算诚实性的核心要求。
- **采样协议可执行、无自相矛盾**：预热 1 次 + 10 次重复、median/p95、原始留存、噪声只加重复不改阈值，逻辑自洽。
- **Win10/Win11 边界清晰**：§2 明确本机是 Win10 开发基线机、**不是** PoC-A 预注册的 Win11 参考环境；PA-05/PA-13 正式测量须在 G1-14W 落实的 Win11 执行；"本文件不代表 Windows 11 环境已就绪"。**未暗示 Windows 11 已就绪或本机可正式测量。**

## 7. 门禁、依赖与范围（任务书 §6）

### 7.1 命令与计数（冻结工具链实跑）

| 命令 | 退出码 | 计数 |
|---|---|---|
| `pnpm environment:check` | 0 | `Environment check passed: wenshu-dev-primary evidence matches frozen anchors.`；契约 5、集成 1 |
| `pnpm test:layers` | 0 | `Test layer audit passed: 26 files classified.` |
| `pnpm test:contract` | 0 | 13 文件，**108/108** |
| `pnpm test:integration` | 0 | 4 文件，**19/19** |
| `pnpm typecheck` | 0 | **13** 包 `Done`（含 `tools/environment`），零 TS 错误 |
| `pnpm ci:job contracts` | 0 | 真实执行 `Environment check passed` |
| `pnpm ci:verify` | 0 | **8 作业全 PASS**；`Environment check passed` 在 contracts 作业内 |
| `pnpm verify` | 0 | 聚合 **164/164**；`Quality guardrails passed: 99 source/config files, 279 repository files.` |

### 7.2 门禁接线与互锁

- 根 `verify` 与 CI `contracts` 作业**都真实执行** environment 检查（非字符串存在）。
- **互锁部分成立**：从 `CI_JOBS.contracts` 删 `command("environment")` 或改标签 → `ci-runner.unit.test.ts` **变红**✔。**但**从根 `verify` 链删 `pnpm environment:check` 或删脚本 → 全套测试**仍绿**（见 `EN-01`）。CI 侧受保护，本地 verify 聚合链未受测试保护。
- **CI 仍 8 作业**，`.github/workflows/verify.yml` 在本范围零改动。

### 7.3 `.gitignore` 专项

- `environment.json` 被正确放行（跟踪），`artifacts/manual-baseline/*`、`tmp/`、`test-results/`、`artifacts/other/*` 仍被忽略。
- **G1-01 秘密/产物忽略未被削弱**：`.env`/`.env.*`/`*.pem`/`*.key` 仍在各处生效（含 `artifacts/reference-machine/secret.key`、`dump.pem` 实测仍被忽略），`.env.example` 仍放行。
- **但**（`EN-02`）`!artifacts/reference-machine/` 放行了整个目录：`artifacts/reference-machine/other.json`、`subdir/x.json` 变为**可提交**（旧 `artifacts/` 规则会忽略）；秘密扫描门禁提供纵深，故非安全洞，但比"仅放行 environment.json"更宽。

### 7.4 依赖、体量、真实性

- **零手写 `any`/抑制**：`tools/environment/` 命中 0。
- **体量护栏**：最大 `evidence.ts` 249、`collect.ts` 198、契约测试 127，均 < 生产 300/400、测试 300/500。
- **strict typecheck 全覆盖**：`tsconfig.include=["src","test","scripts"]`。
- **依赖**：`@wenshu/fixtures`、`@wenshu/fonts` 确被 import（`collect.ts`/`check-environment.ts` 引锚点常量）；**`@wenshu/test-support` 声明却未用**（`EN-03`）。lockfile 仅新增本 workspace importer，版本全来自 catalog，无第三方漂移。
- **集成测试真实**：调用真实 `collectMachineEvidence`（真实 `os`/CIM/`statfs`），不 mock 被测对象；契约测试不触系统状态。不涉数据库，无虚构真库。
- **零漂移/无冒充**：`docs/poc-a/fixtures/`、`assets/fonts/**`、Schema、生成物、workflow、`tools/fixtures`/`tools/fonts`/`tools/quality` 在本范围 `git diff` 全空；无性能实测冒充、无系统设置修改、无费用或外部发布。

## 8. 发现、归属与最迟关闭点

### MINOR

#### `EN-01`　根 `verify` 链的 environment 接线无测试
**定位**：`package.json` `verify` 脚本；缺失测试对照 [tools/fixtures/test/wiring.contract.test.ts](../../tools/fixtures/test/wiring.contract.test.ts#L20) 与 [tools/ci/test/ci-runner.unit.test.ts:28](../../tools/ci/test/ci-runner.unit.test.ts#L28)（fonts）。
**证据**：仓库外副本删除 `&& pnpm environment:check`（或整删 `environment:check` 脚本）→ `ci-runner.unit.test.ts` 及全套测试**仍绿**。对照：fixtures 有 `assert.match(scripts.verify, /pnpm fixtures:check/)`，fonts 有 `the root verification entry includes the frozen font gate`，environment **无**等价断言。
**影响**：任务书 §6 明确要求"在仓库外副本删除/改名该命令应被测试发现"。CI `contracts` 作业侧受互锁保护（删 `CI_JOBS.contracts` 的 environment 会变红），因此权威远程门禁**不能**被静默漏跑——故定 MINOR 而非 MAJOR；但本地 `verify` 聚合链的 environment 接线未受测试保护，且与两个既有先例不一致。
**建议**：仿 fonts，在 `ci-runner.unit.test.ts` 或环境契约测试中加一条 `assert.match(scripts.verify, /(?:^|&&\s*)pnpm environment:check(?:\s*&&|$)/)`。
**归属/最迟关闭点**：Codex；G1-14 收尾或最迟 PA-13 以其为基线前。

#### `EN-02`　`.gitignore` 放行整个 reference-machine 目录
**定位**：`.gitignore` `!artifacts/reference-machine/`。
**证据**：`git check-ignore` 显示 `artifacts/reference-machine/other.json`、`artifacts/reference-machine/subdir/x.json` **未被忽略**（可提交）；旧 `artifacts/` 规则会忽略。秘密文件（`.key`/`.pem`/`.env`）在该目录内仍被忽略。
**影响**：比声称的"仅放行 environment.json"更宽——任意非密文件可被误 `git add` 进该目录，而旧规则会拦。秘密仍被忽略且有秘密扫描门禁兜底，故 MINOR。
**建议**：改为仅放行单文件，例如追加 `artifacts/reference-machine/*` 再 `!artifacts/reference-machine/environment.json`。
**归属/最迟关闭点**：Codex；G1-14 收尾。

#### `EN-03`　声明未使用的依赖 `@wenshu/test-support`
**定位**：[tools/environment/package.json:21](../../tools/environment/package.json#L21)。
**证据**：`tools/environment/` 全目录（src/scripts/test）无 `test-support` 的 import；`@wenshu/fixtures`、`@wenshu/fonts` 则确被使用。
**影响**：违反任务书 §6"只声明直接使用的依赖"；同 G1-09 `CR-01` 的依赖诚实性家族（方向相反）。无运行时危害，MINOR。
**建议**：移除该依赖声明，或在确有计划用途时补 import 并说明。
**归属/最迟关闭点**：Codex；G1-14 收尾。

### NOTE

- **`EN-N1`**：os/cpu/memory/display/disk/runtime 六个子记录的封闭键"增键/缺键"无逐一用例；`requireRecord`/`hasExactKeys` 函数已由 root（`extra` 键）与 frozen（缺 `font` 键）用例覆盖，纵深防御无损。可补子记录用例以提升决定性。
- **`EN-N2`**：采样协议 §3.1 称把机器证据放入批次目录 `artifacts/perf/<date>-<task-id>/`，但 `pnpm env:record` 固定写 `artifacts/reference-machine/environment.json`；且 `artifacts/perf/*` 被 `.gitignore` 忽略，原始批次数据本地留存但不入库。与 G0"保存原始数据"（留存≠提交）一致、不自相矛盾，留待 PA-13 采样工具落地时明确证据入库策略。

## 9. 未执行项与限制

- **非 Windows 拒绝路径未运行时实测**：本机为 Windows，`ENV_PLATFORM_UNSUPPORTED`（linux/darwin）分支仅由源码与集成测试结构覆盖，未在真实 Linux 上执行，如实记为未执行，不冒充已验证。
- **显示源与采集器共享**：分辨率/DPI 的独立取证（CIM `Win32_VideoController` + 注册表 `AppliedDPI`）与采集器读取的是**同一 OS 真源**——显示只有一处系统真值，无法用完全无关的第二源交叉；已用注册表原值与 CIM 分别确认得 96/1920/1080，并如实说明此共享。
- **磁盘可用量随时间漂移**：`free_bytes` 在证据记录后持续变化，只核验其 `≤ total` 且量级合理，不要求逐字节一致。
- **未执行 `pnpm install --frozen-lockfile`**（会改写 `node_modules`）；lockfile 漂移改用 `git diff` 核验。未 push、未触发 Actions。
- 本报告只签署事实，不提供也不应用补丁，不修改路线图。

## 10. 最终结论

**`CONDITIONAL PASS`**

任务书 §7 否决线逐条不成立：

1. **机器证据与本机独立事实相符**：CIM/注册表逐项对账全部吻合（disk free 合理漂移除外）；仓库外重跑采集器除时间戳/可用量外与已提交证据完全相同。
2. **无硬编码机器值**：实测量零命中于 src/scripts，仅有通用 96-DPI 基准与校验下界。
3. **证据不可伪造而通过**：契约每个核心守卫经变异测试承重；`check-environment.ts` 锚点改一位即 FAIL、缺证据即 fail-closed。
4. **未静默改 G0 预算、未冒充阈值通过**：9 项预算 + 稳定性 + 20% 回归线原文继承，反复声明未实测。
5. **无隐私字段**：封闭键堵新增字段，零泄漏断言承重。
6. **CI 门禁不可绿色漏跑**：CI `contracts` 作业侧互锁（删即变红）；根 verify 侧接线无测试（`EN-01`，MINOR，但 CI 仍强制执行）。
7. **`.gitignore` 未削弱秘密/产物保护**：秘密模式各处仍生效；目录放行偏宽为 `EN-02`（MINOR，非安全洞）。

同时：`pnpm verify` 退出 0、164/164、99 源码/配置 + 279 仓库文件过护栏、26 测试文件分层、13 包 strict typecheck；零 `any`/抑制；lockfile 无第三方漂移；PoC-A 原件/字体/Schema/生成物/workflow 零漂移；无系统设置修改。

放行附带条件：`EN-01`、`EN-02`、`EN-03` 三项 MINOR 按 §8 归属与最迟关闭点整改，由独立审计角色复核关闭；`EN-N1`/`EN-N2` 为 NOTE。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具。审计者不修改路线图、不自行标记 G1-14 完成、不自行关闭发现；是否将 G1-14 记为完成、PA-13/A-14 是否可以其为基线，由 Codex 依本报告更新台账后决定。
