# ADR-0034：A-04E-2-P6 取消 target 隔离——closeTarget 取消语义与 2s 逐轮判定口径

- 日期：2026-09-17　状态：建议（实施期产物，随 P6 送审；开工授权 [决策 #27](../../决策记录.md) D3）
- 任务：`A-04E-2-P6`（独立成棒、先于 2c；不并入 2c 以保归因性）
- 上游：[ADR-0033](0033-A-04E-2b增量分页架构页槽缓存与哨兵级联.md) D5（旧取消语义）、[A-04E-2-P6 任务书](../audits/A-04E-2-P6-implementation-task.md)、[分析文档 §P6](../research/A-04E-2b-1s预算超限归因与加速路径.md)、[决策 #26/#27](../../决策记录.md)

## 1. 问题与授权边界

A-04E-2b 实测（VM run-2b-5）：后台整份取消结案稳态 3.7–4.1s，超冻结预算
「取消后 2 秒内停止继续消耗主要计算资源」。机制根因：会话级 abort 是**永久
锁存**（abort 后整会话 `send()` 一律拒绝），挂会话级 signal 则与工装 5c
「同会话复跑」冲突；故 2b 形态的 abort 只在管线阶段边界生效，结案耗时含在途
`printToPdf` 剩余时间。决策 #27 D3 授权修复形态：后台整份在同会话**独立
target** 执行，取消 = `Target.closeTarget`；验收标准就一条 2s，单独成棒、先于
2c，不并入（保归因性）。

## 2. 架构决策

### D1 取消语义：取消主路径 = `Target.closeTarget`，abort 降为阶段门兜底

- report-render 新增 additive target 级 API：`BrowserSession.openTarget()`
  返回 `RenderTarget`（`navigate`/`printToPdf`/`close`），实现为
  `Target.createTarget` + `Target.attachToTarget(flatten)` + `Page.enable`
  （CDP 多 target 用法参照 `probes/pb-08-sqlite/chromium-tabs.ts`，无依赖关系）。
  `BrowserSession` 既有公开面零改动；会话级 abort 永久锁存语义不变。
- pdf-export `renderDocumentFull` additive 第六参 `options.renderTarget`：
  提供时渲染段 navigate/printToPdf 在该 target 上执行；三处阶段门
  （`assertNotCancelled`）原样保留作 fail-closed 兜底。不提供时逐字节等价于
  既有行为（产物零变化由 VM 批次 golden 等价门实证）。
- 工装取消主路径：驱动轮询发现取消置位后 `abort()`（阶段门兜底）+
  `bgTarget.close()`（杀在途打印）；finally 保留 abort+close 防泄漏（close 幂等）。

### D2 在途命令的确定性拒绝：两路覆盖，归一 `RENDER_TARGET_CLOSED`

实证（本机 Chrome/152）：`closeTarget` 杀在途 `printToPdf` 时，Chrome 对
在途命令的应答是**通用错误**（`"Printing failed"`，无结构化码）而非协议级
target-closed 语义；且存在「错误应答先于 detach 事件」的竞态。为让消费侧
确定性区分「取消结案」与「真实失败」，连接层做两路覆盖并归一：

1. **detach 路**：连接层监听 `Target.detachedFromTarget`（flatten 模式下
   无需 `setDiscoverTargets` 即送达），该 session 的全部在途命令与事件等待
   立即以 `RENDER_TARGET_CLOSED` 拒绝并清除——不依赖 Chrome 回答已销毁
   session 的在途命令（否则只能等 30s 超时，2s 预算失守）；覆盖 target
   crash 等外部销毁。
2. **调用方关闭路**：`RenderTarget` 本地记录「我们已发起 close」，此后该
   target 上失败的命令若是通用协议错误则归一译为 `RENDER_TARGET_CLOSED`
   ——消除上述竞态的不确定性。

同时 `waitEvent` 事件匹配加 sessionId 过滤（多 target 下 `Page.loadEventFired`
不再跨 target 串台；单会话既有行为不变）。

### D3 终态码归一与 fail-closed 红线

`renderDocumentFull` 渲染段捕获：`RENDER_CANCELLED`（既有）或
`RENDER_TARGET_CLOSED` **且取消信号已中止** → 统一 `PDF_EXPORT_CANCELLED`；
`RENDER_TARGET_CLOSED` 而信号未中止 = 非取消原因的 target 失败，**原样抛出**
（RenderCheckError），绝不误译为取消（判定器 G6 仍断言
`PDF_EXPORT_CANCELLED`，误译即蒙混）。决定性用例：
`target-isolation.render.test.ts` ③（无信号关闭 target → 原码抛出）。

### D4 2s 预算判定口径：逐轮 settleAfterClickMs ≤ 2000，判定器 additive G7

- **逐轮而非 p95/均值**：冻结预算原文是单次操作语义（「取消后 2 秒内停止
  继续消耗主要计算资源」）；目标形态预期 <100–300ms，逐轮 2s 余量充足，
  逐轮判定不制造不可达性。
- **测量口径同名同义不变**：`settleAfterClickMs` = 点击取消按钮 → 后台
  `renderDocumentFull` promise settle。起点/终点/计时器一字不改——否则
  3.7–4.1s → ≤2s 的改善无法归因于 closeTarget（决策 #27 D3 归因性约束的
  正面形态）。
- **判定落点**：批次证据判定器 `verify-a04e2b-harness.mjs` additive 新增
  G7（缺字段/非有限数/超限均 fail；G1–G6 一字不删）。本机/CI 测试**不**
  新增 2s 墙钟断言（A2A-N2 教训：负载敏感断言误红；本机断言定位是机制——
  target 已关闭、在途 print 被拒、会话存活、可再导出）。
- 判定器自身决定性变异：注入 `settleAfterClickMs > 2000` 的报告副本 → G7
  变红；删 G7 → 同一报告被放行（变异致死证明条款有牙）。

### D5 产物零变化论证

未触发取消时本棒对产出 PDF 完全 no-op：`renderDocumentFull` 缺省路径逐字不变；
`browser.ts` 连接层改动（pending 携带 sessionId、事件匹配加 sessionId、
detached 拒绝分支）在单会话场景语义恒等；签署管线不经 target 路径。
实证：VM 批次 golden 等价门（21 页逐 run 比对）与签署基线 normalized sha
对账零差异；本机 `cancellation.render.test.ts` ④（未触发 signal 完全 no-op）
零改动通过。

## 3. 明确不做

- 增量窗格打印不 target 化（取消对象仅后台整份）；不改
  `incremental-controller.ts` 打印路径。
- 不改 `performance-budgets.md`（2s 为冻结预算）；不碰签署基线/签署带
  [20553.4,24300.2]/冻结模板/lockfile；零新增第三方运行时依赖。
- 不解释 run-01 取消结案 266.7s 冷启离群机理（A2B-N3 复现探针为独立跟进项；
  closeTarget 形态对同类风险免疫——在途打印不再被等待）；批次继续采集
  `maxGapMsDuringBackground`。
- CI/本机不新增墙钟预算断言（§D4）。

## 4. 后果

- 取消结案预期 <100–300ms（分析文档 §P6）；本机机制实测 3.4–3.9ms（2 轮工装，
  Win10+Chrome/152，仅机制证据）；**VM 正式批次 run-p6-3 实测 10/10 轮 ∈
  [4.9, 868.6]ms，判定器 G7 逐轮 ≤2000 达成**（预算判定以 VM 批次为准）。
- 会话复用与立即取消兼得：target 隔离让 2b 的「abort 阶段门生效、等在途
  打印」形态退役为兜底；5c 同会话复跑红线零改动通过。
- A2B-N2（G6 无 2s 门）随本棒落地 G7 关闭；A2B-N3/A2A-N2 维持 followup 原状。
