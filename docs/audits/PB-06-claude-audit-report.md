# PB-06 语义审计事件与出处链 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：分支 `pb-06-semantic-audit`（提交 `79e7a8b`）；base = `origin/main`（`5ad6683`，已含 PB-05 + PB-05A）
> 远程验证：**尚无 PR，远程 CI 未确认**（业主自述本地 `pnpm verify` 通过、SBOM 重建 + `pnpm supply:check` 通过）；我 worktree 隔离 `pnpm install --frozen-lockfile` 复跑 semantic-audit **3/3**、`tsc` typecheck **exit 0**
> 审计方法：**日志不泄密独立喂对抗(9 类未知字段+走私) + 出处四问独立复现 + PB-05A 契约贯穿核 + append-only 完整性对抗 + 无旁路核**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS（代码/安全/设计）—— 合并前须补一步:建 PR 确认远程 CI 8/8。** 无 BLOCKER/MAJOR/MINOR。六条门禁独立坐实;唯一未决是**远程 CI 未挂**(尚无 PR),非代码缺陷。

- **日志不泄密(命门,我独立喂对抗)**:审计流唯一写入口 `record()` **强制过 PB-05A 契约**(`validateProjectContract`),不过即 `SEMANTIC_AUDIT_EVENT_REJECTED` 抛出**不入库**;密钥/全文**结构性无字段入口**(托底 PB-05A `additionalProperties:false`)。
- **出处四问可答且诚实**:`explain(nodeId, materials)` 汇集**来源 / AI 改动 / 人工后续修改 / 材料是否存在**;材料存在按 `material_id:sha256` 双要素判定,hash 不匹配即 `false`。
- **与 PB-05A 冻结一致**:哈希主体逐 action、模板不伪造 document、`system` 仅 `template_applied` 全部经契约贯穿到审计流。
- **范围诚实 + 供应链干净**:内存事件流,**无按键历史/CRDT/持久化/UI**;依赖仅 `@wenshu/project-contract`(workspace),无新第三方。

## 2. 日志不泄密（命门,独立喂对抗）

我在仓外独立跑真实 `SemanticAuditTrail`(不只复跑测试):

| 对抗 | 结果 |
|---|---|
| 加未知字段 `api_key`/`token`/`secret`/`password`/`authorization`/`prompt`/`content`/`full_text`/`document_body`(值="sk-ant-LEAK…正文") | **9/9 拒(`SEMANTIC_AUDIT_EVENT_REJECTED`)、未入库、值未落日志** |
| 走私:`subject_model_context.provider="sk-leak"`(非注册表) | **拒**(PB-05A 封闭 enum 贯穿) |

**判定**:密钥/正文**没有字段入口**,未知字段由 Schema fail-closed 且值不落库——不是关键词/熵启发式,是结构化拒绝。承接 PB-05A NF-02,"日志不含密钥/全文泄漏"红线守住。

## 3. 出处四问 / PB-05A 贯穿 / append-only 完整性（独立复现）

- **四问(②)**:三事件(ai_change_decided + user_changed_after_ai + source_linked)后 `explain` → 来源=1、AI改=1、人工后改=1、材料存在=true;**材料 hash 不匹配→存在=false**(诚实,不假装存在);无关节点→AI改=0/来源=0(隔离)。
- **PB-05A 贯穿(③)**:`template_applied` 填 `document` 主体(伪造)→**拒**;`system` + `ai_change_decided`→**拒**——冻结的 hash subject 与 system 权限矩阵原样生效,审计流不另立弱校验。
- **append-only 完整性(④)**:乱序 `sequence`→**拒且库保持空**;**拒绝不污染序列**(随后正确 `sequence=0` 仍可入);重复 `event_id`→**拒**。审计日志的顺序与唯一性有守卫。
- **无旁路(⑤)**:`#events` 私有;`events()` 返回**冻结副本**(不可 push、改副本不动内部);唯二入口 `record`/`recordAiDecision` 都过校验——无未校验事件入库路径。

## 4. 三层隔离、范围诚实、门禁、供应链

- **三层不混用**:本包只存 `semantic_audit_event`(`record()` 对 `contract_kind !== "semantic_audit_event"` 直接拒);**不含编辑历史/CRDT/持久化代码**——与 PB-07 的 schema 隔离口径一致,语义审计层独立。
- **范围诚实**(ADR-0021):内存事件流、只在 AI 裁决/人工后续/材料关联等责任边界写入、**无按键 API**;AI 裁决**只从 PB-05 字段级 diff 提取稳定 node ID,不留 diff 值/请求/prompt/正文**(测试断言 `JSON.stringify(event)` 不含 `diffs`);明写"不能重放正文、不替代事务/同步日志"。
- **门禁**:semantic-audit **3/3**、`tsc` exit 0(我复跑);业主自述本地 `pnpm verify` + SBOM 重建 + `pnpm supply:check` 通过。**远程 CI 待建 PR 后确认。**
- **供应链**:依赖仅 `@wenshu/project-contract`(workspace:\*),**无新增第三方**;`pnpm-lock`(+13)/`sbom`(+2)仅 workspace 内部接线;冻结物(G1-04/PB-05A 契约)零漂移。
- **诚实说明**:审计中 `git worktree add`(即便 `--detach`)再次把主库 D:/wenshu **切到 `pb-06-semantic-audit` 分支**(与 PB-05A 同一 DWIM 现象);我核实主库树干净后**已切回 main、删游离分支**才提交——本报告确在 main、对产物与 main 无影响。本轮我探针无误用。

## 5. 结论与交接

**PB-06 独立审计:代码/安全/设计 PASS。** 语义审计流强制过 PB-05A 契约、密钥/全文结构性无入口、出处四问可答且诚实、哈希指称与 PB-05A 一致、append-only 完整、无旁路、三层不混用、范围诚实、供应链干净。

- **合并前置(唯一未决)**:建 PR → **远程 CI 8/8 绿** → 方可合并。CI 一绿即满足签署闭环;若 CI 红请复盘再交。
- 承接:真实存储/序列化/知识包闭合由 **PB-08~11**;`explain` 的四问出处供 A-09 消费;PB-07 已签、可继续并行。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现;合并由业主在 CI 绿后执行。
