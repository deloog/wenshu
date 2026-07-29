# PB-07 离线 CRDT 探针 / 三层记录隔离 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #33 分支 `pb-07-crdt-probe`（提交 `787f29e`）；base `origin/main`
> 远程验证：CI **8/8 pass**；隔离 `npm install` 复跑探针 **2/2**
> 审计方法：**双副本离线合并独立复跑 + 真冲突/顺序无关对抗独立复现 + 三层隔离读 + 供应链隔离核**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS（探针诚实、判定成立）—— 可合并 PR #33。** 无 BLOCKER/MAJOR/MINOR。**"Yjs 作候选、非产品选型、不实现自动同步"为 ADR-0019 建议,最终由业主批准。** 本审计确认:合并可行、隔离干净、诚实无夸大。

- **两副本离线合并收敛 + 稳定映射(命门,我独立复现)**:两 `Y.Doc` 同种子离线分叉(一方改写已有稳定节点、一方插入新稳定节点)→ 交换真实 `encodeStateAsUpdate` → **完整节点/事务状态 `deepEqual` 收敛**,每个 `affectedNodeIds` 仍指向存在的 G1-04 形式节点 ID。
- **真冲突亦确定性收敛(我加码对抗)**:两副本**同时改写同一节点**→ 双向合并后**两方 `deepEqual` 收敛、节点 ID 未损、只 1 个节点、两方事务都保留**;**同批更新正序/反序合并→同一结果、幂等**(CRDT 确定性)。
- **三层记录隔离**:编辑历史/CRDT 合并/语义审计各由 `records.schema.json` 独立 schema 定义、均 `additionalProperties:false`,键不相交;事务 ID 不得入语义审计、CRDT update/state-vector 不得入编辑历史或语义审计。
- **隔离干净**:探针在 `probes/pb-07-yjs/`(非 workspace 包),根 `pnpm-lock.yaml`/`sbom.json` **零改动**;Yjs 13.6.27 **MIT**。

## 2. 离线合并 & 真冲突（命门,独立猎杀）

官方探针用**不冲突**编辑(A 改 node1、B 插 node2)。我复跑 2/2 后**加真冲突对抗**(仓外独立跑):

| 对抗 | 结果 |
|---|---|
| 官方:A 改已有节点 / B 插新节点 → 合并 | 2/2 `deepEqual` 收敛、稳定映射成立 |
| ① **两副本同时改写同一节点**(真冲突) | 双向合并后 **A==B 收敛、节点 ID 未损、单节点、两方事务(`tx_alice_1,tx_bob_1`)都在** |
| ② **同批更新反序合并 vs 正序** | **同一收敛结果、幂等**(重复应用不变)——确定性 |
| ③ 冲突合并后稳定映射 | 所有事务 `affectedNodeIds` 仍指向存在节点 ✓ |

**判定**:双副本离线编辑可稳定映射 ID/事务并收敛,冲突下亦确定性收敛(Yjs 同键按 clientID 确定性裁决)、无 ID 损坏或事务丢失——R-RECORDS/R-DATA 合并可行性成立。

## 3. 三层隔离、诚实范围（测试 + 读）

- **三层 schema 不相交**(测试 + `records.schema.json` 读):`edit_history`/`crdt_merge`/`semantic_audit` 各 `additionalProperties:false`;负向测试证给 `semantic_audit` 掺入 `transactionId` 即抛错;`transactionId ∉ semantic_audit`、`updateDigest ∉ edit_history/semantic_audit`、`locator ∉ crdt_merge`——三层记录不混用。
- **诚实范围**(ADR-0019 §4):**明写"无 transport/peer discovery/后台同步/持久化/UI/冲突裁决产品策略/生产 API",尤其"不能被表述为 Alpha 自动同步已实现"**——最小可行性证据,不夸大成同步产品。
- **失败即换候选**(ADR §复现):明写探针失败(映射不稳/不收敛)则 Yjs 不得硬凑、如实换候选重评审——契约诚实。

## 4. 供应链隔离（我独立核）

- **未进主供应链**:探针目录自带 `package-lock.json`;主 `pnpm-lock.yaml`/`sbom/sbom.json` diff 中**零改动**(我核 diff 文件清单确认)——候选未构成生产选型。
- **许可**:`yjs@13.6.27` **MIT**(我 `npm install` 后读 `node_modules/yjs/package.json` 确认);传递依赖 `lib0@0.2.117`、`isomorphic.js@0.2.5` 均 MIT,只钉在隔离 lockfile;ADR 记 tarball integrity + 本机重打包 SHA。**无 GPL/AGPL/未知**。
- **诚实**:② 首轮我探针曾报"反序≠正序"——查清是**我误设**(每 `new Y.Doc()` 随机 clientID,A2/B2 与 A/B 非同一对 actor,跨对比较无意义),按"同批更新不同顺序"正确重测后确定性收敛成立。**非产物缺陷**,如实登记,不把误设留成疑似缺陷。

## 5. 结论与交接

**PB-07 独立审计 PASS。** 双副本离线合并收敛、稳定 ID/事务映射(冲突下亦确定性)、三层记录 schema 隔离、隔离未进主供应链、Yjs MIT、范围诚实(不冒充自动同步)。

- **待业主批准**:Yjs 作 CRDT 候选可行性证据(**非生产选型**);若后续拟接入,须另走许可/SBOM/锁定/业主批准。
- **可与 PB-06 并行**(schema 隔离);PB-08 承接可合并操作模型。
- 承接:ArkWeb/网络 transport/持久化按原口径后续实证,不在本探针范围。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现;候选选型由业主批准。
