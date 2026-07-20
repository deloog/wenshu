# G1-10 fixture 完整性与隔离复制独立审计报告

> 日期：2026-07-20　审计基线：`42f1c84..828a2ed`（HEAD `828a2ed`「feat: freeze PoC-A fixtures for G1-10」）
> 任务书：[G1-10-claude-audit-task.md](G1-10-claude-audit-task.md)　受审基线：[fixture 完整性基线](../fixture-integrity.md)、[实施记录](G1-10-implementation-record.md)
>
> 本报告由未参与实施的独立只读审计角色出具。结论只来自我自己重跑的命令、我自己从原始字节构造的反例和仓库外破坏性副本，不采信实施记录、固定哈希或"全绿"自述。

## 1. 边界与方法

- **写入边界**：本轮只新增本文件一处。未修改任何代码、测试、manifest、7 个冻结原件、lockfile、路线图、配置、Schema、生成物或其他文档。完成时工作树除实施方既有提交外，只多出本报告。
- **探针边界**：全部破坏性验证在仓库外副本 `D:\tmp\g110a`、`g110a2`、`g110b`、`g110c`、`g110d`、`g110e2` 中进行，结束后已全部删除。未 push、未创建 PR、未触发 Actions。
- **工具链**：冻结的 D 盘 Node `24.17.0` + pnpm `11.15.1`，与 CI 一致。
- **一处环境说明**（不构成发现）：本机 `pnpm` 在 `run` 前的依赖状态检查会尝试自动 `install` 并清空 `node_modules`（根因是 `node_modules/.pnpm-workspace-state-v1.json` 记录了 `filteredInstall`）。为避免审计动作改动工作区，全部命令加 `--config.verify-deps-before-run=false`，该参数只关闭 pnpm 自身的"跑前自动装依赖"，不改变被测脚本、不放宽任何断言。

## 2. 结论摘要

**结论：`CONDITIONAL PASS`**

未发现 BLOCKER 或 MAJOR。任务书 §6 列举的五类否决条件——冻结原件可被静默篡改、输出逃逸隔离、伪造隔离授权、成功证据与副本不一致、门禁可保持全绿地漏跑——**逐条经反例验证均不成立**。

| 级别 | 编号 | 摘要 |
|---|---|---|
| MINOR | `FX-01` | 缺失 manifest / 缺失或空的 fixture 根目录抛出**未分类**的 Node `ENOENT`，消息含绝对路径，与基线文档「错误只包含稳定分类和相对路径」的承诺不符 |
| MINOR | `FX-02` | `parseFixtureManifest` 的大小写碰撞（`portable`）守卫**无任何测试覆盖**：删掉它，全套测试仍全绿 |
| MINOR | `FX-03` | `isCanonicalFixturePath` 接受 Windows 敌意路径形态（盘符相对 `C:foo.txt`、NTFS 数据流 `a:b`、保留设备名、结尾空格/点）；当前被冻结锚点挡住而不可达，但导出谓词本身是契约 API |
| NOTE | `FX-04` | 未登记的**空目录**（深度 ≤ 8）不破坏集合相等；只有未登记的**文件**会被拒绝 |
| NOTE | `FX-05` | 证据文件写入失败时，已复制的 7 个文件会留在隔离区且没有证据 manifest —— 与文档声明一致，非缺陷，本报告确认其行为 |

三项 MINOR 均有明确归属和最迟关闭点，见 §8。

## 3. 冻结原件与双重互锁（任务书 §2）

### 3.1 独立取证

我自己从 `docs/poc-a/fixtures/` 读原始字节重算，**不使用被审代码**：

| 文件 | 字节数 | SHA-256（前 16 位） | 与 manifest 一致 |
|---|---:|---|---|
| chart-overview.svg | 1943 | `4066411570a1b6e4` | ✔ |
| chart-process.svg | 2064 | `55a1edc77f743853` | ✔ |
| fault-cases.json | 3164 | `202b4e3da6f26011` | ✔ |
| formal-business.template.json | 1923 | `3b4b5a08044ec9e4` | ✔ |
| golden-report.md | 30734 | `ce12af8c93c95c21` | ✔ |
| manual-baseline.csv | 789 | `c46a07eaad9404f1` | ✔ |
| report-data.csv | 398 | `5d74c565e23b13ad` | ✔ |

manifest 自身 1191 字节，SHA-256 `97e05a1c397572521351dc790ed1b0cb8821666b7d2d747477d20b9a0de72017`，与 `tools/fixtures/src/verify.ts:9` 的固定锚点 `FIXTURE_MANIFEST_SHA256` **逐字符相同**。目录实际只有这 8 个文件，无多余项。

**零字节改动**：`git diff --name-status 42f1c84..HEAD -- docs/poc-a/fixtures/` 只有 `A docs/poc-a/fixtures/manifest.json` 一行。7 个原件在本轮**一个字节都没被碰过**，与实施记录一致。

### 3.2 逐字节篡改（21 个反例）

对 7 个文件分别在**首字节、中间字节、末字节**翻转 1 bit，共 21 个仓库外副本：**21/21 全部 `FIXTURE_SET_MISMATCH`**。错误消息只含相对路径与稳定分类；我用每个原件正文的 24 字符滑动切片扫描全部错误消息，**零命中**——诊断不回显正文。

### 3.3 集合形态攻击

| 变异 | 结果 |
|---|---|
| 未改动副本（对照） | **通过** |
| 删除已登记文件 | `FIXTURE_SET_MISMATCH` |
| 增加未登记顶层文件 | `FIXTURE_SET_MISMATCH` |
| 增加未登记**嵌套**文件 | `FIXTURE_SET_MISMATCH` |
| 改名已登记文件 | `FIXTURE_SET_MISMATCH` |
| 磁盘大小写改名 `report-data.csv`→`Report-Data.csv` | `FIXTURE_SET_MISMATCH` |
| 截断为 0 字节 | `FIXTURE_SET_MISMATCH` |
| 追加 1 字节 | `FIXTURE_SET_MISMATCH` |
| 互换两个文件的内容 | `FIXTURE_SET_MISMATCH` |
| 增加未登记**空目录** | **通过** —— 见 `FX-04` |

