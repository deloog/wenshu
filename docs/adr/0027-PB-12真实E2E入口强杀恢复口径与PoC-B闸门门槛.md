# ADR-0027：PB-12 真实 E2E 入口、强杀/恢复口径与 PoC-B 闸门门槛

- 日期：2026-08-01
- 状态：已实现，待 Claude 独立审计
- 决定：以 Electron 壳 + preload 白名单 IPC + Host 0.2.0 协议为 PoC-B 真实 E2E 入口（业主裁定 D1）；强杀 = 真 SIGKILL 真进程、恢复 = 端到端「重开到可操作」p95 ≤ 10 s（业主裁定 D2）；PoC-B 闸门为文档型报告，门槛在本 ADR §4 钉死（业主裁定 D3）。

## 1. 真实入口定义（D1）

E2E 的真实入口链路：node:test 编排器 spawn 真 Electron 43.1.1 进程（`apps/electron-shell/src/e2e-main.cjs --e2e`）→ 隐藏 BrowserWindow（contextIsolation + sandbox + 无 nodeIntegration）→ 场景 bundle（vite 构建 `scenario/`，src 真包代码）在沙箱渲染进程真跑 → 保存/备份/恢复经 `preload.cjs` 白名单 IPC → 真 `createFileHost`（0.2.0 协议）→ 真原子写 / 真 SQLite。

fake 有且只有一处：**AI 计划**（脚本化 ToolRequest 序列 → `ModelToolGateway.invoke`）。核心事务、真库、文件、恢复、知识包导出/导入不得 mock。目录授权为脚本化预授权（`selectDirectory` 直接返回 `E2E_WORKDIR`），与 file-host 集成测试同一口径。

`e2e.knowledge.export/import/report` 三条通道仅在 `--e2e` 模式注册（preload 以 `additionalArguments` 的 `--wenshu-e2e` 旗标决定暴露面；非 e2e 模式暴露面经 PA-14E reverify + security-probe 验证零回潮：exposedKeys 仍恰为 cancel/invoke/registry）。知识包导出/导入需要 node:crypto/fs，生产形态同样运行在 Node 侧（PB-11 D3 裁定不走 host 能力），因此这两条是**编排通道，不是产品表面**；zip 字节仍经真 `file.export.write` 协议落盘。

### 与 A-12 的逐条差异（诚实性边界）

| 维度 | PB-12 E2E | A-12（全 UI 用户闭环） |
|---|---|---|
| UI/交互 | 无 UI，场景驱动 | 真实 UI 全流程 |
| 模板/预览/四级导出 | 不涉及 | 涵盖 |
| 目录授权 | 脚本化预授权 | 真人对话框 |
| 知识包通道 | 编排通道（主进程） | 产品表面 |

PB-12 通过不得读作 A-12 的任何部分完成；不得宣称三端贯通（ArkWeb 仍 `needs_device_to_verify`）；不得追认 PoC-A 排版 `not_met`（决策 #11A）。

## 2. 强杀与恢复口径（D2）

- **强杀**：编排器对真 Electron 子进程发 SIGKILL（Windows 上映射 TerminateProcess），并断言 `signalCode === "SIGKILL"`；杀点两类——保存飞行中（save-loop 模式，2 MiB 确定性交替版本，随机 100–700 ms 延迟 ×3 轮）与导入中途（轮询 `.wenshu-import-*` 暂存目录出现即刻杀，见 §5.2）。
- **恢复**：端到端口径「重开到可操作」= respawn → ready marker 写出；marker 写出前必须已完成 `recoverGrantDirectory`（**双前缀**：`.wenshu-tmp-*` + `.wenshu-import-*`，PB-12 W1 扩展）+ `openProjectStore({recover:true})` + 保存工件 hash 实读校验。恢复点 = 上次成功保存，丢失范围至多在途事务（报告如实写）。
- **指标**：p95 ≤ 10 s。采样规程：批前 `pnpm env:record`（脚本首步强制断言 D 盘 Node v24.17.0 在 PATH 前置，防 PB-10 MAJOR-4 机器证据污染）→ 1 预热 + 10 次计时 → 原始值全留存 → 中位数/p95，批次目录 `artifacts/perf/2026-08-01-PB-12/`（EN-N2 口径 gitignored 本地留存）。CI 只跑功能正确性，不跑性能。PB-10 的 ≤10 s 批次是存储层口径，本任务的端到端数据不引用它冒充。

## 3. 恢复双前缀扩展（W1，PB-11-followups #3 消费）

`recoverGrantDirectory` 在既有 `.wenshu-tmp-*` 清理之外，additive 增加 `.wenshu-import-*` 导入暂存孤儿目录清理：grant root 下递归（扫描预算 1000 目录，超出 fail-closed），目录名匹配 `/\.wenshu-import-[A-Za-z0-9]+$/`，符号链接/联接点不跟随不删除，非同形文件与目录零触碰。暂存前缀单源化：`IMPORT_TEMP_MARKER` 由 `@wenshu/project-storage` 导出，`@wenshu/knowledge-package` 的 mkdtemp 以其构造（测试钉死单源）。语义安全：导入事务保证真目标要么经 rename 完整出现、要么从不存在，暂存目录绝不持有唯一副本。

