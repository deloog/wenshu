# G1-14 独立审计 MINOR（EN-01～EN-03）整改记录

> 日期：2026-07-21　对应报告：`docs/audits/G1-14-claude-audit-report.md`（CONDITIONAL PASS）　状态：已修复，待 Claude 复审关闭；实施者不自行关闭。

## EN-01 — 根 verify 链 environment 接线无测试（已修复）

- 新增 `tools/environment/test/wiring.contract.test.ts`，与 fixtures/fonts 先例一致：断言根 `package.json` 的 `environment:check` 脚本内容精确等于 `pnpm --filter @wenshu/environment check`，且 `verify` 链含 `pnpm environment:check`。删除命令或改脚本即变红。
- 整改前 CI `contracts` 作业侧已有互锁（作业枚举测试）；本次补齐本地 verify 侧保护，三处接线（verify、CI 作业、作业枚举测试）现均承重。

## EN-02 — `.gitignore` 放行过宽（已修复）

- 原 `!artifacts/reference-machine/` 放行整个目录。改为四行精确规则：`artifacts/*` + `!artifacts/reference-machine/` + `artifacts/reference-machine/*` + `!artifacts/reference-machine/environment.json`。
- 探针验证：`artifacts/reference-machine/other.json` 与 `artifacts/reference-machine/subdir/x.json` 均被忽略，`environment.json` 仍可提交，`artifacts/manual-baseline` 等其他产物忽略不变；秘密模式不受影响。

## EN-03 — 未使用的 `@wenshu/test-support` 依赖声明（已修复）

- 从 `tools/environment/package.json` 移除该声明；`pnpm install` 后 lockfile 仅减少 3 行（该 importer 的依赖条目），无其他漂移。

## 实施者验证

- `pnpm verify` 退出 0：quality 100/281、layers 27、unit 37、environment 契约 6/6（含新接线测试）+ 集成 1/1、typecheck 13 包、build 全绿。
- 未触碰：`tools/environment/src`、`artifacts/reference-machine/environment.json`、`docs/reference-machine.md` 语义内容、冻结 fixture/字体、workflow。NOTE 项（子记录键逐一用例、批次目录约定）按报告无需整改。
