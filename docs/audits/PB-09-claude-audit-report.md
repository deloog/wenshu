# PB-09 版本化迁移 / 隔离真库集成 / 恢复 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-30
> 实施基线：PR #39 分支 `pb-09-versioned-storage-migrations`（提交 `6c61135`）；base `origin/main`
> 远程验证：CI **8/8 pass**（真库集成 5/5 已接入 `contracts` 作业）；我 scratch 隔离用 `node:sqlite` **独立复跑命门对抗 5 组**
> 审计方法：**数据不丢命门独立喂对抗(强杀/磁盘满/只读/损坏恢复自证) + 幂等/append-only/篡改独立复现 + worker 隔离核 + 供应链落地核 + 反例猎杀**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PB-09 通过,可合并 PR #39。** 无 BLOCKER/MAJOR。**一条 MINOR(错误掩盖,非数据安全,见 §4),不阻断签署,登记待修。** 门禁命门"已提交数据零丢失"独立坐实。

- **数据不丢(命门,我独立喂对抗)**:强杀未提交事务/真 `SQLITE_FULL` 磁盘满/只读拒绝下,**已提交数据逐条保留、库保持一致**;损坏主库时**从最近 SQLite 备份恢复、损坏文件被 quarantine 不当真源**。
- **迁移幂等 + 库层 append-only + 篡改 fail-closed**:v0→v1 原子迁移,**重复运行不重复应用**;`schema_migrations` 由 **SQLite BEFORE UPDATE/DELETE 触发器** 强制 append-only;删触发器或改 checksum → `HISTORY_TAMPERED`。
- **真库、每 worker 隔离**:集成用真实 SQLite(非 Map/JSON),每 worker 独立库/目录、互不串写。
- **供应链落地干净**:仅 `@sqlite.org/sqlite-wasm@3.53.0-build1`(Apache-2.0,integrity 与 PB-08 一致)按批准入根 lockfile/SBOM,无夹带包。

## 2. 数据不丢（命门,我独立喂对抗,非复述自述）

我在 scratch 用 `node:sqlite` 直接跑真库(不装依赖、不建 worktree):

| 对抗 | 我的独立结果 |
|---|---|
| 迁移**跑两遍** | 历史长度 1→1,**幂等不重复应用** |
| `schema_migrations` **UPDATE / DELETE** | 触发器 `raise(abort)` **双双阻止**(库层 append-only) |
| **删触发器**后再迁移 | `STORAGE_MIGRATION_HISTORY_TAMPERED` |
| **真 `max_page_count` 磁盘满**(写 12 次后满) | 写失败抛错、**已提交 p1 仍在、库一致**(命门保持) |
| **只读**库写入 | 拒绝、**已提交数据仍 1 条** |
| **砸烂主库文件** + `recover:true` | **恢复源≠null、committed `keep` 恢复回来、损坏库 `.corrupt-*` quarantine**(副本优先、不当真源) |
| 两 worker 不同路径 | A 只见 A、B 只见 B(**无串写**) |

**判定**:所有 FAIL 场景(丢已提交数据/半写当真源/迁移非幂等/历史被改/worker 串写/手改绕过迁移)均未触及——命门守住。备份用真 `node:sqlite` `backup()` API、WAL 崩溃安全、`integrity_check` 查损坏——真行为非 fake。

## 3. 供应链落地、门禁、范围

- **供应链(我核 diff)**:`pnpm-lock`/`sbom` 净增**仅** `@sqlite.org/sqlite-wasm@3.53.0-build1`,**Apache-2.0**、integrity `sha512-PfWPWN2n…97ym/g==`(与 PB-08 钉定一致),SBOM 有对应条目;其余仅 `@types/node`+`typescript`(catalog devDep),**无第三方夹带**;`node:sqlite` 为 Node 内置。业主已批准入生产供应链。
- **门禁**:真库集成 **5/5**(已接入远程 `contracts` 作业);PR CI **8/8**;`pnpm verify` exit 0;冻结物(G1-04/PB-08 存储 ADR)零漂移。
- **范围**:库层迁移/集成/恢复;桌面 host 文件原子性与崩溃恢复的**平台文件边界属 PB-10**(本棒未越界);ArkWeb 仍 `needs_device`,未宣称三端贯通。

## 4. MINOR 发现（非阻断,登记待修）· 磁盘满错误被掩盖

- **定位**:`packages/project-storage/src/store.ts:213-215` `writeProject` 的 `catch (error) { this.database.exec("rollback"); throw error; }`。
- **证据(我独立复现)**:`max_page_count` 满时 `commit` 抛 `SQLITE_FULL`,**SQLite 已自动回滚事务**;catch 再 `exec("rollback")` 因"无活跃事务"抛 `cannot rollback - no transaction is active`(`ERR_SQLITE_ERROR`),**该二次错误覆盖了原始磁盘满错误**并向上抛出。
- **影响**:调用方拿到的是误导性的"无事务可回滚",**无法据错误区分磁盘满(应降级提示)与其它写失败**——与 PB-10"拒绝有降级"相关。**已提交数据仍零丢失、库一致、无悬挂事务,命门不破**;官方测试④只 `assert.throws`(不断言错误类型)故照常通过,是我对抗探针补出的缺口。
- **对照与修法**:同仓 `migrations.ts:154-156` 的 rollback **已用 `try{…}catch{}` 守卫**(注释"failed BEGIN 无事务可回滚");`writeProject` 照此守卫(或按 SQLite autocommit 状态判断再 rollback),即可让**原始 `SQLITE_FULL` 原样透出**。
- **严重级别**:**MINOR**(错误保真度,非数据安全)。**不阻断本次签署**;建议 Codex 修复,**最迟在 PB-10 建"拒绝降级"之前关闭**(PB-10 会依赖据错误分流)。

## 5. 结论与交接

**PB-09 独立审计 PASS(带一条 MINOR)。** 版本化原子迁移、库层 append-only 与篡改 fail-closed、强杀/磁盘满/只读下已提交数据零丢失、损坏恢复副本优先且 quarantine、worker 隔离真库、供应链按批准干净落地——存储持久层坐实。

- **登记待修**:§4 MINOR(store.ts 磁盘满错误掩盖)→ 由 Codex 修复,最迟 PB-10 前关闭;可由我复审关闭。
- **承接**:**PB-10(原子保存 / 崩溃恢复 / host 文件边界,R-HOST/R-DATA)** 承接——届时我审"强杀重开≤10s、上次成功成品不损坏、拒绝权限有降级、路径逃逸/半写文件即阻断",并核 §4 MINOR 已修;**ArkWeb 设备矩阵最迟在宣称三端同格式前补齐**。
- **诚实说明**:审计中共享工作目录 D:/wenshu 停留在功能分支(实施者在同目录切分支干活、和/或 worktree add 副作用所致——较前几棒我更正归因,非单一 worktree DWIM);我核实树干净后已切回 main 才提交,报告确在 main、对产物与 main 无影响。本轮我探针②首次正则未抓准错误信息,精确复跑后反而定位到上述 MINOR,如实登记。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现;MINOR 修复后由 Claude 复审关闭。
