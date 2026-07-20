# G1-08 条件通过后续项

> 来源：[G1-08 Claude 独立审计报告](G1-08-claude-audit-report.md)复审追加记录　日期：2026-07-20

G1-08 已获 `CONDITIONAL PASS`，首审 3 项 MAJOR 与 5 项 MINOR 全部关闭。下列复审新增 MINOR 不阻止 G1-08 作为测试分层与并行隔离前置，但必须由 G1-11 在编写并行 runner 之前落实并接受独立审计；本文件只登记归属，不代表发现已经关闭。

| 发现 | 归属任务 | 最迟关闭点 | 验收重点 |
|---|---|---|---|
| RA-01：`writeFailureEvidence` 只有类型层面的 prepared claim 约束 | G1-11 | 并行 runner 首次调用证据 API 前 | 运行时同时验证 Symbol 品牌、worker 真实目录和磁盘 claim；未准备、失去品牌、错误/被篡改 claim 全部拒绝且不得写入 |
| RA-02：成功清理可删除非空失败证据目录 | G1-11 | 并行 runner 首次调用清理 API 前 | `evidence/` 非空时清理必须 fail-closed，失败 manifest/log/截图/trace 保持原样；不提供静默 force 绕过 |

两项应使用同一 prepared-isolation 运行时守卫，避免证据写入与清理形成两套不同强度的所有权判断。
