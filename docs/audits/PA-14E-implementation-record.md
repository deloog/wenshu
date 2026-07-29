# PA-14E 实施记录 · 安全 Electron 壳复验

- 任务：PA-14E（R-COMPAT / R-HOST）
- 状态：已实现，待 Claude 独立审计。
- Electron：冻结候选 `43.1.1`（Chromium `150.0.7871.114`，MIT）；仅新增该依赖与
  自动生成的 lockfile/SBOM 记录，供应链检查通过。

## 范围与隔离

实现位于独立目录 `apps/electron-shell/`。没有新增编辑器、菜单、文件管理、项目
持久化或其他桌面产品功能；签署基线、fixture、模板、核心检查规则和 host Schema
均未修改。对 `pdf-export` 的唯一改动是 additive 的 `createBrowser` 注入点：默认
Chromium 启动路径不变，Electron 仅提供同一 `BrowserSession` 适配器，避免重写
渲染或在平台间替换产物。

## 安全与 Host 证据

- 实际 `BrowserWindow` 偏好（由 `getLastWebPreferences()` 留证）为
  `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`，并同时记录
  `webSecurity=true`、`webviewTag=false`。
- preload 仅以 `contextBridge` 暴露 `wenshuHost.registry` 与
  `wenshuHost.invoke`；没有暴露 `require`、`process` 或原始 `ipcRenderer`。
- 真实 renderer 探针确认 `typeof require === "undefined"`、`typeof process ===
  "undefined"`、桥键集合严格等于 `invoke,registry`。
- v0 registry 显式声明全部 18 项能力：仅 `print.pdf.export` 为 `supported`，其余
  均为 `unsupported`/`read_only`；打印请求与 success 终态通过
  `validateHostContract` 和 `validateHostSession` 校验。Electron/Node 类型不进入
  核心包。

## 同一 fixture 的真实复验

`pnpm --filter @wenshu/electron-shell reverify` 在实际 Electron BrowserWindow 中复用
同一 `produceBaselinePdf` 管线，生成独立产物
`test-results/pa-14e-electron/electron-baseline.pdf`，随后用独立 Node 重放：

- Electron `43.1.1` / Chromium `150.0.7871.114`：21 页、所有字体嵌入。
- 与签署基线 `5d7c06bc…0828`：页数相同；全部文本运行的页号、bbox、基线、块序和
  阅读序逐值比较，书面容差为 `0.01pt`，结果一致。
- 真实 Electron 产物经 PA-07~11 检查族重放：P0=0、P1=0。

内嵌 Chromium build 与签署 Edge 150 的 build 字符串不同，但本次实际对账未见影响
页数、字体、换行、validator 或几何的差异；不将该结果外推为其他 Electron/Edge
版本，也不把它作为性能预算样本。

## 环境诊断与停止边界

本机环境预设 `ELECTRON_RUN_AS_NODE=1`，会令 Electron 二进制退化为 Node、使壳不
启动；Windows 壳命令显式清除此变量。host v0 registry 也要求所有 18 项能力均显式
登记，故范围外能力一律诚实标 `unsupported`，而非省略。两项均有真实运行证据。

若未来 Electron/Chromium 更新或真实平台出现页数、字体、换行、P0/P1 或几何差异，
必须阻断桌面主判定并交 PA-15；不得改基线、模板、检查或质量凑齐。

## 已执行验证

- `pnpm --filter @wenshu/electron-shell typecheck`：pass。
- `pnpm --filter @wenshu/electron-shell security:test`：pass（真实 Electron、完整
  PDF 重放及 renderer/host 安全探针）。
- `pnpm supply:check`：pass，SBOM 168 packages、12 direct、许可政策 clean。
- `git diff --check`：pass。
- `pnpm verify`：exit 0（本机 Node `24.13.0` 低于冻结工具链声明的
  `24.17.0`，命令如实给出 engine warning，但所有检查与构建均通过；不将其
  冒充为参考机或远程 CI 结果）。

待执行：远程 CI 与 Claude 独立审计。任务在审计通过前不标最终完成。
