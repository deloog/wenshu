# G1-08 Claude 首审整改记录

> 实施者：Codex　日期：2026-07-20　状态：整改已由 Claude 独立复审，结论 `CONDITIONAL PASS`

本记录只陈述实施者采取的措施和自检证据，不代表发现已经关闭。关闭权属于原审计角色。

| 发现 | 实施处置 | 实施者自检 |
|---|---|---|
| M-01：只扫描三个硬编码根 | 从仓库根递归发现，显式跳过版本库、依赖、构建/缓存/测试产物和临时目录 | 假工作区的根、`tests/`、`e2e/`、`src/`、apps/packages/tools 测试均发现；跳过目录不纳入 |
| M-02：Windows 大小写变体逃逸 | 候选识别使用小写副本，分类仍要求规范小写后缀 | `Sneaky.Test.ts`/`Foo.Unit.Test.ts` 被发现但无法分类，层级审计失败 |
| M-03：重复 worker index 静默共享 | run/layer 父目录可复用，worker 叶目录用排他 `mkdir`；成功者得到随机 claim 的 prepared handle | 同槽位 8 路并发仅 1 项成功、7 项 `EEXIST`；无静默覆盖 |
| m-01：契约分层命令漏 config | `test:contract` 改由全仓 layer runner 执行 | 发现并执行 8 个文件、91 项契约测试，包含 config 7 项 |
| m-02：空层退出 0 | 空层默认输出 `not-registered` 并返回退出码 3；仅显式 `--allow-empty` 返回 0 | 默认/显式允许两种路径分别得到 3/0，均不输出 PASS |
| m-03：无清理策略 | 新增 `cleanupSuccessfulTestIsolation`，仅接受 prepared handle，复核全路径与磁盘 claim 后只删 worker 叶目录 | 清理 worker-0 后 worker-1 内容仍存在；失败路径不调用清理并保留证据 |
| m-04：layer 可为多段路径 | `buildTestIsolation` 内部再次执行 `isTestLayer` 运行时校验 | 绕过类型传入 `a/b` 被拒绝 |
| m-05：发现健壮性 | 改为单一仓库根扫描，不再依赖三个根存在；符号链接判断前置于跳过清单 | 名为 `dist` 的真实 junction 也被拒绝 |

附带边界保持不变：没有新增外部依赖、数据库替身或伪 E2E；失败证据仍禁止覆盖；Host NF-01/NF-04 已由 Claude 首审明确确认关闭。

整改后实施者自检：`pnpm verify` 101/101，`pnpm test:contract` 独立执行 91/91；空层默认/显式允许的退出码分别为 3/0；真实仓库根临时 `Sneaky.Test.ts` 反向探针按预期使层级审计失败，删除后恢复。以上均不替代独立复审。