### 3.4 manifest 攻击（锚点必须全部拦下）

`{}`、非法 JSON、缺字段、多字段、重复路径、乱序、`schema_version` 漂移、`fixture_version` 漂移、POSIX 穿越 `../escape.txt`、反斜杠路径、绝对路径、哈希长度非法、负字节数、尾部多一个换行——**14/14 全部 `FIXTURE_MANIFEST_INVALID`**。

### 3.5 双重互锁（关键反例）

任务书要求的三个方向：

- **单改 manifest**：任何改动都使字节哈希偏离锚点 → 拒绝。
- **单改固定锚点**：改锚点后真实 manifest 不再匹配 → 拒绝。
- **同时改原件与 manifest 使其自洽**：我把 `report-data.csv` 改写成 `EVIL,PAYLOAD\n` 并把 manifest 中该条目的 `bytes`/`sha256` 同步改成新值——一个**完全自洽**的清单。结果仍是 `FIXTURE_MANIFEST_INVALID: fixture manifest does not match its frozen digest`。
- 加码：把**全部 7 个原件**连同 manifest 一起改写成自洽状态，同样被拒。

**manifest 自身锚点确实承重**：一个自洽清单无法独立变绿，必须同时改动源码中的锚点常量——那是需要评审的正式变更路径，正是文档所声明的机制。

### 3.6 守卫承重性（任务书 §2 末段）

在仓库外副本中逐个删除守卫，把测试指向副本的 fixture 根后运行该包自己的契约与集成测试：

| 删除的守卫 | 该包测试是否失败 | 失败用例 |
|---|---|---|
| manifest 锚点判断 | **失败** ✔ | `manifest tampering, missing files, and unregistered files are rejected` |
| 文件集合精确相等判断 | **失败** ✔ | 同上 |
| `discoverFiles` 的符号链接拒绝 | **失败** ✔ | `filesystem links inside the fixture root are rejected without traversal` |
| **大小写碰撞（`portable`）判断** | **仍然全绿** ✖ | —— 见 `FX-02` |

## 4. 链接、路径与资源安全（任务书 §3）

### 4.1 链接一律不跟随

在仓库外副本中植入真实链接，并在 fixture 根**之外**放置哨兵内容 `TOPSECRET-OUTSIDE-CONTENT-9f3a2b`：

| 场景 | 结果 | 泄漏检查 |
|---|---|---|
| 目录 **junction** → 外部 | `FIXTURE_SET_MISMATCH: fixture directory contains a filesystem link` | 无外部内容、无绝对路径 |
| 目录 **symlink** → 外部 | 同上 | 无 |
| **文件** symlink → 外部 secret.txt | 同上 | 无 |
| 文件 symlink **冒用已登记文件名** | 同上 | 无 |
| junction **嵌套一层**后再出现 | 同上 | 无 |
| `manifest.json` 被替换为文件 symlink | `FIXTURE_MANIFEST_INVALID: fixture manifest must be a bounded real file` | 无 |
| **根目录本身**是 junction | `FIXTURE_SET_MISMATCH: fixture root must be a real directory` | 无 |
| **根目录本身**是目录 symlink | 同上 | 无 |

哨兵字符串在**任何**错误消息中零命中：校验器确实只 `lstat` 不 `readlink`，不读取链接外内容。

### 4.2 没有硬编码 7 个名称

`discoverFiles` 是通用递归 `readdir`+`lstat` 遍历，源码中不含任何 fixture 文件名；身份由**锚点**而非名单锁定。旁证：把整套测试指向仓库外的另一个 fixture 根后仍正常工作（§3.6 的守卫实验即依赖此性质），而增删改名都能被发现——这只有动态枚举才做得到。

### 4.3 资源预算

| 攻击面 | 预算 | 实测 |
|---|---|---|
| 目录嵌套 | `MAX_DIRECTORY_DEPTH = 8` | 12 层嵌套 → `fixture directory exceeds the nesting budget` |
| 文件数量 | `MAX_DISCOVERED_FILES = 128` | 200 个文件 → `exceeds the file-count budget` |
| manifest 体积 | `MAX_MANIFEST_BYTES = 64 KB` | 70 KB → `must be a bounded real file`（在 `readFile` 之前用 `lstat().size` 判断，不会先读进内存） |
| 条目数量 | `MAX_FIXTURE_COUNT = 128` | 解析层拒绝 |
| 总字节 | `MAX_FIXTURE_BYTES = 50 MB` | 解析层拒绝 |

**不存在未受限递归**：40 层纯空目录在 **3 ms** 内因深度预算被拒，没有挂起也没有栈溢出。JSON 来自 `JSON.parse`，`hasExactKeys` 用 `Object.keys` 精确比对，`JSON.parse` 产生的 `__proto__` 自有属性也会被当作多余字段拒绝。重复键由 `JSON.parse` 取最后一个，但整份 manifest 被字节锚点锁定，实际攻击面为零。

## 5. 隔离只读复制与证据（任务书 §4）

使用真实 `@wenshu/test-support`，**不 mock 文件系统**。

### 5.1 合法副本

- 7 个文件与原件**逐字节相同**（7/7），且每份副本的 SHA-256 与 manifest 登记值一致。
- 复制目录与证据文件都在该 worker 的 `files/` 下；整个 worker 根目录写入清单只有：`worker.claim`、`files/fixture-copy-manifest.json`、`files/poc-a-fixtures/` 下的 7 个文件——**没有任何一份写入落在隔离区外**。
- 复制前后冻结目录的**全部文件哈希与 mtime 完全不变**。

### 5.2 证据卫生（逐项对账）

