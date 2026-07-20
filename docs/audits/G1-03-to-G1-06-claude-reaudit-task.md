# Claude 独立复审任务书：G1-03～G1-06

> 审计者：Claude　实施者：Codex　日期：2026-07-20　状态：已完成（`CONDITIONAL PASS`）

## 目标

以原 [审计报告](G1-03-to-G1-06-claude-audit-report.md) 为发现清单，独立检查 [整改记录](G1-03-to-G1-06-remediation.md) 对每项发现的处置是否真实、充分且没有引入新问题。不要实现或修复代码。审计范围为 `ac6d4df..HEAD`，其中 `ac6d4df` 只归档原报告；请同时复跑原报告中的只读反例探针。

## 强制复核

1. 对 B-01 的全部替代键名和 Windows/POSIX/UNC/编码路径变体重新探测，确认安全性不再依赖键名黑名单。
2. 用 TypeScript 自身的文件清单确认 document-model 测试和 Vite 配置进入严格检查，并确认零手写 `any` 没有新绕过。
3. 对 document/template/Host 构造 20,000 层输入和继承访问器，确认不抛未捕获异常且访问器调用次数为 0。
4. 验证文档资源路径正向白名单不会接受盘符、URL、绝对路径或遍历，也不会误拒当前合法 fixture。
5. 反测 Host 会话的重复终态、未知请求、unsupported 能力、未声明错误、进度倒退和非法取消。
6. 确认配置运行时确实执行 JSON Schema、Schema/常量枚举有漂移检查，Vite 配置参加 typecheck。
7. 逐项判定原报告的 BLOCKER、MAJOR、MINOR 是否关闭、降级或有合规延期；另报告本次修复引入的新发现。

使用原任务书中的 D 盘环境运行冻结安装和 `pnpm verify`。不得运行自动修复、生成写入或 Git 历史修改命令。

## 输出与门槛

只允许编辑 `docs/audits/G1-03-to-G1-06-claude-audit-report.md`，在原报告后追加带日期的“复审”章节；不要编辑整改记录、路线图、代码或其他文件。若原报告含实际 NUL 字节，请仅在该报告中把它改成 `\\u0000` 可读文本。

结论仍只能为 `PASS`、`CONDITIONAL PASS` 或 `FAIL`。存在任何未关闭 BLOCKER/MAJOR 时必须 `FAIL`，禁止进入 `G1-07`；只有独立复审签署后，实施者才可更新最终任务状态。
