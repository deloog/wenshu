# G1-13 固定中文字体、许可证与完整性基线

> 日期：2026-07-21　状态：已实现，待独立审计；G1-13 尚未由实施者自行关闭。

## 1. 固定选择

PoC-A 只使用 Adobe 官方 `Source Han Sans CN 2.005R` 的静态 OTF 中国大陆子集，保留三个实际需要的字重：

| 用途 | 文件 | CSS 字重 | 字节数 |
|---|---|---:|---:|
| 正文 | `SourceHanSansCN-Regular.otf` | 400 | 8,429,224 |
| 中等强调 | `SourceHanSansCN-Medium.otf` | 500 | 8,406,556 |
| 标题/粗体 | `SourceHanSansCN-Bold.otf` | 700 | 8,569,308 |

这与冻结模板 `formal-business.template.json` 的字体族、版本和 400/500/700 字重一致。不引入可变字体、地区全集、其他字重、系统字体或网络字体；资产不安装到 Windows 字体目录，由后续 PA-03 从项目内固定路径显式加载。

## 2. 官方来源与身份

- 官方仓库：`https://github.com/adobe-fonts/source-han-sans`
- 官方发布：`https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R`
- 发布资产：`19_SourceHanSansCN.zip`，50,700,226 字节，官方发布 API SHA-256 为 `3a769d1b082ebd813cdb4c06ea57d29b340bce548edcc8e61976b78ca28e6236`。
- 采纳路径：官方 tag 下 `SubsetOTF/CN/`；三个 OTF 直接从 Adobe 官方 GitHub tag 路径取得，没有使用镜像、字体聚合站或本机已有字体。

| 文件 | SHA-256 | 官方 Git blob SHA-1 |
|---|---|---|
| `SourceHanSansCN-Bold.otf` | `62383707c086a32f3afd5e293f34c7eff64c7fea31f579fdc6cbe34d920519a6` | `49a623f360e4dfca8e96df4e0681150d76dcaf89` |
| `SourceHanSansCN-Medium.otf` | `a94e558a2fe972bee4f46bce0843abff37063fd68c33f1e7d9058f6f09432b01` | `d870b3549d2cbd61ab24ec4f496cacb2cf1963fc` |
| `SourceHanSansCN-Regular.otf` | `e2bc8a2e7f37474b774fff8db758681ece40bb6947a90d571bce9dd60671a8e4` | `5e6605995d5cbc432c4273f566a5f2b8c376c682` |
| `LICENSE.txt` | `fcac737e761ec63dbfbdce11030a1780161920d80315edba9c8beff1c2bac5a2` | `3ff0ccaba06857bf292ade9a50f16a0f02b3b8d4` |

项目内清单位于 `assets/fonts/source-han-sans-cn/2.005R/font-manifest.json`。清单自身 SHA-256 由校验器源码独立锚定，不能仅通过同时改写字体与清单制造“自洽通过”。目录只允许三份 OTF、`LICENSE.txt` 与清单五个真实文件；缺失、增加、链接、非文件、字节变化或清单变化均失败。

## 3. 许可证边界

字体采用 `SIL Open Font License 1.1`，上游保留字体名称 `Source`。项目保留并随字体分发完整的官方 `LICENSE.txt`，不单独售卖字体，不修改字体后继续冒用保留名称，也不把 OFL 文本替换为项目自己的许可证。应用、生成的 PDF 和项目自有代码不会因此改为 OFL；后续发布包仍须保留该许可证和版权声明。

若许可证文件、SPDX 结论、保留名称、官方来源或任一哈希无法核对，停止使用该资产并删除未采纳副本，不寻找来源不明的替代下载。

## 4. 字体元数据与字符覆盖

一次性取证使用 `fontTools 4.60.1` 直接解析三份真实 OTF：PostScript 名分别为 `SourceHanSansCN-Regular`、`SourceHanSansCN-Medium`、`SourceHanSansCN-Bold`，版本均为 `Version 2.005;addfeatures 5.0.0b21`；每份包含 31,072 glyph、最佳 cmap 含 30,926 个码点，`OS/2.usWeightClass` 分别为 400、500、700。

覆盖集按以下可复算方法生成：

1. 读取 `golden-report.md` 的全部 UTF-8 文本，并用 XML 解析器提取 `chart-overview.svg`、`chart-process.svg` 的全部文本节点；
2. 排除 Unicode whitespace，以及 general category 以 `C` 开头的控制、格式、代理、私用和未分配字符；
3. 对剩余 Unicode 标量去重、升序排列，格式化为逗号分隔的 `U+XXXX`（需要时自然扩展位数），再计算 UTF-8 SHA-256；
4. 分别与三份字体的最佳 cmap 求差集。

结果为 884 个必需码点，规范集 SHA-256 为 `2dc1bf30ea2d8e61fdc58ef36d1c5cf0d35e1e381655a22cca130bc80c50973a`，三个字重各自缺失 0。该结果只证明冻结 fixture 的静态字符覆盖；PA-03 仍必须在真实锁定浏览器中检查字体实际加载、使用字重和 fallback，不能用本清单替代运行时加载证据。

## 5. 验证与消费规则

- `pnpm fonts:check` 校验固定目录、清单锚点、许可证、三个 OTF 的长度/SHA-256/OTF 标记，并运行真实文件系统篡改与链接反测。
- `pnpm verify` 和 CI `security` 作业都执行字体门禁；CI 作业总数仍为 8，不为字体检查伪造一个空作业。
- 自动门禁不依赖开发机已安装字体或 Python/fontTools；已登记字节身份保证运行时消费的是完成一次性元数据/覆盖检查的同一资产。
- PA-03 只能消费这三个已验证文件。缺字体、哈希漂移、浏览器 fallback 或错误字重必须明确失败，不得静默回落到系统字体。

## 6. 下载临时物与清理

下载和分段只发生在 `D:\tmp\wenshu-g113-font-20260721`。网络缓慢时曾产生未完成的发布 ZIP 和分段文件，它们不属于采纳资产、不进入仓库；在项目内副本复核通过后删除。项目未增加字体运行时依赖、付费服务或系统级安装。
