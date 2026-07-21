# G1-15 供应链初审与 SBOM/许可证基线独立审计任务书（交给 Claude）

> 日期：2026-07-21　实施基线：G1-15 实施提交（见 git log 中 `feat: record G1-15 supply chain baseline`）　报告目标：`docs/audits/G1-15-claude-audit-report.md`

## 1. 角色与写入边界

你是独立只读审计者。不要采信实施记录、`supply-chain.md`、`sbom/sbom.json`、许可结论或测试全绿自述；从 lockfile、安装树、npm 官方元数据与上游许可证原文独立取证。

- 只允许新增或修改审计报告 `docs/audits/G1-15-claude-audit-report.md`。
- 不得修改代码、测试、SBOM、manifest、lockfile、路线图、配置、Schema、生成物或 `.prettierignore`。
- 仓库外探针只写 `D:\tmp\g115*`，结束后删除；不得安装/移除依赖、push、创建 PR 或触发 Actions。
- 完成时工作树除实施方既有改动外，只能多出审计报告一处审计者修改。

## 2. 依赖清单完整性（核心）

- 以冻结 lockfile 为真源，独立重建完整包清单（名称+版本+直接/传递），与 `sbom/sbom.json` 逐项对账；至少用一种不同于项目扫描器的路径（如直接解析 `pnpm-lock.yaml` 的 `packages`/`snapshots` 段）复算包数与版本。
- 直接/传递判定专项：核对 catalog 解析（`pnpm-workspace.yaml`）与各 manifest 声明，确认 `ajv@8.20.0` 为 direct、`ajv@6.15.0` 为传递；检查是否还有其他同名多版本包被错误归类。
- 抽查若干传递包的父链（谁引入 lightningcss、argparse、minimatch、ajv@6），确认 SBOM 未漏报任何已安装包、未虚报不存在包。
- 确认无镜像/私有源替换：lockfile 解析地址为 npm 官方注册表。

## 3. 许可证专项

- 独立重扫全部 115 个包的许可字段，确认无 GPL/AGPL/未知/多表达式被放行；政策表（宽松白名单 + 三个受审许可）与实际树一一对应。
- 对三个书面结论独立核验上游许可证原文与义务分析：
  - MPL-2.0（lightningcss ×2）：确认项目未修改其文件、以库/二进制形式消费；检查"文件级 copyleft 不传染"结论是否成立、LICENSE 是否随包保留；
  - Python-2.0（argparse@2.0.1）：确认该包确为该许可、仅构建期存在、不进入产品运行时；
  - BlueOak-1.0.0（minimatch@10.2.5）：确认宽松等价判断。
- 结论必须为书面且不夹带例外；如发现第四种非宽松许可或结论不成立，至少 MAJOR。

## 4. 漏洞与工具诚实性

- 独立运行 `pnpm audit --json` 复核 0/0/0/0/0；说明该证据的时点性与查询源。
- 评估"漏洞查询不设为 verify 门禁"的理由（网络依赖破坏离线确定性）是否成立，替代机制（复跑时点）是否明确。

## 5. 门禁、守卫与范围诚实性

- 运行 `pnpm supply:check`、`pnpm quality:check`、`pnpm test:unit`、`pnpm ci:job security`、`pnpm ci:job static`、`pnpm verify`，记录计数。
- 决定性变异：在仓库外副本中——SBOM 改一字节（漂移应失败）；某包许可改为 GPL/未知（政策应拦截且命中正确包）；manifest 删除一个实际 import 的依赖声明（phantom 应报错）；catalog 改名导致声明无法解析（应 fail-closed 而非静默归为传递）。确认每个守卫被对应测试承重，无代打。
- `phantom-dependency` 扫描器专项：确认使用 TS 编译器 API 而非正则碰运气；多行 import、`import type`、动态 `import()`、re-export、三斜线引用、scoped 包均有覆盖；`@types/*` 豁免不会放过真实运行时依赖。
- CR-01 关闭核验：`tools/quality` 声明 `eslint@10.7.0` 与根一致；冻结安装通过；phantom 守卫为系统性防护而非单点修复。**CR-01 的关闭签署权属于本审计**。
- 新包全部 `src/test/scripts` 进入 strict typecheck；零手写 `any`/抑制；lockfile 仅新增 workspace importer 与 eslint 声明移动；`.prettierignore` 仅新增 `sbom/`。
- 对比实施基线：G1-14 审计基线文件（`tools/environment`、`artifacts/reference-machine`、`.gitignore` 放行段、`docs/reference-machine.md`）零漂移；冻结 fixture/字体/Schema/workflow 零漂移；无新增第三方运行时依赖、无费用。

## 6. 结论规则

报告列出执行命令、独立上游证据、反例、未执行项、工作树边界及 BLOCKER/MAJOR/MINOR/NOTE：

- 依赖清单与实际树不符、GPL/AGPL/未知许可被放行、三个书面结论任一不成立、SBOM 可漂移而门禁保持绿色、phantom 守卫可被绕过、CR-01 未系统性关闭，或 verify/CI 可保持绿色地漏跑 supply 检查：`FAIL — G1-15 不得完成，G1-16 不得签署`。
- 无 BLOCKER/MAJOR，且 MINOR 均有明确归属和最迟关闭点：可给 `CONDITIONAL PASS`。
- 完全满足且无未关闭发现可给 `PASS`，并同时签署 CR-01 关闭。审计者只给结论，不修改路线图或自行关闭任务；由 Codex 根据报告整改或完成台账。
