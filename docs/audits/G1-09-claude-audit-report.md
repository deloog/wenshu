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

---
---

# 复审（2026-07-20）：`41b7726..cba2aee`

> 复审者：Claude（独立只读，与首审同一角色）　整改者：Codex　任务书：[G1-09-claude-reaudit-task.md](G1-09-claude-reaudit-task.md)
>
> **本章节的结论取代上文首审的 `FAIL`。** 上文首审记录原样保留，未删除或改写任何一行。
>
> 命名说明：本节新增发现使用 `RA-xx` 前缀。

## 1. 复审范围与方法

整改提交 `cba2aee fix: remediate G1-09 audit findings`（33 文件 +457/-50），新增 `tools/quality/src/generated-files.ts` 与其单元测试。

按任务书要求，**不采信 [整改记录](G1-09-remediation.md) 的自述，也不采信 `pnpm verify` 全绿**（整改者自报 exit 0、115 项测试、13 个测试文件、9 个包 typecheck，我只用来核对漏跑，并已独立复现）：

1. 逐行审读 `generated-files.ts`、`guardrails.ts`、`check-repository.ts`、`typecheck-coverage.ts`、`eslint.config.mjs`、`.prettierignore`、四个 `check-generated.ts`、`contract.ts`、`validation.ts`、`audit-semantics.ts`、`discovery.ts` 与各 `package.json`。
2. **逐项重跑首审原始反例**，并按任务书第 2 节展开：扩展名矩阵、生成登记 11 种形态、Host 27 项敌意矩阵 + 19 项合法对照 + 8 项解码边界、typecheck include 遗漏、fixture 断言交换。
3. 另找整改引入的新绕过（`RA-01`～`RA-03`）。
4. 破坏性探针全部在 `D:\tmp\g109*` 仓库外副本执行（含把 `document-model` 整包复制出去、篡改 manifest 后运行**真实** `check-generated.ts`），**结束时已全部删除并核实无残留**，包括为解析依赖临时创建的 `D:\tmp\node_modules` 联接。
5. 未运行 format、fix、generate 或任何修改 Git 历史的命令。全程未修改仓库内任何文件；结束时 `git status --short` 为空，唯一写入的是本报告的追加章节。

## 2. 复跑证据

