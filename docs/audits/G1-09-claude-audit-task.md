# Claude 独立审计任务书：G1-09

> 状态：待执行　审计者：Claude　实施者：Codex　日期：2026-07-20

## 1. 目标与结论门槛

独立审计提交 `7757a37` 的 G1-09 工程质量门禁，判断它能否作为后续原子任务，尤其 G1-11 并行 CI 的可信前置。不要实现或修复代码，也不要采信实施记录或 `pnpm verify` 全绿本身；必须另写只读或仓库外临时探针寻找反例。

最终结论只能是：

- `PASS`：无未关闭问题，可以把 G1-09 标记完成并启动依赖任务；
- `CONDITIONAL PASS`：仅有不阻塞消费者的一般问题，且每项已有明确后续原子任务和最迟关闭点；
- `FAIL`：存在 BLOCKER/MAJOR，G1-09 不得作为消费者前置，尤其不得启动 G1-11。

## 2. 审计边界与权限

主要实施提交：`7757a37 feat: establish G1-09 engineering quality gates`。

权威依据至少包括 `CONSTITUTION.md`、`AGENTS.md`、`DEFINITION-OF-READY.md`、`docs/implementation-roadmap.md`、`docs/engineering-standards.md`、`docs/testing-strategy.md`、`docs/threat-model.md`、ADR-0002/0003/0004、Host/项目契约说明，以及 G1-03～G1-07 审计遗留项。

范围内：根级 format/lint/quality/verify、`tools/quality`、测试发现复用、工作区/lockfile/工具链冻结、全部非法 fixture 的 code+path、生成漂移、Host NF-02、项目契约 m-05/NF-04 及为建立格式基线产生的机械变更。

范围外：数据库、真实 Host、Electron/ArkWeb、渲染/E2E、CI 服务和 G1-08 RA-01/RA-02 的实现。若本任务虚假声称这些能力已验证，仍须报告。PB-05A 的模型标识 NF-02、模板哈希 NF-01 和 system 权限 NF-03 仍是后续项，不得误判为本任务已关闭。

审计者只能创建或编辑：

`docs/audits/G1-09-claude-audit-report.md`

不得修改源码、测试、fixture、Schema、生成物、配置、lockfile、路线图或 Git 历史；不得运行 `format`、自动修复或生成命令。需要破坏性探针时，将所需文件复制到 D 盘仓库外临时目录，完成后删除该临时副本。报告之外工作树必须保持不变。

## 3. 强制检查

1. 核对 `pnpm verify` 是否只有一个完整入口，是否真实串联 format、lint、quality、测试分层/unit、配置、生成漂移、全部契约、逐包 typecheck 和 build；检查任一子命令失败是否会被吞掉。
2. 审计 ESLint/Prettier 作用范围。确认跳过的仅为依赖、构建、证据、临时目录和机器生成边界；寻找通过目录名、大小写、符号链接、非规范后缀或嵌套位置绕过手写代码检查的方法。不得把“规则太严”本身当缺陷，应证明误报或不一致。
3. 为显式 `any`、隐式 `any`、检查抑制指令、ESLint 内联禁用分别构造反例；确认注释、字符串中的普通单词不会误报，生成/第三方类型不能把不安全类型穿透项目公共边界。
4. 逐包枚举 apps/packages/tools 下每个工作区，核对真实 `tsc --listFiles` 与质量工具结论。所有手写 `src/test/scripts`、根级 `vite.config.ts` 等 TS 配置必须进入 typecheck；伪造 `echo pass`、漏 include、大小写/路径变体必须失败。
5. 重跑文件体量边界：生产 299/300/400/401，测试 299/300/500/501，LF/CRLF/末尾换行、`.Test.ts`、`tests`/`__tests__`、生成目录同名伪装。确认 300 只预警，生产大于 400、测试大于 500 才失败，且预警不会让总入口失败。
6. 枚举所有已提交非法 fixture。每个必须具有 code 与 JSON path 元数据，测试必须同时匹配二者；交换正确 code/错误 path 或正确 path/错误 code 应失败，不能靠 `.some(code)`、第一条泛化 `/` 或测试自删载荷掩盖错误。
7. 对生成漂移做仓库外副本反测：任意一个已登记生成文件改变一字节必须使统一 `generated:check` 失败；检查新增带 `generate:check` 的工作区包是否动态纳入，而非又出现硬编码包清单。正常生成物必须与 Schema 一致。
8. 重跑 Host NF-02 原始反例 `report.pdf\nC:/Windows/win.ini`，并扩展 NUL、TAB/控制字符、无分隔任意前缀盘符、盘符相对、POSIX、UNC、`file:`、穿越、重复编码、超过解码预算、畸形百分号和嵌套/数组位置。合法相对标识和合法 HTTPS URL 不得误杀。检查问题码与精确路径。
9. 审计项目契约原 `PROJECT_INTEGRITY` 七类语义：裁决、时间戳、责任主体、哈希、包 path/role、上游 reader 兼容和敏感模型标识。每类必须产生区分度足够的稳定 code+path；用 G1-07 复审的 module hook 方法证明 reader 漂移门禁仍真实活着。确认 Schema 变动没有暗中改变已冻结数据语义或让 PB-05A 的遗留项被虚假关闭。
10. 检查工具版本、许可证、npm 官方来源、SRI、根依赖和 lockfile 是否一致，安装是否仍使用 D 盘 store；不得引入 GPL/AGPL、浮动版本或把缓存重新写回 C 盘。
11. 检查格式化基线造成的大范围机械 diff 是否只有格式变化；寻找 JSON/Schema/fixture、生成脚本或既有测试被格式化意外改义。核对 `git diff --check`、工作树状态和禁止语法计数。
12. 评估实现是否为结构性门禁，而非只对已知 fixture 点状封堵；特别寻找“质量工具自身不受质量工具约束”、扫描器与测试发现器对同一文件给出不同答案、或 verify 绿色但有代码从未执行的组合漏洞。

## 4. 可复跑环境与已知实施自检

PowerShell 使用锁定的 D 盘环境：

```powershell
$env:PATH = 'D:\DevTools\pnpm;D:\Applications\Node\node-v24.17.0-win-x64;' + $env:PATH
$env:COREPACK_HOME = 'D:\DevCaches\Corepack'
$env:PNPM_HOME = 'D:\DevTools\pnpm'
$env:PNPM_STORE_DIR = 'D:\DevCaches\pnpm-store'
$env:CI = 'true'
pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store
pnpm verify
```

实施者最后一次 `pnpm verify` 为 exit 0：质量扫描 55 个源码/配置文件、182 个仓库文件；测试分层 12 个文件；共 113 项测试通过；9 个工作区包 typecheck 完成；Vite production build 完成。实施者另将一个生成文件增加一行，统一漂移检查以 exit 1 拒绝，再用生成器恢复并复跑全绿。这些数字只供核对漏跑，不是审计结论。

## 5. 报告要求

严重级别：

- `BLOCKER`：安全/数据/治理根基错误或完成证据虚假；
- `MAJOR`：会使后续任务绕过质量门禁、产生显著返工或错误兼容；
- `MINOR`：局部质量问题，不影响 G1-09 作为当前前置；
- `NOTE`：已核验事实或后续提醒，不算缺陷。

每项发现必须包含唯一 ID、严重级别、标题、文件与行号、独立复现方式、实际/预期结果、影响和建议归属。报告末尾列出实际命令、未执行项、发现数量和最终结论。若给 `CONDITIONAL PASS`，每项未关闭 MINOR 必须写明后续原子任务和最迟关闭点；没有明确归属时不得条件放行。
