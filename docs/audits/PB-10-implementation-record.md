# PB-10 实施记录：原子保存、崩溃恢复与 Host 文件边界

- 日期：2026-07-31
- 状态：首审 FAIL 后修复中，待 Claude 复审
- 基线：`origin/main` `510ccdc`（G2-04 已签、PB-09 已签、分层门禁已就位）
- PR：#46（最新提交见 PR 页面）；CI 状态见 PR checks

## 交付

### 1. Host 协议 additive 升级到 0.2.0

在 `@wenshu/host-contract` 内新增 `0.2.0` 契约路径，不改动 `0.1.0`：

- 新增 schema `host-0.2.0.schema.json` 与 `host-payloads-0.2.0.schema.json`，
  生成 TypeScript 类型与校验器；
- 冻结 7 项能力的输入/输出 payload Schema：
  `project.directory.select/authorize`、`project.save.atomic/as`、
  `project.backup.create/restore`、`file.export.write`；
- `validateHostContract` 双版本分发，`validateHostPayload` 供 Host 运行时校验；
- `buildPayloadHostRegistry` 帮助 Host 实现者构造合法的 `0.2.0` 注册表；
- 其余 11 项能力保持 `unsupported` 并给出显式 fallback。

### 2. 真实文件边界

在 `@wenshu/project-storage` 内新增 `src/file-boundary/`：

- `grants.ts`：不透明 `grant_id → directory` 映射；`resolveGrantFile` 先做
  ASCII 安全文件名白名单（含 Windows 保留设备名/尾点拒绝），再通过
  `resolve` 后的目录名比较做 fail-closed 校验不逃逸；
- `atomic-write.ts`：`temp file → fsync data → rename → parent dir fsync`；
  Windows 目录 fsync 因 `EPERM` 显式跳过并诚实报告；
- `file-host.ts`：`createFileHost` 暴露 `registry` 与 `invoke`，执行 7 项 `0.2.0`
  能力，错误映射到稳定 `HOST_*` code，支持 cooperative cancel；
- 崩溃残留恢复：`recoverGrantDirectory` 只删除 `.wenshu-tmp-*` 临时文件，
  绝不猜测或补全真实工件；
- 导入原件保护：`grant.protectedFiles` 登记外部导入的只读文件，`file.export.write`
  即便 `overwrite:true` 也返回 `HOST_PERMISSION_DENIED`。

### 3. 浏览器受控 Host

在 `apps/web` 内新增内存实现，仅用于开发与 UI 联调：

- `src/host.ts` 构造 `registry` 与 `invoke`，全协议校验；
- `src/host/store.ts` 虚拟 grant/document/backup 存储，使用 Web Crypto 替代
  `node:crypto`/`Buffer`，满足 web 层分层门禁；快照真实保存文件字节，恢复后
  字节与备份时一致；
- `src/host/errors.ts` 将内部错误映射为稳定 envelope failure；
- 显式模拟权限拒绝、取消、超时、降级与只读 fallback，不冒充平台实现。

### 4. Electron 壳消费侧

`apps/electron-shell` 接入 `@wenshu/project-storage`：

- 修正 `main.cjs` 调用签名错误（`createHost` 未传 window、`handlePrintPdf` 多传 window）；
- 本地运行 `pnpm --filter @wenshu/electron-shell security:test` 通过，输出 Electron
  复验证据（21 页、字体嵌入、renderer 无 `require`/`process` 泄漏）。

## 真实验证

```powershell
# 本地 Win10 开发基线，使用 D: 冻结 Node v24.17.0
pnpm --filter @wenshu/host-contract test        # 48/48 PASS
pnpm --filter @wenshu/project-storage test      # 25/25 PASS
pnpm --filter @wenshu/web test                  # 6/6 PASS
pnpm --filter @wenshu/electron-shell security:test  # PASS
pnpm contracts:check
pnpm verify
```

全部通过。

### 崩溃恢复采样

在 Win10 开发基线机 `wenshu-dev-primary` 上，使用 D: 冻结 Node v24.17.0，对
`recoverGrantDirectory` + `openProjectStore` + 工件校验做 10 次重复测量
（跳过第 1 次 warm-up）：

- median：36.0 ms
- p95：40.0 ms
- 预算：10 000 ms

结果写入 `artifacts/perf/2026-07-31-PB-10/recovery-samples.json`。

### 决定性变异测试

对真实文件边界生产代码做临时改动，确认测试变红：

