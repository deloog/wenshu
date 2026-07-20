# G1-09 CF-01 / RA-01 最终复核任务书（交给 Claude）

> 审计对象：`3dc79cc..96a5a44`　复核角色：发现 `CF-01` 的原 Claude 审计者

## 1. 范围与权限

本轮只复核 `CF-01` 与 `RA-01`，并检查这次极小整改是否引入新的同级或更高问题。`RA-02`、`RA-03`、`RA-04` 已由上一轮确认关闭，**无需重跑**。

- 不采信 [CF-01 整改记录](G1-09-cf01-remediation.md) 或 `pnpm verify` 的自述，必须独立复现。
- 可只读检查仓库、运行命令，并在系统临时目录构造可完整清理的探针。
- 不得修改代码、配置、测试、路线图、锁文件或 Git 历史。
- 唯一允许修改的仓库文件是 [G1-09 审计报告](G1-09-claude-audit-report.md)：在末尾追加最终复核章节，保留全部历史记录。
- 完成后确认工作树中只有该报告文件发生变化。

## 2. CF-01 必测矩阵

使用 ESLint 官方配置求解能力，对真实仓库配置独立统计 `eslint.configs.recommended` 的 64 条规则中实际启用数：

```text
.ts  = 45
.js  = 64
.jsx = 64
```

同时抽查 `.tsx/.mts/.cts/.mjs/.cjs`：

- 四种 TypeScript 扩展名必须保有 `no-debugger`、`use-isnan`、`valid-typeof` 等基础规则，以及 `@typescript-eslint/no-explicit-any`。
- `.js/.mjs/.cjs/.jsx` 必须保有 JavaScript recommended；不得错误套用需 TypeScript 类型信息的规则。
- 核对修复确为“不限定 `eslint.configs.recommended` + 单独 `.jsx` 解析块”，不存在另一个后续配置块再次关闭这些规则。

不得只检查配置对象。请在仓库外副本或临时探针中运行真实 ESLint：

- 含 `debugger` 和无效 `NaN` 比较的 `.ts` 必须分别命中 `no-debugger`、`use-isnan`。
- 含未使用变量的 `.jsx` 必须命中 `no-unused-vars`；合法 JSX 必须能解析并通过。
- 正常 `.ts` 与 `.jsx` 对照不得因解析配置冲突而误报。

## 3. 回归测试有效性

重点审查新增的 `tools/quality/test/eslint-config.unit.test.ts`：

- 必须被全仓测试分层发现、登记为 unit，并在 `pnpm verify` 中真实执行两项测试。
- 断言必须检查实际生效规则及 severity，不得只检查键是否存在或自比较配置常量。
- 做一个最小破坏性验证：在仓库外副本中模拟把 recommended 再次限定为 JavaScript，新增测试必须失败；仅修改无关配置时不得误报。
- 测试自身必须接受 ESLint、typecheck、禁止 `any`/抑制与体量门禁。

## 4. 共同检查与结论

- 使用 D 盘 Node 24.17.0、pnpm 11.15.1 和 D 盘 store，独立运行 `pnpm verify`，记录测试文件数、测试总数、typecheck 包数与构建结果。
- 核对本轮没有修改 `pnpm-lock.yaml`、`tsconfig.base.json`、冻结 Schema 或生成物，没有新增依赖、宽泛 ignore、显式 `any` 或抑制指令。
- 列出所有未执行项；删除全部临时探针。

判定规则：

- `CF-01` 原反例仍成立，或新增 `BLOCKER/MAJOR`：`FAIL`，G1-11 不得启动。
- `CF-01` 与 `RA-01` 均关闭、无新增未归属发现：`PASS`。
- 仅存在不阻断且有明确归属/最迟关闭点的新 `MINOR` 时，才可 `CONDITIONAL PASS`。

请在报告末尾明确签署 `CF-01`、`RA-01` 的逐项状态及最终 `PASS / CONDITIONAL PASS / FAIL`。审计者只签署事实，不提供或应用补丁。
