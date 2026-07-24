# PA-04 模板 token → CSS/布局白名单解释 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-24
> 实施基线：PR #10 分支 `pa-04-template-css` tip `2c7d409`（`534efdb` 代码 + `2c7d409` 台账）；base `origin/main` = `5061da3`
> 远程验证：PR #10 check-runs **8/8 pass**（ubuntu-24.04），`mergeable=MERGEABLE`
> 审计方法：仓外 `git worktree` 拉分支、隔离 `pnpm install`、**本机 Chrome 真实浏览器复跑 + 变异 + CSS 注入对抗探针**；探针收尾已删除。
> 写入边界：本轮仅新增本文件；未改代码/测试/Schema/fixture/配置；GitHub 只读。

---

## 1. 结论

**PASS —— PA-04 通过，可合并 PR #10。** 无 BLOCKER/MAJOR/MINOR 发现。

- 交付为纯声明式 CSS 解释器 `@wenshu/template-css`：`ControlledTemplate` → `@page`/`@font-face`/字级四色/CSS 分片属性;**零执行面**、不碰 PDF/分页产物、无逐页内容特例。
- **本门命门（CSS 注入安全）经我独立对抗验证为声的**：13 类突破载荷跨全部值类**全部结构性拒绝**、诊断不回显值（§3）。
- **跨平台看点双向证真**：真实浏览器计算样式断言在 **ubuntu CI**（960ms、skipped=0）与**本机 Windows Chrome**（1177ms）同一代码路径均实跑。
- 四处值发射器变异我独立复跑**全部变红**。
- **跨包小修（report-render server MIME）经核最小、正确、PA-03 回归 8/8 在 ubuntu 仍绿**（§4）。

---

## 2. 交付面与纯度

- 新包 `packages/template-css`：`emit.ts`(100，值发射器) / `css.ts`(193，主映射) / `errors.ts`(15) / `index.ts`(3) + 单测(248) + 真实浏览器测试(146)。
- **纯解释器**：`css.ts`/`emit.ts` 无任何 `node:`/`fs`/`fetch`/`eval`/`Function`/`child_process`/`process.*`——纯字符串装配,输入全部经发射器。
- 依赖只 `@wenshu/template-map`（workspace）+ catalog devDeps;**零新增第三方**;SBOM **147→147**;lockfile 仅新 workspace 包 importer。
- `contracts:test` 已串入 `@wenshu/template-css`（接线测试承重）。

## 3. CSS 注入安全 —— 独立对抗验证（本门命门）

路线图 FAIL 条件是「任一模板值可突破 CSS 属性上下文」。设计:`emit.ts` 六类发射器对每个值**白名单重校验后按固定语法发射**,`css.ts` 选择器全为**固定字面量**(无模板值进选择器位)。

我构造 13 类突破载荷经 `renderTemplateCss` 端到端注入:

| 值类 | 载荷示例 | 结果 |
|---|---|---|
| 颜色 | `#fff;}body{content:'X'`、`red`(非 hex)、`url(x)` | 全 `TEMPLATE_CSS_VALUE_INVALID` @正确路径 ✔ |
| 数值 | `11pt;}body{x:X`(字符串)、`Infinity` | 全拒绝 ✔ |
| 字体名 | `A";}body{...`、`a<b}c` | 全 `TEMPLATE_CSS_FONT_INVALID` ✔ |
| 字体 URL | `http://evil`、`x")format...;}@import"X`、`../../../etc` | 全 `TEMPLATE_CSS_FONT_INVALID` ✔ |
| 方向/枚举 | `portrait;}body{x`、`table_row_break_inside` 非枚举 | 全拒绝 ✔ |
| 范围 | margin `999mm` | 拒绝 @`/page/margin_mm/top` ✔ |

**13/13 结构性拒绝,无一回显哨兵值**。干净模型输出:`url(` 恰 **3 次(仅 @font-face)**,选择器集合全白名单(`@font-face/@page/body/header h1/main h2-h4/p/figcaption/table/th/.toc/thead/tr/figure`),无 `expression`/`@import`/非白名单声明。**任何模板值结构上无法突破 CSS 属性上下文。**

## 4. 跨包改动：report-render 测试服务器 MIME 修复

