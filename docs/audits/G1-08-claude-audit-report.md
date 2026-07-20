# G1-08 Claude 独立审计报告

> 状态：已完成　审计者：Claude（独立只读）　实施者：Codex　日期：2026-07-20
> 任务书：[G1-08-claude-audit-task.md](G1-08-claude-audit-task.md)　审计对象：`45bb443..dada015`（`dada015` "test: establish G1-08 isolation foundation"，25 文件 +717/-4）

## 审计范围与方法

审计 G1-08「测试骨架与并行隔离设施」，含按路线图一并处理的 G1-06 复审条件项 `NF-01`/`NF-04`。

方法：

1. 通读 `AGENTS.md`、`DEFINITION-OF-READY.md`、`docs/testing-strategy.md`、`docs/test-infrastructure.md` 与路线图 `G1-08` 行。
2. 逐行审读 `packages/test-support` 的全部实现（`layers`/`identifiers`/`discovery`/`isolation`/`evidence` 与两个脚本）、根 `package.json` 脚本、`host-contract/src/session.ts` 改动与 `.gitignore`。
3. **不采信实施说明、测试绿色输出或路线图自述**：在 scratchpad 构造独立探针，包括一个**植入 13 个测试文件的假工作区**用于检验发现完整性，以及并行 worker、路径逃逸、端口边界、Windows 目录联接、证据覆盖与 Host 会话的反例。
4. 复跑冻结安装、`pnpm verify`、五个分层命令、`tsc --listFiles`、零 `any` 扫描、体量与 lockfile 供应链检查。

审计全程未修改实现、测试、配置、lockfile、路线图或验收标准；所有探针写入均落在系统临时目录，仓库工作树保持干净。唯一写入仓库的文件是本报告。

**基线事实（非缺陷）**：`pnpm verify` 全绿，**97/97** 测试通过（test-support 6、config 7、contract-runtime 4、document-model 15、template-model 15、host-contract 29、project-contract 21），`test:foundation` 已纳入 `verify`。以下发现均是在此之上另找反例得到的。

---

## 发现

### MAJOR

#### M-01　层级审计只扫描三个硬编码根目录，其他位置的测试文件同时逃过审计与执行

