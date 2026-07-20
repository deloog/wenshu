# G1-11 隔离设施硬门禁独立审计报告

> 状态：已完成　审计者：Claude（未参与本轮实施）　实施者：Codex　日期：2026-07-20
> 任务书：[G1-11-isolation-gates-claude-audit-task.md](G1-11-isolation-gates-claude-audit-task.md)　审计对象：`705cbce..1426cee`

## 审计范围与方法

只读审计 G1-08 复审遗留的 `RA-01`/`RA-02` 是否由 G1-11 第一阶段真实关闭，并判断能否开始编写首次调用证据/清理 API 的并行 runner。

实施提交 `1426cee fix: enforce test evidence ownership gates`：7 文件 +299/-41，核心是 `packages/test-support/src/isolation.ts`（+78）与 `src/evidence.ts`（重写所有权入口），新增 `test/evidence-ownership.unit.test.ts`（155 行、5 个用例）。

方法：

1. 逐行审读 `isolation.ts`、`evidence.ts`、新增测试与文档改动。
2. **不采信 [实施记录](G1-11-isolation-gates-remediation.md) 与 `pnpm verify` 全绿**：另写探针，按任务书 §2（8 项）、§3（7 项）逐条构造反例，并主动搜索 TOCTOU、队列未释放、Promise 永久 pending、清理后 WeakSet 残留与部分写入。
3. 对新增测试做**破坏性验证**：在仓库外副本逐一移除各道守卫，观察对应测试是否失败。
4. 独立运行冻结安装与 `pnpm verify`。

探针全部位于 `D:\tmp\g111*`，结束时已删除并核实无残留。未修改代码、配置、测试、路线图、锁文件或 Git 历史；结束时 `git status --short` 为空，唯一新增的仓库文件是本报告。

**基线事实（非缺陷）**：`pnpm verify` exit 0——质量护栏 60 源码/199 仓库文件，层级审计 **16** 个测试文件，unit 层 **7** 个文件，测试合计 **123**（unit 27、config 7、contract-runtime 4、document 15、template 15、host 31、project 24），**9** 个包 typecheck，production build 成功，无体量预警。以下结论均是在此之上另找反例得到的。

---

## RA-01：证据写入的运行时所有权 —— **已关闭 ✅**

实现把所有权收敛为一条共享守卫：`requireIssuedPreparedIsolation`（WeakSet 身份 + Symbol 品牌 own-descriptor + `Object.isFrozen`）→ `requirePreparedTestIsolation`（受控根包含性 + 逐段真实目录 + 三个子目录真实 + claim 为真实文件且内容匹配）→ `withPreparedTestIsolationOperation`（按句柄串行化）。`writeFailureEvidence` 与 `cleanupSuccessfulTestIsolation` 都只经由这一条路径，**不是两套强度不同的检查**。

### 反例矩阵

| 任务书项 | 反例 | 结果 |
|---|---|---|
| 2.1 | `buildTestIsolation` 输出（从未 prepare） | rejected：`only a runtime-issued prepared isolation is accepted` |
| 2.2 | `structuredClone(h)` | rejected（同上） |
| 2.2 | `JSON.parse(JSON.stringify(h))` | rejected |
| 2.2 | `{ ...h }` 展开 | rejected |
| 2.2 | `Object.assign({}, h)` | rejected |
| 2.2 | **`Object.freeze({ ...h })`**（保留品牌且已冻结） | rejected |
| 2.3 | **手工枚举 `Object.getOwnPropertySymbols` 复制品牌 + 全部路径 + claimToken 并冻结** | rejected |
| 2.3 | `Object.create(h)`（原型继承） | rejected |
| 2.3 | `new Proxy(h, {})` 透传 | rejected |
| — | 真实句柄（对照） | ACCEPTED，证据正常落盘 |

**2.3 是关键证据**：最后两种伪造对象同时具备 `true` 的品牌、完整路径、正确 claimToken 且已冻结，唯一能拒绝它们的只有 WeakSet 身份。因此"知道 Symbol 就能过"不成立——所有权锚定在**运行时签发的对象身份**上。

