# PB-01 语义编辑内核七维探针 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #29 分支 `pb-01-semantic-kernel-evaluation`；base `origin/main`
> 远程验证：CI **8/8 pass**（docs-only）
> 审计方法：**诚实性核(未把静态/浅探伪造成评分) + 我独立复现 ProseMirror 稳定 ID 探针(替 PB-01 后置的 #1 维度实证) + 供应链隔离核**;GitHub 只读。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS（诚实,推荐成立）—— 可合并 PR #29。** 无 BLOCKER/MAJOR。一处观察(评估偏薄,#1 维度由我独立补验)。**选型/引入依赖仍须业主批准。**

- **诚实,没伪造(命门,业主"3 分钟"疑虑的核心)**:七维里**只有"固定操作/undo/redo"真跑了**(ProseMirror、Yjs=pass),其余**如实标 `conditional`/`not_evaluated`/`needs_device`**——明确"不把字符串 ID 冒充内核原生稳定 ID、不对未完成的 v0 往返计分、浏览器 probe 不冒充 ArkWeb"。3 分钟解释得通:只探了 1 维 × 2 候选,不是把静态信号穿探针外衣。
- **推荐经我独立验证站得住**:我亲跑 ProseMirror 稳定 ID 探针,**证实它能干净满足 G1-04**——推荐不是"大概行"。
- **淘汰/隔离正当**:Slate 按维护硬闸(beta/无 1.0)淘汰;Yjs 仅作 PB-07 协同候选(非文档内核);候选仅在 `tmp/pb-01-isolated`,**docs-only、lockfile/SBOM/deps 零改动**。

## 2. 我独立补验了 PB-01 后置的 #1 维度（严格审查的实质）

PB-01 把**稳定 ID(R-ID,整个 PB-02 的根)标 `conditional`、未探**,推荐 ProseMirror 时以"PB-02 首先证明稳定 ID adapter"为前提。**推荐悬不悬空?我在隔离环境亲跑 ProseMirror 探针实证:**

| G1-04 规则 | 我的探针结果 |
|---|---|
| 改写不改既有 ID | ✔ 改 para B 文本 → B 及全部原 ID 稳定 `[A,B,C]` |
| 移动不改既有 ID | ✔ 移 C 到最前 → `[C,A,B]`,C 保留 ID、其它不变 |
| 复制分配新 ID | ProseMirror 原样带 attrs、**复制会重复 id**（`[A,B,C,A]`）→ 须 app 层插件在创建时分配/去重 |

**结论:ProseMirror 能干净支持 G1-04 稳定 ID**——两条最难的(改写/移动)原生 attr 即满足,复制需一个标准 ID 管理插件(ProseMirror 常规做法)。这与 ADR "conditional: adapter 保存节点身份"**完全一致**。**故推荐 ProseMirror 不是过早——后置的关键维度我替它验了,可行性成立、低风险。**

## 3. 诚实性、承接、范围

- **未伪造评分**:探针输出真实(ProseMirror 固定操作/undo/redo=true;Yjs transaction/undo/redo=true);ADR 诚实标"稳定 ID/v0 往返/ArkWeb/CRDT 仍须后续任务实证"、"建议待业主批准"。
- **许可/维护硬闸**:Slate beta/无 1.0 → 淘汰(如实);Lexical MIT 但 API 变动快 → 备选不先引入;Yjs v14 RC → 不当稳定协同通过、采稳定线前不升级;ProseMirror MIT 活跃 → 推荐。**GPL/AGPL/未知无一混入**。
- **ArkWeb 诚实**:无设备/模拟器(BIOS 虚拟化未开)→ 全标 `needs_device_to_verify`,不伪装、不用浏览器 fake 冒充(承接 PA-14H)。
- **候选隔离**:仅 `tmp/pb-01-isolated`,未进 lockfile/SBOM;docs-only 三份文档;未做编辑器、未落地选型(合范围)。

## 4. 观察（非阻断）· 评估偏薄

PB-01 只操作性探了"固定操作"1 维,**稳定 ID/v0 往返被整维后置**(而稳定 ID 的最小可行性探针很便宜——我约 1 分钟就跑完了)。诚实地后置(未伪造)使它不阻断,且我已替它补验可行性;但一个更扎实的 PB-01 本可把稳定 ID 可行性探针纳入,使推荐"探明"而非"待证"。

**建议**:①本报告 §2 的稳定 ID 探针结论(改写/移动原生、复制需插件)记入台账,供 PB-02 直接承接;②PB-02 按 ADR 前提**首先实现并证明**稳定 ID adapter + v0 往返,再落地 ProseMirror 选型;③Lexical 若未来要作对照,须补同口径固定操作/稳定 ID 探针。

## 5. 结论与交接

**PB-01 独立审计 PASS。** 评估诚实(未把静态/浅探伪造成七维评分)、推荐 ProseMirror 经我独立稳定 ID 探针验证成立、候选隔离未进供应链、CI 8/8。

- **待业主批准**:ProseMirror 作 PB-02 隔离语义内核候选(前提 PB-02 首证稳定 ID adapter + v0 往返);Yjs 留 PB-07 协同候选;**选型及依赖写入 lockfile/SBOM 须业主明确批准**。
- 批准后 **PB-02(稳定 ID 最小编辑操作,R-ID/R-TX)** 串行奠基——届时我审"普通编辑后未受影响 ID 稳定、schema 始终有效"(承接本报告 §2 可行性)。
- 承接:变更追踪能力(增量分页)、ArkWeb 设备实测(needs_device)按原口径后续实证。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现;选型由业主批准。
