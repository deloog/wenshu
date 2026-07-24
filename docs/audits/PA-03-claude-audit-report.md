# PA-03 语义 HTML 渲染与字体加载检查 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-24
> 实施基线：PR #9 分支 `pa-03-report-render` tip `b1057f9`（`d5a4b3a` 代码 + `b1057f9` 台账）；base `origin/main` = `044b9f5`
> 远程验证：PR #9 check-runs **8/8 pass**；`mergeable=MERGEABLE`
> 审计方法：仓外 `git worktree` 拉 PR 分支、隔离 `pnpm install`、**本机 Chrome 真实浏览器复跑 + 变异 + 对抗探针**；探针收尾已删除。
> 写入边界：本轮仅新增本文件；未改代码/测试/Schema/fixture/配置；GitHub 只读，未 push/merge/触发 Actions。

---

## 1. 结论

**PASS —— PA-03 通过，可合并 PR #9。** 无 BLOCKER/MAJOR/MINOR 发现。

- 交付为渲染检查包 `@wenshu/report-render`：语义 HTML（纯函数）+ 真实浏览器字体门禁 + 逐字对账；不分页、不导出 PDF、无 CSS 布局解释器（范围严格落在路线图 PA-03 行）。
- **本轮最大跨平台看点已双向证真**：真实 Chrome 字体渲染测试在 **ubuntu-24.04 CI**（主测 9.45s、skipped=0）与**本机 Windows Chrome**（主测 4.0s）**同一代码路径均实跑通过**，非跳过、非 mock。
- 字体 fallback 门禁设计经我独立对抗验证为**声的**（详见 §3）。
- 实施记录声称的四处变异我在仓外 worktree **独立复跑全部变红**（另补一处，共 5/5 红）。
- 两项观察项（PR#8/#9 合并冲突、浏览器版本未锁定）均不阻断,且各有自防护/指定关闭点。

---

## 2. 交付面与纯度

- 新包 `packages/report-render`：`html.ts`(159) / `fonts.ts`(90) / `fontcheck.ts`(125) / `browser.ts`(252) / `server.ts`(93) / `errors.ts`(17) / `index.ts`(6) + 单测(126) + 真实浏览器测试(205)。
- **零新增第三方依赖**：`browser.ts` 是手写最小 CDP 客户端——**Node 24 内置 `WebSocket`**（无 `ws`/playwright/puppeteer）+ `spawn` 系统 Chrome/Edge/Chromium 候选路径；找不到即 `RENDER_BROWSER_UNAVAILABLE` **抛错（非跳过）**。SBOM **147→147**，lockfile 仅新 workspace 包 importer。
- `contracts:test` 已串入 `@wenshu/report-render`（接线测试承重）；真实浏览器测试经 `.render.test.ts` 登记，随 `contracts` CI job 在 ubuntu 执行。
- `browser.ts`/`server.ts` 触碰 `fs`/`spawn`/`http` 是**渲染门禁必需**（PA-03 要求真实浏览器加载字体），非违规；`html.ts`/`fonts.ts`/`fontcheck.ts` 的渲染与判定核心为纯函数。

## 3. 字体 fallback 门禁 —— 独立对抗验证（全案命门）

路线图 FAIL 条件是「fallback 未被发现即阻断」。门禁由四道构成，我逐道实证：

| 门 | 机制 | 我实证 |
|---|---|---|
| 字节身份 | `verifyFontFiles`：渲染前逐字重 SHA-256 比对冻结清单 | 缺字重文件、字节篡改（翻 1 bit）→ `RENDER_FONT_INTEGRITY` ✔ |
| 加载 | 页面侧 `FontFace.load()` + `document.fonts.check`，逐字重 status 判定 | 字体 URL 全 404 → status=error → `RENDER_FONT_LOAD_FAILED` ✔ |
| 字重区分 | 三字重探针**量宽两两互异** | 同一文件喂两字重 → 量宽撞合 → `RENDER_FONT_FALLBACK` ✔ |
| 独占 family | 探针 family=`Wenshu Render Probe`（系统必无同名）→ 匹配算法只能命中我们加载的 FontFace | 真实三字重量宽 `400=115.07 / 500=116.40 / 700=118.18`（**两两互异且余量舒适 ~1.3/~1.8**），`assertFontsUsable` 通过、**无假阳性** ✔ |

**设计正确性判断**：实施者最初用「目标字体宽度 vs 默认字体宽度」比较,被本机「系统装有度量相同同名字体」证伪(假阳性)；改为**独占 family 构造保证「实际生效」+ 字重间量宽互异抓错字重**——这是对该假阳性的正确修法（实施记录如实登记）。威胁模型是「查本流水线的静默 fallback」,不是「对手注册同名字体」——对 PoC-A 合理。加载失败靠 status（非 check）捕获,回避了 `document.fonts.check` 对不存在 family 返回 true 的陷阱。**门禁在此威胁模型下无漏。**

