# 排版引擎重评估 · Claude 独立审计任务

> 范围：仅审计 `78fc741` 的 `pdf-engine-evaluation.md` 与 ADR-0013；不得改实现、预算、基线或审计结论。

## 审计命门

1. PA-13 的正式数值是否被原样消费：30 页 Win11/Edge p95 24.300s / 8s `not_met`，不得以 Typst 本地探针掩盖或抵消。
2. 两遍 TOC 分解的未测状态是否如实记录；不得把评估差分 VM 未触发 User Startup 的失败包装为有效测量。
3. Typst 0.15.1 的 0.200s 是否明确限于 Win10 本地最小文本映射；核对其 10/10 既有 PDF 检查器失败、未完成表格/SVG/TOC/压印、签署内容、几何、validator、CJK、确定性及参考 VM 测量，确认未宣布通过。
4. 冻结 8 秒预算、PDF 合格标准、签署基线、模板和检查契约是否零漂移；是否存在直接换引擎实现或隐性放宽。
5. 供应链表述是否准确：官方 Typst v0.15.1 Windows x64 SHA-256 `19ce3551153c2fe7ee9fa2f95208310c8f4d3209fedb699e0333faf8913f6736`、Apache-2.0，仅为评估工具，未入 lockfile/SBOM。

## 验证线索

- PA-13 审计：`docs/audits/PA-13-claude-audit-report.md`
- PA-15 审计：`docs/audits/PA-15-claude-audit-report.md`
- 冻结协议：`docs/reference-machine.md`、`docs/performance-budgets.md`
- PR #27：CI 8/8 通过。

## 预期结论边界

本任务只能给出“维持 DEGRADE／不批准直接换引擎”的建议。最终路径、预算变更或引擎落地仍需业主批准并另起任务。
