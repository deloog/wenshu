# Claude 独立审计任务书：G1-03～G1-06

> 状态：已完成（首审 `FAIL`，后续复审 `CONDITIONAL PASS`）　审计者：Claude　实施者：Codex　日期：2026-07-20

## 1. 目标与结论门槛

独立审计已经实现的 TypeScript 工程骨架、配置契约、文档模型、模板 DSL 与 Host 协议，判断它们能否作为 `G1-07` 的可信前置。不要实现或修复代码。

最终结论只能是：

- `PASS`：无未关闭阻断/重大问题，可以进入 `G1-07`；
- `CONDITIONAL PASS`：仅有不阻塞 `G1-07` 的一般问题，且每项已有明确后续任务；
- `FAIL`：存在阻断/重大问题，禁止进入 `G1-07`。

## 2. 审计边界

审计以下实施提交及其最终状态：

- `a0a8194`：G1-03 TypeScript strict + Vite 工作区；
- `02e05d9`：G1-03C 四环境配置契约；
- `870da85`：TypeScript 禁止 `any` 的治理变更；
- `9d444fc`：G1-04 文档模型；
- `65ee443`：G1-05 模板 DSL；
- `cab23e0`：G1-06 Host 能力协议。

权威依据至少包括：`CONSTITUTION.md`、`AGENTS.md`、冻结纲领、`DEFINITION-OF-READY.md`、`docs/implementation-roadmap.md`、`docs/testing-strategy.md`、`docs/threat-model.md`、`docs/technical-baseline.md`、相关 ADR 与各契约说明。

范围外：不要审计 DevEco 安装质量、WPS 人工基线结果、产品功能、数据库、真实 Electron/ArkWeb 实现；但若当前代码虚假声称已经证明这些能力，应报告。

## 3. 强制检查

1. 任务是否越过路线图范围，是否把未验证能力写成已完成事实。
2. TypeScript strict 和零 `any` 是否存在绕过，包括断言、生成类型、第三方声明边界和测试未纳入 typecheck。
3. 配置契约是否真正区分四环境、快速失败并避免秘密值泄漏。
4. 文档 Schema、稳定 ID、引用完整性、版本拒绝、冻结对象和生成漂移是否可靠；寻找合法输入被误拒、非法输入漏过及递归/资源耗尽问题。
5. 模板 DSL 是否确实无动态代码、文件、网络、系统能力；安全预检是否会执行 getter、被字段变体绕过，或因过宽/过窄导致风险。
6. Host 注册表、权限、参数/返回 Schema、调用预算、取消、进度、唯一终态、错误和降级是否足够明确；重点判断“只登记 Schema ID 而尚无具体 payload Schema”是否构成 `G1-06` 阻断。
7. 平台类型与任意路径是否可能穿透 Host；浏览器 fixture 是否被错误描述成真实平台能力证明。
8. 测试是否真正验证行为，是否存在测试与实现共享同一错误假设、只测快乐路径、fixture 无独立意义或人为漂移探针恢复不完整。
9. 依赖与 lockfile 是否最小、版本一致、许可证边界清楚；不要替代后续 `G1-15`，但报告当前阻断风险。
10. 代码组织、错误模型、版本兼容、文档和路线图台账是否一致；指出过度设计、过早冻结和会迫使后续破坏性迁移的决定。

## 4. 可复跑证据

在 PowerShell 中使用项目锁定的 D 盘环境：

```powershell
$env:PATH = 'D:\DevTools\pnpm;D:\Applications\Node\node-v24.17.0-win-x64;' + $env:PATH
$env:COREPACK_HOME = 'D:\DevCaches\Corepack'
$env:PNPM_HOME = 'D:\DevTools\pnpm'
$env:PNPM_STORE_DIR = 'D:\DevCaches\pnpm-store'
pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store
pnpm verify
```

还应执行 `git status --short`、检查上述提交的 diff，并按需要运行只读搜索。不得运行会修改源码、生成物、lockfile 或 Git 历史的命令；不要使用自动修复。

## 5. 报告要求

只允许创建或编辑：

`docs/audits/G1-03-to-G1-06-claude-audit-report.md`

严重级别：

- `BLOCKER`：安全/数据/契约根基错误，或验收虚假，必须修复后才能进入 G1-07；
- `MAJOR`：很可能造成下游返工、错误兼容或测试失真，原则上修复后才能进入 G1-07；
- `MINOR`：局部质量或文档问题，不影响当前依赖成立；
- `NOTE`：已核验事实或后续阶段提醒，不算缺陷。

每项发现必须包含：唯一 ID、严重级别、标题、证据文件与行号、可复现方式、影响、建议处理；不要直接给出或应用补丁。报告末尾列出实际运行命令、未执行项、发现数量和最终结论。
