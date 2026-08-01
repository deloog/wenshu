# PB-12 实施记录：真实 E2E 与 PoC-B 闸门报告

> 2026-08-01，分支 `pb-12-e2e-gate`，PR #52（审计签署前不合入）。
> 三项开工裁定：D1 真实入口=Electron 壳+preload 白名单 IPC+0.2.0 Host（fake 只在 AI 计划）；D2 recoverGrantDirectory 双前缀+真 SIGKILL+恢复端到端 p95≤10 s；D3 文档型闸门报告+门槛钉死于 ADR-0027。

## 1. 工作项与交付

| W | 内容 | 交付 | 提交 |
|---|---|---|---|
| W1 | recoverGrantDirectory 双前缀扩展 | `IMPORT_TEMP_MARKER` 单源（project-storage 导出、knowledge-package 消费）、递归孤儿清理（symlink 免疫、1000 目录扫描预算 fail-closed）、6 项新测试 | `9b03725` |
| W2 | e2e 壳模式 | `scenario/`（vite → dist-scenario，gitignored）、`src/e2e-main.cjs`（`--e2e`/`--e2e --recover`、scripted selectDirectory、仅 e2e 模式注册三编排通道）、preload additive（`--wenshu-e2e` 旗标） | `fd11c87` |
| W3 | 七链环编排测试 | `test/pb-12-chain.e2e.test.ts`（448 行）+ `pb-12-orchestrator.ts`（315 行，只 spawn/kill/读/断言，零 mock）；scenario 增 save-loop/import 模式 | `e50d26a` |
| W4 | CI 第 9 job `e2e` | jobs.ts + workflow matrix（xvfb-run + ELECTRON_DISABLE_SANDBOX=1 + apt 运行库）、root test:e2e 前置 build:scenario、docs/ci.md 9 路 | `91d636f` + 修复 `c27c5d4`、`e8eb5ac` |
| W5 | 恢复端到端性能采样 | `scripts/perf-recovery.mjs`（env:record 先跑+Node/PATH 硬断言；1 预热+10 次）→ `artifacts/perf/2026-08-01-PB-12/` | `44086b8` |
| W6 | 四项变异守卫 | M1~M4 全红（§4） | 工作树变异+回退，记录于本文件与 ADR-0027 §4 |
| W7 | 文档 | ADR-0027、闸门报告、本记录、审计任务书、承接 disposition | 见 PR |

## 2. 实测结果（本机 wenshu-dev-primary Win10，Node v24.17.0，Electron 43.1.1）

- `pnpm test:e2e` 8/8 ×6 连跑（含既有 editor-diff 内存 e2e 不回潮）。
- 链环①②③：edit-* 5 步全绿（3 提案、拒绝项永不进真源字节级、undo/redo 往返字节级、undoAccepted）；document.json/knowledge-package.zip 落盘 sha256 === 场景自报。
- 链环④：保存飞行中 SIGKILL ×3 轮（杀点延迟 103–664 ms，`signalCode=SIGKILL`），恢复后文档恒为完整 V1/V2 之一，绝无半写。
- 链环⑤：导入中途 SIGKILL（确定性轮询暂存目录出现即杀）本地 3/3 命中孤儿 `.wenshu-import-*`，恢复 removedResidue≥1 且 readdir 干净。
- 链环⑥：恢复端到端（respawn→ready marker）本地 402–436 ms；ubuntu CI 892.7 ms；W5 采样 median 497.0 ms、p95 664.0 ms（原始 10 值留存），预算 10 s。
- 链环⑦：干净重导入逐项对账（package_id/project_id/entry 数/audit 数/材料数/文档与材料字节，canonical 文档摘要独立预测一致）；语义篡改包（结构/CRC 合法、翻 1 payload 字节）→ exit 1、`PACKAGE_HASH_MISMATCH`、目标目录从未创建。
- 非 e2e 回潮：PA-14E reverify + security-probe 通过，exposedKeys 仍恰为 cancel/invoke/registry。

## 3. 远程 CI

- run `30685092607`：8/9 绿；e2e 链环⑤失败——随机延迟杀点在 ubuntu 五轮全「杀在暂存前」。修复为确定性轮询杀点（ADR-0027 §5.2）。
- run `30686146939`：static 失败——perf-recovery.mjs 未过 prettier（本地推送前只对了部分文件跑 prettier，教训：推送前跑全仓 `pnpm format:check`）。
- 修复推送后最终验证 run 见闸门报告 §2（指纹以该 run 为准）。

## 4. 变异守卫（W6，工作树变异→目标测试→git checkout 回退）

| 变异 | 位置 | 变红证据 |
|---|---|---|
| M1 移除提案预览隔离（propose 直打真源） | editor-diff review.ts | 链环① `edit-proposal-isolation`（未接受不改真源）红 |
| M2 去双前缀清理 | project-storage atomic-write.ts | 单元孤儿断言 2 红 + 链环⑤红 |
| M3 原子写退化直接写 | project-storage atomic-write.ts | 崩溃相位测试 5 红（temp-created/data-written-partial/data-fsynced/完整工件/预算）+ 链环④红 |
| M4 短路知识包哈希校验 | knowledge-package import.ts | 链环⑦红（篡改包被接受） |

每次变异后重建 dist-scenario（M1 初次未重建导致假绿，已识别并纠正）；全部回退后干净树 `pnpm test:e2e` 8/8。

## 5. 已知边界（如实声明）

- 无 UI/模板/预览/四级导出/真人对话框；目录授权脚本化预授权；`e2e.knowledge.*` 为编排通道非产品表面（ADR-0027 §1 与 A-12 逐条差异）。
- 性能批次环境为 Win10 dev-primary 非 Win11 参考机（followups N2）。
- 知识包不防自洽改写（ADR-0026 §7.1 收窄口径，闸门报告 §限制如实登记）。
- 恢复点=上次成功保存，丢失范围至多在途事务（followups N3）。
- ContentBase64 ~4 MiB RegExp 栈上限（followups N1）。
