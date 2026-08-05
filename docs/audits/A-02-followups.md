# A-02 后续承接项

> 登记惯例：每条含内容、归口、要求。来源：Claude 复审报告 §7.9（2026-08-05 签署 PASS 时登记）。

## 1. MINOR-2 原型链上的未知选项键仍被静默忽略 → 本棒已收口（2026-08-05）

- **内容**：MAJOR-1 修复用 `Object.keys` 查未知选项键，只覆盖自有可枚举键；
  挂在原型链上的误写键（如 `Object.create({protocolVersion})`）仍被静默忽略。
  无真实调用点受影响（信息级）。
- **处置**：本棒随手收口——键级 fail-closed 从 `Object.keys` 改 `for...in`
  （含原型链可枚举键），补决定性测试；变异⑩（回退 Object.keys）新测试红、
  回退后 74/74 绿。**已关闭**，待 Claude 后续轮次顺手复核。

## 2. MINOR-3 冻结 1.0.0 的 requiredPresentation/a11y/label 无内容锚定 → 业主裁定（A-01 契约加固 / A-13）

- **内容**：A-01 已修 `forbiddenSemantics` 逐字钉定，相邻字段残留：
  改 `importing.requiredPresentation` 的「原文件只读」为「原文件只读×」，
  全仓 327+254+E2E 无一处变红。A-02 本身合规（冻结文件字节未改）。
- **处置**：已按归属就地登记到 [A-01-followups #5](A-01-followups.md)（A-01 同类
  缺陷残留）；**归口已由业主裁定（2026-08-05）：A-01 契约加固，不拆给 A-13**
  （理由：缺口横跨 requiredPresentation + a11y.* + label，拆开必留部分覆盖——
  覆盖记在模块粒度而非字段粒度的同类坑；A-01 已用同文件同手法钉过
  forbiddenSemantics，照抄即可）。**实施注意（业主补充）**：钉定只落在契约
  测试层（packages/ux-state/test/ux-states.contract.test.ts），不得复制进
  apps/web 或场景层——web 侧钉「逐字搬运」、契约层钉「内容不变」，内容钉进
  消费者即成第二份真源，踩本文件 #4 要防的漂移。未加固前不得宣称 1.0.0 防
  静默改写已机械化全覆盖。

## 3. MINOR-4 4 项承接项未在上游就地标注关闭 → 本棒已补（2026-08-05，合并前）

- **内容**：A-02 声称关闭的 4 项（PB-11 #4/#6、A-01 #1/#3），上游 followups
  文件无处置注记（先例：PB-12/A-01 均就地标注）。
- **处置**：已按先例补 4 处就地注记（`PB-11-followups.md` §4/§6、
  `A-01-followups.md` #1/#3，均标「处置（2026-08-05，A-02）：已消费，关闭」
  并附依据与复审核对）。**已关闭**。

## 4. 审计边界登记（非发现，业主知悉）

- **permission-denied 原件不变只有 CI 证据**：本机特权令牌绕过 ACL deny
  （审计者已查清成因：deny ACE 写入成功但进程令牌绕过，测试诚实 skip 正确）；
  本机等价路径（read_only grant 分支）已由审计者变异 P1 实证承重，但两条
  代码路径不同，该路径原件字节不变仍只有 ubuntu CI 证据，未经审计者独立
  复核。合并判断由业主承担（审计报告 §7.7/§7.9）。
- **本机 Node v24.13.0 ≠ 参考机器 24.17.0**：审计复跑全在 24.13.0；
  `environment:check` 校验已提交证据与冻结锚点、不校验活动解释器，照样通过。
  归口 G1-14（参考机器复跑成色），已登记。

## 5. 潜在竞态：happy 路径 wireProgress 遇「终态后迟到进度事件」即红（2026-08-06，A-03 CI 轮暴露）

- **内容**：CI run `31056153886` 首次 e2e 作业红一例——
  `a-02 happy+open` 链 `happy-state-trajectory` 报
  `progress dispatch errors: IMPORT_FLOW_ILLEGAL_TRANSITION: empty-project --import-progress`。
  机理（代码实证）：`import-flow.ts` `currentAnchor()` 在 project-view 位置返回
  `"empty-project"`，`requireImporting` 对 project-view 抛错即冠此名——即一条
  import-progress 事件在 `import-succeeded` 终态 dispatch 之后才送达渲染端。
  main 侧全部 onProgress 都在 return 之前同步发出（markdown-import
  project-import.ts 146/154/185/229/249 行），属 Electron IPC
  send/invoke-response 送达序边界情形；`wiringHelper` 注释（
  「A late event after the terminal dispatch is ignored」）证明该现象设计期已知，
  但 happy 路径 `wireProgress` 将其记为 dispatchErrors 并断言为空。
- **分类**：重跑一次同 commit e2e 9/9 绿（非确定性复现）→ 偶发竞态；
  重跑前已留存失败日志取证，非蒙混。暴露面与 A-03 注册前移无因果
  （注册时机不影响 import 收尾的消息在飞窗口）。
- **归口**：A-02 场景接线（wireProgress 严格性 vs 迟到事件）。处置选项留给
  A-02 后续维护或 A-12 贯通前裁定：happy 路径是否对「终态后迟到事件」与
  wiringHelper 同口径豁免（涉及已签署证据语义，须登记）；在裁定前，CI 若
  复发按本条取证，不得静默重跑。
- **证据**：失败日志 run `31056153886` 首次 attempt（e2e 作业），重跑 attempt
  9/9 success；机理分析见本条。