## 4. 语义 HTML、对账、转义

- **语义结构**（浏览器内 DOM 断言，ubuntu+本机）：标题层级不跳级（文档 h1、章节 h2–h4，因导入层 h4 已 fail-closed，`h2/h3/h4` 计数覆盖全部 41 标题）、`section aria-labelledby`↔标题 id、`th scope="col"`、`figure`/`figcaption` 关联、`img` 均有非空 alt、`role="separator"` 分页、`blockquote` 引用。
- **逐字对账**：渲染 DOM 文本序列（TreeWalker）与 `documentTextSequence` **deepEqual**（303 节点，承接 PA-01 口径；PA-A8 关闭后正文无控制字符；alt 与 figcaption 同源使文本只计一次）。
- **转义纵深防御**：全部文本经 `escapeHtml`（`& < > " '`）。我用注入 payload（`<script>`、`"><img onerror=`）构造文档对象端到端渲染：输出**无裸 `<script`/`<img`**,payload 只以 `&lt;script`/`&lt;img` 转义形式存在（`<title>&lt;script&gt;…`、`<p>&quot;&gt;&lt;img…&gt;</p>`）——无注入。（v0 文档本不含原始 HTML,此为纵深防御。）

## 5. 守卫变异 —— 仓外独立复跑（基线 8/8，`git checkout` 还原干净）

| 变异 | 结果 |
|---|---|
| `escapeHtml` 置恒等 | 转义单测 7/1 变红 ✔ |
| 删字体 SHA-256 比对 | 篡改测试 7/1 变红 ✔ |
| 删字重 load/check 判定 | 404 测试 7/1 变红 ✔ |
| 删字重间量宽撞合判定 | 错字重测试 7/1 变红 ✔ |
| 渲染丢段落文本（我补） | 对账 6/2 变红 ✔ |

四处声称变异全部独立复现变红,各守卫承重。

## 6. 门禁、冻结物、双平台

- `pnpm --filter @wenshu/report-render test`：unit 3 + render 5 = **8 pass / 0 fail**（本机真实 Chrome）。
- PR CI 8/8 全绿；`contracts` job（ubuntu-24.04）日志逐条：`golden report renders semantically…`（9451ms，真 Chrome）、`missing or tampered font files fail closed`、`font weight that cannot load…`、`same font file fed to two weights…`、`report render package` **均 ✔，全 job skipped=0**。
- 冻结物零漂移：schema/fixture/字体/生成物未触碰;SBOM 147→147、零新增第三方。
- 决策 #9 调用点契约遵守：`importMarkdownDocument(fixture, fixtureRoot)` 传 fixtures 公共根,非源文件目录。
- PA-C1 知情项落地：零宽/格式字符与合法 `\t` 原样渲染,逐字对账不受影响。

## 7. 观察项（不阻断）

### PA-D1 · 合并集成 · PR#8 与 PR#9 同改 `contracts:test` 一行

- PR#8（+template-map）与 PR#9（+report-render）都在根 `package.json` 的 `contracts:test` 末尾追加,后合入者需解一次一行冲突。
- **已自带防护**：两包各有 wiring 测试（report-render 断言 `/@wenshu\/report-render/`、template-map 断言 `/@wenshu\/template-map/`）——解冲突若漏掉任一包,该包 wiring 测试变红。要求:合并后的 `contracts:test` **两包并列**,且**合并提交须重跑 CI**（8/8）确认。

### PA-D2 · 已知限制 · 浏览器版本未锁定

- 渲染用系统 Chrome/Edge/Chromium 候选,非锁定 Chromium。**correctly scoped**：PA-03 门禁是「真实浏览器加载 + 字重 + fallback + 语义/对账」,锁定 Chromium 属 **PA-05 前置（G1-14W 环境）**。实施记录已登记,PA-05 接入锁定环境时只需切 `findChromium` 候选,字体/对账门禁不变。浏览器二进制供应链不入 SBOM,与 G1-14 环境证据一致。

## 8. 结论与交接

**PA-03 独立审计 PASS,可合并 PR #9。** 合并由业主/Codex 执行。

- **合并顺序**：PR#8、PR#9 均已 CI 8/8;后合入者解 `contracts:test` 一行冲突（两包并列）,合并提交重跑 CI 8/8。
- PA-03 交棒 PA-04（模板 token→CSS/布局白名单解释）与 PA-05（锁定 Chromium 导出 PDF）：`renderDocumentHtml` 输出零 CSS 语义 HTML 供 PA-04 加表现层;字体门禁在 PA-05 切锁定环境。
- 未关闭且不阻断:PA-A7（front matter 非 title 键记账）、PA-D1/PA-D2。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