## 4. PoC-B 闸门门槛（D3，钉死）

闸门报告（`docs/audits/PB-12-poc-b-final-gate-report.md`，PA-15 文档形态）必须逐项对照以下冻结门槛给出 met/not_met/deferred，结论枚举 **PASS / CONDITIONAL PASS / DEGRADE / FAIL**，由实测值对门槛证成，不自我美化：

1. **八链环逐项通过**（`apps/electron-shell/test/pb-12-chain.e2e.test.ts` 七链环 + 既有 editor-diff e2e 不回潮）：①修改→diff→裁决（未接受不改真源字节级、部分接受可撤销）②undo/redo 往返字节级相等 ③保存落盘字节与内存摘要一致 ④强杀-保存飞行中绝无半写（恢复后 ∈ 完整版本集）⑤强杀-导入中途孤儿目录被恢复清理 ⑥恢复端到端到 ready marker ⑦知识包干净环境重导入逐项对账 + 篡改一字节必拒（`PACKAGE_HASH_MISMATCH`）⑧既有 e2e 无回潮。
2. **恢复端到端 p95 ≤ 10 s**（参考采样批次原始值留存）。
3. **变异守卫全红**：M1 移除提案预览隔离（回滚保护）→ 链环①红；M2 去双前缀清理 → 孤儿断言（单元 + 链环⑤）红；M3 原子写退化直接写 → 崩溃相位测试 + 链环④红；M4 短路知识包哈希校验 → 链环⑦红。
4. **fake 边界守卫**：除脚本化 ToolRequest 外无任何 mock；AI 契约 fake 仅限 AI 计划。
5. **承接 12 项 disposition**（PB-10×5 + PB-11×7 逐条 消费/转下一棒/关闭，无静默丢弃）。
6. 阶段约束：结论若非 PASS 按路线图执行降级/停止；不得提前启动 Alpha；不得追认 PoC-A 排版 `not_met`。

## 5. 实施期实测发现（如实登记）

### 5.1 Host 0.2.0 ContentBase64 schema 的 V8 RegExp 栈上限

> **2026-08-01 增补（首审 MAJOR-1 关闭）**：本节原把该上限登记为「载荷取 2 MiB 规避」的测试取舍。Claude 首审判定：这不是测试取舍，而是**签署契约在其广告区间（maxLength ~64 MiB、注册表 `max_payload_bytes: 67108864`）内的崩溃路径**——4 MiB 起 `RangeError` 裸逃逸、请求零终态，违反 host-contract §3/§4（MAJOR-1）。修复（选项②，审计认可）：schema `pattern` 改为自定义 Ajv `format: content-base64`，以 O(n) 零回溯程序式校验实现**完全相同的语言**（5000 例与冻结正则等价性对拍 + 1/2/4/8 MiB 全区间决定性测试 + schema 防回归守卫）；file-host `invokeSerialized` 增包络——校验相意外抛错在请求可寻址时收敛为恰好一个 INTERNAL 终态（hostile Proxy 决定性测试）。广告区间不再含有崩渍段。save-loop 2 MiB 载荷保留（与上限无关，仅是测试规模）。历史症状描述保留于下，登记意义由「规避」改为「已修复的缺陷记录」。

save-loop 载荷原计划 4 MiB；实测冻结 0.2.0 `ContentBase64` schema 的正则 pattern 在 ~4 MiB base64 字符串上耗尽 V8 RegExp 栈（`Maximum call stack size exceeded`）。schema 属冻结协议、PB-12「明确不做」不可触碰，故载荷取 2 MiB（保存占空比 ~100 ms，任意杀点仍落在飞行中）。登记为 schema 未来演进/A-15 评估项。

### 5.2 导入中途杀点须确定性轮询

初版杀点为 marker 后随机 100–600 ms 延迟；本机 Windows 可命中暂存窗口，ubuntu CI runner 上五轮全部「杀在暂存前」（暂存前工作在不同平台速度下窗口位置漂移）。改为轮询 workdir 出现 `.wenshu-import-*` 暂存目录即刻 SIGKILL——杀点在构造上必在导入中途，与平台速度无关。本地 3/3 命中。教训：凡「杀在某阶段中途」的 E2E 一律用阶段可观测信号定位杀点，不用时间猜测。

### 5.3 沙箱 preload 的 process 绑定

`globalThis.process` 在沙箱 preload 中不存在；Electron 注入的是受限裸 `process` 全局（含 argv）。preload 以 `typeof process !== "undefined"` 守卫读取，eslint 以 scoped `globals: { process: "readonly" }` 声明（真实运行时绑定，非规则豁免）。