PA-04 改了已审签的 `@wenshu/report-render` 的 `server.ts`(+7/-6)。我逐行核:
- 原逻辑内联文档一律按「字符串→text/html」定 Content-Type,导致内联 CSS 被当 text/html,Chrome 拒绝作为 stylesheet 应用。
- 新逻辑:先按 URL 扩展名(`CONTENT_TYPES[ext]`)、字符串再回退 html、二进制回退 octet-stream;新增 `.css`→`text/css`。
- **对 PA-03 路径零行为变化**:`/report.html`(字符串,ext=.html)→ text/html 不变;`/assets/*.svg`(二进制,ext=.svg)→ image/svg+xml 不变。
- **回归证实**:PR#10 的 `contracts` job 在 **ubuntu 逐条复现 report-render 8/8**(含真实浏览器 golden 3375ms、错字重 1147ms),PA-03 门禁未回退。

判定:最小、正确、属测试基建缺陷修复,如实申报,不构成 PA-03 回退。

## 5. 语义映射、门禁、双平台

- **真实浏览器计算样式**(ubuntu+本机):body 11pt→14.667px、行距 1.55×、header h1/main h2=22pt(h1_font_pt)、main h3=16pt、main h4=13pt、caption 9pt、table 9.5pt、段距 6pt、四色 hex→rgb、font-family 注册名——逐项 `getComputedStyle` 断言,非「生成了字符串」自述。
- **CSS 规则契约**:21 条白名单规则在场、选择器集合「含且仅含」、`url(` 仅 @font-face。
- **守卫变异**(仓外基线 6/6,`git checkout` 还原干净):emitColor 正则、emitFamilyName 正则、emitFontUrl 安全校验、emitNumberUnit 范围——各置空后对应注入/样式测试 **5/1 或 4/2 变红** ✔。
- 冻结物零漂移、零新增依赖;`pnpm verify` exit 0(PR CI)。

## 6. 观察项（不阻断）

### PA-E1 · 语义映射 +1 偏移（已登记,已验证）
PA-03 结构为「文档标题 h1、章节 level L→h(L+1)」,故 `h1_font_pt` 同时映射 `header h1` 与 `main h2`(章节一级),`h2/h3` token→`main h3/h4`。这是 PA-03 HTML 结构的直接后果,内部一致且经计算样式测试逐项锚定,非缺陷。

### PA-E2 · 近似与先行规则（已登记,交下游验证）
`heading_keep_with_next_lines`→`break-after:avoid`(CSS 无「保留下 N 行」等价物,取最近语义);`max_consecutive_sparse_pages` 本层不发射→PA-05 运行时校验器;`.toc` 规则先行白名单化(TOC 元素归 PA-11,当前无匹配元素、无视觉影响)。三项均如实登记,真实分页/PDF 正确性由 **PA-05 在锁定 Chromium** 裁决。

### PA-E3 · 浏览器版本未锁定
与 PA-03 同一观察项,PA-05 接入锁定环境。

## 7. 复现命令

```bash
pnpm --filter @wenshu/template-css test     # 6 pass / 0 fail（含真实 Chrome）
pnpm --filter @wenshu/report-render test    # 8 pass / 0 fail（跨包回归）
pnpm verify                                  # exit 0
```

审计探针(CSS 注入 13 载荷、4 处发射器变异)均在 `D:\tmp\pa04*` 仓外 worktree 执行,收尾已删除。**本轮 `git status --short` 仅本报告文件**(注:主工作树当前在 `pa-04-template-css` 分支,本报告为未跟踪文件,提交请落到 main)。

## 8. 结论与交接

**PA-04 独立审计 PASS,可合并 PR #10。** 合并由业主/Codex 执行(注意本报告及主树复位到 main)。

- PA-04 交棒 **PA-05**(锁定 Chromium 用本门 CSS 导出基线 A4 PDF):`@page`/字体/保持规则的**真实分页与 PDF 正确性由 PA-05 裁决**;PA-E2 的近似(keep-with-next、sparse-pages、.toc)在 PA-05/PA-11 各自门禁复核。
- 未关闭且不阻断:PA-A7(front matter 非 title 键记账)、PA-E1/E2/E3。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
