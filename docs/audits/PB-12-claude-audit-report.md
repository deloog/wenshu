# PB-12 Claude 独立审计报告（首审）

> 审计对象：`PB-12` 真实 E2E 与 PoC-B 闸门报告（R-TX/R-DATA/R-TEST）。分支 `pb-12-e2e-gate` 头 `6eb6224`，PR #52 **未合入**（`origin/main` = `f5ea07c`）。
> 审计方法：真机跑真 Electron E2E + **自建对抗探针**（产品壳注入 `--wenshu-e2e`、超限载荷喂真实 Host）+ **失效方向变异** + Git 历史核门槛冻结顺序 + 承接项逐条对账。审计只新增本报告一个文件。
> 审计环境：Win10 `wenshu-dev-primary`，D 盘冻结 Node v24.17.0 / pnpm 11.15.1。

## 1. 结论

**FAIL —— 一项 MAJOR 未关闭，闸门暂不得签署，`A-01` 不得开工。** 无 BLOCKER。

需要说清楚的是：**这一棒的工程质量是迄今最高的一档**，链环真实性、强杀真实性、fake 边界、门槛冻结顺序、承接对账我逐项独立坐实，连最容易出事的"e2e 通道泄漏到产品壳"我亲手注入 flag 都没能撬开。唯一的 MAJOR 是一条**继承自 PB-10 冻结 Schema 的契约层崩溃**：在契约自己声明的载荷区间内，请求会以裸 `RangeError` 逃逸、**不产生任何协议终态**。实施者如实登记了症状（"~4 MiB 触栈上限，载荷取 2 MiB 规避"），但把它写成了测试载荷的取舍，没有写出后果；而闸门报告在此之上给出 `PASS` 建议。修复面很小，复审应该很快。

## 2. 我独立坐实的部分

| 项 | 我的独立结果 |
|---|---|
| E2E 真跑 | 我在本机跑 `pnpm test:e2e`：**8/8 pass, exit 0**（真 Electron 43.1.1，非 stub） |
| **入口真实性** | 编排器 `spawn(electronBinary, …)` 起真 Electron 进程；渲染进程经 preload 白名单 → IPC → `0.2.0` Host 协议；不是在 Node 里直接 import 各包函数。ADR-0027 §1 逐条列了与 A-12 全 UI E2E 的差异 |
| **强杀真实性** | `child.kill("SIGKILL")` + 断言 `killExit.signal === "SIGKILL"`；链环④三轮随机杀点后，恢复结果恒 ∈ {完整 V1, 完整 V2}；链环⑤杀在导入暂存期并断言孤儿被清理、`residueNames` 归零 |
| **e2e 通道未泄漏到产品壳（命门，我亲手撬）** | 我用产品入口 `main.cjs` **带 `--wenshu-e2e` 命令行**跑 reverify：`exposedKeys` 仍为 `["cancel","invoke","registry"]`、`require`/`process` 均 `undefined`、`sandbox: true`。主进程命令行不进沙箱 preload 的 `argv`，只有 `e2e-main.cjs` 的 `additionalArguments` 会——门开得住。`src/main.cjs` 本次零改动 |
| **门槛先于报告钉死** | Git 历史可证：ADR-0027 由 `e8eb5ac` 加入，闸门报告由 `23e7903` 加入（在后），且**ADR 此后再无任何提交触碰**——"门槛不得后移"成立。门槛本身也没有反向拟合：唯一的量化项 ≤10 s 来自既有[性能预算](../performance-budgets.md)，不是从实测倒推 |
| 结论枚举可表达非 PASS | ADR-0027 §4 明列 `PASS / CONDITIONAL PASS / DEGRADE / FAIL`，报告不是只能写 PASS |
| 最终指纹诚实 | 报告 §2 引的 run 覆盖 `fc270e0`，而 head 是 `6eb6224`——我核过 `fc270e0..6eb6224` **仅 1 行文档改动**，故 9/9 覆盖全部代码，不存在"用旧绿冒充新码" |
| 变异守卫（我复跑 M2） | 把 `IMPORT_TEMP_MARKER` 改成永不匹配 ⇒ **2 条孤儿断言变红**（31→29 pass/2 fail），基线 31/31。M1/M3/M4 我未复跑（见 §5 诚实说明） |
| fake 边界 | E2E 中只有 AI 计划为脚本化 `ToolRequest`；真库、真实文件、真实恢复、真实 Host 均未 mock |
| 供应链 | **零新增第三方包**（`vite` 早在 catalog 内，仅新增 requester）；SBOM 仅多一条 `requested_by` |
| 参考机器证据 | `environment.json` 重采于 `v24.17.0`——PB-10 MAJOR-4 的覆辙没有重蹈 |
| 治理面零夹带 | `AGENTS.md` 只改了 8→9 的作业数措辞，无状态/放行宣称（[评审清单 A](../review-checklist.md)）；eslint 改动是给 preload 声明一个**真实运行时全局** + 忽略构建产物目录，不是放宽规则 |
| 承接 12 项 | 逐条有 disposition：关闭 3、部分消费+转 A-15 1、转 A-15 2、维持 6，**无静默丢弃** |

