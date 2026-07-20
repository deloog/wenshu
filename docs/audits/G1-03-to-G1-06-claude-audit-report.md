# G1-03～G1-06 Claude 独立审计报告

> 状态：已完成　审计者：Claude（独立只读）　实施者：Codex　日期：2026-07-20
> 任务书：[G1-03-to-G1-06-claude-audit-task.md](G1-03-to-G1-06-claude-audit-task.md)

## 审计范围与方法

审计对象为 `a0a8194`、`02e05d9`、`870da85`、`9d444fc`、`65ee443`、`cab23e0` 六个实施提交及其在 `d380e1a` 上的最终状态，覆盖 `G1-03`、`G1-03C`、`G1-04`、`G1-05`、`G1-06`。

方法：

1. 依 `CLAUDE.md` 顺序通读 `CONSTITUTION.md`、`AGENTS.md`、`DEFINITION-OF-READY.md`、`docs/implementation-roadmap.md`，以及 `docs/configuration.md`、`docs/document-model.md`、`docs/template-dsl.md`、`docs/host-contract.md`、`docs/adr/0003-*.md`、`docs/testing-strategy.md`、`docs/threat-model.md`、`docs/technical-baseline.md`。
2. 逐文件审读全部手写 TypeScript、JSON Schema、fixture、生成脚本与 `tsconfig`，并按 `git show --stat` 核对每个提交的实际改动面。
3. 在锁定的 D 盘工具链下复跑 `pnpm install --frozen-lockfile` 与 `pnpm verify`。
4. **不接受"测试通过"作为结论**：另行在仓库外的 scratchpad 编写只读探针，针对每项被文档声明为已生效的安全保证构造反例。探针只 import 被审包，不写入仓库。

审计全程未修改任何生产代码、测试、Schema、配置、lockfile、路线图或既有证据；结束时 `git status --short` 为空。本报告是本次唯一写入仓库的文件。

**基线事实（非缺陷）**：`pnpm verify` 全绿，52/52 测试通过，分项计数与各契约文档自述完全一致（config 7/7、document 12/12、template 14/14、host 19/19）。手写代码中无 `any`、无 `@ts-ignore`/`@ts-expect-error`/`eslint-disable`。所有手写文件均远低于 300/400 与 300/500 行护栏（最大 222 行）。依赖树无 GPL/AGPL。以下发现全部是在"测试通过"之上另找反例得到的。

---

## 发现

### BLOCKER

#### B-01　Host 协议放行任意绝对路径，而文档与 ADR 将其反面陈述为已生效保证