证据 JSON 的键恰为 `schema_version, fixture_set_id, fixture_version, source_manifest_sha256, project_id, copy_root, entries`。实测：

- `copy_root` = `"poc-a-fixtures"`，相对路径；`project_id` = `"test-g110-audit-worker-1"`，只是隔离测试项目 ID；
- **不含**任何盘符绝对路径、**不含**源目录字符串、**不含** `controlledRoot`、**不含**时间戳类字段、**不含**任何 fixture 正文片段；
- `entries` 与冻结 manifest 的条目**深度相等**；
- **与磁盘副本对账通过**：证据列出的路径集合 === 副本目录实际文件集合，且每条 `bytes`/`sha256` 与磁盘上的副本实测值一致。

### 5.3 伪造授权一律拒绝且零写入

| 伪造方式 | 结果 | 隔离区写入 |
|---|---|---|
| 冻结的结构复制 `Object.freeze({...isolation})` | `only a runtime-issued prepared isolation is accepted` | 无 |
| 未冻结的展开复制 `{...isolation}` | 同上 | 无 |
| **手工带上品牌 Symbol** 的伪造对象 | 同上 | 无 |
| 篡改 `claimToken` | 同上 | 无 |
| 磁盘 claim 文件被改写 | `worker isolation claim does not match` | 无 |
| `filesDirectory` 被 junction 替换 | `test isolation refuses a non-directory link` | 无 |
| 已 cleanup 的句柄再次使用 | `only a runtime-issued prepared isolation is accepted`，根目录未被重建 | 无 |
| 跨 worker 句柄（A 的 token + B 的目录） | 同上 | 无 |

八种伪造**全部拒绝**，且拒绝后隔离区内**没有半份写入**。WeakSet 身份 + Symbol 品牌 + 冻结判定 + 磁盘 claim 四重校验共同生效，手工补上品牌 Symbol 也过不了 WeakSet 身份这一关。

### 5.4 排他性与并发

| 场景 | 结果 |
|---|---|
| 同一句柄第二次复制 | `EEXIST`（`mkdir` 非递归）；首份副本与证据**字节不变** |
| 预占复制根（含哨兵文件） | `EEXIST`；哨兵文件完好 |
| 预占证据文件 | `EEXIST`；原证据内容完好；无"貌似完整的成功证据"产生 |
| 同一句柄两个**并发**复制 | 恰好 1 成功 / 1 拒绝 |

### 5.5 复制前 / 复制中 / 复制后篡改（TOCTOU）

- **复制前**篡改源文件：`FIXTURE_SET_MISMATCH`，且**复制目录与证据文件都未被创建**——首轮全量校验承重。
- **复制中**篡改（在调用后以 0/1/3 ms 定时器改写第 7 个文件，三次实测均在复制途中真正落盘）：三次**全部** `FIXTURE_SET_MISMATCH`，副本中**没有**被篡改的字节，证据文件**未写出**——`copyEntry` 的逐文件重新核验确实承重，不是摆设。
- **复制后**篡改：已完成的副本仍逐字节正确，而对源目录重新 `verifyFixtureSet` 立即 `FIXTURE_SET_MISMATCH`。这与基线文档声明的边界一致：**文件系统无法阻止有写权限的外部进程在函数返回后改写原件**。我确认这是一条如实声明的边界，**不把它误报成 API 可解决的锁定保证**；控制手段是每次消费前重新校验加 Git/CI 评审权限。

## 6. 门禁、真实性与共同回归（任务书 §5）

### 6.1 命令与计数（冻结工具链实跑）

| 命令 | 退出码 | 计数 |
|---|---|---|
| `pnpm fixtures:check` | 0 | `Fixture check passed: 7 frozen files.`；契约 4/4，集成 13/13 |
| `pnpm test:layers` | 0 | `Test layer audit passed: 22 files classified.` |
| `pnpm test:integration` | 0 | 2 个已登记集成文件，13/13 通过（不再是空层） |
| `pnpm typecheck` | 0 | 11 个工作区包全部 `Done`，含 `tools/fixtures`，零 TS 错误 |
| `pnpm verify` | 0 | 聚合 **149/149** 通过；`Quality guardrails passed: 82 source/config files, 241 repository files.` |

### 6.2 测试真实性

集成测试使用真实磁盘（`mkdtemp`/`cp`/`writeFile`）与**真实 Windows junction**（`symlink(..., "junction")`）；`tools/fixtures/test/` 中**不存在** `mock`/`stub`/`fake`/`registerHooks` 之类的替身。我自己的独立探针也是在真实文件系统上复现同样的行为，与测试结论一致。G1-10 不涉及数据库，实施记录与基线文档均未声称任何真库通过——**没有虚构数据库结论**。

### 6.3 门禁互锁（删除命令必须被发现）

| 破坏方式 | 结果 |
|---|---|
| 从根 `verify` 链中删掉 `pnpm fixtures:check` | `wiring.contract.test.ts` **失败** |
| 整条删除 `fixtures:check` 脚本 | **失败** |
| 把 `fixtures:check` 指向另一个包 | **失败** |
| 从 `CI_JOBS.contracts` 删掉 `command("fixtures", …)` | `ci-runner.unit.test.ts` **失败** |
| 只把该命令标签改名 | **失败** |
| 把 fixtures 挪成第 9 个矩阵作业 | **失败**（同时触发 matrix 与 `CI_JOB_NAMES` 双向互锁） |

**CI 8 个作业名未被改动**：`verify.yml` 在 `42f1c84..828a2ed` 内零改动，`CI_JOBS` 的唯一变化是 `contracts` 作业新增一条 `fixtures` 命令。G1-11 的 workflow 完全未受影响。

### 6.4 工程共同检查

