# A-03 后续承接项

> 登记惯例：每条含内容、归口、要求。来源：Claude 复审 §7（2026-08-06 签署 PASS 时登记/追加）。

## 1. 存量：产品壳 main.cjs 同为「先 loadFile 后注册通道」形态且窗口更宽 → 归口 PB-10/A-02 通道层后续维护（最迟 A-12 贯通前）

- **内容**：`apps/electron-shell/src/main.cjs` 的 `createWindow()` 内
  `await window.loadFile(renderer.html)`（89 行），而
  `registerProjectChannels` 在 `whenReady` 里 `await createFileHost(...)`
  之后才执行（135 行）——与 A-03 MINOR-1 同形态，且中间多一次
  `createFileHost` 的 await，窗口更宽。A-03 diff 未触 main.cjs，属存量。
  当前 renderer.html 不在加载时调用 `wenshu.project.document.read`，故未显形；
  但工作区是第一个「加载即读文档」的 UI 形态，该存量迟早在产品侧显形。
- **归口**：PB-10/A-02 通道层（project-channels 属 A-02 产物）后续维护；
  最迟 A-12 关键 E2E 贯通前处理（注册前移到 loadFile 之前，与 e2e-main.cjs
  MINOR-1 修法同形）。
- **要求**：修复时须复刻审计者取证手法——先复现「加载即调用通道 →
  No handler registered」红，再前移注册，再复跑两轮绿。

## 2. MINOR-1 e2e-main.cjs 通道注册时序 → 本棒已关闭（2026-08-06，合并前）

- **内容**：复审复跑 A-03 E2E 两轮各红一例（editing / schema-invalid），错误均为
  `No handler registered for 'wenshu.project.document.read'`；根因
  `e2e-main.cjs` 先 `await loadFile` 后 `registerProjectChannels`。
- **处置**：注册移到 loadFile 之前（审计者实测移动后两轮 6/6、还原即复现红；
  实施者落码后复验）；实施记录 §6.7 flake 归因已更正（原「高负载末键迟到 +
  200ms 落定窗」为错误归因，落定窗保留为通用 dispatch 余量、不再作为 flake
  处置）。**已关闭**，待 Claude 后续轮次顺手复核。

## 3. Win11 参考机器性能复跑仍未兑现 → 签署轮待办（承诺有效）

- **内容**：30k 字性能证据为本机（Win10 / Node v24.13.0）采样；MAJOR-1 关闭后
  「参考机器」重新指向登记的 Win11 / Node v24.17.0 机器，本条从「证据被污染」
  降级为「证据待补」，但签署轮在同一台登记机器复跑
  `pnpm --filter @wenshu/web perf:workspace` 的承诺依然有效。采样协议 §6
  「相对已批准基线退化 >20% 即阻断」依赖基线证据不再被重定义（G1-14 协议陷阱
  登记见 [A-03-major-remediation](A-03-major-remediation.md) §MAJOR-1.3）。

## 4. transactions.ts 398/400 行警戒 → 后续改动者注意

- **内容**：MAJOR-2 修复后 `packages/editor-transactions/src/transactions.ts`
  距生产 400 硬闸仅剩 2 行余量。任何后续改动先量行数；需要扩逻辑时应提取
  辅助模块而非继续加行（审计者复审提醒，非发现）。
