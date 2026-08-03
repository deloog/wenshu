# A-02 独立审计任务书（Claude 用）

> 审计对象：`main` 本地提交 `1fb69ad`..（A-02 系列，PR 挂起不合入）
> 实施记录：[A-02-implementation-record](A-02-implementation-record.md)
> 任务书：[A-02-implementation-task](A-02-implementation-task.md)
> 设计：[ADR-0029](../adr/0029-A-02导入入口file.import.select冻结与覆盖落盘裁定.md)　业主裁定：[决策 #15](../../决策记录.md)
> 你此前的登记：[任务书审计](A-02-implementation-task-claude-audit.md)（含追补一/二，猎杀清单七条 + R-1~R-3）

## 建议猎杀方向

1. **①-a 红线（第一个查）**——`file.import.select` 的 output 里有没有任何形式的系统路径（绝对/相对/UNC/`file:`/穿越、任意键名）。自构蒙混路径：把绝对路径塞进 `file_name`/新增字段/嵌套对象，预期被值级预检或 `FileDisplayName` pattern 拒；**若实施选择放宽 `security.ts` 预检而非改 schema，直接 BLOCKER**。核对 `git log -p packages/host-contract/src/security.ts` 本棒零改动。
2. **handle 语义兑现（R-2/R-3）**——`consumeFile` 是否真原子一次性（变异不注销 → R-2 测试红，独立复跑）；FileGrant 是否只解析钉定路径（自构：拿源 handle 读同目录另一文件，必须结构性失败）；选择后改源 → `INTEGRITY_FAILURE`；会话级（进程重启后 handle 必然失效——内存表，无持久化路径可寻）。
3. **R-1 读原语滑坡**——全仓 grep `file.read`/`file.content` 类能力名进 schema/registry/handler 分派；真实读取是否仍在特权进程 L2（grant 边界 fail-closed），Electron 壳有没有旁路协议直喂核心。
4. **①-b 形态诚实性**——0.2.0/0.1.0 schema 文件字节稳定（git diff 为空）；决定性测试"0.2.0 注册表（/0.1.0 占位）仍校验通过"真实存在且变异后红；0.2.0 请求全链路不变（PB-12 E2E 8/8 是否真跑了）；`future-version` fixture 推进到 0.4.0。
5. **四态是"消费契约"还是"参考实现"**——控制器/UI 的 `requiredPresentation`/`forbiddenSemantics`/`a11y` 是否逐字来自 states-1.0.0.json（抽一条改一字看测试红不红）；有没有发明第 13 态或静默改 1.0.0 语义（A-01 #4 纪律）；partial 空 items 是否被拒（防整体吞掉）。
6. **"部分失败"没吞结果**——最可能的偷工：失败时整体回滚成"什么都没导入"。partial 路径逐项 {fileName, reasonCode, retryable} 是否真实呈现；失败 figure 不进文档但 reconciliation 仍闭合（账目真实，不是装作那行不存在）。
7. **原件哈希不变（停止条件级）**——取消/部分失败/权限拒绝三条异常路径各做一次字节级比对（E2E 报告 + 你独立复跑）；变异执行器写路径指向原件 → 对应测试因正确原因变红。
8. **D2/D3 兑现**——目标已存在只有拒绝路径（自构 merge 调用，契约级不存在）；`protectImportedFile` 登记名与真实落点一致（平名覆盖 grant 根同名列，等效性论证是否成立）；有没有引入可寻址子路径写能力。
9. **承接项越权**——§6 三类不得混同：PB-11 #4/#6、A-01 #1/#3 关闭是否有据；A-01 #2 处置是否如实（双锁仍绿）；PB-10 #1 有没有被"再关一次"；PB-12 N2/N3、PB-11 #1/#2/#7、PB-10 #4 是否被代签。
10. **fake 边界**——E2E 有没有 mock 文件系统/存储/Host（scripted selectFiles/selectDirectory 是壳回调注入，与 PB-10/12 先例同款，属合法；断言层必须是真字节真目录）。
11. **dev-only 挂载取舍（实施记录 §6.1 登记的待裁定点）**——生产构建剪除流程分支、以诚实文本替代：是否接受"bundle 零 Ajv"与"生产构建不覆盖 dev 分支逻辑"的交换；typecheck + 30 单测的覆盖是否足够；若不满足，请定性为 MAJOR 并要求补验。
12. **台账与流程**——本报告落盘同轮 §3.1 台账 A-02 行（检查 8a）；远程 CI 9/9；提交指纹逐位比对（审的代码=签的代码）。

## 通过的最低条件

- ①-a/R-1/R-2/R-3 四条红线全部经独立构造攻击验证成立；
- 既有 0.2.0 注册表决定性测试 + PB-12 零回潮独立复跑通过；
- 取消/部分失败/权限拒绝三路径原件字节级不变独立复跑通过；
- 四态呈现义务逐字对账契约通过；
- 变异守卫（实施记录 §7 表 + E2E 补充）至少独立复跑两条为红；
- 承接项处置与任务书 §6 三类口径逐项一致；
- 无范围外产物（docx/编辑器/模板/附件/项目列表/AI）。
