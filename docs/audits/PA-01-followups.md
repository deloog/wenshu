# PA-01 审计后续项

> 来源：[PA-01 Claude 独立审计报告](PA-01-claude-audit-report.md) §5/§6/§8　日期：2026-07-24

PA-01 首审 `FAIL` 的唯一阻断 PA-A1 与建议同轮的 PA-A2/PA-A3 已修复（见 [PA-01-paa1-paa3-remediation.md](PA-01-paa1-paa3-remediation.md)），复审 `PASS` 签署（生效条件=远程 CI 8/8 复现，已经 run `30067276449` 达成）。下列 MINOR 与观察项**不阻断 PA-01 签署**，但必须按归属关闭；本文件只登记归属，不代表发现已经关闭。PA-A8 为复审新增发现。

| 发现 | 归属任务 | 最迟关闭点 | 验收重点 |
|---|---|---|---|
| PA-A4：UTF-8 BOM 被拒且错误信息误导（指向"缺 front matter 围栏"） | **已关闭**（[PA-A4-A8-remediation.md](PA-A4-A8-remediation.md)；Claude 审计 `PASS` 签署，见 [PA-A4-A8-claude-audit-report.md](PA-A4-A8-claude-audit-report.md)） | 本批（PA-03 前置） | 裁定取「剥离计账」：前导 BOM 计入第 1 行 syntaxChars，对账对原始文件闭合；BOM+CRLF 组合端到端测试；变异自证变红 |
| PA-A8：控制字符（U+0000 NUL、ESC、DEL、U+2028）与行中孤立 `\r` 原样进入 `paragraph.text` | **已关闭**（[PA-A4-A8-remediation.md](PA-A4-A8-remediation.md)；Claude 审计 `PASS` 签署，PA-03 前置满足） | 本批（PA-03 前置） | 裁定取「fail-closed」：C0（保留 `\t`）/DEL/C1/U+2028/2029/孤立 `\r` 一律拒绝，错误仅带行号+码点；8 形态枚举测试 + `\t` 保留；变异自证变红且无邻近守卫代打 |
| PA-A5：序数打包 `ordinal*10000+row*100+col` 非单射，百行表格/列表失败关闭且报错不指真因 | [决策 #8](../决策记录.md) 已批准；**已关闭**（[实施记录](PA-A5-A6-implementation-record.md)；Claude 审计 `PASS`，远程 CI 复现签署生效） | **PA-02 开工前** | 已落地：复合摘要种子（构造单射）+ kind 非数字词汇表守卫；issues（code/path）进入错误信息；PA-A1-b 触发器已替换为 title 超 500（变异自证决定性）；101 行表格/列表反例现被接受且 ID 唯一 |
| PA-A6：`documentId` 仅由 title 派生，同名不同文文档身份碰撞 | [决策 #9](../决策记录.md) 已批准；**已关闭**（[实施记录](PA-A5-A6-implementation-record.md)；Claude 审计 `PASS`，远程 CI 复现签署生效） | **PA-02 开工前** | 已落地：importRoot 必填、越根 fail-closed（新码 `IMPORT_ROOT_INVALID`）；documentId=公共根相对路径+title；同名不同路径不同 ID/同路径幂等/改标题新身份均有决定性测试与变异自证。**实施期审查项：核真实调用点传公共根而非源文件目录**（当前唯一生产调用点 parse-fixture 传 fixtures 公共根） |
| PA-A7：front matter 非 title 键静默丢弃且记为「语法消费」 | 待排期（随 PA-A5/A6 决策一并裁定） | PA-02 开工前 | 二选一落定：(a) 非 title 键 fail-closed；(b) `ImportResult` 返回 `droppedMetadata` 并对账单列 `discardedChars` |

## 观察项（不计严重级别）

- **台账表述强度已修正**：审计 §6 指出逐行/汇总恒等式为构造恒真式，「全文逐字归账」的真实保证来自文档↔行账目检查与 schema 门禁。本轮已为两者补决定性测试（PA-A1），golden fixture 集成测试已补逐行恒等式断言；路线图 PA-01 行已同步修正表述。

> PA-A5/A6 实施审计（2026-07-24 `PASS`）的新发现 PA-B1（已修复待复核）与 PA-B2（观察，不整改）登记于 [PA-A5-A6-claude-audit-report.md](PA-A5-A6-claude-audit-report.md) 与 [PA-A5-A6-implementation-record.md](PA-A5-A6-implementation-record.md)，不在本文件重复登记。
- **行内强调位置信息丢失风险（审计 §3(2) 风险登记）**：fixture 中 `**` 全为行首标签式故无观感损失，但这是 fixture 性质而非输入性质；真实草稿句中强调会被无声剥离为普通文字。字重呈现交棒 PA-04 不解决模型层信息丢失，**须在 PA-15 交付观感风险清单中显式登记**，不得默认由 PA-04 承接。
