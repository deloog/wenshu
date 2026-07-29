# PB-05A · Claude 独立审计任务

## 审计目标

独立验证 NF-01/02/03：模板应用的哈希指称真实且不伪造 document hash，模型标识为非凭证的结构化
注册，system 权限只有唯一 action。审计者只写审计报告，不修改实现、Schema、锁文件或 SBOM。

## 必验收点

1. 构造 0.2 `template_applied`，确认仅 template→template subject 可通过；document subject 与缺失
   subject 均拒绝。确认旧 0.1 非模板事件可读、0.1 模板事件 fail-closed。
2. 独立喂 `keystone`、`monkey`、`tokenizer`，确认不被关键词拦截；未知 provider 与 credential/token
   等额外字段必须由 Schema 拒绝，且不存在高熵或关键词猜测器。
3. 逐项运行 system action 矩阵：`template_applied` 允许，其余四个 action 均拒绝；确认拒绝不是由
   其它无关字段偶然触发。
4. 核 0.x 双读/0.2 发射口径、ADR-0020、无审计存储实现，以及冻结物、lockfile/SBOM 零漂移。