| 检查 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store`（CI=true） | 通过，10 个工作区项目 |
| `pnpm verify` | **exit 0**：质量护栏 57 源码/188 仓库文件 → 层级审计 13 文件 → unit 20/20 → config 7/7 → contract-runtime 4/4 → document 15/15 → template 15/15 → host 31/31 → project 23/23（合计 **115**）→ 9 包 typecheck → build。与整改者自报一致，已独立复现 |
| `pnpm-lock.yaml` / `tsconfig.base.json` | 本次范围内**零改动**，未借整改放宽严格度或扩大供应链 |
| 手写代码中 `any`/`as any`/`@ts-*`/`eslint-disable` | 匹配数 **0**（扫描面已含 `.mts`/`.cts`/`.mjs`） |
| 文件体量 | 最大源码 `contract.ts` 208 行、`validation.ts` 206 行；最大测试 89 行。全部低于 300 行预警线 |
| `git status --short`（复审前 / 后） | 两次均为空 |

## 3. 首审发现逐项判定

### `M-01`　TypeScript 扩展名覆盖 —— **已关闭 ✅**

修复是结构性的：`guardrails.ts` 新增 `TYPESCRIPT_EXTENSIONS`/`CODE_EXTENSIONS` 白名单与 `hasExactExtension`，`check-repository.ts` 改用白名单而非正则，ESLint 的 `files` 扩为四种 TS 扩展名，并新增 `hasNoncanonicalCodeExtension` 主动拒绝大小写变体。

1. **ESLint 配置（任务书 M-01.1）**——在真实仓库查询 `--print-config`：

   ```text
   src/x.ts    no-explicit-any ACTIVE      src/x.mts   no-explicit-any ACTIVE
   src/x.tsx   no-explicit-any ACTIVE      src/x.cts   no-explicit-any ACTIVE
   ```

   首审时 `.mts`/`.cts` 返回 `undefined`（无任何配置匹配），现已全部启用 TS 规则。

2. **AST 扫描与体量（M-01.2）**——四种扩展名逐一实测：

   | 扩展名 | 进入 AST 扫描 | 显式 `any` 命中 | 生产 401 / 400 | 测试 501 / 500 |
   |---|---|---|---|---|
   | `.ts` / `.tsx` / `.mts` / `.cts` | 均 yes | 均 1 | 均 `error(401)` / `warning(400)` | 均 `error(501)` / `warning(500)` |

3. **typecheck 覆盖（M-01.3）**——仓库外假工作区：`include: ["src"]` 时四类文件全部入册（clean）；把 `include` 改为只含 `.ts`/`.tsx` 后，立即报 `TypeScript file is outside typecheck: src\b.mts`（`.cts` 同）。

4. **大小写变体（M-01.4）**——首审时 `.TS` 只是"不被检查的死文件"，现在**主动失败**：`a.TS`、`a.MTS`、`a.CTS`、`a.Ts`、`a.TSX`、`a.JS`、`a.MJS` 全部命中 `noncanonical-code-extension`；`a.ts`、`a.mts` 与非代码文件 `README.MD` 正确不触发。

5. **JavaScript 未回归（M-01.5）**——`.js`/`.jsx`/`.mjs`/`.cjs` 仍进入禁止语法扫描，正确豁免 TS 专属体量阈值；ESLint 对 `.js`/`.mjs`/`.cjs` 应用 `eslint.configs.recommended` 而不强加 TS 类型规则。残留见 `RA-01`。

**发现关闭。**

### `M-02`　生成文件身份 —— **已关闭 ✅**（形成真正的双向互锁）

修复把"目录自助豁免"改为"manifest 登记 + 生成器反向确认"：`package.json` 增加 `wenshu.generatedFiles`，新增 `inspectGeneratedFileRegistry` 做正向校验，`checkFileSize` 改为只豁免**已登记文件**，同时把 `**/src/generated/**` 从 `.prettierignore` 与 ESLint `ignores` 中**移除**（实测 `--print-config packages/document-model/src/generated/document.ts` 现在返回 `no-explicit-any ACTIVE`）。

**质量层 11 种形态（仓库外工作区）**：

```text
基线：1 个真实生成文件已登记                    ACCEPTED (registered: 1)
src/generated/ 下未登记的手写文件                unregistered file in generated directory
登记了不存在的文件                               invalid or missing generated file registration
有 generate:check 但登记为空 / 无登记键          package with generate:check must register generated files
登记项含 ../ 逃逸 / 绝对路径 / 大小写不符        invalid or missing generated file registration
非字符串登记项                                   generated file registration must be a string
近似目录名 src/generated-by-hand.ts              不获豁免（450 行仍 error(450)）
已登记文件：体量豁免 clean，但显式 any 仍被扫描  按预期
```

**生成器层——把 `document-model` 整包复制到 `D:\tmp` 后运行真实 `check-generated.ts`**：

```text
A. 未篡改 manifest                        manifest 守卫未触发（其后因副本缺少依赖解析而中止，属探针假象）
B. manifest 额外登记一个手写文件          exit=1  manifest 守卫触发
C. 删除 wenshu 登记键                     exit=1  manifest 守卫触发
D. 登记指向错误路径                       exit=1  manifest 守卫触发
```

这正是任务书第 2 节要求判断的关键点：**质量层单独接受"把手写文件也登记进 manifest"（`ACCEPTED (registered: 2)`），但该形态会被生成器层的 `check-generated.ts` 以硬编码的"恰好 1 项且等于本包生成路径"断言拒绝**。两层互相确认，不是把目录自助豁免换成 manifest 自助豁免。四个真实包的登记与生成器一一对应，`pnpm verify` 中四次 `generate:check` 全部 exit 0。字节漂移检查的严格 `!==` 语义与四包零漂移已在首审 `N-06` 用真实生成器逐字节证明，本次未重复。

**发现关闭**（残留见 `RA-03`）。

### 六项 MINOR

| 首审项 | 判定 | 复审核验 |
|---|---|---|
| `m-01` 硬编码 fixture 清单 | **关闭 ✅** | `project-contract.contract.test.ts` 已改为 `readdir` 目录驱动并排序遍历，且在 `expectedIssue`/`expectedPath` 任一缺失或非字符串时 `throw`。新增 fixture 会自动纳入，元数据缺失会失败 |
| `m-02` `expectedPath: "/"` 空洞断言 | **未完全关闭 ⚠** | 见下方 `RA-04` |
| `m-03` 冻结 Schema 被静默放宽 | **关闭 ✅** | 逐键比对确认 `ModelContext.provider` 与 `.model` 的两条正则已**恢复到 G1-07 冻结值**（含 `(?!sk[-_])` 与 `(?!.{0,20}(?:key\|secret\|token))` 前瞻）。新增 `validateModelIdentifierInput` 在 Schema 校验**之前**运行，因此 `sk-live-abc`、`my-secret-store`、`TOKEN-production`、`apikey-x` 全部返回专用 `PROJECT_MODEL_IDENTIFIER_INVALID@/subject_model_context/{provider,model}` 而非泛化 `PROJECT_SCHEMA`；`anthropic` 仍正常接受。该函数只读取自有属性且运行在共享 `inspectData` 的原型/访问器守卫之后，不执行访问器。Schema 接受集合未被扩大 |
| `m-04` 预检过宽误杀 | **关闭 ✅** | 首审 27 项敌意矩阵中 **26 项继续拒绝**；唯一变化的 `100%` 正是首审 `m-04` 要修的误杀本身（首审我把它放在"必拒"清单里，而把同类的 `50% complete` 判为误杀——**是我首审的清单归类不一致，不是实现缺陷**）。19 项合法对照 **全部接受**，含首审误杀的 `50% complete`、`anchor:section-1`、`mode:fast`、`mailto:`、`data:`、`http://`、多字节 `报告 2026.pdf`、`报告 50%.pdf` 与编码后的多字节。解码边界一致且可说明：`%z`/`%zz`/`%2` 拒绝，裸 `%`、`50% and %41`、纯有效编码接受，16 轮与 17 轮编码均拒绝；`engineering-standards.md:33` 已同步描述该边界。另测 9 种"裸 % 是否被用来夹带路径"的组合（`50%C:/…`、`100% /etc/shadow`、`%..%2f..`、`.%2e/x`、`%25` 三重、`% + file:`、`% + NUL`、真实 UNC）**全部仍被拒绝**——容忍裸 `%` 没有打开穿透面 |
| `m-05` 按完整路径匹配导致误报 | **关闭 ✅** | `discoverTestFiles` 已改回按 basename 判定。实测 `fixtures.test.data/plain.json` 与 `a.spec.dir/note.md` **不再**成为候选；真实测试文件仍按 G1-08 规则全部发现（仓库根 `root.e2e.test.ts`、7 层深目录、`Sneaky.Test.ts` 大小写变体） |
| `m-06` BlueOak 许可证未登记 | **关闭 ✅** | `docs/implementation-roadmap.md` 的 `G1-15` 行已把 BlueOak-1.0.0 与 MPL-2.0、Python-2.0 并列写入范围内与完成证据（"BlueOak 宽松许可是否可接受均有书面结论"），停止条件为"不明或未获业主批准的许可即移除候选"。**本次整改没有自行批准该许可证** |

## 4. 本次复审的新发现

均为 `MINOR`，**无一阻断消费者**。

**`RA-01`（MINOR）　`.jsx` 没有任何 ESLint 配置**

`eslint --print-config packages/test-support/src/x.jsx` 返回 `undefined`——与首审时 `.mts` 的症状相同。`.jsx` 已被纳入质量扫描器的 `CODE_EXTENSIONS`（禁止语法扫描生效），但 ESLint 的默认 `files` 只含 `**/*.js`、`**/*.mjs`、`**/*.cjs`，`eslint.config.mjs` 也未补 `.jsx`，因此 `.js`/`.mjs`/`.cjs` 能拿到 `eslint.configs.recommended` 而 `.jsx` 拿不到任何规则。影响有限（仓库中无 `.jsx`，且不应对它套用 TS 类型规则），但这是新建扩展名白名单里唯一未对齐的一项。**归属 `G1-09`**，最迟 `G1-11` 前：在 ESLint 的 JS 配置块补 `**/*.jsx`，或在质量扫描器中显式拒绝未登记的代码扩展名。

**`RA-02`（MINOR）　Host 预检仍放行三种绝对路径形态，与文档声明不符**

`docs/engineering-standards.md:33` 声明预检拒绝"POSIX/UNC 路径"，实测下列形态被接受：

```text
//server/share/secret            ACCEPTED   （正斜杠 UNC，Windows 与 Node 均按 UNC 解析）
//10.0.0.1/c$/Windows/win.ini    ACCEPTED
///etc/shadow                    ACCEPTED
\Windows\win.ini                 ACCEPTED   （单前导反斜杠 = 当前盘根相对）
对照：/etc/shadow、\\server\share、C:/Windows/win.ini 均正确拒绝
```

根因：POSIX 规则 `(?:^|[\s=:'"(])\/(?!\/)` 为放行 `https://` 而刻意豁免了连续 `//`，而 UNC 规则 `\\\\[^\\]` 只覆盖双反斜杠形态，没有单前导反斜杠规则。**已核实这是先存问题而非本次整改引入**：用首审基线 `41b7726` 的 `contract.ts` 对照，两条正则完全相同，因此这些形态在首审时同样被接受——是我首审的 27 项矩阵只测了反斜杠 UNC 和单前导 `/`，没有覆盖到。判 `MINOR` 的理由：这是 payload Schema 之前的纵深预检而非主控制，当前无任何消费者解引用这些值，且仅对特定形态 fail-open。**归属 `PB-05A`**（与 `m-04` 同批处理路径/标识规则），最迟真实 Host 实现（`PB-10`）开工前；同时应修正 `engineering-standards.md:33` 的措辞使其与实现一致。

**`RA-03`（MINOR）　质量层不去重生成登记项**

manifest 中重复登记同一路径（`["src/generated/out.ts", "src/generated/out.ts"]`）在质量层返回 `ACCEPTED (registered: 2)`。四个真实包由 `check-generated.ts` 的"恰好 1 项"断言兜住，但质量层自身没有去重或计数校验，未来新增生成包若其 `check-generated.ts` 写得更宽松就会失去这道保护。**归属 `G1-09`**，最迟 `G1-11` 前：在 `inspectGeneratedFileRegistry` 中对重复登记报错。

**`RA-04`（MINOR，由 `m-02` 转入未关闭）　`missing-project-field` 的断言仍不具区分度**

整改确有实质改进：Ajv 的 `required` 错误现在会拼出 `${instancePath}/${missingProperty}` 并正确做 JSON Pointer 转义（`~`→`~0`、`/`→`~1`），fixture 的 `expectedPath` 也由 `/` 改为 `/revision`，且该 pair 确实命中。但任务书第 2 节对 `m-02` 的验收标准是"**改成 `/` 或另一个缺失字段时断言必须失败**"，实测未达成：

```text
声明的 PROJECT_SCHEMA @ /revision      命中
改成 PROJECT_SCHEMA @ /                *** 仍然命中 ***
改成 PROJECT_SCHEMA @ /title           *** 仍然命中 ***
错误 code + 正确 path                   正确失败
该输入共返回 32 组不同的 code@path
```

根因是 fixture 同时缺失多个必填字段，Ajv 以 `allErrors` 为每个缺失字段各产生一条 `required` 错误，加上顶层 `oneOf` 失败产生的 `PROJECT_SCHEMA@/`，`.some(code && path)` 因此仍可被多个路径满足。**归属 `G1-09`**，最迟 `G1-11` 前：把该 fixture 改为**只缺失 `revision` 一个字段**（其余字段补全），使 `/` 与 `/title` 都不再命中。

## 5. 未执行项与限制

1. **未在真实仓库内植入任何探针文件**：`M-01`/`M-02` 的绕过与修复验证均在 `D:\tmp` 副本完成，并用真实仓库配置下的 `eslint --print-config` 交叉确认。
2. **生成器层的字节漂移未在本轮重跑**：仓库外副本缺少 `json-schema-to-typescript` 的解析路径（`NODE_PATH` 对 ESM/`createRequire` 无效），因此案例 A/E 以模块解析失败中止，属探针假象。该能力已在首审 `N-06` 用真实生成器对四个包逐字节证明，本轮由 `pnpm verify` 中四次 `generate:check` exit 0 回归覆盖。
3. **未执行 format、fix、generate 或 Git 历史操作**（任务书禁止）。
4. **未对全部 33 个变更文件做 AST 级等价比对**；重点核对了质量工具、Host 预检、项目契约与测试断言方向（均为增强）。
5. **范围外未审计**：数据库、真实 Host、Electron/ArkWeb、渲染/E2E、CI 服务、`G1-08 RA-01/RA-02` 的实现。
6. **供应链结论仍由 `G1-15` 签署**；本轮只确认 lockfile 未变、无新增依赖。

## 6. 复审汇总与最终结论

| 首审严重级别 | 首审数量 | 已关闭 | 未完全关闭 |
|---|---:|---:|---:|
| `BLOCKER` | 0 | — | 0 |
| `MAJOR` | 2 | **2** | **0** |
| `MINOR` | 6 | 5 | 1（`m-02` → 转为 `RA-04`） |

本次新增：`MINOR` 4 项（`RA-01`～`RA-04`），`BLOCKER`/`MAJOR` **0** 项。

**结论：`CONDITIONAL PASS`　——　`G1-09` 可作为后续原子任务（含 `G1-11`）的前置**

判定依据：

- **两项 `MAJOR` 的原始反例已逐条复跑并全部转为拒绝或安全行为**，无一项靠放宽断言、删测试或改口径关闭。`tsconfig.base.json` 与 `pnpm-lock.yaml` 零改动、手写 `any`/抑制指令计数为 0，确认严格度与供应链边界未被反向让步。
- 两项修复都选择了结构性方案：`M-01` 从"正则各写一份"改为**共享扩展名白名单 + 主动拒绝非规范大小写**（首审时 `.TS` 只是静默死文件，现在会让门禁失败）；`M-02` 从"路径自助豁免"改为**manifest 登记 + 生成器反向硬断言**。因此本轮新写的探针——四扩展名 × 体量/AST/typecheck 交叉矩阵、11 种登记形态、9 种裸 `%` 夹带组合——也一并被覆盖。
- 最能说明修复质量的是 `M-02` 的双向互锁：质量层单独会接受"把手写文件也登记进 manifest"，而这一形态恰好被生成器层的硬断言拒绝。我把 `document-model` 整包复制出仓库、篡改 manifest 后运行**真实** `check-generated.ts` 验证了 B/C/D 三种篡改全部触发守卫——这不是把旧豁免换个位置，而是两层互相确认。
- 不判 `PASS`，是因为 `m-02` 未达到任务书为它设定的验收标准（改成 `/` 或另一个缺失字段时断言仍然命中），另有 3 项新增 `MINOR`。四项均不阻塞消费者，且已在上文逐项写明归属与最迟关闭点：`RA-01`、`RA-03`、`RA-04` 归 `G1-09`，最迟 `G1-11` 前；`RA-02` 归 `PB-05A`，最迟 `PB-10` 开工前。
- **`RA-02` 需特别说明**：我已用首审基线的 `contract.ts` 逐条对照，确认那三种绝对路径形态在首审时同样被接受——**这是我首审 27 项矩阵的覆盖盲区，不是本次整改造成的回归**。据实记录以免误判整改质量。

**放行与后续**：实施者可据本复审把 `G1-09` 的路线图状态更新为最终完成，并把 `RA-01`～`RA-04` 登记到上述任务；`G1-11` 可以按自身 DoR 启动，且应在建立 CI 前一并消化归属 `G1-09` 的三项。首审 `N-08` 关于 `G1-07 NF-04` 与其 `m-05` 的技术结论，经本轮 `m-03`/`m-01` 复核依然成立，随本结论正式关闭。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本复审由未参与实施与修复的独立审计角色出具。`RA-01`～`RA-04` 同样不得由实施者自行关闭。

---
---

# 针对性确认（2026-07-20）：`d84f895..9e5531c`

> 确认者：Claude（未参与本轮实施的原审计角色）　实施者：Codex　任务书：[G1-09-claude-targeted-confirmation-task.md](G1-09-claude-targeted-confirmation-task.md)
>
> **本章节的结论取代上文复审的 `CONDITIONAL PASS`。** 首审与复审记录原样保留，未删除或改写任何一行。
>
> 命名说明：本节新增发现使用 `CF-xx` 前缀。

## 1. 范围与方法

补充整改提交 `9e5531c fix: close G1-09 conditional audit findings`（12 文件 +269/-94），新增 `packages/host-contract/test/host-paths.contract.test.ts`。

按任务书要求，**不采信 [补充整改记录](G1-09-conditional-remediation.md)，也不以 `pnpm verify` 全绿为结论**：逐条重跑 `RA-01`～`RA-04` 的原始反例，并主动寻找本轮引入的同级或更高问题。破坏性探针全部位于 `D:\tmp\g109*`，结束时已删除并核实无残留。未修改代码、Schema、fixture、测试、路线图、锁文件或 Git 历史。

环境按项目锁定基线：`node v24.17.0`（`D:\Applications\Node\node-v24.17.0-win-x64\node.exe`，已确认未命中 C 盘旧 Node）、`pnpm 11.15.1`、`--store-dir D:\DevCaches\pnpm-store`、`CI=true`。

## 2. 逐项确认

### `RA-02`　Host 根路径与 UNC —— **已关闭 ✅**

修复是一处规则重写：`(?:^|[\s=:'"(])\/(?!\/)` 改为 `(!isHttpUrl && /(?:^|[\s=:'"(])[\\/]/u)`——取消了为放行 `https://` 而对连续 `//` 的豁免，改为对 http(s) URL 整体豁免，并把单前导反斜杠一并纳入。

任务书点名的七个值，**全部返回精确的期望 code/path**：

```text
//server/share/secret            HOST_PLATFORM_FIELD_FORBIDDEN@/output/grant_id
//10.0.0.1/c$/Windows/win.ini    HOST_PLATFORM_FIELD_FORBIDDEN@/output/grant_id
///etc/shadow                    HOST_PLATFORM_FIELD_FORBIDDEN@/output/grant_id
\Windows\win.ini                 HOST_PLATFORM_FIELD_FORBIDDEN@/output/grant_id
output=//server/share/secret     HOST_PLATFORM_FIELD_FORBIDDEN@/output/grant_id
output=///etc/shadow             HOST_PLATFORM_FIELD_FORBIDDEN@/output/grant_id
output=\Windows\win.ini          HOST_PLATFORM_FIELD_FORBIDDEN@/output/grant_id
```

**判定是结构性修复而非命中特定字符串**：另测 15 种任务书与前两轮均未覆盖的等价形态，**15/15 全部拒绝**——百分号编码 `%2f%2f`、`%5cWindows`、双重编码 `%252f%252f`、空格/制表符/引号/括号/冒号前缀、`=`+反斜杠、四连斜杠、`/\` 与 `\/` 混合分隔、UNC 设备路径 `\\?\C:\x`、无前缀深层 `//a/b/c/d/e`。

**fail-closed 未扩大**：17 项合法对照 **17/17 接受**，含相对文件名、`assets\chart.png` 这类 Windows 风格相对路径、`grant_…`、`https://`/`http://`/大写 `HTTPS://`/带端口路径、`mailto:`、`data:`、`anchor:section-1`、`mode:fast`、`50% complete`、多字节 `报告 2026.pdf`、能力 ID、ISO 时间戳、sha256。

### `RA-03`　生成登记去重 —— **已关闭 ✅**

`inspectGeneratedFileRegistry` 新增 `packageRegistrations` 集合，以 `resolve(packageRoot, entry).toLowerCase()` 为键去重。仓库外假工作区直接调用真实函数：

| 场景 | 结果 | 授予的生成身份数 |
|---|---|---|
| 两个不同的合法生成文件 | `ACCEPTED`（无误报） | 2 |
| 完全重复登记 | `duplicate generated file registration` | **1** |
| Windows 大小写变体 `A.TS` | `duplicate generated file registration` | **1** |
| 解析后等价 `src/generated/./a.ts` | `duplicate generated file registration` | **1** |
| 反斜杠分隔等价 `src\generated\a.ts` | `duplicate generated file registration` | **1** |
| 三重重复 | 报告两次重复 | **1** |

四种等价写法均被识别为重复，且**同一真实文件只获得一次生成身份**（计数恒为 1），符合任务书要求。既有门禁未回归：未登记的生成目录文件、登记不存在的文件、`../` 逃逸仍分别报错。

### `RA-04`　单一 Schema 分支与精确路径 —— **已关闭 ✅**

修复按 `contract_kind` 预分派到四个分支校验器（`$ref` 指向各 `$defs`），分支通过后仍会再跑顶层 `oneOf`，因此收敛了诊断而未放宽接受集合。fixture 也已改为**只缺 `revision`** 一个字段。

1. **恰好一项**：该 fixture 返回 `1` 条 issue，即 `PROJECT_SCHEMA@/revision`（复审时为 32 组不同 code@path）。
2. **换成其他路径全部不命中**：`/`、`/title`、`/document`、`/materials`、`/schema_version` 逐一测试，**均不匹配**——这正是复审 `RA-04` 未达成、本轮达成的判据。
3. **四种 `contract_kind` 各自单字段缺失**，均只报对应分支错误，不混入其他分支或根路径：

   ```text
   project              缺 /revision         -> 1 条  PROJECT_SCHEMA@/revision
   knowledge-package    缺 /created_at       -> 1 条  PROJECT_SCHEMA@/created_at
   semantic-audit-event 缺 /sequence         -> 1 条  PROJECT_SCHEMA@/sequence
   compatibility        缺 /history_policy   -> 1 条  PROJECT_SCHEMA@/history_policy
   ```

4. **畸形 `contract_kind` 安全失败**：未知值、缺失、数字、`null`、数组、以及输入为数组/`null`/字符串，共 8 种，**全部不抛异常**，回落到顶层 `oneOf` 路径给出问题码。带 getter 的 `contract_kind` 访问器**调用次数为 0**（受共享 `inspectData` 的原型/访问器守卫拦截），新分派逻辑没有绕开该守卫。
5. **回归**：四种合法 fixture 全部 `ok`；四种未来版本分别命中各自版本字段路径；敏感模型标识仍返回 `PROJECT_MODEL_IDENTIFIER_INVALID@/subject_model_context/provider`；上游兼容 fixture 仍有效。

### `RA-01`　`.jsx` ESLint 覆盖 —— **目标达成，但修复方式引入 `CF-01`（见下）**

`.jsx` 本身确已修好：

```text
--print-config       .js / .jsx / .mjs / .cjs  -> 均匹配配置，no-unused-vars 生效
--print-config       .ts / .tsx / .mts / .cts  -> 均匹配配置，no-explicit-any 生效
真实 ESLint 运行     bad.jsx  exit=1  FAILS on no-unused-vars
                     good.jsx exit=0  clean（JSX 语法正常解析）
                     bad.js / bad.mjs / bad.cjs 均 exit=1 FAILS on no-unused-vars
```

但实现方式是把 `eslint.configs.recommended` 由**无 `files` 键**改为 `files: ["**/*.js","**/*.jsx","**/*.mjs","**/*.cjs"]`。在 ESLint 扁平配置中，缺省 `files` 意味着该配置块适用于所有被检查的文件；一旦加上 `files`，它就只对 JavaScript 生效。后果见 `CF-01`。因此 `RA-01` 的**目标**达成，但**不能在 `CF-01` 未处理前签署关闭**。

## 3. 本轮引入的新发现

**`CF-01`（MAJOR）　`eslint.configs.recommended` 被限定到 JavaScript，导致全部 45 条实际生效的基础规则从所有 TypeScript 文件上消失**

- **证据**：[`eslint.config.mjs`](../../eslint.config.mjs) 中 `-  eslint.configs.recommended,` → `+  { ...eslint.configs.recommended, files: ["**/*.js","**/*.jsx","**/*.mjs","**/*.cjs"], … }`。
- **独立复现**：用 ESLint 的 `calculateConfigForFile` 对真实仓库配置求解——

  ```text
  eslint:recommended 共 64 条
  当前配置下生效条数：  .js = 64      .jsx = 64      .ts = 0
  ```

  其中 45 条在 `.ts` 的解析结果中**完全不存在**（静默失效），另 19 条本就由 typescript-eslint 显式关闭（`no-undef`、`no-dupe-keys`、`no-unused-vars` 等，TS 编译器覆盖，属正确设计）。静默失效的 45 条包含 TypeScript 编译器**不会**报错的真实缺陷类规则：

  ```text
  no-debugger              use-isnan                 valid-typeof
  no-cond-assign           no-constant-condition     no-constant-binary-expression
  no-fallthrough           no-dupe-else-if           no-duplicate-case
  no-invalid-regexp        no-unsafe-finally         no-unsafe-optional-chaining
  no-self-assign           no-sparse-arrays          no-useless-escape
  no-async-promise-executor  no-prototype-builtins   no-loss-of-precision
  …（共 45 条）
  ```

- **因果关系已隔离验证**：把仓库完整配置在内存中重建，**只切换 `recommended` 上的 `files` 键**，其余块（ignores、linterOptions、tseslint 四扩展名块、三条自定义规则）保持不变：

  ```text
  OLD shape （recommended 无 files）      .ts=45   .js=64   .jsx=0     <- 补充整改前
  NEW shape （recommended 限定 JS）       .ts=0    .js=64   .jsx=64    <- 当前
  FIX shape （不限定 + 单独 jsx 块）      .ts=45   .js=64   .jsx=64    <- 两者兼得
  ```

  这排除了"本来就没生效"的可能：整改前 TypeScript 确实生效 45 条，整改后归零。第三行说明一个不牺牲任何一侧的写法是存在的。

- **实际/预期**：预期修好 `.jsx`（仓库中当前没有任何 `.jsx` 文件）不应削弱其他语言的检查。实际上以"仓库中不存在的文件类型"换掉了"占全部手写代码绝大多数的 `.ts`"上的 45 条规则。
- **影响**：`docs/engineering-standards.md:9` 把 ESLint 列为两大静态检查支柱之一，该描述对 TypeScript 已不再成立；`pnpm lint` 仍然全绿，属于典型的"绿色但门禁已收窄"。当前代码没有违反这些规则（`pnpm verify` exit 0 属实），因此**不是已发生的缺陷，而是门禁的静默削弱**。定级 `MAJOR` 的理由：(a) 由本轮整改引入，属回归；(b) 影响面是仓库中几乎全部手写代码；(c) `G1-11` 即将把该配置固化进 CI，一旦固化就会被"CI 全绿"背书；(d) 修复成本极小（保持 `recommended` 不限定，另开一个只含 `ecmaFeatures.jsx` 的 `**/*.jsx` 块即可，已验证可同时满足三种扩展名）。
- **建议归属**：`G1-09` 本任务修复，**必须在 `G1-11` 之前**，并补一条断言"`.ts` 上 `no-debugger`/`use-isnan` 等基础规则仍然生效"的反测，避免同类回归再次静默发生。

## 4. 共同回归

| 检查 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store`（CI=true） | 通过，10 个工作区项目；`node` 解析到 D 盘 24.17.0，未命中 C 盘旧 Node |
| `pnpm verify` | **exit 0**：质量护栏 58 源码/191 仓库文件 → 层级审计 **14** 个测试文件 → unit 20/20 → config 7/7 → contract-runtime 4/4 → document 15/15 → template 15/15 → host 31/31 → project 24/24（合计 **116**）→ **9** 个包 typecheck → production build 成功 |
| `pnpm-lock.yaml`、`tsconfig.base.json`、各包冻结 Schema、`src/generated/*` | 本轮范围内**零改动** |
| 手写 `any` / TS 抑制指令 / ESLint 内联禁用 | 匹配数 **0**（扫描面含 `.ts/.mts/.cts/.mjs/.jsx`） |
| 体量预警 | `quality:check` 未输出任何 `WARN`；`host.contract.test.ts` 已由 300+ 降至 207 行 |
| **拆分是否为真**（任务书 §3 专项） | `host-paths.contract.test.ts` 100 行、**含 3 个真实用例**，已被层级审计发现（14 个文件）并登记进 contract 层（9 个文件），实际执行。三个 host 测试文件分别通过 22 / 3 / 6 项，合计 **31**，与 `verify` 中 host-contract 的 31 项一致——是真实迁移而非仅删行 |
| `git status --short`（确认前 / 后） | 两次均为空；临时探针 `D:\tmp\g109t`、`g109jsx`、`g109tsrec` 已删除并核实无残留 |

