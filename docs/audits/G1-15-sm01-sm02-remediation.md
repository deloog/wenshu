# G1-15 独立审计发现（SM-01 MAJOR / SM-02 MINOR）整改记录

> 日期：2026-07-21　对应报告：`docs/audits/G1-15-claude-audit-report.md`（FAIL，SM-01 阻断）　状态：已修复，待 Claude 复审关闭并连同签署 CR-01；实施者不自行关闭。

## SM-01（MAJOR）— SBOM 改用平台无关的 lockfile 真源（已修复）

- 问题属实：旧实现从 `node_modules/.pnpm` 安装树取数（115 项，仅含本平台已装包），Linux CI 重建必然漂移，交付基线过不了自身 CI 门禁。
- 整改：`buildPackageInventory` 改为解析冻结 `pnpm-lock.yaml`（lockfileVersion `9.0`，`yaml@2.9.0` ISC 解析，锁版本）——147 个包，含全部 27 个 os/cpu 专属可选二进制与 wasm32 链，跨平台字节级一致；不支持其他 lockfile 版本（fail-closed）。
- 许可数据：已安装包仍读 manifest `license`；未在本平台安装的包由 `src/license-overrides.ts` 受审覆盖表提供（33 条，许可经 npm 官方元数据核验：rolldown/emnapi/napi-rs/wasm-util=MIT、lightningcss 全家族=MPL-2.0、fsevents=MIT、tslib=0BSD）；已安装包与覆盖表冲突或两者皆无 → `SBOM_INVALID`。
- 政策白名单新增 `0BSD`（OSI 批准宽松许可，tslib@2.8.1）；书面记录于 supply-chain.md §3。
- 直接/传递判定改用 lockfile `importers` 段的解析版本（剥 peer 后缀），`yaml@2.9.0` 如实登记为第 10 个直接依赖。
- 新增集成断言：未安装于本机的 `@rolldown/binding-linux-x64-gnu` 必须在 SBOM 中且许可为 MIT（跨平台完整性承重）。

## SM-02（MINOR）— `@types/*` 豁免收紧为 type-only（已修复）

- `collectModuleImports` 现在区分值导入与类型导入（`import type`、`export type`、三斜线引用为 type-only；动态 `import()` 恒为值导入）。
- `@types/*` 豁免仅适用于 type-only 导入；值导入必须由本包 manifest 声明运行时依赖。新增决定性单测：仅声明 `@types/some-lib` 时值导入 `some-lib` 被拦截、类型导入放行。

## 实施者验证

- `pnpm verify` 退出 0：181 项 ✔；`Supply chain check passed: 147 packages (10 direct), license policy clean, no drift`；quality 115/304；typecheck 14 包。
- `pnpm sbom:build` 输出确定性（无时间戳）；CR-01 修复本体未动，待复审连同签署。
- 未触碰：冻结 fixture/字体、Schema/生成物、workflow、G1-14 基线文件。