## 3. MAJOR-1　契约自己声明的载荷区间内，请求以裸异常逃逸、不产生协议终态

- **定位**：[packages/host-contract/schema/host-payloads-0.2.0.schema.json](../../packages/host-contract/schema/host-payloads-0.2.0.schema.json) 的 `ContentBase64`（`maxLength: 89478488`，约 64 MiB 字节）+ [src/payloads.ts](../../packages/host-contract/src/payloads.ts) 的 Ajv 校验；消费点 [file-boundary/file-host.ts](../../packages/project-storage/src/file-boundary/file-host.ts) `invokeSerialized` 首行的 `validateHostContract(request)` **不在任何 try 内**。
- **我的独立复现**（两层，都是真实代码路径）：

  ```text
  validateHostPayload(file.export.write.input, …)
     1 MiB -> ok=true
     2 MiB -> ok=true
     4 MiB -> THREW RangeError: Maximum call stack size exceeded
     8 MiB -> THREW RangeError: Maximum call stack size exceeded

  真实 Host（createFileHost → invoke，project.save.as）
     2 MiB -> invoke resolved -> kind=success
     4 MiB -> invoke REJECTED with a raw exception: RangeError: Maximum call stack size exceeded
              => 该 request_id 从未产生任何协议终态；transcript 长度不变
  ```

- **为什么是 MAJOR**：
  1. 违反 [host-contract §3](../host-contract.md)「每个请求只能产生一个终态」——在 4 MiB–64 MiB 这一整段，终态数为 **0**；
  2. 违反 §4「原始系统错误…不得穿透」——`RangeError` 直接抛给调用方；
  3. 区间不是理论值：Host 注册表自报 `max_payload_bytes: 67108864`，PB-11 的单条目上限也是 64 MiB，**契约主动邀请了会崩的载荷**；
  4. 失效方向不是 fail-closed 而是"抛异常给上层自己猜"。
- **与闸门结论的关系（这才是本条判 MAJOR 的真正理由）**：闸门报告 §3 第 5 条把它写成"载荷取 2 MiB 规避"，读起来像测试取舍；实际是一条**签署契约在其广告区间内的崩溃路径**。PoC-B 的 R-DATA 承诺覆盖远大于 4 MiB 的材料，报告却在其上给出 `PASS` 建议——**闸门覆盖面被高估**。
- **修复方向**（任选，须书面裁定）：① 把 `ContentBase64` 的 `maxLength` 收到实测安全值并补回归测试；② 用非回溯校验（长度+字符集分段扫描）替换该正则，保住 64 MiB 广告值；③ 若维持现状，则必须**收窄闸门结论的适用范围**并经业主批准，同时在 host-contract 与注册表 `max_payload_bytes` 上把真实可用上限如实下调——不接受"广告 64 MiB、4 MiB 就崩"这种表里不一。无论哪条，都要有一条决定性测试钉住边界。

## 4. MINOR

| ID | 事实与要求 |
|---|---|
| MI-01 | **随机杀点未固定 seed**。链环④ `const delay = 100 + Math.floor(Math.random() * 600)`，[测试策略](../testing-strategy.md)要求失败保留随机 seed。当前只有 `t.diagnostic` 记录延迟值（可手工复现），但失败不可自动重放。建议改为可注入 seed 的确定性伪随机 |
| MI-02 | **链环⑤的命中率表述强于测试保证**。测试是"最多 5 轮、命中≥1 即通过"（`assert.ok(orphanHits >= 1)`），未命中的轮 `continue` 跳过；闸门报告写"本地 3/3 命中"。这是**一次运行的观测**，不是测试的保证。报告应写成"测试保证≥1 次命中并在命中轮全量断言；本地某次运行 3/3"。（判定：这个重试是为**命中竞态窗口**，命中轮的断言无条件执行、全程未命中即失败，**不属于"靠重试变绿"**，故只作表述纠正） |
| MI-03 | **治理文件落在名不副实的提交里**。ADR-0027 是本任务门槛的唯一冻结源，却由标题为 `PB-12 W4 fix: prettier for perf-recovery.mjs (remote static gate)` 的提交引入。冻结顺序的可审计性依赖提交标题；建议此类文件单独成提交 |
| MI-04 | 闸门报告 §2 的"最终验证 run"必然覆盖不到写它自己的那个提交。事实无害（我已核 docs-only），但应在报告里写明这一点，而不是让读者自己去比对 `fc270e0` 与 head |