## 5. 未执行项与限制

1. **未在仓库内植入探针文件**：`.jsx`/`.js`/`.mjs`/`.cjs` 的真实 ESLint 失败验证在 `D:\tmp` 副本完成；TypeScript 侧因仓库配置启用 `projectService`，仓库外文件会先报 parsing error，故改用 ESLint 官方 `calculateConfigForFile` 求解已生效规则集——这是"哪些规则适用"的权威答案，无需违规文件。
2. **未运行 format、fix、generate 或任何修改 Git 历史的命令**。
3. **生成器字节漂移未在本轮重跑**：由 `pnpm verify` 中四次 `generate:check` exit 0 回归覆盖；逐字节证明见首审 `N-06`。
4. **范围外未审计**：数据库、真实 Host、Electron/ArkWeb、渲染/E2E、CI 服务、`G1-08 RA-01/RA-02` 的实现。
5. 供应链结论仍由 `G1-15` 签署；本轮仅确认 lockfile 零改动、无新增依赖。

## 6. 汇总与最终结论

| 复审条件项 | 结论 | 依据 |
|---|---|---|
| `RA-01` `.jsx` ESLint 覆盖 | **目标达成，但不予签署关闭** | `.jsx` 已被真实 ESLint 检查并能失败；但修复手段引入 `CF-01`，须与之一并处置 |
| `RA-02` Host 根路径与 UNC | **已关闭 ✅** | 7/7 精确 code@path；15/15 等价形态拒绝（结构性）；17/17 合法值不误杀 |
| `RA-03` 生成登记去重 | **已关闭 ✅** | 四种等价写法均判重且身份计数恒为 1；两个合法文件不误报；既有门禁未回归 |
| `RA-04` 单一分支与精确路径 | **已关闭 ✅** | 恰好一条 `PROJECT_SCHEMA@/revision`；五种换路径均不命中；四类各一条；畸形输入不抛异常、访问器 0 次 |

