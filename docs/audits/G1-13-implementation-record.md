# G1-13 固定中文字体与许可证实施记录

> 日期：2026-07-21　状态：已实现，待独立审计；本记录不关闭 G1-13。

## 实施范围

- 从 Adobe 官方 Source Han Sans `2.005R` tag 取得 `SubsetOTF/CN` 的 Regular、Medium、Bold 三份静态 OTF，不使用镜像、系统已有字体或额外字重。
- 保留官方 `LICENSE.txt`，登记 OFL-1.1、Reserved Font Name、文件字节数、SHA-256 和官方 Git blob SHA-1。
- 以 fontTools 4.60.1 对三份真实 OTF 分别检查名称、版本、字重、glyph/cmap 和冻结报告/SVG 的字符覆盖；884 个必需码点在每个字重中均缺失 0。
- 新增 `@wenshu/fonts` 严格清单解析、清单自身哈希锚点和真实文件系统完整性校验；没有新增第三方运行时依赖。
- `fonts:check` 已接入根 `verify` 与现有 CI `security` 作业；远程矩阵仍为原有 8 个作业。
- 未实现浏览器加载、字体 fallback 检查、HTML 渲染或 PDF 导出；这些仍属于 PA-03 及后续任务。

## 来源与下载处置

- 发布资产 API 登记 `19_SourceHanSansCN.zip` 为 50,700,226 字节，SHA-256 `3a769d1b082ebd813cdb4c06ea57d29b340bce548edcc8e61976b78ca28e6236`。
- 实际采纳文件直接来自 Adobe 官方 GitHub tag 路径；下载完成后重新计算 SHA-256 和 Git blob SHA-1，后者与官方 tag tree 的四个对象逐项一致。
- 官方连接缓慢时产生的未完成 ZIP、HTTP Range 分段、探针和下载副本仅位于 `D:\tmp\wenshu-g113-font-20260721`。项目内副本复核完成后已删除整个明确临时目录；未完成 ZIP 未进入仓库。
- 未安装 Windows 系统字体，未写 C 盘字体目录，未发生费用或账号权限变更。

## 已执行的反例与结果

- 对 LICENSE 和三份 OTF 分别改变中间一个字节：4/4 被稳定分类为 `FONT_LICENSE_INVALID` 或 `FONT_FILE_INVALID`；恢复字节后立即重新通过。
- 同时改变 Regular 字节并同步改写清单内 SHA-256：清单自身源码锚点仍返回 `FONT_MANIFEST_INVALID`，自洽双改不能变绿。
- 清单追加一个换行、增加未登记目录、根目录改为真实 Windows junction、根目录缺失：全部 fail-closed，诊断不含绝对路径或原始 ENOENT/EACCES。
- 清单严格限制 Adobe 仓库/发布/tag/资产摘要、OFL 文件、三个字重、规范排序和三份固定覆盖来源；未知字段、少/多字重及漂移均拒绝。
- 集成测试使用真实 OTF、真实文件系统和运行时签发的 worker 隔离目录，没有 mock 文件系统。本任务不涉及数据库，未虚构真库结果。

## 实施者验证

- `pnpm fonts:check`：3 个冻结 OTF 校验通过；2 项契约测试、4 项真实文件系统集成测试通过。
- `pnpm test:integration`：发现 3 个已登记集成测试文件，18/18 通过。
- `pnpm ci:job security`：secrets、licenses、fonts 三步均通过；许可证扫描覆盖 115 个依赖路径，字体门禁运行真实测试。
- `pnpm verify`：退出码 0；90 个源码/配置文件、264 个仓库文件通过质量护栏，24 个测试文件分层通过，157 项测试通过，12/13 工作区项目完成 strict typecheck，production build 成功。
- 手写 TypeScript 无 `any`/抑制指令；新增生产文件低于 300 行预警、测试文件低于 300 行预警。

## 尚待独立确认

- 实施记录、固定哈希和全绿测试均不能替代 Claude 从 Adobe 官方源、原始字节和仓库外反例重新取证。
- 独立审计须分别重算四个上游对象身份、三字体元数据和 884 码点覆盖，并验证清单锚点、链接拒绝、门禁互锁和许可证义务真实承重。
- 审计签署前路线图只标“已实现，待独立审计”；G1-13 不得标记完成，PA-03 不得启动。
