# PB-05 可定位 diff / accept-reject / undo · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #34 分支 `pb-05-locatable-diff`（提交 `cdbb801`）；base `origin/main`
> 远程验证：CI **8/8 pass**；worktree 隔离 `pnpm install --frozen-lockfile` 复跑 editor-diff **6/6**
> 审计方法：**未接受不改真源独立猎杀 + 部分接受/undo 独立复现 + diff 定位读 + 越权/双写/越状态对抗**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PB-05 通过,可合并 PR #34。** 无 BLOCKER/MAJOR/MINOR。三条门禁独立坐实。

- **未接受不改真源(命门,我独立猎杀)**:`propose` 在**隔离 preview 事务管理器**(权威 snapshot 深拷贝往返)上跑 AI 候选,**preview 永不替换权威 snapshot**;`reject` 只翻提案状态、**从不碰权威 manager**——多提案在飞 + 全 reject 后权威文档**逐字段 `deepEqual` 不变**。
- **部分接受可撤销(命门,我独立复现)**:`accept(id)` 才经 **PB-04 gateway → PB-03 事务**写单个候选;我**只接受第二个候选**(避开顺序巧合)→ 只 `second` 落地、`first` 原样且仍 `pending`;`undoAccepted` 唯一写动作是 **PB-03 `manager.undo()`** → 逐字段回到 before。
- **diff 可定位、不丢上下文**:差异以稳定 `nodeId+field` 表达,每条带 `parentId`/`ancestorIds`/`siblingIndex`;移动=`$parent` 字段变更,**`$block` 整块替换从不出现**(FAIL 条件"丢上下文/错误合并"的守卫)。

## 2. 未接受不改真源 & 部分接受/undo（命门,独立猎杀）

我在仓外用真实 `DiffReview`(权威 `TransactionManager` + `FROZEN_TOOL_NAMES` 权限)独立喂对抗,覆盖测试未打的角:

| 对抗 | 结果 |
|---|---|
| ① 两候选在飞 + 全 reject | propose 后真源 `deepEqual` before、两提案 `pending`;reject 后真源仍逐字段不变 |
| ② **只接受第二个**候选 | `accepted`;`first` 原样、`second` 落地、**第一个仍 `pending`**;`undoAccepted`→`reverted`、真源逐字段回到 before |
| ③ **重复 accept 同一提案** | 二次 `not_pending`、`first` 仍=once(**无双写**) |
| ④ **reject 后再 accept** | `not_pending`、真源不变(越状态守卫) |
| ⑤ **越权候选**(改不可写 `second`) | **preview 阶段即 `rejected`、无 diff、真源不变**(PB-04 权限边界贯穿到 preview) |

**判定**:未接受前权威源零改动;部分接受只落被接受项且可 undo 回退;双写/越状态/越权一律 fail-closed。承接 PB-03 undo/redo 与 PB-04 gateway,不新开写路径。

## 3. diff 定位、依赖候选、分层（测试 + 读）

- **定位不丢上下文**(测试 + `diff.ts` 读):`diffDocuments` 按稳定 ID 收集节点、逐字段比对,`FieldDiff` 恒带 `anchor{nodeId,parentId,ancestorIds,siblingIndex}`;移动表达为 `$parent`,单元测试断言 `every(field !== "$block")`——**不以"整块已替换"伪装局部**。
- **依赖候选诚实 fail-closed**(ADR-0018 §后果):互不依赖候选可部分接受;依赖候选若因先前 accept/reject 致权威操作无法提交,**如实返回 `transaction_rolled_back`,不猜测或静默重写**——不掩盖依赖语义。
- **提案冻结**(测试 69):已发布提案 `request` 被 `Object.freeze`,篡改 `text` 抛错→不能把候选改成"别的写"。
- **分层**:`editor-diff` 只依赖现有 workspace 包(document-model/editor-transactions/semantic-editor/semantic-tools),独占 diff 契约;无 UI/存储/多人合并/CRDT 夹带(留后续)。

## 4. 门禁、供应链、并行收口

- **门禁**:editor-diff **6/6**(diff 定位、移动非整块替换、reject 无副作用、拒绝不改真源、提案冻结、部分接受+PB-03 undo);PR CI **8/8**;`pnpm install --frozen-lockfile` exit 0。
- **供应链**:`editor-diff` 依赖**全为 `workspace:*`,无新增第三方**;`pnpm-lock.yaml`/`sbom.json` 变更仅 workspace 内部接线;冻结物(G1-04/PB-02/03/04 契约)零漂移。
- **并行收口(我独立复核)**:PB-05 用 **ADR-0018**、PB-07 用 **ADR-0019**,两者 main 上均不存在、**互不碰撞**;业主处理的 ADR 编号冲突已解。
- **诚实**:本轮我探针一次通过(承接 PB-02/03/04 已摸清 API);无我方误用需登记。

## 5. 结论与交接

**PB-05 独立审计 PASS。** 隔离 preview 生成字段级差异、未接受权威源零改动、部分接受只落被接受项且 PB-03 undo 可回退、diff 恒带定位不丢上下文、越权/双写/越状态 fail-closed——AI diff 裁决边界坐实。

- 承接 **A-07** 消费本 diff/裁决;PB-05 签署后 **PB-05A**(冻结审计哈希指称/模型标识/system 权限,关闭 G1-07 NF-01/02/03)启动,再放行 **PB-06**。
- 承接:接受候选经 PB-03 事务的 `affectedNodeIds` 供增量分页。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
