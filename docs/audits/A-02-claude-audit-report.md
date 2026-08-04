# A-02 Claude 独立审计报告（首审）

> 审计对象：`A-02` 新建/打开项目与只读导入流程（R-UX/R-DATA）。分支 `a-02-project-import` 头 `4183442`，PR #55 **未合入**（`origin/main` = `e03bb26`）。
> 审计方法：自建对抗探针直打真实 Host 入口（路径泄漏、handle 重放、选择后漂移、作用域越界）+ 契约层敌意值 + 注册表版本形态实测 + 代码走查。审计只新增本报告一个文件。
> 审计环境：Win10 `wenshu-dev-primary`，D 盘冻结 Node v24.17.0。

## 1. 结论

**CONDITIONAL PASS —— 无 BLOCKER；一项 MAJOR 须在合并前关闭。**

**ADR-0029 ①-a 这条最容易破的红线守住了，而且守得比我要求的严**：真实 `file.import.select` 输出里没有任何路径成分，handle 一次性、跨作用域不可用，甚至连我没要求的"选择后内容漂移"都做了 fail-closed。MAJOR 出在 ①-b 的版本形态上——`0.2.0` 注册表现在把 `file.import.select` 登记成了 `supported/0.3.0`，这是对已签署冻结协议的静默语义变更。

## 2. 我独立坐实的部分（探针直打真实入口）

**①-a　输出零路径成分** —— 真实 `file.import.select` 返回：

```json
{"files":[{"grant_id":"grant_bad33091…","file_name":"报告.md",
          "content_sha256":"fb9cc786…","size_bytes":17}]}
```

绝对路径、临时根目录、`\`、`/` **一个都不在输出里**；`报告.md` 是 `FileDisplayName` 约束下的显示元数据，不含分隔符。**这条红线成立。**

**借 `file_name` 走私路径 —— 全拒**（喂 0.3.0 输出 schema）：

| 载荷 | 结果 |
|---|---|
| `C:\x\y.md` / `/etc/passwd` / `..` / `a:b` | `HOST_PLATFORM_FIELD_FORBIDDEN` |
| `.` | `HOST_PAYLOAD_SCHEMA` |
| `报告.md`（合法 CJK） | 正确接受，无误杀 |

**handle 生命周期与作用域 —— 我提的两个反例都过了，还多守一层**：

```text
一次性     第一次读 -> ok 17B      重放 -> refused NOT_FOUND      （consume-on-read）
漂移       选择后改内容再读 -> refused INTEGRITY_FAILURE           （TOCTOU，我未要求）
作用域     file grant 当目录 grant 用 (project.save.as) -> HOST_NOT_FOUND
```

`readGrantedFile` 是**先吊销再读**、读取不离开钉定路径，文件 grant 与目录 grant 分属两张表——设计对，实测也对。

**①-c　选择器只在 L3** —— `selectFiles` 由壳注入，未注入时能力 fail-closed；核心侧只见 handle。

## 3. MAJOR-1　`0.2.0` 注册表把 `file.import.select` 登记成 `supported/0.3.0`

- **我的实测**：

  ```text
  buildPayloadHostRegistry({ protocolVersion: "0.2.0" })
     -> validateHostContract: valid
     -> file.import.select: support_status=supported, capability_version=0.3.0
  buildPayloadHostRegistry({ protocolVersion: "0.3.0" })
     -> file.import.select: supported/0.3.0
  ```

  两者对该能力的登记**完全相同**——`protocolVersion: "0.2.0"` 并没有产出一个"纯 0.2.0"的注册表。

- **与冻结契约的冲突**：[host-contract §5](../host-contract.md) 明写「同一协议版本只能做不改变既有语义的实现修复；**不能静默把 degraded/unsupported 当作 supported**」。`file.import.select` 在 PB-10 签署的 `0.2.0` 里是 `unsupported`（`reason_code: PB10_PAYLOAD_UNFROZEN`）——我在 PB-10 审计时逐条核过。现在同一个 `0.2.0` 说它 `supported`，正是该条禁止的形态。
- **与 ①-b 裁定的冲突**：任务书 ①-b 要求的决定性测试是「**既有 0.2.0 注册表（把 `file.import.select` 登记为 `/0.1.0` 占位）仍须校验通过**」。现在 builder **根本不再产出那个形态**，该测试若照抄裁定文字就无从构造，若照现状写就变成了给缺陷背书。
- **失效方向**：不是 fail-open。0.2.0 消费者若按 `capability_version: "0.2.0"` 调用，会因 `declaration.capability_version !== value.capability_version` 得到 `INVALID` 失败终态——**能力上是关着的**。问题在**表述**：注册表向 0.2.0 消费者广告了一项它无法调用的能力。故判 MAJOR 而非 BLOCKER。
- **修复方向**（任选，须书面裁定并写进 ADR-0029）：
  1. `protocolVersion: "0.2.0"` 时让 `file.import.select` 回到 `/0.1.0` 占位（`unsupported`），仅 `0.3.0` 注册表登记为 supported——然后 ①-b 的决定性测试可按原文构造；
  2. 或书面裁定"0.2.0 注册表可含 0.3.0 能力"并修改 host-contract §5 的措辞与 ADR-0025 §1 的对应表述——**这属于改动已签署契约的语义，须业主批准**，不接受实施者自决。

无论哪条，都要补一条决定性测试钉住选定语义（变异 → 变红）。

## 4. 待补核（本轮未做完，如实登记）

我的探针预算用在了红线上，以下几项**尚未由我独立复核**，复审时补：

- **原件哈希不变**在取消 / 部分失败 / 权限拒绝三条异常路径上的字节级比对（我承诺过要各做一次）；
- A-01 冻结契约四态是"消费契约"还是"另写一遍"；
- `A-01-followups #2`（`types:["node"]`）的明确表态是否到位；
- 承接项归属三类分法是否越权关闭；
- 决策 #15 ↔ ADR-0029 互引；
- CI 侧 `permission-denied` 的 `chmod 0o555` 实证（业主已提供日志摘录，我未独立核 CI）。

**本报告的 `CONDITIONAL PASS` 仅覆盖 §2 已坐实项与 §3 这一条 MAJOR**；§4 各项在复审补齐前不构成"已审计通过"。

## 5. 交接与关闭条件

- **MAJOR-1 由 Codex 修复，由我复审关闭**；若走修复方向 2，须**业主书面批准**后方可动 host-contract §5 与 ADR-0025 的表述。
- **PR #55 在复审签署前不合入**。
- 审计报告落盘的**同一轮**补 §3.1 台账 `A-02` 行（检查 8a 会拦），状态如实写；合并后按 [AGENTS 台账证据指纹规则](../../AGENTS.md) 用 `main` 上的合入 SHA。
- 复审时我会重跑 §2 全部探针（不回潮）+ MAJOR-1 的版本形态实测 + §4 六项补核。

---

*本报告由独立审计角色出具；台账与代码修复由实施者完成。审计期间仅新增本文件。*
