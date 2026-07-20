# G1-12 DevEco Studio / HarmonyOS 环境基线

> 日期：2026-07-20  
> 状态：**已完成**（IDE、SDK、命令行和空项目编译通过；本机模拟器运行因 BIOS 虚拟化未开启而后置）  
> 范围：G1-12；未编写 ArkTS 业务代码，未购买账号或服务

## 1. 官方来源与完整性

| 项 | 锁定值 | 验证 |
|---|---|---|
| DevEco Studio | 6.1.1 Release，6.1.1.290 | `product-info.json` 与官方发布页一致 |
| Build | `243.24978.46.36.611290` | `D:\DevEco Studio\build.txt` |
| 发布日 | 2026-06-30 | 官方版本说明 |
| 安装包 | `devecostudio-windows-6.1.1.290.zip` | 保留于 `D:\Installers\DevEco` |
| 官方/实测 SHA-256 | `db382525225a6ba5d96e29b018eac63bdb46dee574142c4fa85d269a5e91e967` | 完全匹配 |
| 解包后安装程序 SHA-256 | `f967e48bd5d952fd2c4f3ed394209c138828b18c4925f6ed02f4d72a2eaa13d4` | Authenticode 有效，签名者 Huawei Technologies Co., Ltd. |
| 已安装主程序 | `D:\DevEco Studio\bin\devecostudio64.exe` | Authenticode 有效，签名者 Huawei Technologies Co., Ltd. |

官方依据：[DevEco Studio 下载中心](https://developer.huawei.com/consumer/cn/download/)、[6.1.1 版本说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-releases/deveco-studio-new-features-611)、[系统要求](https://developer.huawei.com/consumer/cn/deveco-studio/)、[终端环境变量说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-environment-variable)。

## 2. 已锁定组件

| 组件 | 版本 | 路径 |
|---|---:|---|
| HarmonyOS SDK | 6.1.1，API 24，包 6.1.1.125 | `D:\DevEco Studio\sdk` |
| Emulator | 6.1.1.300 | `D:\DevEco Studio\tools\emulator` |
| OHPM | 6.1.2.285 | `D:\DevEco Studio\tools\ohpm` |
| Hvigor | 6.24.3 | `D:\DevEco Studio\tools\hvigor` |
| 内置 Node | 18.20.1 | `D:\DevEco Studio\tools\node` |
| 内置 JBR | OpenJDK 21.0.8+1-b1038.71 | `D:\DevEco Studio\jbr` |

DevEco 主体、SDK 和工具总占用约 10.29 GB。这套内置 Node/JBR 只服务于 HarmonyOS 工具链，不替代本项目已锁定的 Node 24.17.0。

## 3. D 盘路径与 C 盘边界

| 类型 | 路径 | 结论 |
|---|---|---|
| IDE/SDK/工具 | `D:\DevEco Studio` | 通过 |
| IDE 索引与系统缓存 | `D:\DevCaches\Huawei\DevEcoStudio6.1\system` | 重启后实测写入约 153 MB |
| IDE 日志 | `D:\DevCaches\Huawei\DevEcoStudio6.1\log` | 重启后实测写入 |
| 用户插件 | `D:\DevCaches\Huawei\DevEcoStudio6.1\plugins` | 已定向 |
| Hvigor 用户缓存 | `D:\DevCaches\Huawei\hvigor` | 用户变量 `HVIGOR_USER_HOME` 已定向 |
| OHPM 包缓存 | `D:\DevCaches\Huawei\ohpm-cache` | `ohpm config get cache` 已验证 |
| 环境验收项目 | `D:\wenshu\tmp\deveco-smoke` | Git 已忽略，不是正式代码 |

C 盘仍保留小型配置入口：`%APPDATA%\Huawei\DevEcoStudio6.1` 与 `%USERPROFILE%\.ohpm\.ohpmrc`。首次启动在重定向前生成的 `AppData\Local\Huawei\DevEcoStudio6.1` 约 240.29 MB、`.hvigor` 约 16.71 MB 未强制删除，以免损坏诊断或回滚信息；后续可增长缓存已改写 D 盘。

## 4. 真实空项目诊断

1. DevEco 首次启动成功，内置 SDK 自动识别为 HarmonyOS 6.1.1(24)。
2. 使用官方 `Empty Ability` 模板生成 `WenshuDevecoSmoke`，包名 `com.wenshu.smoke`。
3. `ohpm install --all` 成功，生成锁文件和真实 `oh_modules`。
4. 首次普通终端编译在打包阶段准确暴露 `spawn java ENOENT`；ArkTS 编译已通过，原因是终端没有带入 DevEco 内置 JBR，不是 SDK 损坏。
5. 仅对该终端会话设置 `JAVA_HOME=D:\DevEco Studio\jbr`并将 JBR `bin` 前置后，`assembleHap` 返回 0，`BUILD SUCCESSFUL in 4 s 715 ms`。缓存重定向后再次编译为 `BUILD SUCCESSFUL in 2 s 533 ms`，Hvigor 用户缓存实际写入 D 盘。没有污染系统级 PATH。
6. 产物 `entry-default-unsigned.hap` 为 125,243 字节，SHA-256 `5fcf4757a61102142fa96cb3763b6d3ed8ba28053ab7ab0fcd2e6ea6a87feba9`。未配置签名是空环境诊断的预期边界，不代表发布就绪。

命令行诊断所需的会话级基线：

```powershell
$env:DEVECO_SDK_HOME = 'D:\DevEco Studio\sdk'
$env:JAVA_HOME = 'D:\DevEco Studio\jbr'
$env:PATH = 'D:\DevEco Studio\jbr\bin;D:\DevEco Studio\tools\node;D:\DevEco Studio\tools\ohpm\bin;D:\DevEco Studio\tools\hvigor\bin;' + $env:PATH
```

## 5. 已知限制与后续触发条件

- 当前机器是 Windows 10 Pro 10.0.19045 64 位，物理内存约 15.9 GiB，基本贴近官方 16 GB 下限；IDE/SDK/编译已通过，但 IDE、Electron 和模拟器同时运行有内存压力风险。
- CPU 报告 `VirtualizationFirmwareEnabled=False` 且 `SecondLevelAddressTranslationExtensions=False`。因此未启动本地模拟器，不冒充验证通过。开启 BIOS 虚拟化需要业主安排可中断的重启时窗，再执行模拟器镜像和运行诊断。
- Hvigor 首次写入新 D 盘用户缓存时，按其官方内置包装配安装 `pnpm@10.28.2`；其 npm audit 输出报告 1 个 high severity vulnerability。这不影响本次空项目编译结论，但已作为 `G1-15` 供应链初审的待核实输入；未执行 `npm audit fix --force`，避免擅自改写华为工具链。
- 安装程序建议重启 Windows，但未发现 Windows Update/Component Based Servicing 的系统待重启标志，且 IDE、SDK、命令行编译均已通过。为保护当时打开的 WPS 文档，未擅自重启；可在下次正常关机/重启时自然完成。
- G1-12 只证明工具链可用，不证明 ArkWeb 薄壳、真机、签名、上架或发布已就绪；这些按后续路线图任务另行验收。
