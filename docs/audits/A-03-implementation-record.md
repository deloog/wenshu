# A-03 实施记录 · AI 编辑事务工作区（结构编辑 + 结构确认 + document.read 通道 + 键盘 E2E + 30k 性能）

> 任务书：[A-03-implementation-task.md](A-03-implementation-task.md)；裁定：[ADR-0030](../adr/0030-A-03结构纠正与性能预算裁定.md)、[决策 #16](../决策记录.md)。实施者 Codex，独立审计者 Claude（PR 挂起不合入）。
> 分支 `a-03-workspace`（自 main `1b435f7` 拉出）。里程碑提交：`d3b6f7c`(M1) → `182e5d1`(M1.5) → `f149fca`(M2) → `b00e3b2`(M3) → `400dffc`(M4) → `01604bb`(M5) → `3084f13`(M6 测试锚点)。

## 1. 范围对账（任务书验收逐项）

| 验收项 | 落点 | 证据 |
| --- | --- | --- |
| 全部结构操作仅键盘可完成 | 键位表集中在 `apps/web/src/workspace/keys.ts` 头注释；E2E 44 键脚本逐项驱动 | `a-03-workspace.e2e.test.ts` editing 用例：终态逐字段断言 |
| 焦点可见 + Tab 序 | 工作区为单一 focusable 区域（Tab 序只一项），焦点行 outline + `aria-current`，编辑器 focus/blur 可见外框 | `mount.ts`；E2E 经真实 DOM 挂载驱动 |
| 稳定 ID（≥120 步固定种子 + 位置派生 ID 负向变异必红） | 内核 120 迭代 seeded 探针（M1 既有）+ 位置派生 ID 变异测试 | `semantic-editor/test/operations.unit.test.ts`（21/21）；工作区 16 步结构序列锚定 ID 断言 |
| undo/redo 非假往返 | undo 后 deep-equal 初态、redo deep-equal 编辑态、undo 后分叉编辑清空 redo 栈 | `workspace-structural.unit.test.ts`；E2E 终态 undoDepth=15/redoDepth=0 |
| AbortSignal 取消 → rolled_back | PB-03 既有机制未动（M1 测试覆盖） | `editor-transactions` 14/14 |
| 30k 字 10 次 p95 + 无 >2s 无反馈 | 30,245 字 fixture（生成器确定性），6 指标 ×（1 预热 + 10 原始采样）PB-12 单 JSON | `artifacts/perf/2026-08-05-A-03/`（6 文件，全部 p95 ≤ 72.1ms < 预算 100ms，max ≤ 72.1ms << 2s 硬线） |
| 结构确认（层级/节点计数/降级丢弃项 + 三类纠正入口 + 可跳过） | `confirm.ts` 呈现；confirm 阶段 Enter=confirmed / Esc=skipped；非第 13 态（D2：工作区呈现分支） | E2E confirm-enter / confirm-skip 两用例 |
| document.read 通道 fail-closed | grant 门控 + 主进程 validateDocument；corrupt / DOCUMENT_INVALID / empty 显式状态；零路径跨 IPC | E2E corrupt / schema-invalid / sha256 对账三用例 |
| 唯一写边界 | UI 层所有变更经 `controller.run/applyCommand` → `manager.execute`；无第二条写路径 | 见 §4 变异 M-4/M-6′ 与 grep 自查（§5） |
| states-1.0.0.json 零改动 | 未触碰 | `git diff main...HEAD -- packages/ux-state` 为空 |
| 零新增第三方运行时依赖 | 仅 workspace:* 内部依赖新增（web→document-model/semantic-editor/editor-transactions，L 分层合法） | `pnpm-lock.yaml` 无新第三方包 |

## 2. 交付物

- 内核 additive（M1/M1.5）：`structural-operations.ts`（8 raw 操作）、`operations.ts` additive（`EditResult.removedNodeIds`、`insertIndex`/`destinationIndex`）、`editor-transactions/commands.ts` + 分发。
- 工作区 UI（M2）：`apps/web/src/workspace/`（model/rows/controller/keys/text-actions/structure-actions/confirm/mount/sample-document），55+1 单元测试。
- 壳通道与构建（M3）：`wenshu.project.document.read`（project-channels.cjs 共享模块，主进程 fail-closed 校验）、preload 白名单、`apps/web/scenario/` IIFE 产物构建、e2e-main `E2E_SCENARIO_MODE=workspace` 产物加载（L3→web 只走产物加载，import 禁令不破）。
- 键盘 E2E（M4）：`apps/electron-shell/test/a-03-workspace.e2e.test.ts` 6 用例全绿；`sendInputEvent` 可信管线（renderer 侧 `isTrusted` 计数 44/44）；方向键 keyCode 映射（`Arrow*→Up/Down/Left/Right`，Chromium legacy 名）为实测踩坑修正。
- 30k fixture + 性能（M5）：`apps/web/scripts/build-30k-fixture.ts` 确定性生成器 + `test/fixtures/workspace-30k.json`（prettier 规范化后 149,163 字节、30,245 字、12 顶层节）；`apps/web/scripts/perf-workspace.ts` 采样器；`pnpm env:record` 已按协议先跑。
- 接入：`pnpm test:e2e` 现在先构建 scenario 与 workspace 两个 IIFE 产物再跑层（root package.json）；`.gitignore` 增 `dist-workspace/`。

## 3. 性能数据指引

- 批次前 `pnpm env:record`：`artifacts/reference-machine/environment.json`（recorded_at 2026-08-05T14:20:33Z，wenshu-dev-primary）。
- 采样：`node scripts/perf-workspace.ts`（apps/web 目录），原始值全保留于 `artifacts/perf/2026-08-05-A-03/*.json`。
- **运行环境诚实声明**：本机 Win10 + **Node v24.13.0 ≠ 参考机器 24.17.0**（G1-14 已登记偏差），每个 JSON 的 `environment` 字段如实写明；**签署轮须在 Win11 参考机器复跑**（见 §6 限制 2）。
- 结果：insert-char p95=41.6ms、split-paragraph p95=72.1ms、move-block p95=30.4ms、promote-paragraph p95=31.8ms、table-row-insert p95=31.8ms、undo-redo-pair p95=9.0ms；全部 10 原始样本 min≥29.4ms（无零值样本——采样器曾踩「焦点溢出至段尾致 Enter fail-closed 产生 0.007ms 假样本」坑，已改为 setFocus 绝对定位 + 10 段间隔防序号漂移，并逐文件核对 min）。
- `artifacts/perf/` 按仓库 .gitignore 约定不进仓（PB-12 同款），路径与数值以本记录为索引。

## 4. 变异自证（6/6 全红，红落正确断言；改回后 git checkout 恢复，diff 仅剩预期测试锚点）

| # | 变异 | 跑 | 红落断言 |
| --- | --- | --- | --- |
| M-1 | controller `redo()` 深度计数反向 | apps/web 56 测 | `16-step sequence`（undoDepth=5 断言） |
| M-2 | text-actions 拆分段落去空半段守卫 | apps/web 56 测 | `Enter at text edge fails closed` |
| M-3 | 表格行插入 rowIndex off-by-one | apps/web 56 测 | `Ctrl+Enter inserts a row…`（行位置断言） |
| M-4 | controller ctor 跳过 validateDocument | apps/web 56 测 | `constructor re-validates fail-closed`（本棒新增锚点测试） |
| M-5 | keys.ts promote/demote 互换 | apps/web 56 测 | promote/demote 两用例同红 |
| M-6′ | 内核 mergeLists 漏报删除（removedNodeIds=[]） | editor-transactions 14 测 | `merge-lists command commits: removal accounting passes the stable-ID guard`（PB03_STABLE_ID_GUARD 承重） |

## 5. 自查记录

- 唯一写边界 grep：`apps/web/src/workspace/` 内无 `@wenshu/semantic-editor/internal` 引用、无直接 `new TransactionManager` 之外的 document 改写（仅 controller ctor 持有一处 manager 实例）。
- file-size 门禁：全部新文件在 400/500 硬线内（最大 production `structural-operations.ts` 379；controller.ts 262；WARN 级 300+ 仅两个测试文件）。
- 分层门禁：`pnpm quality:check` 绿（web→L0/L1 合法；electron-shell 产物加载非 import）。
- `states-1.0.0.json`、G1-04 schema、稳定 ID 规则：零字节改动。
- prettier/eslint：全部被 touch 文件过检。

## 6. 范围外与限制（如实声明）

1. **持久化不在本棒**：工作区为会话内存态，编辑结果不写回 document.json（路线图 A-03 范围无 save；落盘归后续任务）。
2. **参考机器复跑未完成**：性能证据为本机（Node 24.13.0）采样；签署轮须在 Win11 参考机器（Node 24.17.0）复跑同一采样器（`pnpm --filter @wenshu/web perf:workspace`）。
3. **proseMirror 依赖未新增**：工作区渲染为自研 DOM 行模型 + textContent，无 state/view 依赖（任务书 §4.6 遵守）。
4. **生产 web 构建不含工作区**：prototype 内 DEV 动态 import（flow 同款先例），生产构建 12.58kB 给诚实指引；真实文档经桌面壳通道进入。
5. **importMeta 在 E2E confirm 用例为合成终态元数据**（形状 === A-02 通道载荷），真实 import → 工作区接力归后续任务串联。
6. A-03 不关闭任何既有 followups（全仓无归口 A-03 者）；A-01-followups #6 未触碰。
7. **E2E 层内并发出过一次负载相关 flake 并已处置**：editing 用例在 5 次全层运行中失败 1 次（与 verify 构建高负载并发，5.6s vs 正常 2–3s；未捕获到断言详情），随后连续 2 次全层复跑 + 1 次隔离复跑全绿；处置为 replay 尾加 200ms 落定窗（末键 dispatch 任务在高负载下可能迟到），watchdog 仍封顶。CI 首轮若复发须按缺陷流程取证再修，不得重跑蒙混。
