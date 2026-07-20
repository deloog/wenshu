# G1-07 Claude 独立审计报告

> 状态：已完成　审计者：Claude（独立只读）　实施者：Codex　日期：2026-07-20
> 任务书：[G1-07-claude-audit-task.md](G1-07-claude-audit-task.md)　审计范围：`1d699db..ecbdd23`

## 审计范围与方法

范围内仅 `ecbdd23`「feat: freeze G1 project and knowledge package contracts」（26 文件 +1393/-4），覆盖 `G1-07` 的项目清单、知识包 manifest、语义审计事件与兼容契约。

方法：

1. 通读 `CONSTITUTION.md`、`AGENTS.md`、`docs/data-inventory.md`、`docs/compatibility.md`、`docs/testing-strategy.md`、`docs/technical-baseline.md`、`docs/implementation-roadmap.md`、`docs/project-contract.md` 与 ADR-0004。
2. 逐行审读 `schema/project-contract.schema.json`、`src/validation.ts`、`src/bundle.ts`、生成脚本、fixture 与测试，并核对 `git diff --stat` 的实际改动面。
3. 在锁定的 D 盘工具链下复跑冻结安装与 `pnpm verify`。
4. **不以实施者自检 15/15、也不以 `pnpm verify` 全绿为结论**：在仓库外 scratchpad 编写只读探针，按任务书第 11 节的 7 项强制反测逐条构造反例。探针只 import 被审包，不写入仓库。

审计全程未修改代码、Schema、测试、fixture、路线图、lockfile 或任何其他文档；唯一写入仓库的文件是本报告。

**基线事实（非缺陷）**：`pnpm verify` 全绿，84/84 测试通过（config 7、contract-runtime 4、document-model 15、template-model 15、host-contract 28、project-contract 15），project-contract 的 15/15 与 `docs/project-contract.md:61` 自述一致。以下发现全部是在此之上另找反例得到的。

---

## 发现

### BLOCKER

#### B-01　语义审计无法表达「人类裁决了某个模型产出的修改」，裁决权被迫归属 AI；冻结参考 fixture 正是 AI 自批自己的修改

