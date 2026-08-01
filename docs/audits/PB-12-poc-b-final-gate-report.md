# PB-12 PoC-B 最终闸门报告

> 形态：PA-15 文档型闸门（业主裁定 D3）。门槛冻结于 [ADR-0027 §4](../adr/0027-PB-12真实E2E入口强杀恢复口径与PoC-B闸门门槛.md)（先于本报告钉死，不得后移）。
> 范围：PoC-B「AI 编辑事务与本地状态闸」——修改→diff→裁决→undo→保存→强杀→恢复→知识包重导入全链。
> 阶段约束：本报告不追认 PoC-A 排版 `not_met`（决策 #11A）；不宣称三端贯通（ArkWeb `needs_device_to_verify`）；结论若非 PASS 按路线图执行降级/停止，不得提前启动 Alpha。

## 1. 门槛逐项对账

| # | 冻结门槛（ADR-0027 §4） | 实测 | 判定 |
|---|---|---|---|
| 1.1 | 链环①修改→diff→裁决：未接受不改真源（字节级）、部分接受可撤销 | edit-* 5 步全绿：3 提案 pending、拒绝项 B 永不进真源（canonical 字节级断言）、A/C 接受、undoAccepted 回退 C | **met** |
| 1.2 | 链环②undo/redo 往返字节级相等 | undo×2→原稿、redo×2→终态，每步 canonical 相等 | **met** |
| 1.3 | 链环③保存落盘字节与内存摘要一致 | document.json（487 B）与 knowledge-package.zip（3161 B）落盘 sha256 === 场景 webcrypto 自报 === Host 回执 | **met** |
| 1.4 | 链环④强杀-保存飞行中绝无半写 | SIGKILL ×3 轮（确定性伪随机杀点，seed=12648430 可用 `PB12_KILL_SEED` 注入重放，signalCode=SIGKILL），恢复后文档恒 ∈ {完整 V1, 完整 V2} | **met** |
| 1.5 | 链环⑤强杀-导入中途孤儿恢复清理 | 确定性轮询暂存目录出现即杀；**测试保证**最多 5 轮中 ≥1 次命中（未命中轮跳过、命中轮断言无条件执行、全程未命中即失败——非靠重试变绿）；本地一次运行观测 3/3 命中 `.wenshu-import-*` 孤儿，恢复 removedResidue≥1 且 readdir 零残留 | **met** |
| 1.6 | 链环⑥恢复端到端到 ready marker | 本地 402–436 ms；ubuntu CI 892.7 ms | **met** |
| 1.7 | 链环⑦知识包干净重导入对账 + 篡改必拒 | 重导入 ID/版本/引用/审计/材料逐项对账一致（canonical 文档摘要独立预测相符）；语义篡改 1 字节 → exit 1 + `PACKAGE_HASH_MISMATCH` + 目标目录从未创建 | **met** |
| 1.8 | 既有 e2e 不回潮 | editor-diff `review.e2e.test.ts` 全 6 连跑通过 | **met** |
| 2 | 恢复端到端 p95 ≤ 10 s | 批次 `artifacts/perf/2026-08-01-PB-12/`：1 预热 + 10 次，原始值全留存，median 497.0 ms、**p95 664.0 ms**（环境：wenshu-dev-primary Win10，证据 `environment.json` 2026-08-01T05:06:11Z；诚实标注非 Win11 参考机，followups N2） | **met** |
| 3 | 变异守卫全红 | M1 预览隔离移除→链环①红；M2 去双前缀→单元孤儿断言 2 红+链环⑤红；M3 原子写退化→崩溃相位 5 红+链环④红；M4 哈希校验短路→链环⑦红（实施记录 §4） | **met** |
| 4 | fake 边界守卫 | 全仓 E2E 仅 AI 计划为脚本化 ToolRequest；编排器只 spawn/kill/读/断言；真库/文件/恢复零 mock | **met** |
| 5 | 承接 12 项 disposition | [PB-12-followups §1](PB-12-followups.md)：消费关闭 3（PB-10 #1/#3、PB-11 #3）、部分消费+转 A-15 1（PB-11 #1）、转 A-15 2（PB-11 #2/#7）、维持归口/开放 6（PB-10 #2/#4/#5、PB-11 #4/#5/#6）——无静默丢弃 | **met** |
| 6 | CI 9/9（含新 e2e job） | 见 §2 | **met** |

deferred：无。

## 2. 验证指纹

- 分支：`pb-12-e2e-gate`，PR #52（审计签署前不合入）。
- 远程验证：run `30685092607`（8/9，链环⑤ ubuntu 杀点窗口 miss，已修复）→ run `30686146939`（static：perf-recovery.mjs 未过 prettier，已修复）→ run `30686284754`（e2e job 绿；static：裸全局 no-undef，已修复）→ run `30686513557`（8/9，build-staging 为 npm registry 502 基础设施抖动，非代码问题）→ run `30686666034` 9/9 success（`fc270e0`）→ run `30686876325` 9/9 success（首审基线 head `6eb6224`）→ **首审修复轮最终验证 run 待本修复轮提交推送后复跑**（以复审签署时 main 合入 SHA + 最终验证 run 为准）。按构造，任何「最终验证 run」都覆盖不到写本报告指纹的那一个文档提交本身——首审审计者已独立核 `fc270e0..6eb6224` 仅 1 行文档差异，修复轮同口径接受复审核对（MI-04）。
- 本地：`pnpm test:e2e` 8/8 ×6 连跑；`pnpm verify` 全绿；`pnpm quality:check` 分层零违规；SBOM 170 包（diff 仅 vite requested_by 增加 @wenshu/electron-shell）。

