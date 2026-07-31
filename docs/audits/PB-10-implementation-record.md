# PB-10 实施记录：原子保存、崩溃恢复与 Host 文件边界

- 日期：2026-07-31
- 状态：已实现，待 Claude 独立审计
- 基线：`origin/main` `510ccdc`（G2-04 已签、PB-09 已签、分层门禁已就位）
- PR：#46（`a769423`）

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
  ASCII 安全文件名白名单，再通过 `resolveInside` 解析后 fail-closed 校验不逃逸；
- `atomic-write.ts`：`temp file → fsync data → rename → parent dir fsync`；
  Windows 目录 fsync 因 `EPERM` 显式跳过并诚实报告；
- `file-host.ts`：`createFileHost` 暴露 `registry` 与 `invoke`，执行 7 项 `0.2.0`
  能力，错误映射到稳定 `HOST_*` code，支持 cooperative cancel；
- 崩溃残留恢复：`recoverGrantDirectory` 只删除 `.wenshu-tmp-*` 临时文件，
  绝不猜测或补全真实工件。

### 3. 浏览器受控 Host

在 `apps/web` 内新增内存实现，仅用于开发与 UI 联调：

- `src/host.ts` 构造 `registry` 与 `invoke`，全协议校验；
- `src/host/store.ts` 虚拟 grant/document/backup 存储，使用 Web Crypto 替代
  `node:crypto`/`Buffer`，满足 web 层分层门禁；
- `src/host/errors.ts` 将内部错误映射为稳定 envelope failure；
- 显式模拟权限拒绝、取消、超时、降级与只读 fallback，不冒充平台实现。

### 4. Electron 壳消费侧准备

`apps/electron-shell` 新增对 `@wenshu/project-storage` 的 workspace 依赖并通过
`typecheck`；preload/renderer 集成不在 PB-10 范围内，待 PA-14E/A-02 续接。

## 真实验证

```powershell
pnpm --filter @wenshu/host-contract test        # 45/45
pnpm --filter @wenshu/project-storage test      # 24/24
pnpm --filter @wenshu/web test                  # 6/6
pnpm contracts:check
pnpm verify
```

全部通过。

### 崩溃恢复采样

在 Win10 开发基线机 `wenshu-dev-primary` 上，对 `recoverGrantDirectory` +
`openProjectStore` + 工件校验做 10 次重复测量（跳过第 1 次 warm-up）：

- median：41.1 ms
- p95：54.0 ms
- 预算：10 000 ms

结果写入 `artifacts/perf/2026-07-31-PB-10/recovery-samples.json`。

### 决定性变异测试

对真实文件边界生产代码做临时改动，确认测试变红：

| 变异 | 结果 | 说明 |
|---|---|---|
| 将 `rename(tempPath, targetPath)` 改为直接 `writeFile(targetPath, bytes)` | ❌ 红 | 破坏原子性，残留清理与 crash 测试失败 |
| 将 `SAFE_FILE_NAME` 正则校验恒置为 `false` | ❌ 红 | `resolveGrantFile structurally refuses escapes` 失败 |
| 注释 `await handle.sync()`（跳过 data fsync） | 🟡 绿 | 单进程内 OS 缓存使测试无法感知；保留为已知限制，不冒充已通过 |

fsync 变异未在单进程测试中触发失败，符合预期：fsync 的语义是崩溃/掉电 durability，
无法通过 in-process 断言直接证伪。原子性由 `rename` 变异与 crash 相位测试共同背书。

## 供应链与回滚

- 零新增第三方运行时依赖；
- `@wenshu/project-storage` 直接依赖保持 PB-09 已批准的
  `@sqlite.org/sqlite-wasm@3.53.0-build1`（Apache-2.0）；
- lockfile/SBOM 由 pnpm 与供应链生成器重建，未手改。

若需要回滚，移除 `0.2.0` schema/生成类型、`file-boundary/`、浏览器 host、
electron-shell 依赖与 ADR/台账更新即可；`0.1.0` 路径完整保留。

## 已知承接与限制

- ArkWeb 文件桥仍标记为 `needs_device_to_verify`，PB-10 未宣称三端贯通；
- Electron-shell 仅完成依赖接入与 typecheck，真实 preload/renderer 集成在
  PA-14E/A-02；
- 打印/分页路径按决策 #11A 保持 DEGRADE，`print.pdf.export` 仍为 `unsupported`。