| 任务书 2.4 磁盘 claim | 结果 | 是否留下半份证据 |
|---|---|---|
| 内容被改写 | rejected：`worker isolation claim does not match` | evidence 目录 `[]` |
| 被删除 | rejected：`ENOENT … lstat` | `[]` |
| 被替换为目录 | rejected：`refuses a non-file link` | `[]` |
| 被替换为 junction | rejected：`refuses a non-file link` | `[]` |
| 被截断为空 | rejected：`claim does not match` | `[]` |

**五种形态全部拒绝，且都未创建 case 目录、未写入任何部分证据。**

| 任务书 2.5 子目录替换 | `database/` | `files/` | `evidence/` |
|---|---|---|---|
| 换成普通文件 | rejected | rejected | rejected |
| 换成 junction | rejected | rejected | rejected |

把 `evidence/` 换成指向受控根之外的 junction 后再尝试写入：拒绝，且**外部目标目录内容为 `[]`**——没有向受控根外写入任何字节。

| 任务书 2.6 句柄生命周期 | 结果 |
|---|---|
| 已成功清理的旧句柄再写证据 | rejected（WeakSet 已撤销） |
| 已成功清理的旧句柄再清理 | rejected |
| 同 run/index 重新 prepare 后，旧句柄冒用新槽位 | rejected |
| 新句柄（对照） | ACCEPTED，证据落入新 worker |

| 任务书 2.7 层级一致性 | 结果 |
|---|---|
| worker `layer=e2e`，证据声明 `layer=unit` | rejected：`failure evidence layer does not match worker isolation`，evidence 目录 `[]` |
| worker `layer=e2e`，证据声明 `layer=e2e`（对照） | ACCEPTED |

**任务书 2.8**：带 `get`/`getOwnPropertyDescriptor` 陷阱的 Proxy 被拒绝，陷阱**仅触发 1 次**（守卫自身读取品牌描述符），不存在攻击者可控 getter 被反复执行的情况；带访问器属性的冻结对象同样被拒绝。按任务书要求说明：同进程调用方本就能直接 `fs.rm`，本报告不把该 API 当作安全边界，只判定它是否履行文档承诺——`docs/test-infrastructure.md:37-38` 描述的"句柄必须由当前进程真实签发、保有 Symbol 品牌且不可变，worker 与三个子目录均为真实目录，磁盘 claim 为真实文件且内容匹配"**逐条属实**。

---

## RA-02：失败证据与清理 —— **已关闭 ✅**

| 任务书项 | 反例 | 结果 |
|---|---|---|
| 3.1 | API 写出的 `failure.json` + `diagnostic.log` 非空后清理 | rejected：`successful cleanup refuses non-empty failure evidence`；两文件**字节完全一致**；worker 根仍在 |
| 3.2 | `screenshot.png` | rejected，证据保留 |
| 3.2 | `trace.zip` | rejected，保留 |
| 3.2 | 隐藏文件 `.keep` | rejected，保留 |
| 3.2 | 空子目录 | rejected，保留 |
| 3.2 | 多层空目录 `a/b/c` | rejected，保留 |
| 3.2 | 零字节文件 | rejected，保留 |
| 3.2 | Unicode 文件名 `证据.txt` | rejected，保留 |

判据是 `readdir(evidence).length > 0`，**不是固定文件名匹配**——7 种形态全部生效。

| 任务书 3.3 空证据清理 | 结果 |
|---|---|
| worker-0 清理 | ACCEPTED |
| worker-0 叶目录已删除 | 是 |
| 兄弟 worker-1 的 `files/precious.txt` | 完好 |
| 受控根 | 完好 |
| `<run-id>/<layer>` 父目录 | 完好 |

**任务书 3.4 无静默绕过**：源码中不存在 `force`、布尔开关、环境变量或第二清理入口（`grep` 匹配为空）。实测在证据非空时：多传位置参数 `true`、多传 `{force:true}`、设置 `WENSHU_FORCE_CLEANUP=1`/`FORCE=1` —— **三种尝试全部仍被拒绝**，证据一条不少。

### 并发与队列

