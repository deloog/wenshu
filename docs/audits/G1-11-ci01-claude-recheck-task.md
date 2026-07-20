# G1-11 CI-01 定点复核任务书（交给 Claude）

> 日期：2026-07-20　原报告：[G1-11-ci-claude-audit-report.md](G1-11-ci-claude-audit-report.md)　整改提交：`7ab7417`　复核范围：`47e1a9d..7ab7417`

## 1. 权限与输出

你是原独立审计角色，只复核首审唯一 MAJOR `CI-01` 及本次修复是否引入同等级回归。不要采信 [整改记录](G1-11-ci01-remediation.md)或全绿自述。

- 只允许**追加**修改原报告 `docs/audits/G1-11-ci-claude-audit-report.md`，不得改写首审记录。
- 不得修改代码、测试、workflow、lockfile、路线图、配置或其他文档。
- 探针只写 `D:\tmp\g111*`，结束后删除；不得 push、创建 PR、触发 Actions 或改变远程。
- 完成时工作树只能有原报告这一处修改。

`CI-02`～`CI-05` 不在本次修复范围，保持首审 MINOR 与既定归属；不要因未顺手修复而阻断 CI-01 复核。

## 2. 必须重跑的原始反例

在仓库外临时 Git 仓库使用真实 `secrets:check` 入口重现首审场景：

1. 唯一跟踪文件为合法形态 AWS access key 加一个 NUL 字节：必须 exit 1，命中 `AWS access key`。
2. 同一内容去掉 NUL：仍必须 exit 1，不能修 NUL 后破坏普通文本检测。
3. 三个跟踪文件中一个为 NUL-bearing secret：整体必须 exit 1；不得输出 `Secret scan passed`。
4. 诊断只能包含路径和模式标签，不得回显密钥原文或含密钥的整行。

首审 `CI-01` 的关闭标准不是“显式报告 skipped 后降为 MINOR”，而应按本次实现实际声明核对：NUL-bearing 普通文件内容确实被扫描，不存在静默跳过，成功计数只在全部跟踪项均已检查或已 fail-closed 时出现。

## 3. 新变体与合法对照

不要只测原始单一形态，至少覆盖：

- NUL 在 key 前、key 后、文件首尾、多 NUL；ASCII key 周围含无效 UTF-8 字节。
- AWS、GitHub、OpenAI 风格 key、私钥头各至少一个 NUL-bearing 文件。
- NUL-only、普通二进制字节、干净 UTF-8 文本应正常通过；成功计数必须等于实际跟踪文件数。
- 禁止文件名、符号链接和读取失败仍 fail-closed；不得因移除 NUL 分支而跟随仓库外链接。
- 暂存新文件与已跟踪修改仍进入扫描，纯 untracked 边界保持文档所述。

注意：NUL 若插入 token 字符序列内部，字符串本身已不再是原模式，不应据此制造不合理要求；重点是文件中存在完整 ASCII 高置信度模式时，其他位置的任意二进制字节不能让整文件跳过。

## 4. 测试承重与共同检查

- 基线运行 `pnpm --filter @wenshu/ci test`、`typecheck`、`pnpm secrets:check`、`pnpm ci:verify`、`pnpm verify`，记录真实计数。
- 在仓库外副本重新插回首审的 `content.includes(0) → continue`：新增测试必须失败，且实际为“期待 AWS finding、收到空数组”。
- 删除新增 NUL 测试或让断言恒真不得算破坏性验证；测试须从包目录与仓库根均可运行。
- 核对修复只涉及 secrets 实现/测试/对应文档，零手写 `any`、抑制指令、宽泛 ignore、lockfile/Schema/workflow 漂移。
- 确认文档没有把 CI-01 写成已由实施者关闭，没有把本地验证冒充远程成功；workflow 仍不在 `origin/main`。

## 5. 结论规则与追加格式

在原报告末尾追加“CI-01 定点复核”章节，列出原始反例、新变体、破坏性验证、命令、工作树边界、未执行项与结论：

- 原反例仍可静默通过、成功计数仍虚高，或新增 BLOCKER/MAJOR：`FAIL — 仍不得推送 workflow`。
- CI-01 关闭且无新 BLOCKER/MAJOR：`CONDITIONAL PASS — 允许业主授权首次远程运行`；CI-02～CI-05 保持 MINOR，G1-11 仍须在远程成功及收尾审计前保持未完成。

即使放行，也不得由你或本任务实际推送、触发 workflow；只签署是否可以进入业主授权步骤。