- **严重级别**：`BLOCKER`（安全根基错误 + 验收虚假）
- **证据**：
  - [`packages/host-contract/schema/host.schema.json:90-97`](../../packages/host-contract/schema/host.schema.json#L90-L97)：`JsonObject` 为 `additionalProperties: true`，`HostRequest.input` 与 `HostSuccessResult.output` 均引用它，对值不施加任何约束。
  - [`packages/host-contract/src/index.ts:56-72`](../../packages/host-contract/src/index.ts#L56-L72)：唯一的补偿控制是 15 项固定**键名**黑名单 `forbiddenPlatformKeys`，只比对键名、从不检查值。
  - [`docs/host-contract.md:44`](../host-contract.md#L44)：以现在时声明"核心只使用……`grant_id`、资源 handle 和安全文件名，**不接收或提交任意绝对路径**"。
  - [`docs/adr/0003-v0-Host能力协议与平台隔离.md:17`](../adr/0003-v0-Host能力协议与平台隔离.md#L17)（决策 5）："核心不交换任意系统路径或平台对象"。
  - [`docs/threat-model.md:40`](../threat-model.md#L40)：把"参数 schema"列为"壳层越权"的既定缓解措施。
- **可复现方式**：对 `validateHostContract` 提交一条除 `input` 键名外与 `fixtures/invalid/raw-path.json` 完全同构的请求。实测结果：

  | `input` 键名 | 值 | 结果 |
  |---|---|---|
  | `path` / `filePath` | `C:/Windows/System32/config/SAM` | 拒绝 |
  | `savePath` / `outputPath` / `dirPath` / `fullPath` | `C:/Windows/System32/config/SAM` | **通过** |
  | `destination` / `target` / `location` / `handle` / `grant_id` | `C:/Windows/System32/config/SAM` | **通过** |

  即：把负向 fixture 的键名 `path` 改成 `savePath`，攻击载荷原样穿透。命名为 `grant_id` 的字段同样可以承载绝对路径——这恰好是文档点名作为安全替代品的字段。
- **影响**：宪法 11、`R-HOST` 与威胁模型第 40 行要求 Host 是平台高权限的唯一收口边界。当前 v0 契约把这条边界建立在一份可被同义词平凡绕过的键名黑名单上，而 `docs/host-contract.md` 与 ADR-0003 把它记载为**已经成立的保证**。`G1-06` 的下游消费者 `G1-09`、`PB-10`、`A-02/10P/10X` 会据此认为"路径不会穿透 Host 已由契约保证"，从而不再在各自实现中重复防护——这正是"验收虚假"导致下游返工与安全缺口的典型路径。缺少 payload Schema 本身在 `docs/host-contract.md:25` 已被披露并设了门禁（见 `N-03`），**本条阻断的不是缺失，而是把无效的补偿控制写成了有效保证**。
- **建议处理**：二选一，不要两者都不做。(a) 收紧契约：把 `JsonObject` 的 `additionalProperties` 由 `true` 改为受控形态，或在 `G1-06` 内先冻结 `grant_id`/handle 的正向格式（如 `^grant_[0-9a-f]{32}$`）并对全部字符串值做绝对路径/URL 形态的**正向**校验；(b) 收紧文档：把 `docs/host-contract.md:44-45` 与 ADR-0003 决策 5 改写为"v0 尚未提供路径穿透防护，键名预检仅为提示性；该保证由后续 payload Schema 任务提供"，并在路线图为该任务建立显式条目。无论选哪条，均需补一个以 `savePath` 为载荷的负向 fixture，使黑名单的实际覆盖面在测试中可见。

#### B-02　`document-model` 测试未纳入 typecheck，掩盖 3 处真实类型错误，使"零 any / strict"治理在该包失效

- **严重级别**：`BLOCKER`（验收虚假 + 类型严格度被实质降低）
- **证据**：
  - [`packages/document-model/tsconfig.json:8`](../../packages/document-model/tsconfig.json#L8)：`"include": ["src", "scripts"]` —— **缺少 `test`**。
  - 同类包对照：[`packages/template-model/tsconfig.json:8`](../../packages/template-model/tsconfig.json#L8) 与 [`packages/host-contract/tsconfig.json:8`](../../packages/host-contract/tsconfig.json#L8) 均为 `["scripts", "src", "test"]`；[`packages/config/tsconfig.json:7`](../../packages/config/tsconfig.json#L7) 为 `["src", "test"]`。四个包中只有 `document-model` 漏掉测试目录。
  - [`docs/document-model.md:62`](../document-model.md#L62)：冻结证据自述"全项目严格类型检查和生产构建通过"。
- **可复现方式**：在 `packages/document-model` 下用该项目自身的 strict 参数直接检查被排除的测试文件：

  ```powershell
  D:\wenshu\node_modules\.bin\tsc.CMD --ignoreConfig --noEmit --strict `
    --noPropertyAccessFromIndexSignature --noUncheckedIndexedAccess --exactOptionalPropertyTypes `
    --verbatimModuleSyntax --allowImportingTsExtensions --resolveJsonModule `
    --module esnext --moduleResolution bundler --target es2023 --lib es2023,dom,dom.iterable `
    --types node test/document.contract.test.ts
  ```

  输出（exit=2）：

  ```text
  test/document.contract.test.ts(44,48): error TS4111: Property 'expectedIssue' comes from an index signature, so it must be accessed with ['expectedIssue'].
  test/document.contract.test.ts(47,37): error TS4111: ...
  test/document.contract.test.ts(48,22): error TS4111: ...
  ```

  兄弟包中语义完全相同的代码写作 `fixture["expectedIssue"]`（[`template.contract.test.ts:51-55`](../../packages/template-model/test/template.contract.test.ts#L51-L55)、[`host.contract.test.ts:47-51`](../../packages/host-contract/test/host.contract.test.ts#L47-L51)），正是因为那两个包**确实**被检查。`document-model` 写成 `fixture.expectedIssue` 而无人发现，是该目录从未进入 `tsc` 的直接证据。
- **影响**：违反宪法 18（"禁止……降类型严格度"）与 `AGENTS.md:64-65`（手写测试代码同样禁止 `any`、必须从 `unknown` 收窄）。`870da85` 这个提交的全部目的就是把"禁止 `any`"写入治理，而该治理对 `document-model` 的整个测试目录不生效——`pnpm typecheck` 与 `pnpm verify` 因此对 `G1-04` 给出了**假阳性**的严格类型结论，`docs/document-model.md:62` 的验收自述随之失真。更关键的是时序：`G1-07` 是下一个任务，会按同一模板再建一个契约包；`G1-09` 才建立体量与漂移护栏。若不先修，这个 `tsconfig` 模板会被复制进 `G1-07`，并在 `G1-09` 建立护栏时被当作既成事实。
- **建议处理**：把 `test` 加入 `packages/document-model/tsconfig.json` 的 `include`，修复因此暴露的 3 处 TS4111，并复跑 `pnpm typecheck`。同时建议在 `G1-09` 的验收标准中增加一条反向探针：断言每个工作区包的 `tsc` 文件集合覆盖该包全部手写 `.ts`（含 `test`、`scripts` 与根级配置），否则失败——`apps/web` 目前同样存在此问题（见 `M-04`）。

---

### MAJOR

#### M-01　文档模型 `Asset.path` 接受 Windows 绝对路径与远程 URL，与"只允许相对安全路径"不符

- **严重级别**：`MAJOR`
- **证据**：[`packages/document-model/schema/document.schema.json:241-246`](../../packages/document-model/schema/document.schema.json#L241-L246) 的 `pattern` 为 `^(?!/)(?!.*(?:^|/)\.\.(?:/|$))[^\u0000]+$`（其中 `\\u0000` 是复审时对原报告中一个实际 NUL 字节的可读转义；Schema 里该字符类的 JSON 源文本逐字为 `[^\\\\\\u0000]`，仅排除反斜杠与 NUL 两个字符）——只排除了前导 `/`、`..` 段、反斜杠与 NUL；[`docs/document-model.md:22`](../document-model.md#L22) 声明"资源只允许**相对安全路径**"。
- **可复现方式**：以 `fixtures/invalid/unsafe-asset-path.json` 为模板替换 `assets[0].path` 后调用 `validateDocument`：

  | `path` | 结果 |
  |---|---|
  | `../outside.png` | 拒绝（现有 fixture 覆盖） |
  | `//evil.example/share/x.png` | 拒绝 |
  | `C:/Windows/System32/config/SAM` | **通过** |
  | `c:/Users/deloo/.ssh/id_rsa` | **通过** |
  | `https://evil.example/exfil.png` | **通过** |
  | `%2e%2e/outside.png` | **通过** |
  | `.` | **通过** |
- **影响**：唯一的负向 fixture 只覆盖 POSIX 风格的 `../`，而项目主环境是 Windows（`R-COMPAT`、`G1-14W`）。盘符绝对路径与 `https://` URL 都能进入被视为"已校验真源"的深冻结文档对象。威胁模型第 28/32 行把"规范化路径""校验授权根目录"列为路径穿越的缓解措施，第 47 行要求"第三方模板无网络……能力"；文档资源清单当前可承载远程 URL，等于给后续渲染器（`PA-03`/`PA-10`）留下一个默认可信的外链取值点。`PB-11` 的知识包导入/导出会直接消费该清单。
- **建议处理**：改为**正向**白名单，例如 `^(?!\.)[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)*\.(?:png|jpe?g|svg)$`，或至少显式排除 `^[A-Za-z]:` 与 `^[a-z][a-z0-9+.-]*:` 两类前缀。为盘符绝对路径与 `https://` 各补一个负向 fixture，避免负向覆盖再次只反映单一平台的习惯。

#### M-02　文档与 Host 校验器缺少深度/规模预算，深层嵌套输入抛出未捕获 `RangeError`

- **严重级别**：`MAJOR`
- **证据**：
  - [`packages/document-model/src/index.ts:89-115`](../../packages/document-model/src/index.ts#L89-L115) `visitBlock` 递归、[`:130-138`](../../packages/document-model/src/index.ts#L130-L138) `deepFreeze` 递归、[`:156`](../../packages/document-model/src/index.ts#L156) `structuredClone`，均无深度上限；`document.schema.json` 的 `Section.children` 无嵌套深度约束，`blocks`/`assets` 无 `maxItems`。
  - [`packages/host-contract/src/index.ts:88-136`](../../packages/host-contract/src/index.ts#L88-L136) `inspectPlatformLeak` 虽为迭代式，但**没有** `template-model` 那样的预算；[`:194-202`](../../packages/host-contract/src/index.ts#L194-L202) `deepFreeze` 仍是递归。
  - 反例对照：[`packages/template-model/src/index.ts:33-34`](../../packages/template-model/src/index.ts#L33-L34) 定义了 `MAX_INPUT_DEPTH = 20` 与 `MAX_INPUT_NODES = 5_000`，[`:131-137`](../../packages/template-model/src/index.ts#L131-L137) 予以执行，并有 `TEMPLATE_BUDGET_EXCEEDED` 稳定码。三个包对同一威胁给出了不一致的答案。
- **可复现方式**：构造 20,000 层嵌套 `section` 的文档调用 `validateDocument`，以及 20,000 层嵌套对象作为 `HostRequest.input` 调用 `validateHostContract`：

  ```text
  document depth=50     -> ACCEPTED (ok:true)
  document depth=20000  -> THREW RangeError: Maximum call stack size exceeded
  host input depth=50    -> ACCEPTED (ok:true)
  host input depth=20000 -> THREW RangeError: Maximum call stack size exceeded
  ```

  广度方向亦无上限：200,000 个顶层 `blocks` 在 903 ms 内被判定为 `ok:true`。
- **影响**：两个公开入口签名均为 `(input: unknown)`，其契约是"返回稳定 issue code"，[`docs/document-model.md:51`](../document-model.md#L51) 明确写"公共验证入口接收 `unknown`……失败只返回稳定 issue code 与 JSON 路径"。实际会抛出未建模的 `RangeError`，调用方无法与验证失败区分，也拿不到问题码。威胁模型第 28 行把"资源耗尽"列为需缓解项。`PA-01`（Markdown→文档）、`PB-11`（知识包重导入）与 `A-02D`（docx 导入，明确要处理"恶意/损坏/超限文件"）都会把外部输入直接喂给这些入口。
- **建议处理**：把 `template-model` 已有的预算模式提取为三包共用的单一实现（同时解决 `m-04`），为文档与 Host 补 `DOCUMENT_BUDGET_EXCEEDED` / `HOST_BUDGET_EXCEEDED` 稳定码，并把 `visitBlock`/`deepFreeze` 改为迭代式或在预算内递归。各补一个深层嵌套负向 fixture。

#### M-03　"getter 不会被执行"的安全保证对原型链上的访问器不成立

- **严重级别**：`MAJOR`
- **证据**：[`packages/template-model/src/index.ts:150-158`](../../packages/template-model/src/index.ts#L150-L158) 与 [`packages/host-contract/src/index.ts:120-130`](../../packages/host-contract/src/index.ts#L120-L130) 使用 `Object.getOwnPropertyDescriptors`，**只检查自有属性**；随后 [`template-model/src/index.ts:186`](../../packages/template-model/src/index.ts#L186) 的 `validateShape(input)` 与 [`:192`](../../packages/template-model/src/index.ts#L192) 的 `structuredClone(input)` 会正常读取属性。[`docs/template-dsl.md:33-35`](../template-dsl.md#L33-L35) 声明"公共验证入口在普通 Schema 解释前扫描并拒绝：函数值、getter/setter……"；[`docs/host-contract.md:45`](../host-contract.md#L45) 同。现有测试 [`template.contract.test.ts:97-114`](../../packages/template-model/test/template.contract.test.ts#L97-L114) 只覆盖**自有** getter。
- **可复现方式**：

  ```ts
  let runs = 0;
  const proto = { get dsl_version(): string { runs += 1; return "0.1.0"; } };
  validateTemplate(Object.create(proto));
  // runs === 3   ——— 声明为 0
  ```

  探针实测 `runs = 3`（结果仍为 `ok:false`，但 getter 已被执行 3 次）。
- **影响**：这是测试与实现共享同一错误假设的典型案例——测试只构造自有 getter，因此永远无法发现继承访问器这条路径。安全含义取决于调用方：对 `JSON.parse` 产物无影响，但 `AGENTS.md:64` 要求不可信输入从 `unknown` 起收窄，而 `PB-04`（语义工具→事务编译器，需处理 prompt injection fixture）与 `A-07P`（provider 适配器）会把**进程内构造的对象**交给这些校验器，此时"扫描期间不触发任何用户代码"是被明文承诺的性质。
- **建议处理**：在预检起点拒绝原型非 `null`/`Object.prototype` 的对象，或改用 `Reflect.ownKeys` + 沿原型链遍历检查访问器；或者把文档表述限定为"自有属性上的 getter/setter"。补一个继承访问器的负向测试。

#### M-04　`app-config.schema.json` 不参与任何运行时校验，且其枚举漂移无法被测试发现；`vite.config.ts` 未纳入 typecheck

- **严重级别**：`MAJOR`
- **证据**：
  - [`packages/config/src/index.ts`](../../packages/config/src/index.ts) 全文未 import `app-config.schema.json`；四环境枚举在 [`:1-8`](../../packages/config/src/index.ts#L1-L8) 手工重复了一遍 Schema 的内容。`docs/configuration.md:12` 却把它列为"机器可读 schema"权威契约之一。
  - [`packages/config/test/config.contract.test.ts:127-129`](../../packages/config/test/config.contract.test.ts#L127-L129) 只断言 `required`、`WENSHU_ENV.enum` 与 `additionalProperties` 三项；**从未读取 `WENSHU_LOG_LEVEL` 的 `enum`**。因此 Schema 的 log level 白名单与 `CONFIG_LOG_LEVELS` 之间的漂移不会被任何检查捕获。
  - [`apps/web/tsconfig.json:3`](../../apps/web/tsconfig.json#L3) `"include": ["src"]`；实测 `tsc -p tsconfig.json --listFiles` 在仓库内只覆盖 `apps/web/src/main.ts` 一个文件。而 `apps/web/vite.config.ts` 是手写 TypeScript，且被 `docs/configuration.md:14` 指定为"Vite 启动门"——即 `G1-03C` 快速失败机制的实际承载者。
- **可复现方式**：通读上述文件；`tsc -p apps/web/tsconfig.json --listFiles | grep wenshu` 只返回 `main.ts`。
- **影响**：`G1-03C` 的验收依据是"配置 schema + 解析器 + 契约测试"三者互锁，实际只有解析器与测试互锁，Schema 是装饰性的第二真源。宪法 9 要求真源与派生分离、单一事实来源；此处是两份手工同步的事实来源，且同步只被部分断言。同时，`G1-03C` 最核心的产物（启动门）不受严格类型检查保护，与 `B-02` 同源。
- **建议处理**：让 `parseRuntimeConfig` 用 Ajv 直接消费 `app-config.schema.json`（三个契约包已建立该模式），或从 Schema 生成枚举常量并纳入漂移检查；在测试中补齐 `WENSHU_LOG_LEVEL.enum` 与 `CONFIG_LOG_LEVELS` 的双向断言。把 `vite.config.ts` 纳入 `apps/web` 的 typecheck 文件集。

#### M-05　Host 契约无法表达"唯一终态"、错误码归属与 `support_status` 一致性，而 ADR 与文档将其列为已冻结决策

- **严重级别**：`MAJOR`
- **证据**：
  - [`docs/adr/0003-v0-Host能力协议与平台隔离.md:16`](../adr/0003-v0-Host能力协议与平台隔离.md#L16)（决策 4）："取消、进度和**唯一终态**分离"；[`docs/host-contract.md:35`](../host-contract.md#L35)："每个请求只能产生一个终态"、[`:36`](../host-contract.md#L36)："进度采用**递增** `sequence`"。
  - [`packages/host-contract/src/index.ts:177-192`](../../packages/host-contract/src/index.ts#L177-L192) `validateSemantics` 是**逐条消息、无状态**的：仅检查 `completed > total`、`failure` 不得用 `HOST_CANCELLED`、以及注册表自洽。契约层不存在会话/请求状态机，`sequence` 单调性、终态唯一性均无处校验，也没有为其定义稳定问题码。
  - 同样地，`HostFailureResult` 与 `HostSuccessResult` 不携带注册表上下文，因此能力声明的 `error_codes`、`support_status` 对终态消息没有约束力。
- **可复现方式**：

  ```text
  failure 携带 platform.info.read 未声明的 HOST_QUOTA_EXCEEDED  -> ACCEPTED
  对 browser-registry 中标为 unsupported 的 project.save.atomic 返回 success -> ACCEPTED
  ```

  （`error_codes` 与 `support_status` 取自 `fixtures/valid/browser-registry.json`。）
- **影响**：任务书强制检查第 6 项要求判断唯一终态、错误与降级是否"足够明确"。当前 v0 冻结的是**消息形状**，但 ADR 与契约文档描述的是**协议行为**，两者被同一份文档并列为"已冻结"。`G1-09`、`PB-10`、`PA-14E/14H` 的实现者会以为这些不变量已由契约保证并可被 `contracts:check` 捕获，实际上没有任何测试能发现"同一 `request_id` 收到两个终态"或"返回未声明错误码"。这会在真实 Host 实现阶段形成返工与不可测试的行为分歧。
- **建议处理**：明确二选一并在文档中写死：(a) 在 `G1-06` 范围内补一个有状态的会话校验器（输入为按 `request_id` 分组的消息序列），配套 `HOST_TERMINAL_STATE_DUPLICATE`、`HOST_SEQUENCE_REGRESSION`、`HOST_ERROR_CODE_UNDECLARED` 等稳定码与生命周期 fixture；或 (b) 把 ADR-0003 决策 4 与 `docs/host-contract.md:35-36` 改写为"v0 只冻结消息形状；序列与终态唯一性由 `G1-09`/`PB-10` 的实现与集成测试保证"，并在路线图建立对应条目。当前"既声明又不可验证"的中间状态不可接受。

---

### MINOR

#### m-01　模板负向 fixture 不具独立意义：全部会被 Schema 单独拒绝

- **严重级别**：`MINOR`
- **证据**：四个负向 fixture（[`capability.json`](../../packages/template-model/fixtures/invalid/capability.json)、[`file-path.json`](../../packages/template-model/fixtures/invalid/file-path.json)、[`network-url.json`](../../packages/template-model/fixtures/invalid/network-url.json)、[`script.json`](../../packages/template-model/fixtures/invalid/script.json)）都是仅含 1～2 个字段的对象，缺失 `template.schema.json` 要求的全部 12 个必填顶层字段。
- **可复现方式**：即使完全删除 `inspectSecurity`，这四个 fixture 仍会以 `TEMPLATE_SCHEMA` 失败——测试 [`template.contract.test.ts:59`](../../packages/template-model/test/template.contract.test.ts#L59) 断言的是 `issues.some(code === expectedIssue)`，若安全预检消失则该断言转为失败，但**没有任何 fixture 证明预检能拦截 Schema 拦不住的东西**（对 JSON 输入而言，由于 Schema 处处 `additionalProperties: false`，这类输入并不存在）。
- **影响**：`docs/template-dsl.md:58` 把"4 个恶意 JSON fixture"列为安全边界证据，实际它们证明的是 Schema 封闭性而非预检有效性。安全预检对 JSON 的真实增量为零，其唯一独立价值在于函数值与 getter（已由 `M-03` 指出覆盖不全）。
- **建议处理**：把负向 fixture 改为"在完全合法的 `minimal.json` 基础上追加一个禁止字段"，使 Schema 与预检的职责分离在测试中可见；或在文档中如实说明预检对 JSON 输入是纵深防御冗余。

#### m-02　`*_SCHEMA` 问题码无区分度，且测试从不断言 `path`

- **严重级别**：`MINOR`
- **证据**：`DOCUMENT_SCHEMA`（[`document-model/src/index.ts:142-147`](../../packages/document-model/src/index.ts#L142-L147)）、`TEMPLATE_SCHEMA`、`HOST_SCHEMA` 把 Ajv 的全部错误压平为单一码；三个包的负向 fixture 测试均只断言 `issues.some((issue) => issue.code === expectedIssue)`，从未断言 `issue.path`。
- **影响**：`fixtures/invalid/future-version.json` 与 `unsafe-asset-path.json` 的 `expectedIssue` 都是 `DOCUMENT_SCHEMA`，断言强度等价于"发生了某种 Schema 错误"。本次审计已逐一核对这两个 fixture 确实只含单一违规（因此当前仍具鉴别力），但该性质是偶然的、无测试保护的：日后向 fixture 引入第二处违规不会有任何提示。
- **建议处理**：在负向 fixture 中增加 `expectedPath` 并一并断言。

#### m-03　`docs/configuration.md` 状态与路线图台账冲突，且引用了已重命名的测试文件

- **严重级别**：`MINOR`
- **证据**：[`docs/configuration.md:5`](../configuration.md#L5) 写"状态：**已完成**"，而 [`docs/implementation-roadmap.md:79`](../implementation-roadmap.md#L79) 与 [`docs/文枢-前置准备索引.md:62`](../文枢-前置准备索引.md#L62) 均为"🟠 已实现待独立审计"。另 [`docs/configuration.md:15`](../configuration.md#L15) 指向 `packages/config/test/config.contract.test.mjs`，该文件已在 `9d444fc` 中重命名为 `config.contract.test.ts`。
- **影响**：违反 `AGENTS.md:56`（"独立审计 `PASS` ……后才可标记最终完成"）。路线图与索引是对的，只有专项文档抢跑；同时 `docs/configuration.md` 第 1 节自称"权威契约"清单却含失效路径。
- **建议处理**：把状态改为"已实现待独立审计"，并修正文件名。

#### m-04　`deepFreeze` 等安全相关代码在三个包中逐字重复

- **严重级别**：`MINOR`
- **证据**：`deepFreeze` 在 [`document-model/src/index.ts:130-138`](../../packages/document-model/src/index.ts#L130-L138)、[`template-model/src/index.ts:171-179`](../../packages/template-model/src/index.ts#L171-L179)、[`host-contract/src/index.ts:194-202`](../../packages/host-contract/src/index.ts#L194-L202) 三处完全相同；`escapePathSegment` 与 `inspectSecurity`/`inspectPlatformLeak` 的遍历骨架亦为近似副本，但预算逻辑只存在于其中一份（见 `M-02`）。
- **影响**：`M-02` 与 `M-03` 都是"一处有防护、另两处没有"的直接后果，修复也必须改三遍。`AGENTS.md:68` 禁止 `utils` 大杂烩，但按职责提取一个 `contract-runtime` 包（不可信输入遍历、预算、深冻结）属于正当的领域内聚，不是机械切片。
- **建议处理**：在 `G1-07` 引入第四个契约包之前提取共享实现，避免复制第四份。

#### m-05　文档 `language` 模式拒绝部分合法 BCP 47 标签

- **严重级别**：`MINOR`
- **证据**：[`document.schema.json:22-25`](../../packages/document-model/schema/document.schema.json#L22-L25)；`docs/document-model.md:18` 称之为"BCP 47 风格语言标签"。实测：

  ```text
  zh-CN / zh-Hans-CN / en / en-US / zh-Hant-HK / es-419 / sr-Latn-RS  -> 接受
  de-CH-1901 / en-GB-oed / zh-cmn-Hans-CN / en-x-custom              -> 拒绝
  ```
- **影响**：属于合法输入被误拒。首战范围（中文报告）不受影响，`docs/document-model.md` 用词"BCP 47 风格"也留有余地，故不阻塞。
- **建议处理**：或在文档中写明"BCP 47 的受控子集：language[-Script][-Region]"，或放宽至含 variant/extension 的形式。

#### m-06　模板键名黑名单会误伤合理的 v1 字段，形成过早锁定

- **严重级别**：`MINOR`
- **证据**：[`template-model/src/index.ts:52-83`](../../packages/template-model/src/index.ts#L52-L83) 无条件拒绝 `path`、`capability`、`url`、`file`、`glob` 等键名，且早于 Schema 判定。实测 `{path:"x"}`→`TEMPLATE_FILE_ACCESS_FORBIDDEN`、`{capability:"x"}`→`TEMPLATE_CAPABILITY_FORBIDDEN`。
- **影响**：模板 DSL 未来若需要表达 SVG `path` 数据、页面 `capability` 协商或图标资源引用，将无法使用这些自然命名，只能绕道。`A-04T` 要新增两套模板，`PA-02/PA-04` 要扩展 token 集合。这是把"字段命名"而非"字段语义"冻结进安全边界的副作用。
- **建议处理**：由于 Schema 已处处 `additionalProperties: false`，键名黑名单可降级为"Schema 通过后对未知键的告警"，或明确记录为已知的命名约束以免日后被当作缺陷。

---

### NOTE（已核验事实与后续阶段提醒，不计缺陷）

- **N-01**　依赖树无 GPL/AGPL，宪法 20 的硬禁止成立。但 35 个已安装包中有 `lightningcss@1.32.0`（**MPL-2.0**，经 `vite` 传递引入）与 `argparse@2.0.1`（**Python-2.0**，经 `json-schema-to-typescript`→`js-yaml` 传递引入），二者均在"MIT/Apache-2.0/BSD 已批准许可"之外，需要 `G1-15` 给出显式例外结论。其余为 MIT×27、Apache-2.0×2、BSD-3-Clause×2、ISC×1。当前不构成阻断。
- **N-02**　关于任务书强制检查第 6 项"只登记 Schema ID 而尚无具体 payload Schema 是否构成 `G1-06` 阻断"：**其本身不构成阻断**。[`docs/host-contract.md:25`](../host-contract.md#L25) 已明文披露该缺口并设了门禁（"能力实现前必须登记并验证该 ID 指向的具体参数/返回 Schema；没有具体 Schema 时不得标记为生产 `supported`"），ADR-0003 决策 3 同；路线图 `G1-06` 范围也写明"schema/类型；浏览器/Electron/ArkWeb 实现不在本任务"。这是有意的、被披露的延后。**真正的阻断是 `B-01`**：在缺口存在期间，文档把一个可被平凡绕过的键名黑名单陈述为已生效的路径隔离保证。
- **N-03**　`fixtures/valid/browser-registry.json` 的表述是克制的：`host_kind: "browser"`、`host_version: "fixture-1.0"`，18 项能力中 10 项为 `unsupported`、7 项 `degraded`、仅 `platform.info.read` 为 `supported`。`docs/host-contract.md:47` 与 ADR-0003 决策 6 明确禁止用它冒充真实平台实现。未发现把浏览器 fixture 描述成真实平台能力证明的情况。
- **N-04**　生成漂移机制经代码审读判定为可靠：[`check-generated.ts`](../../packages/document-model/scripts/check-generated.ts) 由 Schema 重新生成后做全文串比较，任一侧被手改都会失败，且额外做 `any` 关键字扫描；`generate:check` 已接入 `contracts:check`→`verify`。**未执行**人为篡改生成文件的破坏性验证（会修改仓库文件，超出审计权限），故各契约文档中"故意修改生成文件后漂移检查按预期失败、重新生成后恢复"的表述本次按未复核处理。
- **N-05**　`render-types.ts:29` 的 `moduleValue.compileFromFile as CompileFromFile` 是第三方边界上的结构断言。它先做了 `typeof === "function"` 守卫再断言为具名函数类型，未使用 `any`，符合 `AGENTS.md:65` 的"在适配边界收窄"；但签名本身未被校验。属可接受写法，记录备查。
- **N-06**　体量护栏（宪法 19）满足：最大手写生产文件 `host-contract/src/index.ts` 222 行，最大手写测试 `host.contract.test.ts` 163 行，均未触及 300 行预警线。
- **N-07**　范围合规：逐一核对六个提交的 `git show --stat`，未发现越出路线图 `G1-03/03C/04/05/06` 声明范围的改动；未出现编辑器、渲染器、数据库或平台实现代码。路线图台账 `docs/implementation-roadmap.md:78-82` 与 `docs/文枢-前置准备索引.md:62` 均如实标注"已实现待独立审计"（`m-03` 所述 `configuration.md` 除外）。`.gitignore` 覆盖 `.env`、`.env.*`（放行 `.env.example`）、`*.key`、`tmp/`；仓库内未发现真实密钥或用户数据。
- **N-08**　`G1-03C` 的四环境差异当前仅体现为 `logLevel`，且 `test` 与 `production` 同为 `warn`（[`config/src/index.ts:39-44`](../../packages/config/src/index.ts#L39-L44)）。这与 `G1-03C` 的最小范围一致，不是缺陷；但四环境的"显式基线"目前实质由 2 个不同取值承载，后续增字段时需确认分层仍然成立。

---

## 验证命令与结果

在 PowerShell 中按任务书使用项目锁定的 D 盘环境（`node v24.17.0`、`pnpm 11.15.1`）：

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store` | 通过（`Already up to date`，6 个工作区项目，474 ms） |
| `pnpm run verify` | **通过**：config 7/7、document-model 12/12、template-model 14/14、host-contract 19/19，合计 52/52；`generate:check` ×3 无漂移；`typecheck` 5/5 包 Done；`vite build --mode production` 成功 |
| `git status --short`（审计前 / 后） | 两次均为空 |
| `git show --stat` × 7（`a0a8194`/`02e05d9`/`870da85`/`9d444fc`/`65ee443`/`cab23e0`/`d380e1a`） | 已逐一核对改动面 |
| `tsc --ignoreConfig …… test/document.contract.test.ts` | **失败，exit=2**，3 处 TS4111 —— `B-02` 证据 |
| `tsc -p apps/web/tsconfig.json --listFiles` | 仓库内仅覆盖 `src/main.ts` —— `M-04` 证据 |
| 只读探针 `probe.ts` / `probe2.ts`（scratchpad，仓库外） | 产出 `B-01`、`M-01`、`M-02`、`M-03`、`M-05`、`m-06`、`m-05` 的反例 |
| 依赖许可证枚举（`node_modules/.pnpm` 逐包 `package.json`） | 35 包：MIT 27、Apache-2.0 2、BSD-3-Clause 2、MPL-2.0 2、ISC 1、Python-2.0 1 —— `N-01` 证据 |

探针脚本位于会话 scratchpad，未写入仓库；其内容已在对应发现中以可复现摘要形式给出。

## 未执行项与限制

1. **生成漂移的破坏性验证未执行**：需要实际篡改 `src/generated/*.ts`，超出审计者写权限。仅按代码审读判定机制可靠（`N-04`）。
2. **`pnpm --filter @wenshu/web build:test` 与 `build:staging` 未执行**：二者与 `pnpm build` 共用 `apps/web/dist` 输出目录（`docs/configuration.md:61`），执行会覆盖 `verify` 刚产生的生成物。`docs/configuration.md:68` 中"test、staging、production 均通过"一项本次按未复核处理。
3. **`pnpm dev` 未执行**：需启动长驻服务与端口，且 `docs/configuration.md:68` 的 HTTP 200 证据不影响本次契约结论。
4. **范围外未审计**（依任务书第 2 节）：DevEco 安装质量、WPS 人工基线、产品功能、数据库、真实 Electron/ArkWeb 实现。未发现当前代码虚假声称已证明这些能力。
5. **供应链结论不替代 `G1-15`**：`N-01` 仅为当前阻断风险提示，未做 SBOM、漏洞扫描或传递依赖来源核验。
6. **`Ajv` 与 `json-schema-to-typescript` 的内部正确性未独立验证**，按锁定版本的既有信誉采信。

## 汇总与最终结论

| 严重级别 | 数量 | 编号 |
|---|---:|---|
| `BLOCKER` | 2 | `B-01`、`B-02` |
| `MAJOR` | 5 | `M-01`～`M-05` |
| `MINOR` | 6 | `m-01`～`m-06` |
| `NOTE` | 8 | `N-01`～`N-08` |

**结论：`FAIL`**

存在 2 项 `BLOCKER` 与 5 项 `MAJOR`，**禁止进入 `G1-07`**。

判定要点：本次实施的工程质量整体是扎实的——契约以 Schema 为真源、类型由生成保证、诊断脱敏、体量与许可证合规、路线图台账如实标注待审。`pnpm verify` 52/52 全绿属实。阻断不来自"做得不够多"，而来自两处**声明强于实现**：

- `B-01`／`M-05`：`docs/host-contract.md` 与 ADR-0003 把"任意绝对路径不会穿透 Host""每个请求只能产生一个终态"写成已冻结的生效保证，而 v0 契约既拦不住换个键名的绝对路径，也没有任何机制能校验终态唯一性。下游 `G1-09`、`PB-10`、`PA-14E/14H` 会据此免除自身防护——这正是宪法 21"没有证据就没有完成"与 18"可信失败优先于虚假通过"要防范的情形。
- `B-02`：`870da85` 刚把"禁止 `any`、strict 不得绕过"写入治理，而 `document-model` 的整个测试目录从未进入 `tsc`，其中已积压 3 处真实类型错误。`G1-07` 是紧接着的下一个任务，会复制同一套包模板；此缺陷必须在复制发生前修掉。

`M-01`～`M-04` 同属"契约根基在下游被当作已验证前提"一类，按任务书判据"很可能造成下游返工、错误兼容或测试失真"，原则上应一并修复后再进入 `G1-07`。

**关闭路径**：由 Codex 修复 `B-01`、`B-02` 与 `M-01`～`M-05`（`MINOR` 可与之合并处理或转入后续任务），补齐各条建议的负向 fixture，复跑 `pnpm verify`，然后由 Claude 依本报告逐项复审并签署关闭。审计者不提供也不应用补丁。

> 依 `AGENTS.md:55` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具；实施者不得自行关闭上述发现。

---
---

# 复审（2026-07-20）：`ac6d4df..ce70ddc`

> 复审者：Claude（独立只读）　实施者：Codex　任务书：[G1-03-to-G1-06-claude-reaudit-task.md](G1-03-to-G1-06-claude-reaudit-task.md)
>
> **本章节的结论取代上文首审的 `FAIL`。** 上文首审记录原样保留，不得改写；仅按复审任务书第 23 行授权，把首审 `M-01` 证据行中的 1 个实际 NUL 字节替换为可读文本 `\u0000`（已核验：替换前 1 个、替换后 0 个，正则语义未变）。

## 1. 复审范围与方法

范围 `ac6d4df..ce70ddc`（`ac6d4df` 仅归档首审报告，实质变更全部在 `ce70ddc` "fix: remediate Claude G1 contract audit"，43 文件 +1186/-370）。输入为首审报告的发现清单与 [整改记录](G1-03-to-G1-06-remediation.md)。

方法与首审一致，且**不以整改记录的自述、也不以 69/69 测试全绿为结论**：

1. 逐文件审读 `ce70ddc` 的全部改动，重点是新增的 `packages/contract-runtime`、`packages/host-contract/src/{contract,session}.ts` 与 Schema/文档改写。
2. 在仓库外 scratchpad 重写探针，**逐条复跑首审的原始反例**，并按复审任务书第 9 节补充 6 类强制反测。
3. 用 `tsc --listFiles` 直接枚举每个包实际进入严格检查的文件集合，而不采信 `pnpm typecheck` 的绿色输出。
4. 复跑冻结安装与 `pnpm verify`。

复审全程未修改代码、测试、Schema、配置、lockfile、整改记录、路线图或任何其他文档；唯一写入的文件是本报告。

## 2. 复跑证据

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store` | 通过（7 个工作区项目，较首审新增 `@wenshu/contract-runtime`） |
| `pnpm run verify` | **通过**：config 7/7、contract-runtime 4/4、document-model 15/15、template-model 15/15、host-contract 28/28，合计 **69/69**；`generate:check` ×3 无漂移；6/6 包 typecheck Done；production build 成功 |
| `tsc -p tsconfig.json --listFiles` ×6 包 | 见 §3 的 `B-02` 条目 |
| 只读探针 `reprobe.ts` / `probe3.ts` | 见下 |
| `git status --short` | 复审开始时为空；结束时仅本报告一处修改 |

## 3. 首审发现逐项判定

### BLOCKER

**`B-01`　Host 协议放行任意绝对路径 —— 已关闭 ✅**

修复方式经核验是**结构性**的而非补丁式：[`contract-runtime/src/index.ts:70-80`](../../packages/contract-runtime/src/index.ts#L70-L80) 新增 `classifyString` 钩子，使遍历器对**每一个字符串值**求值；[`host-contract/src/contract.ts:91-109`](../../packages/host-contract/src/contract.ts#L91-L109) 的 `isUnsafePathValue` 按值拒绝盘符、POSIX/UNC、`file:` 与 `..`，并先做最多 8 轮 URI 解码。安全性因此不再依赖键名。

复跑首审原始反例——12 种路径形态 × 10 个替代键名（含首审泄漏的 `savePath`/`outputPath`/`dirPath`/`fullPath`/`destination`/`target`/`location`/`handle`/`grant_id`，外加对照键 `x`）：

```text
win drive fwd / win drive back / win drive lower   all keys rejected
posix abs / UNC / UNC fwd / file: URL              all keys rejected
traversal posix / traversal win                    all keys rejected
pct-encoded / double-encoded / drive-relative      all keys rejected
TOTAL key/payload leaks                            0        （首审：9 个键泄漏）
nested/array position                              rejected
legit relative value still allowed                 accepted（无误杀）
```

首审列出的两条整改路径中，实施者选择了 (a) 收紧契约**并**同步修正了文档：`docs/host-contract.md:44` 与 ADR-0003 决策 5 已改为按值描述，并保留"具体 payload Schema 仍须在能力实现前冻结"的门禁。新增负向 fixture [`disguised-absolute-path.json`](../../packages/host-contract/fixtures/invalid/disguised-absolute-path.json) 正是首审指出的 `savePath` 载荷。**发现关闭**（残留见 `NF-02`）。

**`B-02`　`document-model` 测试未纳入 typecheck —— 已关闭 ✅**

不采信 `typecheck` 的绿色输出，改用 `tsc --listFiles` 枚举实际检查的文件集合：

| 包 | `src` | `test` | `scripts` | 其他 |
|---|:--:|:--:|:--:|---|
| `config` | ✅ | ✅ | — | `app-config.schema.json` |
| `contract-runtime` | ✅ | ✅ | — | |
| `document-model` | ✅ | **✅** | ✅ | schema、generated |
| `template-model` | ✅ | ✅ | ✅ | schema、generated |
| `host-contract` | ✅ | ✅ | ✅ | schema、generated（含新增 `contract.ts`/`session.ts`） |
| `apps/web` | ✅ | — | — | **`vite.config.ts` ✅** |

首审报出的 3 处 TS4111 已按索引访问语法修正（`fixture["expectedIssue"]`）。另核验治理未被反向放宽：`tsconfig.base.json` 在本次范围内**零改动**；全仓手写 TypeScript（排除 `src/generated/`）中 `any`、`as any`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck` 的匹配数为 **0**。首审建议的"逐包证明文件集合覆盖"已写入 [`docs/implementation-roadmap.md`](../implementation-roadmap.md) 的 `G1-09` 验收标准。**发现关闭**。

### MAJOR

**`M-01`　`Asset.path` 接受盘符路径与远程 URL —— 已关闭 ✅**

Schema 已按首审建议改为正向白名单，且比建议更严（路径段限定为 `[A-Za-z0-9_-]+`，结构上无法出现 `.`，因此 `..` 不可表达）。复跑 13 个必拒形态 + 4 个必收形态：

```text
必拒 13/13 全部 rejected（含 C:/、c:/、/etc、//UNC、\\UNC、https://、file:///、../、a/../../、./、.、%2e%2e/、C:report）
必收 4/4  全部 accepted
仓库既有 valid/minimal.json、valid/full.json  均 accepted（无回归）
```

新增 [`windows-absolute-asset.json`](../../packages/document-model/fixtures/invalid/windows-absolute-asset.json) 与 [`remote-asset-url.json`](../../packages/document-model/fixtures/invalid/remote-asset-url.json) 两个负向 fixture，正是首审要求的两类。**发现关闭**（收窄副作用见 `NF-03`）。

**`M-02`　缺少输入预算，深层嵌套抛未捕获 `RangeError` —— 已关闭 ✅**

首审指出的"三包对同一威胁三种答案"已收敛到 [`contract-runtime`](../../packages/contract-runtime/src/index.ts)：遍历迭代化、`cloneAndFreeze` 的冻结阶段迭代化，预算在克隆前生效。复跑首审原始反例：

```text
document depth=20000     rejected: DOCUMENT_BUDGET_EXCEEDED   （首审：THREW RangeError）
document breadth=200000  rejected: DOCUMENT_BUDGET_EXCEEDED   （首审：ACCEPTED ok:true）
template depth=20000     rejected: TEMPLATE_BUDGET_EXCEEDED
host     depth=20000     rejected: HOST_BUDGET_EXCEEDED       （首审：THREW RangeError）
```

四个入口均返回稳定问题码，无未捕获异常。边界为 JSON 嵌套层数（document 64 层 ≈ 31 层 `section` 嵌套，实测 30 层通过、40 层拒绝），对 h1–h6 的报告结构余量充足。**发现关闭**。

**`M-03`　继承访问器会被执行 —— 已关闭 ✅**

修复采用比首审建议更彻底的做法：[`contract-runtime/src/index.ts:46-52,93-95`](../../packages/contract-runtime/src/index.ts#L46-L52) 的 `isAllowedPrototype` 在读取任何属性**之前**拒绝原型非 `null`/`Object.prototype`/`Array.prototype` 的对象，从根上消除了原型链取值路径。复跑首审反例（在原型上同时定义 `schemaVersion`/`dsl_version`/`kind` 三个计数 getter）：

```text
document: inherited accessor invocations  0 (want 0) ok=false   （首审：3 -> GUARANTEE BROKEN）
template: inherited accessor invocations  0 (want 0) ok=false
host:     inherited accessor invocations  0 (want 0) ok=false
```

三包均新增继承访问器测试，[`contract-runtime/test/runtime.test.ts`](../../packages/contract-runtime/test/runtime.test.ts) 还断言了精确的 `{ok:false, kind:"prototype", path:"/"}` 结构而非仅 `.some()`。**发现关闭**。

**`M-04`　配置 Schema 装饰性 + `vite.config.ts` 漏检 —— 已关闭 ✅**

[`config/src/index.ts:47-48,98-113`](../../packages/config/src/index.ts#L47-L48) 现直接 `ajv.compile(configSchema)` 并在解析路径上执行；测试新增 `assert.deepEqual(logLevel["enum"], CONFIG_LOG_LEVELS)`，堵住首审指出的枚举漂移盲区。探针核验：

```text
imports app-config.schema.json              yes
compiles it with Ajv                        yes
bad log level ("trace")                     rejected: CONFIG_INVALID: WENSHU_LOG_LEVEL
schema LOG_LEVEL enum == CONFIG_LOG_LEVELS  in sync
test asserts LOG_LEVEL enum sync            yes
```

`apps/web/tsconfig.json` 的 `include` 已含 `vite.config.ts`，`--listFiles` 证实其进入检查。**发现关闭**。

**`M-05`　Host 无法表达唯一终态与错误码归属 —— 已关闭 ✅**

实施者选择了首审两条路径中的 (a)：新增 [`session.ts`](../../packages/host-contract/src/session.ts) 的有状态 `validateHostSession`，并新增首审建议的三个稳定码（`HOST_TERMINAL_STATE_DUPLICATE`、`HOST_SEQUENCE_REGRESSION`、`HOST_ERROR_CODE_UNDECLARED`）及另外五个。按复审任务书第 5 项逐条反测：

| 反测场景 | 返回问题码 |
|---|---|
| 正常 request+success | `ok:true`（无误报） |
| 重复终态 | `HOST_TERMINAL_STATE_DUPLICATE` |
| 未知请求（终态无对应 request） | `HOST_REQUEST_UNKNOWN` |
| 对 unsupported 能力发起请求 | `HOST_CAPABILITY_UNSUPPORTED` |
| 未声明错误码 | `HOST_ERROR_CODE_UNDECLARED` |
| 进度序号倒退（2→1） | `HOST_SEQUENCE_REGRESSION` |
| 对 `cancellation:none` 能力取消 | `HOST_CANCELLATION_UNDECLARED` |
| 缺少终态 | `HOST_TERMINAL_STATE_MISSING` |
| 终态能力名与请求不符 | `HOST_CAPABILITY_MISMATCH` |
| `request_id` 复用 | `HOST_REQUEST_DUPLICATE` |

八项强制反测全部命中预期码，注册表上下文（`error_codes`、`support_status`、`cancellation`、`progress`）确实参与判定。ADR-0003 决策 4 与 `docs/host-contract.md:41` 已同步改写为可验证表述。**发现关闭**（残留见 `NF-04`）。

### MINOR 与 NOTE

| 首审项 | 判定 | 复审核验 |
|---|---|---|
| `m-01` 模板负向 fixture 无独立意义 | **关闭 ✅** | 4 个 fixture 已改为 `{expectedIssue, injection:{path,value}}` 元数据；[`template.contract.test.ts:70-104`](../../packages/template-model/test/template.contract.test.ts#L70-L104) 以合法 `minimal.json` 为基线注入单个禁止字段，失败原因现可归属到被测字段 |
| `m-02` Schema 问题码无区分度 | **合规延期 ⏭** | 已写入 `G1-09` 验收标准："非法 fixture 断言稳定 issue code 与预期 JSON path"。有明确任务归属，不阻塞 `G1-07` |
| `m-03` `configuration.md` 状态抢跑 + `.mjs` 失效路径 | **关闭 ✅** | 状态改为"已实现，待 Claude 独立复审"；测试路径已改为 `.ts` |
| `m-04` `deepFreeze` 三处重复 | **关闭 ✅** | 已收敛到 `@wenshu/contract-runtime`；三包均改为引用，未出现第四份副本 |
| `m-05` 语言正则误拒合法 BCP 47 | **关闭 ✅** | [`document-model.md:18`](../document-model.md#L18) 改为"v0 只接受 `language[-Script][-REGION]` 子集，不宣称覆盖完整 BCP 47"，采用了首审建议的"限定表述"路径 |
| `m-06` 键名黑名单误伤未来字段 | **关闭 ✅** | [`template-dsl.md:43`](../template-dsl.md#L43) 明确为"v0 保留命名空间……不能在 `0.1.0` 中放宽"，把隐含约束显式化 |
| `N-01` MPL-2.0 / Python-2.0 传递依赖 | **合规延期 ⏭** | `G1-15` 行已加入"显式核查当前树中的 MPL-2.0 传递依赖及 Python 工具许可证""MPL 文件级义务和 Python 工具分发边界有书面结论" |
| `N-02` payload Schema 仅登记 ID | 维持原判定 | 仍按原任务边界延后，文档门禁保留；整改记录第 28 行未把它伪装成已完成 |

首审 `N-03`～`N-08` 的事实性结论在本次范围内未被推翻：浏览器 fixture 表述仍然克制、生成漂移机制未变、体量护栏仍满足（新增最大文件 `host-contract/src/contract.ts` 198 行、`session.ts` 153 行、`contract-runtime/src/index.ts` 151 行，均在 300 行预警线下）。

## 4. 本次修复引入的新发现

均为 `MINOR`，**无一阻塞 `G1-07`**。

**`NF-01`（MINOR）　文档引用了不存在的函数名**

[`docs/host-contract.md:41`](../host-contract.md#L41) 写"单条消息由 `validateHostMessage` 校验"，但全仓不存在该导出；实际导出为 `validateHostContract`（[`contract.ts:165`](../../packages/host-contract/src/contract.ts#L165)）。全仓检索 `validateHostMessage` 仅命中该行文档。属首审 `m-03` 同类的文档/代码指向失配，建议下次触碰该文档时改正，或将实现改名以匹配文档意图。

**`NF-02`（MINOR）　`isUnsafePathValue` 只在字符串**起始**锚定，前缀即可绕过；文档措辞略强于实现**

[`contract.ts:106`](../../packages/host-contract/src/contract.ts#L106) 的 `/^(?:[A-Za-z]:|[\\/]|file:)/iu` 使用 `^` 锚定且无 `m` 标志，因此绝对路径只要不在串首即不被识别。实测：

```text
"ok.pdf\u0000C:/Windows/win.ini"（NUL 截断）    ACCEPTED
"report.pdf\nC:/Windows/win.ini"（换行）         ACCEPTED
"report.pdf\rC:/Windows/win.ini" / \t           ACCEPTED
（同理 "out=C:/Windows/win.ini" 一类前缀亦可绕过）
```

`docs/host-contract.md:44` 的"因此任意键名也不能传递系统路径"因此仍略强于实现。**不判为 MAJOR 的理由**：首审 `B-01` 的核心问题（唯一控制是键名、且最自然的载荷直接穿透）已消除；本项需要构造带分隔符前缀的畸形值，属纵深防御层的加固缺口；真正的主控制——按能力冻结的 payload Schema——文档与 ADR 已明确列为实现前必须完成的门禁，且当前无任何消费者解引用这些值。**门槛**：必须在任何真实 Host 实现（`G1-09`/`PA-14E`/`PB-10`）消费这些值之前修复，届时若仍为唯一控制则应按 MAJOR 处理。建议把两条正则改为全串扫描（去掉 `^` 锚定或加 `m`/全局搜索），并把 NUL/控制字符单列为拒绝条件。

**`NF-03`（MINOR）　资源路径白名单为纯 ASCII，收窄面已披露但属产品级决定**

新正则的路径段限定为 `[A-Za-z0-9_-]+`、扩展名限定为小写 `png|jpg|jpeg|svg`。实测被拒的合理输入：

```text
"资产/图表1.png"        REJECTED   （中文文件名）
"assets/图 1.png"       REJECTED   （中文 + 空格）
"assets/photo.PNG"      REJECTED   （Windows 常见大写扩展名）
"assets/v1.2/chart.svg" REJECTED   （目录名含点）
"assets/chart.webp"     REJECTED   （webp）
```

该约束已在 [`document-model.md:22`](../document-model.md#L22) 如实写明为"正向 ASCII 相对路径白名单"，因此**不是隐藏收窄**，判为 MINOR 而非回归缺陷。但文枢是中文优先产品，`PA-01`（Markdown 导入）与 `A-02D`（docx 导入）会直接遇到中文与大写扩展名的真实资源名，届时只能靠导入期改名。建议在 `PA-01` 开工前明确裁定："导入侧统一规范化重命名"还是"放宽白名单至 Unicode 字母 + 大小写不敏感扩展名"，避免在 PoC-A 期间被迫改动已冻结 Schema。

**`NF-04`（MINOR）　会话校验器不标记终态之后到达的 `cancel`**

[`session.ts:98-103`](../../packages/host-contract/src/session.ts#L98-L103) 对 `cancel` 只检查能力是否声明可取消，随即 `return`，未检查 `state.terminal`。实测：

```text
progress AFTER terminal   HOST_TERMINAL_STATE_DUPLICATE   （已捕获）
cancel   AFTER terminal   ok:true                          （未捕获）
```

同一请求在终态之后仍收到取消属协议违规，与 `docs/host-contract.md:35`"每个请求只能产生一个终态"的精神一致但未被覆盖。影响有限（`cancel` 不产生终态、不改变状态机结果），建议在 `cancel` 分支补一次 `state.terminal` 判定并加一条会话测试。

## 5. 未执行项与限制

1. **生成漂移的破坏性验证仍未执行**（需篡改 `src/generated/*.ts`，超出审计权限）。`generate:check` 的重生成—全文比对逻辑经审读判定可靠，但各文档中"故意修改后失败、重新生成后恢复"的表述本次仍按未复核处理。
2. `pnpm --filter @wenshu/web build:test` 与 `build:staging` 未执行（与 `pnpm build` 共用 `apps/web/dist`，会覆盖 `verify` 刚产生的生成物）；`pnpm dev` 未执行。
3. 未复核范围外事项：DevEco、WPS 人工基线、产品功能、数据库、真实 Electron/ArkWeb 实现。
4. 供应链结论仍不替代 `G1-15`；本次未重跑许可证枚举，`ce70ddc` 的 lockfile 变更仅为新增本地 workspace 包 `@wenshu/contract-runtime`，未引入新的外部依赖。
5. `Ajv`、`json-schema-to-typescript` 内部正确性按锁定版本采信。

## 6. 复审汇总与最终结论

| 首审严重级别 | 首审数量 | 已关闭 | 合规延期 | 未关闭 |
|---|---:|---:|---:|---:|
| `BLOCKER` | 2 | 2 | 0 | **0** |
| `MAJOR` | 5 | 5 | 0 | **0** |
| `MINOR` | 6 | 5 | 1（`m-02`→`G1-09`） | **0** |
| `NOTE` | 8 | — | 1（`N-01`→`G1-15`） | — |

本次新增：`MINOR` 4 项（`NF-01`～`NF-04`），`BLOCKER`/`MAJOR` 0 项。

**结论：`CONDITIONAL PASS`　——　允许进入 `G1-07`**

判定依据：首审 2 项 `BLOCKER` 与 5 项 `MAJOR` 的原始反例已全部复跑并全部转为拒绝或安全行为，无一项靠放宽断言、删测试或改口径关闭；`tsconfig.base.json` 零改动、手写 `any`/`@ts-ignore` 计数为 0，确认严格度未被反向让步。两项延期（`m-02`、`N-01`）都已写入 `G1-09`/`G1-15` 的验收标准，具备明确任务归属，符合首审任务书对"合规延期"的要求。

尤其值得记录的是，`B-01`、`M-02`、`M-03`、`M-04`、`M-05` 的修复都选择了结构性方案（值级校验、共享运行时、原型级拒绝、Schema 真正执行、有状态会话验证器），而不是针对审计反例的点状封堵——这使得本次复审的新探针（重复编码、UNC、盘符相对路径、数组/嵌套位置、`request_id` 复用等首审未测形态）也一并被覆盖。

不判 `PASS` 而判 `CONDITIONAL PASS`，是因为本次新增的 4 项 `MINOR` 尚无任务归属，按首审任务书判据"`CONDITIONAL PASS`：仅有不阻塞 `G1-07` 的一般问题，且每项已有明确后续任务"，需先落实归属。**放行条件**（均不阻塞 `G1-07` 开工，但须在指定节点前闭环）：

1. `NF-01`、`NF-04`：下次触碰 `docs/host-contract.md` 或 `session.ts` 时一并修正，无需单独任务。
2. `NF-02`：登记为 `G1-09` 的验收项之一；**必须在任何真实 Host 实现消费协议值之前修复**（`G1-09`/`PA-14E`/`PB-10`）。
3. `NF-03`：在 `PA-01` 开工前由业主或实施者裁定资源文件名策略，结论写入 `docs/document-model.md`；若选择放宽白名单，需按 `0.x` 次版本规则升级并重跑消费者契约。

实施者可据本复审把 `G1-03`、`G1-03C`、`G1-04`、`G1-05`、`G1-06` 的路线图状态更新为最终完成，并把上述 3 条放行条件登记到对应任务；`G1-07` 可以启动。

> 依 `AGENTS.md:55` 与 `CLAUDE.md`，本复审由未参与实施与修复的独立审计角色出具。`NF-01`～`NF-04` 同样不得由实施者自行关闭。
