# A-01 独立审计任务书（Claude 用）

> 审计对象：分支 `a-01-ux-freeze` / PR #53（挂起不合入）
> 实施记录：[A-01-implementation-record](A-01-implementation-record.md)
> 任务书：[A-01-implementation-task](A-01-implementation-task.md)（你起草的
> 同一权威来源归集，含两处更正）

## 建议猎杀方向

1. **12 行逐行对账**——「典型状态已覆盖」是最可能的偷工形态。拿
   ux-spec §4 原文逐行对照 `states-1.0.0.json` 与画廊 view-model：
   `requiredPresentation`/`forbiddenSemantics` 是否逐字、有无漏行/并行/
   改写。枚举双来源（7 路线图 + 4 ux-spec + 1 dual）是否按更正写明。
2. **§3 上限越界**——IA 是否恰 8 项、排除 6 项是否显式列出；原型/文档
   有无混入知识图谱、模板市场、自动同步、多端协同、复杂表格、PPT 或
   设计系统/组件库形态。
3. **设计稿猜测**——对照决策 #14：交付物中是否存在任何不来自
   ux-spec/已入库事实的视觉/布局断言（= 猜 a566a20 内容）。
4. **全量分页写死猎杀**——契约与原型中 `fullRepagination` 是否真禁
   （变异它）；`repaginationScope` const 是否可被绕过；状态机有无假装
   排版问题已解决、或引用 PB-12 通过为排版背书（决策 #11A 红线）。
5. **a11y 推给 A-13 猎杀**——textEquivalent/focusEntry/noColorOnly 是
   schema 必填还是文档修辞；删掉一个字段测试是否红。
6. **契约健壮性**——reader fail-closed（未知 stateVersion）、漂移检查
   stale 检出、条件扩展语义层（删 pagination 扩展）、eslint 收口绕过
   （`globalThis.process`、动态拼接是否如实登记为残余）。
7. **12 消费者视角**——以 A-02/A-04/A-07P/A-12 各自立场读契约：能否
   import 即用、类型是否退化、散文与契约是否可能分叉。
8. **承接项归口**——A-01 是否越权代签了 PB-11 #4/#6、PB-12 N2/N3
   （正确口径：仅 MI-03 与 PB-10 #5 本棒关闭）。
9. **MI-03 反例真实性**——配置文件归属是否只覆盖了三个已知文件、
   反例是否真红（注入 electron/L3/@ohos）。
10. **承诺项复核**——远程 CI run（gh 可用时）与实施记录自述对账。

## 通过的最低条件

- 12 行逐行有原型且逐字对账（缺一行即不通过）；
- IA = §3 上限（8 项 + 6 排除）；
- D3 增量分页接口契约级成立且全量分页禁令经变异验证；
- a11y 在状态机层面成立；
- 变异守卫（实施记录 §4 表）你至少独立复跑一条为红；
- 无范围外产物（设计系统/功能实现/AI provider/导出实现）。
