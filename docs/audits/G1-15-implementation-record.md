# G1-15 供应链初审与 SBOM/许可证基线实施记录

> 日期：2026-07-21　状态：已实现，待独立审计；本记录不关闭 G1-15，也不自行关闭 CR-01。

## 实施范围

- 新增 `@wenshu/supply-chain`（`tools/supply-chain`）：从实际安装树（`node_modules/.pnpm`）与各工作区 manifest 生成确定性 SBOM（契约 `0.1.0`，无时间戳、字节级可重建），直接/传递判定按名称+解析版本（catalog 从 `pnpm-workspace.yaml` 解析）；声明依赖无法匹配已安装版本即 `SBOM_INVALID` fail-closed。
- 生成并提交 `sbom/sbom.json`：115 个包（9 直接、106 传递），全部经 lockfile integrity 锁定。
- 许可政策门禁：宽松许可白名单直接通过；MPL-2.0/Python-2.0/BlueOak-1.0.0 需书面结论登记；GPL/AGPL/未知/组合表达式一律阻断；已接入根 `verify` 与 CI `security` 作业。
- CR-01：`tools/quality` 显式声明 `eslint@10.7.0`；新增 `phantom-dependency` 守卫（TS 编译器 API 提取静态/动态 import、re-export、三斜线类型引用），接入 `quality:check` 与 CI `static` 作业，系统性防止未声明依赖。
- [供应链基线文档](../supply-chain.md)：SBOM 方法、直接依赖用途表、三项非宽松许可书面结论、漏洞审查记录（2026-07-21 `pnpm audit` 全零）、复跑时点。
- 未新增任何第三方运行时依赖；漏洞查询需网络故不设为 verify 门禁（理由写入文档）。

## 已执行的反例与结果

- 直接/传递判定纠错：初版按名称判定把 `ajv@6.15.0`（ESLint 传递）误判为 direct，改为名称+版本解析后正确归为传递（9 直接）；声明版本无匹配安装时 fail-closed。
- phantom 守卫决定性：临时从 `tools/quality` manifest 删除 `eslint` 声明，`check-repository.ts` 立即报 `ERROR phantom-dependency … must declare eslint`；恢复后通过。
- 许可篡改反例：单测将 `eslint` 许可改为 `GPL-3.0-only`，政策检查唯一命中该包。
- 集成测试断言三个受审许可的实际分布恰好为 `lightningcss(+win32 二进制)/argparse/minimatch`，新增任何受审许可出现都会使测试失败。
- 开发中真实失败两处（共享数组冻结后二次排序、三斜线指令位置、prettier 对生成物）均已修复并留痕；`sbom/` 按生成物处理加入 `.prettierignore`。

## 实施者验证

- `pnpm verify` 退出 0：quality 114/300、layers 32、unit（含 phantom 3 项新增）、contracts、fixtures、fonts、environment、supply-chain（SBOM 无漂移、政策零命中）、typecheck 14 包、build 全绿，合计 180 项 ✔。
- `pnpm audit --json`：critical/high/moderate/low/info = 0/0/0/0/0。
- 未触碰：冻结 fixture/字体、Schema/生成物、workflow、G1-14 审计基线文件（`tools/environment`、`artifacts/reference-machine`、`.gitignore` 放行段、`docs/reference-machine.md`）。

## 待独立审计

实施者不得自行关闭 G1-15 与 CR-01；审计任务书见 [G1-15-claude-audit-task.md](G1-15-claude-audit-task.md)。
