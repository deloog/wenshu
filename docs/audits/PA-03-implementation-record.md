# PA-03 实施记录 · 语义 HTML 渲染与字体加载检查

> 日期：2026-07-24　任务书：PA-03 开工指令（Claude 审计者门禁定义）　状态：已实现，待 Claude 独立审计；实施者不自行关闭。
> 交付：新包 `@wenshu/report-render`（`packages/report-render`），不分页、不导出 PDF、不做 CSS 布局解释器。
> 前置：PA-A8/PA-A4 已签署生效（导入边界 fail-closed），渲染层不再可能见到控制字符/孤立 `\r`。

## 范围与架构

- **`html.ts`（纯函数）**：`renderDocumentHtml(document)` 把 v0 文档渲染为语义 HTML——文档标题 h1、章节 h2–h4（`section aria-labelledby` ↔ 标题 id）、段落 p、引用 blockquote/cite、列表 ul/ol、表格 `th scope="col"` + `data-align`、figure/img/figcaption、分页标记 `role="separator"`；全部文本实体转义，零 CSS（表现层归 PA-04）。`documentTextSequence` 提供逐字对账期望值。
- **`fonts.ts`**：从 G1-13 冻结清单收窄字重加载计划（weight/style/postscriptName/文件名/SHA-256）；`verifyFontFiles` 字节身份门禁——缺文件或哈希漂移即 `RENDER_FONT_INTEGRITY` 明确失败。
- **`browser.ts`**：最小 CDP 客户端（Node 24 内置 WebSocket + 系统 Chrome/Edge/Chromium 候选路径，找不到即 `RENDER_BROWSER_UNAVAILABLE` fail-closed），**零新增第三方依赖**；真实浏览器、真实 Font Loading API，无 mock。
- **`server.ts`**：127.0.0.1 本地静态服务器，只服务挂载前缀下裸文件名 + 路径包含校验。
- **`fontcheck.ts`**：页面侧探针（FontFace 逐字重显式加载 + `document.fonts.check` + canvas 逐字重量宽）与 Node 侧 `assertFontsUsable` 判定。

## 关键设计取舍（书面化待审）

1. **fallback 检测的构造性方案**：探针 family 用系统必不存在的独占注册名（`Wenshu Render Probe`），font matching 只能命中我们加载的 FontFace——「实际生效」由匹配算法构造保证。宽度**不**与默认字体比较：本机实测系统装有度量相同的同名字体时，目标字体宽度与回落宽度逐位相等（假阳性）；改为**字重间量宽互异**判定——同一文件喂给多个字重（错字重映射）时量宽撞合即被抓。
2. **错字重的双保险**：Node 侧 SHA-256 按字重锚定（文件喂错字重 → 哈希漂移失败）；浏览器侧字重间量宽撞合失败。
3. **零新增依赖**：CDP 手写客户端而非 playwright/puppeteer——规避供应链扩张与浏览器下载；系统浏览器候选路径覆盖 win32/linux/darwin，CI（ubuntu-24.04 runner 预装 Chrome）与本机（Chrome/Edge）同一代码路径。
4. **资产服务**：文档内 `assets/<sha>.svg` 规范名经导入 `renames` 映射回原始字节由测试服务器供给（PA-00 内容寻址链路端到端走通）。

## 验收对照（任务书 ①–⑤）

| 门禁 | 测试 | 结果 |
|---|---|---|
| ①浏览器真实加载三字重、实际生效可断言 | golden report renders semantically（FontFace load 状态 + `document.fonts.check` × 3 + 字重间量宽互异） | ✔ |
| ②DOM 语义正确 | 语义摘要：41 标题、5 表（th 全 scope=col）、2 figure（均含 figcaption）、img 均有 alt、1 分页、1 引用、section 全 aria-labelledby | ✔ |
| ③渲染文本与文档文本逐字对账 | TreeWalker 文本序列 deepEqual `documentTextSequence`（承接 PA-01 口径，PA-A8 后无控制字符） | ✔ |
| ④缺字体/错字重/fallback 明确失败 | 缺字重文件（INTEGRITY）、字节篡改（INTEGRITY）、字体 URL 404（LOAD_FAILED）、同一文件喂两字重（FALLBACK）四个决定性负例 | ✔ |
| ⑤A11y 语义 | 标题层级不跳级（h1→h2→h3）、aria-labelledby 关联、scope、alt、role=separator | ✔ |

## 变异自证（实施者执行，变异后逐字节还原）

| 变异 | 结果 |
|---|---|
| escapeHtml 置为恒等 | 注入单测**变红** ✔ |
| 删字体 SHA-256 比对 | 篡改字体测试**变红** ✔ |
| 删字重 load/check 判定 | 字体 404 测试**变红** ✔ |
| 渲染丢段落文本 | golden 逐字对账**变红** ✔ |

## 实施者验证

- `pnpm --filter @wenshu/report-render test`：unit 3 + render 5 = **8 pass / 0 fail**（真实 Chrome 端到端）。
- `pnpm verify` **exit 0 全绿**；零新增第三方依赖（SBOM 147→147，importer 名单 +2 行）；lockfile 工具生成。
- `contracts:test` 已串入 `@wenshu/report-render`（wiring 测试承重）；首个 render 层测试文件登记（`*.render.test.ts`）。
- 失败证据：渲染测试失败时自动截图至 `test-results/report-render/`（本次全绿未产生）。
- 冻结物零改动：schema/fixture/字体/生成物未触碰。

## 已知限制

- 浏览器版本未锁定（系统 Chrome/Edge 候选）；锁定 Chromium 环境属 G1-14W/PA-05 前置，本包在 PA-05 接入锁定环境时切换 `findChromium` 候选即可，字体/对账门禁不变。
- 浏览器二进制本身的供应链（系统预装）不在 SBOM 范围，与 G1-14 环境证据一致。
- PA-C1 知情项：零宽/格式字符与合法 `\t` 原样保留渲染，对账逐字一致不受影响；如 PA-04 需归一在其层处理。
- 与 PA-02 同改 `package.json` 的 `contracts:test` 行：后合入的 PR 需解一次一行冲突（两包并列即可）。
