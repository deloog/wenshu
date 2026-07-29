# PA-15 · PoC-A 最终闸门报告 v1.0.0

> 状态：**建议 DEGRADE；等待业主最终批准与 Claude 独立审计。**
> 汇总者：Codex（实施者）；日期：2026-07-29。
> 范围：只消费既有 PA-05~14H、PA-12 与 BASE-01 证据；不改写其结论、阈值或冻结物。

## 1. 决定建议

建议业主作出 **DEGRADE（PoC-A 排版依赖降级）** 决定，而非 PASS。

理由是冻结的 30 页分页预算为 ≤8s，PA-13 的真实 Win11/Edge 十次 p95 为
**24.300s**，即 3.04× 预算，明确 `not_met`。检查（0.949s≤5s）与导出
（25.129s≤30s）达标不能抵销分页未达；把它写为 PASS 会违反性能闸门的诚实口径。

若业主批准本建议：停止 PB/Alpha 对当前 Chromium 排版路径的依赖，启动轻排版重审；
首先评估 PA-11A 已登记的 Typst 重评出口。此报告不修改 8s 阈值，也不授权降质量、
删内容或放宽检查。业主若选择接受超预算并要求 PASS，属于产品指标变更，须另作明确
批准并说明接受理由；本报告不自行作此选择。

## 2. 逐项签署

| 维度 | 状态 | 真实证据与结论 |
|---|---|---|
| PDF 合格标准 | met | PA-05/06~11A/11B 签署基线 `5d7c06bc…0828`；PA-14E 独立复现 21 页、全嵌入字体、几何 0.01pt、P0/P1=0。 |
| 故障检出 | met | [PA-12 审计](PA-12-claude-audit-report.md)：12/12、P0 4/4、正常误报 0；manualChecks 未充入 findings。 |
| 重复性/正确性 | met | [PA-13 审计](PA-13-claude-audit-report.md)：真实 10 次均 30 页、P0/P1=0、几何 0.01pt 内；冻结物零漂移。 |
| 分页预算 | **not_met** | PA-13：p95 24.300s / 8s，根因在 render/分页；未降质，交本报告裁定。 |
| 检查预算 | met | PA-13：0.949s / 5s。 |
| 导出预算 | met | PA-13：25.129s / 30s。 |
| 取消/资源清理 | met | PA-13：本地真实浏览器 4/4，统一 cancelled、无孤儿 PID/profile/半产物，<2s。 |
| Electron 壳 | met | [PA-14E 审计](PA-14E-claude-audit-report.md)：安全硬化与 Node 隔离亲跑、排版对账成立。 |
| ArkWeb 壳 | deferred（条件通过） | [PA-14H 审计](PA-14H-claude-audit-report.md)：真实 HAP 构建；设备运行值均 `not_measured_without_device_or_emulator`，不影响桌面主判定。 |
| 用户效率/人工干预 | deferred | PA-14U 按本轮业主决策 C 后置至阶段 2；不得把后置写成“已达标”。 |

## 3. BASE-01 对照

BASE-01 是 WPS 右删失观察：已投入 **122.3 分钟**仍 `would_send=no`。它只能证明
“首次可接受 PDF 所需人工总时间 **>122.3 分钟**”；不得把业主约 3 小时估计或任何
推算当实测。PA-14U 后置意味着本轮没有同口径用户效率实测，故不能声称 PoC-A 已证明
节省人工时间。

## 4. PA-12 人工清单与后置承接册

统一口径：自动覆盖只计 `findings`；`manualChecks` 绝不并入闸门统计。PA-12 已将下列
14 项登记，PA-14U 后置后均转为阶段 2 的 0 号用户人工执行清单：

| 项 | 当前承接 | 最迟执行点 |
|---|---|---|
| PA-A7 | markdown-import 人工复核，registered | 阶段 2 / PA-14U |
| PA-J1 | 33 个正常样本 manualChecks，carried | 阶段 2 / PA-14U |
| PA-K1 | 表头窄巧合人工确认，registered | 阶段 2 / PA-14U |
| PA-L1 | 2 个图片清晰度人工项，carried | 阶段 2 / PA-14U |
| PA-L2 | 图片域转换留痕，carried | 阶段 2 / PA-14U |
| PA-L3 | 外部需求池项，external | 产品需求评审 |
| PA-L4 | 图片归属歧义，registered | 阶段 2 / PA-14U |
| PA-M1 | 33 个 manualChecks 口径，carried | 阶段 2 / PA-14U |
| PA-M2 | 已由目录页码 fault 关闭 | 已关闭 |
| PA-M3 | oracle 排除边界，registered | 阶段 2 / PA-14U |
| PA-M4 | VM 环境承接，external | 参考环境复验 |
| PA-M5 | normalized SHA 确定性边界，registered | 阶段 2 / PA-14U |
| PA-N1 | TOC 删除类归属边界，registered | 阶段 2 / PA-14U |
| PA-N2 | headerText 缺省重计提醒，carried | 阶段 2 / PA-14U |

三项本轮后置/未达亦明确归属：

| 项 | 状态与承接 | 执行者/最迟点 |
|---|---|---|
| 分页 24.300s/8s | not_met；轻排版重审（含 Typst 重评） | PB/Alpha 排版依赖前，业主批准 DEGRADE 后启动 |
| ArkWeb 真运行 | `not_measured_without_device_or_emulator` | 有 BIOS 虚拟化模拟器或授权真机时；PA-15 后续补验 |
| 用户效率 | deferred（PA-14U） | 阶段 2，0 号用户按冻结 BASE-01 口径执行 |

## 5. 审计与业主裁定请求

Claude 审计应核：上述 `not_met`、两个 deferred 是否完整且未美化；14+3 项是否逐项承接；
DEGRADE 是否由冻结 8s 阈值证成；没有把 BASE-01 下限外推为实测。业主最终批准应在
审计 PASS 后选择：

1. **批准 DEGRADE（本报告建议）**：停止 PB/Alpha 排版依赖并启动轻排版重审；或
2. **批准带理由的 PASS**：明确接受 24.300s 分页超预算，作为指标变更决策留档。

未经上述业主批准，PoC-A 不放行 PB/Alpha 排版依赖。

## 6. 验证与冻结声明

本报告为只读汇总，不修改 PA-05~14H、PA-12、签署基线、模板、检查规则、host 契约或
BASE-01。报告不回显 fixture 正文；仅记录数值、状态与证据定位。待 `pnpm verify`、
远程 CI 和 Claude 审计后才可成为最终报告。
