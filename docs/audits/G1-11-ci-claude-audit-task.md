# G1-11 并行 CI 独立审计任务书（交给 Claude）

> 日期：2026-07-20　审计对象：`40f99b3..50651e5`　实施提交：`4aabac1`、`50651e5`

## 1. 角色、写入边界与结论

你是未参与实施的独立审计者。不要采信 [实施记录](G1-11-ci-implementation.md)、文档声明、提交信息、`pnpm verify` 或 `pnpm ci:verify` 全绿；必须另写仓库外临时探针找反例。

- 唯一允许修改/新增的仓库文件：`docs/audits/G1-11-ci-claude-audit-report.md`。
- 不得修改代码、测试、workflow、lockfile、路线图、配置、Schema 或生成物；不运行 format/fix/generate 写入命令。
- 探针只写 `D:\tmp\g111*`，结束后删除；不得把探针文件留在受审工作树。
- 不得 push、创建 PR、触发 GitHub Actions、改变远程仓库设置或消耗外部额度。
- 报告必须列出 BLOCKER/MAJOR/MINOR/NOTE、原始反例、实际结果、未执行项和最终结论。

判定规则：存在任一 BLOCKER/MAJOR，或 IA-01 未真实关闭，结论 `FAIL — 不得推送 workflow`；仅有已明确归属/最迟关闭点的 MINOR，可 `CONDITIONAL PASS — 允许业主授权首次远程运行`；0 项未关闭可 `PASS`。即使 PASS，也只能放行首次远程验证，G1-11 在远程成功前不得标记最终完成。

## 2. 环境与基线复现

使用项目 D 盘环境：

```powershell
$env:PATH = 'D:\DevTools\pnpm;D:\Applications\Node\node-v24.17.0-win-x64;' + $env:PATH
$env:COREPACK_HOME = 'D:\DevCaches\Corepack'
$env:PNPM_HOME = 'D:\DevTools\pnpm'
$env:CI = 'true'
pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store
pnpm ci:verify
pnpm verify
```

核对 Node 24.17.0、pnpm 11.15.1、工作区数量、测试文件/测试计数、8 个作业结果；全绿只作为基线，不作为审计结论。确认 workflow 仍未出现在 `origin/main`，本任务没有虚构远程成功证据。

## 3. runner 与作业真源

独立验证：

1. `CI_JOB_NAMES`、`CI_JOBS`、本地 `ci:job/ci:verify` 与 workflow matrix 是否一一对应；增删/改名任一侧能否被测试发现。
2. 8 个无依赖作业是否真正并发，本地并发是否不超过 4；任务结束汇总是否稳定按清单排序。
3. 构造一个确定失败的子命令，证明只标错所属 job/步骤，最终退出非零，其他已启动作业仍收集结果；不得自动重试或把重试通过算 PASS。
4. 非法/缺失 job 名必须退出 2；子进程 signal、无法启动、`npm_execpath` 缺失、非零/空退出码不得被吞成 0。
5. test/staging/production 三构建必须使用三个真实不同输出目录，不能并发写 `apps/web/dist`；输出参数不得被 pnpm 解析错位。
6. 空的 render/integration/E2E 当前不得进入绿色矩阵。若 runner 将 `not-registered` 当通过或文档宣称这些层已验证，报告发现。

破坏性验证至少包括：删掉 workflow 中一个 matrix 项、删掉作业真源中一个步骤或使并发预算失效时，对应测试/命令必须因正确原因失败；在仓库外副本操作。

## 4. GitHub Actions workflow

只读检查 `.github/workflows/verify.yml`：

- 触发范围、同分支取消旧运行、`fail-fast: false`、最大并行 8、只读 `contents` 权限；不得存在写仓库、发布、部署、付费服务或 secrets 下发。
- Node/pnpm/Ubuntu 精确冻结；`pnpm install --frozen-lockfile`；缓存键同时含 OS、Node、pnpm、lockfile 哈希。
- checkout/setup-node/cache 必须固定到完整 commit SHA，并独立核对 SHA 与注释标签确实对应官方 release；可移动 `@main`/`@vN` 不合格。
- 每个 matrix job 必须调用同一 `pnpm ci:job`，不得在 YAML 内另造更宽松的成功路径。
- 检查 YAML/GitHub expression 语法、Corepack 在 Node 24 runner 的可用性、cache path 输出和命令插值风险。无法在远程真实执行的部分必须列为“未执行”，不得推定通过。

