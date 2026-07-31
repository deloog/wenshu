# PB-10 Claude 独立审计任务书

## 审计目标

确认 PB-10 在 Host 协议 `0.2.0` additive 升级、真实文件边界、原子写、崩溃恢复与
浏览器受控 Host 模拟上的实现诚实：核心不触碰绝对路径，崩溃/强杀后上次成功成品不损坏，
路径逃逸被 fail-closed 拒绝，浏览器 Host 不冒充平台实现。

## 独立复现

```powershell
pnpm --filter @wenshu/host-contract test
pnpm --filter @wenshu/project-storage test
pnpm --filter @wenshu/web test
pnpm contracts:check
pnpm verify
```

## 必核反例

1. 核验 `0.1.0` 注册表与契约测试未漂移；`0.2.0` 注册表只将 7 项文件/项目能力标记为
   `supported`，其余 11 项仍为 `unsupported` 并带显式 fallback。
2. 核验 `validateHostPayload` 对 7 项能力的 input/output 非法形状返回
   `HOST_PAYLOAD_SCHEMA` 问题，而非 `HOST_SCHEMA` 或其他 code。
3. 在 `@wenshu/project-storage` 的真实 Host 入口执行 27 项敌意值矩阵（路径穿越、
   盘符绝对路径、UNC、控制字符、`file:` URL 等），确认全部被拒且不泄露路径。
4. 亲自创建 grant 并写入文件后，用 `SIGKILL` 强杀子进程分别于
   `temp-created`、`data-written-partial`、`data-fsynced`、`renamed` 四个相位中断；
   验证重开后工件要么是旧完整文件，要么是新完整文件，不存在半写。
5. 验证 `recoverGrantDirectory` 只删除 `.wenshu-tmp-*` 残留，不会删除/补全其他文件。
6. 验证崩溃恢复后可在 10 秒内打开项目库并确认上次成功成品（采样报告 median 41.1 ms、
   p95 54.0 ms，但审计者应在本地独立复测，不直接采信）。
7. 验证 `project.save.atomic` 只在 `expected_previous_sha256` 匹配时覆盖；内容哈希与
   声明不一致时返回 `HOST_INTEGRITY_FAILURE`，失败写入不留下残留。
8. 在 `apps/web` 的浏览器 Host 上执行权限拒绝、取消、超时、降级与只读 fallback；确认
   transcript 可过 `validateHostSession`，且不出现真实平台路径或文件系统调用。
9. 检查 `apps/web` 源码无 `node:*` 内建导入，无 Electron/Node API 泄漏。
10. 检查 SBOM/lockfile 无新增第三方运行时依赖；`@sqlite.org/sqlite-wasm` 版本与 PB-09
    批准一致。

## 阻断条件

- `0.1.0` 契约漂移；
- 路径逃逸被静默接受或返回含系统路径的错误；
- 强杀后出现半写/损坏文件被当作有效工件；
- 浏览器 Host 使用真实文件系统或冒充平台实现；
- web 层出现 `node:*` 平台导入；
- 新增未批准的第三方运行时依赖。
