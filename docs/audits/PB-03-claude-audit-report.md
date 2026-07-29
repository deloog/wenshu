# PB-03 统一事务 / 校验 / undo-redo / 取消 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #31 分支 `pb-03-unified-transactions`；base `origin/main`
> 远程验证：CI **8/8 pass**
> 审计方法：**原子回滚独立猎杀(暂存 op + 失败 op → 文档不变) + undo/redo 往返独立复现 + 无旁路核 + 事务逻辑读**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PB-03 通过,可合并 PR #31。** 无 BLOCKER/MAJOR/MINOR。一处观察(无旁路为约定非硬锁,见 §4)。

- **失败事务原子回滚(命门,我独立确认)**:事务里"改首段成功 + 改身份失败抛错" → **文档逐字段不变、暂存的改动被回滚、无半提交**。
- **undo/redo 往返相等(命门,我独立确认)**:多步事务 commit → undo→`deepEqual(before)`、redo→`deepEqual(after)`。
- **取消真实**:`execute(actor,fn,signal)` 经 AbortSignal → `cancel` → `rollback("cancelled")`,无副作用 + 幂等 + 清理监听(测试 129 + 逻辑)。
- **统一边界**:人工/AI 都经 `TransactionManager`;commit 由 `TRANSACTION_CAPABILITY` 符号门控;单活跃事务(`PB03_TRANSACTION_ACTIVE`);校验含 schema + 稳定 ID(`PB03_STABLE_ID_GUARD`,复用 PB-02)。

## 2. 原子回滚 & undo/redo（命门,独立猎杀）

我在仓外独立跑(不只复跑测试):

- **原子回滚**:`begin("ai")` → 改首段为 "X"(成功暂存)→ 改身份的 op(触发稳定 ID 守卫)**抛错** → **文档 `deepEqual` 回到事务前、首段没被改成 X**——**已暂存的 op 被原子回滚,无半提交、无部分应用**。逻辑对应:`apply` 出错 → `#rollback("operation_failed")`;`commit` 校验失败 → `#rollback("validation_failed")`;两态"committed/rolled_back"外无部分态。
- **undo/redo 往返相等**:多步事务(2 rewrite)commit 后,`undo()`→`deepEqual(before)`、`redo()`→`deepEqual(after)`,稳定 ID 保持。测试 111 亦以 `deepEqual` 对账。
- **取消**:AbortSignal `abort` → `cancel(session)` → `rollback("cancelled")`;终态后幂等;监听 `once`+`removeEventListener` 清理(承接 PA-13/R-PERF)。

## 3. 统一边界、校验、分层（独立 + 测试）

- **人工/AI 唯一边界**:`EditorActor="human"|"ai"` 都经 `manager.execute/begin/commit`;测试 50"human and AI commit through one transaction boundary"通过。
- **capability 门控**:`commit`/`rollback` 需 `TRANSACTION_CAPABILITY` 符号,只有 manager 持有 → session 不能自行提交(无绕过 manager)。
- **校验建立在 PB-02**:提交前 schema 有效 + 稳定 ID 保持(`PB03_STABLE_ID_GUARD` 复用 PB-02 守卫),不另立弱校验。
- **分层**:`editor-transactions` 只导出 `TransactionManager` + 类型;无 diff/UI/语义工具/存储/CRDT 夹带。

## 4. 观察（非阻断）· 无旁路为"约定"非"硬锁"

PB-02 raw 操作(insert/delete/move/rewrite/copy)已从 `@wenshu/semantic-editor` **主入口 `.` 移除、下沉 `internal.ts`**——默认写路径只有事务。**但** package `exports` 仍开 `"./internal":"./src/internal.ts"` 子路径,开发者可 `import "@wenshu/semantic-editor/internal"` 触达 raw 操作绕过事务。这是常见"内部但需跨包访问"模式(editor-transactions 需之),**标记内部、移出默认面**,但为约定非运行时硬锁。

- **判定非阻断**:①默认边界=事务、raw 移出主 API,达"不易误绕过";②R-SEC"模型不得直接写"针对的是 **AI 的工具接口**(AI 经工具/事务操作,不 import 包)——那是 **PB-04 语义工具编译器**的硬边界域,PB-03 已为其奠基(commit 经 capability 门控)。
- **建议**:PB-04 落"模型不得直接写存储/DOM"时,确保 AI 工具只经事务 capability,`/internal` 子路径不暴露给模型侧;台账登记此约定边界。

## 5. 门禁、供应链、诚实说明

- **门禁**:editor-transactions **8/8**(统一边界、暂存后失败原子回滚、undo/redo 往返、取消幂等等);PR CI **8/8**;`pnpm verify` exit 0;`transactions.ts` 334 行(预警未超 400 失败线,如实登记)。
- **供应链**:`editor-transactions` 为 workspace 包,无新增第三方重依赖;SBOM/lockfile 登记;冻结物(G1-04 契约/PB-02 操作/稳定 ID)零漂移。
- **透明说明**:严格审查中我三次独立探针报错,查清**均为我 API 误用**(rewrite 字段 `block` vs `replacement`、copyBlock 参数类型/个数),**非产物 bug**——恰是操作层正确校验了我的错误输入。用对 API 后原子回滚 + undo/redo 往返全部独立确认。如实记录,不把误用留成"疑似缺陷"。

## 6. 结论与交接

**PB-03 独立审计 PASS。** 统一事务边界、原子提交/回滚(无半提交)、undo/redo 往返相等、取消真实、稳定 ID+schema 校验、人工/AI 唯一边界——事务地基坐实。

- 签署后 **PB-04(语义工具→事务编译器,R-TX/R-SEC)** 承接——届时我审"模型不得直接写存储/DOM、越权拒绝、prompt injection",并核 §4 的 `/internal` 约定边界对 AI 侧硬锁;**PB-05(可定位 diff / accept-reject / undo)** 亦承接。
- 承接:`affectedNodeIds` 经事务传递供 PB/Alpha 增量分页。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
