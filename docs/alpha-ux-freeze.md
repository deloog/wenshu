# Alpha UX 冻结：信息架构与状态机对账表（A-01）

> 冻结日期：2026-08-01　契约版本：`@wenshu/ux-state` `stateVersion 1.0.0`
> 本文件是 [ux-spec](ux-spec.md) §3/§4 与可机检契约之间的**对账层**；机器
> 真源是 `packages/ux-state/src/states-1.0.0.json`（schema 校验 + 漂移检查
> 接入 `pnpm verify`），本表不得与其分叉——审计时以契约为准抽查。
> 裁定见 [ADR-0028](adr/0028-A-01Alpha信息架构状态机冻结与缺失设计稿处置.md)；
> 缺失设计稿处置见 [决策 #14](../决策记录.md)。

## 1. 信息架构 = ux-spec §3 上限（八项逐项映射）

| # | ux-spec §3 项（逐字） | 原型骨架区 id | 承接棒次 |
|---|---|---|---|
| 1 | 项目/文件夹与最近项目 | `projects` | A-02 |
| 2 | 文档编辑区 | `editor` | A-03 |
| 3 | AI 工作区（目标、约束、计划、diff 与裁决） | `ai-workspace` | A-05/A-06 |
| 4 | 页面预览与问题检查 | `preview` | A-04/A-04T |
| 5 | 引用/出处查看 | `citations` | A-09 |
| 6 | 版本历史 | `versions` | A-08 |
| 7 | 导出与完整知识包 | `export` | A-11 |
| 8 | 设置（模型/BYOK、字体、隐私、存储） | `settings` | A-07/07P |

**明确排除（ux-spec §3 原文，未纳入 Alpha）**：知识图谱视图、模板市场、
自动同步、多端协同、复杂表格、PPT。新想法一律进[需求池](requirements-pool.md)，
不进 A-01。

承接棒次列为导航性提示，不构成对下游任务的范围承诺；以路线图 §7 各行为准。

## 2. 核心状态矩阵：12 行逐行对账

枚举边界**双来源**（业主 2026-08-01 书面更正）：「路线图完成证据 6 类」
对应 7 行；「ux-spec §4 必须呈现」对应 4 行；保存成功/失败为 dual。

| 行 | ux-spec §4 场景 | 契约状态 id | evidenceSource | 原型画廊 | 契约测试 | 原型测试 |
|---|---|---|---|---|---|---|
| 1 | 初次/空项目 | `empty-project` | ux-spec-must-present | 状态 1/12 | ✓ | ✓ |
| 2 | 导入中 | `importing` | roadmap-completion-evidence（加载/取消） | 状态 2/12 | ✓ | ✓ |
| 3 | 导入部分成功 | `import-partial` | roadmap-completion-evidence（部分成功） | 状态 3/12 | ✓ | ✓ |
| 4 | AI 处理中 | `ai-processing` | roadmap-completion-evidence（加载/取消） | 状态 4/12 | ✓ | ✓ |
| 5 | AI 结果 | `ai-result` | ux-spec-must-present | 状态 5/12 | ✓ | ✓ |
| 6 | 分页中 | `pagination` | roadmap-completion-evidence（加载/取消） | 状态 6/12 | ✓ | ✓ |
| 7 | 页面有问题 | `page-issues` | ux-spec-must-present | 状态 7/12 | ✓ | ✓ |
| 8 | 保存成功/失败 | `save-result` | dual（失败→路线图；成功→§4） | 状态 8/12 | ✓ | ✓ |
| 9 | 导出前 | `pre-export` | ux-spec-must-present | 状态 9/12 | ✓ | ✓ |
| 10 | 离线/模型不可用 | `offline-degraded` | roadmap-completion-evidence（离线） | 状态 10/12 | ✓ | ✓ |
| 11 | 权限拒绝 | `permission-denied` | roadmap-completion-evidence（失败） | 状态 11/12 | ✓ | ✓ |
| 12 | 崩溃恢复 | `crash-recovery` | roadmap-completion-evidence（恢复） | 状态 12/12 | ✓ | ✓ |

- 「契约测试」=`packages/ux-state/test/ux-states.contract.test.ts`（22 条）；
  「原型测试」=`apps/web/test/state-gallery.unit.test.ts` +
  `shell.unit.test.ts`（13 条）。
- 每状态 `requiredPresentation`/`forbiddenSemantics` 为 ux-spec §4 逐字锚定，
  契约与原型 view-model 之间逐字对账（deepEqual），缺一行/缺一条即红。

## 3. 关键状态语义指针

- **崩溃恢复**（行 12）：`checkpoint`=上次成功保存、`potentialLoss`=至多
  丢失在途事务/未保存编辑、`recoveryCopy`=是。输入来自 PB-12 实测恢复
  语义（PB-12 followups N3）；**N3 归口仍 A-12**，本冻结不代签关闭。
- **权限拒绝**（行 11）：对应 PB-10 `HOST_PERMISSION_DENIED`；
  `degradationOptions`=[仅内存会话继续工作， 导出到已授权位置]；
  `noRetryLoop: const true`（不循环弹窗）。
- **离线**（行 10）：`localCapabilitiesIntact`=[编辑， 排版， 检查， 导出]
  （本地能力完整可用）；AI 降级解释字段已冻结，**实现归 A-07P**。
- **分页**（行 6）：`repaginationScope: const "incremental"`，
  `stalePreviewRetained: const true`，`fullRepagination` 契约级禁止
  （D3，ADR-0028 §3）；PoC-A 全量分页 DEGRADE 结论（决策 #11A）不因本
  冻结改变，**本棒不以 PB-12 通过为排版背书**。

## 4. 无障碍基线（状态机层面成立，不推给 A-13）

按 [accessibility.md](accessibility.md)：每状态 `a11y.textEquivalent`
（状态有文本等价表达）与 `a11y.focusEntry`（键盘可达、焦点入口）为 schema
**必填**字段，`noColorOnly: const true`（错误与进度不只依赖颜色）。
A-13 是验证，不是补救。

## 5. 消费者指引（12 个下游）

下游任务（A-02/02D/03/04/04T/05/06/07/08/09/10P/10X）使用状态时：

1. `import { UX_STATES, getUxState, canTransition } from "@wenshu/ux-state"`，
   不得自行转写状态语义到散文或本地副本；
2. 状态演进须走 additive 升级（新 schema 文件 + 双版本 reader，参照
   document-model 纪律与 ADR-0010），`1.0.0` 冻结不变；
3. 任何「状态做不到」的发现先报承接项/需求池，不得静默绕过契约。
