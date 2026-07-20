# G1-09 Claude 独立审计报告

> 状态：已完成　审计者：Claude（独立只读）　实施者：Codex　日期：2026-07-20
> 任务书：[G1-09-claude-audit-task.md](G1-09-claude-audit-task.md)　主要实施提交：`7757a37 feat: establish G1-09 engineering quality gates`（76 文件 +2267/-426）

## 审计范围与方法

方法：

1. 通读 `CONSTITUTION.md`、`AGENTS.md`、`DEFINITION-OF-READY.md`、`docs/implementation-roadmap.md`、`docs/engineering-standards.md`、`docs/testing-strategy.md`、`docs/threat-model.md`、ADR-0002/0003/0004、Host 与项目契约说明，以及 G1-03～G1-08 的审计遗留台账。
2. 逐行审读 `tools/quality`（`guardrails.ts`、`typecheck-coverage.ts`、`check-repository.ts`）、`eslint.config.mjs`、`.prettierrc.json`、`.prettierignore`、根 `package.json`、`toolchain.versions.json`，以及 `host-contract`、`project-contract`、`test-support` 的改动。
3. **不采信实施记录，也不采信 `pnpm verify` 全绿本身**。任务书第 4 节列出的 55/182/12/113 等数字我只用来核对漏跑；结论全部来自另写的探针。
4. 破坏性探针一律在 `D:\tmp\g109*` 仓库外临时目录进行（`.mts`/`.cts`/`.TS` 植入、假工作区、上游版本替身），**审计结束时已全部删除**；确认 `D:\tmp` 下无 `g109*` 残留。
5. 未运行 `format`、任何自动修复或生成命令。全程未修改源码、测试、fixture、Schema、生成物、配置、lockfile、路线图或 Git 历史；结束时 `git status --short` 为空，唯一写入仓库的文件是本报告。

**基线事实（非缺陷）**：`pnpm verify` exit 0，质量扫描 55 个源码/配置文件、**183** 个仓库文件（比任务书记载的 182 多 1，差额恰为其后新增的 `docs/audits/G1-09-claude-audit-task.md`，已核对），测试分层 12 个文件，**113** 项测试通过，9 个工作区包 typecheck 完成，production build 完成。以下发现全部是在此之上另找反例得到的。

---

## 发现

### MAJOR

#### M-01　`.mts` / `.cts` 源文件被 tsc 编译，却既不被 ESLint 检查也不被质量扫描器读取，显式 `any` 可完整穿过所有门禁

