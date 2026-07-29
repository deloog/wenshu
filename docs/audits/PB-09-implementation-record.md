# PB-09 实施记录：版本化迁移、隔离真库与恢复

- 日期：2026-07-29
- 状态：已实现，待 Claude 独立审计
- 基线：`origin/main` `edf5715`（PB-08 已签、SQLite 选型已获业主批准）

## 交付

新增 `@wenshu/project-storage`，它是 PB-09 独占的 SQLite 库层，不提供 UI、云同步、文件
host 或跨端适配器。

- `migrations.ts` 将空 v0 数据库原子升级到 v1：创建 `projects` 与
  `schema_migrations`，记录固定 migration ID/checksum，并用 SQLite trigger 拒绝迁移历史的
  update/delete；重跑只核验既有历史，绝不重复应用。
- `store.ts` 只允许通过迁移建立 schema，提供幂等 seed、提交写入、读取和显式备份。历史
  trigger 被删除或行被篡改时以 `STORAGE_MIGRATION_HISTORY_TAMPERED` fail-closed。
- `backup.ts` 用 `node:sqlite` 的真实 SQLite backup API 制作副本；检测到损坏时先隔离损坏
  文件，再从最近副本恢复，损坏/半写库从不作为真源。
- `maxPageCount` 是 SQLite 原生页面配额，用于真实 `SQLITE_FULL` 失败与保留已提交数据的
  验证，不是 Map/JSON 或 mock 磁盘。

本棒不处理 PB-10 的 host 原子保存、路径授权或平台崩溃文件边界；ArkWeb 仍
`needs_device_to_verify`，未宣称三端贯通。

## 真实验证

`packages/project-storage/test/store.integration.test.ts` 每一例均用 `mkdtemp` 签发独立目录
及真实 `.sqlite` 文件：

1. v0→v1 后再次运行迁移与 seed，不重复应用/插入；直接 update/delete 历史被 trigger 拒绝，
   破坏 trigger 后的伪造历史在下次打开 fail-closed；
2. 子进程在真实 SQLite `BEGIN IMMEDIATE` 内建立未提交 DDL/写入后被强杀；重开后已提交项目
   仍在、未提交表不存在；
3. 写坏数据库字节后，恢复路径仅从 SQLite backup 副本重建标准 SQLite 文件，已提交项目保留；
4. SQLite 原生页面上限造成真实写满失败，以及只读 SQLite 连接的写拒绝，均不丢先前提交；
5. 两个并发 worker 的根目录、数据库和备份目录不同，分别只读到自己的项目。

实际执行：

```powershell
pnpm --filter @wenshu/project-storage typecheck
pnpm --filter @wenshu/project-storage test
pnpm ci:job contracts
pnpm sbom:build
pnpm supply:check
```

结果：类型检查通过；真实库集成 5/5 通过；contracts 作业通过且已将该 5/5 接入远程 CI；
SBOM 由 170/13 更新为 171/14（包/直接依赖），许可门禁、integrity 与重建检查通过。

## 审计 MINOR 整改（待复审）

Claude 独立审计发现：`SQLITE_FULL` 可使 SQLite 在 `commit` 失败时自动回滚；此前通用
`rollback` 会再抛出“无活动事务”，从而遮蔽原始的磁盘满诊断。`writeProject` 现与迁移路径
一致，守卫补偿性 rollback 并始终重新抛出原始异常。真实页面配额对抗测试已改为显式捕获，
要求诊断保留 `full`、且绝不为 rollback 的“无活动事务”；已提交项目的保留断言不变。

## 供应链与回滚

业主已批准的 `@sqlite.org/sqlite-wasm@3.53.0-build1`（Apache-2.0）现在是
`@wenshu/project-storage` 的直接依赖；根 lockfile/SBOM 由 pnpm 与供应链生成器重建，未手改。
若本任务需要回滚，移除该包、CI 接线、根 lock/SBOM 的生成条目和 ADR 状态更新即可；既有项目
库保留原位，恢复副本不会被删除或覆盖。
