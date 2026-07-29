# PA-13 实施记录 · 重复性、取消、资源清理与性能采样

- 任务：PA-13（路线图 R-PERF）
- 状态：已实现，待 Claude 独立审计；**分页预算未达，未宣布性能预算整体通过**。
- 前置：PA-05/PA-12、G1-14/G1-14W；签署基线 SHA-256
  `5d7c06bcc7443dce871b5dddf040cb2e3ea5e3d357450b05c6b42395bb3d0828`。
- 范围：只增加观测、取消、清理和独立采样/复核入口；零冻结 fixture、模板、
  预算或检查规则改动，零新增第三方运行时依赖。

## 交付物

- `@wenshu/pdf-export`：`AbortSignal` 在导入、compose、render、后处理边界
  fail-closed；渲染侧统一为 `PDF_EXPORT_CANCELLED`，并只 additive 地返回各
  阶段单调钟耗时。未触发的 signal 不影响 PDF 页数、提取文本或目录结果。
- `@wenshu/report-render`：真实 Chromium CDP 会话支持预取消和在途命令取消；
  启动失败、取消或协议失败均终止进程树并清理临时 profile。进程清理单独位于
  `browser-process.ts`；主适配器 374 行，低于 400 行失败上限，但仍产生既有
  300 行预警，列为审计复核点。
- 真实浏览器测试：预取消无子进程/profile、在途命令在取消后拒绝、管线 render
  取消返回统一终态、取消后无新 profile/存活浏览器 PID/半写产物；另钉未触发
  signal 的产物不变量。
- `build-pa13-performance-input.ts`：仅在调用方的空批次目录复制冻结输入并追加
  版本化机械载荷，绝不写 `docs/poc-a/fixtures/`。它须先在 Win11 VM 定为恰好
  30 页并由独立审计签署；在此之前不构成预算证据。
- `vm-calibrate-30-page.ps1` / `vm-final-sample.ps1`：独立目录采样；保存
  Win11 环境证据、输入 hash、锚定提交、预热及 10 次原始导出。任一步骤失败即
  不写 `DONE`。最终批次还运行独立复核。
- `audit-pa13-batch.ts`：对十份既有 PDF 独立重放证据/P0/P1/关键几何，核验每份
  都为 30 页、P0/P1=0；从原始 `evidence.json` 汇集分页与导出时间，重算检查
  时间和 median/p95（nearest-rank），按冻结的 8s/5s/30s 仅输出 `met` 或
  `not_met`，不挑最优值、不回显正文。

## 正确性与诚实边界

- 21 页签署基线的本地重复入口只用于验证页数、P0/P1 与几何不漂移，明确把
  30 页预算标为 `not_measured`；不得把其时间外推成预算通过。
- 正式渲染/分页/导出计时仅可在注册的 Win11 22621 VM 中签署，属于 VM/业主
  背书面；本机可复现的是检查侧和取消/资源清理测试。
- 任一预算超限只能在最终报告中记为 `not_met` 并附根因剖析，交 PA-15 裁定；
  本任务不允许改变输入、输出质量、检查规则或冻结阈值以追求达标。

## 参考 VM 正式采样（Win11 22621 / Edge 150.0.4078.83）

- 采集机制：复用 PA-11A 已签署的离线 VHD 注入 → `User` 自动登录 → Startup
  bootstrap 会话；`WenshuPA13` SYSTEM 服务保持禁用。正式批次为独立目录
  `artifacts/perf/2026-07-29-PA-13-final-v6-user-startup/`，输入由已授权的
  版本化生成器以 `--repetitions 280` 生成，逐次输出均保留输入 hash、环境、原始
  `evidence.json` 和 PDF。
- 十次真实 Edge 导出均为 30 页，独立重放逐次确认 P0=0、P1=0、关键文本 bbox
  序列完全相同；PDF 原始 SHA-256 因引擎时间元数据不同而不同，不以它作为确定性
  判据（承接 PA-11A PA-M5 的 normalized/内容几何口径）。
- 冻结预算的 nearest-rank p95（十次原始值均在 replay JSON 中）：分页
  **24.300s / 8s，not_met**；检查 **0.949s / 5s，met**；导出
  **25.129s / 30s，met**。没有选择最快一次、改阈值、改输入质量或放宽检查。
- 超预算剖析：每次 `evidence.json` 的 `renderMs` 为 20.553–24.300s，而
  import 为约 0.12s、postprocess 为约 0.61s；超限集中在真实 Edge 的 render /
  分页阶段，非检查或后处理。PA-13 不做以产物正确性换取时间的优化；该维度交
  PA-15 作通过/降级裁定。
- 取消/清理：本机串行真实浏览器测试 4/4 通过（预取消、在途 CDP 取消、render
  中取消、未取消产物不变），在途取消目标断言 <2s，且核验无新增 profile、无存活
  浏览器 PID、无半写产物。VM `final-v6/results.txt` 记录同一测试命令
  `cancellation-tests=0`；该 VM 在自动关机前被宿主强制断电以收获卡住的 VM 内
  replay，故其 stdout 文件未持久化，**不把 VM 取消时延另行宣布为已测**。VM 内
  replay 的同批 PDF 已在宿主侧独立重放成功。

## 已执行检查（本机 Windows 10；Node 24.13.0，低于锁定的 24.17.0）

- `pnpm --filter @wenshu/report-render typecheck`：pass。
- `pnpm --filter @wenshu/pdf-export typecheck`：pass。
- `pnpm --filter @wenshu/report-checks typecheck`：pass。
- `pnpm --filter @wenshu/pdf-export exec node --test --test-concurrency=1
  test/cancellation.render.test.ts`：4/4 pass（真实浏览器取消/清理）。
- `git diff --check`：pass。

未执行/待补：当前本机 Node 低于锁定版本，未取得本轮 `pnpm verify` 的可归档
exit 0；远程 CI 与 Claude 独立审计未执行。VM 的取消时延虽由本机真实浏览器
测试证明，但不冒充为独立 VM 时延样本。因此 PA-13 仍为“已实现，待独立审计”，
不可标最终完成。
