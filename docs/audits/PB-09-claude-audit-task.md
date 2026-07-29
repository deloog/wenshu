# PB-09 Claude 独立审计任务书

## 审计目标

确认 PB-09 使用真实 SQLite、版本化且 append-only 的 v0→v1 迁移、每 worker 独立库与副本
优先的损坏恢复；确认已提交数据在重复运行、强杀、损坏、写满和只读失败中不丢失。

## 独立复现

```powershell
pnpm --filter @wenshu/project-storage typecheck
pnpm --filter @wenshu/project-storage test
pnpm ci:job contracts
pnpm supply:check
```

## 必核反例

1. 打开真实 `.sqlite`，核验 v0→v1 重跑不会重复 migration 或 seed；迁移历史的 update/delete
   必须被 SQLite trigger 拒绝。
2. 删除历史 trigger 并篡改 checksum 后重开，必须以
   `STORAGE_MIGRATION_HISTORY_TAMPERED` fail-closed，不能默默接受或重建历史。
3. 亲自创建已提交项目，在未提交 `BEGIN IMMEDIATE` DDL/写入期间强杀子进程；重开后已提交项目
   仍在，半提交的表/行不存在。
4. 写坏数据库后，确认恢复源是最近 SQLite backup 而不是损坏库；恢复后文件头是
   `SQLite format 3\0` 且数据一致。
5. 用 SQLite 原生页面上限制造 `SQLITE_FULL`、用只读连接制造写拒绝；两者之后先前提交的数据
   必须保持。
6. 同时创建两个 worker 根目录与库，确认物理路径/备份目录不同且项目不能串写。
7. 核根 `pnpm-lock.yaml` 与 `sbom/sbom.json` 已含已批准的 Apache-2.0 候选，integrity 可重建，
   无 GPL/AGPL/未知许可；确认 CI `contracts` 作业真正执行项目存储集成测试。
8. 确认未夹带云同步、UI、生产 host 原子保存或 ArkWeb 通过声明。

任一已提交数据丢失、半写/损坏库被当真源、迁移重复/历史被改、worker 串库、手改 schema 绕过
迁移或供应链漂移，均应阻断签署。
