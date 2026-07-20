# G1-07 Claude 首审整改记录

> 实施者：Codex　日期：2026-07-20　状态：整改已实现，等待 Claude 独立复审

本记录只陈述实施者采取的措施，不代表发现已经关闭。关闭权属于原审计角色。

| 发现 | 实施处置 | 自检证据 |
|---|---|---|
| B-01 人类裁决与模型来源不可同时表达 | actor 收窄为 `user/system`；模型不再是 actor。`subject_model_context` 独立表示被裁决 AI 产物的来源；AI 修改裁决和正式版本批准强制 actor=user | 主 fixture 改为用户接受指定模型修改；actor=ai/system 裁决均拒绝；完整 bundle 中只有用户能批准正式版本 |
| M-01 action/decision 与节点/哈希脱节 | 按五类 action 执行责任、模型来源、节点、source refs 与前后哈希组合规则；accepted 必须改变、rejected 必须不改变 | 接受空节点/空哈希/相同哈希、拒绝却改变哈希、system 批准均有负向测试 |
| M-02 上游版本硬编码无互锁 | 增加 document/template workspace 依赖；运行时导入版本常量；测试同时断言 compatibility readers、Schema 引用常量、联合 fixture ID/版本 | 跨包契约测试进入 `pnpm verify`，上游版本或 fixture ID 漂移会失败 |
| m-01 project/audit 文件哈希未消费 | 保持契约层不伪造真实字节哈希；明确登记到 PB-11，由真实序列化文件计算并核验 | 路线图 PB-11 验收已增加两类哈希及“不得只信 manifest” |
| m-02 非法日历日期 | 对项目正式版本、知识包和审计时间执行 UTC 解析回读 | `2026-02-31` 负向测试 |
| m-03 自由文本可承载正文/密钥 | locator 收窄为 node ID/anchor；provider/model 使用保守标识符模式并拒绝常见密钥形状 | 中文正文 locator 与 `sk-live-*` provider 负向测试 |
| m-04 path/role 不一致 | truth role 强制 `truth/`，derived role 强制 `derived/` | 目录与 role 反转测试 |
| m-05 Schema 诊断粒度 | 维持既有合规归属 G1-09，本轮不扩大错误模型 | G1-09 原验收项继续有效 |

整改后 project-contract 为 21/21 自检；测试已按责任语义与其余契约拆分，单个测试文件均低于 300 行预警线。最终结论等待复审。