- **零手写 `any`/抑制指令**：`tools/fixtures/` 全目录对 `: any`、`as any`、`<any>`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`eslint-disable` 的命中数均为 **0**。
- **文件大小护栏**：最大文件 `src/verify.ts` 134 行、`src/manifest.ts` 127 行；测试最大 115 行。全部远低于生产 300/400、测试 300/500 阈值。
- **typecheck 覆盖**：`tools/fixtures/tsconfig.json` 的 `include` 为 `["src", "test", "scripts"]`，三类目录全部进入 strict 检查，`pnpm typecheck` 中可见 `tools/fixtures typecheck: Done`。
- **依赖只声明直接使用项**：`@wenshu/test-support`（`copy.ts` 直接 import）为 dependency；`@types/node`、`typescript` 为 devDependency，均走 catalog。
- **lockfile 无意外漂移**：`pnpm-lock.yaml` 的唯一变化是新增 `tools/fixtures` importer 段，版本全部来自 catalog（`@types/node` 24.13.3、`typescript` 6.0.3），**无任何第三方包版本变动**。
- **零改动确认**：`.github/`、`*.schema.json`、`schemas/`、`packages/*/src/generated/` 以及 7 个冻结原件在本轮范围内 `git diff --name-only` **全为空**。

## 7. 发现

### MINOR

#### `FX-01`　缺失 manifest / 缺失根目录抛出未分类 `ENOENT`，消息含绝对路径

