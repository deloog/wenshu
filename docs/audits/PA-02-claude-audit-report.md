# PA-02 正式商务 fixture 映射为受控模板模型 · Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-24
> 实施基线：PR #8 分支 `pa-02-template-map` tip `cd71e8c`（`d961df2` 代码 + `cd71e8c` 台账）；base `origin/main` = `044b9f5`
> 远程验证：PR #8 check-runs **8/8 pass**（static/unit-config/contracts/typecheck/build-test/build-staging/build-production/security）；`mergeable=MERGEABLE`、`mergeStateStatus=CLEAN`
> 审计方法：仓外 `git worktree` 拉取 PR 分支、隔离 `pnpm install`、独立复跑套件与变异；探针收尾已删除。
> 写入边界：本轮仅新增本文件；未改代码/测试/Schema/fixture/配置；GitHub 只读，未 push/merge/触发 Actions。

---

## 1. 结论

**PASS —— PA-02 通过，可合并。** 无 BLOCKER/MAJOR/MINOR 发现。

- 交付为纯声明式绑定包 `@wenshu/template-map`，范围严格落在路线图 PA-02 行；无任意执行面、无逐页内容特例、零文件访问面。
- 路线图三项验收（未知字段 / 版本不兼容 / 越权能力拒绝）均有真实契约测试，我独立复验通过。
- 实施记录声称的**三处变异我在仓外 worktree 独立复跑全部变红**（另补一处，共 4/4 红）。
- 已推送且 PR CI 8/8 绿，**签署即时生效**；合并由业主/Codex 执行。

---

## 2. 交付面与纯度

- 新包 `packages/template-map`：`map.ts`(95) / `font-registry.ts`(78) / `types.ts`(49) / `index.ts`(3) + 契约测试(207，9 用例) + `package.json`/`tsconfig.json`。
- **纯模型零文件访问面**：`map.ts`/`font-registry.ts`/`types.ts` 无任何 `node:`/`fs`/`fetch`/`eval`/`Function`/`child_process` 引入——只接收 `input: unknown` 与已解析的字体集，返回结果；文件读取留在测试层。
- 依赖只有 workspace 包（`contract-runtime`/`document-model`/`template-model`）+ catalog devDeps；**零新增第三方**。
- `contracts:test` 已串入 `@wenshu/template-map`（接线测试承重，删包断链）。

## 3. 安全与绑定核验（独立实证）

**安全（委托 G1-05 + 边界复验）**：`mapTemplate` 先经 `@wenshu/template-model` 的 `validateTemplate`（未知字段/DSL 版本/执行面/预算），再绑定。我把执行面键注入**合法 fixture**经 `mapTemplate` 端到端复验：`script`/`eval`→`TEMPLATE_DYNAMIC_CODE_FORBIDDEN`、`file`/`path`→`TEMPLATE_FILE_ACCESS_FORBIDDEN`、`url`/`network`→`TEMPLATE_NETWORK_ACCESS_FORBIDDEN`、`capability`/`permission`→`TEMPLATE_CAPABILITY_FORBIDDEN`、原型污染 `__proto__x`→`TEMPLATE_SCHEMA`——**全部拒绝，且诊断不回显注入的哨兵值**。未知字段拒绝而非忽略、未来 DSL 版本与非空 `migration_rules` 拒绝。

**绑定一 · 文档契约版本**：`supported_document_schema` 必须精确等于 `wenshu.report/${DOCUMENT_SCHEMA_VERSION}`（document-model 冻结常量 = `0.1.0`）。**决定性经实证**：`mapTemplate(fixture, fontSet, "0.2.0")` 注入模拟版本漂移 → `TEMPLATE_MAP_UNSUPPORTED_DOCUMENT_SCHEMA` at `/supported_document_schema`。注入参默认取冻结常量、测试注入——正是防 PA-A1「邻层守卫代打」的设计。另有跨契约 const 一致性测试（template.schema.json 的 const 与 `DOCUMENT_SCHEMA_VERSION` 不得漂移）。

**绑定二 · 字体逻辑注册**：`parseApprovedFontSet` 把**真实 G1-13 `font-manifest.json`** 收窄为受控注册表（只取 family/version/weight/style/postscript_name，**丢弃 path/sha256/bytes**）；`fonts.primary/version` 必须匹配、每个声明字重必须命中注册表。实证：错误 family→`TEMPLATE_MAP_FONT_UNKNOWN`；schema 合法但注册表没有的字重 `300`→`TEMPLATE_MAP_FONT_WEIGHT_UNREGISTERED`（证明绑定层拦住了 schema 枚举放行的值）；注册表对畸形/重复字重清单 fail-closed。

**模型纯净性**：真实 fixture 映射输出**深度冻结**、序列化**不含 `.otf`/`sha256`/`assets/`**（零文件泄露）；映射后篡改输入不影响输出（**无别名污染**）。

## 4. 守卫变异 —— 仓外独立复跑（基线 9/9，还原 `git checkout` 干净）

| 变异 | 结果 |
|---|---|
| 删文档契约版本绑定守卫 | 8/1 变红 ✔ |
| 删字体 family/version 绑定 | 8/1 变红 ✔ |
| 删字重注册绑定（未注册字重放行） | 8/1 变红 ✔ |
| 注册表重复字重守卫置空（我补） | 8/1 变红 ✔ |

三处声称变异全部独立复现变红。实施记录如实记录了一次「跨文件编辑静默漏改致首跑意外红灯」的工具教训并采用「编辑后 grep 确认」——与此前 heredoc 假绿同类,处置诚实。

## 5. 门禁、冻结物与范围

- `pnpm --filter @wenshu/template-map test`：**9 pass / 0 fail**；PR CI `contracts` job 在 ubuntu 复现。
- `pnpm verify`：PR CI 8/8 全绿（typecheck/static/security/build 均过）。
- 冻结物零漂移：schema/fixture/字体/生成物/template-model 未触碰；`pnpm-lock.yaml` 增量**仅新 workspace 包 importer 条目**（deps 为 `link:` 到 workspace 包，无新第三方 tarball）；SBOM **147→147**。
- **范围纪律**：映射为纯声明式字段绑定,无 CSS/布局/分页/PDF/迁移执行,`migration_rules` 仍由 schema 强制为空;**未见任何逐页内容特例**（路线图 FAIL 条件未触发）。诊断只有 `code + JSON path`,不回显字段值（§5）。

## 6. 发现

无。PA-02 实现干净,验收逐条可判定,守卫均承重。

## 7. 结论与交接

**PA-02 独立审计 PASS，可合并 PR #8。** 合并由业主/Codex 执行;合并后 main CI 复跑即完成落地。PA-04（模板 token → CSS/布局白名单解释）消费本受控模板模型时,注意 `ControlledTemplate` 的 page/layoutTokens/paginationRules/validators/exportProfile 为透传契约字段,派生结构在 PA-04 内扩展。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
