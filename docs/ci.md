# 文枢并行 CI 基线（G1-11）

> 状态：本地实现与首次私有远程运行均通过；首审 BLOCKER/MAJOR 已关闭，CI-02～CI-05 收尾已实施、待 Claude 独立复核。G1-11 尚未最终完成。

## 1. 单一作业定义

`tools/ci/src/jobs.ts` 是本地与 GitHub Actions 共用的作业真源。`pnpm ci:job <name>` 执行单项，`pnpm ci:verify` 以最多 4 路并发执行全部作业；远程 workflow 使用同名 8 路 matrix，不另写一套更宽松的命令。

| 作业 | 门禁 |
|---|---|
| `static` | format、ESLint、any/抑制/体量/typecheck 覆盖等质量护栏 |
| `unit-config` | 测试分层、单元测试、四环境配置契约 |
| `contracts` | 生成漂移与全部契约测试 |
| `typecheck` | 全工作区严格 TypeScript 检查 |
| `build-test/staging/production` | 三环境真实 Vite 构建，各写独立 `dist/ci-*` |
| `security` | Git 跟踪文件密钥扫描、已安装依赖许可证扫描 |

任一子命令非零即使所属作业失败；runner 不重试，不以重试后通过掩盖 flaky。输出结尾逐项列出 PASS/FAIL，便于定位。

## 2. 远程执行与缓存

`.github/workflows/verify.yml` 仅申请 `contents: read`，在 `pull_request`、`main` push 和人工触发时运行；同分支新提交取消旧运行。Node 24.17.0、pnpm 11.15.1、Ubuntu 24.04 均固定，依赖冻结安装。缓存键包含操作系统、Node、pnpm 和 `pnpm-lock.yaml` 哈希。

第三方 Actions 使用完整提交 SHA 固定，并在行尾记录审阅过的 release 标签；不得只写 `@main` 或可移动主版本标签。首次推送 workflow 会触发 GitHub 外部运行，必须在本地验证和独立审计放行后再取得业主授权。

## 3. 安全与许可证边界

`pnpm secrets:check` 检查 `git ls-files` 返回的全部普通文件，包括含 NUL 字节的文件；字节以 UTF-8 容错解码后继续匹配 ASCII 高置信度模式，不允许用单个二进制字节绕过。它阻断私钥、高置信度服务 token、禁止提交的 `.env` 和凭证文件后缀；符号链接 fail-closed，不跟随到仓库外。提交前应先暂存文件再运行；发现真实泄露必须撤销凭证并清理传播面，不能只删除当前内容。

`pnpm licenses:check` 直接枚举 `node_modules/.pnpm` 的实际安装包，缺失许可、GPL/AGPL 和冻结识别清单外的表达式立即失败，并输出许可分布。识别不等于业主批准：MPL、Python、BlueOak 仅为当前树中已知且登记为 G1-15 待裁定的传递许可。该快速门禁不代替 G1-15 的 SBOM、用途、漏洞、工作区幽灵依赖和书面裁定。

## 4. 测试证据保护

G1-08 的证据写入与成功清理继续由运行时签发对象、磁盘 claim、真实目录和操作队列保护。G1-11 同一提交补入 IA-01 反测：冻结且保留品牌的复制对象仍必须被拒，证据层级与 worker 不一致必须拒绝且不产生半份文件。最终关闭权属于独立审计者。

## 5. 常用命令

```powershell
pnpm ci:job static
pnpm ci:verify
pnpm secrets:check
pnpm licenses:check
```

`pnpm verify` 仍是串行、完整的本地工程验证入口；`pnpm ci:verify` 是与远程 matrix 同构的并行调度入口。交付证据必须同时说明实际运行了哪一个，不能互相冒充。
