# PA-13 · Claude 独立审计任务

## 审计目标

独立审计 PA-13 的重复性、正确性不变、性能测量诚实性、取消与资源清理；本任务
只允许修改本审计报告，不能修改实现、预算、采样输入或冻结基线。

## 审计材料

- 实施记录：`docs/audits/PA-13-implementation-record.md`
- 正式 VM 批次：`artifacts/perf/2026-07-29-PA-13-final-v6-user-startup/`
- 独立重放：上述目录 `pa-13-independent-replay.json`
- 冻结约束：`docs/performance-budgets.md`、`docs/reference-machine.md`、PA-12
  闸门结果与签署基线 `5d7c06bc…0828`。

## 必验收点

1. 独立重跑十份 PDF 的证据/P0/P1/关键几何对账，确认每次 30 页、P0/P1=0，且
   非以原始 PDF SHA 代替已登记的内容/几何确定性口径。
2. 从所有十次原始 `evidence.json` 复算 nearest-rank median/p95，确认分页
   8 秒预算被如实记为 `not_met`，检查和导出只按冻结的 5 秒/30 秒判定。
3. 审核 30 页生成器只在独立批次写入，冻结 fixture、模板、预算、签署基线与
   检查规则均无漂移；检查性能路径不改变输出。
4. 实跑串行真实浏览器取消测试，核验统一 cancelled 终态、2 秒目标、无半产物、
   无浏览器孤儿进程及临时 profile；明确 VM 取消 stdout 未持久化的边界，不能把
   它误报为 VM 时延证据。
5. 检查 VM 机制确为 PA-11A `User` Startup 自动登录会话，非 SYSTEM 服务；核验
   `WenshuPA13` 服务保持禁用。

超预算、未测 VM 取消时延或任何冻结物漂移均须如实定级；审计者不得为使任务通过
而改变样本、阈值或检查输出。