本轮新增：`MAJOR` **1** 项（`CF-01`），`BLOCKER` 0 项，`MINOR` 0 项。

**结论：`FAIL`**

依任务书第 4 节"任一 `BLOCKER` 或 `MAJOR`：`FAIL`，不得把 G1-09 标为最终完成"。**`G1-11` 继续不得启动。**

判定要点：

- 本轮实施在三项上是**干净利落的结构性修复**：`RA-02` 从"为放行 https 而豁免 `//`"改为"对 http(s) URL 整体豁免"，因而 15 种我新构造的等价形态（编码、空白、引号、括号、混合分隔符、UNC 设备路径）一并被覆盖，且 17 项合法值零误杀；`RA-03` 以解析后绝对路径小写为键去重，四种等价写法全中且身份计数恒为 1；`RA-04` 用 `contract_kind` 预分派把 32 组诊断收敛为恰好 1 条，同时保留顶层 `oneOf` 复核、未放宽接受集合、未破坏访问器守卫。三项均无保留意见。
- 阻断只有一条，且与三项修复的质量无关：**`RA-01` 的修法用错了工具**。为让 `.jsx`（仓库中并不存在的文件类型）获得规则，把 `eslint.configs.recommended` 限定到 JavaScript，结果让 45 条实际生效的基础规则从所有 TypeScript 文件上静默消失。我把仓库配置在内存中重建、只切换那一个 `files` 键，确认整改前 `.ts` 生效 45 条、整改后为 0，且存在同时满足三者的写法——因此这既不是"本来就没生效"，也不是"必须二选一"。
- **`pnpm verify` 仍然 exit 0，正是问题所在**：门禁收窄不会让绿色变红。这与宪法 18「可信失败优先于虚假通过」直接冲突，也正是任务书要求我"检查本轮整改是否引入同等级或更高的新问题"的意义所在。若在 `G1-11` 之后才发现，这套配置已被 CI 固化并以"必需检查全绿"背书。

**关闭路径**：由 Codex 修复 `CF-01`（保持 `eslint.configs.recommended` 不限定 `files`，另开一个仅提供 `ecmaFeatures.jsx` 的 `**/*.jsx` 块——我已验证该写法可使 `.ts`=45、`.js`=64、`.jsx`=64 同时成立），补一条断言 TypeScript 上基础规则仍生效的反测，复跑 `pnpm verify` 后由 Claude 复核 `CF-01` 与 `RA-01` 并一并签署。`RA-02`、`RA-03`、`RA-04` 本次已确认关闭，复核时无需重跑。

> 依 `AGENTS.md` 与 `CLAUDE.md`，本确认由未参与实施与修复的独立审计角色出具，只签署事实、不提供也不应用补丁。`CF-01` 与 `RA-01` 不得由实施者自行标记关闭。
