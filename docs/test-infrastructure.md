# G1-08 测试骨架与并行隔离基线

> 状态：已完成（Claude 独立复审 `CONDITIONAL PASS`）　日期：2026-07-20

## 1. 任务边界

本任务建立统一测试分层、测试发现、worker 隔离目录与端口段、失败证据保存能力。它不实现产品功能，不创建数据库，不用内存对象冒充真实数据库，也不把空的渲染、集成或 E2E 层宣称为通过。

共享实现位于 `packages/test-support`，没有新增外部依赖。未来涉及数据库的集成测试仍须安装并运行生产同类真实引擎、执行真实迁移；E2E 仍须穿过真实入口、可部署构建、事务、存储和导出。

## 2. 强制测试分层

所有 `*.test.ts` 文件必须使用下列唯一后缀之一：

| 层级 | 文件后缀 | 能证明什么 |
|---|---|---|
| 单元 | `.unit.test.ts` | 纯规则、构造器和小范围行为 |
| 契约 | `.contract.test.ts` | Schema、协议、版本及边界样例 |
| 渲染 | `.render.test.ts` | 真实渲染器或组件渲染行为 |
| 集成 | `.integration.test.ts` | 被集成的真实浏览器、字体、数据库、文件系统或 Host |
| E2E | `.e2e.test.ts` | 从真实用户入口穿过可部署构建与核心依赖的完整流程 |

`pnpm test:layers` 从仓库根递归扫描全部 `.test.*`/`.spec.*` 候选，只跳过版本库、依赖、构建产物、缓存、测试产物和临时目录的显式清单。候选识别按小写比较以捕获 Windows 大小写变体，但层级分类只接受规范小写后缀；因此 `Foo.Unit.Test.ts`、无层级、错误扩展名、符号链接或伪装层级名称都会失败。现有契约测试已统一使用 `.contract.test.ts`。

## 3. 并行隔离契约

`buildTestIsolation` 以受控根目录、run ID、测试层、worker ID 和 worker index 构造：

```text
test-results/<run-id>/<layer>/<worker-id>/
  database/   未来真实数据库文件或实例元数据的独占位置
  files/      导入、导出和恢复副本的独占位置
  evidence/   失败 manifest、日志、截图与 trace 的独占位置
```

每个 worker 同时得到独立项目 ID 和不重叠端口段。run ID 只接受短的不透明安全标识，worker ID 由非负 `workerIndex` 唯一派生；`layer` 在公共构造器入口再次做运行时白名单校验。路径穿越、Windows 保留名、重复 worker index、负数索引、特权端口和超出 65535 的端口段均快速失败。

准备目录时逐层拒绝符号链接/目录联接，并用排他 `mkdir` 占用 worker 叶目录；同一 run/layer/index 的并发准备只有一个能得到带随机 claim 的 `PreparedTestIsolation`，其余稳定以 `EEXIST` 失败。证据写入和成功清理共用运行时所有权校验：句柄必须由当前进程真实签发、保有 Symbol 品牌且不可变，worker 与三个子目录均为真实目录，磁盘 claim 为真实文件且内容匹配。成功运行可调用 `cleanupSuccessfulTestIsolation`；但只要 `evidence/` 非空就必须拒绝清理并原样保留证据，不存在静默 force 入口。空证据的成功清理只递归删除自己的 worker 叶目录，不删除兄弟 worker 或受控根。调用方仍须保证 run ID 对一次运行唯一；无法隔离的共享资源必须显式串行。

`database/` 只是隔离位置，不代表已经运行数据库测试。原始 fixture 保持只读，运行期只能写隔离副本。

## 4. 失败证据

`writeFailureEvidence` 只接受通过上述运行时所有权校验的 `PreparedTestIsolation`，并要求证据层级与 worker 层级相同，再在其 `evidence/<case-id>/` 下保存：

- `failure.json`：层级、固定 seed、用例 ID 和错误摘要；
- `diagnostic.log`：错误名、消息和可选 stack。

文件使用“仅新建”模式，同一用例不得覆盖先前失败证据。未来渲染/E2E runner 在各自任务中追加截图、PDF、trace 和环境 manifest。测试诊断不得写入密钥、真实用户资料或未脱敏正文。

## 5. 命令与空层语义

- `pnpm test:layers`：审计全部测试文件的层级命名。
- `pnpm test:unit`：运行已登记单元测试。
- `pnpm test:contract`：按全仓登记表运行全部契约测试；生成漂移仍由 `pnpm contracts:check` 执行。
- `pnpm test:render`、`pnpm test:integration`、`pnpm test:e2e`：运行对应已登记文件；当前没有真实用例时输出结构化 `not-registered` 并以退出码 3 失败。仅做明确允许空层的探索时可直接向 runner 传 `--allow-empty`，该模式仍不输出 PASS，也不计入完成证据。
- `pnpm test:foundation`：运行层级审计与测试设施单元反测。
- `pnpm verify`：已纳入 `test:foundation`，随后继续运行配置、契约、严格类型检查和生产构建。

当前反测覆盖仓库根/`tests`/`e2e`/`src` 等任意位置发现、Windows 大小写变体拒绝、跳过名链接拒绝、八路重复 worker claim 仅一项成功、安全成功清理不影响兄弟 worker、claim 被篡改时拒绝清理、目录/项目/端口互斥、路径逃逸、Windows 保留名、预置文件/目录链接、端口溢出、失败 seed/日志保留与禁止覆盖。

## 6. Host 条件项

本任务按路线图处理 G1-06 复审 NF-01/NF-04：文档已改用真实导出名 `validateHostContract`；`validateHostSession` 对终态后到达的 cancel 返回稳定 `HOST_TERMINAL_STATE_DUPLICATE`，并有精确 issue code/path 反测。Claude 首审和复审均确认两项关闭且正常取消链路无回归。

Claude 复审已确认 G1-08 首审 3 MAJOR、5 MINOR 全部关闭，并确认 Host NF-01/NF-04 持续关闭。复审新增 RA-01/RA-02 已登记到 [G1-08 条件通过后续项](audits/G1-08-followups.md)：G1-11 在并行 runner 首次调用证据/清理 API 前，必须补运行时 claim 校验，并在失败证据非空时拒绝成功清理。实施者不得自行宣称这两项关闭。