| 任务书项 | 场景 | 结果 |
|---|---|---|
| 3.5 | 证据写入先调用、清理紧随其后并发启动 | 证据 `fulfilled`；清理 `rejected: refuses non-empty failure evidence`；证据事后可读 |
| 3.6 | 清理先调用并完成、证据随后排队 | 清理 `fulfilled`；迟到证据 `rejected: only a runtime-issued prepared isolation`；worker 根**未被重建** |
| 3.7 | 4 个不同 case 并发写入 | 4/4 成功，目录为 `["c1","c2","c3","c4"]` |
| 3.7 | 同一 caseId 并发写入两次 | 1 成功 1 拒绝；case 目录内**恰好** `diagnostic.log,failure.json`，无半份状态 |
| 3.7 | 重复 case 失败后再触发层级错误失败，然后合法写入 | 合法写入 **ACCEPTED**（5 秒超时未触发），队列已释放 |
| 3.7 | 失败的清理之后继续使用句柄 | ACCEPTED，句柄未被错误撤销 |
| 3.7 | 交错 5 操作突发（含 1 个错层级 + 1 个清理） | `ok,rej,ok,rej,ok`，其后合法写入仍 ACCEPTED |

**主动搜索的新反例**：

- **队列未释放 / Promise 永久 pending**：`withPreparedTestIsolationOperation` 在 `finally` 中释放闸门，因此守卫失败与操作失败都会放行后继操作；上表两次连续失败后仍能完成合法写入（带 5 秒超时兜底，未超时）。未复现挂起。
- **清理后 WeakSet 残留**：`issuedPreparedIsolations.delete` 在成功清理内执行，撤销生效（2.6）；失败清理不撤销，句柄仍可用（3.7）——两侧行为都正确。
- **部分写入**：同 caseId 并发下未出现半份 case 目录；claim/子目录被破坏时全部在 `mkdir` 之前拒绝。
- **TOCTOU**：守卫是 check-then-act，理论窗口存在。我在写入在途时替换 claim，实测结果为 **rejected 且未写入证据**——由于同一句柄的操作被串行化、守卫紧贴操作执行，我未能在进程内打开该窗口。按任务书要求说明：同进程调用方本可直接 `fs.rm`，故不将此窗口计为发现。

---

## 新发现

**`IA-01`（MINOR）　两道实际生效的守卫没有任何回归测试覆盖**

按任务书 §4 对新增测试做破坏性验证——在仓库外副本逐一移除守卫，观察 `evidence-ownership.unit.test.ts` 是否失败：

```text
基线（无改动）                    测试 PASSES
移除非空 evidence 检查            测试 FAILS   （Missing expected rejection）
移除操作串行化                    测试 FAILS   （Missing expected rejection）
移除磁盘 claim 比对               测试 FAILS   （Missing expected rejection）
移除 WeakSet 身份检查             测试 *** 仍然 PASSES ***
移除层级一致性检查                测试 *** 仍然 PASSES ***
```

任务书 §4 明确要求"移除 WeakSet 身份检查……后，对应测试必须失败"，实测不成立。

**该守卫确实是承重的**——我在同一副本上重跑伪造反例：

```text
WITH  the WeakSet check   frozen spread        rejected
                          manual copy + symbol rejected      evidence 目录 []
WITHOUT the WeakSet check frozen spread        *** ACCEPTED ***
                          manual copy + symbol *** ACCEPTED ***
                          evidence 目录 ["frozen-spread","manual-copy-symbol"]
```

即：删掉它，伪造句柄立即可以写入证据，而提交的测试套件仍然全绿。

**原因**：测试的三个伪造用例分别被**其他两个条件**拦下——`structuredClone` 丢失 Symbol 品牌（被 `brand?.value !== true` 拦）、`{ ...prepared }` 保留品牌但未冻结（被 `!Object.isFrozen` 拦）、未 prepare 的对象无品牌。**没有任何用例构造"品牌完整 + 已冻结"的伪造对象**，因此 WeakSet 分支从未被断言。层级一致性检查同理：测试中没有层级不匹配的用例。

- **影响**：**不影响当前正确性**——两道守卫都真实生效，`RA-01`/`RA-02` 的运行时行为已由本报告逐条验证关闭。风险是**未来回归无法被发现**：若有人重构 `requireIssuedPreparedIsolation`（例如认为 WeakSet 与 Symbol 品牌重复而删其一），`pnpm verify` 会保持绿色，而所有权模型的最强一环已经失效。这正是宪法 18「可信失败优先于虚假通过」要防的形态。
- **不阻断首次 runner 的理由**：runner 调用的是当前已验证正确的 API；该缺口是测试覆盖而非运行时行为，不会让 runner 写错证据或误删证据。
- **归属与最迟关闭点**：`G1-11` 后续步骤，**最迟在编写并行 runner 的同一提交内补齐**——补两条用例：(a) `Object.freeze({ ...prepared })`（含品牌）必须被拒绝，(b) 证据 `layer` 与 worker `layer` 不一致必须被拒绝且不写入。

