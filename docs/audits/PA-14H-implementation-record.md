# PA-14H 实施记录 · 最薄 ArkWeb 壳与布局风险探针

- 任务：PA-14H（R-COMPAT / R-HOST）
- 状态：已实现，待 Claude 独立审计。

## 范围与最薄边界

实现位于独立目录 `apps/arkweb-shell/`，是 DevEco `Stage` 项目：一个
`UIAbility` 生命周期、一个 `Web` 组件、一个只读 v0 registry bridge。未移植或复制
Web 产品业务、编辑器、文件管理、导出或打印能力。ArkTS 代码不进入任何 TypeScript
核心包。

静态资源由 `prepare-static-probe.mjs` 从冻结 `golden-report.md`、冻结模板和既有
语义 HTML/CSS 生成；生成过程写入同一 fixture 的 SHA-256（仅哈希，不向诊断输出
正文）。这是 ArkWeb 的待运行布局探针，不是浏览器 fake。

## Host 与能力边界

`HostBridge` 按 v0 白名单完整登记 18 项能力，全部显式 `unsupported`，支持项为 0。
具体 payload Schema 尚未在本任务冻结，故没有一项被伪装成可用。bridge 仅向 ArkWeb
暴露 `wenshuHost.registry`；Node 验证器重建并以 `validateHostContract` 校验注册表。

## 真实构建证据

在冻结 DevEco Studio 6.1.1.290 / SDK API 24 / Hvigor 6.24.3 上运行：

```powershell
./apps/arkweb-shell/scripts/build-hap.ps1
```

命令执行 `ohpm install --all`、真实 `hvigor assembleHap`，返回 0 并产生 unsigned HAP。
最后一次产物为 188,569 bytes，SHA-256 为
`9449107ee9dec49650553475c7438a78765e63011e5f886e704ea5d67c3082e8`。未配置签名是
探针的已知边界，绝不表示可发布。

`pnpm --filter @wenshu/arkweb-shell verify:probe` 实测：HAP 存在、18/18 host 能力、
支持能力 0、静态探针 55,114 bytes、fixture 30,734 bytes。验证输出仅含数值、哈希和
能力数。

## 运行与差异的诚实处置

本机 CPU 实测 `VirtualizationFirmwareEnabled=False` 且
`SecondLevelAddressTranslationExtensions=False`；无已授权真机/账号。因此没有启动
ArkWeb 模拟器或设备，也没有以浏览器或构建通过冒充运行通过。

以下项目均为 `not_measured_without_device_or_emulator`，交 PA-15 人工前置：ArkWeb
页数、字体 fallback/嵌入、换行、几何、JS bridge 的真实运行值。静态探针预先声明
`print.pdf.export` 不支持；任何未来差异必须逐项记录，不得外推 Chromium/Electron
结果。该设备边界符合 ADR-0001 的 ArkWeb 条件通过口径，不影响桌面主判定。

## 已执行验证

- `./apps/arkweb-shell/scripts/build-hap.ps1`：exit 0，真实 HAP。
- `pnpm --filter @wenshu/arkweb-shell prepare:probe`：pass。
- `pnpm --filter @wenshu/arkweb-shell verify:probe`：pass。
- `pnpm supply:check`：pass；无新增外部 npm 包，SBOM 无漂移。

待执行：完整 `pnpm verify`、远程 CI、Claude 独立审计。失败或设备前置不得自行关闭。