## 5. 密钥扫描门禁

不要只测已提交的三个模式。另造临时 Git 仓库或仓库外副本，至少覆盖：

- `.env`、`.env.production`、大小写变体、`.key/.pem/.p12/.pfx`；`.env.example` 合法。
- 私钥、AWS、GitHub 各 token 前缀、OpenAI 风格 key；前后空白、嵌套 JSON/YAML、无扩展名。
- 二进制 NUL、Unicode、超长文件、空文件、不可读项、Git symlink/submodule；不得跟随符号链接读取仓库外内容。
- 暂存新文件与普通 tracked 文件必须进入扫描；纯 untracked 文件的边界应与文档一致，不得冒充已覆盖。
- 测试/文档示例不能让门禁永久假阳性，也不能用过宽豁免使真实模式漏过。

确认诊断只报文件路径和模式标签，不回显密钥原文。判断高置信度模式的已声明边界是否诚实；不要因它不是完整熵扫描就直接升级，但若文档宣称了未实现能力，应报告。

## 6. 许可证扫描门禁

独立枚举 `node_modules/.pnpm` 与 lockfile/安装树，确认 scoped/unscoped、peer 变体和所有实际第三方包均被扫描，而不是只扫 11 个工作区或任意自报子集。重点构造：

- 缺失/空 license、`private: true`、`SEE LICENSE IN ...`、自定义文本、大小写/空白、复合 SPDX。
- GPL/AGPL 各版本与 `OR/AND` 表达式；不得用同时含 MIT 绕过。
- 已识别 MIT/Apache/BSD/ISC/OFL 正常；MPL-2.0、Python-2.0、BlueOak-1.0.0 只能表述为 G1-15 待裁定，不能冒充业主批准。
- 新增未登记表达式必须 fail-closed；删除扫描根、伪造 manifest、目录缺失/不可读不得静默返回空清单绿灯。

破坏性验证至少让未知许可与 GPL fixture 使真实 `licenses:check` 非零，并确认合法对照仍通过。检查输出数量与许可分布非空且可复核。G1-15 的 SBOM、漏洞与用途分析仍属范围外。

## 7. IA-01 与隔离设施回归

复跑 G1-11 隔离审计报告的两个缺口：

1. `Object.freeze({ ...prepared })` 保留 Symbol 品牌、路径和正确 claim，仍必须因 WeakSet 对象身份被拒，证据目录为空。
2. evidence `layer` 与 worker `layer` 不一致必须拒绝，证据目录为空。

在两个仓库外副本分别删除 WeakSet 检查、删除层级一致性检查：对应新增测试必须各自失败，且失败原因就是“原本期待拒绝但现在被接受”。若仍全绿，IA-01 未关闭，直接 FAIL。顺带回归 RA-01/RA-02 原反例，确认 runner/CI 变更没有削弱已签署门禁。

## 8. 工程共同检查

- `tools/ci` 自身的 `test` 与 `typecheck` 从仓库根和包目录都能运行，不依赖偶然 cwd；所有手写 TS 被 typecheck、ESLint、显式 any/抑制和体量护栏覆盖。
- 零手写 `any`、`@ts-ignore`、`@ts-expect-error`、宽泛 lint/format ignore；无生产 >400、测试 >500，300 行预警如实。
- lockfile 只新增 `tools/ci` workspace importer，不得出现未说明的第三方依赖或版本漂移。
- workflow、Schema、生成物、`tsconfig.base.json` 之外无夹带修改；文档不得把本地通过写成远程通过或把 G1-15 写成已完成。
- 首轮 format 失败、初版许可证空分布、暂存后扫描测试 fixture、包目录 cwd 失败均应如实保留为实施过程证据，不得包装成一次即成功。

## 9. 报告格式

报告至少包含：审计范围/提交、环境、逐节反例矩阵、每项发现的证据与评级、IA-01/RA-01/RA-02 状态、命令和计数、未执行项、工作树边界、是否允许首次远程运行。完成后 `git status --short` 必须只有该报告文件。
