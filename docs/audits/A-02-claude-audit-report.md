# A-02 Claude 独立审计报告（首审）

> 审计对象：`A-02` 新建/打开项目与只读导入流程（R-UX/R-DATA）。分支 `a-02-project-import` 头 `4183442`，PR #55 **未合入**（`origin/main` = `e03bb26`）。
> 审计方法：自建对抗探针直打真实 Host 入口（路径泄漏、handle 重放、选择后漂移、作用域越界）+ 契约层敌意值 + 注册表版本形态实测 + 代码走查。审计只新增本报告一个文件。
> 审计环境：Win10 `wenshu-dev-primary`，D 盘冻结 Node v24.17.0。

## 1. 结论

> **⚠ 本节 MAJOR-1 已于复审撤销——归因错误在审计者。见 [§6 复审记录](#6-复审记录2026-08-04--major-1-撤销)。** 首审正文原样保留以存档。

**CONDITIONAL PASS —— 无 BLOCKER；一项 MAJOR 须在合并前关闭。**

**ADR-0029 ①-a 这条最容易破的红线守住了，而且守得比我要求的严**：真实 `file.import.select` 输出里没有任何路径成分，handle 一次性、跨作用域不可用，甚至连我没要求的"选择后内容漂移"都做了 fail-closed。MAJOR 出在 ①-b 的版本形态上——`0.2.0` 注册表现在把 `file.import.select` 登记成了 `supported/0.3.0`，这是对已签署冻结协议的静默语义变更。

## 2. 我独立坐实的部分（探针直打真实入口）

**①-a　输出零路径成分** —— 真实 `file.import.select` 返回：

```json
{"files":[{"grant_id":"grant_bad33091…","file_name":"报告.md",
          "content_sha256":"fb9cc786…","size_bytes":17}]}
```

绝对路径、临时根目录、`\`、`/` **一个都不在输出里**；`报告.md` 是 `FileDisplayName` 约束下的显示元数据，不含分隔符。**这条红线成立。**

**借 `file_name` 走私路径 —— 全拒**（喂 0.3.0 输出 schema）：

| 载荷 | 结果 |
|---|---|
| `C:\x\y.md` / `/etc/passwd` / `..` / `a:b` | `HOST_PLATFORM_FIELD_FORBIDDEN` |
| `.` | `HOST_PAYLOAD_SCHEMA` |
| `报告.md`（合法 CJK） | 正确接受，无误杀 |

**handle 生命周期与作用域 —— 我提的两个反例都过了，还多守一层**：

```text
一次性     第一次读 -> ok 17B      重放 -> refused NOT_FOUND      （consume-on-read）
漂移       选择后改内容再读 -> refused INTEGRITY_FAILURE           （TOCTOU，我未要求）
作用域     file grant 当目录 grant 用 (project.save.as) -> HOST_NOT_FOUND
```

`readGrantedFile` 是**先吊销再读**、读取不离开钉定路径，文件 grant 与目录 grant 分属两张表——设计对，实测也对。

**①-c　选择器只在 L3** —— `selectFiles` 由壳注入，未注入时能力 fail-closed；核心侧只见 handle。

## 3. MAJOR-1　`0.2.0` 注册表把 `file.import.select` 登记成 `supported/0.3.0`

- **我的实测**：

  ```text
  buildPayloadHostRegistry({ protocolVersion: "0.2.0" })
     -> validateHostContract: valid
     -> file.import.select: support_status=supported, capability_version=0.3.0
  buildPayloadHostRegistry({ protocolVersion: "0.3.0" })
     -> file.import.select: supported/0.3.0
  ```

  两者对该能力的登记**完全相同**——`protocolVersion: "0.2.0"` 并没有产出一个"纯 0.2.0"的注册表。

- **与冻结契约的冲突**：[host-contract §5](../host-contract.md) 明写「同一协议版本只能做不改变既有语义的实现修复；**不能静默把 degraded/unsupported 当作 supported**」。`file.import.select` 在 PB-10 签署的 `0.2.0` 里是 `unsupported`（`reason_code: PB10_PAYLOAD_UNFROZEN`）——我在 PB-10 审计时逐条核过。现在同一个 `0.2.0` 说它 `supported`，正是该条禁止的形态。
- **与 ①-b 裁定的冲突**：任务书 ①-b 要求的决定性测试是「**既有 0.2.0 注册表（把 `file.import.select` 登记为 `/0.1.0` 占位）仍须校验通过**」。现在 builder **根本不再产出那个形态**，该测试若照抄裁定文字就无从构造，若照现状写就变成了给缺陷背书。
- **失效方向**：不是 fail-open。0.2.0 消费者若按 `capability_version: "0.2.0"` 调用，会因 `declaration.capability_version !== value.capability_version` 得到 `INVALID` 失败终态——**能力上是关着的**。问题在**表述**：注册表向 0.2.0 消费者广告了一项它无法调用的能力。故判 MAJOR 而非 BLOCKER。
- **修复方向**（任选，须书面裁定并写进 ADR-0029）：
  1. `protocolVersion: "0.2.0"` 时让 `file.import.select` 回到 `/0.1.0` 占位（`unsupported`），仅 `0.3.0` 注册表登记为 supported——然后 ①-b 的决定性测试可按原文构造；
  2. 或书面裁定"0.2.0 注册表可含 0.3.0 能力"并修改 host-contract §5 的措辞与 ADR-0025 §1 的对应表述——**这属于改动已签署契约的语义，须业主批准**，不接受实施者自决。

无论哪条，都要补一条决定性测试钉住选定语义（变异 → 变红）。

## 4. 待补核（本轮未做完，如实登记）

我的探针预算用在了红线上，以下几项**尚未由我独立复核**，复审时补：

- **原件哈希不变**在取消 / 部分失败 / 权限拒绝三条异常路径上的字节级比对（我承诺过要各做一次）；
- A-01 冻结契约四态是"消费契约"还是"另写一遍"；
- `A-01-followups #2`（`types:["node"]`）的明确表态是否到位；
- 承接项归属三类分法是否越权关闭；
- 决策 #15 ↔ ADR-0029 互引；
- CI 侧 `permission-denied` 的 `chmod 0o555` 实证（业主已提供日志摘录，我未独立核 CI）。

**本报告的 `CONDITIONAL PASS` 仅覆盖 §2 已坐实项与 §3 这一条 MAJOR**；§4 各项在复审补齐前不构成"已审计通过"。

## 5. 交接与关闭条件

- **MAJOR-1 由 Codex 修复，由我复审关闭**；若走修复方向 2，须**业主书面批准**后方可动 host-contract §5 与 ADR-0025 的表述。
- **PR #55 在复审签署前不合入**。
- 审计报告落盘的**同一轮**补 §3.1 台账 `A-02` 行（检查 8a 会拦），状态如实写；合并后按 [AGENTS 台账证据指纹规则](../../AGENTS.md) 用 `main` 上的合入 SHA。
- 复审时我会重跑 §2 全部探针（不回潮）+ MAJOR-1 的版本形态实测 + §4 六项补核。

---

*本报告由独立审计角色出具；台账与代码修复由实施者完成。审计期间仅新增本文件。*

---

# 6. 复审记录（2026-08-04）· MAJOR-1 撤销

## 6.1 结论

**MAJOR-1 撤销——归因错误在审计者，不在实施。** 首审 §3 的判定不成立，实施侧当时并无该缺陷。

## 6.2 我错在哪（实测三条，逐条对我不利）

```text
payloadRegistryVersion: "0.2.0"   -> protocol=0.2.0 | import.select = unsupported / 0.1.0
                                     schema id = wenshu.host.input.file.import.select/0.1.0
                                     全文不含 "/0.3.0"          ← 恰为 PB-10 签署占位形态
(不传，默认)                        -> protocol=0.3.0 | import.select = supported / 0.3.0
protocolVersion: "0.2.0"（我首审用的） -> THREW: Unknown payload registry option: protocolVersion
```

我另核了 `git show origin/main:packages/host-contract/src/registry-builder.ts` 的选项接口：**`protocolVersion` 在 PB-10 签署版与当前分支都从不存在**，合法键自始是 `payloadRegistryVersion?: "0.2.0"`。

我传了一个不存在的键，JS 对未知属性静默忽略，builder 落到默认 0.3.0 构建——我却把那个结果当成"0.2.0 注册表"并据此判定契约被静默改写。**观察是真的，结论是假的**：我从头到尾就没有构造出一个 0.2.0 注册表。①-b 的决定性测试自 `deaf1a7` 起即按裁定原文构造并通过，我首审说它"无从构造"同样不成立。

同类错误本轮我已犯第三次（管道吞退出码、CRLF 变异未落盘、本次未知选项键静默忽略），共同形态是**拿未经确认的调用结果当结论**。这一条我此前建议实施者写进权威文件，现在看更应该先约束我自己：**下断言前先确认 API 契约与改动确已生效**。

## 6.3 但暴露的缺口是真的，修得也对

实施侧没有停在"审计者搞错了"，而是把**未知选项键静默忽略**这一根因结构性堵死。我实测：

| 输入 | 结果 |
|---|---|
| `protocolVersion`（我首审那个） | **THREW** `Unknown payload registry option: protocolVersion` |
| `payloadregistryVersion`（大小写误写） | **THREW** |
| `version` | **THREW** |

**我那次误探的形态现在不可能再发生。** 这是比"驳回审计者"更好的处置——把能产生假象的通道关掉，而不只是证明这次没事。

## 6.4 MINOR-1（复审新增，小）：合法键 + 非法值仍静默降级

```text
payloadRegistryVersion: "0.1.0"（合法键、非法值）
   -> 不抛错，落到 protocol=0.3.0，import.select=supported/0.3.0
```

类型上 `?: "0.2.0"` 会在编译期挡住，但运行期（JS 调用方、JSON 配置、`as` 断言）会**静默升到更新的协议**——与刚修掉的键级静默忽略是同一类，只是发生在值轴上。建议把 fail-closed 从键扩到值（未知值即抛），并补一条决定性测试。**小改动，不阻断合并**，但既然键级已经收口，值级留着不对称。

## 6.5 首审 §4 六项仍未补核

本轮预算用在 MAJOR-1 的复现与撤销上，[§4](#4-待补核本轮未做完如实登记) 六项**仍未由我独立复核**：原件哈希不变在三条异常路径的字节级比对、A-01 契约消费方式、`A-01-followups #2` 表态、承接项归属、决策 #15 ↔ ADR-0029 互引、CI 侧 `permission-denied` 实证。

**当前签署状态：`CONDITIONAL PASS`，唯一未关闭项为 MINOR-1；但 §4 六项在补核完成前不构成"已审计通过"**——其中"原件哈希不变"是 A-02 唯一的停止条件级要求，未经独立复核不应合并放行。请安排下一轮补核。

---

# 7. 第二次复审记录（2026-08-05）· §4 六项补核

## 7.1 本轮方法与环境（先声明，便于反查）

审计对象未变：分支 `a-02-project-import` 头 `55b1dab`，PR #55 未合入。本轮**只新增本节**，不改任何生产代码、测试、Schema、契约数据。

方法上有一条自我约束，针对我前两轮共同的失败形态（拿未经确认的调用结果当结论）：

> **任何"绿"在被我用作证据之前，必须先由一次变异证明它会因为正确的原因变红。** 断言本身是被审对象，不能拿它证明它自己。

本轮共执行 8 次变异 / 探针（M1、M2、M2′、M3、M4、C1、C2、P1、V1、S1），**全部改回，改回后逐文件 sha256 与 HEAD 逐位一致，`git status` 干净**；场景 bundle 亦重建回同一哈希 `e22bfbc4…`。

**两项环境如实披露：**

1. **本机 Node 为 `v24.13.0`，不是参考机器登记的 `v24.17.0`**（`package.json` engines 亦锁 24.17.0，pnpm 每次调用都打 `Unsupported engine` WARN）。本轮全部复跑都在 24.13.0 上完成。我另核了 `pnpm environment:check`：它**通过**——因为它校验的是已提交证据文件与 fixture/font 冻结锚点，**不校验活动解释器版本**。这不是 A-02 的缺陷（归口 G1-14），但它意味着"参考机器复跑"这句话在本轮含一处版本偏差，据此登记。
2. 我上一轮曾在 §6 之后重建过场景 bundle。本轮为此专门重跑了一次**从纯净提交源重建 bundle** 的基线，确认基线 5 pass + 1 诚实 skip 成立，再开始变异。

## 7.2 原件哈希不变 —— 五条路径 + 断言变异自证（**坐实**）

**基线**（纯净源重建 bundle）：`happy` / `partial` / `cancel` / `target-exists` / `handle-reuse` 五例通过，`permission-denied` 诚实 skip，0 失败。

**变异阶梯**（每次只动一处，跑全套六子场景）：

| # | 变异 | 结果 | 判读 |
|---|---|---|---|
| **M1** | 把 materials 副本写路径指向 grant 根下的**源原件**，`assertWithinTemp` 保持在位 | happy/partial/handle-reuse 三例红：`importProject: error INTERNAL` | 写路径承重守卫（[project-import.ts:78-83](../../packages/markdown-import/src/project-import.ts#L78-L83)）**结构性拦住**了越界写；cancel/target-exists 不受影响（尚未进入写阶段），符合预期 |
| **M2** | M1 + 把 `assertWithinTemp` 改成恒通过 | 三例红，但红在 `assertImportedLayout`（materials 副本缺失） | **错因红，作废**——源确实被改了，但测试死在更早的断言上，不能拿来证明 `assertSourcesUnchanged` |
| **M2′** | 保持布局完全正确，**另加**一条写覆盖源原件；守卫恒通过 | 三例红，全部落在 [a-02-project-import.e2e.test.ts:124](../../apps/electron-shell/test/a-02-project-import.e2e.test.ts#L124)：`source file mutated in place: report.md`，且**在全部布局断言通过之后** | **决定性**：该断言确实探测到真实的原地改写 |
| **M3** | 保持 M2′ 的覆盖，把断言改成恒真（`after = before`） | **5 pass 0 fail**（源已被真实改坏） | **该断言是全套件唯一的探测者**；顺带暴露 cancel 例的 `t.diagnostic` 仍打印"sources unchanged"——诊断文本不是证据 |
| **M4** | 编排器在**每个**子场景跑完后改坏一个真实源字节 | **五例全红**，全部落在 `:124`；cancel 例显示的是 `CANCEL_MD` 自己的哈希 | 五条路径各自的 `assertSourcesUnchanged` **都真实生效、都对准真实 workdir**（不是同一份缓存） |

**结论：`assertSourcesUnchanged` 承重且逐路径在岗；`assertWithinTemp` 是其上游的结构性守卫，本身亦承重。** A-02 唯一的停止条件级要求，在 5 条可本机执行的路径上由我独立坐实。第 6 条见 §7.6。

## 7.3 取消终态如实性（**坐实**）

上一轮我在这里判读不可靠（自己的兜底逻辑把 cancelled 印成 success）。本轮不走测试的兜底分支，改为**自建编排器直读原始终态对象**——fixture 逐字消费项目自己的 `CANCEL_MD` / `PNG1_BYTES` / `buildBulkBytes(32 MiB)`，不自造 markdown。

探针 C1（临时在场景里把通道原始返回值原样带出报告）实测：

```json
"auditRawResult": { "keys": ["import_id", "status"],
                    "json": { "import_id": "32f9fa90-…", "status": "cancelled" } }
"outcome": "cancelled", "cancelChannel": "cancel_requested", "progressEvents": 2,
"trajectory": ["empty-project", "importing", "project-view:import-cancelled"]
```

原始载荷**恰好两个键**：既无 `documentSha256`，也无 `code`。目标 `report-c` 不存在，workdir 只剩三个源文件，三者哈希全部 UNCHANGED。**取消是一等终态，没有被伪装成失败，也没有被伪装成成功。**

变异 C2（让主进程通道在 cancelled 时附一个 `code: "CANCELLED"`）：链环 `cancel-import` 立刻红，报错原文即 [project-import-abort.ts:79-82](../../apps/electron-shell/scenario/project-import-abort.ts#L79-L82) 那句"a cancelled import must carry neither a document digest nor an error code"，exit 1，轨迹停在 `importing` 不再推进。**该诚实性断言承重。**

## 7.4 MINOR-1（值轴 fail-closed）—— **关闭**

直打真实 builder 实测（`instance_id` 用合法形态，避免上一轮那种自伤探针）：

```text
payloadRegistryVersion: "0.2.0"   -> protocol=0.2.0  import.select=unsupported/0.1.0  全文不含 "/0.3.0"
(不传，默认)                       -> protocol=0.3.0  import.select=supported/0.3.0
"0.1.0" / "0.3.0" / "2.0.0" / "" / "0.2.0 "（尾空格）/ "0.2" -> 全部 THREW  Unknown payload registry version
null / 0.2（数字）/ ["0.2.0"] / {toString:()=>"0.2.0"}        -> 全部 THREW
protocolVersion / payloadregistryVersion / version（键轴）    -> 全部 THREW  Unknown payload registry option
```

变异 V1（停掉值轴守卫）→ 决定性测试 [host-v0-3.contract.test.ts:194](../../packages/host-contract/test/host-v0-3.contract.test.ts#L194) 红（`Missing expected exception: illegal version "0.1.0" must throw`），改回 14/14 绿。**MINOR-1 关闭。**

顺带第三次独立确认 MAJOR-1 撤销成立：真正的 0.2.0 注册表产出的**就是** PB-10 签署的 `/0.1.0` 占位形态，全文不含 `/0.3.0`。

### MINOR-2（本轮新增，信息级，不阻断）

键轴守卫用 `Object.keys(options)`（[registry-builder.ts:271](../../packages/host-contract/src/registry-builder.ts#L271)），只看**自有**属性；值轴守卫用属性读取，会走原型链。两者不对称：

```text
Object.create({ protocolVersion: "0.2.0" }) 作为 options  -> 未抛错，落默认 0.3.0 注册表
Object.create({ payloadRegistryVersion: "0.1.0" })        -> 正确抛错（值轴读原型链）
```

即**我首审那次误探的形态，经原型链投递仍然可以静默发生**。两个真实调用点（[apps/web/src/host.ts:56](../../apps/web/src/host.ts#L56)、[file-host.ts:117](../../packages/project-storage/src/file-boundary/file-host.ts#L117)）都传对象字面量，现实风险极低，故只作登记。若要收口，把键轴循环换成 `for...in` 即与值轴同语义。

## 7.5 A-01 冻结契约四态：**是消费，不是另写**（坐实）——但暴露 MINOR-3

**消费成立。** [import-flow.ts:270-281](../../packages/ux-state/src/import-flow.ts#L270-L281) 直接把 `getUxStateFrom(data, stateId)` 取到的 `requiredPresentation` / `forbiddenSemantics` / `a11y` 原样装进视图，`data` 默认即 `UX_STATES_DATA` = 解析后的 `states-1.0.0.json`。E2E 与单测的"逐字对账"都是拿视图比**同一份**磁盘文件。我改动冻结 JSON 后四态视图随之改变、对账仍绿——这正是单一真源该有的表现。**A-02 未发明第 13 态，冻结文件在本分支字节未改**（`git diff origin/main...HEAD` 为空；该文件全仓仅 A-01 一次提交）。

### MINOR-3（本轮新增，小）：冻结 1.0.0 的内容锚定不完整

正因为"逐字对账"对同一真源是恒真的，防止 1.0.0 被静默改写只能靠**内容钉定测试**。我逐条变异实测（每次只在一个字符串值内部插一个字符，不动任何结构不变量），四态的钉定覆盖如下：

| 字段 | empty-project | importing | import-partial | permission-denied |
|---|---|---|---|---|
| `requiredPresentation` | 锚定 | **未锚定** | **未锚定** | **未锚定** |
| `forbiddenSemantics` | 锚定 | 锚定 | 锚定 | 锚定 |
| `a11y.textEquivalent` | **未锚定** | **未锚定** | **未锚定** | **未锚定** |
| `a11y.focusEntry` | **未锚定** | — | **未锚定** | **未锚定** |
| `label` | **未锚定** | **未锚定** | **未锚定** | **未锚定** |

以 `importing.requiredPresentation` 的 **"原文件只读"**（A-02 红线的用户可见表述）为例，把它改成 "原文件只读×" 之后：

```text
unit 层     327/327 绿
contract 层 254/254 绿
A-02 E2E    5 pass + 1 诚实 skip，0 失败   （已重建 bundle，确认 bundle 内确为变异后字符串）
```

**全仓无一处变红。** `apps/web/test/flow.unit.test.ts:176` 虽然出现该字面量，但它自建视图对象、钉的是"逐字搬运"，不读冻结文件——与 A-01 实施记录 M1 的自述一致。

判读与归口：**A-02 本身合规**（没改、也守了 additive 纪律），这是 A-01 已修过一次的同类缺陷（A-01 复审把 `forbiddenSemantics` 12 态钉死）在相邻字段上的残留。但 A-02 是第一个消费者、任务书 §5 又明确要问"有没有静默改 1.0.0 语义"，故在此登记：**当前没有任何机械手段阻止 1.0.0 被静默改写**，包括 A-02 红线那一条。建议按 A-01 处理 `forbiddenSemantics` 的同款做法补钉（纯增测试，不动冻结数据），归口由业主裁定（A-01 契约加固 / A-13）。不阻断 A-02 合并。

## 7.6 承接项归属三类分法：**无越权代签**——但 MINOR-4

**决定性证据：本分支未触碰任何 followups 文件。** `git diff --stat origin/main...HEAD -- docs/audits/*followups*` 为空；全部 8 处文档改动是 A-02 自己的新文件 + `implementation-roadmap.md` 的 §3.1 一行。

逐条核对 [A-02-implementation-record.md §5](A-02-implementation-record.md) 与任务书 §6 三类口径：

| 类别 | 任务书 | 记录 | 判读 |
|---|---|---|---|
| 由 A-02 关闭（4） | PB-11 #4/#6、A-01 #1/#3 | 同 4 项，逐项给了处置依据 | 一致 |
| 遵守但不构成关闭（3） | A-01 #2、A-01 #4、PB-10 #1 | 同 3 项；PB-10 #1 明写"条目已由 PB-12 关闭，不再关一次" | 一致，**未再关一次** |
| 明确不归 A-02 | PB-12 N2/N3、PB-11 #1/#2/#7、PB-10 #4 | "未触碰" | 一致，**未代签**（文件零改动可佐证） |

抽验两条关闭依据（不止读自述）：

- **A-01 #3**：[apps/web/src/host.ts:71-88](../../apps/web/src/host.ts#L71-L88) 确将 `file.import.select` 登记为 `unsupported` + `reason_code: BROWSER_HOST_NO_IMPORT_PIPELINE`，与记录一致。
- **A-01 #1**：我自己重跑生产构建，产物 **12,351 字节**（与记录声称的数字逐位一致），`ajv` 命中 **0**，且冻结义务字符串确实在包内（说明是真改道，不是把数据也一并剪掉）。

### MINOR-4（本轮新增，流程级，合并前应处理）

先例是**就地标注**：PB-12 在 `PB-11-followups.md §3` 写了"处置（2026-08-01，PB-12）：已消费，关闭"，A-01 在 §4/§6 写了"不代签关闭"。A-02 声称关闭的 4 项，**上游条目至今没有任何处置注记**——`PB-11-followups.md` §4/§6 仍写着"关闭仍归 A-02/A-11"。关闭目前只存在于 A-02 自己的记录里。不是越权（方向相反，是漏登），但若就此合并，这 4 项在承接项台账上会永远显示为未关闭。建议在合并前按先例补注记。

## 7.7 CI 侧 `permission-denied`：能力边界如实标注 + 本机等价路径实证

**这条我本机跑不到，且不打算用"CI 绿了"含糊过去。** 我把 skip 的成因查清楚了，它是真的，不是探针假象：

```text
icacls <dir> /deny *S-1-1-0:(W)   -> 成功写入 ACE（icacls 列表可见 Everyone:(DENY)(W)）
node mkdir(<dir>/.a02-probe)       -> 仍然成功           ← 测试据此 skip，判断正确
node mkdtemp(<dir>/report-d.wenshu-import-) -> 也成功    ← 真实导入确实会继续往下写
```

即本机该进程的令牌确实绕过该 deny ACE，**测试选择诚实 skip 而不是伪造拒绝，是正确处置**。我另试了针对当前用户 SID 的 deny（首次调用因缺 `*` 前缀而未生效，属我的操作失误，已识别并作废该次读数）。

**我能在本机行使的等价路径**：`read_only` grant 的 PERMISSION_DENIED 分支。已有集成用例 [project-import-failures.integration.test.ts:41](../../packages/markdown-import/test/project-import-failures.integration.test.ts#L41) 覆盖，且我用变异 P1（摘掉 [project-import.ts:109-111](../../packages/markdown-import/src/project-import.ts#L109-L111) 的 grant 模式守卫）验证其承重：**恰好该一例红**（`Missing expected rejection`），其余 7 例不动；摘掉守卫后导入**径直成功**，说明这道检查是该路径上唯一的闸门。该用例同时做了 grant 根为空 + 源文件哈希前后比对。

**边界声明（请业主知悉）**：`read_only` grant 与 CI 的 `chmod 0o555` **不是同一条代码路径**——前者在第 2 步 grant 边界即拒（尚未碰文件系统），后者是 grant 为 read_write、由 `mkdtemp` 触发 EPERM 后经 `classifyFsError` 归一。两者共享的是同一个 `assertWithinTemp` 写路径守卫（M1 已证承重），因此"该路径改坏原件"在结构上被同一道闸门覆盖；但**该路径的原件字节不变，只有 ubuntu CI 证据，未经我独立复核**。远程 run 一直在我的独立核验能力之外，这条边界自 PB-12 起未变。

## 7.8 §2 通过项零回潮抽验

重跑首审 §2 的 ①-a 走私攻击（喂 0.3.0 输出 schema，先用合法 CJK 作对照确认探针有效）：

```text
"报告.md"（对照）                                  -> ACCEPTED
C:\x\y.md / /etc/passwd / .. / a:b / UNC / file:// / NUL -> HOST_PLATFORM_FIELD_FORBIDDEN
. / sub/a.md / sub\a.md                            -> HOST_PAYLOAD_SCHEMA
```

与首审表逐格一致，**无回潮**。另：本轮 unit 327/327、contract 254/254、host-contract 14/14、markdown-import 失败路径 8/8、A-02 E2E 5 pass + 1 skip，全绿。

> 方法自查：本节探针第一版因调用签名写错（把 capability/direction/version 当参数传），把**合法 CJK 对照也判成了拒绝**——对照组一起变红即探针失效的信号，据此识别并重写，未把错误读数写进结论。这正是 §7.1 那条自我约束要拦的东西。

## 7.9 结论与签署

**签署：`PASS`。** 无 BLOCKER，无 MAJOR，无未关闭的阻断项。

- 首审 §4 六项**已全部补核完毕**：原件哈希不变（§7.2，五路径 + 四道变异自证）、取消终态（§7.3）、A-01 契约消费方式（§7.5）、承接项归属（§7.6）、`A-01-followups #2` 与决策 #15 ↔ ADR-0029 互引（上轮已核，本轮不重复）、CI 侧 `permission-denied`（§7.7，如实标注为能力边界）。
- MINOR-1 已关闭（§7.4）。
- 新增 **MINOR-2 / MINOR-3 / MINOR-4**，均**不阻断合并**，建议登记为承接项：

| 项 | 性质 | 建议归口 |
|---|---|---|
| MINOR-2 原型链上的未知选项键仍被静默忽略 | 信息级，无真实调用点受影响 | A-02 或后续，随手收口即可 |
| MINOR-3 冻结 1.0.0 的 `requiredPresentation`/`a11y`/`label` 无内容锚定 | 小；A-02 合规，属 A-01 同类残留 | 业主裁定（A-01 契约加固 / A-13） |
| MINOR-4 4 项承接项未按先例在上游就地标注关闭 | 流程级 | **合并前补** |

**合并放行意见**：就 A-02 的技术内容而言我不再持有保留意见；建议在补齐 MINOR-4 后合并。唯一需要业主自行承担判断的是 §7.7 那条——`permission-denied` 路径的原件不变是路线图 A-02 完成证据之一，而它只有 CI 证据、未经审计者独立复核。

---

*本节由独立审计角色出具。本轮仅新增本文件的 §7；全部变异均已改回并逐文件 sha256 校验与 HEAD 一致。*
