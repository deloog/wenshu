# 文枢技术基线（G0）

> 状态：G0 已批准（2026-07-20）。本文固定技术边界和验证顺序；具体工具版本由通过审计的路线图在 G1 锁定。产品范围以冻结纲领为准。

## 1. 技术目标

用统一 TypeScript Web 核心承载文档语义、模板、排版规则、事务和验证；各平台壳只提供受控 host 能力。模型负责理解与规划，确定性工具负责执行、校验、恢复和导出。

## 2. 系统边界

```text
用户资料/草稿
      ↓（不可信输入）
导入与 schema 校验
      ↓
类型化文档对象 + 稳定 ID + 项目真源
      ↓
意图/模型规划 ──→ 高层语义工具
      ↓                 ↓
   用户裁决 ← diff ← 事务/权限/undo
      ↓
模板 DSL → 确定性布局/分页/校验 → PDF/docx/知识包/Markdown
      ↓
语义审计事件与出处回流
```

任何本地文件、平台权限、打印、窗口、分享和系统意图调用，必须经过 host 能力注册表；Web 核心不能 import 或直调 Electron、ArkTS、Capacitor 等平台 API。

## 3. 已冻结技术方向

| 能力 | 基线 | 当前决策状态 |
|---|---|---|
| Web 核心 | TypeScript strict + Vite | 已冻结；具体稳定版本在 G1 锁定 |
| 浏览器入口 | 标准 Web 能力 | 获客/试用，不作为 Alpha 正式生产环境 |
| 桌面壳 | Electron 优先，Tauri 仅作触顶备选 | 桌面为首个正式生产环境 |
| 鸿蒙壳 | ArkTS + ArkWeb 薄壳 | PoC 期保留；业务逻辑不进入壳 |
| Android/iOS | Capacitor | 后置；不进入首战开发范围 |
| 编辑内核 | ProseMirror/BlockSuite 等按七维度分测，可组合 | PoC-B 前不得拍脑袋选冠军 |
| 分页/排版 | 先验证 Chromium HTML/CSS 打印管线 | 自有 Canvas 引擎仅在廉价路径明确触顶后考虑 |
| 本地持久化 | SQLite WASM + OPFS 为 Web 候选；桌面需同格式策略 | PoC-B 验证，不在 PoC-A 引入 |
| 合并模型 | CRDT 优先、Yjs 首选候选 | 操作模型先定，provider 后置 |
| 模板 | 版本化声明式 JSON/DSL + 受控解释器 | 第三方模板一期禁任意 JavaScript |
| 简单表格 | 文档内嵌简单表 | 场景表格/Univer 后置 |
| 导入 | docx 候选 mammoth；xlsx 候选 SheetJS 社区版 | 导入不承诺像素级保真；实际引入前做许可证审计 |
| AI | BYOK、多模型适配、端云可替换 | 具体模型只进适配清单，不成为结构前提 |

## 4. Host 能力注册表最低契约

每项能力必须声明：能力名、契约版本、支持状态、权限状态、参数/返回 schema、调用限制、生命周期、取消、进度回调、错误类型和降级。至少预留：

- 项目目录选择与授权
- 原子保存、另存为、备份与恢复
- 文件导入与导出
- 打印/PDF 导出
- 字体枚举与缺失检测
- 窗口、剪贴板和系统分享
- 外部链接打开
- 安全存储模型密钥
- 平台信息与能力探测

浏览器开发环境必须使用受控 host 实现；它可以模拟“不支持/拒绝权限”，但不得让核心代码绕过契约。

v0 的具体能力、错误、取消、进度、降级与平台隔离规则已经在 [Host 能力与生命周期契约](host-contract.md) 和 [ADR-0003](adr/0003-v0-Host能力协议与平台隔离.md) 冻结。

## 5. PoC 顺序

### PoC-A：排版生死闸

- 输入是固定、版本化的结构化长文、模板、字体和页面错误清单。
- 首条路径只使用 Chromium 的 HTML/CSS 分页/打印能力，验证模板规则 → 分页 → 检查 → 修正 → PDF。
- 首先在统一 Chromium 环境建立确定性基线；随后用 Electron 复验。
- ArkWeb 作为跨端风险探针，在 G1 安装 DevEco/SDK 并建立最薄壳后复验字体度量和页面差异；ArkWeb 不改变 PoC-A 的桌面核心判定口径。