## 5. 诚实说明（我这轮没做的事）

- **M1/M3/M4 三条变异我没有复跑**——它们要么需要改产品源码后跑完整 e2e 链（单轮数分钟至十余分钟），要么落在我本轮预算之外。我只独立复跑了 M2（结果见 §2）。M1/M3/M4 的红/绿目前**仅有实施者自述**，复审时我会补跑至少一条端到端变异。
- **远程 CI run 号我无法独立核验**（无 `gh` 凭据）。我能独立核的是：本地 e2e 8/8、`fc270e0..6eb6224` 为 docs-only、以及本地 `verify`/套件结果。
- 链环⑥的 "ubuntu CI 892.7 ms" 同理属实施者提供的远程数据，我只核了本地口径（我的探针未复测该项）。

## 6. 闸门门槛逐项对账（我的判定）

| 门槛 | 报告自评 | 我的判定 |
|---|---|---|
| 1 八链环 | met | **成立**（我复跑 8/8；入口/强杀真实性独立坐实） |
| 2 恢复 p95 ≤10 s | met | **成立但未由我复测**（实施者 p95 664 ms；口径已按 PB-10-followups #3 改为端到端，非存储层冒充） |
| 3 变异全红 | met | **部分成立**：M2 我复跑为红；M1/M3/M4 待复审补跑 |
| 4 fake 边界 | met | **成立** |
| 5 承接 12 项 | met | **成立** |
| 6 CI 9/9 | met | **无法独立核验**（见 §5） |
| — | 建议 PASS | **暂不成立**：MAJOR-1 使"PoC-B 就绪"的覆盖面被高估，须先关闭或书面收窄 |

## 7. 交接与关闭条件

- **MAJOR-1 由 Codex 修复，由我复审关闭**；若选择"收窄闸门适用范围"的路径，须**业主书面批准**（这是验收口径变更，实施者不得自决）。
- MI-01～MI-04 同轮处置；MI-02 是报告措辞纠正，不涉及代码。
- 闸门报告的结论段须在 MAJOR-1 处置后重新给出（可能仍是 PASS，但证成链条要覆盖这条限制）。
- **PR #52 在复审签署前不合入**——本轮流程纪律保持得很好，请继续。
- **台账提醒**：本报告落盘会立即触发检查 8a（`quality:check` 现在真的会红）。请**当轮**补 §3.1 `PB-12` 行，状态如实写 `🔄 已实现，首审 FAIL 修复待复审`，链接本报告；合并后按 [AGENTS 台账证据指纹规则](../../AGENTS.md) 用 `main` 上的合入 SHA。
- 复审时我会重点重跑：MAJOR-1 的两层复现（校验器 + 真实 Host 终态）、至少一条端到端变异、以及 §2 全部通过项的不回潮。

---

*本报告由独立审计角色出具；台账与代码修复由实施者完成。审计期间仅新增本文件。*

---

# 8. 复审记录（2026-08-01）· 结论 PASS

> 复审对象：`953a213`（代码）+ `a4af9ff`（文档）+ `93d3545`（run 号补记），分支 `pb-12-e2e-gate`，**未合入**（`origin/main` 仍为 `f5ea07c`）。
> 我的首审报告（§1–§7）经比对**逐字未被改动**。

## 8.1 结论

**PASS —— MAJOR-1 与 MI-01～MI-04 全部关闭，无未关闭发现。**
**PB-12 可标 ✅、合并 PR #52；闸门报告的 `PASS` 建议我判定证成成立，PoC-B 通过/降级的最终裁定归业主。**

## 8.2 MAJOR-1 两层复现（我的承诺项 ①）

修复走的是我列的方案②：schema `pattern` → 自定义 Ajv `format: content-base64`，程序式 O(n) 零回溯校验；`file-host.invokeSerialized` 增包络。我在真实代码路径上两层各喂一遍：

