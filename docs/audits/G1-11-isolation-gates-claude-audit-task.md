# G1-11 隔离设施硬门禁独立审计任务书（交给 Claude）

> 审计对象：`705cbce..1426cee`　审计角色：未参与本轮实施的 Claude

## 1. 审计目标与边界

只读审计 G1-08 复审 `RA-01`/`RA-02` 是否已由 G1-11 第一阶段真实关闭，并判断能否开始编写首次调用证据/清理 API 的并行 runner。

- 不采信 [实施记录](G1-11-isolation-gates-remediation.md)或 `pnpm verify` 全绿，必须另写反例。
- 本阶段没有 CI workflow 或并行 runner；若实施记录虚假声称已有，也应报告。
- 可读取全仓库、运行只读命令，并在系统临时目录或测试受控目录构造可完整清理的破坏性探针。
- 不得修改代码、配置、测试、路线图、锁文件或 Git 历史。
- 唯一允许新增的仓库文件是 `docs/audits/G1-11-isolation-gates-claude-audit-report.md`；完成后工作树必须只有该报告。

## 2. RA-01：证据写入的运行时所有权

不得只检查 TypeScript 类型。至少验证：

1. `buildTestIsolation` 的未准备对象不能写证据。
2. `structuredClone`/JSON 往返后失去品牌的对象不能写；对象展开或复制 Symbol 品牌、claim token 和全部路径后仍不能写。
3. 从真实句柄枚举并复制品牌 Symbol 的伪造对象不能写，证明不是“知道 Symbol 就能过”。
4. 磁盘 `worker.claim` 被改写、删除、替换为目录或符号链接时必须拒绝，且不得创建 case 目录或半份证据。
5. `database/`、`files/`、`evidence/` 任一被换成文件、符号链接或 Windows junction 时必须拒绝；不得向受控根外写入。
6. 已成功清理的旧句柄不得复用；同 run/index 新取得的句柄不得被旧对象冒用。
7. 证据声明 `layer` 与 worker 层不一致时拒绝且不写入；一致时合法 evidence 仍成功。
8. 原型、访问器或 Proxy 形态若可能触发 getter，应记录调用次数和影响；不要把同进程调用者可直接 `fs.rm` 的能力误报成安全边界，但要判断 API 是否履行文档承诺。

重点判断 WeakSet 身份、Symbol 品牌、冻结对象、真实目录与真实 claim 文件是否形成同一条运行时守卫，而非多套强度不同的检查。

## 3. RA-02：失败证据与清理

至少验证：

1. API 写出的 `failure.json`/`diagnostic.log` 非空时，成功清理拒绝，拒绝前后字节完全一致。
2. 直接放入 screenshot、trace、隐藏文件、空子目录或多层目录中的任意一种，也必须拒绝；不能只识别固定文件名。
3. 空 `evidence/` 的合法成功清理仍可用，只删除自己的 worker 叶目录，不影响兄弟 worker 和受控根。
4. 不存在 `force`、布尔开关、环境变量或第二清理入口可静默绕过。
5. 证据写入先调用、清理紧随其后并发启动时，证据必须完成且清理拒绝；证据保持完整。
6. 清理先调用并实际完成、证据随后排队时，旧句柄写入必须拒绝，不能在已删除目录上重建。
7. 两个不同 case 的并发证据写入应按设计安全完成；一次重复 case/层级错误失败后，操作队列必须释放，后续合法操作不能永久挂起。

请主动寻找 TOCTOU、队列未释放、Promise 永久 pending、清理后 WeakSet 残留和部分写入等新反例。

## 4. 回归与测试有效性

- 检查新增 `evidence-ownership.unit.test.ts` 被层级审计发现、登记为 unit 并真实执行；逐条判断断言是否会因错误原因通过。
- 对关键反测做破坏性验证：在仓库外副本移除 WeakSet 身份检查、非空 evidence 检查或操作串行化后，对应测试必须失败。
- 独立运行 `pnpm verify`，记录测试文件数、测试总数、typecheck 包数、构建和体量结果。
- 确认没有新增依赖、宽泛 ignore、显式 `any`、抑制指令或冻结契约变化。
- 确认 G1-11 尚未越过硬门禁编写 runner/workflow，G1-01R 文档变化不应被误算为隔离实现能力。

## 5. 判定规则

- 任一 `BLOCKER`/`MAJOR`，或 RA-01/RA-02 的核心原始反例仍成立：`FAIL`，不得编写并行 runner。
- 两项均关闭且无新增未归属发现：`PASS`。
- 仅有不影响首次 runner 安全、并已明确归属和最迟关闭点的新 `MINOR`：可 `CONDITIONAL PASS`，但必须解释为何不阻断。

报告必须给出逐项反例矩阵、并发结果、破坏性验证、未执行项、工作树状态以及最终 `PASS / CONDITIONAL PASS / FAIL`。审计者只签署事实，不提供或应用补丁。
