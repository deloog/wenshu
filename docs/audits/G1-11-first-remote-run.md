# G1-11 首次远程 CI 运行证据

> 日期：2026-07-20　运行：[GitHub Actions #29748496592](https://github.com/deloog/wenshu/actions/runs/29748496592)　提交：`0a6877c74c8df50610ec16103d2cbdb2be152952`

业主明确授权后，将 `705cbce..0a6877c` 推送到私有仓库 `deloog/wenshu` 的 `main`。推送前工作树干净，本地与远程提交在推送后精确一致；未创建 PR、未公开仓库、未调用付费第三方服务。

GitHub 接受 workflow 并由 `push` 事件启动。运行于 2026-07-20 13:57:24Z 至 13:58:25Z，最终 `completed/success`。8 个矩阵作业全部成功：

| 作业 | 结果 | GitHub 记录时长 |
|---|---|---:|
| static | success | 33 秒 |
| unit-config | success | 32 秒 |
| contracts | success | 30 秒 |
| typecheck | success | 58 秒 |
| build-test | success | 22 秒 |
| build-staging | success | 21 秒 |
| build-production | success | 22 秒 |
| security | success | 31 秒 |

首次运行真实验证了 Ubuntu 24.04 接受 YAML、Node 24.17.0 与 Corepack/pnpm 11.15.1 可用、冻结安装成功、8 个 job 并发调度、三环境构建与安全门禁通过。首次缓存为 miss；`build-production` 成功保存锁文件哈希键，稍后启动的 `security` 在同一运行内成功恢复同一键。其他并发 job 的 post step 报告“another job may be creating this cache”，属于同键并发保存竞争且未使作业失败。

本次没有制造第二个同分支运行，因此 `cancel-in-progress` 的真实取消行为仍未验证。远程全绿不关闭首审 CI-02～CI-05；这些 MINOR 进入本地收尾实现与独立审计。G1-11 在收尾审计和最终远程同步前仍为未完成。

## 最终同步复跑

CI-02～CI-05 经原独立审计角色签署关闭后，业主再次明确授权最终同步。`6ba1511`、`b4fda9d`、`baff4ef` 推送到 `main`，本地与远程均为 `baff4ef231ebd4a484ac4fcb60319fd8b4d113b1`。

[GitHub Actions #29751472922](https://github.com/deloog/wenshu/actions/runs/29751472922) 由该 push 触发，2026-07-20 14:37:34Z 至 14:38:39Z 完成，最终 `completed/success`。contracts 31 秒、security 21 秒、static 35 秒、build-test 25 秒、unit-config 31 秒、build-staging 27 秒、build-production 20 秒、typecheck 59 秒；8/8 全部成功。该运行覆盖收尾实现与最终审计报告，满足 G1-11 最终远程验证条件。

两次 run 没有时间重叠，因此 `cancel-in-progress` 仍作为诚实的未执行边界保留；它不影响已完成的并行矩阵、缓存、冻结安装与门禁验证结论。