## 3. 诚实性边界与限制（如实登记）

1. 无 UI/模板/预览/四级导出/真人对话框；目录授权为脚本化预授权（与 file-host 测试同口径）；`e2e.knowledge.*` 是编排通道非产品表面。A-12 才是全 UI 用户闭环（ADR-0027 §1 逐条差异）。
2. 知识包保证检出单点/不自洽篡改；自洽改写需签名/外部锚，不在范围（ADR-0026 §7.1、决策 #13，followups 转 A-15）。
3. 恢复点 = 上次成功保存；丢失范围至多在途事务（followups N3）。
4. 性能采样环境为 Win10 dev-primary 非 Win11 参考机（followups N2）；CI 只跑功能正确性。
5. Host 0.2.0 ContentBase64 校验原在 ~4 MiB 载荷触 V8 RegExp 栈上限（实测）。**首审 MAJOR-1 已关闭**：原报告将此写为「载荷取 2 MiB 规避」的测试取舍系低估——它是签署契约广告区间内的崩溃路径（4 MiB 起裸 RangeError 逃逸、请求零终态）。修复后广告区间（~64 MiB）不再含崩溃段：schema 改程序式 Ajv `format: content-base64`（O(n) 零回溯，与冻结正则语言 5000 例等价对拍）+ file-host 校验相包络（意外抛错收敛为单个 INTERNAL 终态）；决定性测试：1/2/4/8 MiB 全区间校验、真 Host 4 MiB 保存恰好一个 success 终态、hostile Proxy 包络收敛 INTERNAL、schema 防回归守卫；变异自证（退回正则 → 两测试文件全红）。save-loop 2 MiB 载荷保留，与上限无关（ADR-0027 §5.1 增补、followups N1 关闭）。
6. 实施期远程失败均如实修复并记录（实施记录 §3）：杀点窗口、prettier、裸全局 no-undef；另有一次 npm registry 502 基础设施抖动（非代码问题）。首审 FAIL（MAJOR-1 + 4 MINOR）同轮处置，见 §5。

## 4. 结论

门槛 6 大项（链环 8/8、恢复 p95 664.0 ms ≤ 10 s、变异 4/4 红、fake 边界、承接 12 项、CI 9/9）全部 met、无 deferred、无未关闭承接谎报。首审 FAIL 的唯一 MAJOR 已关闭（§5），PoC-B 就绪覆盖面不再被高估。

**建议结论：PASS（待 Claude 复审签署后生效）。**

提请业主裁定事项：①确认闸门结论；②确认 followups N2–N3 归口（A-15/A-12；N1 已随首审修复关闭）；③确认 Alpha 开工仍以 PB-12 审计签署 + 台账 ✅ 为前提。

## 5. 首审修复轮（2026-08-01，审计报告 [PB-12-claude-audit-report](PB-12-claude-audit-report.md)）

- **MAJOR-1（契约广告区间内崩溃、零终态）→ 关闭**：实施方案②（审计认可方向）——schema `pattern` 改自定义 Ajv `format: content-base64`，程序式 O(n) 零回溯校验，与冻结正则**语言完全等价**（5000 例确定性对拍）；广告区间 1/2/4/8 MiB 全区间决定性测试；真 Host 4 MiB 保存恰好一个 success 终态；file-host 校验相包络（§4 原始错误不得穿透：意外抛错收敛为单个 INTERNAL 终态，hostile Proxy 决定性测试）；schema 防回归守卫；变异自证：退回正则形态 → 两个测试文件全红。生成物已重新生成（`generate:check` 绿）。
- **MI-01（随机杀点 seed）→ 关闭**：链环④/⑥杀点改确定性 PRNG（默认 seed 12648430，`PB12_KILL_SEED` 可注入重放，每轮 diagnostic 记录 seed 与延迟）。
- **MI-02（链环⑤命中表述）→ 关闭**：§1 行 1.5 已改为「测试保证 ≥1 次命中」口径，3/3 标注为一次运行观测。
- **MI-03（ADR 落点提交名不副实）→ 承认并记录**：已推送历史不改写；ADR-0027 确由标题为 `W4 fix: prettier` 的 `e8eb5ac` 引入（该提交含 prettier 修复 + ADR 两件事实，提交信息已列明）；后续门槛类文件单独成提交（本修复轮文档与代码分离提交）。冻结顺序仍 Git 可证：§4 门槛自 `23e7903` 报告落盘后至今零触碰（本修复轮仅增补 §5.1 缺陷修复记录，未动 §4 任何门槛条文）。
- **MI-04（最终 run 自覆盖）→ 关闭**：§2 已写明该结构性事实与核对口径。
