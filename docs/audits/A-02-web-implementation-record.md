# A-02 web 侧实施记录 · ux-state 纯数据子路径 / 导入流程控制器 / web 流程 UI

> 任务 ID：`A-02`（web 侧）　实施：Codex　日期：2026-08-03
> 设计权威：[ADR-0029](../adr/0029-A-02导入入口file.import.select冻结与覆盖落盘裁定.md) §1（①-c、R-1）与 §4；[A-01-followups](A-01-followups.md) #1/#2/#3/#4。
> 范围：仅 `packages/ux-state` 与 `apps/web`。L2 导入执行器、project-storage FileGrant、electron-shell 编排通道为同任务其他工作流，不在本记录。

## 1. 变更清单

| 文件 | 变更 |
|---|---|
| `packages/ux-state/src/data.ts` | 新增。纯数据子路径：不 import Ajv；`UX_STATES_DATA`（cloneAndFreeze）+ `getUxStateFrom`/`canTransitionIn`/`listUxStatesFrom`（语义照搬 index.ts:126-148，显式传 data） |
| `packages/ux-state/src/import-flow.ts` | 新增。四态导入流程控制器（additive，零新依赖）；见 §2 |
| `packages/ux-state/package.json` | exports 增 `"./data"`、`"./import-flow"`；`"."` 不动 |
| `packages/ux-state/test/data-parity.test.ts` | 新增。防漂移平价守卫（见 §4） |
| `packages/ux-state/test/import-flow.test.ts` | 新增。控制器测试 12 条 |
| `apps/web/src/host.ts` | additive：`file.import.select` 经 additionalDeclarations 显式覆盖为 unsupported（见 §3）；终态 protocol_version 回声增 0.3.0 分支 |
| `apps/web/src/flow/{bridge,view-model,session,mount}.ts` | 新增。流程 UI 四层：bridge（Host 交互抽象）/ 纯 view-model / DOM-free session / 薄 DOM mount |
| `apps/web/src/prototype/mount.ts` | 入口增流程区（画廊保留）；流程仅在 `import.meta.env.DEV` 下动态挂载（见 §5） |
| `apps/web/src/prototype/state-gallery.ts` | ux-state 消费改 `@wenshu/ux-state/data` 子路径 |
| `apps/web/test/browser-host.unit.test.ts` | 断言更新到 0.3.0 registry 真身 + unsupported 登记形态 + 调用降级用例 |
| `apps/web/test/flow.unit.test.ts` | 新增。view-model/session/端到端（真实浏览器 Host）测试 |
| `apps/web/tsconfig.json` | 删除 `"types": ["node"]`（A-01-followups #2 裁定路径） |
| `apps/web/vite.config.ts`、`apps/web/test/*.test.ts` | 顶部逐文件 `/// <reference types="node" />`；src/ 零 reference |

**纪律声明**：`states-1.0.0.json` 一个字节未改（A-01-followups #4）；`index.ts` 导出语义零改动；host-contract / contract-runtime 零改动；契约层未新增任何读原语（R-1 不适用且未触碰）。

## 2. 导入流程控制器（子项 2）关键裁定

- **状态机内只有四态**：`empty-project`/`importing`/`import-partial`/`permission-denied`。
  ux-state 1.0.0 的 12 态**没有** `project-ready`，`importing` 的合法转移里也没有
  "导入完全成功" 目标态。按任务书口径：不发明第 13 态；导入成功 / 用户取消 /
  非权限类整体失败以**非状态机动作**「返回项目视图」（`kind:"project-view"`）
  表达，源码注释如实写明。
- 每次机器内转移经 `canTransitionIn` 校验，非法转移抛
  `ImportFlowTransitionError`（fail-closed）；`import-partial` 事件 items 为空
  同样抛错（空清单 = 整体吞掉结果，触碰冻结 forbiddenSemantics）。
- 四态 view 的 `requiredPresentation`/`forbiddenSemantics`/`a11y` 逐字引用冻结
  数据（测试与 states-1.0.0.json 原文 deepEqual 双重对账：JSON 原文 + 主入口
  Ajv 校验值）。
- 取消 = `import-cancelled` → project-view cause `import-cancelled`，不伪装成
  failure；非权限类整体失败 → cause `import-failed` 携带真实 code，不占用
  permission-denied 态。

## 3. 浏览器 Host `file.import.select` 登记形态（ADR-0029 ①-c）

registry builder 默认（0.3.0 真身）会把 `file.import.select` 发成 supported，
浏览器 Host 结构性跑不了 L2 导入管线，故 `apps/web/src/host.ts` 用
`additionalDeclarations` 显式覆盖：

