# 文枢兼容性基线（G0）

> 状态：G0 已批准（2026-07-20）。具体版本在 G1 按当时稳定版本锁定并记录；本文限制支持范围，防止“多端”变成首战负债。

## 阶段支持矩阵

| 环境 | PoC-A | PoC-B/Alpha | 正式承诺 |
|---|---:|---:|---|
| 固定 Chromium 测试环境 | 主基线 | 是 | 测试/试用入口 |
| Windows 11 64 位 Electron | 复验 | 主要验证环境 | 首个桌面生产环境 |
| macOS Electron | 暂不在本机打包 | Alpha 前需真实 Mac 验证 | 与 Windows 同属首个正式桌面阶段，但发布需 Mac/签名条件 |
| HarmonyOS NEXT ArkWeb | 字体/布局风险探针 | 最薄壳可运行 | 后续移动深度集成，不是 Alpha 主验证环境 |
| Android/iOS Capacitor | 不做 | 不做 | 后置；另过兼容闸门 |
| Firefox/Safari 浏览器 | 不作为 PoC 判定 | 基础降级可调查 | 首期不承诺同等分页/PDF |

## Chromium/Electron

- G1 锁定 Electron 主版本及其 Chromium/Node 版本，测试文档必须与锁定版本匹配。
- 只支持 64 位桌面；具体最低 Windows/macOS 版本根据锁定 Electron 官方支持范围写入发布说明。
- Electron renderer 保持 `contextIsolation`、sandbox 和关闭 Node integration；平台能力只通过窄 preload/host 契约暴露。参考 [Electron 官方安全清单](https://www.electronjs.org/docs/latest/tutorial/security)。
- Electron 升级必须跑全量 PDF、字体、文件和 E2E 回归；Chromium 变化视为排版引擎变化。

## HarmonyOS/ArkWeb

- G0 不安装工具。G1 从[华为官方 DevEco 页面](https://developer.huawei.com/consumer/cn/deveco-studio/)选择当时稳定版本并锁定 SDK/API、工具链和哈希。
- 当前官方 Windows 要求为 Windows 10/11 64 位、至少 16GB 内存和 100GB 磁盘；安装前再次核对。
- 壳只实现生命周期、权限和 host 桥接；Web 核心不能依赖 ArkTS 特有 API。
- 同一 fixture、字体和模板比较 Chromium/Electron/ArkWeb；记录页数、换行、字体 fallback 和不支持的打印能力。
- 模拟器可做快速回归，但正式鸿蒙承诺前必须有目标真机验证。

## 文件与字体兼容

- PDF：以固定页面尺寸和嵌入/可用字体检查为交付基线。
- docx：只承诺结构可编辑；分别在当时受支持的 Word 和 WPS 版本做打开/继续编辑抽查。
- Markdown：正文和基础结构迁移；模板视觉不承诺。
- 知识包：同 schema 主版本必须可完整重导入；旧版本通过迁移，不静默丢字段。
- 字体 fallback 顺序、版本和哈希固定；缺字体在导出前阻断或明确降级。

## 语言与显示

- 第一阶段界面与排版以简体中文及中英文混排为主。
- 覆盖中文标点、长英文/URL、数字、全角/半角、emoji 缺字和不同 DPI/缩放。
- 不把系统字体恰好存在视为可分发兼容性；测试必须在干净环境验证。
