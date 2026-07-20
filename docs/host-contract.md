# G1-06 v0 Host 能力与生命周期契约

> 状态：已冻结　协议版本：`0.1.0`　日期：2026-07-20

## 1. 目的与边界

Host 是 TypeScript Web 核心访问高权限平台能力的唯一边界。v0 只冻结能力注册表和请求生命周期协议，不实现浏览器 fake、Electron preload、ArkTS/ArkWeb 桥、真实文件、打印、权限或安全存储。

权威真源是 [`packages/host-contract/schema/host.schema.json`](../packages/host-contract/schema/host.schema.json)，架构决定见 [ADR-0003](adr/0003-v0-Host能力协议与平台隔离.md)。生成 TypeScript 不得手工编辑。

## 2. 能力白名单

注册表必须将以下 18 项能力各声明一次；不支持也必须显式登记，禁止以“字段缺失”让核心猜测：

| 领域 | v0 能力 |
|---|---|
| 项目目录 | `project.directory.select`、`project.directory.authorize` |
| 保存恢复 | `project.save.atomic`、`project.save.as`、`project.backup.create`、`project.backup.restore` |
| 文件与打印 | `file.import.select`、`file.export.write`、`print.pdf.export` |
| 字体 | `font.catalog.list`、`font.catalog.check` |
| 系统交互 | `window.control`、`clipboard.text.write`、`share.invoke`、`link.open.external` |
| 凭证 | `secret.credential.manage`、`secret.credential.status` |
| 探测 | `platform.info.read` |

每项声明固定包含版本、`supported/degraded/unsupported` 状态、权限状态、参数与返回 Schema ID、并发/超时/载荷上限、生命周期、取消、进度、允许错误码和降级策略。Schema ID 必须严格对应能力名与版本。能力实现前必须登记并验证该 ID 指向的具体参数/返回 Schema；没有具体 Schema 时不得标记为生产 `supported`。

## 3. 请求生命周期

```text
registry → request → progress (0..n) → success | failure | cancelled
                   ↘ cancel request ↗
```

- `request_id` 是不透明 128 位标识；请求、进度、取消和终态用它关联。
- 每个请求只能产生一个终态。取消是协作式协议，不等于发出 cancel 后立即假装成功。
- 进度采用递增 `sequence`、固定 phase、`completed/total` 和本地化 `message_key`；`completed` 不得大于 `total`，消息不得夹带文档正文或路径。
- 权限拒绝、超时和普通失败使用 `failure`；完成取消必须使用独立 `cancelled` 终态，不能伪装成通用失败。
- 错误只有稳定 code、是否可重试和本地化 detail key；原始系统错误、路径、密钥和用户内容不得穿透。
- 降级是显式枚举，如浏览器下载、人工文件选择、手工复制/分享、系统打印或只读；安全失败不得通过扩大权限自动降级。

## 4. 平台隔离与安全

- Web 核心只能 import 本包的协议类型，禁止 import Electron、Node 文件 API、ArkTS 或平台插件。
- 文件与目录位置由 Host 保管；核心只使用未来具体 payload Schema 定义的 `grant_id`、资源 handle 和安全文件名，不接收或提交任意绝对路径。
- 协议预检拒绝 `path`、filesystem、Electron IPC、ArkTS context、shell、command、preload、Node integration 等平台字段，以及函数和 getter/setter。
- `secret.credential.manage` 不能返回明文凭证；状态查询只能返回是否存在、provider 和可公开元数据。具体密钥参数 Schema 在实现前另行冻结并安全审计。
- 浏览器开发 Host 可以确定性模拟支持、拒绝权限、取消、超时和降级，但真实 Electron/ArkWeb 集成测试不得用它冒充平台实现。

## 5. 版本与兼容规则

- `protocol_version` 与每项 `capability_version` 当前只接受 `0.1.0`；未来版本明确拒绝。
- 新增能力、改变输入/输出、错误语义、权限或生命周期都需要版本升级、ADR 更新、兼容适配和消费者测试。
- v0 消费者不得依赖注册表顺序，只能按能力名查找。
- 同一协议版本只能做不改变既有语义的实现修复；不能静默把 degraded/unsupported 当作 supported。
- Host 升级失败时回退到上一实现和注册表；请求失败不改变文档真源，写入原子性由后续真实 Host 实现验证。

## 6. 验证与证据

- `pnpm --filter @wenshu/host-contract generate`：从 Schema 生成 TypeScript。
- `pnpm --filter @wenshu/host-contract generate:check`：检查生成漂移。
- `pnpm contracts:check`：运行文档、模板和 Host 契约。
- `pnpm verify`：运行全部 G1 契约、严格类型检查和生产构建。

冻结时 19/19 项 Host 契约测试通过，覆盖 supported/degraded/unsupported 注册、权限拒绝、请求取消、取消终态、进度、成功、超时降级、未来版本、未知能力、注册缺失、Schema ID 错配、非法进度、原始路径、平台字段、getter 不执行、诊断脱敏和生成类型零 `any`。生成漂移反向探针必须失败并可通过重新生成恢复。
