# G2-02 独立审计 MINOR（G2-M1）整改记录

> 日期：2026-07-23　对应报告：`docs/audits/G2-02-claude-audit-report.md`（CONDITIONAL PASS）　状态：已修复，待 Claude 复审关闭；实施者不自行关闭。

## G2-M1 — 冻结工具链记录无检查读取（已修复）

- 问题属实：`toolchain.versions.json`（G1-02/ADR-0002 冻结记录）此前无任何检查消费；dependabot 提出的大版本升级若被修好构建+重建 SBOM，可在冻结记录静默失同步下全绿合入。
- 整改：`tools/supply-chain/src/toolchain.ts` 新增 `checkToolchainPins`，挂入既有 `supply:check`（未新造命令，随 verify 与 CI `security` 双侧执行）：
  - `node` ↔ 根 `engines.node`；`pnpm` ↔ 根 `packageManager`；
  - typescript/eslint/@eslint/js/typescript-eslint/prettier/vite 六项 pin ↔ SBOM 直接依赖解析版本；
  - 任一不一致即 `TOOLCHAIN_DRIFT` 阻断；缺 pin、缺 manifest、pin 非字符串均 fail-closed。
- 决定性：单测证明 typescript 6.0.3→7.0.2 bump（冻结记录未同步）即报 DRIFT 且命中正确包名；engines/packageManager 漂移同样命中；缺 pin fail-closed。集成测试断言真实树 8 pin 全对齐（当前输出：`8 toolchain pins aligned`）。
- electron/devecoStudio 为 record-only（非 npm 安装），在代码注释中声明：若未来成为 npm 依赖必须先入 pin 表。
- 三个 dependabot PR（#2/#3/#4）按审计建议暂不合并，作为活跃证据留给复审。

## 实施者验证

- `pnpm supply:check`：147 包无漂移、政策零命中、8 pin 对齐；单测 4/4（含 bump 决定性）；`pnpm verify` 退出 0。