| 变异 | 结果 | 说明 |
|---|---|---|
| 将 `rename(tempPath, targetPath)` 改为直接 `writeFile(targetPath, bytes)` | ❌ 红 | 破坏原子性，`atomic write round-trips` 与 `last good artifact survives` 两条非 crash 测试失败 |
| 将 `SAFE_FILE_NAME` 正则校验恒置为 `false` | ❌ 红 | `resolveGrantFile structurally refuses escapes` 失败 |
| 注释 `await handle.sync()`（跳过 data fsync） | 🟡 绿 | 单进程内 OS 缓存使测试无法感知；保留为已知限制，不冒充已通过 |

fsync 变异未在单进程测试中触发失败，符合预期：fsync 的语义是崩溃/掉电 durability，
无法通过 in-process 断言直接证伪。原子性由 `rename` 变异与四相位真 `SIGKILL` 测试共同背书。

## 复审合入前条件（C1–C4）

| ID | 处置 | 证据 |
|---|---|---|
| C1 | 新增回归测试 `tools/quality/test/roadmap-exit.integration.test.ts`：注入路线图违规后调用真实 `check-repository`，断言 exit code ≠ 0 | 本地 `pnpm --filter @wenshu/quality test:integration` 通过 |
| C2 | `@wenshu/web` 测试接入 `unit-config` CI 作业 | `tools/ci/src/jobs.ts` 增加 `command("web", "--filter", "@wenshu/web", "test")` |
| C3 | 在 ADR-0025 与实施记录中明确 `protectedFiles` 依赖导入流程登记，并登记 A-02 承接 | 本记录与 `docs/adr/0025-PB-10原子保存崩溃恢复与Host文件边界.md` 已更新 |
| C4 | 清理工作树：恢复被旧 Node 污染的 `artifacts/reference-machine/environment.json`；删除游离空文件 `0` | `git status` 无未预期改动 |

## 首审 MAJOR/MINOR 修复

| ID | 定位 | 修复 |
|---|---|---|
| MAJOR-1 | `apps/web/src/host/store.ts` 备份恢复清零 | 快照改为 base64 真实字节；恢复后重建原内容；测试补字节级断言 |
| MAJOR-2 | `apps/electron-shell/src/main.cjs` 调用签名错误 | 修正 `createHost` 与 `handlePrintPdf` 调用；本地跑通 `security:test` |
| MAJOR-3 | `file.export.write` 可覆盖导入原件 | 增加 `grant.protectedFiles` 与 `protectImportedFile`；写入前拒绝只读条目 |
| MAJOR-4 | `artifacts/reference-machine/environment.json` 被旧 Node 覆盖 | 用 D: v24.17.0 重跑 `pnpm env:record` 并重做恢复采样 |
| MAJOR-5 | `tools/quality/scripts/check-repository.ts` 漏接 roadmap 退出码 | 将 `roadmap.findings.length > 0` 补入 `process.exitCode = 1` 条件 |
| MI-01 | `restoreFromSpecificBackup` 库不存在时静默成功 | 恢复 fail-closed：目标库不存在时抛 `STORAGE_RECOVERY_FAILED` |
| MI-02 | PB-10 被塞进无独立报告豁免表 | 移除豁免登记；台账行直接链接审计报告 |
| MI-03 | 敌意矩阵含裸 NUL 字节 | 改为 `\u0000` 转义 |
| MI-05 | 数字/文档与事实不符 | 已逐项更正 |
| MI-06 | Windows 保留设备名/尾点可落盘 | `SAFE_FILE_NAME` 与 payload schema 同步拒绝 |

## 供应链与回滚

- 零新增第三方运行时依赖；
- `@wenshu/project-storage` 直接依赖保持 PB-09 已批准的
  `@sqlite.org/sqlite-wasm@3.53.0-build1`（Apache-2.0）；
- lockfile/SBOM 由 pnpm 与供应链生成器重建，未手改。

若需要回滚，移除 `0.2.0` schema/生成类型、`file-boundary/`、浏览器 host、
electron-shell 依赖与 ADR/台账更新即可；`0.1.0` 路径完整保留。

## 已知承接与限制

- **导入原件保护依赖 A-02 登记**：`protectImportedFile` 机制由 PB-10 提供，但 PB-10
  自身没有导入能力（`file.import.select` 在 `0.2.0` 中仍为 `unsupported`）。只有导入流程
  在创建/复制原件时显式登记，`protectedFiles` 才能生效；未登记的既有文件仍可被
  `overwrite:true` 覆盖。该调用责任由 A-02/PB-11 导入流程承接。
- ArkWeb 文件桥仍标记为 `needs_device_to_verify`，PB-10 未宣称三端贯通；
- 打印/分页路径按决策 #11A 保持 DEGRADE，`print.pdf.export` 在 `0.2.0` 中仍为
  `unsupported`（Electron 壳保留 `0.1.0` 打印通道，不扩展）。