- **严重级别**：`BLOCKER`（契约根基错误 + 与宪法不变量直接冲突）
- **证据**：
  - [`packages/project-contract/src/validation.ts:133-135`](../../packages/project-contract/src/validation.ts#L133-L135)：`if ((event.actor === "ai") !== (event.model_context !== null))` —— 这是一个**双条件**约束：只有 `actor === "ai"` 才允许携带 `model_context`，且 `actor === "ai"` 时必须携带。
  - [`schema/project-contract.schema.json:211`](../../packages/project-contract/schema/project-contract.schema.json#L211)：`action` 枚举为 `ai_change_decided`、`user_changed_after_ai`、`source_linked`、`template_applied`、`formal_version_approved` —— **不存在「AI 提出修改」这一独立事件**，因此没有任何其他事件可以承载模型出处。
  - [`fixtures/valid/semantic-audit-event.json`](../../packages/project-contract/fixtures/valid/semantic-audit-event.json)：唯一的语义审计参考样例是 `actor: "ai"` + `action: "ai_change_decided"` + `decision: "accepted"`。
  - [`docs/project-contract.md:32`](../project-contract.md#L32)：把「非 AI actor 不得伪带模型上下文」作为有意设计写入契约说明。
- **可复现方式**：对 `ai_change_decided` 穷举 actor × model_context 的 6 种组合：

  | actor | model_context | 结果 |
  |---|---|---|
  | `user` | 已记录 | **拒绝** `PROJECT_INTEGRITY` |
  | `user` | `null` | 通过（但模型出处丢失） |
  | `ai` | 已记录 | 通过（但裁决权归 AI） |
  | `ai` | `null` | 拒绝 `PROJECT_INTEGRITY` |
  | `system` | 已记录 | 拒绝 `PROJECT_INTEGRITY` |
  | `system` | `null` | 通过 |

  即：**能被接受的组合，要么把 accept/reject 记在 AI 名下，要么彻底丢掉是哪个模型产生的修改。二者不可兼得。**

  该缺陷不止停留在单事件层，它能穿过完整知识包对账：构造 `actor: "ai"` + `action: "formal_version_approved"` + `decision: "approved"` 的批准事件，并让 `formal_versions[0].approval_event_id` 指向它，`validateKnowledgeBundle(project, manifest, [ ... ])` 返回 **`ACCEPTED`**。另外 `actor: "ai"` + `action: "user_changed_after_ai"`、`actor: "system"` + `action: "ai_change_decided"` 也一并通过。
- **影响**：
  - 违反宪法 12「模型是可替换的规划者，**不是最终裁决者**」与宪法 7「任何 AI 修改都必须可 diff、accept/reject 和 undo」——accept/reject 是人的动作，契约却把它编码成 AI 的动作才能保留模型元数据。
  - 违反宪法 15「高风险操作默认可预览、可取消、可恢复……不可逆操作需要显式确认」：正式版本批准可由 `actor: "ai"` 或 `actor: "system"` 完成并通过全量对账。
  - 与 `docs/data-inventory.md:14-15` 冲突：语义审计事件与出处信息被列为真源，用途正是回答「谁改的、谁批的、依据什么」。当前契约回答不了「人类批准了模型 M 的修改」。
  - **直接卡住已声明的消费者**：`PB-05`「未接受不改真源，部分接受可撤销」与 `PB-06`「能回答来源/AI 修改/人工后改/材料存在」的验收标准，用本契约无法生成对应的审计记录。`docs/implementation-roadmap.md` 中 `PB-06` 依赖 `G1-07`，`A-09`「语义审计视图」再依赖 `PB-06`。
  - 时机最关键：本契约的 `destructive_change` 策略是 `new_major_and_adr`（[schema:248](../../packages/project-contract/schema/project-contract.schema.json#L248)）。等 `PB-05/06` 开工后再修，就必须升主版本并重跑全部消费者——这正是路线图第 11 节要求在契约阶段拦下的「会迫使后续破坏性迁移的决定」。
- **建议处理**：在 `0.1.0` 冻结生效前重新设计责任模型，二选一：
  (a) 把「谁做的」与「关于什么模型」解耦——例如引入 `actor`（`user`/`system`）+ 可选 `subject_model_context`，并允许非 AI actor 携带被裁决对象的模型出处；把 `model_context` 的存在性绑定到 `action ∈ {ai_change_decided, user_changed_after_ai}` 而不是绑定到 `actor`；
  (b) 增补 `ai_change_proposed` 事件承载模型出处，并要求 `ai_change_decided` 通过事件引用指向它，同时约束 `formal_version_approved` 与 `ai_change_decided` 的 `actor` 必须为 `user`。
  无论选哪条，都需要：把 `fixtures/valid/semantic-audit-event.json` 改为「用户裁决 AI 修改」这一主线场景，并补 `actor: "ai"` 批准正式版本、`actor: "system"` 裁决 AI 修改两个负向 fixture。

---

### MAJOR

#### M-01　审计事件的前后哈希与受影响节点同 `action`/`decision` 完全解耦，可记录「已拒绝但文档被改」「已接受但什么都没变」

- **严重级别**：`MAJOR`
- **证据**：[`src/validation.ts:131-150`](../../packages/project-contract/src/validation.ts#L131-L150) 的 `validateAudit` 只检查三件事——actor↔model_context、`source_linked`↔`source_refs` 非空、action↔decision 映射。`before_sha256`/`after_sha256`（[schema:218-219](../../packages/project-contract/schema/project-contract.schema.json#L218-L219)，均允许 `null`）与 `affected_node_ids`（[schema:213-217](../../packages/project-contract/schema/project-contract.schema.json#L213-L217)，无 `minItems`）从不参与任何一致性判定。
- **可复现方式**：

  ```text
  decision=rejected，before=1111…，after=2222…（拒绝了却改了文档）   ACCEPTED
  decision=accepted，affected_node_ids=[]，before=null，after=null    ACCEPTED
  decision=accepted，before === after（接受了一个空修改）             ACCEPTED
  ```

  以上均在单事件与完整 bundle 两层都通过（`validateKnowledgeBundle` 只对 `formal_version_approved` 的 `after_sha256` 做对账，对 `ai_change_decided` 不做任何哈希检查）。
- **影响**：`PB-05` 的验收标准是「未接受不改真源」，`PB-06` 要求出处链可回答「AI 改了什么、人工后改了什么」。当前审计流可以合法地声明一次拒绝同时记录一次真源变更，也可以声明一次接受却不指明任何节点或哈希变化——审计记录因此既不能证伪也不能重现。宪法 8 要求语义审计事件承担「模型与出处审计」职责，当前形态使其退化为无内容的标签。这类缺陷在实现期才发现时，同样落入 `new_major_and_adr` 的破坏性变更路径。
- **建议处理**：把哈希/节点与 action、decision 绑定为可执行约束，例如：`ai_change_decided` + `accepted` 要求 `before_sha256 !== after_sha256` 且 `affected_node_ids` 非空；`rejected` 要求 `before_sha256 === after_sha256`（或二者均为 `null`）；`formal_version_approved` 要求 `after_sha256` 非空。每条各补一个负向 fixture。

#### M-02　document/template 版本在四处硬编码，兼容清单与两个上游包之间没有任何漂移检查

- **严重级别**：`MAJOR`
- **证据**：同一组版本号被独立复制了四份，彼此无约束：
  - [`schema:239-243`](../../packages/project-contract/schema/project-contract.schema.json#L239-L243) `CompatibilityManifest.readers.document` / `.template` 均为 `const: "0.1.0"`；
  - [`schema:42`](../../packages/project-contract/schema/project-contract.schema.json#L42) `DocumentReference.schema_version` `const: "0.1.0"`；
  - [`schema:56`](../../packages/project-contract/schema/project-contract.schema.json#L56) `TemplateReference.dsl_version` `const: "0.1.0"`；
  - 真源分别是 `@wenshu/document-model` 的 `DOCUMENT_SCHEMA_VERSION` 与 `@wenshu/template-model` 的 `TEMPLATE_DSL_VERSION`。
- **可复现方式**：`packages/project-contract/package.json` 的依赖只有 `@wenshu/contract-runtime` 与 `ajv`；测试文件中对 `document-model`、`template-model` 的引用数均为 **0**。因此上游任一版本变化都不会使本包任何检查失败。而 `docs/project-contract.md:38` 把该对象描述为「固定五类 reader 的当前版本」的权威声明。
- **影响**：这正是 `G1-03～G1-06` 首审 `M-04` 的同类问题（声明性副本与真源之间无互锁），且这次落在专职管版本兼容的对象上。上游一旦升到 `0.2.0`——`G1-04` 遗留的 `NF-03`（资源路径 ASCII 白名单）在 `PA-00` 裁定后就可能触发次版本升级——本包会继续断言 `0.1.0`，四处需人工同步且无任何测试兜底。方向上是 fail-closed（会拒绝新版文档而非静默接受），因此不是数据损坏，但属于 MAJOR 定义中的「错误兼容」。
- **建议处理**：在 `packages/project-contract` 增加对两个上游包的依赖，并在契约测试中断言 `readers.document === DOCUMENT_SCHEMA_VERSION`、`readers.template === TEMPLATE_DSL_VERSION`，以及两个 `$ref` 常量与之一致；或改为从上游常量生成这部分 Schema 片段并纳入现有 `generate:check` 漂移检查。

---

### MINOR

| ID | 标题 | 证据与复现 | 影响与建议 |
|---|---|---|---|
| `m-01` | `truth.project` 与 `truth.audit` 两个 entry 的 `sha256` 从不被任何校验消费 | [`src/bundle.ts:96-127`](../../packages/project-contract/src/bundle.ts#L96-L127) 的 `hasExactTruthHashes`/`hasRequiredHash` 只覆盖 `truth.document`、`truth.template`、`truth.material`。探针：把这两个 entry 的 `sha256` 改成任意值，`validateKnowledgeBundle` 仍返回 `ACCEPTED` | 五类真源中有两类在契约层无哈希对账。`docs/project-contract.md:24` 列出的对账项确实未包含这两项，因此**不是虚假声称**；但 `PB-11` 的实现者可能误以为全部真源 entry 都已对账。建议在文档中明示这两项由 `PB-11` 用真实文件哈希闭合，并在 `PB-11` 验收标准中登记 |
| `m-02` | 时间戳只做语法校验，日历非法日期通过 | [`schema:19`](../../packages/project-contract/schema/project-contract.schema.json#L19) 为纯正则。探针：`2026-02-31T12:00:00Z` → `ACCEPTED`；而 `2026-13-20`、`2026-07-32`、非 UTC 偏移、缺 `Z` 均被正确拒绝 | 审计事件时间是问责链的一部分，非法日期会在后续排序/展示中产生歧义。建议在 `validateAudit` 中补一次 `Date` 解析回读校验 |
| `m-03` | `locator`、`provider`、`model` 是无格式自由文本，可承载正文片段或密钥形状值 | [`schema:186`](../../packages/project-contract/schema/project-contract.schema.json#L186) `locator` 为最长 200 字符任意字符串；[`schema:194-195`](../../packages/project-contract/schema/project-contract.schema.json#L194-L195) `provider`/`model` 为 80/120 字符任意字符串。探针：200 字符中文正文片段、`sk-live-…` 形状的 provider 值均 `ACCEPTED` | 与 `docs/project-contract.md:32`「Schema 不提供正文、prompt、密钥……字段」和数据清单 S2/S3 分级存在张力：字段虽未**命名**为正文/密钥，但可容纳。建议把 `locator` 约束为结构化定位（节点 ID 或锚点模式），并给 `provider`/`model` 加保守字符集模式 |
| `m-04` | `PackageEntry.path` 与 `role` 之间无一致性约束 | [`schema:144-151`](../../packages/project-contract/schema/project-contract.schema.json#L144-L151) 与 `validatePackage` 均不比较二者。`{path:"derived/cache.bin", role:"truth.document", classification:"truth", required:true, rebuildable:false}` 形态可通过 | `PB-11` 解包时若按目录前缀推断真源/派生会与 `role` 矛盾。建议要求 `truth.*` 落在 `truth/` 前缀、`derived.*` 落在 `derived/` 前缀，或在文档中明确「目录名无语义，只以 `role` 为准」 |
| `m-05` | `PROJECT_SCHEMA` 单一问题码无区分度，负向断言只用 `.some(code)` 不断言 `path` | [`src/validation.ts:186-188`](../../packages/project-contract/src/validation.ts#L186-L188) 把全部 Ajv 错误压平；[`test/project-contract.test.ts:63,76`](../../packages/project-contract/test/project-contract.test.ts#L63) 只断言存在某个码 | 与 `G1-03～G1-06` 首审 `m-02` 同类。该项**已有归属**：`G1-09` 验收标准已含「非法 fixture 断言稳定 issue code 与预期 JSON path」，本包需一并纳入 |

---

### NOTE（已核验事实，不计缺陷）

- **N-01　真源/派生分类无法绕过。** 任务书第 1 项反测 11/11 全部拒绝：`truth.*` 角色被强制 `classification:"truth"` + `required:true` + `rebuildable:false`，`derived.*` 被强制相反组合（[`src/validation.ts:111-127`](../../packages/project-contract/src/validation.ts#L111-L127)）；仅含派生 entry 的包被 `minItems:4` 拒绝；缺 `truth.document`、出现两个 `truth.project`、路径重复均被拒绝；`derived_data.source_sha256s` 指向非真源哈希被拒绝。**索引无法成为唯一真源。**
- **N-02　知识包篡改反测 22/22 全部拒绝。** 覆盖项目 ID（manifest/audit 两侧）、审计 ID、审计序号、审计流缺失/重复、文档哈希（project/manifest 两侧）、模板哈希、材料哈希、出处材料哈希与 material_id、真源 entry 缺失、孤儿真源 entry、正式版本批准事件悬空/动作错误/`after_sha256` 不匹配、正式版本模板哈希缺 manifest entry、历史版本缺 manifest entry。`hasExactTruthHashes` 的集合相等判定同时挡住了「少一个」和「多一个」，历史正式版本补齐 entry 后正确通过。这是本次实施中质量最高的部分。
- **N-03　语义审计的内容隔离有效。** `prompt`、`raw_response`、`api_key`、`body_text`、`crdt_update`、`editor_transaction`、`undo_stack` 七个未知字段全部被 `additionalProperties:false` 拒绝。三层记录分离在 Schema 层成立（本报告 `B-01`/`M-01` 针对的是**责任语义**，不是内容混入）。
- **N-04　输入安全与预算全部达标。** 四类对象各自的 20,000 层嵌套 → `PROJECT_BUDGET_EXCEEDED`；200,000 宽节点 → `PROJECT_BUDGET_EXCEEDED`；循环引用 → `PROJECT_SCHEMA`；自有与继承访问器调用次数均为 **0/0**；无未捕获异常。复用 `@wenshu/contract-runtime` 而非再写第四份实现，符合首审 `m-04` 的整改方向。
- **N-05　round-trip 未虚假声称真实重导入。** 测试名为「survive a JSON round trip」，实现是 `JSON.parse(JSON.stringify(...))` + `deepEqual`，如实只证明序列化。`docs/project-contract.md:26` 与 ADR-0004 决策 6 都把真实压缩包、路径安全、实际文件哈希、干净环境重导入明确划归 `PB-11`，真实迁移划归 `PB-09`。核对路线图：`PB-09`「每 worker 独立真实库；迁移、重复运行、中断、损坏」与 `PB-11`「干净环境 round-trip 对账 ID/版本/引用/审计/附件；篡改拒绝；仅『文件存在』不算通过」两行**未被改写**，门禁完整保留。
- **N-06　未与数据库结构绑定。** Schema 中无表名、主键、自增 ID、外键或存储引擎特征；ID 全部是带前缀的不透明十六进制；ADR-0004 决策 2 明确「不复制正文或绑定数据库主键」。任务书第 6 项该子项通过。
- **N-07　兼容策略的版本拒绝方向正确。** `migration_paths` 非空、`unknown_version:"accept"`、`readers.document:"0.2.0"` 均被拒绝；四类对象的未来版本（`0.2.0`）与下一主版本（`1.0.0`）也全部拒绝，无静默读取。原地改写旧 Schema 与伪造空迁移在 v0 被 `maxItems:0` + `const` 组合挡住。遗留问题只在跨包同步（见 `M-02`）。
- **N-08　工程护栏全部达标（任务书第 7 项）。** `tsc -p tsconfig.json --listFiles` 显示 7 个手写 `.ts` 文件（`src` 3、`test` 1、`scripts` 3）**全部**进入严格检查，与磁盘清单一致；手写代码中 `any`、`as any`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`eslint-disable` 匹配数为 **0**；生成文件中 `any` 出现 0 次；`generate:check` 退出码 0（无漂移）；体量 `validation.ts` 197 行、`bundle.ts` 159 行、测试 209 行，均在 300 行预警线以下。`render-types.ts:29` 的 `as CompileFromFile` 是第三方边界上的具名类型断言，与既有三个契约包一致，符合 `AGENTS.md:65`。
- **N-09　路线图与治理台账如实。** `G1-07` 状态为「🟠 已实现待独立审计」，明确写「15/15 实施者自检通过……消费者等待 Claude 审计」；`AGENTS.md` 同步为「`G1-07` 当前已实现待独立审计，其消费者在审计闭环前暂停」；ADR-0004 状态为「提议（G1-07 待独立审计）」。未发现把未验证能力写成已完成事实。

---

## 实际运行的命令与结果

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store` | 通过（8 个工作区项目，新增 `@wenshu/project-contract`） |
| `pnpm run verify` | **通过**：84/84 测试（config 7、contract-runtime 4、document-model 15、template-model 15、host-contract 28、project-contract 15）；4×`generate:check` 无漂移；7 包 typecheck Done；production build 成功 |
| `git diff --stat 1d699db..ecbdd23` / `git diff` 逐文件 | 已核对全部 26 个文件的实际改动面 |
| `tsc -p tsconfig.json --listFiles`（project-contract） | 7/7 手写文件覆盖，见 `N-08` |
| `node scripts/check-generated.ts` | exit=0 |
| 只读探针 `g107probe.ts`（任务书第 1、2、3、4、6 项） | 产出 `B-01`、`M-01`、`m-01`～`m-03` 的反例与 `N-01`～`N-07` 的正面证据 |
| 只读探针 `g107probe2.ts`（责任模型可表达性） | 产出 `B-01` 的 actor×model_context 穷举与全量 bundle 穿透证据 |
| `git status --short`（审计前 / 后） | 审计前为空；结束时仅本报告一处新增 |

探针位于会话 scratchpad，未写入仓库；其构造方式已在各发现的「可复现方式」中给出。

## 未执行项与限制

1. **范围外，按任务书要求未审计**：尚未选择的数据库、尚未实现的 ZIP/文件 IO、真实路径穿越与真实文件哈希。这些属 `PB-08`/`PB-09`/`PB-11`，本次只核验其门禁未被削弱（见 `N-05`）。
2. **生成漂移的破坏性验证未执行**（需篡改 `src/generated/*.ts`，超出审计权限）。`check-generated.ts` 的重生成—全文比对逻辑经审读判定可靠，退出码 0 已复跑。
3. `pnpm --filter @wenshu/web build:test` 与 `build:staging` 未执行（与 `pnpm build` 共用 `apps/web/dist`）；`pnpm dev` 未执行。
4. 未做跨包端到端一致性验证：本契约引用的 `document_id`/`node_id` 前缀与 `@wenshu/document-model` 的实际 ID 规则未做联合 fixture 校验（与 `M-02` 同源，建议一并处理）。
5. 供应链结论仍由 `G1-15` 签署；本次 lockfile 变更仅为新增本地 workspace 包，未引入新的外部依赖。
6. `Ajv`、`json-schema-to-typescript` 内部正确性按锁定版本采信。

## 汇总与最终结论

| 严重级别 | 数量 | 编号 |
|---|---:|---|
| `BLOCKER` | 1 | `B-01` |
| `MAJOR` | 2 | `M-01`、`M-02` |
| `MINOR` | 5 | `m-01`～`m-05`（其中 `m-05` 已归属 `G1-09`） |
| `NOTE` | 9 | `N-01`～`N-09` |

**结论：`FAIL`**

存在 1 项 `BLOCKER` 与 2 项 `MAJOR`，**禁止将本契约作为 `PB-05`/`PB-06`/`PB-07`/`PB-08`/`PB-11` 的可信前置**，相关消费者不得启动。

判定要点：

- 本次实施在**数据完整性**维度质量很高——知识包对账 22/22 篡改全拒、真源/派生分类 11/11 不可绕过、输入预算与访问器防护复用共享运行时且全部达标、round-trip 未越界声称真实重导入、`PB-09`/`PB-11` 门禁完整保留。这些不是走过场，是本报告逐条反测后确认的。
- 阻断出在**责任语义**维度。`B-01` 不是可以补一条校验就了结的边角问题：`actor` 与 `model_context` 的双条件绑定，加上 action 枚举中缺少「AI 提出修改」事件，共同导致产品最核心的问责事件——**人类裁决模型产出的修改**——在 `0.1.0` 中不可表达。冻结的参考 fixture 因此只能写成「AI 接受了自己的修改」，而 `actor: "ai"` 批准正式版本还能穿过完整知识包对账。这与宪法 7、12、15 直接冲突，也使 `PB-05`/`PB-06` 的验收标准无法用本契约满足。
- `M-01` 是同一根因的另一面：审计事件的哈希与节点同 action/decision 完全解耦，可以合法记录「拒绝了但真源变了」。`PB-05` 的「未接受不改真源」因此无法由审计流佐证。
- 时机是判 `BLOCKER` 而非留待后续的决定性理由：本契约自身的 `destructive_change` 策略是 `new_major_and_adr`。责任模型一旦随 `0.1.0` 冻结并被 `PB-05/06` 消费，再修就是主版本破坏性迁移——正是路线图第 11 节与本次审计要在契约阶段拦下的情形。现在改，代价是一个尚无消费者的 Schema 修订。

**关闭路径**：由 Codex 按 `B-01` 的 (a)/(b) 两条方案择一重新设计责任模型，修复 `M-01`、`M-02`，补齐各条建议的负向 fixture 与跨包版本断言，复跑 `pnpm verify`，然后由 Claude 依本报告逐项复审并签署关闭。`MINOR` 中 `m-05` 已归属 `G1-09`，`m-01`～`m-04` 可与阻断项合并处理或明确绑定后续原子任务后作为条件项。审计者不提供也不应用补丁。

> 依 `AGENTS.md:55` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具；实施者不得自行关闭上述发现。

---
---

# 复审（2026-07-20）：`bc63ff0..76a0aec`

> 复审者：Claude（独立只读）　实施者：Codex　任务书：[G1-07-claude-reaudit-task.md](G1-07-claude-reaudit-task.md)
>
> **本章节的结论取代上文首审的 `FAIL`。** 上文首审记录原样保留，不得改写。

## 1. 复审范围与方法

范围 `bc63ff0..76a0aec`（`bc63ff0` 仅归档首审报告，实质变更全部在 `76a0aec`「fix: remediate G1-07 responsibility audit」，18 文件 +425/-84）。

按任务书要求，**不采信 [整改记录](G1-07-remediation.md) 的自述，也不采信 90/90 测试全绿**：

1. 逐行审读新增的 `src/audit-semantics.ts`、改写后的 `src/validation.ts`、Schema 差异、fixture 差异与两个测试文件。
2. **重跑首审的全部原始反例**，并对责任规则做**穷举**反测（5 action × 2 actor × 4 decision × 2 subject model × 2 nodes × 2 source refs × 4 哈希组合 = 每 action 128 种，共 **1,280 种组合**）。
3. 对跨包漂移门禁做**只读等价探针**：用 `node:module` 的 `registerHooks` 在本探针的模块图内把上游 `DOCUMENT_SCHEMA_VERSION` 替换为 `0.9.9`，从而在**不修改仓库任何文件**的前提下真实触发漂移条件。
4. 重跑首审的知识包篡改套件与输入安全套件，确认整改没有引入回归。
5. 复跑冻结安装、`pnpm verify`、`tsc --listFiles`、零 `any`/抑制指令、生成漂移与体量检查。

复审全程未修改代码、Schema、测试、fixture、整改记录、路线图或 lockfile；唯一写入的文件是本报告。

## 2. 复跑证据

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store` | 通过（8 个工作区项目） |
| `pnpm run verify` | **通过**：**90/90**（config 7、contract-runtime 4、document-model 15、template-model 15、host-contract 28、project-contract **21**）；4×`generate:check` 无漂移；7 包 typecheck Done；production build 成功 |
| `tsc -p tsconfig.json --listFiles`（project-contract） | 10/10 手写 `.ts` 全覆盖（见 §3 `check-5`） |
| `node scripts/check-generated.ts` | exit=0 |
| 只读探针 `g107re.ts` / `g107drift.ts` / `g107reg.ts` | 见下 |
| `git status --short` | 复审开始时为空；结束时仅本报告一处修改 |

## 3. 首审发现逐项判定

### `B-01`　人类裁决与模型来源不可同时表达 —— **已关闭 ✅**

修复是结构性的，不是给旧模型打补丁：

- `actor` 枚举收窄为 `["user", "system"]`，**`ai` 在 Schema 层被彻底移除**（[schema:221](../../packages/project-contract/schema/project-contract.schema.json#L221)）——模型不再是责任主体。
- `model_context` 改名并改变语义为 `subject_model_context`「被裁决对象来自哪个模型」（[schema:235](../../packages/project-contract/schema/project-contract.schema.json#L235)），与 `actor` 解耦。
- [`src/audit-semantics.ts:57-60`](../../packages/project-contract/src/audit-semantics.ts#L57-L60)：`ai_change_decided` **强制** `actor === "user"` 且 `subject_model_context !== null` 且受影响节点非空——首审指出不可表达的那个事件，现在不仅可表达，而且是唯一合法形态。

复跑首审的 actor × model_context 穷举（首审结论：能被接受的组合要么把裁决记在 AI 名下、要么丢掉模型出处）：

```text
actor=user   + subject_model_context 已记录     ACCEPTED   <- 首审时此组合被拒绝
actor=user   + subject_model_context null       rejected:PROJECT_INTEGRITY
actor=system + subject_model_context 已记录     rejected:PROJECT_INTEGRITY
actor=system + subject_model_context null       rejected:PROJECT_INTEGRITY
actor=ai     （任意）                            rejected:PROJECT_SCHEMA
```

`formal_version_approved` 的 actor 约束在**单事件与完整 bundle 两层**都验证：

```text
单事件   actor=user -> ACCEPTED   actor=system -> PROJECT_INTEGRITY   actor=ai -> PROJECT_SCHEMA
完整包   bundle 中由 user 批准 -> ACCEPTED   由 system 批准 -> rejected   由 ai 批准 -> rejected
完整包   bundle 中由 system 裁决 AI 修改 -> rejected
```

参考 fixture 也已改正：[`fixtures/valid/semantic-audit-event.json`](../../packages/project-contract/fixtures/valid/semantic-audit-event.json) 的 `actor` 由 `ai` 改为 `user`，首审指出的「冻结样例演示 AI 自批自己的修改」不复存在。**发现关闭。**

### `M-01`　哈希/节点与 action、decision 脱节 —— **已关闭 ✅**

[`src/audit-semantics.ts:56-110`](../../packages/project-contract/src/audit-semantics.ts#L56-L110) 为五类 action 各自绑定了 actor、模型出处、节点、source refs 与前后哈希的可执行组合规则。我做了 **1,280 种组合的穷举**，每个 action 的合法集合如下（括号内为 128 种中被接受的数量）：

| action | 合法组合（4/2/2/1/1 of 128） |
|---|---|
| `ai_change_decided` (4) | `user` + 模型出处 + 节点非空，且 `accepted ⇒ 前后哈希不同`、`rejected ⇒ 前后哈希相同`；source refs 可有可无 |
| `user_changed_after_ai` (2) | `user` + 模型出处 + 节点非空 + 哈希不同 |
| `source_linked` (2) | `user` 或 `system` + **无**模型出处 + 节点非空 + source refs 非空 + 哈希不同 |
| `template_applied` (1) | `user` + 无模型出处 + 无节点 + 无 refs + 哈希不同 |
| `formal_version_approved` (1) | `user` + 无模型出处 + 无节点 + 无 refs + 哈希相同 |

首审的三个原始反例全部转为拒绝：

```text
decision=rejected 但 before != after（拒绝了却改了真源）   rejected   <- 首审 ACCEPTED
decision=accepted 但 节点为空 / 哈希均为 null              rejected   <- 首审 ACCEPTED
decision=accepted 但 before === after（空修改）            rejected   <- 首审 ACCEPTED
```

任务书第 2 项要求的「rejected 确实不改变、accepted/applied 必要场景确实改变」在穷举结果中**双向成立**：`rejected` 的唯一合法哈希形态是相同，`accepted`/`applied`（除批准外）的唯一合法形态是不同。**发现关闭。**

### `M-02`　上游版本四处硬编码、无漂移互锁 —— **已关闭 ✅**

修复不止于测试断言，而是把互锁下沉到**运行时**：`package.json` 新增 `@wenshu/document-model` 与 `@wenshu/template-model` 依赖；[`src/validation.ts:13-19`](../../packages/project-contract/src/validation.ts#L13-L19) 导入真实常量构造 `PROJECT_UPSTREAM_VERSIONS`；新增的 `validateCompatibility` 在每次校验 compatibility 对象时比对 `readers.document`/`readers.template`。

直接提交 `readers.document = "0.2.0"` 只会被 Schema 的 `const` 先行拒绝（`PROJECT_SCHEMA`），**无法证明运行时门禁真的活着**。因此我按任务书第 3 项做了只读等价探针：用 `registerHooks` 把 `@wenshu/document-model` 解析到 scratchpad 中的替身模块（`export * from` 真实包，仅覆盖 `DOCUMENT_SCHEMA_VERSION = "0.9.9"`），再导入真实的 `project-contract`：

```text
PROJECT_UPSTREAM_VERSIONS.document 现在读到      0.9.9
仓库磁盘上的 document-model/src/index.ts         仍是 0.1.0（未被修改）
已提交的 compatibility fixture 现在校验结果      rejected:PROJECT_INTEGRITY@/readers
```

即：上游版本一旦真的变动，**已提交的合法 fixture 会立刻在 `pnpm verify` 中失败**，门禁真实存在且方向正确。另外两项互锁也确认为跨文件值耦合而非自比较：

```text
schema DocumentReference.schema_version const 与 上游常量 0.9.9   MISMATCH -> 测试会失败
project.document.document_id  ==  document-model/fixtures/valid/minimal.json .documentId   （doc_…0001，实时耦合）
project.template.template_id  ==  template-model/fixtures/valid/minimal.json .template_id  （wenshu.minimal，实时耦合）
若上游 fixture ID 漂移                                            断言会失败（非同一性比较）
```

**发现关闭。**

### MINOR 逐项

| 首审项 | 判定 | 复审核验 |
|---|---|---|
| `m-01` `truth.project`/`truth.audit` 哈希未被消费 | **合规延期 ⏭** | 契约层保持不伪造真实字节哈希（正确选择）。[`docs/implementation-roadmap.md`](../implementation-roadmap.md) 的 `PB-11` 行已改写，明确要求「从真实序列化字节计算并核验 `truth.project` 与 `truth.audit` entry 哈希」，并加了「只信 manifest 自报哈希不算通过」的停止条件。归属明确 |
| `m-02` 非法日历日期 | **关闭 ✅** | [`audit-semantics.ts:8-12`](../../packages/project-contract/src/audit-semantics.ts#L8-L12) 的 `isCanonicalTimestamp` 做 UTC 解析回读，并应用于审计 `occurred_at`、项目 `formal_versions[].created_at`、知识包 `created_at` 三处。实测 `2026-02-31`、`2026-02-29`（2026 非闰年）、`2026-04-31` 全部 `PROJECT_INTEGRITY`；`2026-02-28` 与无毫秒形式仍接受 |
| `m-03` 自由文本可承载正文/密钥 | **关闭 ✅** | `locator` 收窄为 `node_<32hex>` 或 `anchor:<受控字符集>`；实测中文正文、裸 `section-1`、`../../etc/passwd`、超长 anchor 全部拒绝。`provider`/`model` 加保守字符集 + 敏感形状启发式；`sk-live-*`、`sk_test_*`、`AIza*`、`ghp_*`、`xoxb-*`、`TOKEN-*` 全部拒绝（残留见 `NF-02`） |
| `m-04` path/role 不一致 | **关闭 ✅** | [`validation.ts:127,142-144`](../../packages/project-contract/src/validation.ts#L142-L144) 强制 `truth.*`→`truth/`、`derived.*`→`derived/`。实测双向反转、根目录、`truthx/` 前缀混淆全部 `PROJECT_INTEGRITY`；`truth/` 对照组通过 |
| `m-05` `PROJECT_SCHEMA` 粒度 | **合规延期 ⏭** | 维持 `G1-09` 归属，本轮未扩大错误模型（正确的范围克制）。`G1-09` 验收标准中「非法 fixture 断言稳定 issue code 与预期 JSON path」仍然有效，需覆盖本包 |

### `check-4` / `check-5`　回归与工程护栏

- **首审的知识包篡改套件 17/17 仍全部拒绝**（项目 ID 双侧、审计 ID/序号/缺失/重复、文档与模板哈希双侧、材料哈希、出处引用、真源缺失/孤儿、重复路径、真源派生互换）；未篡改基线仍 `ACCEPTED`。整改未引入回归。
- **输入安全无回归**：四类对象各自的 20,000 层嵌套 → `PROJECT_BUDGET_EXCEEDED`，循环 → `PROJECT_SCHEMA`，继承访问器调用次数 **0**，无未捕获异常。
- **`tsc --listFiles` 覆盖 10/10 手写 `.ts`**：`src` 4（`validation`、`audit-semantics`、`bundle`、`index`）、`test` 3（含新增 `audit-semantics.test.ts`、`fixture-helpers.ts`）、`scripts` 3，与磁盘 `find` 清单一致。
- **零 `any`/抑制指令**：全仓手写 TypeScript（排除 `src/generated/`）中 `any`、`as any`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`eslint-disable` 匹配数为 **0**；生成文件 `any` 出现 0 次；`tsconfig.base.json` 在本次范围内**零改动**。
- **体量合规**：`validation.ts` 208、`bundle.ts` 159、`audit-semantics.ts` 112；测试 `project-contract.test.ts` 231、`audit-semantics.test.ts` 125、`fixture-helpers.ts` 16。全部低于 300 行预警线，测试拆分是合理的职责拆分而非机械切片。
- **台账如实**：路线图 `G1-07` 标为「🟠 首审失败，整改已实现待复审」，`docs/project-contract.md` 与 ADR-0004 状态同步为待复审，`AGENTS.md` 保留「消费者在审计闭环前暂停」。ADR-0004 新增决策 6 记录跨包互锁。未发现把未验证能力写成已完成事实。

## 4. 本次整改引入的新发现

均为 `MINOR`，**无一阻塞消费者启动**。

**`NF-01`（MINOR）　`template_applied` 要求文档哈希改变，但文档真源没有模板字段，前后哈希的指称对象未声明**

[`audit-semantics.ts:88-98`](../../packages/project-contract/src/audit-semantics.ts#L88-L98) 要求 `template_applied` 必须 `hashesDiffer` 且 `affected_node_ids` 为空。但 `packages/document-model/schema/document.schema.json` 中**不存在任何 template 字段**（实测正则匹配为 `NO`），因此套用模板不可能改变文档哈希。同时 `before_sha256`/`after_sha256` 在 Schema 中没有声明指称对象，只有 `formal_version_approved` 被 [`bundle.ts:143`](../../packages/project-contract/src/bundle.ts#L143) 隐式绑定为文档哈希。结果是 `template_applied` 的实现者要么必须伪造一次哈希变化，要么必须让同一字段在不同 action 下指称不同对象。建议在 `PB-06` 开工前明确：或为 `template_applied` 改用「哈希相同」规则，或在 Schema 中显式声明哈希指称对象（如增加 `hash_subject: "document" | "project"`）。

**`NF-02`（MINOR）　敏感标识启发式同时存在误杀与漏放**

[`audit-semantics.ts:14-20`](../../packages/project-contract/src/audit-semantics.ts#L14-L20) 与 Schema 的 `(?!.{0,20}(?:key|secret|token))` 前瞻按**子串**匹配，实测：

```text
误杀：provider="keystone-ai" / "turnkey-labs"、model="monkey-7b" / "tokenizer-v2"   全部被拒
漏放：model="0123456789abcdef0123456789abcdef"、"aBcD3fGh1jKlMn0pQrStUvWx"          全部接受
```

即含关键词子串的正常厂商/模型名被挡住，而不含关键词的高熵密钥仍可通过。启发式在两个方向上都不可靠。建议改为依靠字符集 + 长度约束 + 文档明示「此字段禁止写入凭证」，或为误杀保留显式豁免路径；不要把安全保证建立在子串黑名单上（与 `G1-06` 首审 `B-01` 的教训同源）。

**`NF-03`（MINOR）　`actor: "system"` 的可用范围未在文档中写明**

穷举确认 `system` 实际只能执行 `source_linked` 一种 action，而 [`docs/project-contract.md:30`](../project-contract.md#L30) 只说「只允许 `user` 或有限的 `system` 行为」，未指明是哪一种。`PB-06` 的实现者需要靠读代码才能知道边界。建议在契约文档中显式列出 `system` 可执行的 action 集合。

**`NF-04`（MINOR，已有归属）　`PROJECT_INTEGRITY` 进一步过载**

该码现同时承载 decision 组合、时间戳、actor、哈希语义、path/role、compatibility readers 与敏感标识七类判定，仅靠 `path` 区分。这加重了首审 `m-05` 指出的诊断粒度问题；本轮未扩大错误模型是正确的范围克制，但 `G1-09` 的「断言稳定 issue code 与预期 JSON path」验收项必须覆盖本包这七类路径，否则断言强度不足。归属沿用 `G1-09`，无需新任务。

## 5. 未执行项与限制

1. **生成漂移的破坏性验证仍未执行**（需篡改 `src/generated/*.ts`，超出审计权限）。`check-generated.ts` 的重生成—全文比对逻辑经审读判定可靠，退出码 0 已复跑。
2. 范围外未审计（依首审任务书）：数据库、ZIP/文件 IO、真实路径穿越与真实文件哈希。本次仅确认 `PB-09`/`PB-11` 门禁未被削弱，且 `PB-11` 新增了 `m-01` 的显式归属。
3. `pnpm --filter @wenshu/web build:test` 与 `build:staging` 未执行（与 `pnpm build` 共用 `apps/web/dist`）；`pnpm dev` 未执行。
4. 跨包漂移的模拟只覆盖 `@wenshu/document-model`；`@wenshu/template-model` 的互锁按同一份代码路径（`validateCompatibility` 同时比对两者）推定成立，未单独做替身模块。
5. 供应链结论仍由 `G1-15` 签署；本次 lockfile 变更仅为新增两条本地 workspace 依赖，未引入新的外部依赖。

## 6. 复审汇总与最终结论

| 首审严重级别 | 首审数量 | 已关闭 | 合规延期 | 未关闭 |
|---|---:|---:|---:|---:|
| `BLOCKER` | 1 | 1 | 0 | **0** |
| `MAJOR` | 2 | 2 | 0 | **0** |
| `MINOR` | 5 | 3 | 2（`m-01`→`PB-11`、`m-05`→`G1-09`） | **0** |

本次新增：`MINOR` 4 项（`NF-01`～`NF-04`），`BLOCKER`/`MAJOR` **0** 项。

**结论：`CONDITIONAL PASS`　——　`G1-07` 可作为 `PB-05/06/07/08/11` 的前置**

判定依据：

- 首审的 1 项 `BLOCKER` 与 2 项 `MAJOR` 的**原始反例已逐条复跑并全部转为拒绝或安全行为**，无一项靠放宽断言、删测试或改口径关闭。`tsconfig.base.json` 零改动、手写 `any`/抑制指令计数为 0，确认严格度未被反向让步。
- 三项修复都选择了结构性方案而非点状封堵：`B-01` 从 Schema 层删除 `ai` 这个 actor 并把模型出处重构为「被裁决对象」的属性；`M-01` 用五类 action 的可执行组合规则替代原先的零约束；`M-02` 把互锁下沉到运行时而不是只加一条测试断言。因此本轮新写的探针——1,280 种责任组合穷举、`registerHooks` 上游版本替身、path/role 四向反转、日历边界日期——也一并被覆盖。
- 最有说服力的一项是 `M-02`：我在**不修改仓库任何文件**的前提下把上游常量替换为 `0.9.9`，已提交的合法 fixture 立即以 `PROJECT_INTEGRITY@/readers` 失败。这证明漂移门禁不是自比较的摆设，而是会真实阻断 `pnpm verify` 的活门禁。
- 两项延期都有明确任务归属并已写入路线图验收标准（`PB-11` 行新增了两类哈希的核验要求与「只信 manifest 不算通过」的停止条件；`G1-09` 沿用原有归属），符合「一般问题只有在明确绑定后续原子任务时才能条件通过」。

不判 `PASS` 而判 `CONDITIONAL PASS`，是因为本轮新增的 `NF-01`～`NF-03` 尚无任务归属。**放行条件**（均不阻塞消费者开工，但须在指定节点前闭环）：

1. `NF-01`：在 `PB-06` 开工前裁定 `template_applied` 的哈希语义（改为「哈希相同」或显式声明哈希指称对象），结论写入 `docs/project-contract.md`。这是唯一可能触发 Schema 修订的一项，越早裁定成本越低。
2. `NF-02`：把敏感标识的保证方式从子串黑名单改为字符集/长度约束加文档明示，或保留显式豁免路径；登记到 `G1-09` 或 `A-15`（安全专项）。
3. `NF-03`：在 `docs/project-contract.md` 中显式列出 `actor: "system"` 可执行的 action 集合。
4. `NF-04` 沿用 `G1-09` 归属，需确保其验收覆盖本包 `PROJECT_INTEGRITY` 的七类判定路径。

实施者可据本复审把 `G1-07` 的路线图状态更新为最终完成，并把上述 4 条放行条件登记到对应任务；`PB-05`、`PB-06`、`PB-07`、`PB-08`、`PB-11` 可以按各自 DoR 启动。

> 依 `AGENTS.md:55` 与 `CLAUDE.md`，本复审由未参与实施与修复的独立审计角色出具。`NF-01`～`NF-04` 同样不得由实施者自行关闭。