- **严重级别**：`MAJOR`
- **证据**：
  - [`tools/quality/scripts/check-repository.ts:16`](../../tools/quality/scripts/check-repository.ts#L16)：`files.filter((file) => /\.(?:ts|tsx|js|mjs|cjs)$/u.test(file))` —— 扫描面不含 `.mts`/`.cts`。
  - [`tools/quality/scripts/check-repository.ts:22`](../../tools/quality/scripts/check-repository.ts#L22)：体量检查 `/\.(?:ts|tsx)$/u`，同样不含。
  - [`tools/quality/src/typecheck-coverage.ts:27`](../../tools/quality/src/typecheck-coverage.ts#L27)：`isTypeScriptSource` 为 `/\.(?:ts|tsx)$/u`，因此 `.mts` 不被要求进入 typecheck 集合。
  - [`eslint.config.mjs:27,30`](../../eslint.config.mjs#L27)：TS 规则块与 `no-explicit-any` 的 `files` 均只声明 `["**/*.ts", "**/*.tsx"]`。
- **独立复现**：

  ```powershell
  # 1) ESLint 对各扩展名实际应用了什么配置（在真实仓库中查询）
  node_modules\.bin\eslint.CMD --print-config packages/test-support/src/x.mts
  ```

  | 路径 | ESLint `--print-config` | 质量扫描 | 体量护栏 | typecheck 覆盖要求 |
  |---|---|---|---|---|
  | `src/x.ts` | `no-explicit-any: ACTIVE` | yes | yes | yes |
  | `src/x.tsx` | `no-explicit-any: ACTIVE` | yes | yes | yes |
  | **`src/x.mts`** | **`undefined`（无任何配置匹配）** | **NO** | **NO** | **NO** |
  | **`src/x.cts`** | **`undefined`** | **NO** | **NO** | **NO** |
  | `src/X.TS` | `undefined` | NO | NO | NO |
  | `src/x.js` | 匹配但无 `no-explicit-any` | yes | NO | NO |

  ```powershell
  # 2) 但 tsc 确实编译 .mts（仓库外副本，tsconfig 继承 tsconfig.base.json，include: ["src"]）
  node_modules\tsc --listFiles --noEmit
  #   -> src/common.cts, src/modern.mts, src/normal.ts, src/generated/hand.ts
  #   （src/UPPER.TS 未被编译）
  ```
- **实际/预期结果**：预期任一手写 TypeScript 源文件中的显式 `any` 至少被 ESLint 或 AST 扫描器之一拒绝。实际：把 `export const b: any = 1;` 放进 `src/modern.mts`，**tsc 正常编译（`any` 是合法 TS，编译器不报错）、ESLint 不加载任何配置、AST 扫描器不读取该文件、体量护栏不适用、typecheck 覆盖检查也不要求它入册**。四道门禁全部落空。
- **影响**：`docs/engineering-standards.md:16` 声明「TypeScript AST 独立拒绝显式 `any`」，`AGENTS.md` 与宪法 18 要求所有手写 TypeScript 禁止 `any`。G1-09 的核心职责就是把这条治理变成结构性门禁，而改一个字符的扩展名即可绕过。这正是任务书第 2 项要求寻找的"非规范后缀绕过"和第 3 项要求构造的显式 `any` 反例。`G1-11` CI 将直接继承这套扫描面。附带：`.TS` 大写变体虽同样不被检查，但 tsc 也不编译它（TS 扩展名匹配大小写敏感），因此只会形成死文件，危害低于 `.mts`。
- **建议处理**：把三处正则统一扩展为 `/\.(?:[cm]?tsx?|[cm]?js)$/`（并相应区分体量/覆盖语义），把 ESLint 的 `files` 扩为 `["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"]`；更稳妥的做法是改为**白名单允许的扩展名**，遇到未登记的代码扩展名直接失败，而不是静默跳过。归属：`G1-09` 本任务修复，**必须在 `G1-11` 之前**。

#### M-02　放进 `src/generated/` 的手写代码同时逃过 ESLint、Prettier 与体量护栏，且不产生任何漂移信号

- **严重级别**：`MAJOR`
- **证据**：
  - [`eslint.config.mjs:15`](../../eslint.config.mjs#L15)：`ignores: [..., "**/src/generated/**"]`。
  - [`.prettierignore`](../../.prettierignore)：同样含 `**/src/generated/**`。
  - [`tools/quality/src/guardrails.ts:33-35,52-54`](../../tools/quality/src/guardrails.ts#L33-L35)：`isGeneratedTypeScript` 命中即 `checkFileSize` 直接返回空。
  - 各包 `scripts/check-generated.ts` 只把**单个已登记生成文件**与生成器输出比对，对该目录下的新增文件没有任何断言。
- **独立复现**：

  ```text
  eslint --print-config packages/document-model/src/generated/x.ts   -> undefined（不检查）
  checkFileSize("packages/p/src/generated/x.ts", <450 行>)           -> clean（不限体量）
  tsc --listFiles（仓库外副本）                                       -> src/generated/hand.ts 被编译
  ```

  对照：`src/Generated/`（大写）、`packages/p/generated/`（不在 `src` 下）、`src/generated-by-hand/` 三种近似路径均**不**被当作生成目录，仍受体量护栏约束（`error(450)`），说明豁免键只认精确的 `/src/generated/` 路径片段。
- **实际/预期结果**：预期机器产物边界只豁免真正由生成器产出的文件。实际：任何人把手写模块放进 `packages/*/src/generated/`，即可同时免除 ESLint 全部规则（含 `no-non-null-assertion`、`consistent-type-imports` 与两套 recommended）、Prettier 格式基线和 400/500 行体量上限，而 `generate:check` 因为只认识那一个已登记文件，不会报告任何异常。
- **影响**：这是一条自助式的三重门禁豁免通道，且所在目录按约定不受人工评审关注。宪法 18「不得扩大豁免」与 19（体量护栏）直接适用。**残余保护需要如实说明**：该目录仍受禁止语法扫描（显式 `any`、抑制指令仍会被 [`check-repository.ts:21`](../../tools/quality/scripts/check-repository.ts#L21) 捕获，因为 `checkForbiddenSyntax` 不跳过生成文件），也仍受 typecheck 覆盖要求，因此危害面小于 `M-01`，但仍属"使后续任务绕过质量门禁"。
- **建议处理**：让质量扫描器从各包的生成脚本取得**已登记生成文件清单**，凡位于 `src/generated/` 但不在清单内的文件一律按手写代码处理（或直接失败）。归属：`G1-09` 本任务修复，**必须在 `G1-11` 之前**。

---

### MINOR

| ID | 标题 | 证据与复现 | 影响与归属 |
|---|---|---|---|
| `m-01` | `project-contract` 硬编码非法 fixture 清单，新增 fixture 会被静默漏跑 | [`packages/project-contract/test/project-contract.contract.test.ts:46`](../../packages/project-contract/test/project-contract.contract.test.ts#L46)：`for (const name of ["future-project", "missing-project-field"])`。其余三个包（document-model、template-model、host-contract）均用 `readdir` 目录驱动。当前该目录恰好只有这两个文件，故今日无漏跑 | `docs/engineering-standards.md:27` 声称"**所有已提交**非法 fixture 必须同时声明 code 和 path"，该包的机制无法为未来新增的 fixture 兑现此声明。与 `G1-08 M-01`（硬编码根目录）同类。**归属 `G1-09` 修复**，最迟 `G1-11` 前 |
| `m-02` | `missing-project-field.json` 的 `expectedPath: "/"` 断言近乎空洞 | 该 fixture 元数据为 `expectedIssue: "PROJECT_SCHEMA"` + `expectedPath: "/"`。实测：任一顶层 `oneOf` 不匹配的项目对象会产生 **54** 条 issue，其中 51 条为 `PROJECT_SCHEMA@/` | 任何形态错误的 project 对象都能满足该断言，等于没有区分度——正是任务书第 6 项点名的"第一条泛化 `/`"。其余 17 个 fixture 的 code+path 均有实际区分度（见 `N-09`）。**归属 `G1-09` 修复**：改用具体字段路径 |
| `m-03` | 冻结契约 Schema 的 `ModelContext` 模式被静默放宽，未在任何文档、ADR 或提交信息中声明 | 逐键 JSON 对比 `74cd373..7757a37` 显示 `packages/project-contract/schema/project-contract.schema.json` 有且仅有两处语义变化：`/$defs/ModelContext/properties/provider/pattern` 由 `^(?!sk[-_])(?!.{0,20}(?:key\|secret\|token))[a-z][a-z0-9.-]{0,39}$` 改为 `^[a-z][a-z0-9.-]{0,39}$`；`model` 同理。即**去掉了 Schema 层的密钥形状负向前瞻**。提交信息只有一行标题，`docs/project-contract.md`、`docs/engineering-standards.md`、ADR-0004 均无相应说明 | **无功能回归**：运行时 `looksSensitiveIdentifier` 覆盖面更广（含 `aiza`/`ghp_`/`xox*` 前缀、大小写不敏感），实测 `sk-live-abc` 仍返回 `PROJECT_MODEL_IDENTIFIER_INVALID@/subject_model_context/provider`，相关测试仍在。方向上也与 `G1-07 NF-02` 的整改意见一致。问题在于**防御从两层降为一层且未申报**：ADR-0004 决策 5 要求"任何行为变化使用显式 adapter"，冻结 Schema 的可接受集合扩大属于应申报的变化。**归属 `G1-09` 修复**：在 `docs/project-contract.md`/ADR-0004 中明确记录该放宽及其理由，或在 `PB-05A` 落地结构化标识前恢复 Schema 层约束 |
| `m-04` | Host 值级路径预检过宽，误杀 `word:word` 记号与含裸 `%` 的普通文本 | 实测被拒绝的合法值：`"50% complete"`（`decodeURIComponent` 抛错→按不安全处理）、`anchor:section-1`、`mode:fast`、`mailto:a@b.com`、`data:text/plain;...`、`http://example.com/x`。原因是 [`packages/host-contract/src/contract.ts`](../../packages/host-contract/src/contract.ts) 的盘符规则 `/[A-Za-z]:(?:[\\/]\|[A-Za-z0-9._-])/u` 未要求盘符字母是独立单字符，任何 `字母:字母` 都会命中 | **失败方向安全**（fail-closed），且"无法解码即视为不安全"已在 `docs/engineering-standards.md:33` 申报，故不阻断。但 `anchor:section-1` 恰是项目契约自己的 `locator` 格式，未来 Host payload 承载显示名或定位符时会被误杀。建议把盘符规则改为要求 `[A-Za-z]:` 前为非字母数字边界。**归属 `PB-05A`**（与 NF-02 同批处理模型/标识规则），最迟真实 Host 实现开工前 |
| `m-05` | `discoverTestFiles` 改为按**完整路径**匹配 `.test.`/`.spec.`，会把目录名带入判定 | [`packages/test-support/src/discovery.ts:57-67`](../../packages/test-support/src/discovery.ts#L57-L67)：`const lowercaseName = file.toLowerCase()` 后对整条路径做 `includes`。因此一个名为 `fixtures.test.data/` 的目录会让其中**每个**文件成为层级审计候选并因无法分类而使 `pnpm test:layers` 失败 | 只产生**误报**，不产生绕过（方向安全）。但会让无关目录命名意外中断整个 verify。建议改回按文件名（`basename`）匹配。**归属 `G1-09` 或 `G1-11`**，最迟 CI 建立前 |
| `m-06` | 依赖树新增 `BlueOak-1.0.0` 许可证，落在已批准集合之外 | 全量枚举 111 个已安装包：MIT 79、Apache-2.0 13、BSD-2-Clause 6、ISC 6、BSD-3-Clause 3、MPL-2.0 2、BlueOak-1.0.0 1（`minimatch`，经 eslint 传入）、Python-2.0 1。无 GPL/AGPL，无未声明许可 | BlueOak-1.0.0 是宽松许可，但与既有的 MPL-2.0、Python-2.0 一样不在宪法 20 的"MIT/Apache-2.0/BSD"批准集合内。**归属 `G1-15`**（该行已登记 MPL/Python 核查，需补入 BlueOak），最迟 G1-16 前 |

---

### NOTE（已核验事实，不计缺陷）

- **N-01　单一入口与失败传播成立（检查 1）。** `verify` 为 `format:check && lint && quality:check && test:foundation && config:check && contracts:check && typecheck && build`，八段全部 `&&` 串联，任一非零即中止；未发现更宽松的并行入口。`contracts:check` = `generated:check && contracts:test`。**全部 12 个已登记测试文件都在 `verify` 中真实执行**：4 个 unit 经 `test:unit`、7 个 contract 经 `contracts:test`、`config.contract.test.ts` 经 `config:check`——不存在"verify 绿色但有已登记代码从未执行"的组合（任务书第 12 项）。`pnpm -r --if-present run typecheck` 的 `--if-present` 静默跳过风险由 `checkTypecheckCoverage` 的强制脚本校验对冲（见 `N-05`）。
- **N-02　体量边界完全正确（检查 5）。** 直接调用 `checkFileSize` 实测：生产 298/299=clean、**300=warning**、399/400=warning、**401=error**；测试 299=clean、**300=warning**、499/500=warning、**501=error**。行数统计对 LF/CRLF、有无末尾换行完全一致（401 行四种组合均判 error）。`.Test.ts`、`tests/`、`__tests__/`、`.spec.` 均正确归入测试阈值；`latest/`、`contest/` 未被子串误判为测试。预警不设置 `process.exitCode`（[`check-repository.ts:37,50`](../../tools/quality/scripts/check-repository.ts#L50) 只对 error/coverage/strictConfig 置位），故不会使总入口失败。
- **N-03　显式 `any` 检测精准，无误报（检查 3）。** AST 方式（非文本匹配）实测：`let x: any`、参数、`Array<any>`、`Record<string, any>`、`as any`、类型别名、泛型默认值、返回类型 8 种真实写法全部命中；行注释/块注释中的 "any"、字符串 `"any"`、模板串、标识符 `anyValue`、属性名 `any`、JSDoc `{any}` 6 种全部 clean。
- **N-04　抑制指令检测完整（检查 3）。** `@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`eslint-disable`、`eslint-disable-next-line` 全部命中；字符串字面量中的指令也命中（宁可误报的安全方向）。ESLint 侧另有 `noInlineConfig: true` 与 `reportUnusedDisableDirectives: "error"` 双重封堵。
- **N-05　typecheck 互锁强（检查 1/4）。** 对假工作区实测：`typecheck: "echo pass"` → 拒绝；`typecheck: "tsc -p tsconfig.json --noEmit"` → 拒绝（要求精确字符串）；缺 `typecheck` 脚本 → 拒绝；`tsconfig.json` 的 `include` 漏掉 `src/hidden.ts` → `TypeScript file is outside typecheck: src\hidden.ts`。9 个工作区包全部 typecheck 通过，`apps/web/vite.config.ts` 由 `apps/web` 包覆盖。
- **N-06　生成漂移可靠且动态（检查 7）。** `generated:check` 为 `pnpm -r --if-present run generate:check`，**无硬编码包清单**，新增带该脚本的包会自动纳入。对 4 个契约包分别调用真实生成器并与已提交字节比对：**四者全部完全一致（零漂移）**；追加一个字节即不相等，证明比较是字节精确；四个 `check-generated.ts` 均以严格 `actual !== expected` 抛错。
- **N-07　Host `NF-02` 已闭合（检查 8）。** 27 项敌意值**全部拒绝**，含：原始反例 `report.pdf\nC:/Windows/win.ini`、NUL、TAB、CR、VT/FF、DEL(0x7f)、`out=C:/…`（有前缀）、`outC:/…`（无分隔符）、盘符相对 `C:report.pdf`、小写盘符、反斜杠盘符、POSIX 绝对（行首/空格后/引号后）、UNC、`file:`/`FILE:`/嵌入 `file:`、POSIX 与 Windows 穿越、嵌入穿越、单次与双重百分号编码、**17 轮编码（超过 16 轮预算）**、畸形 `%zz`、编码 NUL。嵌套对象、数组元素、无害键名下的载荷同样被拒，问题码与路径精确（如 `HOST_PLATFORM_FIELD_FORBIDDEN@/input/opts/deep`）。正向对照 11 项中 10 项正确放行（相对文件名、子路径、grant id、`https://` 大小写、能力 ID、detail key、ISO 时间戳、semver、sha256）；唯一误杀见 `m-04`。
- **N-08　项目契约七类问题码各自可区分（检查 9）。** 实测：裁决 `PROJECT_AUDIT_DECISION_INVALID@/decision`、时间戳 `PROJECT_TIMESTAMP_INVALID@/occurred_at`、责任主体 `PROJECT_AUDIT_RESPONSIBILITY_INVALID@/actor`、哈希 `PROJECT_AUDIT_HASH_INVALID@/after_sha256`、包路径 `PROJECT_PACKAGE_PATH_INVALID@/entries/0/path`、模型标识 `PROJECT_MODEL_IDENTIFIER_INVALID@/subject_model_context/provider`——六类各有独立 code+path。第七类"上游 reader 兼容"用 G1-07 复审的 module hook 方法验证：在**不修改仓库任何文件**的前提下把 `DOCUMENT_SCHEMA_VERSION` 替换为 `9.9.9`（磁盘仍为 `0.1.0`，已核对），已提交的 compatibility fixture 立刻以 **`PROJECT_COMPATIBILITY_MISMATCH@/readers`** 失败——**漂移门禁真实活着**。（手工把 `readers.document` 改成别的值只会先被 Schema `const` 拦下，这是设计使然，不是门禁失效。）这闭合了 `G1-07 NF-04` 与 `m-05` 的技术内容；是否正式关闭由本报告结论决定。
- **N-09　fixture 的 code+path 断言确有区分度（检查 6）。** 全仓 18 个非法 fixture **全部同时携带** `expectedIssue` 与 `expectedPath`，四个消费测试均以 `code === expected && path === expected` 断言，且在缺任一元数据时主动 `throw`。实测交换验证（以 `duplicate-id.json` 为例，实际返回 `DOCUMENT_DUPLICATE_ID@/blocks/1/id`）：**正确 code + 错误 path → 断言失败**；**错误 code + 正确 path → 断言失败**。测试删除元数据键后才校验，载荷不受污染。已知弱点仅 `m-01`（清单硬编码）与 `m-02`（`/` 路径）两处。
- **N-10　格式基线未意外改义（检查 11）。** 对 `74cd373..7757a37` 的 31 个 JSON 文件做**解析后逐键对比**：7 个纯格式变化、3 个新增；其余 21 个的"语义变化"逐一核对后，**16 个 fixture 只新增了 `expectedPath`（project-contract 两个另加 `expectedIssue`），没有任何 fixture 载荷被改动**；`package.json` 新增 6 个脚本与 4 个 devDependency 并改写 `contracts:check`/`verify`；`toolchain.versions.json` 新增 16 个键；`project-contract.schema.json` 有且仅有两处变化（见 `m-03`）。`git diff --check` exit 0，无空白错误；工作树干净。
- **N-11　工具链与供应链一致（检查 10）。** `eslint@10.7.0`、`@eslint/js@10.0.1`、`typescript-eslint@8.64.0`、`prettier@3.9.5`、`typescript@6.0.3` 五项的 **integrity 值全部能在 `pnpm-lock.yaml` 中匹配到**，来源均为 `registry.npmjs.org` 官方地址，许可证 MIT/Apache-2.0，已冻结进 `toolchain.versions.json`。全仓 package.json **无任何浮动版本范围**（`^`/`~`/`*`/比较符零命中）。无 GPL/AGPL，无未声明许可证。安装使用 `--store-dir D:\DevCaches\pnpm-store`，缓存未回写 C 盘。
- **N-12　质量工具自身受同一套门禁约束（检查 12）。** `tools/quality` 位于全仓遍历范围内、拥有自己的 `tsconfig.json` 与精确 `typecheck` 脚本、被 `checkTypecheckCoverage` 逐文件核对、其源码同样接受 `any`/抑制/体量扫描，并有两个自身的 `.unit.test.ts`。它通过 `` `@ts-${"ignore"}` `` 字符串拼接避免自我命中（[`guardrails.ts:13-18`](../../tools/quality/src/guardrails.ts#L13-L18)）——这是标准做法，**没有为自己添加任何排除清单**，未构成"质量工具不受质量工具约束"。
- **N-13　范围诚实，未虚假关闭他人遗留项。** `docs/engineering-standards.md:35` 明确写"这仍是……纵深预检，不替代真实 Host 实现开工前冻结每项输入输出 Schema"；数据库、真实 Host、Electron/ArkWeb、渲染/E2E、CI 均未被声称已验证。`docs/audits/G1-07-followups.md` 中 `NF-01`/`NF-02`/`NF-03` 仍标记归属 `PB-05A`、`NF-04` 标记「G1-09（已实施，待独立审计）」；`docs/audits/G1-08-followups.md` 的 `RA-01`/`RA-02` 仍归属 `G1-11` 且未被触碰；路线图 `G1-09` 为「🟡 已实现，待独立审计」。台账如实。

---

## 实际运行的命令与结果

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store`（CI=true） | 通过，10 个工作区项目 |
| `pnpm verify` | **exit 0**：质量护栏 55 源码/183 仓库文件 → 层级审计 12 文件 → unit 18/18 → config 7/7 → contract-runtime 4/4 → document 15/15 → template 15/15 → host 31/31 → project 23/23（合计 **113**）→ 9 包 typecheck → build |
| `eslint --print-config <path>` × 7 种扩展名 | `M-01` 与 `M-02` 的核心证据 |
| `tsc -p tsconfig.json --listFiles`（仓库外副本） | 证明 `.mts`/`.cts`/`src/generated/` 被编译、`.TS` 不被编译 |
| 探针 A（`checkFileSize`/`checkForbiddenSyntax`/`countLines` 直调） | `N-02`/`N-03`/`N-04` 与扩展名覆盖矩阵 |
| 探针 B（Host 27+11 值矩阵、七类问题码、fixture code/path 交换） | `N-07`/`N-08`/`N-09`/`m-02`/`m-04` |
| 探针 C（`registerHooks` 上游替身、四包生成器比对、假工作区 typecheck 互锁） | `N-05`/`N-06`/`N-08` |
| 探针 D/E（`git show` 逐键 JSON 对比、`git diff --check`） | `N-10`/`m-03` |
| 许可证与 integrity 全量枚举（111 包） | `N-11`/`m-06` |
| `git status --short`（审计前 / 后） | 两次均为空；临时副本 `D:\tmp\g109*` 已全部删除并核实无残留 |

## 未执行项与限制

1. **未在真实仓库内植入任何探针文件**：`M-01`/`M-02` 均在 `D:\tmp` 副本中验证，并用 `eslint --print-config` 在真实仓库配置下交叉确认。因此"若把 `.mts` 提交进仓库，`pnpm verify` 仍会 exit 0"这一步是由三项独立证据推得，而非直接执行。
2. **未执行 `format`、自动修复或任何生成命令**（任务书禁止）；生成漂移改为用真实生成器渲染后与已提交字节比对，未实际写入生成文件。
3. **未对全部 43 个非 JSON 变更文件做 AST 级等价比对**：`--ignore-all-space` 无法中和引号风格/换行重排，故 `N-10` 的"未改义"结论对 JSON 是逐键证明的，对 TypeScript 仅覆盖到测试断言方向（经查证为增强而非削弱）。
4. **范围外未审计**：数据库、真实 Host、Electron/ArkWeb、渲染/E2E、CI 服务、`G1-08 RA-01/RA-02` 的实现。
5. **供应链结论仍由 `G1-15` 签署**；本次只做许可证/integrity/浮动版本的现状核验。
6. **`pnpm store path` 报告 `D:\DevTools\pnpm\store\v11`**，与安装时显式传入的 `D:\DevCaches\pnpm-store` 不是同一目录（`PNPM_STORE_DIR` 环境变量未被 pnpm 采用，只有 `--store-dir` 生效）。两者都在 D 盘，不违反缓存约束，但 `G1-11` 设计缓存键前应统一。

## 汇总与最终结论

| 严重级别 | 数量 | 编号 |
|---|---:|---|
| `BLOCKER` | 0 | — |
| `MAJOR` | 2 | `M-01`、`M-02` |
| `MINOR` | 6 | `m-01`～`m-06` |
| `NOTE` | 13 | `N-01`～`N-13` |

**结论：`FAIL`**

依任务书第 1 节，存在 `MAJOR` 即不得把 `G1-09` 作为消费者前置，**尤其不得启动 `G1-11`**。

判定要点：

- 本次实施的**质量很高**，而且是结构性的而非点状封堵：单一 `verify` 入口八段串联且全部 12 个已登记测试真实执行；体量边界 299/300/400/401 与 299/300/500/501 四点全部精确、EOL 无关；显式 `any` 用 AST 判定，8 种真实写法全中、6 种注释/字符串/标识符零误报；typecheck 互锁能挡住 `echo pass`、能挡住多一个参数的 `tsc`、能挡住 `include` 漏文件；生成漂移四包零漂移且字节精确、发现方式动态无硬编码；Host `NF-02` 的 27 项敌意值全数拒绝；项目契约七类问题码各自可区分，其中 reader 漂移门禁经 module hook 证明真实活着；18 个 fixture 的 code+path 断言经交换验证确有区分度；许可证、integrity、版本锁定与格式基线的逐键 JSON 核验全部干净。
- 阻断集中在**扫描面的完整性**，两项 `MAJOR` 是同一个形态：**门禁覆盖的是"我们习惯写的文件"，而不是"所有会被编译的文件"**。
  - `M-01`：`.mts`/`.cts` 被 tsc 编译成真实代码，却对 ESLint（`--print-config` 返回 `undefined`）、AST `any` 扫描、体量护栏、typecheck 覆盖检查四者同时不可见。改一个字符的扩展名即可让显式 `any` 合法进入代码库——这正是 G1-09 声称由 AST 独立拒绝的东西。
  - `M-02`：`src/generated/` 的机器产物豁免只认路径、不认"是否真由生成器产出"，因此手写代码放进去即可免除 ESLint 全部规则、Prettier 与 400/500 行上限，而漂移检查只认识那一个已登记文件，不会发出任何信号。（残余保护是 `any`/抑制扫描与 typecheck 覆盖仍然生效，危害面因此小于 `M-01`。）
- **时机是判 `FAIL` 而非条件通过的决定性理由**：`G1-11` 会把这套扫描面固化成 CI 必需检查。一旦 CI 建立在当前扫描面上，两条绕过路径就会以"CI 全绿"的形式获得背书，与宪法 18「可信失败优先于虚假通过」直接冲突。两项修复代价都不大（扩展名白名单 + 生成文件清单校验），现在改的成本远低于 CI 之后。
- 六项 `MINOR` 均不阻断，且已在上表逐项写明归属与最迟关闭点（`G1-09` 修复 `m-01`/`m-02`/`m-03`/`m-05`，`PB-05A` 承接 `m-04`，`G1-15` 承接 `m-06`）。

**关闭路径**：由 Codex 修复 `M-01`、`M-02`，并为每项补反测（含 `.mts` 中的 `any` 必须失败、`src/generated/` 下的未登记文件必须失败），一并处理归属本任务的 `MINOR`，复跑 `pnpm verify` 后由 Claude 依本报告逐项复审并签署关闭。在复审给出 `PASS` 或合规 `CONDITIONAL PASS` 之前，`G1-11` 不得启动。审计者不提供也不应用补丁。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本报告由未参与实施的独立审计角色出具；实施者不得自行关闭上述发现。`G1-07 NF-04` 与 `m-05` 的技术内容经 `N-08` 核实已达成，但其正式关闭状态随本报告结论一并由复审签署。
