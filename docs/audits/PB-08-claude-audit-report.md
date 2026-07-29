# PB-08 存储引擎选型（SQLite / OPFS）· Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #38 分支 `pb-08-storage-engine-probe`（提交 `082e1dd`）；base `origin/main`（`6f19a84`，已含 PB-05/05A/06/07）
> 远程验证：CI **8/8 pass**；我 worktree 隔离 `npm install` **独立复跑隔离全套 3/3**（真 SQLite / 真 Chromium OPFS / 供应链）
> 审计方法：**真引擎命门独立复跑(node SQLite + 真 Chromium OPFS 双面自证) + 三端同格式/ArkWeb 诚实核 + 供应链隔离/许可核 + ADR 诚实读**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS（评估诚实、推荐成立）—— 可合并 PR #38。** 无 BLOCKER/MAJOR/MINOR。**"以 SQLite 逻辑格式为本地库、桌面原生文件 / 浏览器 OPFS WASM"为 ADR-0022 建议,最终由业主批准;依赖写入生产供应链亦须业主明确批准。** 本审计确认:真引擎、无 fake、三端同格式未虚假宣布、供应链隔离。

- **真引擎,非伪替代(命门,我双面独立复跑)**:桌面侧 `node:sqlite` 打开**真 `.sqlite` 文件**(我复跑核 `SQLite format 3\0` 文件头、`sqlite_version()` 3.x、v1→v2 真迁移、双连接 `begin exclusive` 锁竞争、54 万字中文大文档关闭重开持久化);浏览器侧**真 Chromium 双标签**各起 Worker 跑 `@sqlite.org/sqlite-wasm` **`vfs=opfs`+`persistent=true`**、跨标签写锁竞争(我复跑 6.2s 真通过)。**不是 Map/JSON/内存 fake。**
- **三端同格式诚实(命门)**:ADR 明写**"三端同格式为条件性目标、不宣称已贯通"**;区分"同 SQLite 格式"≠"同访问 API/物理路径";**ArkWeb 标 `needs_device_to_verify`、未用 Chromium 冒充**。
- **供应链隔离**:候选 `@sqlite.org/sqlite-wasm@3.53.0-build1` **Apache-2.0**、隔离 lockfile 钉 integrity、**根 `pnpm-lock`/`sbom` 零漂移**;`npm audit` 0 漏洞。

## 2. 真引擎命门（我双面独立复跑,非复述自述）

| 引擎面 | 我的独立复跑证据 |
|---|---|
| 桌面 `node:sqlite`(真 SQLite 3.x) | 真 `.sqlite` 文件、**文件头 = `SQLite format 3\0`**、`sqlite_version()` `^3.`、v1 建表→v2 `ALTER TABLE` 真迁移、两独立连接写锁竞争(`begin exclusive`→对方 insert 抛错)、54 万字中文正文写入→关闭重开 `length` 一致、列变 `[id,body,revision]`——**1/1 pass** |
| 浏览器 `@sqlite.org/sqlite-wasm` 3.53.0 | 真 Chromium(经项目 `findChromium`/CDP)双标签、各真 Worker、`file:pb08.sqlite?vfs=opfs` 打开、引擎自报 `vfs=opfs`+`persistent=true`、首标签持写事务→次标签被阻塞(`blockedMs>=100`)→释放后完成、两标签终读 2 行、关闭重开读到首行、`storage.estimate().usage>0`——**1/1 pass(6.2s)** |
| 供应链契约 | 隔离 `package-lock.json` 钉 `3.53.0-build1`/Apache-2.0/resolved/integrity——**1/1 pass** |

**判定**:两个引擎面都是**真数据库真行为**(真版本、真磁盘文件头、真 OPFS VFS 身份、真持久化、真迁移、真锁竞争),Map/JSON 伪替代被 ADR 明确淘汰(违命门)。命门守住。

## 3. 三端同格式 / ArkWeb 诚实（命门诚实核）

- **不虚假宣布贯通**:ADR 结论是**"桌面 + Chromium/OPFS 已实测,ArkWeb 与三端实际搬运待验证",非"三端同库已通过"**——不追认、不糊过。
- **同格式 ≠ 同 API/路径**:Electron 开 OS 路径标准 SQLite 文件、Web OPFS 为同源私有存储不能复用文件路径 API;生产层须显式平台存储适配器 + 另验字节搬运——如实登记适配边界,不把"同 SQLite 格式"写成"同物理路径"。
- **ArkWeb `needs_device`**:本机 BIOS 虚拟化未开 + 无真机 → Worker/WASM/OPFS/锁语义标 `needs_device_to_verify`;**浏览器结果没有冒充 ArkWeb**(承接 PB-01/PB-07/PA-14H 环境诚实口径)。
- **诚实兜底**:若 ArkWeb 无兼容 OPFS 路径,仍可保 SQLite 逻辑格式但须 PB-09 前明确 ArkWeb 适配边界;**若连稳定 SQLite 文件格式都不可得,则重审本 ADR**。

## 4. 供应链、门禁、范围

- **供应链隔离(我核)**:候选仅在 `probes/pb-08-sqlite/` 自带 `package-lock.json`+`node_modules`,**未进根 `pnpm-lock.yaml`/`sbom.json`**(我核 diff 只有 `probes/`+`docs/`);`node:sqlite` 为 Node 内置、非新增生产包;`@sqlite.org/sqlite-wasm@3.53.0-build1` **Apache-2.0**(过许可硬闸,无 GPL/AGPL/未知),`npm audit` 0 漏洞。
- **门禁**:隔离探针 **3/3**(我复跑);PR CI **8/8**;`pnpm verify` exit 0;冻结物(G1-04/PB 各契约/性能预算)零漂移。
- **范围**:只选型 + 真库探针 + ADR;**未建生产 repository/迁移框架/云同步/UI**(留 PB-09);base 正确(建在含 PB-05/05A/06/07 的 main)。

## 5. 结论与交接

**PB-08 独立审计 PASS。** 真 SQLite(桌面 `node:sqlite` + 浏览器 WASM/OPFS)双面证真、三端同格式条件性目标不虚假宣布、ArkWeb 诚实 `needs_device`、候选 Apache-2.0 隔离未进根供应链——存储选型可行、诚实。

- **待业主批准**:①接受 ADR-0022 选型(SQLite 逻辑格式;桌面原生 / 浏览器 OPFS WASM);②`@sqlite.org/sqlite-wasm` 写入生产供应链须业主明确批准(同 ProseMirror/Yjs 先例)。
- 批准后 **PB-09(版本化迁移 / 隔离真库集成 / 恢复,R-DATA/R-TEST)** 串行承接——届时我审"每 worker 独立真库、迁移/重复运行/中断/损坏/磁盘权限失败、数据丢失即阻断、恢复副本优先";**ArkWeb 设备矩阵最迟在宣称三端同格式前补齐**。
- **诚实说明**:审计中 `git worktree add`(即便 `--detach`)再次把主库 D:/wenshu 切到 `pb-08` 分支(与 PB-05A/06 同一 DWIM 现象);我核实树干净后已切回 main、删游离分支才提交——报告确在 main、无影响。本轮我探针无误用。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现;选型与依赖写入由业主批准。