```text
层一 validateHostPayload（首审在 4 MiB 抛 RangeError）
   2 MiB -> ok=true    4 MiB -> ok=true    8 MiB -> ok=true    16 MiB -> ok=true
   8 MiB 中注入一个 '!'  -> ok=false HOST_PAYLOAD_SCHEMA   （没有为了不崩而放行）

层二 真实 Host（createFileHost → invoke → project.save.as）
   4 MiB -> terminal kind=success，transcript 2→4
   8 MiB -> terminal kind=success，transcript 4→6
```

首审的病灶——**广告区间内零终态 + 裸 `RangeError` 逃逸**——两层均已消失，且每个请求恰好一个终态。**MAJOR-1 关闭。**

## 8.3 语言等价性（这是我这轮真正的猎杀点）

把冻结正则换成手写校验器，风险不在"会不会崩"，而在**接受的字符串集合有没有被悄悄改宽或改窄**——那会是一次未声明的契约语义变更（host-contract §5 要求语义变更必须升版本）。实施者报了 5000 例对拍；我自建了一份更狠的：

```text
对拍口径：冻结正则 ^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$  vs  isContentBase64
样本：含 '='/空格/'-'/'_'/换行/非 ASCII/星外字符 的 15 字符敌意字母表，长度 0–3 全枚举
     + 17 个定向畸形（"====" "A===" "=AAA" "AA==AA==" "AAA=A" "AB=C" 400 字符变体…）
     + 20000 条确定性随机串
合计 25237 条 —— 分歧 0
```

判定：**语言完全一致**，故属 host-contract §5 允许的"同版本实现修复"，**无需升协议版本**，`0.2.0` 消费者不受影响。生成物已重生成（`generate:check` 绿）。

## 8.4 端到端变异（我的承诺项 ②）

首审我只跑了 M2，欠一条端到端。本轮补跑 **M4**：把 `knowledge-package/src/import.ts` 的 `actualSha256 !== entry.sha256` 短路为 `if (false)`，然后跑真 Electron 链环⑦：

```text
node --test --test-name-pattern "chain 7" …/pb-12-chain.e2e.test.ts
   ✖ chain 7 失败于 pb-12-chain.e2e.test.ts:477  —— 0 !== 1
      （篡改包本应以 exit 1 被拒，短路后 exit 0 被接受）   进程 exit=1
```

端到端变异守卫为真。M1/M3 我仍未复跑，但 M2（首审，单元层）+ M4（本轮，端到端）已覆盖两端形态，加上闸门门槛第 3 项由 ADR §4 钉死，我认为证据充分。

## 8.5 §2 通过项不回潮（我的承诺项 ③）

```text
pnpm verify                                   exit 0
pnpm --filter @wenshu/host-contract test      52/52（首审 48，新增 4 条区间/等价/防回归守卫）
pnpm --filter @wenshu/project-storage test    33/33（首审 31，新增 2 条包络守卫）
pnpm test:e2e                                 8/8，exit 0（真 Electron 全链）
```

首审 §2 的全部通过项——入口真实性、强杀真实性、e2e 通道不泄漏、零新增依赖、参考机器 v24.17.0、治理面零夹带、承接 12 项——本轮均未回潮。

## 8.6 MINOR 处置

| ID | 判定 | 依据 |
|---|---|---|
| MI-01 | **关闭** | 杀点改确定性 PRNG（默认 seed `12648430`，`PB12_KILL_SEED` 可注入重放，每轮 `t.diagnostic` 记录 seed 与延迟）——失败可精确重放 |
| MI-02 | **关闭** | 闸门 §1 行 1.5 已改为「**测试保证** ≥1 次命中（未命中轮跳过、命中轮断言无条件执行、全程未命中即失败）；本地**一次运行观测** 3/3」——保证与观测分开表述 |
| MI-03 | **关闭（以记录方式）** | 已推送历史不改写是正确取舍。我复核了其关键论断：**ADR §4 门槛自报告落盘 `23e7903` 至今零触碰**——本修复轮对 ADR 的改动只落在 §5.1 增补（我逐行核过 diff），门槛条文一字未动。后续门槛类文件单独成提交的承诺已写入记录 |
| MI-04 | **关闭** | §2 已写明"任何最终验证 run 都覆盖不到写它自己指纹的那次文档提交"这一结构性事实与核对口径。我复核了本轮指纹链：`953a213`（唯一含代码的提交）→ `a4af9ff` **零代码改动** → `93d3545` **仅 1 行文档**，故代码面完全被 `a4af9ff` 的矩阵覆盖 |

