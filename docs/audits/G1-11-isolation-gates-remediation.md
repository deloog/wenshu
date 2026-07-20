# G1-11 隔离设施硬门禁实施记录

> 状态：已实施，待 Claude 独立审计　日期：2026-07-20

本阶段只处理 G1-08 复审 `RA-01`/`RA-02`，没有编写并行 runner 或 CI workflow。本记录不代表发现已关闭；关闭权属于原独立审计角色。

## 实施内容

| 门禁 | 实施 |
|---|---|
| RA-01 证据 API 只有类型约束 | `prepareTestIsolation` 签发的冻结句柄登记到进程内 WeakSet；证据写入和清理共用运行时守卫，同时验证句柄身份、Symbol 品牌、受控真实目录、三个真实子目录、真实 claim 文件及磁盘 token。未准备、序列化后失去品牌、复制品牌、磁盘 claim 篡改均拒绝 |
| RA-02 清理可删除失败证据 | `cleanupSuccessfulTestIsolation` 在所有权守卫后检查 `evidence/`；任何文件或目录存在都 fail-closed，不提供 force 参数。manifest、log、截图/trace 等任意证据保持字节不变 |
| 并发竞态 | 同一签发句柄的证据写入与清理进入调用顺序串行队列；先发起的证据写入完成后，排队清理观察到非空目录并拒绝，不能在检查与写入之间删除证据 |
| 层级接线 | `TestIsolation` 保存真实测试层；证据声明层与 worker 层不一致时拒绝 |

## 自检结果

- 新增独立 `evidence-ownership.unit.test.ts`，覆盖未准备句柄、结构化克隆、保留 Symbol 的对象复制、磁盘 claim 篡改、失败证据非空、任意 trace 文件和写入/清理竞态。
- `pnpm verify`：exit 0；质量护栏覆盖 60 个源码/配置文件和 197 个仓库文件；16 个测试文件完成分层；123 项测试全部通过；9 个包 typecheck 与生产构建通过；无体量预警。
- 未新增依赖、环境变量、宽泛 ignore、`any`、抑制指令或静默 force 清理入口。

## 审计停止点

依 [G1-08 条件通过后续项](G1-08-followups.md)和路线图，本阶段独立审计签署前不得编写首次调用这些 API 的并行 runner，也不得创建 CI workflow 冒充 G1-11 已完成。