---

## 其他已核验事实（NOTE，不计缺陷）

- **`N-01`　范围诚实，未越过硬门禁。** 仓库中不存在 `.github/` 或任何 workflow/runner 文件；`705cbce..1426cee` 未新增此类文件。[实施记录](G1-11-isolation-gates-remediation.md) 第 5 行明确写"本阶段只处理 `RA-01`/`RA-02`，没有编写并行 runner 或 CI workflow"，第 24 行写"独立审计签署前不得编写首次调用这些 API 的并行 runner，也不得创建 CI workflow 冒充 G1-11 已完成"——与实际一致。`705cbce`（G1-01R 私有远程文档基线）属文档变更，未被计入隔离实现能力。
- **`N-02`　新增测试被真实发现并执行。** 层级审计文件数 15 → **16**；unit 层登记 6 → **7**，清单中确有 `packages/test-support/test/evidence-ownership.unit.test.ts`；`verify` 中 unit 测试数 22 → **27**（该文件 5 个用例）。
- **`N-03`　测试断言不会因错误原因通过。** 五个用例均断言**具体错误消息**（`/runtime-issued prepared isolation/`、`/claim does not match/`、`/refuses non-empty failure evidence/`），不是宽泛的"只要抛错就算过"；`claim` 用例另外断言证据文件读取以 `ENOENT` 失败；保留用例用 `assert.deepEqual` 比对读入的 Buffer。缺陷只在覆盖面（`IA-01`），不在断言强度。
- **`N-04`　工程护栏未回归。** `pnpm-lock.yaml`、`tsconfig.base.json`、`eslint.config.mjs`、`.prettierignore`、各包冻结 Schema、`src/generated/*`、各 `package.json` 在本范围内**零改动**——无新增依赖、无新增宽泛 ignore。手写代码中 `any`、`as any`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`eslint-disable` 匹配数为 **0**。体量：`isolation.ts` 239 行、新增测试 155 行、最大测试 243 行，均低于 300 行预警线，`quality:check` 未输出 `WARN`。新增测试位于 `test-support/test/`，受该包 `tsc`（`include: ["src","test","scripts"]`）、ESLint 与禁止语法扫描约束。
- **`N-05`　`claim` 被删除时返回原始 `ENOENT`。** 其余四种 claim 破坏形态都返回领域错误（`claim does not match` / `refuses a non-file link`），唯独删除走的是 `lstat` 的原始错误。行为安全（fail-closed）、无信息泄漏，仅诊断一致性略欠；记录备查，不作为发现。
- **`N-06`　`test-results/` 下留有 5 个空目录**（`g1-08-*`、`g1-09-*`、`g1-11-evidence-ownership`），由各测试自身的受控根产生，用例结束时已删除各自 `mkdtemp` 运行目录，仅余空壳。该目录已被 `.gitignore:24` 忽略，工作树不受影响。此现象属 G1-08 首审 `m-03` 已登记事项，非本轮新增。

---