```json
{
  "name": "file.import.select",
  "capability_version": "0.3.0",
  "support_status": "unsupported",
  "permission_status": "not_applicable",
  "error_codes": ["HOST_UNSUPPORTED"],
  "fallback": { "strategy": "manual_file_picker", "reason_code": "BROWSER_HOST_NO_IMPORT_PIPELINE" }
}
```

fallback strategy 取信封 Fallback def 合法值 `manual_file_picker`（明示桌面壳
选择器路径），reason_code 匹配 `^[A-Z][A-Z0-9_]{2,79}$`。调用该能力得到
HOST_UNSUPPORTED failure + 上述 fallback，不进 transcript（测试断言）。
**顺手核查结论**：registry 从 0.1.0 占位变 0.3.0 真身后既有测试
"exposes all 7 payload capabilities" 确实变红（file.import.select 被默认发成
supported），已按真实新形态修正（supported 仍恰为 7 项 + 第 8 项显式
unsupported）。

## 4. 防漂移平价守卫（子项 1）

- `UX_STATES_DATA` 与经 Ajv 校验的 `UX_STATES` deepEqual；
- `canTransitionIn(UX_STATES_DATA, …)` 与 `canTransition(…)` 全 12×12 转移矩阵
  + 未知 id 结果一致；
- data.ts 的 import 行不含 ajv（文本闸）；
- states-1.0.0.json `stateVersion` 仍为 1.0.0。

## 5. Ajv 瘦身（A-01-followups #1）

| 指标 | 改前 | 改后 |
|---|---|---|
| `dist/assets/index-*.js` | 145,462 B | **12,351 B**（gzip 5.09 kB） |
| bundle 内 `ajv` 出现次数 | 3+（ux-state 自校验） | **0**（`grep -ci ajv dist/assets/*.js` → 0） |

机制：画廊与流程逻辑全部改从 `@wenshu/ux-state/data`（无 Ajv）消费；浏览器
Host（经 host-contract 带 3 个 Ajv 实例）只经 `import.meta.env.DEV` 分支动态
import——生产构建静态判死该分支，rollup 整块丢弃（产物仅 1 个 asset，无懒
chunk）。依据：浏览器 Host 本身即"非持久、仅开发联调"（PB-10 #5 /
A-01-followups #3 口径），生产产物渲染一行如实指引文本。
**已知边界**：流程 UI 在浏览器内的真实运行面仅在 `pnpm dev` 下存在；生产
bundle 内不含流程交互（单元测试在 node 侧全覆盖流程逻辑）。dev 模式下的
运行时冒烟（真实浏览器点按）未在本棒执行，留作审计/人工核验点。

## 6. tsconfig 处置（A-01-followups #2，ADR-0029 §4 已裁定）

- `apps/web/tsconfig.json` 删除 `"types": ["node"]`；`typecheck` 脚本逐字串
  `tsc -p tsconfig.json` 不变，typecheck-coverage 双锁（逐字脚本 :47、全覆盖
  :87-91）不触发（`pnpm quality:check` 绿）。
- `vite.config.ts` 与 4 个 test 文件顶部 `/// <reference types="node" />`；
  `src/` 零 reference（类型闸与既有 eslint 文本闸同向）。
- src/ 无代码类型层面依赖 node 全局，零修复。

## 7. 验证结果（本机 Windows，node v24.13.0）

| 命令 | 结果 |
|---|---|
| `pnpm --filter @wenshu/ux-state test` | 40/40 pass |
| `pnpm --filter @wenshu/web test` | 30/30 pass |
| `pnpm --filter @wenshu/web typecheck` | 绿 |
| `pnpm --filter @wenshu/web build` | 12,351 B，ajv=0 |
| `pnpm contracts:check` | **2 项存量失败**（@wenshu/pdf-export：browser session cancel / pipeline cancel，真实 Chrome 取消时序类，单跑复现；本棒未触碰 pdf-export 依赖锥，判存量环境问题，如实上报不掩盖） |
| `pnpm quality:check` | 绿（WARN：`import-flow.ts` 305 行触及 300 行警告线） |
| `pnpm lint` | 绿 |

## 8. 与任务书的偏离

1. `ImportFlowStateId` **不含** `project-ready`：状态机无此态且任务书注释
   明确要求不发明第 13 态；成功终态以非状态机 project-view 表达（§2）。
2. 流程 UI 生产 bundle 不挂载（dev-only 动态 import）：这是同时满足
   "bundle 不得再出现 ajv" 与 "浏览器 Host 仅开发联调" 两条硬约束的唯一
   路径，已在 §5 如实记录边界。
3. `BridgeTerminal` 增 `partial` 终态（任务书接口清单未列）：浏览器 Host
   永不产出，供测试与未来 Electron 桥表达逐资源部分失败，additive。