### PoC-B：AI 编辑事务闸

- 验证稳定 ID、语义工具、diff、accept/reject、undo 和三层记录。
- 验证本地项目、知识包、重新导入、崩溃恢复和同库格式。
- 编辑器、CRDT、SQLite/OPFS 和 ArkWeb 只在这里按能力分测。

## 6. DevEco/HarmonyOS 工具链时点

G0 不安装 DevEco Studio。GR 通过后，在 G1 建立独立原子任务：

1. 从华为官方页面记录并下载当时最新稳定 DevEco Studio/Command Line Tools；保存版本、发布日期和官方 SHA-256。
2. 锁定与目标 HarmonyOS NEXT 能力匹配的 SDK/API 版本，不使用“自动最新”作为可复现配置。
3. 验证 Windows 环境满足官方要求。2026-07-20 核对的官方页面列明：Windows 10/11 64 位、16GB 及以上内存、100GB 及以上磁盘、1280×800 及以上分辨率。
4. 建立最薄 ArkWeb 壳，只实现 host 桥接和生命周期，不复制 Web 业务逻辑。
5. 完成 IDE 构建、命令行构建、模拟器/真机运行、日志获取和可重复清理。
6. 用同一 PoC-A fixture 比较 Chromium/Electron/ArkWeb 字体与布局差异。

官方来源：

- [DevEco Studio 官方页面与系统要求](https://developer.huawei.com/consumer/cn/deveco-studio/)
- [HarmonyOS NEXT 开发文档中心](https://developer.huawei.com/consumer/cn/doc/)
- [DevEco Studio 资源与命令行工具](https://developer.huawei.com/consumer/cn/deveco-studio/resources/)

## 7. 版本与依赖策略

- G1 只选择当时仍受支持的稳定版本，并写入运行时版本文件、锁文件和环境说明。
- Electron 文档必须与锁定的 Electron 主版本匹配；升级先读官方 breaking changes 并跑全量排版回归。
- 新依赖需满足：必要性明确、维护活跃、许可证允许、包体/安全可接受、有替换路径。
- 默认允许 MIT、Apache-2.0、BSD；字体可接受 SIL OFL 1.1 并保留许可证与来源。GPL/AGPL 不进入依赖树。
- 依赖版本、二进制和字体均记录来源、版本、哈希与许可证；不得从不明镜像复制。

## 8. 字体基线

PoC-A 候选为思源黑体简体中文子集，必要时搭配思源宋体；最终只锁定实际需要的字重和格式，避免把完整泛 CJK 字库全部打包。Adobe 官方仓库声明思源黑体采用 SIL Open Font License 1.1，允许在遵守许可证通知和保留名称条件下嵌入与再分发。

- [Adobe Source Han Sans 官方仓库](https://github.com/adobe-fonts/source-han-sans)
- [Source Han Sans LICENSE（SIL OFL 1.1）](https://github.com/adobe-fonts/source-han-sans/blob/master/LICENSE.txt)

G1 下载后必须归档具体字体版本、原始 LICENSE、哈希和所选字形覆盖；PDF 导出检查实际嵌入状态和 fallback，不以“本机看起来正常”代替验证。

## 9. 未决技术问题及解决时点

| 问题 | 解决时点 | 方式 |
|---|---|---|
| 浏览器分页管线能否达到交付级 | PoC-A | 固定样本和合格标准实测 |
| 编辑器内核组合 | PoC-B 前半 | 七维度探针，不强选单一冠军 |
| SQLite WASM/OPFS 与桌面同库 | PoC-B | 崩溃、多标签、大文档和重导入测试 |
| Yjs 是否满足事务/审计边界 | PoC-B | 操作日志和编辑器集成探针 |
| ArkWeb 字体度量差异 | G1/PoC-A 跨端探针 | 同 fixture、同字体、页面 diff |
| 自动同步 provider | 阶段 3 | 单独立项；Alpha 不承诺 |
