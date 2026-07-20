# G1-11 并行 CI 独立审计报告

> 状态：已完成　审计者：Claude（未参与实施）　实施者：Codex　日期：2026-07-20
> 任务书：[G1-11-ci-claude-audit-task.md](G1-11-ci-claude-audit-task.md)　审计对象：`40f99b3..50651e5`　实施提交：`4aabac1`、`50651e5`

## 1. 审计范围与方法

变更面 26 文件 +737/-9，新增 `.github/workflows/verify.yml`、`tools/ci`（5 个源文件、4 个脚本、2 个测试）、`docs/ci.md`，并在 `packages/test-support/test/evidence-ownership.unit.test.ts` 补 IA-01 覆盖。

**不采信** [实施记录](G1-11-ci-implementation.md)、文档声明、提交信息或 `pnpm verify`/`pnpm ci:verify` 全绿。所有结论来自另写的仓库外探针：runner 与作业真源反例、workflow 破坏性验证、临时 Git 仓库密钥矩阵、伪造 pnpm 虚拟仓库许可证矩阵、IA-01 守卫逐条移除。探针全部位于 `D:\tmp\g111*`，结束时已删除并核实无残留。

未修改代码、测试、workflow、lockfile、路线图、配置、Schema 或生成物；未运行 format/fix/generate 写入命令；未 push、未创建 PR、未触发 GitHub Actions、未改变远程设置。审计结束时 `git status --short` 只有本报告。

**环境与基线**（仅作基线，不作结论）：`node v24.17.0`（`D:\Applications\Node\node-v24.17.0-win-x64`）、`pnpm 11.15.1`、`--store-dir D:\DevCaches\pnpm-store`、`CI=true`。

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通过，10 个工作区项目 |
| `pnpm ci:verify` | **exit 0**，8/8 作业 PASS，耗时约 22s；`Secret scan passed: 217 tracked files`；`License scan passed: 115 dependency paths; Apache-2.0=14, BlueOak-1.0.0=1, BSD-2-Clause=6, BSD-3-Clause=3, ISC=6, MIT=82, MPL-2.0=2, Python-2.0=1` |
| `pnpm verify` | **exit 0**：71 源码/配置文件、**217** 仓库文件、**18** 个测试文件、测试合计 **130**（unit 34、config 7、contract-runtime 4、document 15、template 15、host 31、project 24）、**10** 个包 typecheck、production build 成功、无体量 `WARN` |
| `git cat-file -e origin/main:.github/workflows/verify.yml` | **不存在**；`origin/main` 停在 `705cbce`，早于 `4aabac1`。**workflow 确未出现在远程，本任务没有虚构远程成功证据** |

---

## 2. 发现

### MAJOR

#### `CI-01`　密钥扫描对含 NUL 字节的文件静默跳过，且成功信息把未扫描文件计入覆盖数

