# PB-02 稳定 ID 最小文档编辑操作 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #30 分支 `pb-02-stable-id-operations`；base `origin/main`
> 远程验证：CI **8/8 pass**
> 审计方法：**读属性测试真实性 + 我独立跑完整 fixture 往返/复制/受影响追踪 + ID 内在核 + 供应链核**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PB-02 通过,可合并 PR #30。** 无 BLOCKER/MAJOR/MINOR。站在我 PB-01 两轮探针确认的可行性上,完整实现正确、诚实。

- **ID 内在真稳(命门)**:ID = `prefix_ + 16 随机字节 hex`(`ids.ts`)——**不透明随机、非位置派生**;改写/移动/他处删除保未受影响 ID、复制/插入分配新唯一 ID(`assertDistinctIds` 防重复);**120 步 seeded 随机属性测试**每步验稳定,**位置派生 ID 变异 → `assert.throws(/stable ID lost/)`**(证稳定断言承重)。
- **adapter 完整无损**:我独立跑**真实 `full.json`(14 节点、全 G1-04 类型)往返 `deepEqual` 无损** ✓。
- **schema 恒有效 + fail-closed**:每次操作后 G1-04 schema 有效;adapter 先 `validateDocument` 再转、非法输入抛 `PB02_ADAPTER_INVALID`;改写有 `PB02_OPERATION_ID_GUARD`(不改身份);操作拒 schema 破坏/循环移动。
- **承接兑现**:`EditResult` 暴露 **`affectedNodeIds`**——受影响节点追踪落地(承接增量分页承接项)。
- **供应链干净**:仅加 `prosemirror-model@1.25.11`、`orderedmap@2.1.1`,**均 MIT**;SBOM/lockfile 已更并冻结;决策记录已记 ProseMirror 批准。

## 2. ID 内在真稳（命门,独立核）

- **内在随机、非位置派生**:`RandomIdAllocator` 用 `randomBytes(16)`,注释明确"callers never pass document positions into it"——满足路线图"ID 依赖位置即失败"红线。
- **属性测试真实**(非摆样例):`property probe: seeded ordinary edit sequences...`——seeded 随机 120 步,每步随机目标 + 随机操作,后验 `assertUnchangedIdsRemain` + `assertSchemaAndUnique`(194ms,实打实跑）。
- **位置派生负向变异**:`position-derived ID mutation is detected`——把 ID 改成 index 派生 → 稳定断言 `throws(/stable ID lost/)`,证 ID 内在断言承重、能抓位置派生。
- **我独立复现**:复制 section → 旧 ID 全保留、无重复、6 个新 ID;改写由 `PB02_OPERATION_ID_GUARD`(previousIds===nextIds)强制不改身份。

## 3. adapter 无损、schema 防线、分层（独立 + 测试）

- **adapter 完整无损(我独立跑)**:`full.json`(section 嵌套/paragraph/list/quote/table 列行格/figure/toc/pagebreak,14 节点)`fromProseMirrorDocument(toProseMirrorDocument(x))` `deepEqual` 无损——承接我 PB-01 的代表性可行,现证完整版忠实。测试 102 亦以 `deepEqual` 对账同 fixture。
- **schema 恒有效 + fail-closed**:`toProseMirrorDocument` 先 `validateDocument`、`fromProseMirrorDocument` 校验根为 doc,非法即 `PB02_ADAPTER_INVALID`;操作拒 schema 破坏/循环移动/改写改身份(测试 199）。
- **分层严格**:操作层只导出 `insert/delete/move/rewrite/copyBlock` + adapter + schema + IdAllocator;**无事务/undo-redo/CRDT/UI 夹带**(留 PB-03/04/07)。

## 4. 透明说明 · 我的探针两次报错是我误用,非 bug

严格审查中我两次独立探针撞错,查清均为**我的 API 误用**,不是产物缺陷,如实记录:
- 我最初传 G1-04 raw doc 给 `copyBlock`(它签名要 `ProseMirrorDocument` + 4 参:input/id/destParentId/allocator)、又漏参 → 报错;
- 我假设 `full.json` 顶层有 paragraph(实际嵌在 section 内)→ 报错。

**两次都是 adapter/操作对我的非法输入正确 fail-closed**(输入校验是对的,是正面信号)。用对 API 后,往返无损、复制/改写 ID 稳定、affected 追踪全部确认。往返"false"一次是我 `JSON.stringify` 顺序敏感,测试用 `deepEqual` 正确、通过。

## 5. 门禁、供应链

- **门禁**:semantic-editor **6/6**(完整 fixture 往返、插入/复制新身份保旧、移动/改写/删除保 ID、120 步随机属性、位置派生负向变异、拒非法操作);PR CI **8/8**;`pnpm verify` exit 0。
- **供应链**:`prosemirror-model`+`orderedmap` 均 **MIT**,无 GPL/AGPL/未知;SBOM 可重建、lockfile 冻结、pnpm-workspace 登记。
- **冻结物零漂移**:G1-04 契约/稳定 ID 规则未动;诊断不回显正文。

## 6. 结论与交接

**PB-02 独立审计 PASS。** 稳定 ID 内在真稳、adapter 完整无损、schema 恒有效、affected 追踪落地、供应链干净。合并由业主/Codex 执行。

- **PB-02 串行奠定事务**;签署后 **PB-03(统一事务/校验/undo-redo/取消)** 承接;PB-04(语义工具→事务编译器)可在契约冻结后并行。
- 承接:`affectedNodeIds` 供 PB/Alpha 增量分页;ArkWeb 性能后置(needs_device)。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
