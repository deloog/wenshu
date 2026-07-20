# G1-09 首审整改记录

> 状态：已实施，待原 Claude 审计者复审　日期：2026-07-20

本记录只说明实施动作和自检范围，不代表发现已关闭。关闭权仍属于出具 [G1-09 审计报告](G1-09-claude-audit-report.md)的独立审计者。

| 发现 | 实施动作 | 复审重点 |
|---|---|---|
| M-01 `.mts/.cts` 四道门禁缺口 | 将 `.mts/.cts` 纳入 ESLint TypeScript 配置、AST 扫描、生产/测试体量与逐包 typecheck 覆盖；已知代码扩展名大小写非规范时直接失败 | `.mts/.cts` 中显式 `any`、超长文件和 tsconfig 漏 include 均须失败；`.TS` 不得静默进入代码库 |
| M-02 生成目录自助豁免 | ESLint/Prettier 不再忽略整个 `src/generated`；四个生成包在 manifest 精确登记产物，质量工具拒绝无登记包、失踪登记和目录内额外文件；只有精确登记文件豁免手写体量 | 在 `src/generated/` 新增任意文件必须失败，登记文件仍通过 format/lint/禁止语法/漂移检查 |
| m-01 project 非法 fixture 硬编码 | 改为读取并排序 `fixtures/invalid/*.json`，元数据缺失仍立即失败 | 临时新增非法 fixture 必须被自动执行 |
| m-02 泛化 `/` 路径 | Ajv `required` 错误使用缺失字段组成 JSON Pointer；fixture 改断言 `PROJECT_SCHEMA@/revision` | 交换到其他缺失字段或 `/` 必须失败 |
| m-03 Schema 静默放宽 | 恢复 provider/model 的冻结 Schema 正则；在安全结构预检后、Ajv 之前返回专用模型标识诊断，维持七类错误码而不扩大 Schema 接受集合 | Schema 应与 G1-07 基线一致，`sk-*` 等仍返回专用 code/path |
| m-04 Host 合法值误杀 | 区分绝对盘符和有边界的盘符相对路径；只把疑似编码的畸形 `%` 拒绝，裸百分号保留；增加百分比、anchor/mode、mailto/data、HTTP/HTTPS 正向对照 | 首审 27 项敌意矩阵不得回归，合法对照全部通过 |
| m-05 测试目录名误判 | `discoverTestFiles` 只检查 `basename`，不再把父目录的 `.test.`/`.spec.` 当成文件后缀 | `fixtures.test.data/plain.json` 不得成为测试候选，真实大小写变体测试文件仍须被发现并拒绝分类 |
| m-06 BlueOak 许可 | 在路线图 G1-15 的范围、验收和停止条件中显式加入 BlueOak-1.0.0；本任务不越权批准许可证例外 | G1-15 最迟 G1-16 前给出书面结论或移除依赖 |

G1-08 RA-01/RA-02、G1-07 NF-01/NF-02/NF-03 仍按原任务归属，未在本整改中宣称关闭。