**定位**：[tools/fixtures/src/verify.ts:80](../../tools/fixtures/src/verify.ts#L80)（根 `lstat`）、[tools/fixtures/src/verify.ts:89](../../tools/fixtures/src/verify.ts#L89)（manifest `lstat`）。

**证据**：

| 场景 | 抛出的错误 | 消息 |
|---|---|---|
| 根目录不存在 | **原始 `Error` code=ENOENT** | `ENOENT: no such file or directory, lstat 'D:\tmp\g110e2\root-does-not-exist'` |
| 根目录存在但为空 | **原始 `Error` code=ENOENT** | `... lstat 'D:\tmp\g110e2\...\manifest.json'` |
| 删除 `manifest.json` | **原始 `Error` code=ENOENT** | `... lstat 'D:\tmp\g110e2\...\manifest.json'` |
| 根目录是普通文件（对照） | `FixtureIntegrityError(FIXTURE_SET_MISMATCH)` | `fixture root must be a real directory` |

**影响**：

1. 与基线文档的明确承诺冲突。[docs/fixture-integrity.md](../fixture-integrity.md) §1 写「错误只包含稳定分类和相对路径」，而这三条路径既**没有稳定分类**（逃出 `FixtureIntegrityCode` taxonomy），**也含绝对路径**。
2. 按 `error.code === "FIXTURE_MANIFEST_INVALID"` 分派的下游消费者会漏掉"清单被删除"这一最直白的攻击形态。
3. 任务书 §2 要求「删除…全部 fail-closed」：**行为上确实 fail-closed**（抛错、绝不返回成功），所以**不构成 MAJOR，也不产生假绿**；问题仅在错误分类与诊断纪律。
4. 现有测试 `manifest tampering, missing files, and unregistered files are rejected` 的四个场景都**不包含删除 `manifest.json`**，因此该行为无测试覆盖。

**建议**：把根与 manifest 的 `lstat`/`readFile` 包进分类错误（缺失根 → `FIXTURE_SET_MISMATCH`，缺失 manifest → `FIXTURE_MANIFEST_INVALID`），消息只保留相对路径；并补一条"删除 manifest.json"的回归用例。或者，若认为暴露绝对路径可接受，则应修改基线文档措辞，不要保留做不到的承诺——**二者必须一致**。

#### `FX-02`　大小写碰撞守卫无测试覆盖

**定位**：[tools/fixtures/src/manifest.ts:112](../../tools/fixtures/src/manifest.ts#L112)　`portable.size !== paths.length`。

**证据**：该守卫**确实有效**——我直接调用 `parseFixtureManifest` 传入 `["A.txt","a.txt"]` 与 `["REPORT-DATA.CSV","report-data.csv"]`，两者都被 `FIXTURE_MANIFEST_INVALID` 拒绝。但在仓库外副本中**删掉这一行**后，`manifest.contract.test.ts` 与全部集成测试**仍然全绿**。

对比：同一实验中，删除锚点判断、删除集合精确相等判断、删除符号链接拒绝，**都会**让对应测试因正确原因失败。唯独这一条不会。

**原因**：契约测试中最接近的用例是 `[validEntry, { ...validEntry, path: "A.txt" }]`，但它实际是被**排序**判断拦下的（`localeCompare` 下 `"A.txt"` 应排在 `"nested/example.txt"` 之前），碰不到 `portable` 分支。

**影响**：这是任务书 §2 明确要求登记的覆盖缺口——「删除…判断，应使相应回归测试因正确原因失败；若现有测试无法发现，作为覆盖缺口登记」。在 Windows/macOS 这类大小写不敏感文件系统上，两个仅大小写不同的登记项会指向同一个物理文件，是真实的可移植性风险；守卫现在能挡住，但没有任何东西防止它被无意删除。

**建议**：补一条断言 `["a.txt","A.txt"]`（已排序、集合唯一、仅大小写碰撞）被拒的用例。

#### `FX-03`　`isCanonicalFixturePath` 接受 Windows 敌意路径形态

**定位**：[tools/fixtures/src/manifest.ts:32-44](../../tools/fixtures/src/manifest.ts#L32-L44)。

**证据**（直接调用导出谓词）：

| 输入 | 返回 | 说明 |
|---|---|---|
| `"C:foo.txt"` | **`true`** | Windows **盘符相对**路径；`join(root, "C:foo.txt")` 在 Win32 上语义不是普通子文件 |
| `"a:b"` | **`true`** | NTFS **备用数据流**（ADS）；写入后 `readdir` 根本看不见 |
| `"con"` / `"nul.txt"` | **`true`** | Windows **保留设备名**；写入被丢弃、读取返回空 |
| `"a "` / `"a."` | **`true`** | 结尾空格/点，Win32 会静默剥除，导致清单名与磁盘名不一致 |
| `"C:\\abs.txt"` | `false` | 已拒绝（契约测试覆盖） |
| `"../escape.txt"`、`"/absolute.txt"`、`"a/../b"`、`"line break"` | `false` | 已拒绝 |

**可达性（重要，不夸大）**：端到端**当前不可达**。真实 manifest 的字节被 `FIXTURE_MANIFEST_SHA256` 锚定，攻击者无法在不改源码锚点的前提下把这类路径塞进清单；即便塞进去，`discoverFiles` 的集合相等判断也会因磁盘上不存在同名项而拒绝。因此这是**纵深防御缺口**，不是可利用漏洞，故定级 MINOR 而非 MAJOR。

**为何仍需登记**：`isCanonicalFixturePath` 与 `parseFixtureManifest` 都是 `@wenshu/fixtures` 的**导出契约 API**，契约测试已专门断言 `C:\absolute.txt` 被拒——说明"拒绝 Windows 绝对形态"是既定意图，而盘符相对这个同族形态漏了。本仓库亦有同类先例：`host-contract` 有名为 `encoded and drive-relative paths cannot bypass value checks` 的用例，即项目已把"盘符相对路径"视为必须拦截的一类。

**建议**：在谓词中补充拒绝 `/^[A-Za-z]:/`、包含 `:` 的段、Windows 保留设备名，以及结尾为空格或点的段，并补契约用例。

### NOTE

#### `FX-04`　未登记的空目录不破坏集合相等

在冻结根下新建 `unregistered-empty-dir/` 与 `a/b/c/`（均无文件），`verifyFixtureSet` **通过**。原因是 `discoverFiles` 只把**文件**计入集合。深度超过 8 层的空目录仍会被嵌套预算拒绝（实测 40 层 → 3 ms 内拒绝）。

基线文档的措辞是「实际**文件**集合与清单精确相等」，**与实现一致**，因此不算文档失真。风险很低：能创建空目录的主体同样能创建文件，而后者会被立刻发现。列为 NOTE，供后续决定是否要求目录集合也精确相等。

#### `FX-05`　证据写入失败时保留部分副本（确认为已声明行为）

预占证据文件后调用复制：以 `EEXIST` 拒绝，原证据内容完好，但 7 个已复制文件**留在**隔离区。这与 [docs/fixture-integrity.md](../fixture-integrity.md) §2「若运行失败，已产生的隔离副本可保留诊断，但不能被当作完整证据」一致，且**没有**证据 manifest 生成，因此不可能被误认为成功证据。本条只作确认，不要求整改。

## 8. MINOR 归属与最迟关闭点

| 编号 | 归属 | 最迟关闭点 |
|---|---|---|
| `FX-01` | Codex（实现或文档二选一，必须自洽） | G1-13 开工前 |
| `FX-02` | Codex（补一条契约用例） | G1-13 开工前 |
| `FX-03` | Codex（谓词加固 + 契约用例） | 最迟 PoC-A 消费冻结 fixture 之前 |

三项都不阻塞 G1-10 的功能结论，但 `FX-01`/`FX-02` 属于"守卫无覆盖 / 承诺与实现不符"，按 CONSTITUTION #18「可信失败优先于虚假通过」的精神应尽早关闭，不宜长期挂账。

## 9. 未执行项与限制

- **未验证外部进程在 API 返回后的改写**：这是文件系统层面无法由本 API 解决的边界，文档已如实声明；我只验证了"返回后重新校验能立即发现"，未也不应把它当作可修复项。
- **未在大小写敏感文件系统上复跑**：本机为 NTFS（大小写不敏感）。`FX-02`/`FX-03` 涉及的可移植性问题在 Linux CI 上的表现未实测；CI 的 `contracts` 作业跑在 ubuntu-24.04，后续可作为补充证据。
- **未执行 `pnpm install --frozen-lockfile`**：会改写 `node_modules`，超出只读边界；lockfile 漂移改为用 `git diff` 逐行核验。
- **未推送、未创建 PR、未触发 Actions**；未在真实远程 CI 上跑过本轮变更（`828a2ed` 是否已推送不在本任务书范围）。
- 本报告只签署事实，**不修改路线图、不自行关闭任务、不提供也不应用补丁**。

## 10. 最终结论

**`CONDITIONAL PASS`**

任务书 §6 的五条否决线逐条不成立：

1. **冻结原件不可被静默篡改**——21 个逐字节反例 + 自洽双改 + 全量 7 文件自洽双改，全部拒绝；manifest 锚点经删除实验证明承重。
2. **输出不逃逸隔离**——全部写入落在该 worker `files/` 下，冻结目录哈希与 mtime 零变化，链接一律不跟随且不读取链接外内容。
3. **隔离授权不可伪造**——八种伪造（含手工补品牌 Symbol、跨 worker、已清理句柄、junction 替换目录）全部拒绝且零写入。
4. **成功证据与副本一致**——证据字段、路径集合与逐项哈希与磁盘副本完全对账；无绝对路径、无正文、无时间漂移、无未登记项。
5. **门禁不可保持全绿地漏跑**——`fixtures:check` 已进入根 `verify` 与 CI `contracts` 作业，六种拆除方式全部被契约测试发现；CI 8 个作业名与 G1-11 workflow 零改动。

同时：`pnpm verify` 退出码 0、149/149 测试通过、82 个源码/配置文件与 241 个仓库文件通过质量护栏、22 个测试文件完成分层、11 个包 strict typecheck 通过；零手写 `any`/抑制指令；lockfile 无第三方版本漂移；7 个冻结原件字节零改动。

放行附带条件：`FX-01`、`FX-02`、`FX-03` 三项 MINOR 按 §8 归属与最迟关闭点登记并整改，由独立审计角色复核关闭。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具。审计者不修改路线图、不自行标记 G1-10 完成；是否将 G1-10 记为完成前置、PA/G1-13/G1-14 是否可启动，由 Codex 依本报告更新台账后决定。

---

# FX-01～FX-03 定点复核（2026-07-20）：`718bdbd..aa8c856`

> 复核任务书：[G1-10-claude-recheck-task.md](G1-10-claude-recheck-task.md)　整改提交：`aa8c856`「fix: close G1-10 fixture audit minors」
>
> 本章由与首审同一独立审计角色出具。不采信 [整改记录](G1-10-remediation.md) 或全绿自述；每项结论都来自我自己重跑的原始反例、仓库外破坏性副本和守卫拆除实验。

## 1. 边界

- 只对本文件严格追加；首审 325 行一字未删、未改写。
- 未修改代码、测试、manifest、冻结原件、lockfile、路线图、配置、Schema、生成物或其他文档。
- 仓库外探针只写 `D:\tmp\g110r1`～`g110r6`，结束后已全部删除。未 push、未触发 Actions。
- 工具链：冻结 D 盘 Node `24.17.0` + pnpm `11.15.1`（同前，命令加 `--config.verify-deps-before-run=false` 抑制 pnpm 跑前自动装依赖，不改变被测脚本、不放宽断言）。

## 2. `FX-01`：文件系统失败的稳定分类与脱敏　**已关闭**

### 2.1 静态失败模式

我对每条错误同时检查四件事：是否为 `FixtureIntegrityError`、分类是否正确、消息是否含探针绝对根/盘符路径/Node 原始诊断（`ENOENT|EACCES|EPERM|EBUSY|no such file|permission denied`）、以及是否回显了 7 个原件正文的任意 24 字符切片。

| 场景 | 分类 | 消息 | 脱敏检查 |
|---|---|---|---|
| 根目录不存在 | `FIXTURE_SET_MISMATCH` ✔ | `fixture root cannot be inspected` | clean |
| 空根（无 manifest） | `FIXTURE_MANIFEST_INVALID` ✔ | `fixture manifest cannot be inspected` | clean |
| 删除 `manifest.json` | `FIXTURE_MANIFEST_INVALID` ✔ | `fixture manifest cannot be inspected` | clean |
| 根是普通文件 | `FIXTURE_SET_MISMATCH` ✔ | `fixture root must be a real directory` | clean |
| manifest 是目录 | `FIXTURE_MANIFEST_INVALID` ✔ | `fixture manifest must be a bounded real file` | clean |

首审 `FX-01` 的原始反例——「删除 `manifest.json` 抛出未分类的 `Error: ENOENT ... 'D:\...'`」——**已不可复现**。

### 2.2 竞态：`lstat` 之后 / 枚举之后消失

任务书要求的两类竞态，我用 8 档定时器（0/0.3/0.6/1/1.5/2/3/5 ms）在校验进行中删除目标，实测确实命中了 `lstat` 之后与枚举之后的窗口：

| 竞态 | 命中拒绝 | 观察到的分类与消息 |
|---|---|---|
| manifest 中途消失 | 1/8 | `FIXTURE_SET_MISMATCH :: fixture directory entry cannot be inspected` |
| 已登记文件中途消失 | 6/8 | `FIXTURE_SET_MISMATCH :: fixture directory entry cannot be inspected` / `fixture directory contents do not match the manifest` |
| 整个根目录中途消失 | 5/8 | `FIXTURE_SET_MISMATCH :: fixture directory cannot be enumerated` / `... entry cannot be inspected` |

**全部命中都是分类错误，零 `ENOENT` 原文、零绝对路径、零正文**。未命中的样本是校验先跑完（校验只需几毫秒），属正常，不是漏判。

### 2.3 守卫承重（关键实验）

任务书要求：删除或绕过新的异常转换后，新增回归测试必须**因收到原始异常/绝对路径**而失败，且必须确认不是只针对"删除 manifest"的点状修补。

| 拆除方式 | 结果 | 失败原因（实测输出） |
|---|---|---|
| 把 `classifyFileSystemFailure` 改成透传（**全部 6 个调用点**同时失效） | **测试失败** ✔ | `missing roots and manifests use stable sanitized error categories`；`actual: Error: ENOENT: no such file or directory, lstat 'D:\tmp\g110r5\wrapper-mad...'` |
| **点状修补模拟**：只保留 manifest `lstat` 的包装，把根 `lstat` 与文件 `readFile` 还原为裸调用 | **测试失败** ✔ | 同一用例，同样收到 `Error: ENOENT ... 'D:\tmp\g110r5\only-manife...'` |

第二行是本项的决定性证据：**如果整改只是针对"删除 manifest"打点状补丁，这一实验就会通过**。它失败了，说明新增用例同时约束了根目录与文件读取两条路径。代码审阅亦确认转换覆盖全部 6 个文件系统调用点（根 `lstat`、manifest `lstat`、manifest `readFile`、`readdir`、目录项 `lstat`、条目 `readFile`）。

### 2.4 未执行项（本机不可行，非通过）

任务书写的是「枚举或读取权限失败（**平台可行时**）」。我做了两次独立尝试，**都无法在本机制造真实的读取失败**：

1. `icacls <file> /deny <user>:(R)` 报告"成功处理 1 个文件"，但随后 `readFileSync` **仍然成功**——本进程绕过了该 deny ACE。
2. 用 PowerShell 以 `FileShare::None` 独占打开该文件（子进程确认输出 `LOCKED`），随后 `readFileSync` **仍然成功**读到 30734 字节。

因此"读取/枚举权限失败"这一路径**未获实证**，我按事实记为未执行，**不把它算作已验证通过**。可替代的信心来自 §2.3：`verifyEntry` 的 `readFile` 与 `discoverFiles` 的 `readdir` 都在同一转换包装内，且点状修补实验证明了这一点。

### 2.5 无回归

合法冻结目录仍正常通过（7 条目）；链接、预算与篡改反例见 §5。

## 3. `FX-02`：可移植身份守卫　**已关闭**

直接调用 `parseFixtureManifest`：

| 输入 | 结果 | 命中分支 |
|---|---|---|
| `["a.txt","A.txt"]`（**已满足排序**、集合唯一） | 拒绝 | `fixture entries must use unique portable path identity` ✔ |
| `["report-data.csv","REPORT-DATA.CSV"]` | 拒绝 | 同上 ✔ |
| `["dir/a.txt","dir/A.txt"]`（嵌套大小写碰撞） | 拒绝 | 同上 ✔ |
| `["alpha.txt","beta.txt"]`（两个真正不同的合法路径） | **通过** ✔ | —— |

三个碰撞用例都**已按 `localeCompare("en")` 排好序**，因此不会被排序分支提前拦截；精确重复分支也不适用（集合大小为 2）。整改把原先合并的一个 `if` 拆成四个独立分支（排序 / 精确重复 / 可移植身份 / 排除 `manifest.json`），错误消息可区分，这正是让断言能精确锚定分支的前提。

**守卫承重**：在仓库外副本中删除 `if (portable.size !== paths.length)` 分支后，契约测试**失败**，原因为 `AssertionError: Missing expected exception.`——即断言 `/portable path identity/` 期待抛错却没抛，**没有被排序、精确重复或任何其他分支代打**。首审 `FX-02` 的原始反例（删掉该守卫全套测试仍全绿）**已不可复现**。

## 4. `FX-03`：Windows 可移植路径加固　**已关闭**

### 4.1 敌意形态全部拒绝

任务书点名的全部形态，加上我自己补的大小写混合与多重扩展变体，**23/23 全部拒绝**：

`C:foo.txt`、`a:b`、`stream:payload.txt`、`con`、`CON`、`CoN.txt`、`NUL.txt`、`nul.tar.gz`、`nested/COM1.log`、`nested/com1`、`lpt9`、`LPT9.TXT`、`aux`、`prn.doc`、`trailing-dot.`、`trailing-space `、C0 控制字符（` `、``）、DEL（``）、TAB（`	`）、`C:\abs.txt`、`../escape.txt`、`/abs.txt`。

### 4.2 未过度拦截（fail-closed 不得误伤）

| 合法路径 | 结果 |
|---|---|
| `资产/图表1.png` | 通过 ✔ |
| `report.PDF` | 通过 ✔ |
| `data/report 1.0.txt`（中间空格 + 中间点） | 通过 ✔ |
| `console.txt`、`conference/notes.md` | 通过 ✔（`con` 前缀未被误伤） |
| `com10.log` | 通过 ✔（`com1` 前缀未被误伤） |
| `auxiliary.json`、`printer.cfg`、`nullable.ts` | 通过 ✔ |
| `a.b.c.txt` | 通过 ✔ |

设备名正则用 `^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\.|$)` 的边界写法，因此只拦真正的设备名及其带扩展形态，不会连坐 `console.txt`/`com10.log`。**7 个冻结原件的路径在新谓词下全部仍然合法**（实测 7/7），中文优先边界未被破坏。

### 4.3 守卫逐个承重

| 拆除的守卫 | 结果 | 失败原因 |
|---|---|---|
| 冒号拒绝 | **测试失败** ✔ | `Missing expected exception (FixtureIntegrityError)` |
| 保留设备名拒绝 | **测试失败** ✔ | 同上 |
| 尾随空格拒绝 | **测试失败** ✔ | 同上 |
| 尾随点拒绝 | **测试失败** ✔ | 同上 |
| 控制字符拒绝 | **测试失败** ✔ | 同上，并额外触发 `canonical fixture path predicate allows stable relative Unicode paths` |

五个守卫**各自独立承重**，不存在"一条断言覆盖全部、拆掉任意一条仍全绿"的假覆盖。实现走的是逐段可移植规则（段内禁冒号、禁设备名、禁尾随点/空格、全串禁控制字符），**不是全局 ASCII 白名单**，符合任务书要求。

## 5. 回归与共同检查

### 5.1 首审反例零回归（仓库外重跑）

| 反例族 | 结果 |
|---|---|
| 7 个原件 × 首/中/尾字节翻转 | **21/21 拒绝** |
| 删除/新增/改名已登记文件 | 全部 `FIXTURE_SET_MISMATCH` |
| `manifest={}`、manifest 多一个换行 | 全部 `FIXTURE_MANIFEST_INVALID` |
| **原件+manifest 自洽双改** | `FIXTURE_MANIFEST_INVALID`（锚点仍承重） |
| 目录 junction / 文件 symlink / manifest 是 symlink / **根本身是 junction** | 全部拒绝，无外部内容泄漏 |
| 嵌套 >8 / 文件数 >128 / manifest >64KB | 全部拒绝 |
| 合法隔离复制 | 7/7 逐字节一致；冻结目录哈希与 mtime 不变；写入仅 `worker.claim` + `files/` 下 8 项 |
| 证据卫生与对账 | 无盘符路径、无正文；与磁盘副本路径集合一致 |
| 同句柄第二次复制 | `EEXIST`，首份完好 |
| 伪造句柄（结构复制 / 手工补品牌 Symbol / 篡改 claim） | 全部拒绝，**写入增量均为 0** |

### 5.2 命令与计数（冻结工具链实跑）

| 命令 | 退出码 | 计数 |
|---|---|---|
| `pnpm fixtures:check` | 0 | `Fixture check passed: 7 frozen files.`；契约 4/4，集成 **14/14**（较首审 +1） |
| `pnpm --filter @wenshu/fixtures typecheck` | 0 | strict 通过，零错误 |
| `pnpm test:integration` | 0 | 2 个已登记文件，**14/14** |
| `pnpm test:layers` | 0 | `Test layer audit passed: 22 files classified.` |
| `pnpm verify` | 0 | 聚合 **150/150**；`Quality guardrails passed: 82 source/config files, 244 repository files.` |

### 5.3 冻结物与漂移

- **重算确认零改动**：7 个原件全部与 manifest 相符；`manifest.json` 仍为 **1191 字节**、SHA-256 仍为 `97e05a1c…72017`；`FIXTURE_MANIFEST_SHA256` 锚点**未变**且与实测一致。
- **零漂移**：`git diff --name-only 718bdbd..HEAD` 对 `.github/`、`pnpm-lock.yaml`、`*.schema.json`、`schemas/`、`packages/*/src/generated/`、`docs/poc-a/fixtures/`、`tools/ci/src/jobs.ts` **全部为空**——CI 8 个作业名、workflow、Schema、生成物与第三方依赖版本均未被触碰。
- **零手写 `any`/抑制指令**：`tools/fixtures/` 全目录命中数为 0。
- **体量护栏**：最大文件 `src/verify.ts` 174 行、`src/manifest.ts` 159 行、测试最大 155 行，全部远低于生产 300/400、测试 300/500 阈值。

## 6. 新增发现

### MINOR

#### `FX-06`　可移植规则未覆盖 Windows 其余保留字符

**定位**：[tools/fixtures/src/manifest.ts:32-62](../../tools/fixtures/src/manifest.ts#L32-L62)。

本轮整改在 [docs/fixture-integrity.md](../fixture-integrity.md) §1 新增了一条明确承诺：「清单路径必须**同时适用于 Windows 与 POSIX**」。但 Windows 文件名的九个保留字符 `< > : " / \ | ? *` 中，实现只覆盖了 `:`、`\`、`/`：

| 输入 | 结果 |
|---|---|
| `a*b.txt`、`a?b.txt`、`a<b.txt`、`a>b.txt`、`a|b.txt`、`a"b.txt` | **全部 ACCEPTED** |
| `a:b.txt`、`a\b.txt` | 已拒绝 ✔ |

**影响**：若此类路径进入清单，POSIX 上文件可以存在从而校验通过，Win32 上文件根本无法存在从而集合相等失败——**同一份清单在两个平台给出不同结论**，正是这条新文档承诺想要排除的情形。

**可达性（不夸大）**：与首审 `FX-03` 同级——真实 manifest 字节被 `FIXTURE_MANIFEST_SHA256` 锚定，攻击者无法在不改源码锚点的前提下注入这类路径；当前 7 个原件也不含这些字符。因此这是**纵深防御与文档一致性缺口，不是可利用漏洞**，定级 MINOR，不阻塞本轮放行。

**建议**：在段级规则中补齐 `< > " | ? *` 的拒绝并补契约用例；或收窄文档措辞，不要声称已覆盖全部 Windows 可移植性。二者必须一致。

**归属与最迟关闭点**：Codex；最迟 **PoC-A 消费冻结 fixture 之前**（与首审 `FX-03` 同批处理最经济）。

### NOTE

#### `FX-07`　异常转换的捕获面较宽

`classifyFileSystemFailure` 会把**任何**非 `FixtureIntegrityError` 异常转换为固定文案，因此理论上也会吞掉包装区内的编程错误（如 `TypeError`）。由于被包装的只是单个 `readdir`/`lstat`/`readFile` 调用，影响面很小，且方向是 fail-closed，不产生假绿。仅作记录，不要求整改。

## 7. 未执行项与限制

- **读取/枚举权限失败未获实证**：`icacls` deny 与 `FileShare::None` 独占两种手段在本机对本进程均无效（详见 §2.4），按事实记为未执行，不计作已验证。
- **未在大小写敏感文件系统上复跑**：本机为 NTFS。`FX-02` 的可移植身份守卫与 `FX-06` 在 Linux 上的表现未实测；CI `contracts` 作业跑在 ubuntu-24.04，可作后续补充证据。
- **未执行 `pnpm install --frozen-lockfile`**：会改写 `node_modules`，超出只读边界；lockfile 漂移改用 `git diff` 核验。
- **未推送、未创建 PR、未触发 Actions**。
- 本章只签署事实，不提供也不应用补丁，不修改路线图。

## 8. 复核结论

**`PASS — G1-10 可以标记完成`**

- **`FX-01` 已关闭**：五种静态失败模式全部分类正确且脱敏；两类竞态实测命中且同样干净；**点状修补模拟实验失败**，证明转换覆盖全部 6 个文件系统调用点而非只补 manifest 一处。原始反例不可复现。
- **`FX-02` 已关闭**：三组已排序的大小写碰撞全部命中 `portable path identity` 分支，两个真正不同的路径正常通过；删除该分支后契约测试以 `Missing expected exception` 失败，**未被其他分支代打**。原始反例不可复现。
- **`FX-03` 已关闭**：23 个敌意形态全部拒绝，13 个合法路径（含中文、大写扩展名、中间空格、`console.txt`/`com10.log`）全部通过，7 个冻结原件路径仍合法；五个守卫逐个拆除均使测试因正确原因失败；实现为逐段可移植规则而非 ASCII 白名单。原始反例不可复现。
- **无新增 BLOCKER/MAJOR**：首审全部反例族零回归；`pnpm verify` 退出码 0、150/150 测试通过、82 源码/配置 + 244 仓库文件过护栏、22 个测试文件分层、`@wenshu/fixtures` strict typecheck 通过；7 个原件与 manifest 字节零改动、锚点未变；CI 8 作业名、workflow、Schema、生成物、lockfile 零漂移；零手写 `any`/抑制指令；体量护栏通过。
- **新增一项 MINOR `FX-06`**（Windows 保留字符 `< > " | ? *` 未覆盖，与新增文档承诺不一致），已按任务书要求给出归属（Codex）与最迟关闭点（PoC-A 消费冻结 fixture 之前）；不可达、不阻塞本轮放行。另有 NOTE `FX-07` 仅作记录。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本复核由未参与实施与修复的独立审计角色出具。`FX-06` 不得由实施者自行标记关闭；是否更新路线图与台账、PA/G1-13/G1-14 何时启动，由 Codex 依本结论处理。