- **严重级别**：`MAJOR`
- **证据**：
  - [`packages/test-support/src/discovery.ts:6`](../../packages/test-support/src/discovery.ts#L6)：`const SEARCH_ROOTS = Object.freeze(["apps", "packages", "tools"])`；[`:46-48`](../../packages/test-support/src/discovery.ts#L46-L48) 只遍历这三个目录。
  - `discoverLayerTests` 复用同一发现函数，因此 `pnpm test:render|test:integration|test:e2e` 的登记范围与审计范围完全一致。
  - [`AGENTS.md:99`](../../AGENTS.md#L99) 声称「`pnpm test:layers`：审计**所有测试文件**是否显式标注 unit/contract/render/integration/e2e 层级」——该表述强于实现。（`docs/test-infrastructure.md:23` 如实写了三个根目录，两处不一致。）
- **可复现方式**：在临时目录构造含 13 个测试文件的假工作区并调用 `discoverTestFiles`：

  ```text
  发现 5 个候选：
      apps/web/src/a.unit.test.ts                 -> unit
      packages/p/test/b.contract.test.ts          -> contract
      packages/p/test/nested/deep/c.e2e.test.ts   -> e2e        （嵌套目录正常覆盖）
      packages/p/test/unclassified.test.ts        -> UNCLASSIFIED（审计正确失败）
      tools/t/d.unit.test.ts                      -> unit
  完全未被发现：
      root-level.unit.test.ts        （仓库根）
      tests/in-tests-dir.unit.test.ts
      e2e/in-e2e-dir.e2e.test.ts
      src/in-src-dir.unit.test.ts
  ```

  `node_modules/` 与 `dist/` 下的文件被正确跳过。
- **影响**：G1-08 在路线图中的完成证据是「测试层名称审计」，其价值在于**不可能**新增未分类或名不副实的测试。一个仓库根级 `e2e/` 或 `tests/` 目录——正是 `A-12`、`PB-12` 建立真实 E2E 时最可能选择的位置——会让审计静默通过，同时 `pnpm test:e2e` 报告 `not-registered`（读起来是"没有用例"），而真实用例就躺在那里从不执行。这比"漏报"更危险：它把"未运行"伪装成"无需运行"。宪法 18「可信失败优先于虚假通过」直接适用。
- **建议处理**：把扫描根改为仓库根 + 显式跳过清单（`node_modules`、`dist`、`build`、`coverage`、`test-results`、`artifacts`、`.git`、`tmp`），而不是白名单三个目录；或至少在新增顶层目录时让审计失败。同时修正 `AGENTS.md:99` 的表述使其与实现一致。

#### M-02　Windows 上文件名大小写变体可以正常执行，却完全不进入层级审计

- **严重级别**：`MAJOR`
- **证据**：[`discovery.ts:32-33`](../../packages/test-support/src/discovery.ts#L32-L33) 的候选判定 `entry.name.includes(".test.") || entry.name.includes(".spec.")` 是**大小写敏感**的；[`layers.ts:18`](../../packages/test-support/src/layers.ts#L18) 的 `endsWith(\`.${layer}.test.ts\`)` 同样大小写敏感。项目主环境是 Windows（`docs/compatibility.md`、D 盘工具链基线），而 Windows 文件系统大小写不敏感。
- **可复现方式**：在临时目录写入 `test/Sneaky.Test.ts`（内容为一个 `node:test` 用例），在本机 Windows 上执行 `node --test test/*.test.ts`：

  ```text
  `node --test test/*.test.ts` 匹配到 Sneaky.Test.ts        YES - 它被执行了
  层级审计对它的分类                                          not even a candidate（连候选都不是）
  ```

  即：该文件在各 package 现有的 `"test": "node --test test/*.test.ts"` 脚本下**会真实运行**，但 `pnpm test:layers` 连看都看不到它。`legacy.Spec.ts` 同理。
- **影响**：任务书第 1 项明确要求「模糊命名、嵌套目录、**Windows 路径**和新增未分类测试不能绕过」。当前实现在嵌套目录和小写模糊命名上成立，在 Windows 大小写变体上不成立，且这是主开发平台。一个 `Foo.Integration.Test.ts` 可以运行、可以变绿、可以被当作集成测试证据，而层级审计始终显示「9 files classified」。
- **建议处理**：候选判定与层级判定统一改为对小写化后的文件名比较（`entry.name.toLowerCase()`），并对"仅大小写不同于规范后缀"的文件显式报错而不是静默接受——后者可以同时阻止 `Foo.Unit.Test.ts` 这类看似合规实则绕过审计的命名。

#### M-03　相同 `workerIndex` 的两个 worker 静默共享全部隔离目录，并发准备也不报错

- **严重级别**：`MAJOR`
- **证据**：
  - [`isolation.ts:56-67`](../../packages/test-support/src/isolation.ts#L56-L67)：`createDirectoryWithoutFollowingLinks` 对 `EEXIST` 一律吞掉；[`:120-128`](../../packages/test-support/src/isolation.ts#L120-L128) 从 run 目录到 `database/`、`files/`、`evidence/` 每一层都走这条路径。
  - `workerId` 完全由 `workerIndex` 派生（[`:74`](../../packages/test-support/src/isolation.ts#L74)），没有任何占用声明或互斥。
  - [`docs/test-infrastructure.md:36`](../test-infrastructure.md#L36) 把唯一性推给调用方：「调用方必须为并行 worker 分配不同 `workerIndex`」，但运行时不做任何检查。
- **可复现方式**：用同一 `controlledRoot`/`runId`/`layer`/`workerIndex` 构造两份隔离并同时准备、同时写同名文件：

  ```text
  两次相同 index 产生的路径                  YES - same directory
  重复 index 的 prepare + write             NO ERROR - 两者都准备成功；A 先写 B 后写，
                                            文件内容最终为 "worker B"
  同一 index 并发 prepare ×8                no error（幂等，无碰撞检测）
  ```

  作为对照，不同 index 的两个 worker 目录、`projectId`、端口段（24000-24019 / 24020-24039）完全互斥。
- **影响**：这套设施存在的唯一理由就是防止并行 worker 互相踩踏，而它对这一种失败模式**既不检测也不报错**——A 的数据被 B 静默覆盖。`docs/testing-strategy.md` 与宪法 17/18 要求「并行测试必须隔离数据库、schema、目录、端口……不能隔离就串行」「flaky 不能靠重试变绿」。一旦 `G1-11` CI 或未来 runner 因配置错误给两个 worker 分了同一 index，症状会表现为间歇性数据污染，而排查时 `test-results/` 看不出任何异常。把不变量写进文档而不写进代码，正是本项目反复要求避免的做法。
- **建议处理**：在 `prepareTestIsolation` 中对 **worker 叶目录**改用不吞 `EEXIST` 的创建，或写一个 `O_EXCL`（`flag: "wx"`）占用文件（`worker.claim`）来声明槽位；`database/`/`files/`/`evidence/` 可继续幂等。补一条「相同 index 必须失败」的反测。

---

### MINOR

| ID | 标题 | 证据与复现 | 影响与建议 |
|---|---|---|---|
| `m-01` | `pnpm test:contract` 与契约层登记表不一致，漏跑 1 个已登记契约测试 | 根 [`package.json`](../../package.json) 把 `test:contract` 直接别名为 `contracts:check`，后者按包名逐个调用 5 个 package 的 `test` 脚本。实测 `run-test-layer.ts contract` 发现 **8** 个 `.contract.test.ts`，而 `contracts:check` 覆盖其中 **7** 个——`packages/config/test/config.contract.test.ts` 只由 `config:check` 运行 | 该文件在 `verify` 中仍会执行，因此不是"未运行"，但"分层命令运行该分层"的不变量已破。今后向未列入 `contracts:check` 的包新增 `.contract.test.ts` 会被静默漏掉。建议让 `test:contract` 也走 `run-test-layer.ts contract`，或在 `contracts:check` 中显式包含 config |
| `m-02` | 空分层命令以退出码 0 结束，纯看退出码的工具无法区分 `not-registered` 与通过 | [`run-test-layer.ts:17-24`](../../packages/test-support/scripts/run-test-layer.ts#L17-L24) 打印 JSON 后不设置 `process.exitCode`。实测 `pnpm test:render|test:integration|test:e2e` 均输出 `{"status":"not-registered","test_count":0}` 且 `exit=0` | 文档已声明「不输出 PASS，也不计入完成证据」，人读无歧义；但 `G1-11` 若把这些命令接成必需 job，会得到零用例的绿灯。建议改为非零退出码或显式 `--allow-empty` 开关，并**登记到 `G1-11`** |
| `m-03` | 未实现任何清理策略 | `packages/test-support/src` 与 `scripts` 中不存在 `rm`/`rmdir`/`unlink` 调用。单元测试自带 `rm(root, {recursive:true})`，但没有 `after` 钩子，用例失败时不会执行 | 任务书第 3 项「成功清理策略不会删除其他 worker 或受控根目录之外的文件」当前是**空真**——因为不存在清理策略，也就无从越界删除。实测一次 `pnpm verify` 后仓库内只残留空目录 `test-results/g1-08-unit/`（各 `mkdtemp` run 目录已被用例自身删除），已被 `.gitignore:24` 忽略，因此当前无泄漏也无实质膨胀；风险在于用例**失败**时 `rm` 不会执行、以及未来 render/E2E 层产生截图与 trace 后无人回收。建议明确归属（`G1-11` 或 `G1-14`）并规定"只删除自己 worker 目录、且必须先校验位于 `controlledRoot` 之内" |
| `m-04` | 绕过类型系统时 `layer` 可以是多段路径 | [`isolation.ts:91-94`](../../packages/test-support/src/isolation.ts#L91-L94) 只用 `requireContained` 拒绝逃逸，不拒绝嵌套。实测 `layer:"../.."` 与 `"../../../etc"` 被正确拒绝，但 `layer:"a/b"` **被接受**并生成 `…/run-a/a/b/worker-0` | 纵深防御缺口。`run-test-layer.ts:11` 用 `isTestLayer` 做了运行时校验，因此当前不可达；但 `buildTestIsolation` 是公共导出，未来 runner 若从环境变量取值即可触发。建议用 `isTestLayer` 在 `buildTestIsolation` 内再校验一次 |
| `m-05` | 发现阶段的健壮性细节 | [`discovery.ts:46-48`](../../packages/test-support/src/discovery.ts#L46-L48)：任一搜索根缺失会让 `readdir` 抛 `ENOENT`，审计崩溃而不是给出可读结论；[`:21-26`](../../packages/test-support/src/discovery.ts#L21-L26)：`SKIPPED_DIRECTORIES` 判定先于符号链接判定，因此名为 `dist`/`node_modules` 的符号链接被静默跳过而非拒绝 | 均不影响当前结论（三个根都存在，仓库无此类链接）。建议缺失根目录时给出明确错误，并把符号链接判定前置 |

---

### NOTE（已核验事实，不计缺陷）

- **N-01　Host `NF-01` 已关闭 ✅。** [`docs/host-contract.md:41`](../host-contract.md#L41) 已把 `validateHostMessage` 改为真实导出 `validateHostContract`。实测：文档中出现的 `validateHostContract`、`validateHostSession` 均为真实导出；`validateHostMessage` 在全仓文档与代码中都不再出现。
- **N-02　Host `NF-04` 已关闭 ✅，且无回归。** [`session.ts:98-102`](../../packages/host-contract/src/session.ts#L98-L102) 新增终态判定。首审原始反例与四个新变体全部返回稳定 code/path：

  ```text
  request -> success   -> cancel            HOST_TERMINAL_STATE_DUPLICATE@/messages/2   （原始反例）
  request -> failure   -> cancel            HOST_TERMINAL_STATE_DUPLICATE@/messages/2
  request -> cancelled -> cancel            HOST_TERMINAL_STATE_DUPLICATE@/messages/2
  request -> success -> cancel -> cancel    …@/messages/2, …@/messages/3
  request -> success -> cancel -> success   …@/messages/2, …@/messages/3
  非可取消能力: request -> success -> cancel  HOST_TERMINAL_STATE_DUPLICATE@/messages/2
  ```

  正常取消流程未被破坏：`request→cancel→cancelled`、`request→cancel→cancel→cancelled`、`request→progress→cancel→cancelled` 均 `ok:true`；`request→cancel→success`（不可取消能力）仍正确返回 `HOST_CANCELLATION_UNDECLARED`；无前置请求的 cancel 仍返回 `HOST_REQUEST_UNKNOWN`。终态判定优先于取消声明判定，次序合理。
- **N-03　任务书第 4 项完全达标。** `test-support` 未引入任何数据库驱动（`sqlite|better-sqlite|pg|mysql|prisma|drizzle` 匹配数为 0），未用 `new Map`/JSON 伪造数据库，`database/` 严格只是一个目录路径（[`isolation.ts:99`](../../packages/test-support/src/isolation.ts#L99)）。当前登记：unit 1、contract 8、render 0、integration 0、e2e 0、未分类 0——**没有把空层伪装成通过，也没有把未穿过真实入口的测试命名为 E2E**。`docs/test-infrastructure.md:7,9,38` 与 `AGENTS.md` 的措辞一致且克制。
- **N-04　并行隔离的正向能力扎实。** 不同 index 的两个 worker：`rootDirectory`、`projectId`、`database/files/evidence` 三个子目录、端口段（24000-24019 / 24020-24039）全部互斥。`runId` 校验强度高——`../escape`、`a/../../b`、`/abs`、`C:\abs`、`..`、`CON`、`nul.txt`、`lpt9`、含空格、超 64 字符、空串、前导 `-` 共 12 种敌意输入全部拒绝，仅 `dot.ok` 这类安全形态通过。端口边界正确：`basePort<1024`、`portsPerWorker<1`、`portEnd>65535` 拒绝，`basePort=65535,ppw=1` 接受，`workerIndex` 为负/小数/NaN/2^53 全部拒绝。
- **N-05　Windows 目录联接确实被逐层拒绝。** 这是文档 §3 的明确声明，我用真实 `junction` 验证：在 `runId` 段与 `<layer>` 段分别预置指向受控根之外的联接，`prepareTestIsolation` 均以 `test isolation refuses a non-directory link` 失败，未向外部目录写入任何内容。
- **N-06　失败证据保存与防覆盖成立。** `seed`（`seed-42`）与 `layer` 正确落入 `failure.json`，`diagnostic.log` 写入 3 行；同 `caseId` 第二次写入以 `EEXIST` 拒绝（`wx` 标志 + 非递归 `mkdir`），**原始 seed 保持不变**；`caseId` 的 `../escape`、`a/b`、`..`、`CON`、含空格全部拒绝；worker-0 的写入未触及 worker-1 的证据目录（保持为空）。
- **N-07　工程护栏达标（任务书第 6 项）。** `tsc -p tsconfig.json --listFiles` 覆盖 `test-support` 全部 **9/9** 手写 `.ts`（`src` 6、`test` 1、`scripts` 2）；全仓手写 TypeScript 中 `any`、`as any`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`eslint-disable` 匹配数为 **0**；`tsconfig.base.json` 本次范围内零改动；体量最大为测试 198 行、源码 129 行，均远低于 300 行预警线；**lockfile 仅新增 `packages/test-support` 的两条 catalog 固定开发依赖（`@types/node@24.13.3`、`typescript@6.0.3`），未引入任何新的外部依赖**，供应链边界未扩大。
- **N-08　台账如实。** 路线图 `G1-08` 标为「🟠 已实现待独立审计」；`AGENTS.md` 新增「实施者自检不得视为完成」；`docs/host-contract.md:66` 明确写「文档导出名与该状态机修复是否关闭 NF-01/NF-04，仍等待 G1-08 的 Claude 独立审计」；`docs/test-infrastructure.md:62` 同。未发现把未验证能力写成已完成事实。契约测试文件已统一重命名为 `.contract.test.ts`，重命名为纯改名（`git diff --stat` 显示 0 行内容变化）。

---

## 实际运行的命令与结果

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store` | 通过（9 个工作区项目，新增 `@wenshu/test-support`） |
| `pnpm run verify` | **通过**：`test:foundation`（层级审计 9 文件 + unit 6/6）→ config 7/7 → contracts 4+15+15+29+21 → 8 包 typecheck → production build，合计 **97/97** |
| `pnpm test:layers` | `Test layer audit passed: 9 files classified.` |
| `pnpm test:render` / `test:integration` / `test:e2e` | 均输出 `{"layer":…,"status":"not-registered","test_count":0}`，`exit=0`（见 `m-02`） |
| `node packages/test-support/scripts/run-test-layer.ts contract` | 发现 8 个契约文件（见 `m-01`） |
| `tsc -p tsconfig.json --listFiles`（test-support） | 9/9 手写文件覆盖 |
| 只读探针 `g108probe.ts` | 13 文件假工作区发现完整性、worker 隔离/碰撞、runId/layer/端口边界、Windows 联接、证据防覆盖 |
| 只读探针 `g108probe2.ts` | Host `NF-01`/`NF-04` 反例与正常流回归、Windows 大小写执行验证、分层登记统计 |
| `git status --short`（审计前 / 后） | 审计前为空；结束时仅本报告一处新增。探针写入全部落在系统临时目录 |

## 未执行项与限制

1. **未验证真实并行 runner 行为**：本任务只提供构造器，尚无实际分配 `workerIndex` 的 runner（`G1-11` 建立 CI 时才有）。`M-03` 的实际触发概率取决于该 runner，本报告按设施自身的保证水平评级。
2. **未验证真实数据库/浏览器/E2E 隔离**：按任务边界，这些属 `PB-08/09`、`PA-03/05`、`A-12`。本次只确认当前没有伪装（见 `N-03`）。
3. **符号链接（非联接）在 Windows 上未测**：创建真符号链接需管理员权限；已用目录联接（junction）覆盖等价路径，POSIX 符号链接分支按同一 `lstat` 代码路径推定成立。
4. `pnpm --filter @wenshu/web build:test` 与 `build:staging` 未执行（与 `pnpm build` 共用 `apps/web/dist`）；`pnpm dev` 未执行。
5. 生成漂移的破坏性验证未执行（需篡改 `src/generated/*.ts`，超出审计权限）；`generate:check` 已在 `verify` 中复跑且退出码 0。
6. 供应链结论仍由 `G1-15` 签署；本次未重跑许可证枚举，理由见 `N-07`（无新增外部依赖）。

## 汇总与最终结论

| 严重级别 | 数量 | 编号 |
|---|---:|---|
| `BLOCKER` | 0 | — |
| `MAJOR` | 3 | `M-01`、`M-02`、`M-03` |
| `MINOR` | 5 | `m-01`～`m-05` |
| `NOTE` | 8 | `N-01`～`N-08` |

**结论：`FAIL`**

依任务书「存在 BLOCKER/MAJOR 必须 `FAIL`」，`G1-08` 不得标记完成，其消费者（全部后续实现任务的测试分层与并行隔离依赖）不得以本设施为可信前置启动。

判定要点：

- **G1-06 的两个条件项 `NF-01`、`NF-04` 已确认关闭**，且经反例与正常流双向验证无回归（`N-01`、`N-02`）。这部分工作是合格的。
- **隔离设施的"正向能力"同样扎实**：不同 worker 的目录/项目/端口互斥、`runId` 12 种敌意输入全拒、Windows 目录联接逐层拒绝、失败证据 seed 保留且不可覆盖、`caseId` 不可穿越（`N-04`～`N-06`）。任务书第 4 项（不伪造数据库/E2E）也完全达标，措辞克制、无虚假声称（`N-03`）。
- 阻断集中在**控制面的完整性**，而非能力本身。三项 `MAJOR` 有一个共同形态：**保证被写进了文档，却没有写进代码**。
  - `M-01`/`M-02`：层级审计声称覆盖"所有测试文件"，实际有两条静默逃逸路径——三个硬编码根目录之外的位置，以及 Windows 上的文件名大小写变体（后者已实测**可以真实执行**）。这两条路径都会让"未运行/未分类"表现为"审计通过"。
  - `M-03`：并行隔离对它唯一要防的失败模式（相同 `workerIndex`）既不检测也不报错，实测后写者静默覆盖先写者，文档把唯一性推给调用方而运行时零校验。
  三者都直接触及宪法 18「可信失败优先于虚假通过」与 `docs/testing-strategy.md` 的并行隔离底线，也正是任务书第 1、2 项点名要求构造反例的方向。
- 三项修复代价都不大（扩大扫描根 + 小写化比较 + 叶目录 `O_EXCL` 占用），且**都应在 `G1-11` 建立 CI 之前完成**——CI 一旦按当前语义接线，`m-02` 的零用例绿灯会与 `M-01` 叠加，形成"E2E job 通过但从未运行任何 E2E"的组合。

**关闭路径**：由 Codex 修复 `M-01`～`M-03`，为每项补对应反测（根级测试文件被审计发现、`Foo.Test.ts` 被拒绝、相同 index 必须失败），并同步修正 `AGENTS.md:99` 的表述；`m-01`～`m-05` 可与之合并处理或明确绑定后续原子任务（`m-02`、`m-03` 建议登记 `G1-11`）。复跑 `pnpm verify` 后由 Claude 依本报告逐项复审并签署关闭。审计者不提供也不应用补丁。

> 依 `AGENTS.md:55` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具；实施者不得自行关闭上述发现，包括 `NF-01`/`NF-04` 的最终关闭状态以本报告 `N-01`/`N-02` 为准。

---
---

# 复审（2026-07-20）：`dde75b0..efad008`

> 复审者：Claude（独立只读）　实施者：Codex　任务书：[G1-08-claude-reaudit-task.md](G1-08-claude-reaudit-task.md)
>
> **本章节的结论取代上文首审的 `FAIL`。** 上文首审记录原样保留，不得改写。
>
> 命名说明：本节新增发现使用 `RA-xx` 前缀，以免与上文表示 Host 遗留项的 `NF-01`/`NF-04` 混淆。

## 1. 复审范围与方法

范围 `dde75b0..efad008`（`dde75b0` 仅归档首审报告，实质变更全部在 `efad008`「fix: remediate G1-08 isolation audit」，15 文件 +305/-51）。

按任务书要求，**不采信 [整改记录](G1-08-remediation.md)，也不采信实施者自报的 `verify` 101/101 与 `test:contract` 91/91**——这两个数字我只用来核对是否有漏跑，并已独立复现：

1. 逐行审读改写后的 `discovery.ts`、`isolation.ts`、`run-test-layer.ts`、`evidence.ts` 与根 `package.json`。
2. **重跑首审的全部原始反例**，并按任务书第 9 节的 7 项逐条构造新反例：38 文件假工作区（17 必须发现 / 21 必须排除）、8 路与 16 路并发抢占、squatter 与 claim 篡改、清理 API 越权、多段 layer、空层退出码。
3. 另找**整改本身引入**的结构性风险（`RA-01`、`RA-02`）。
4. 复跑冻结安装、`pnpm verify`、分层命令、`tsc --listFiles`、零 `any`、体量、lockfile 与无数据库/E2E 冒充检查，并对 Host `NF-01`/`NF-04` 做回归抽查。

复审全程未修改实现、测试、配置、lockfile、路线图、整改记录或验收标准；所有探针写入落在系统临时目录，仓库工作树保持干净。唯一写入仓库的文件是本报告。

## 2. 首审发现逐项判定

### `M-01`　层级审计只扫描三个硬编码根 —— **已关闭 ✅**

[`discovery.ts:52-59`](../../packages/test-support/src/discovery.ts#L52-L59) 已改为从仓库根单点递归，`SEARCH_ROOTS` 白名单被删除，改为 17 项显式跳过清单（[`:6-24`](../../packages/test-support/src/discovery.ts#L6-L24)）。

我把假工作区从首审的 13 个文件扩到 **38 个**，覆盖任务书点名的每一类位置：

```text
必须发现的 17 个（仓库根、tests/、e2e/、src/、brand-new-toplevel/、docs/、7 层深目录、
                  apps/packages/tools，以及各类非规范命名）
    未被发现：0（完整）
必须排除的 21 个（node_modules、oh_modules、dist、build、out、coverage、test-results、
                  artifacts、tmp、.git、.cache、.turbo、.vite、.deveco、.hvigor、.idea、
                  .vscode，以及大小写变体 NODE_MODULES/、Dist/）
    泄漏进发现：0（正确排除）
```

首审指出的四条逃逸路径（仓库根、`tests/`、`e2e/`、`src/`）全部被堵。`AGENTS.md:99`「审计**所有**测试文件」的表述现在与实现相符。**发现关闭。**

### `M-02`　Windows 大小写变体逃逸 —— **已关闭 ✅**

候选识别改用小写副本比较（[`discovery.ts:41-45`](../../packages/test-support/src/discovery.ts#L41-L45)），而 `classifyTestFile` 仍只接受规范小写后缀——这正是正确的组合：**捕获但不放行**。

```text
文件                     被发现   分类结果
unclassified.test.ts     yes      undefined -> 审计 FAILS
Sneaky.Test.ts           yes      undefined -> 审计 FAILS
legacy.Spec.ts           yes      undefined -> 审计 FAILS
Foo.Unit.Test.ts         yes      undefined -> 审计 FAILS
wrong.unit.test.js       yes      undefined -> 审计 FAILS
root.SPEC.ts             yes      undefined -> 审计 FAILS
```

并且逐层核对了 runner 的登记表：unit/contract/render/integration/e2e 五层中**没有任何一层把上述非规范文件当作已登记**。首审那条"能执行却不入审计"的路径已闭合。**发现关闭。**

### `M-03`　重复 `workerIndex` 静默共享 —— **已关闭 ✅**

[`isolation.ts:146-153`](../../packages/test-support/src/isolation.ts#L146-L153)：父段仍容忍 `EEXIST`（不同 index 的 worker 必须共享 run/layer 父目录），**worker 叶目录改用排他 `mkdir` 且不吞 `EEXIST`**，成功者随即以 `flag: "wx"` 写入随机 UUID claim 并获得带 Symbol 品牌的 `PreparedTestIsolation`。

```text
同一 run/layer/index 8 路并发     prepared=1（恰好一个），rejected=7，全部 EEXIST
winner 的 token 与磁盘 claim      一致（uuid 格式）
16 路跨 2 个 index                winners=2（每个槽位恰好一个）
worker 叶目录被空目录预占          rejected: EEXIST
worker 叶目录被普通文件预占        rejected: EEXIST
worker 叶目录被 junction 预占      rejected: EEXIST
<run-id> 父段被 junction 预占      rejected: test isolation refuses a non-directory link
```

首审"A 写完 B 覆盖、内容变成 worker B"的反例已不可复现。**发现关闭。**

### MINOR 逐项

| 首审项 | 判定 | 复审核验 |
|---|---|---|
| `m-01` `test:contract` 漏跑 config | **关闭 ✅** | 根 `package.json` 已把 `test:contract` 改为全仓 layer runner。实测：列出 **8** 个契约文件、**执行 8 个**（runner 直接 `spawnSync(node, ["--test", ...files])`，登记集合与执行集合按构造相同）、**91/91 通过、包含 `packages/config/test/config.contract.test.ts`**。生成漂移未丢失——`contracts:check` 中 4 次 `generate:check` 仍在 `verify` 里执行 |
| `m-02` 空层退出 0 | **关闭 ✅** | 实测 render/integration/e2e 三层：默认 `exit=3`，`--allow-empty` `exit=0`；两种模式输出均为 `{"status":"not-registered",…,"allow_empty":…}`，**从未出现 PASS 字样** |
| `m-03` 无清理策略 | **关闭 ✅**（新增caveat 见 `RA-02`） | 新增 `cleanupSuccessfulTestIsolation`。实测：清理 worker-0 后 worker-1 的 `precious.txt` 完好；错误 claim token、磁盘 claim 被篡改、JSON 往返后失去 Symbol 品牌的句柄、指向 `controlledRoot` 本身、指向受控根之外——**五种越权尝试全部拒绝**，且拒绝后数据完好 |
| `m-04` `layer` 可为多段路径 | **关闭 ✅** | [`isolation.ts:93-95`](../../packages/test-support/src/isolation.ts#L93-L95) 在公共构造器内补了运行时 `isTestLayer`。实测 `a/b`、`../..`、`../../../etc`、`unit/../../x`、`UNIT`、空串、`e2e␠` 七种绕过全部拒绝；五个规范层级全部接受 |
| `m-05` 发现健壮性 | **关闭 ✅** | 单根扫描后不再依赖三个根同时存在；符号链接判定已前置于跳过清单（[`discovery.ts:31-36`](../../packages/test-support/src/discovery.ts#L31-L36)）。实测名为 `dist`、`node_modules`、`harmless` 的真实 junction **全部被拒绝而非静默忽略** |

## 3. 本次整改引入的新发现

均为 `MINOR`，**无一阻断消费者**。

**`RA-01`（MINOR）　"只接受已取得 claim 的句柄"在 `writeFailureEvidence` 中只是类型约束，运行时无校验**

[`evidence.ts:23`](../../packages/test-support/src/evidence.ts#L23) 的形参类型由 `TestIsolation` 收紧为 `PreparedTestIsolation`，但函数体内**从不检查 Symbol 品牌或磁盘 claim**——它只 `lstat` 证据目录。对照之下，[`isolation.ts:169-171`](../../packages/test-support/src/isolation.ts#L169-L171) 的 `cleanupSuccessfulTestIsolation` **确实**在运行时检查品牌。两个 API 的强度不一致。

实测：手工 `mkdir` 出证据目录、把未经 `prepareTestIsolation` 的 `TestIsolation` 断言成 `PreparedTestIsolation` 传入——

```text
writeFailureEvidence on an unprepared isolation   ACCEPTED（从未取得 claim）
worker.claim exists on disk?                      no
```

[`docs/test-infrastructure.md:37`](../test-infrastructure.md#L37) 写的是「`writeFailureEvidence` **只接受**成功取得排他 claim 的 `PreparedTestIsolation`」，读起来是运行时保证。全仓 TypeScript 严格且零 `any`，因此需要一次刻意断言才能触发，风险有限；但既然 `cleanup` 已经做了运行时校验，`writeFailureEvidence` 应当一致。建议在函数入口加同样的品牌检查，或把文档表述改为"类型层面要求"。

**`RA-02`（MINOR）　`cleanupSuccessfulTestIsolation` 会连同失败证据一并删除，无任何护栏**

实测：worker 写入失败证据后调用清理——

```text
清理前 evidence 目录内容        ["failed-case"]
对持有失败证据的 worker 调用清理  cleanup SUCCEEDED
清理后证据是否还在              NO - 已删除
```

[`docs/test-infrastructure.md:38`](../test-infrastructure.md#L38) 的「失败时不得调用清理，以保留证据」是**纯调用方义务，零强制**；函数名中的 "Successful" 是唯一信号。`docs/testing-strategy.md` 与宪法 18 要求"失败保留日志、截图、trace 和随机 seed"，而首审 `m-03` 正是为了得到一个不会误删东西的清理策略。当前 runner 尚不存在（`G1-11` 才建），因此这是**潜在危害而非已发生的破坏**，故判 MINOR；但修复很便宜：证据目录非空时拒绝清理，或要求显式 `force` 参数。建议登记到 `G1-11`（即将编写调用方的任务）。

## 4. 复跑证据与工程护栏

| 检查 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通过（9 个工作区项目） |
| `pnpm run verify` | **通过，exit=0**：层级审计 10 文件 → unit 10/10 → config 7/7 → contract-runtime 4/4 → document 15/15 → template 15/15 → host 29/29 → project 21/21 → 8 包 typecheck → build，合计 **101/101**（与实施者自报一致，已独立复现） |
| `pnpm test:contract` | **91/91**，8 个文件，含 config（独立于 `verify` 的路径） |
| 空层退出码 | 默认 3 / `--allow-empty` 0，均输出 `not-registered`，无 PASS |
| `tsc -p tsconfig.json --listFiles` | test-support **10/10** 手写 `.ts` 全覆盖（src 6、test 2、scripts 2），与磁盘清单一致 |
| 零 `any` / 抑制指令 | 全仓手写 TypeScript 匹配数 **0**；`tsconfig.base.json` 本次零改动 |
| 文件体量 | 最大测试 250 行（`isolation.unit.test.ts`）、最大源码 180 行（`isolation.ts`），均低于 300 行预警线 |
| lockfile | **本次零改动**，未引入任何新依赖 |
| 无数据库/E2E 冒充 | `test-support` 中 `sqlite\|better-sqlite\|pg\|mysql\|prisma\|drizzle\|fakeDb\|mockDb` 匹配数 0；render/integration/e2e 仍为 0 登记 |
| Host `NF-01`/`NF-04` 回归 | 文档已无 `validateHostMessage`；`validateHostContract` 文档与导出一致；终态后 cancel 仍 `HOST_TERMINAL_STATE_DUPLICATE@/messages/2`；正常取消流 `ok:true` |
| `git status --short` | 复审开始时为空；结束时仅本报告一处修改 |

**其他已核验事实（不计缺陷）**：

- **清理 API 的残余边界是可接受的。** 一个调用方若把兄弟 worker 的 `worker.claim` 从磁盘读出来再伪造句柄，确实能删除兄弟目录（实测 `DELETED`）。但同一进程内的调用方本来就能直接 `fs.rm`，因此 claim 是**防误接线**而非安全边界；`docs/test-infrastructure.md` 也未声称后者。记录备查，不作为发现。
- **`prepareTestIsolation` 现在不再幂等**：同一 worker 第二次准备以 `EEXIST` 失败（这正是 `M-03` 修复的必然结果），成功清理后槽位可重新占用。消费者若在 `before` 与用例体内各准备一次会失败，`G1-11` 编写 runner 时需注意。
- **`test:contract` 不再包含生成漂移检查**，已在 `docs/test-infrastructure.md:55` 明确写出，且 `verify` 仍通过 `contracts:check` 执行 4 次 `generate:check`，无覆盖损失。
- **发现阶段对符号链接一律硬失败**（包括名为跳过目录者）。这是有意的严格选择，但开发者若用 junction 指向大体积资源目录会让 `pnpm test:layers` 以链接错误中止。属设计取舍，已记录。
- **台账如实**：路线图 `G1-08` 标为「🟠 首审失败，整改已实现待复审」，`AGENTS.md` 写明"等待原审计角色独立复审，消费者继续暂停"，`docs/test-infrastructure.md` 状态同步，前置准备索引也如实记录首审 `FAIL`。未发现把未验证能力写成已完成事实。

## 5. 未执行项与限制

1. **未在真实 CI/并行 runner 下验证**：`G1-08` 只提供构造器与 claim 机制，实际分配 `workerIndex` 的 runner 属 `G1-11`。`RA-02` 的触发概率取决于该 runner 的写法。
2. **未向真实仓库植入临时测试文件**：任务书第 4 项"新增临时契约测试不能静默漏跑"我在假工作区验证（新增 `.contract.test.ts` 即出现在 `discoverLayerTests` 结果中），并核对真实 runner 的登记集合与执行集合按构造同源；未在受审仓库内增删文件，以免修改被审工作树。
3. **真符号链接（非 junction）在 Windows 上未测**：创建需管理员权限；已用目录联接覆盖等价 `lstat` 代码路径。
4. **真实数据库/浏览器/E2E 隔离未验证**：按任务边界属 `PB-08/09`、`PA-03/05`、`A-12`；本次只确认当前无冒充。
5. `pnpm --filter @wenshu/web build:test` 与 `build:staging` 未执行（与 `pnpm build` 共用 `apps/web/dist`）；`pnpm dev` 未执行。
6. 生成漂移的破坏性验证未执行（需篡改 `src/generated/*.ts`，超出审计权限）；`generate:check` 已在 `verify` 中复跑。

## 6. 复审汇总与最终结论

| 首审严重级别 | 首审数量 | 已关闭 | 未关闭 |
|---|---:|---:|---:|
| `BLOCKER` | 0 | — | **0** |
| `MAJOR` | 3 | 3 | **0** |
| `MINOR` | 5 | 5 | **0** |

本次新增：`MINOR` 2 项（`RA-01`、`RA-02`），`BLOCKER`/`MAJOR` **0** 项。

**结论：`CONDITIONAL PASS`　——　`G1-08` 可作为后续实现任务的测试分层与并行隔离前置**

判定依据：

- 首审 3 项 `MAJOR` 与 5 项 `MINOR` 的**原始反例已逐条复跑并全部转为拒绝或安全行为**，无一项靠放宽断言、删测试或改口径关闭。`tsconfig.base.json` 零改动、手写 `any`/抑制指令计数为 0、lockfile 零改动，确认严格度与供应链边界都未被反向让步。
- 三项 `MAJOR` 的修复都是结构性的而非针对反例的点状封堵：发现改为**单根全仓递归 + 显式跳过清单**（而不是补两个根目录）、大小写处理改为**捕获但不放行**（而不是把变体也当作合法后缀）、并发控制改为**排他 `mkdir` + 随机 claim + Symbol 品牌句柄**（而不是加一句文档警告）。因此我本轮新写的探针——38 文件假工作区、16 路跨槽位并发、三类 squatter、五种清理越权、七种 layer 绕过——也一并被覆盖。
- 最能说明修复质量的是清理 API：`m-03` 只要求"有一个不会误删的清理策略"，实现却同时挡住了错误 token、磁盘篡改、失去品牌的句柄、指向受控根、指向受控根之外五种越权，且拒绝后数据完好。这超出了首审的最低要求。

不判 `PASS` 而判 `CONDITIONAL PASS`，是因为本轮新增的 `RA-01`、`RA-02` 尚无任务归属。**放行条件**（均不阻断消费者开工）：

1. `RA-02`：在 `G1-11` 编写并行 runner **之前**，给 `cleanupSuccessfulTestIsolation` 加护栏（证据目录非空时拒绝，或要求显式 `force`）。这是两项中唯一有真实破坏面的——它会删掉 G1-08 本身存在的理由（失败证据）。建议登记 `G1-11`。
2. `RA-01`：让 `writeFailureEvidence` 与 `cleanup` 的运行时校验强度一致，或修正 `docs/test-infrastructure.md:37` 的表述。可随 `G1-09` 或下次触碰该文件时处理。

实施者可据本复审把 `G1-08` 的路线图状态更新为最终完成，并把上述 2 条放行条件登记到对应任务；依赖 `G1-08` 的实现任务可以按各自 DoR 启动。首审报告中 `N-01`/`N-02` 对 Host `NF-01`/`NF-04` 的关闭结论经本轮回归抽查依然成立。

> 依 `AGENTS.md:55` 与 `CLAUDE.md`，本复审由未参与实施与修复的独立审计角色出具。`RA-01`、`RA-02` 同样不得由实施者自行关闭。