- **证据**：[`tools/ci/src/secrets.ts:57-60`](../../tools/ci/src/secrets.ts#L57-L60)

  ```ts
  const content = await readFile(resolvedPath);
  if (content.includes(0)) {
    continue;          // 无任何记录、无计数、无诊断
  }
  ```

  [`tools/ci/scripts/check-secrets.ts:17`](../../tools/ci/scripts/check-secrets.ts#L17) 随后打印 `Secret scan passed: ${trackedFiles.length} tracked files.`——分母是**全部跟踪文件**，而非实际内容扫描过的文件。

- **原始反例（仓库外临时 Git 仓库）**：

  ```text
  仓库仅含 1 个跟踪文件 notes.txt，内容 = 真实形态 AWS key + 1 个 NUL 字节
      exit=0    输出：Secret scan passed: 1 tracked files.        <-- 静默放行

  对照：同一文件去掉那 1 个 NUL 字节
      exit=1    输出：secret notes.txt: AWS access key            <-- 正常阻断

  3 文件仓库（1 个干净、1 个 binary-with-secret、1 个干净）
      输出：Secret scan passed: 3 tracked files.
      提及跳过/未扫描：*** 无 ***
  ```

- **实际/预期**：预期跟踪文件中的凭证被阻断，或至少在无法扫描时给出可见信号（对照：符号链接走的是 `tracked symbolic link requires review` **findings** 路径，而不是静默 `continue`）。实际是追加/前置一个字节即完全跳过内容匹配，且成功信息宣称覆盖了它。
- **影响**：`security` 是 workflow 8 个作业之一；推送后这就是远程强制的密钥门禁。一个可被单字节击穿、且**不留任何痕迹**、同时**虚报覆盖数**的安全门禁，属于宪法 18「可信失败优先于虚假通过」直接针对的形态。当前仓库 217 个跟踪文件中含 NUL 的为 **0**，因此没有已发生的泄露；这是门禁能力问题而非既有缺陷。
- **关于文档口径的公允说明**：[`docs/ci.md:28`](../ci.md#L28) 写的是「扫描 `git ls-files` 返回的**全部文本文件**」。按"含 NUL 即非文本"的通行判据，实现与该措辞字面相符，因此**这不是虚假声称**。我判 `MAJOR` 的依据是**静默 + 计数虚高**这两点，而不是"未扫描二进制"本身。**若扫描器把跳过的文件报告出来（例如 `skipped N binary files`）并让成功信息只统计实际扫描数，我会把本项降为 `MINOR`。**
- **建议归属**：`G1-11` 本任务修复，**推送 workflow 之前**。可选做法：对含 NUL 的文件仍按 latin1/ASCII 做同一批高置信度模式匹配；或将其登记为 `binary file not content-scanned` 类 finding 并从"passed: N"的分母中剔除。

---

### MINOR

| ID | 标题 | 证据与复现 | 影响与归属 |
|---|---|---|---|
| `CI-02` | workflow matrix 的**新增**方向不被契约测试发现 | [`tools/ci/test/ci-runner.unit.test.ts:29-31`](../../tools/ci/test/ci-runner.unit.test.ts#L29-L31) 只断言每个 `CI_JOB_NAMES` 出现在 YAML，未断言反向。破坏性验证：删除 matrix 项 → **FAILS**；重命名 matrix 项 → **FAILS**；**新增 `sneaky-extra` 项 → PASSES** | 远程后果 fail-closed：未知作业会执行 `pnpm ci:job sneaky-extra`，`isCiJobName` 为假 → 退出 2 → 该 job 红。**不会产生假绿**，因此不阻断。但任务书 §3.1 要求"增删/改名任一侧"都能发现。**归属 `G1-11`**，最迟远程首跑后的收尾提交 |
| `CI-03` | 反"可移动标签"断言漏掉带点版本号 | 同文件第 35 行 `assert.doesNotMatch(workflow, /uses: [^\n]+@(v\d+\|main\|master)\s*$/mu)`。破坏性验证：改成 `@v7` → **FAILS**（正确）；改成 **`@v7.0.0` → PASSES** | `v7.0.0` 同样是可被强制移动的标签，属任务书 §4 判定不合格的形态。当前三个 Action 均为完整 SHA，故无实际暴露。**归属 `G1-11`**，与 `CI-02` 同批 |
| `CI-04` | `.pnpm` 存在但为空时许可证扫描静默返回绿灯 | 伪造扫描根实测：**空 `.pnpm` 目录 → exit 0，`License scan passed: 0 dependency paths;`**（分布为空）。对照：缺失 `.pnpm` → ENOENT 失败；包目录缺 `package.json` → ENOENT 失败；`package.json` 语法错误 → 解析错误失败——三者均 fail-closed | 触发面窄（CI 中 `pnpm install --frozen-lockfile` 先行，`.pnpm` 必然非空），且[实施记录](G1-11-ci-implementation.md)第 23 行本身记录过"初版许可分布为空被判为假阳性"，说明该类问题已发生过一次却未加断言。建议加 `locations.length > 0` 与分布非空断言。**归属 `G1-11`**，最迟远程首跑后的收尾提交 |
| `CI-05` | 实施记录只保留了任务书列举的 4 项过程反例中的 2 项 | [`G1-11-ci-implementation.md:22-24`](G1-11-ci-implementation.md) 的「关键反例」记录了①并行首轮 `static` 因 4 个未格式化文件失败、②许可证扫描初版分布为空被废弃；任务书 §8 另点名的「暂存后扫描测试 fixture」与「包目录 cwd 失败」在该文件中无对应记录（全文检索无匹配） | 属过程证据不完整，不影响门禁正确性。**需说明**：我只能核对记录中"有什么"，无法独立证实另外两项确实发生过——任务书断言其发生，我据此报告差异，而非断言实施者隐瞒。**归属 `G1-11`**，最迟远程首跑后的收尾提交 |

---

## 3. 逐节反例矩阵

### §3　runner 与作业真源

| 检查 | 结果 |
|---|---|
| `CI_JOB_NAMES` / `CI_JOBS` / workflow matrix 三方一致 | 8 项完全一致，双向集合相等；`Object.keys(CI_JOBS) === CI_JOB_NAMES`；每个作业至少 1 条命令 |
| 并发预算 | budget 1/3/4/8/16 → 实测峰值 1/3/4/8/**8**（超出作业数时正确收敛）；结果数恒为 8；顺序恒等于清单顺序 |
| 非法并发 | `0`、`-1`、`1.5`、`NaN`、`2^53` 全部抛错拒绝 |
| **确定性失败的子命令** | 注入必失败的假 pnpm 入口：`runCiJob('static')` 返回 **3**，打印 **`[ci:static] failed at lint (3)`**（精确标出作业与步骤），**在失败步骤后停止**（`quality` 未执行），失败步骤**仅执行 1 次（无重试）** |
| 单作业失败不掩盖其他 | 8 个结果全部收集，失败作业 status=5，汇总会以非零退出，顺序仍规范 |
| 作业名校验 | `bogus`/空/`STATIC`/`static `/`__proto__`/`constructor`/`toString` 全部为假；`run-job.ts` 无参数、错误名、大小写、`__proto__` **均退出 2** |
| 退出码卫生 | `npm_execpath` 删除/为空 → 抛 `npm_execpath is required…`；子进程被信号杀死 → **1**（不吞成 0）；入口不可启动 → **1** |
| 三构建输出隔离 | 声明 `dist/ci-test`、`dist/ci-staging`、`dist/ci-production` 三者互异、均非裸 `dist`；模式分别 test/staging/production；实测三个目录均真实产出（各 2 个文件），pnpm 未把 `--mode`/`--outDir` 解析错位 |
| 空层不进绿色矩阵 | `test:render`/`test:integration`/`test:e2e` **未被任何 CI 作业引用**；单独运行 `test:e2e` 退出码 **3**（not-registered，非零） |

**破坏性验证（仓库外副本，`ci-runner.unit.test.ts`）**：

```text
baseline                                   PASSES
workflow 删除一个 matrix 项                FAILS
workflow 重命名一个 matrix 项              FAILS
workflow 新增一个 matrix 项                PASSES   <-- CI-02
workflow 用 echo 取代 pnpm ci:job          FAILS
workflow 解钉为 @v7                        FAILS
workflow 解钉为 @v7.0.0                    PASSES   <-- CI-03
workflow 删除 permissions 块               FAILS
workflow 删除 --frozen-lockfile            FAILS
jobs.ts 删除一个作业                       FAILS
jobs.ts 让两个构建共用一个 outDir          FAILS
parallel.ts 破坏并发预算                   FAILS
```

### §4　GitHub Actions workflow（只读检查）

| 项 | 结果 |
|---|---|
| 触发范围 | `pull_request`、`push: branches:[main]`、`workflow_dispatch`——无 schedule、无 fork 特权触发 |
| 同分支取消旧运行 | `concurrency.group` 含 `github.ref`，`cancel-in-progress: true` |
| `fail-fast` / 并行 | `fail-fast: false`，`max-parallel: 8` |
| 权限 | `permissions: contents: read`，**仅此一项**；无 packages/id-token/pages 等写权限 |
| 写仓库/发布/部署/付费/secrets | **全文无 `secrets.`、无 push/deploy/publish/release 步骤、无第三方付费服务** |
| 运行环境冻结 | `ubuntu-24.04`（非 `-latest`）、`node-version: 24.17.0` + `check-latest: false`、`corepack prepare pnpm@11.15.1 --activate` |
| 安装 | `pnpm install --frozen-lockfile` |
| 缓存键 | `${{ runner.os }}-node-24.17.0-pnpm-11.15.1-${{ hashFiles('pnpm-lock.yaml') }}`——**同时含 OS、Node、pnpm、lockfile 哈希**；`restore-keys` 为同前缀降级 |
| Action 固定到完整 SHA **并独立核对** | 三项**全部匹配官方标签**（经 GitHub API 只读查询）：`actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` = v7.0.0 ✓；`actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` = v7.0.0 ✓；`actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9` = v6.1.0 ✓ |
| 每个 matrix job 调用同一入口 | `run: pnpm ci:job ${{ matrix.job }}`，YAML 内**没有另一条更宽松的成功路径** |
| 表达式插值风险 | `${{ matrix.job }}` 的取值域完全由本文件的 matrix 字面量决定，非外部输入，无命令注入面；`${{ steps.pnpm-store.outputs.path }}` 仅用于 `cache.path` |

### §5　密钥扫描

29 个提交 fixture 的判定与预期逐一比对，**26 项一致**：`.env`、`.env.production`、`.Env.Local`（大小写变体）、`.key/.pem/.p12/.pfx`、`UPPER.KEY`、私钥头、AWS `AKIA…`、`ghp_/gho_/ghu_/ghs_/ghr_` 五种前缀、OpenAI 风格 `sk-…`、前后空白包裹、嵌套 JSON、嵌套 YAML、无扩展名、Unicode 文件名与内容、200 KB 超长文件 —— **全部阻断**；`.env.example`、空文件、纯净文本、短文档示例 `sk-live-abc` —— **正确放行**（示例不会造成永久假阳性）。

三项差异中：

- **`.ENV` 未被单独标记是我的探针在 Windows 上的假象**——`.env` 与 `.ENV` 在不区分大小写的文件系统上是同一路径，git 只看到一个。在干净仓库中单独提交 `.ENV`，扫描**正确阻断**（`tracked environment file`）。据实更正，不作为发现。
- 另外两项即 `CI-01`。

| 其他边界 | 结果 |
|---|---|
| 纯 untracked 文件 | **不扫描**（exit 0）——与 `docs/security-and-secrets.md:23`「已跟踪/已暂存」的表述一致，未冒充覆盖 |
| `git add` 后的**新**文件 | **扫描并阻断**（exit 1） |
| 已跟踪文件被修改 | **扫描并阻断**（exit 1） |
| 符号链接 | 报 `tracked symbolic link requires review`，**不跟随读取仓库外内容**；外部密钥值未出现在输出中 |
| gitlink/子模块条目 | 以错误 fail-closed（exit 1），不静默通过 |
| 诊断是否回显密钥原文 | **否**——输出仅 `secret <path>: <label>`，实测 AWS/GitHub/OpenAI/私钥片段均未出现在输出中 |

### §6　许可证扫描

**表达式矩阵 29 项，0 项意外**：MIT/Apache-2.0/BSD-2/BSD-3/ISC/OFL-1.1 放行；MPL-2.0、Python-2.0、BlueOak-1.0.0 放行且[文档](../ci.md#L30)明确写「识别不等于业主批准……登记为 G1-15 待裁定」，**未冒充业主批准**；`GPL-3.0`、`GPL-2.0-only`、`GPL-2.0-or-later`、`AGPL-3.0`、`AGPL-3.0-only` 阻断；**`(MIT OR GPL-3.0)`、`MIT OR GPL-2.0`、`GPL-3.0 AND MIT`、`(MIT AND AGPL-3.0)` 全部阻断——不能靠同时含 MIT 绕过**；`LGPL-3.0`、`(MIT OR Apache-2.0)`、`MIT AND ISC`、`mit`/`Mit`（大小写）、`SEE LICENSE IN …`、`UNLICENSED`、自定义文本、空串一律 fail-closed；` MIT `、`MIT\n` 正确 trim 后放行。

**manifest 形态 10 项，全部 fail-closed**：缺 `license` 字段、空串、纯空白、对象形式 `{type:"MIT"}`、旧式 `licenses[]` 数组、`private:true` 无 license、`SEE LICENSE IN`、GPL、复合 MIT OR GPL —— 均 exit 1；全 recognized 的对照 exit 0 且输出非空分布。

**扫描根失败模式**：缺失 `.pnpm` → ENOENT fail-closed；包目录缺 `package.json` → fail-closed；`package.json` 语法错误 → fail-closed；**空 `.pnpm` → 静默绿灯（`CI-04`）**。

**覆盖面**：扫描器发现 **115** 个包路径，与我对 `node_modules/.pnpm/*/node_modules/*` 的独立枚举**完全一致（集合相同）**，其中 scoped 包 33 个；工作区自有包正确排除（不是"只扫 11 个工作区"）。真实运行的数量与分布非空且可复核。

### §7　IA-01 与隔离设施回归

| 反例 | 结果 |
|---|---|
| `Object.freeze({ ...prepared })`（保留 Symbol 品牌、路径、正确 claim） | **rejected**：`only a runtime-issued prepared isolation is accepted`；证据目录 `[]` |
| evidence `layer` 与 worker `layer` 不一致 | **rejected**：`failure evidence layer does not match worker isolation`；证据目录 `[]` |
| RA-01 未准备句柄 | rejected |
| RA-01 磁盘 claim 被篡改 | rejected：`worker isolation claim does not match` |
| RA-02 证据非空时清理 | rejected：`successful cleanup refuses non-empty failure evidence` |
| RA-02 空证据清理 | 正常完成 |

**破坏性验证（`evidence-ownership.unit.test.ts`）**：

```text
baseline                                PASSES
移除 WeakSet 身份检查                   FAILS   AssertionError: Missing expected rejection
移除层级一致性检查                      FAILS   AssertionError: Missing expected rejection
移除非空 evidence 检查                  FAILS   AssertionError: Missing expected rejection
移除磁盘 claim 比对                     FAILS   AssertionError: Missing expected rejection
```

四项守卫移除**全部**使测试失败，失败原因正是"原本期待拒绝但现在被接受"。**`IA-01` 真实关闭**（上一轮的两个覆盖缺口——冻结品牌复制、层级不一致——现已各有断言）。`RA-01`/`RA-02` 未因 runner/CI 变更被削弱。

### §8　工程共同检查

| 项 | 结果 |
|---|---|
| `tools/ci` 从**仓库根**运行 | `pnpm --filter @wenshu/ci test` → 6/6 通过，exit 0；`typecheck` exit 0 |
| `tools/ci` 从**包目录**运行 | `node --test test/*.unit.test.ts` → 6/6 通过，exit 0；`tsc -p tsconfig.json` exit 0。**不依赖偶然 cwd** |
| 手写 TS 全部进入 typecheck | `tsc --listFiles` 覆盖 `src` 5、`test` 2、`scripts` 4，共 **11/11** |
| 零 `any` / 抑制指令 | 全仓手写 TS 中 `any`、`as any`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`eslint-disable` 匹配数 **0** |
| 宽泛 ignore | `.prettierignore`、`eslint.config.mjs`、`tsconfig.base.json` 本范围内**零改动** |
| 体量 | `tools/ci` 最大 `licenses.ts` 116 行；全仓手写最大 265 行（`project-contract/src/validation.ts`）。**无生产 >400、测试 >500**，`quality:check` 未输出任何 `WARN`，300 行预警如实 |
| lockfile | **只新增 `tools/ci` 一个 workspace importer**（`@types/node`、`typescript` 均走 catalog），无第三方新依赖、无版本漂移 |
| 夹带修改 | 变更集限于 workflow、`tools/ci`、`package.json` 脚本、文档与 IA-01 测试；Schema、生成物、`tsconfig.base.json` 未被触碰 |
| 文档诚实性 | 逐句核对：**未发现**任何声称远程 CI 已运行/通过、声称 render/integration/E2E 已验证、把密钥或许可证扫描描述为完整、把 MPL/Python/BlueOak 描述为业主已批准、或把 G1-11/G1-15 标为完成的表述。`docs/ci.md:3` 明写「待 Claude 独立审计与私有远程首次运行」，`G1-11-ci-implementation.md:15,17` 明写 workflow 未推送、CI 不声称空层已通过。过程证据不完整见 `CI-05` |

---

## 4. 未执行项与限制

1. **无法在远程真实执行的部分一律列为未执行，不推定通过**：Ubuntu 24.04 runner 上的 `corepack enable` 实际可用性、`pnpm store path --silent` 在该镜像上的输出、`actions/cache` 的命中与恢复行为、matrix 8 路真实并发调度、`concurrency.cancel-in-progress` 的实际取消、以及 workflow 整体 YAML 是否被 GitHub 接受——**均未验证**。本报告只审计了静态定义与本地同构命令。
2. **Action SHA 与官方标签的对应关系**通过 GitHub 只读 API 查询核对（3 次 GET，未认证、未触发任何工作流、未改变任何远程状态）。我未验证这些标签本身是否被上游事后移动过。
3. **未在受审工作树内植入任何探针文件**；密钥/许可证矩阵均在 `D:\tmp` 的一次性 Git 仓库与伪造 pnpm 虚拟仓库中完成。
4. **`CI-05` 的两项缺失过程反例无法独立证实**：我只能核对记录中已有的内容，任务书断言的另外两项是否真实发生、以何种形态发生，不在我可核验范围内。
5. **未做完整熵扫描评估**：本报告只按"高置信度模式"这一已声明边界评估密钥门禁，未评判该边界本身是否足够。
6. **范围外**：`G1-15` 的 SBOM、漏洞分析、依赖用途与特殊许可证书面裁定；真实数据库/渲染/E2E；Windows/macOS runner。

---

## 5. 汇总与最终结论

| 严重级别 | 数量 | 编号 |
|---|---:|---|
| `BLOCKER` | 0 | — |
| `MAJOR` | **1** | `CI-01` |
| `MINOR` | 4 | `CI-02`、`CI-03`、`CI-04`、`CI-05` |

| 前序发现 | 状态 |
|---|---|
| `IA-01` | **已真实关闭 ✅**——两个原始反例均被拒绝且证据目录为空；四项守卫逐一移除后测试**各自失败**且失败原因正确 |
| `RA-01` | 回归通过，未被削弱 |
| `RA-02` | 回归通过，未被削弱 |

**结论：`FAIL — 不得推送 workflow`**

依任务书第 1 节判定规则：存在 1 项 `MAJOR`（`CI-01`），结论为 `FAIL`。

判定要点：

- **本轮实施的整体质量很高，`FAIL` 只由一处安全门禁缺口触发。** runner 与作业真源三方一致且双向可验证；失败作业被精确标注到步骤、不重试、不掩盖其他作业；信号/不可启动/缺 `npm_execpath` 全部不吞成 0；三环境构建真实产出到三个互异目录；空的 render/integration/E2E 完全不在绿色矩阵内。workflow 权限最小、触发受限、环境三重冻结、缓存键四要素齐备、三个 Action 的完整 SHA 我逐一核对**确实对应官方标签**，且 YAML 内没有任何比 `pnpm ci:job` 更宽松的成功路径。许可证门禁在 29 项表达式与 10 项 manifest 形态上全部 fail-closed，复合表达式不能靠夹带 MIT 绕过，覆盖面与我的独立枚举完全一致，且对 MPL/Python/BlueOak 的表述严格停留在"G1-15 待裁定"。`IA-01` 经四项守卫逐一移除验证为真实关闭。
- **`CI-01` 是唯一阻断项**：密钥扫描遇到含 NUL 字节的跟踪文件会**静默跳过内容匹配**，同时把这些文件计入 `Secret scan passed: N tracked files` 的分母。我用一个只含"真实形态 AWS key + 1 个 NUL 字节"的单文件仓库复现了完整的**静默放行**，去掉该字节后同一文件立即被阻断。当前仓库 217 个跟踪文件中含 NUL 的为 0，因此**没有已发生的泄露**——这是门禁能力与自我报告诚实性的问题。我已在发现条目中写明：**若扫描器把跳过的文件显式报告出来并让成功计数只统计实际扫描数，本项可降为 `MINOR`**；判 `MAJOR` 的依据是"静默 + 计数虚高"，不是"未扫描二进制"这一已声明边界本身。
- 四项 `MINOR` 均不影响 workflow 自身安全，且远程后果都是 fail-closed 或触发面极窄，已逐项写明归属（全部 `G1-11`）与最迟关闭点。

**关闭路径**：修复 `CI-01` 后，由 Claude 只复核该项与其回归测试即可；`CI-02`～`CI-05` 可与远程首跑后的收尾提交一并处理。**在 `CI-01` 关闭之前不得推送 workflow、不得触发远程运行。** 即使其后转为 `PASS`，也只放行首次远程验证——依任务书，`G1-11` 在远程成功前不得标记最终完成。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具，只签署事实、不提供也不应用补丁。`CI-01`～`CI-05` 不得由实施者自行标记关闭。
