# G1-03C 环境配置基线

> 日期：2026-07-20
>
> 状态：**已完成（Claude 独立复审 `CONDITIONAL PASS`）**
>
> 范围：dev/test/staging/production 四环境契约、启动前校验和无密钥示例；不含部署、外部服务或真实凭证

## 1. 权威契约

- 运行时解析器：`packages/config/src/index.ts`
- 机器可读 schema：`packages/config/app-config.schema.json`
- 无密钥示例：`.env.example`
- Vite 启动门：`apps/web/vite.config.ts`
- 契约测试：`packages/config/test/config.contract.test.ts`

当前只允许两个最小非敏感字段：

| 字段 | 必填 | 允许值 |
|---|---:|---|
| `WENSHU_ENV` | 是 | `dev` / `test` / `staging` / `production` |
| `WENSHU_LOG_LEVEL` | 是 | `debug` / `info` / `warn` / `error` |

解析器忽略与项目无关的操作系统变量，但会拒绝任何未登记的 `WENSHU_*` 字段。这使拼写错误、过期变量或把密钥误放入 Web 配置命名空间时都会立即失败。

运行时解析器直接编译并执行上述 JSON Schema；日志级别等白名单同时有契约测试检查，避免 Schema、TypeScript 常量和文档各自漂移。`apps/web/vite.config.ts` 也纳入严格 TypeScript 检查。

## 2. 四环境显式基线

| 环境 | 启动/构建模式 | 日志级别 |
|---|---|---|
| dev | `vite --mode dev` | `debug` |
| test | `vite build --mode test` | `warn` |
| staging | `vite build --mode staging` | `info` |
| production | `vite build --mode production` | `warn` |

每个环境都有独立显式 profile；不存在“未识别环境自动当作 production”的降级。环境覆盖只能修改同名 profile 的允许字段，`WENSHU_ENV` 与 Vite mode 不同时以 `CONFIG_ENV_MISMATCH` 失败，防止混用 staging/production 配置。

覆盖优先级为：显式 profile < Vite 对应 mode 的本地 `.env*` < 当前进程环境。所有真实 `.env` 和 `.env.*` 均已被 Git 忽略，仅 `.env.example` 可提交。

## 3. 快速失败与脱敏

| 错误码 | 含义 |
|---|---|
| `CONFIG_MISSING` | 必填字段缺失或为空 |
| `CONFIG_UNKNOWN` | 出现未登记的 `WENSHU_*` 字段 |
| `CONFIG_INVALID` | 字段值不在白名单 |
| `CONFIG_ENV_MISMATCH` | 覆盖环境与启动 mode 不一致 |

错误对象只输出错误码和字段名，不包含原始值。契约测试使用 sentinel 验证未知字段和非法值不会进入错误信息。Vite 在启动 dev server 或构建之前执行同一校验器，不等到界面运行后才暴露配置错误。

## 4. 权威命令

```powershell
pnpm config:check
pnpm dev
pnpm --filter @wenshu/web build:test
pnpm --filter @wenshu/web build:staging
pnpm build
pnpm verify
```

test 与 staging 构建共用 `apps/web/dist` 输出目录，因此本地验收时串行；待 G1-11 CI 建立后，若并行则必须先分配独立输出目录。契约测试不读写共享数据，可由 Node 测试运行器并行调度。

## 5. 验收记录

- 先失败证据：测试首次运行因 `packages/config/src/index.ts` 不存在而失败。
- 契约测试：7/7 通过，覆盖四环境、缺失、未知、非法值、环境不匹配、脱敏、schema 和 `.env.example` 漂移。
- 启动前负向探针：注入未知 `WENSHU_API_KEY` 时构建在 Vite 转换前失败，错误为 `CONFIG_UNKNOWN`，原始 sentinel 未回显。
- 实际构建：test、staging、production 均通过；dev 服务返回 HTTP 200 与预期页面内容，停止后端口已释放。
- 统一验证：`pnpm verify` 通过，包含契约测试、TypeScript strict 检查和 production 构建。
