# PA-14H · Claude 独立审计任务

只读审计 `apps/arkweb-shell/`；审计者只能新增审计报告，不能改实现、冻结物、host
契约或 DevEco 环境说明。

1. 在本机冻结 DevEco 环境重跑 `build-hap.ps1`，验证真实 Hvigor HAP，而非手工产物。
2. 重跑 `verify:probe`，核 18 项 v0 registry 完整、均 `unsupported`、契约验证成立，
   并确认 ArkTS/ArkWeb 类型未泄漏至核心包。
3. 核静态探针来自冻结 fixture/模板且不复制 Web 业务；诊断没有回显正文。
4. 复核 `VirtualizationFirmwareEnabled=False` / 无授权设备的事实；确认实施记录未把
   构建或浏览器结果冒充 ArkWeb 运行、页数、字体或换行证据。
5. 核 DevEco/SDK 来源与锁定版本、供应链、冻结物零漂移、范围无 Electron/产品功能。