另：首审 §3 对 MAJOR-1 的诚实性更正做得干脆——闸门报告 §3 第 5 条自己写明"原报告将此写为『载荷取 2 MiB 规避』的测试取舍**系低估**"，ADR §5.1 增补同口径。承认低估比补一句限制更难，这点记上。

## 8.7 闸门门槛终判

| 门槛 | 我的判定 |
|---|---|
| 1 八链环 | **成立**（我两轮共跑 e2e 8/8 ×2） |
| 2 恢复 p95 ≤10 s | **成立**（口径已按 PB-10-followups #3 端到端化；数值未由我复测，见 §5） |
| 3 变异全红 | **成立**（M2 单元层 + M4 端到端层由我亲跑；M1/M3 为实施者自述） |
| 4 fake 边界 | **成立** |
| 5 承接 12 项 | **成立**（N1 随本轮关闭，N2/N3 归口待业主确认） |
| 6 CI 9/9 | **无法独立核验**（无 `gh` 凭据；我能核的是本地全绿与指纹链为 docs-only） |
| 结论 | 闸门报告的 `PASS` 建议**证成成立**——覆盖面不再被高估，限制逐条如实登记，无 deferred、无静默丢弃 |

## 8.8 NOTE（不作为条件）

- e2e 场景页运行时有 Electron 的 CSP 警告（`no Content Security Policy / unsafe-eval`）。这是 **e2e 专用**的 `scenario/index.html`，不是产品渲染页，且仍在 `contextIsolation + sandbox` 下；但 `A-01`/`A-02` 建立真实产品页面时须为其设 CSP，别把 e2e 页的宽松当成基线。
- 远程 CI run 号、ubuntu 侧 892.7 ms 恢复耗时始终在我的独立核验能力之外，这一限制两轮一致，请业主知悉。

## 8.9 签署

PB-12 从首审 `FAIL`（1 MAJOR / 4 MINOR）到终局，全部发现由实施者修复、由我复审关闭，实施者未自行关闭任何一条，本报告正文两轮未被改动一字。承重结论：**真 Electron 入口、真 `SIGKILL`、真库真文件真恢复的七链环成立**；**e2e 编排通道不泄漏到产品壳**（我注入 flag 撬过）；**知识包篡改必拒的端到端守卫为真**（我短路后链环⑦变红）；**契约广告区间内的崩溃路径已消除且语言零漂移**（25237 例对拍分歧 0）。

**PB-12 独立审计签署：PASS。** 合并后请当轮把台账 `PB-12` 行改 ✅，按 [AGENTS 台账证据指纹规则](../../AGENTS.md) 补 `main` 上的合入 SHA 与最终验证 run；`A-01` 的开工资格自台账 ✅ 起成立。

---

# 9. 补记（2026-08-01，签署后）· 远程 CI 限制的部分解除

§5 与 §8.7 两轮均把"远程 CI 无法独立核验"登记为我的能力边界。签署后业主提供了 GitHub Actions 运行列表截图，该边界**部分解除**，如实补记：

- **截图所示**（分支 `pb-12-e2e-gate` / PR #52，共 8 次 `verify` 运行）：`#193`(PR opened)/`#194`/`#195`/`#196` 四次**失败**，`#197`/`#198`/`#199`/`#200` 四次**成功**。
- **与自述逐条吻合**：实施记录披露的远程失败恰为 4 次（杀点窗口 miss、prettier、裸全局 `no-undef`、npm registry 502）；首审最终绿 2 次（`fc270e0`/`6eb6224`）+ 修复轮绿 2 次（`a4af9ff`/`93d3545`）恰为 4 次。**4 红 4 绿一一对应，没有被隐去的失败运行**——这是一项此前无法执行的诚实性核查，结果为通过。绿勾表示该次运行全部作业成功；矩阵自 W4 起为 9 作业，故 9/9 成立。
- **仍不能由我核实的**：列表只显示 `Pull request #52 synchronize`，**不显示 run ID，也不显示每次运行对应的 commit**。故文档中引用的具体 run ID（`30686666034`/`30686876325`/`30689457442`/`30689699038` 等）与提交的映射关系，以及合并后 `main` 上的 `30693560894`/`30693726228`，仍属实施者自述。
- **对结论的影响**：无。该旁证只增强既有证据，§8.1 的 `PASS` 签署不变。§8.7 门槛第 6 项的判定由"无法独立核验"更新为"**旁证成立**（4 红 4 绿与自述吻合）；run ID↔commit 映射仍属自述"。
