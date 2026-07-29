# ADR-0022：PB-08 SQLite / OPFS 存储引擎选型

- 日期：2026-07-29
- 状态：业主批准；PB-08 已获 Claude 独立审计 PASS；PB-09 正在实现
- 决定：以 SQLite 文件格式作为本地项目库基线；桌面使用原生 SQLite 文件，浏览器使用
  SQLite WASM 的 OPFS VFS。ArkWeb 能力未在设备验证，三端同格式仍为条件性目标，不宣称
  已经三端贯通。

## 决策依据

隔离探针 `probes/pb-08-sqlite/` 使用了两个真实引擎面：

1. 桌面/进程侧由 Node 24.17.0 的 `node:sqlite` 打开真实 `.sqlite` 文件，引擎报告
   SQLite 3.50.4。探针完成 v1 建表、v2 `ALTER TABLE` 真迁移、两个独立连接的写锁竞争、
   60,000 段中文近真实规模正文写入、关闭后重新打开，并核验文件头为
   `SQLite format 3\0`。
2. 浏览器侧由真实 Chromium 中的两个独立标签页分别启动 Worker，运行官方
   `@sqlite.org/sqlite-wasm` 3.53.0-build1。数据库以
   `file:pb08.sqlite?vfs=opfs` 打开，引擎自报 SQLite 3.53.0、`vfs=opfs` 且
   `persistent=true`。首标签持有写事务时，第二标签的同库打开/写入被阻塞；释放后第二标签
   完成写入，两标签最终读到 2 行。关闭重开仍读到首行，且浏览器存储用量大于零。

以上不是 `Map`、JSON 文件或内存 fake。测试直接对真实 SQLite 版本、真实磁盘文件头、
OPFS VFS 身份、持久化重开、迁移和竞争行为断言。

## 三端同格式的诚实边界

SQLite 的逻辑 schema 与数据库文件格式适合作为桌面和浏览器共同目标，但访问边界不同：

- Electron/桌面可以打开操作系统路径上的标准 SQLite 文件；
- Web 的 OPFS 文件受同源私有存储管理，不能把普通文件路径 API 直接复用到桌面。生产层需有
  明确的平台存储适配器，并另行验证导入/导出或字节搬运，不得把“同一 SQLite 格式”写成
  “同一访问 API/同一物理路径”；
- ArkWeb 因本机 BIOS 虚拟化未开启且无可用真机，本任务没有设备实测。ArkWeb 是否支持所需
  Worker、WASM、OPFS/等价持久化和锁语义标记为 `needs_device_to_verify`。浏览器结果没有
  冒充 ArkWeb 结果。

因此 PB-08 的结论是“桌面 + Chromium/OPFS 已实测，ArkWeb 与三端实际搬运待验证”，不是
“三端同库已通过”。若 ArkWeb 不具备兼容 OPFS 路径，仍可保持 SQLite 逻辑格式，但必须在
PB-09 前明确 ArkWeb 文件/关系库适配边界；若连稳定 SQLite 文件格式都无法提供，则应重审
本 ADR。

## 供应链与批准边界

浏览器候选固定为 `@sqlite.org/sqlite-wasm@3.53.0-build1`，Apache-2.0，来源为 npm：

`https://registry.npmjs.org/@sqlite.org/sqlite-wasm/-/sqlite-wasm-3.53.0-build1.tgz`

integrity：

`sha512-PfWPWN2n+/37doa8oh2/oUXk4OOsRYZsxc1W1sDXIGb/Pu5Yrb+f2eyYpgQMGITVX7HVgxhs9P18Rc6I97ym/g==`

PB-08 评估时，候选只存在于探针自己的 `package-lock.json` 和 `node_modules`。业主批准后，
PB-09 将它以 `@wenshu/project-storage` 的直接依赖写入根 `pnpm-lock.yaml` 和 `sbom/sbom.json`；
版本、来源与 integrity 保持与本 ADR 一致。Node 自带 SQLite 仍是桌面路径，不新增运行时包。

## 未选择与后续

- 不选择 Map/JSON：不能提供真实事务、迁移、锁和标准数据库格式，违反 PB-08 命门。
- PB-08 没有实现生产 repository、迁移框架、云同步或 UI；这些不属于选型探针。
- PB-09 负责 v0→v1 迁移、真实库隔离、备份/恢复；Electron 运行时与 ArkWeb 设备矩阵仍由
  后续平台验证完成。ArkWeb 设备验证最迟在宣称三端同格式之前完成。

## 复现

```powershell
Set-Location probes/pb-08-sqlite
npm ci --ignore-scripts
npm test
npm audit --omit=dev
```
