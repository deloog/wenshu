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
