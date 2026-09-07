# A-04E-2a 实施记录 · 单遍回填管线 + 持久会话稳态 ≤8s 复测（双批次）

> 任务书：[A-04E-2-implementation-task](A-04E-2-implementation-task.md)（§5.1 为现行验收口径）。
> 裁定链：[决策 #19](../../决策记录.md)（出口 1 授权）、[#21](../../决策记录.md)（D1′ 占位+原地回填）、
> [#22](../../决策记录.md)（标定走旧管线对旧签署带，双检出）、[#23](../../决策记录.md)（run-2a-9 批后
> 标定破下限书面豁免）。业主裁定（2026-09-07，选项一）：批次加 900s 开机沉降窗口。
> 审计报告命名约定：`A-04E-2a-claude-audit.md`（任务书 §7）。

## 1. 范围对账（任务书 §5.1 逐项）

| §5.1 项 | 落地 | 证据 |
|---|---|---|
| **8s 全量重排（持久会话稳态，承重口径）** | **达成**：run-2a-9 同会话 warmup+10 连续完整管线，formal p95(totalMs)=**5352.8ms ≤ 8000**（余量 33%，与任务书 §0 预测 ~5.4s 吻合）；冷启动 browserLaunchMs=647.9 归启动预算单独登记 | `persistent-session-v1\summary.txt`、`persistent\persistent-session-batch.json` |
| 测量形态（勿误测） | 驱动 `a04e2a-persistent-session-batch.ts` 一次 `launchBrowser` 经 `createBrowser` 注入连跑；**第一批 10 次独立 CLI 形态的 BUDGET_NOT_MET（p95=18409.5）如实登记为结构性 not_met**（§5.1 预告的形态，非产品回归） | 两批 `persistent-batch.log` / `summary.txt` |
| 标定门（决策 #22） | 双检出、main 锚定逐位核验；run-2a-8：批前 22035.1 ✓ / 批后 22584.6 ✓；run-2a-9：批前 23059.6 ✓ / 批后 18889.0 **破下限** → 决策 #23 书面豁免翻正 | 两批 `calibration.txt`、`anchors.txt`；§4 时间线 |
| 输出不变（签署基线等价门） | **两批均零差异**：`equivalent: true`，21 页 11876 run 全序列逐一项相等；VM 侧重跑（Edge 150 恢复后） | 两批 `golden-equivalence.log` |
| 回填正确性双门 | ① 回填前后几何全等自比门（终验，除数字 run 外全钉定含 bbox.x）＝`backfill-toc.ts` 终验断言，变异自证变红；② 跨产物等价门见上行 | `packages/pdf-export/src/backfill-toc.ts`、`test/backfill-toc.*.test.ts` |
| 占位替换守卫 | 占位 `888` 替换为 1/2/3 位真实页码三情形过双几何门；真非占位数字串（正文 `123`）被拒不改写 | `test/backfill-toc.unit.test.ts` 决定性用例 |
| 收敛性 | `resolveStableTocPages` 退役，单遍构造上无收敛轮；决定性测试证大纲测量值即终值 | `pipeline.ts`、`test/backfill-toc.render.test.ts` |
| 持久会话 | R5 接缝：管线 finally 绝不 close 外部会话（spy 计数测试）；取消以 `PDF_EXPORT_CANCELLED` 至终态且同会话立即可再导出 | `test/persistent-session.render.test.ts`（2/2 绿） |
| 签署快照重签 | 不重签（等价门两批零差异，D3 失效条件未触发） | 本表「输出不变」行 |
| 确定性门（持久会话专用口径） | 四约束全落实：① 签署口径 `normalized-pdf-sha.mjs` 算法逐字节未动（仅补 node: 显式导入，见 §7）；② 新口径 `normalized-pdf-sha-persistent.mjs` 并存并登记差异来源（§6）；③ 交叉校验冷启对新旧口径判定一致；④ M1 换指/M2 删节点/M3 增节点反例判不等。VM 侧 verify-caliber 六组全 PASS | 两批 `determinism.txt`、`verify-caliber.log` |
| 引导层前置门清单 | **§5 单列成清单**（10 条，含本棒五轮失败的全部根因） | 本记录 §5 |
| 测试串行化知情 | §7 声明：引入理由、根因、副作用与取消断言耗时分布 | 本记录 §7 |

## 2. 交付物

- **单遍+回填管线**（决策 #21 D1′）：`backfill-toc.ts` 主入口（compose 期 `888` 占位 → 单遍渲染 → 大纲测量 → 字节级原地回填：配对游标/ToUnicode 反查/多余槽留空壳/终验几何全等门）+ 拆分模块 `backfill-toc-shared.ts`（fail 出口/占位契约常量/跨模块类型）/`backfill-toc-scan.ts`（白名单扫描器）/`backfill-toc-pages.ts`（页装配与扫描↔提取交叉校验）/`backfill-toc-geometry.ts`（几何终验门）——拆分为送审前 quality:check file-size 门拦截后的纯搬迁（912 行 > 400 上限，按行抽取零语义改动，tsc/eslint/prettier/85 例复测全绿）；`pipeline.ts`（createBrowser 持久会话接缝，firstPassMs=唯一遍、stab=[]、final=0）；`compose.ts`（TOC_PAGE_PLACEHOLDER 单源）。
- **测量与判定工装**：`vm-single-pass.ps1`（第一批 CLI 形态）、`vm-persistent-pass.ps1`（第二批持久会话形态）、`a04e2a-persistent-session-batch.ts`（驱动，纯测量无判定）、`normalized-pdf-sha.mjs`（签署口径）/ `normalized-pdf-sha-persistent.mjs`（第二批口径）/ `verify-persistent-caliber.mjs`（六组决定性校验）、`a04e2a-signed-baseline-compare.ts`（等价门）、`vm-chain-depth-check.ps1`（含 NIC 断开硬检查）。
- **批次证据**（本机 `artifacts/perf/2026-09-07-A-04E-2a/`，gitignored 惯例同 PA-13）：
  - `single-pass-v1\`（run-2a-8，CLI 形态全门批次，zip sha256 `EBBC9E26…FEBE` 双向核验）；
  - `persistent-session-v1\`（run-2a-9，持久会话形态全门批次，zip sha256 `804B1750…9EBF` 双向核验）；
  - 五轮失败证据原件保留在 VM `C:\wenshu-out\a-04e\single-pass-v1-FAILED-*` / `-run-2a-7-*`（§4/§5）。
- **测试**：85/85 绿（`node --test --test-concurrency=1`），5+1 变异自证（占位守卫/几何门/终验门各因正确原因变红）。

## 3. 正式批次数据

### 3.1 run-2a-8（第一批，CLI 冷启形态，分支锚 af8ae12，VM 内 24 步全 exit 0）

- 双标定：批前 22035.1127 ✓ / 批后 22584.5965 ✓（带 [20553.4, 24300.2]，决策 #22 形态：main `f64f348` 两遍管线）。
- 10 跑 totalMs 排序：16788.2 / 17081.3 / 17218.8 / 17429.3 / 17521.6 / 17952.4 / 17985.3 / 18247.6 / 18362.9 / 18409.5；**p95=18409.5 > 8000 → STATUS: BUDGET_NOT_MET（决策 #18 D3 如实登记，无 DONE 标记）**。run-1 插桩语义留证：firstPassMs=13578.2（唯一渲染遍）、stabilizationRoundMs=[]、finalPassMs=0。
- 确定性：10/10 normalized sha 全等（`1BA3BDCB…FC44`，签署口径）。
- golden 等价门：`equivalent: true`（21 页、11876 run 全等）；golden normalized sha `4010C7FD…E03A` vs 签署基线 `816B8EE9…B6C8` 不等——**预期内**，差异来源登记见 §6。
- 定性：该 not_met 是任务书 §5.1 预告的**结构性形态**（每跑付 14.6–17.8s 冷启动 firstPass），不构成产品回归；预算的约束性测量归第二批。

### 3.2 run-2a-9（第二批，持久会话稳态形态，分支锚 d2b6787，VM 内 18 步全 exit 0 + 如实拦停项）

- **预算达成**：warmup run-1 totalMs=14531.6（会话内首跑冷渲染 renderMs=11066.5）→ formal 10 跑 totalMs 排序 5038.9 / 5076.5 / 5082.6 / 5091.8 / 5095.6 / 5138.2 / 5144.8 / 5154.5 / 5177.5 / 5352.8，**p95=5352.8 ≤ 8000，budget-met=True**；renderMs 区间 4322.5–4610.2（firstPassMs≈renderMs，单遍语义）；browserLaunchMs=647.9（启动预算归属留证）。
- 确定性（persistent 口径）：10/10 全等（`50769857…1F82`）。
- verify-caliber（VM 侧）：六组全 PASS——会话对判等、阴性对照判等、M1 换指（node00001876→node00002266）判不等、M2 删节点判不等、M3 增节点判不等、冷启对新旧口径一致（均判等）。
- golden 等价门零差异（golden sha `4010C7FD…E03A` 与 run-2a-8 逐位一致——跨批次、跨测量形态互证）。
- 双标定：批前 23059.5598 ✓ / **批后 18889.0319 破下限** → CALIBRATION_DIVERGED_POST 如实拦停 → **决策 #23 书面豁免翻正**（身份零漂移、方向=机器偏快读数偏乐观、+13% 修正后 ~6050ms 仍达标；豁免仅限本批、不构成先例）。
- 结论：**8s 全量重排预算在持久会话稳态形态下达成，余量 33%**。

## 4. 环境事件时间线（2026-09-05 ~ 09-07，全部留证）

> 本棒最大的非技术成本。所有处置动作有可核证据；失败批次目录在 VM 原样保留未删。

1. **9/5 23:29 VM 启动后批次未跑**：autologon 未发生（根因见 §5-7）；且 VM 挂 Default Switch（NAT 通外网）——**「VM 离线」是错误假设**。
2. **9/5 夜 环境污染**：Windows Update 联机下载 30 个更新 + 两次干净重启，**Edge 150→152.0.4191.62、OS 打 KB 至 5066793**——签署环境身份被改。
3. **9/6 受控回滚**（业主授权「按最佳实践决策并继续」）：污染差分盘归档（`D:\VMs\archive\WinDev2407Eval_3C3D90AC-contaminated-20260906.avhdx`，sha256 `4AE4A3D9…129711` 双向核验）→ `Restore-VMSnapshot` pre-pa13-calibration-20260729 → **回滚把 7/29 的连网状态带回，被新链门（NIC 断开硬检查，827f8cc）当场抓获** → 断 NIC → 链门 PASS。Edge 150.0.4078.83 / OS build 22621 无 9 月 KB 恢复。
4. **autologon 修复链**：镜像 User 账户空密码 + 从未配 DefaultPassword，现代 Win11 拒绝空密码自动登录（Winlogon 结果 1327；历史 20 次登录全是人工点图标）→ utilman SYSTEM 通道（WMI 合成按键换锁屏 Win+U，全程备份/复原逐字节核验）→ `net user User 565005` + 注册表 DefaultPassword → autologon 实证 + PS Direct 带内观测通道解锁。
5. **工装补齐**：7/29 检查点态 payload 无 git（run-2a-2 Fail-Stop 实证）→ 从归档盘 robocopy + 字节核验（9310 文件 430,879,447 字节）；worktree 元数据残留挂载期 F:/ 路径（run-2a-3 锚定门拒跑）→ 修复。
6. **9/6–9/7 五轮失败 → 修复 → 重跑**（详见 §5 清单）：run-2a-4 store 跨时代断层、run-2a-5 陈旧 node_modules、run-2a-6 开机期标定出带、run-2a-7 预算门截断证据链；**robocopy 符号链接递归事故**（pnpm store `v11/projects` 回指链接未加 `/XJ`，40GB/65 万文件递归拷入 +  purge 越界清空 wenshu/wenshu-main 两仓 → 归档盘逐字节恢复 + 增量 bundle 推进）。
7. **9/7 双批次收官**：run-2a-8（CLI 形态，全门绿 + BUDGET_NOT_MET 结构性登记）与 run-2a-9（持久会话形态，预算达成 + 决策 #23 豁免）。
8. **Startup 入口重建路径（具体化）**：`C:\Users\User\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Programs` 不存在——实际为 `…\Start Menu\Programs\Startup\wenshu-bootstrap.cmd`（仓内真源 `tools/a-04e/startup-bootstrap-2a.cmd`，PS Direct `Copy-Item -ToSession` 注入）；引导日志 `C:\wenshu-out\a-04e-2a-bootstrap.log` / `a-04e-2a-persistent-bootstrap.log`（+ `-exit.txt`）；PA-11A 时代 98B 旧入口已留档备份。

## 5. 引导层前置门清单（任务书 §5.1 专项行：靠东西拦，不靠人记得）

| # | 约束 | 拦截机制 | 本棒实证 |
|---|---|---|---|
| 1 | corepack 按 **cwd** 解析 packageManager 钉版 | 批次脚本 `Set-Location $branch` | run-2a-1 `single-pass-v1-FAILED-corepack-cwd`（非仓 cwd 回退 latest 离线必 ENOTFOUND）；fail-closed 正常触发、零伪造数据——门有牙的正面实证 |
| 2 | pnpm install 必须 `--offline` fail-fast | 脚本硬编码（8b54d9f） | run-2a-4：无旗标时逐包 10s/60s 重试风暴，故障信号延迟 75+ 分钟（`single-pass-v1-FAILED-store-missing-pocb-deps`） |
| 3 | store 跨时代完备性 | 宿主 fetchroot（仅清单+lockfile 拷贝）离线复装终验背书 | 7/29 检查点 store 缺 PoC-B 依赖（electron 43.1.1/prosemirror/undici 等）；首轮填充曾漏 pdfjs-dist（pnpm 报 TimeoutError 但 exit 0 的假象），二轮补齐后离线复装 exit 0 |
| 4 | 陈旧 node_modules 盲区 | 凡从外部介质恢复仓，必须清 node_modules 全量重装 | run-2a-5：归档盘恢复的 node_modules 过了 lockfile 哈希校验（lockfile 自 8/6 未变），pnpm 报「Already up to date」但 @wenshu/fixtures 工作区链接缺失，environment:check/env:record 炸 |
| 5 | CJK PowerShell 必须 UTF-8 BOM | 工具层约定（tools/README.md 已回写） | PS 5.1 对无 BOM ps1/cmd 按 GBK 解码 |
| 6 | git 跨介质所有权 | 一律 `git -c safe.directory=<path>` 逐命令 | 挂载/robocopy 恢复的文件 SID 与 VM 用户不同（dubious ownership）；批次脚本全程带旗标故免疫 |
| 7 | autologon 不等于「配过」 | DefaultPassword 注册表 + 实证登录 | 空密码 autologon 被 Win11 拒绝（1327）；须显式密码+注册表+实证（qwinsta + PS Direct） |
| 8 | 「VM 离线」假设 | 链门 `vm-chain-depth-check.ps1` NIC 断开硬检查 | Default Switch NAT 通外网致 9/5 污染；回滚会带回连网状态（首战立功） |
| 9 | robocopy 必须 `/XJ` + `MSYS_NO_PATHCONV=1` | 操作纪律（本清单） | pnpm store `v11/projects` 是回指项目的符号链接，未加 /XJ 导致 40GB 递归拷入；purge 越界清空两仓（归档盘恢复） |
| 10 | 管道吞退出码 / bash-PS 转义 | 日志落文件 + 显式 `$LASTEXITCODE` 判定 | 多次实测 |

## 6. normalized sha 差异来源登记（任务书 §5.1：不得因几何等价而略过）

1. **分支产物 vs 签署基线**（两批一致 `4010C7FD…E03A` vs `816B8EE9…B6C8`）：预期内不等——回填/修复/压印链产出增量更新结构（独立 stamp 对象与独立文本算子），视觉不变性证据是全 run 序列等价门（两批零差异）。签署口径一字未动。
2. **持久会话形态 node ID 会话漂移**：Chromium 结构树 ID 计数器会话进程全局递增，同会话第 2 次打印的 `/ID (nodeNNNNNNNN)` 及 `/Headers` 引用整体平移（run-2a-9 verify-caliber 实测区间 node00001876→node00002266）。**A-10P 备案：持久会话导出 PDF 的 node ID 不从 0 起——非缺陷，防止后续误报**。新口径按首次出现序规范化重编号（比较 ID 图重命名同构，非抹除——抹除会使换指/增删/乱序不可检出）。
3. Skia 墙钟 `/CreationDate`/`/ModDate`：两口径均归一化（PA-05 元数据政策书面允许的确定性差异来源）。

## 7. 测试串行化知情声明（任务书 §5.1 专项行）

- **引入理由**：`cancellation.render.test.ts` 两例计时敏感断言在并发调度下偶发误伤（flake 观察项）；`pnpm test` 固定 `--test-concurrency=1`。
- **串行化后取消断言耗时分布**（本机实测，node v24.13.0，逐例）：
  ① pre-aborted signal 导入阶段终止、零残留：**7.8ms**；
  ② 浏览器会话取消（在途命令拒绝、进程杀死、profile 清除）：**1907.3ms**——贴「取消后 2 秒内停止消耗主要计算资源」预算边界（余量 ~93ms），**是已知的负载敏感断言**；
  ③ render 中途 abort 以 cancelled 终态、无半截产物：**825.6ms**；
  ④ 红线（未触发的 signal 对产物完全无操作）：**4637.3ms**。
- **副作用自答（「会红」是否变「不会红」）**：串行化消除的是调度噪声对计时断言的误伤；**检出能力未降**——断言的语义（取消终态码/零残留/进程清理/会话存活）全部保留且仍由真实 Chromium 驱动，无任何断言被删除或放宽。②的 2s 边界在重负载机器上仍可能误红：那是预算语义问题（业主审计时核），不是串行化引入的。
- **M1 冗余证成**（决策 #22 承接预告）：配对层只弱化「回填配对」而保留终验几何全等门拿对照——与 PA-09 表格归属三重防线同一形态（主判定可失效、终验必拿到独立对照），审计者可自构「只弱化配对层且让终验拿不到对照」路径重放，预期被终验门拦截。
- **锚定 sha 自纠案例**：main 锚 `f64f348…614c3` 在 run-2a-3 实证拦下 worktree 元数据腐化（挂载期 F:/ 路径残留）——锚定门不是仪式，本棒被它救过一次。

## 8. 承接与遗留

- **A-04E-2b 未开工**：D4（验证宿主）待裁定；语料 30 页/30000 字（阶段一已钉）；ADR-0014 四项。2a 结论改变缓存设计基线（整份重排稳态 ~5.1–5.4s 已达成）。
- **VM 状态**：批次收官后已关机；五轮 FAILED-* 证据目录与两批正式目录在 VM `C:\wenshu-out\a-04e\` 原样保留；链门 PASS 态（单差分盘、单快照、NIC 断开）。
- **锚定纪律登记**：两批 VM 证据锚定的分支头是 `af8ae12`（run-2a-8）/ `d2b6787`（run-2a-9，见两批 `anchors.txt`）；回填模块拆分提交在其后，属**批后纯搬迁**（行级搬运零语义改动，85/85 复测+tsc/eslint/prettier 全绿为证）。审计者可先逐位比对锚定提交内容与批次证据的一致性，再单独核拆分提交的纯搬迁性质；签署基线与 VM 批次证据零改动。
- ** flake 观察项**：取消断言②的 2s 边界余量 ~93ms，审计者核检出能力边界。
- **CI 提示**：分支 18 提交首次过全量 `eslint .`/`format:check`/`tsc`（本地已绿）；`--offline` 旗标、沉降窗口、预算收尾判定三处批次脚本变更均有对应失败实证（run-2a-4/2a-6/2a-7）。