## 实际运行的命令与结果

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store`（CI=true） | 通过，10 个工作区项目；node 为 D 盘 v24.17.0 |
| `pnpm verify` | **exit 0**：60 源码/199 仓库文件 → 16 个测试文件 → unit 27/27 → config 7/7 → contract-runtime 4/4 → document 15/15 → template 15/15 → host 31/31 → project 24/24（合计 **123**）→ 9 包 typecheck → build 成功 |
| 探针 A（RA-01，§2 全 8 项） | 9 种伪造形态、5 种 claim 破坏、6 种子目录替换、句柄生命周期、层级一致性、Proxy/访问器 |
| 探针 B（RA-02，§3 全 7 项） | 7 种证据形态、兄弟隔离、3 种 force 绕过尝试、6 组并发/队列场景、TOCTOU |
| 探针 C（破坏性验证） | 6 种守卫移除 × 测试是否失败 |
| 探针 E（承重性确认） | 有/无 WeakSet 检查下的伪造结果对比 |
| `git status --short`（审计前 / 后） | 审计前为空；结束时仅本报告一处新增。`D:\tmp\g111a/b/d/e` 已删除并核实无残留 |

## 未执行项与限制

1. **未在仓库内植入探针文件**：全部破坏性探针在 `D:\tmp` 的 `test-support` 副本中进行；副本只依赖 `node:` 内建模块，因此行为与仓库内一致。
2. **未验证真实并行 runner 行为**：本阶段按设计尚无 runner，`RA-01`/`RA-02` 的最终使用形态需在 runner 首次调用时再次接受审计。
3. **TOCTOU 窗口未能在进程内打开**：串行化 + 守卫紧贴操作使我构造的中途替换均落在守卫之前。跨进程/跨机的竞态未测试。
4. **未测试文件系统级失败注入**（磁盘满、权限拒绝、句柄耗尽）导致的部分写入；`Promise.all` 双写在真实 I/O 错误下的原子性未验证。
5. **未审计范围外事项**：CI 服务、数据库、真实 Host、Electron/ArkWeb、渲染/E2E。
6. 供应链结论仍由 `G1-15` 签署；本轮仅确认 lockfile 零改动。

## 汇总与最终结论

| 项 | 状态 | 依据 |
|---|---|---|
| `RA-01` 证据写入的运行时所有权 | **已关闭 ✅** | §2 全 8 项逐条通过：9 种伪造（含品牌完整且冻结的手工复制）全拒、5 种 claim 破坏全拒且零部分写入、6 种子目录替换全拒且不外泄、撤销/超期句柄全拒、层级不符全拒、Proxy 仅触发 1 次陷阱 |
| `RA-02` 失败证据与清理 | **已关闭 ✅** | §3 全 7 项逐条通过：7 种证据形态均阻断清理且字节不变、空证据清理只删自身叶目录、3 种 force 绕过尝试全败、6 组并发场景行为正确、队列在连续失败后仍释放 |

| 严重级别 | 数量 | 编号 |
|---|---:|---|
| `BLOCKER` | 0 | — |
| `MAJOR` | 0 | — |
| `MINOR` | 1 | `IA-01` |
| `NOTE` | 6 | `N-01`～`N-06` |

**结论：`CONDITIONAL PASS`　——　可以开始编写首次调用证据/清理 API 的并行 runner**

判定依据：

- **`RA-01`/`RA-02` 的核心原始反例均已不成立**，且不是靠点状封堵：所有权锚定在运行时签发的对象身份（WeakSet）上，而非"知道 Symbol"或"路径正确"；证据保留判据是目录非空而非固定文件名；两个 API 走同一条守卫与同一条串行队列。我构造的最强伪造——品牌完整、路径完整、claimToken 正确且已冻结的手工复制——依然被拒绝。
- 并发行为经六组场景验证符合文档描述：证据先行则清理必拒、清理先行则迟到证据必拒且不重建目录、不同 case 可并发、同 case 冲突不留半份状态、**连续失败后队列正常释放**（带超时兜底，未出现永久 pending）。
- 唯一新发现 `IA-01` 是**测试覆盖缺口而非运行时缺陷**：删除 WeakSet 身份检查或层级一致性检查，提交的测试仍全绿，而我已证明删除 WeakSet 后伪造句柄立刻能写入证据。它不影响 runner 首次调用的安全性——被调用的实现是正确的——但会让这一环的未来回归无声通过，因此必须在写 runner 的同一提交内补齐。已按任务书要求写明归属与最迟关闭点。
- 不判 `PASS` 仅因 `IA-01` 尚未闭环；不判 `FAIL` 因为没有任何 `BLOCKER`/`MAJOR`，两项原始反例也确实不再成立。

**放行条件**：编写并行 runner 的同一提交内，为 `evidence-ownership.unit.test.ts` 补两条用例——(a) `Object.freeze({ ...prepared })`（保留 Symbol 品牌）写证据必须被拒绝；(b) 证据 `layer` 与 worker `layer` 不一致必须被拒绝且不写入——并复跑本报告的破坏性验证，确认移除任一守卫都会使测试失败。该项不得由实施者自行标记关闭。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具，只签署事实、不提供也不应用补丁。`RA-01`/`RA-02` 的关闭状态与 `IA-01` 的后续闭环均以独立审计签署为准。
