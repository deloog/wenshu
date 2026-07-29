# PB-08 实施记录：真实 SQLite / OPFS 存储引擎探针

- 日期：2026-07-29
- 状态：已实现，待 Claude 独立审计
- 基线：包含 PB-05、PB-05A、PB-06、PB-07 的 `origin/main`

## 交付

`probes/pb-08-sqlite/` 是不进入根 workspace 的隔离候选探针：

- `sqlite.integration.test.ts` 使用真实 SQLite 文件，执行两版真实 schema 迁移、两个连接
  锁竞争、近真实规模中文文档写入、进程关闭后重开和标准 SQLite 文件头核验；
- `browser-opfs.integration.test.ts` 启动真实 Chromium，通过 DevTools 创建两个真实标签页，
  每个标签页各有 SQLite Worker；同源 OPFS 数据库持久化重开成立，持锁标签与竞争标签之间
  的阻塞/释放行为成立；
- `supply.contract.test.ts` 钉定候选版本、Apache-2.0、npm 来源与 integrity；
- ADR-0022 记录桌面/浏览器已测事实和 ArkWeb `needs_device_to_verify` 边界。

探针没有 Map/JSON 替代，没有云同步、生产存储层、UI 或 ArkWeb fake。浏览器和桌面的访问
API/物理路径不同已明确记录；只把 SQLite 逻辑 schema/文件格式列为候选共同目标。

## 实测结果

隔离目录执行 `npm ci --ignore-scripts && npm test`：

- 桌面 SQLite 3.50.4：v1 建表、v2 增列迁移、锁竞争、大文档、标准文件头、重开持久化通过；
- Chromium/SQLite WASM 3.53.0：两个真实标签页 + 两个 Worker、OPFS VFS 身份、重开持久化、
  锁竞争和最终收敛通过；
- 供应链锁定检查通过；
- `npm audit --omit=dev` 为 0 vulnerabilities。
- 隔离探针 `tsc -p probes/pb-08-sqlite/tsconfig.json` 通过；
- 根仓 `pnpm verify` exit 0（含 supply chain 170 包可重建、根 SBOM 零漂移）。

精确耗时只用于探针诊断，不作为冻结性能预算或跨设备结论。ArkWeb 没有设备实测，不宣布
三端同格式通过。

## 冻结与供应链

根 `pnpm-lock.yaml`、`sbom/sbom.json`、G1-04 与 PB-02～07 契约、性能预算均零修改。
`@sqlite.org/sqlite-wasm` 只在独立 `package-lock.json`，生产引入仍待业主明确批准。
