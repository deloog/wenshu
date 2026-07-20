# Claude 独立审计任务书：G1-07

> 状态：待执行　审计者：Claude　实施者：Codex　日期：2026-07-20

## 目标与范围

独立审计 `1d699db..HEAD` 中 G1-07 的项目、知识包、语义审计与兼容契约，判断其能否成为 PB-05/06/07/08/11 的可信前置。不要实现或修复代码，不要审计尚未选择的数据库或尚未实现的 ZIP/文件 IO。

权威依据至少包括 `CONSTITUTION.md`、`AGENTS.md`、`docs/data-inventory.md`、`docs/compatibility.md`、`docs/testing-strategy.md`、`docs/technical-baseline.md`、`docs/implementation-roadmap.md`、`docs/project-contract.md` 与 ADR-0004。

## 强制反测

1. 判断真源/派生分类是否能被 role、required、rebuildable 的组合绕过，索引是否可能成为唯一真源。
2. 对 knowledge bundle 篡改项目 ID、审计 ID/序号、文档/模板/材料哈希、出处材料和正式版本批准事件；检查重复路径、缺项与历史版本。
3. 检查语义审计是否混入正文、prompt、原始响应、密钥、编辑器事务或 CRDT；actor/model、action/decision、来源引用是否可自相矛盾。
4. 对四类对象分别测试缺字段、未知字段、未来版本、错误 ID/哈希/时间、20,000 层输入、宽输入、循环和自有/继承访问器。
5. 检查 JSON round-trip 是否只证明契约序列化而没有虚假声称真实文件/数据库重导入；确认 PB-09/PB-11 门禁仍保留。
6. 检查兼容原则是否允许静默读取、原地改写旧 Schema、伪造空迁移，或把数据库 schema 与开放交换格式绑定。
7. 用 `tsc --listFiles` 确认 src/test/scripts 全覆盖；检查手写 `any`、抑制指令、生成漂移和文件体量。

使用项目锁定的 D 盘 Node/pnpm 环境运行冻结安装和 `pnpm verify`。可增加只读临时探针，但不得修改源码、生成物、lockfile 或 Git 历史。

## 报告与门槛

只允许创建或编辑 `docs/audits/G1-07-claude-audit-report.md`。每项发现包含 ID、严重级别、证据、复现、影响和建议；列明实际命令与未执行项。

最终结论只能是 `PASS`、`CONDITIONAL PASS` 或 `FAIL`。存在未关闭 BLOCKER/MAJOR 时必须 `FAIL`，相关消费者不得启动；一般问题只有在明确绑定后续原子任务时才能条件通过。
