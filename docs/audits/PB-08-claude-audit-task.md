# PB-08 Claude 独立审计任务书

## 审计目标

确认 PB-08 使用真实 SQLite/OPFS 引擎完成真实迁移、锁竞争、大文档和持久化探针；三端同格式
主张诚实，候选供应链隔离，且没有越范围建设生产存储层。

## 独立复现

```powershell
Set-Location probes/pb-08-sqlite
npm ci --ignore-scripts
npm test
npm audit --omit=dev
```

## 必核反例

1. 检查桌面产物有真实 `SQLite format 3\0` 文件头、引擎版本和跨关闭重开证据，不接受
   Map/JSON 或内存容器；
2. 独立确认 v2 迁移确实改变 schema，第二连接在第一连接持锁时真实失败，释放后可写；
3. 检查大文档并非几行玩具文本，关闭进程级连接后数据长度仍相等；
4. 确认 Chromium 由两个真实 CDP 标签页、各自 Worker 和官方 SQLite WASM 组成，
   `vfs=opfs`、`persistent=true`，持久化重开与锁竞争均被断言；
5. 核实 ADR 没有把 Chromium 冒充 ArkWeb：ArkWeb 必须保持 `needs_device_to_verify`，
   也不得把同 SQLite 格式夸成同路径/同 API；
6. 根 `pnpm-lock.yaml` 与 SBOM 不含候选；隔离 lockfile 版本、来源、integrity、
   Apache-2.0 可重建，无 GPL/AGPL/未知许可；
7. 不存在生产 repository、云同步、UI 或未经批准的生产依赖接入。

任一伪数据库、伪多标签/OPFS、玩具迁移、三端夸大或供应链越界应阻断签署。

