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
