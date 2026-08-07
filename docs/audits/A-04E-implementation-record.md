# A-04E 实施记录 · 已签署引擎渲染耗时分解评估（插桩 + Win11 参考 VM 正式批次 + 冷热探针）

> 前置裁定：[决策 #17](../../决策记录.md)（A-04 挂起另开本任务、两预算写死不再 DEGRADE）、[决策 #18](../../决策记录.md)（D1=分阶段先 Chromium 正式分解、D2=阶段一只测不改且修引擎≠接依赖、D3=增量架构归 A-04E 工装不得演化产品 UI、D4=Typst 供应链不预批）。任务书：[A-04E-implementation-task](A-04E-implementation-task.md)。结论归口：[ADR-0032](../adr/0032-A-04E渲染分解结论口径与阶段二边界.md)。

## 1. 范围对账（任务书验收逐项）

| 任务书要求 | 落地 | 证据 |
|---|---|---|
| renderBreakdown 插桩，additive，输出不变 | `pipeline.ts` 签署形态（anchor `770dfb0`）：server/browser/firstPass/stabilizationRound/finalPass/teardown 六段必填；本地输出不变经审计者独立脚本复算（normalized sha 四份全等 `9ff7b11f…c7459a`） | `packages/pdf-export/src/pipeline.ts`、`test/export.render.test.ts` 闭合断言（残差≤5ms，变异自证 50ms 未计时区段即红） |
| Win11 参考 VM 正式十轮批次（对标门+偏离即停） | run-8 清洁批次 DONE：25/25 步 exit 0 | [批次目录](../../artifacts/perf/2026-08-06-A-04E/) |
| 输入哈希门 | sha256 `4dedb1c2…b6258` === PA-13 v6 签署输入，过 | 批次 `source-hash.txt` |
| 对标门（PA-13 v6 实测区间 [20553.4, 24300.2]） | 双标定门（业主 2026-08-06 MAJOR 裁定升级为前后各一次）：cal-pre 23427.2361 ✓ / cal-post 23700.5074 ✓ | 批次 `calibration.txt` |
| 输出不变跨批次 | run-1/5/10 normalized sha === PA-13 v6 抽样，`c707ac42…429e` 全等（raw sha 各异=时间戳，PA-M5 登记口径） | 审计者比对器 `tmp/a-04e-verify.mjs` 实测 |
| 环境证据四步（A-04 任务书 §6 VM 形态） | env:record 落 `environment.a-04e.json` 入批次目录、移出基线目录、`git status` 核空、environment:check 复核 | 批次 `environment.a-04e.json`、`results.txt`（env-record-clean=0 为真检查，见 §5 run-6/7） |
| 冷热对照实验（业主 2026-08-06 追加） | 同一 browser session 连打两次整份 30 页 | 批次 `warm-probe/warm-print-probe.json` |
| 阶段一边界（只测不改） | 零排版依赖接入、零引擎实现修改、Typst 未进供应链（lockfile/SBOM 零漂移） | 本记录 §7；分支 diff 仅插桩+探针+VM tooling |

## 2. 交付物

- **插桩**（PR #58 主体）：`pipeline.ts` renderBreakdown 六段计时（公开面，业主边界①已明说）+ render 集成测试闭合断言（残差实测 ≤0.5ms）。
- **VM 批次工装**：`tools/a-04e/vm-decomposition.ps1`（三道门 + 双标定 + 漂移插桩 + 诚实记账）、`tools/a-04e/startup-bootstrap.cmd`（Startup 入口）。
- **冷热探针**：`packages/pdf-export/scripts/warm-print-probe.ts`（纯测量，无质量判定）。
- **批次证据**：`artifacts/perf/2026-08-06-A-04E/`（正式签署批次）+ `artifacts/perf/2026-08-06-A-04E-run6-drift-invalid/`（漂移批次留档，显式标注不可引用）。

## 3. 正式批次数据（run-8，2026-08-07 00:47–00:59 本地，VM Off 自收）

十轮 renderBreakdown（ms；残差=renderMs−六段和）：

| run | renderMs | firstPass | stab | teardown | 残差 |
|---|---|---|---|---|---|
| 1 | 24135.5 | 16509.6 | 4805.0 | 2133.7 | 0.38 |
| 2 | 23733.8 | 17197.4 | 4696.8 | 1123.0 | 0.30 |
| 3 | 21949.9 | 14961.2 | 4637.6 | 1410.8 | 0.30 |
| 4 | 25900.5 | 17525.2 | 4826.1 | 2716.2 | 0.28 |
| 5 | 23130.1 | 14832.8 | 4671.2 | 2538.8 | 0.35 |
| 6 | 24750.6 | 17803.9 | 4826.6 | 1471.6 | 0.31 |
| 7 | 25743.0 | 16503.0 | 4742.8 | 3495.1 | 0.35 |
| 8 | 23499.1 | 14584.2 | 5127.1 | 3177.1 | 0.37 |
| 9 | 23588.2 | 16284.5 | 4690.9 | 1360.6 | 0.27 |
| 10 | 22599.9 | 15332.1 | 4653.4 | 1670.4 | 0.36 |

- 极差 3951（PA-13 v6 3747 的 1.05×；run-6 污染批为 9483/2.5×）；teardown 无单向趋势；replay 汇总：pagination p95 25900.5（not_met，存量结论形态）、checks p95 1207.0（met）、export p95 26661.8（met）。
- **冷热探针**（Edg/150.0.4078.83，与 7/29 签署基线同版零漂移）：pass1 navigate 11707.8 + print 4970.7 = 16678.5；pass2 navigate 462.4 + print 4269.4 = 4731.9。冷成本几乎全在首次 navigate（25×），print 冷热比仅 0.86（≈1.16× 反向表述同值）。与批次互证：pass1+measure ≈ 批次 firstPass ~16.5s；pass2+fill/measure ≈ 批次 stab ~4.8s——两组独立测量吻合。
- anchor.txt=`770dfb0b04275632f0ee0a3381e20d2571ac458a`（git fail-closed 真记账）；环境：node v24.17.0 / pnpm 11.15.1 / Edge 150.0.4078.83。

## 4. 结论口径（业主 2026-08-07 裁定为 ADR-0032 写死边界）

1. **路径已定位**：冷 navigate 是成本中心（字体加载+首次全文档布局+CJK 整形缓存），不是"两遍等价的贵打印"；成本结构=一次冷+一次热。出口方向=让浏览器与其缓存跨重排存活——与 ADR-0014 待建架构（稳定页缓存、后台可取消任务）合流。
2. **可达性强证据**：热态整份一轮 4.73s < 8s 预算。
3. **≤8s 未证明**：ADR-0013 出口 1 要求"以输出不变为前提证明 ≤8 秒"，须阶段二持久会话架构实现后正式复测；实现授权属业主单独裁定（决策 #18 D2）。本批数据既不支持"Chromium 路径已达标"，也不支持"无界可修"。
4. **数值引用口径**：本批中位 23661 相对 PA-13 v6 中位 21820 为 **+8.4% 系统性水平偏移**（离散度已对齐，绝对水平没有）；标定门通过余量仅 873ms。**本批绝对数值与 PA-13 不可互换引用**——pagination p95 25900.5 不得当作与 PA-13 同口径的数。签署带 [20553.4, 24300.2] 一个数字未动（修测量配置 ≠ 调阈值）。

## 5. run-6 漂移批次处置（业主 MAJOR 裁定）

run-6（塌链后首跑）批内单向漂移：极差 9483、teardown 1269→6844 单调、run-5~10 六轮出带；标定门 t=0 单点无法捕获。业主裁定：① 标定前后各一次、两次均在带内批次才成立（本记录 §3 已执行）；② 定位累积源。逐轮漂移插桩（drift.txt）：**Edge 进程数恒 5、工作集恒 192–194MB、零累积——浏览器进程/句柄残留假设证伪**；freeMem 缓降 ~120MB/10 轮。剩余候选（合并后宿主 I/O 形态）未完全钉死，如实登记。run-6 export 翻面（30713.8 not_met）经清洁批次（26661.8 met）**证伪为漂移伪影**，留档目录已显式标注不可引用。

## 6. 八轮失败史与根因（本棒最有价值的部分，全部取证在案）

1. **事故 1：差分盘链断裂（0xC03A000E）**。先打检查点后挂载注入 → 写入落进父盘 → 子盘链扯断。处置：子盘 4MB 备份 → `Set-VHD -ParentPath -IgnoreIdMismatch` 重链 → 无数据损失。**教训：VM/磁盘保护性操作的顺序本身即语义——差分盘上正确顺序=先改后备（注入→检查点→开机）；检查点防"写坏内容"，防不了"写错盘"。**
2. **run-1：Startup 仍是旧 cmd**。首轮 robocopy 失败中断 `&&` 链，替换步骤从未执行。教训：注入后必须在盘上逐项核验再卸载。
3. **run-2：UAC 重定向静默死亡**。cmd 重定向到 C:\ 根（建文件需提权）失败 → 整条命令无日志无输出无关机。取证：Prefetch 证 cmd.exe 起了而 powershell.exe 没起 + Security 4624 证 User 开机即登录（排除自动登录假设）。修复：日志落已证明可写的 `C:\wenshu-out\`。**教训：入口重定向目标可写性本身是入口契约的一部分；零产物=先怀疑入口死亡形态。**
4. **run-3：robocopy 排除 node_modules 把 corepack 一并剥离**（`Cannot find module …\corepack\dist\corepack.js`）。修复：补拷 16MB 模块；顺带修 edge-version 空输出毒化 `$failed`、env-record-clean `exit 1` 杀进程隐患。
5. **run-4：pnpm 11 默认 lockfile 供应链元数据校验离线风暴**（170 包 × 1 分钟重试=21 分钟，pnpm issue #11801 证实 `--offline` 也不跳过）。修复：`PNPM_CONFIG_TRUST_LOCKFILE=true` 环境变量（**不动 pnpm-workspace.yaml**；冻结 lockfile+字节核验 store+tarball 完整性仍在；宿主实测验证跳过生效）。
6. **检查点堆到 7 层（run-2~5 系统性变慢根因）**。每轮事故重试加一层差分无人塌链，读盘最多穿 7 层；run-5 calibrate 26076.3 超带 +7.3% 触发 CALIBRATION_DIVERGED（门按设计工作）。业主裁定塌链：删六个 pre-a04e-* 检查点并回 3C3D90AC（保留 pre-pa13 唯一锚），深度回到 PA-13 的 1 层，**签署带不动——修正测量配置不是调整阈值**。塌链后 calibrate 22662.6 落带内，诊断获证。**教训：性能参考机上保护性快照改变被测配置，测量前必须塌回签署时层数；"保护"与"可比"冲突时可比优先，回滚锚一个足够。**（业主自承归因：条件二"重链后补检查点"指令未计入差分层成本。）
7. **run-6：git 缺失导致门静默空转还报 22/22 exit 0**。VM 无 git → anchor 步无产出、env-record 的 git status 核空步空转。事后独立补验（RO 挂载 + `GIT_OPTIONAL_LOCKS=0 git status` 为空 + HEAD=770dfb0）。修复：便携 Git 注入 payload（368MB 宿主同源）+ git-version 门 fail-closed + anchor 纳入 S() 记账。**教训：能静默空转的门不是门。**
8. **run-7：dubious ownership（git 128）**。宿主写入的仓库属主 SID ≠ VM User SID，git 2.52 拒操作——新门即场证明有效（批次按设计停住而非空转）。修复：`git -c safe.directory=...` 逐命令，零持久改动。

配套长期踩坑已回写 AGENTS.md（指令可执行性、全称断言反查、顺序即语义、robocopy /XJ、入口重定向可写性、快照改变被测配置）。

## 7. 范围外与限制（如实声明）

- 探针以**未跟踪文件**注入 VM 仓库（与提交 `74be468` 字节一致，cmp 核验）；锚定 770dfb0 为插桩签署形态，tooling 提交（`abb4aeb`/`77b2206`/`be77af4`/`74be468`/safe.directory 修复）不改变被测管线。
- 本批绝对水平 +8.4% 偏移机理未钉死（非漂移——离散度已对齐；宿主/VM 系统性变慢），按 §4.4 口径隔离引用。
- run-6 漂移源未完全钉死（浏览器残留已证伪）。
- 本地 21 页 dry-run（Win10/Node v24.13.0/Chrome）仅功能验证，非证据。
- VM 机制边界：签署动作（开机跑批）本身不可独立复跑，归业主/VM 背书面（PA-11A 同款登记）。
- 增量分页架构、持久会话实现、Typst 供应链评估均为阶段二事项，本棒零实现。

## 8. 检查执行记录（本机 Windows/D 盘 + Win11 参考 VM，Node v24.17.0/pnpm 11.15.1）

- 插桩单测/集成：65/65 绿；变异自证 50ms 未计时区段即红（恰一例），恢复后全绿。
- 探针本地功能验证 2 轮（21 页）：机制正确（browserMs 计时位置修复后 443.9ms）。
- ps1 PSParser 语法校验：每轮注入前 0 errors；cmd/ps1/探针注入后 cmp 字节核验一致。
- VM 批次：run-1~8 全轮 results.txt/STATUS/bootstrap log 留档于 `tmp/a04e-vm/harvest-run{3..8}/`（run-1/2 无产物，根因取证见 §6）。
- 批次复核：双标定门原件、十轮残差独立重算、normalized sha 跨批次比对（5 份全等）、drift.txt 逐轮、anchor 原件——均通过（明细 §3/§5）。
- 未执行：ubuntu CI（本 PR 推送后由远程矩阵复现）；`pnpm verify` 全套件在合并前轮执行。
