# PA-04 实施记录 · 模板 token → CSS/布局白名单解释

> 日期：2026-07-24　任务书：PA-04 开工指令（Claude 审计者门禁定义）　状态：已实现，待 Claude 独立审计；实施者不自行关闭。
> 交付：新包 `@wenshu/template-css`（`packages/template-css`），只产出声明式 CSS；不 eval、不导出 PDF、不实际分页打印。
> 前置：PR #8/#9 已合入 main、四份审计报告已入库、主工作树在 main（任务书 ⚠️ 硬前置已全部满足）。

## 范围与架构

- **`emit.ts`（命门）**：六类值发射器——颜色只发 `#rrggbb`（6-hex 重校验小写化）、数值只发 `<number><unit>`（有限数 + 范围）、行距无单位数、字体注册名只发批准词汇表（字母/数字/空格/点/连字符，固定加引号）、字体 URL 只发项目内安全相对路径（禁协议/反斜杠/越级/绝对）、方向枚举。**任何模板值都不可能突破其 CSS 属性上下文**（`;`、`}`、`url()`、`expression()`、注释、`<` 被结构排除）。
- **`css.ts`**：`renderTemplateCss(template, fontFaces)` 逐项白名单映射 `ControlledTemplate` → CSS：`@page`（A4 + 方向 + 四边 mm）、`@font-face` × 绑定字重（src 由调用方从 G1-13 清单层供给，权重必须在模板绑定集合内）、字级/行距/四色落到 PA-03 HTML 语义元素（文档标题 h1、章节 h2–h4、正文、figcaption、table、th）、CSS 分片属性（widows/orphans、break-before/after/inside、thead table-header-group）。
- **只读白名单字段**：未知/超范围 token 永不被读取，不可能透传成 CSS；畸形/被篡改模型经发射器与类型守卫 fail-closed（稳定 code + JSON 路径，不回显字段值）。
- **零执行面**：无 eval/Function/动态模块/网络/文件/host/env；纯字符串装配，输入全部经发射器。

## 关键设计取舍（书面化待审）

1. **语义映射**：PA-03 HTML 结构为「文档标题 h1、章节 level L → h(L+1)」，故 token `h1_font_pt` 同时映射 `header h1` 与 `main h2`（章节一级），`h2/h3` token → `main h3/h4`；四色分工：标题 primary、表头 accent、figcaption muted、正文 text。
2. **近似与未映射（如实登记）**：`heading_keep_with_next_lines` 无 CSS「保留下 N 行」等价物，映射为最近语义 `break-after: avoid`；`max_consecutive_sparse_pages` 无 CSS 等价物，属 PA-05 运行时校验器，本层不发射。`toc_start_new_page` 映射为 `.toc` 选择器规则（TOC 元素归 PA-11，规则先行白名单化）。
3. **字体无回落链**：`font-family` 只声明注册名、不写 fallback 列表——静默系统字体回落在 CSS 层无藏身之处，加载/字节/fallback 门禁归 PA-03/PA-05 运行时。
4. **跨包小修（如实申报）**：`report-render/src/server.ts` 内联文档按 URL 扩展名定 Content-Type（原一律 text/html 导致 Chrome 拒绝应用 stylesheet）并增 `.css` MIME——对 PA-03 既有测试零行为变化（8/8 仍绿），属测试基建缺陷修复。

## 验收对照（任务书 ①–⑤）

| 门禁 | 测试 | 结果 |
|---|---|---|
| ①真实浏览器计算样式断言 | computed styles in a real browser：body 11pt→14.667px、行距 1.55×、h1/h2 22pt、h3 16pt、h4 13pt、caption 9pt、table 9.5pt、段距 6pt→8px、四色 hex→rgb、font-family 注册名 | ✔ 真实 Chrome getComputedStyle 逐项 |
| ②CSS 规则契约断言 | every whitelisted token（21 条规则逐条在场）+ only whitelisted selectors（选择器集合相等、url( 仅 3 处且全在 @font-face、无 expression/@import） | ✔ |
| ③CSS 注入被中和 | 注入载荷 ×4 类（颜色 6 种、字体名 4 种、数值 5 种、URL 5 种，含 `;}`/`url()`/`expression()`/注释/尖括号/换行）全部 TemplateCssError，诊断不回显载荷 | ✔ |
| ④零执行面决定性 | 源码无 eval/Function/import()/fetch/fs/child_process（浏览器断言复用 PA-03 harness，与解释器纯度分离）；四处守卫变异变红（下表） | ✔ |
| ⑤verify / 证据 | `pnpm verify` exit 0；生成 CSS 可由测试服务器留存 | ✔ |

## 变异自证（实施者执行，变异后逐字节还原）

| 变异 | 结果 |
|---|---|
| 颜色重校验置空（emitColor 直返） | 注入测试**变红** ✔ |
| 删 widows/orphans 映射 | 白名单规则测试**变红** ✔ |
| body 字号映射错 token（h1→body） | 真实浏览器计算样式测试**变红** ✔ |
| 字体 URL 校验置空 | URL 载荷测试**变红** ✔ |

## 实施者验证

- `pnpm --filter @wenshu/template-css test`：unit 5 + render 1 = **6 pass / 0 fail**；`@wenshu/report-render` 回归 **8/8**。
- `pnpm verify` **exit 0 全绿**；零新增第三方依赖（SBOM 147→147，importer 名单 +2 行）；lockfile 工具生成。
- `contracts:test` 已串入 `@wenshu/template-css`（wiring 测试承重）。
- 冻结物零改动：schema/fixture/字体/生成物未触碰。

## 已知限制

- 解释器不消费分页产物；`@page`/break 规则的真实分页与 PDF 正确性归 PA-05 在锁定 Chromium 环境裁决（交棒点）。
- `.toc` 规则暂无对应元素（PA-11 目录职责），属白名单规则先行，不产生视觉影响。
- 浏览器版本未锁定，与 PA-03 同一观察项，PA-05 接入锁定环境。
