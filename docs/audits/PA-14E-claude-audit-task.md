# PA-14E · Claude 独立审计任务

审计安全 Electron 壳与同 fixture 复验；审计者只可新增审计报告，不得修改实现、
基线、模板、检查、host 契约或锁文件。

必验：

1. 在真实 Electron 43.1.1 运行 `security:test`，确认实际 webPreferences 为
   `contextIsolation=true`、`sandbox=true`、`nodeIntegration=false`，renderer 无
   `require`/`process`，preload 不泄露原始 IPC/Node。
2. 构造未白名单 channel/能力与非法 session，确认窄桥拒绝；核验 18 能力完整登记、
   仅打印能力支持，并实际经过 `validateHostContract`/`validateHostSession`。
3. 独立重放 Electron PDF 对签署基线的页数、嵌入字体、文本运行几何（0.01pt）、
   换行及 P0/P1；任何差异不得被忽略。
4. 核 Electron 43.1.1、lockfile、SBOM 与许可；确认无平台 API 进入核心包、无桌面
   产品功能、冻结物零漂移。
5. 核环境边界：`ELECTRON_RUN_AS_NODE` 仅是已诊断并受控清除的宿主变量，Electron
   build 差异不被伪装为 Edge 同一 build；性能指标不被本任务宣称。
