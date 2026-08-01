# A-01 实施记录 · 冻结 Alpha 信息架构、状态机与缺失设计稿处置

> 任务行：[路线图 §7 A-01](../implementation-roadmap.md)（R-UX/R-SCOPE）
> 分支：`a-01-ux-freeze`　PR：#53（挂起不合入，待独立审计）
> 任务书：[A-01-implementation-task](A-01-implementation-task.md)（Claude 起草）

## 1. 前置裁定（业主 2026-08-01 书面）

| 裁定 | 结论 | 落盘 |
|---|---|---|
| D1 缺失设计稿处置 | 正式废弃（措辞业主逐字批准） | [决策 #14](../../决策记录.md)（commit `9cacde2`） |
| D2 原型形态 | L0 状态机契约包 + apps/web 最小可运行原型 | ADR-0028 §2 |
| D3 分页接口 | 状态机按增量分页建模，契约级禁全量分页 | ADR-0028 §3 |

**新建 workspace 报批**：`packages/ux-state`（L0）随计划批准获得业主授权；
冻结归属表仅增此一行。

## 2. 工作分解与提交

| W | 内容 | commit | 验证 |
|---|---|---|---|
| W0 | 决策 #14 + 分支 | `9cacde2` | prettier |
| W1 | `@wenshu/ux-state` 契约包 | `14e9aca` | 包 22/22、typecheck、generate:check、quality:check（31 workspaces）、supply:check |
| W2 | G2-03 MI-03 关闭 | `f8f4e96` | tools/quality 35/35、unclassified 14→11 |
| W3 | apps/web 原型 + eslint 收口 | `f3405b2` + 修复 `（本提交）` | apps/web 17/17、typecheck、build、lint、SBOM 零漂移 |
| W3-fix | **main.ts 挂载版本被 W3 反例回退步骤误丢**——W3 提交中 main.ts 实为旧 hello-world（构建产物 0.82 kB 旧 hash 在 verify 第四轮暴露）；教训：反例注入后的回退对**未提交文件**不得用 `git checkout`（会回到上次提交版本而非改动前），应定向删除注入行。本修复提交恢复薄挂载，构建回到 145 kB 原型 bundle | `（本提交）` | build 145 kB、lint、typecheck |
| W4 | ADR-0028/冻结文档/承接项注记/本记录/审计任务书 | 本提交 | prettier、quality:check |
| W5 | 全量 verify + 变异自证 + 推送 | 见 §4 | 见 §4 |

另：审计者 PB-12 报告 §9 补记经 main `cab9102` 落盘（与 main 历史对齐，
不经本 PR）；审计者 A-01 任务书 `A-01-implementation-task.md` 随 W4 落盘。

## 3. 关键设计决定（详见 ADR-0028）

- D4：包根配置文件 auxiliary 规则集（反例 3 + 正面 3）。
- D5：eslint 禁 Node 全局收 `types:["node"]` 洞，不拆 tsconfig；残余如实
  登记（文本闸非类型闸，动态拼接不在静态分析范围）。
- D6：PB-10 #5 取「文档明示」路径，registry 登记不改。
- 条件扩展从 schema if/then 改代码语义层（生成物退化问题，ADR-0028 §8.1）。
- `fullRepagination` 禁令用 property schema `false`（Ajv strict 拒绝
  `not.required` 未定义属性，ADR-0028 §8.2）。

## 4. W5 验证记录

- 本地 `pnpm verify` 全量绿（含 quality:check 31 workspaces、contracts:check
  含 ux-state 22/22、test:unit 含 apps/web 17/17、typecheck、build）。
- **真实浏览器冒烟**（W3-fix 后）：vite preview + 本机 Chrome headless
  `--dump-dom` 实测——标题/IA 八项/12 状态切换按钮（aria-pressed 工作）/
  排除项文案/requiredPresentation 渲染全部在场，可运行性非自違。
- 推送前教训落实：第一轮 verify 在 format:check 挂（5 个新文件未过
  prettier）——推送/verify 前必须全仓 `pnpm format:check`，已修复重跑绿。
- 台账行时点教训：A-01 行提前写入被 G2-04 门禁拦
  （`roadmap-ledger-missing-report-link`：有行必须链接自身审计报告）——
  正确时点是**审计报告落盘当轮**补行（同 PB-12 先例），已回退待审计。
  首轮另被拦一次断链（`../alpha-ux-freeze.md` 应为同目录引用），门禁两个
  面向都真实生效。
- 最终验证 run 待推送后补记于此。

### 变异自证（全部红后回退，回退后 ux-state 22/22 绿）

| # | 变异 | 结果 |
|---|---|---|
| M1 | states-1.0.0.json 删 `empty-project` 一条 requiredPresentation | ux-state 钉内容测试红（21/22）✅；web 画廊传输层绿——内容钉在契约层为设计意图，web 层钉的是「逐字搬运」 |
| M2 | 分页扩展加 `fullRepagination: true` | 模块加载即 fail-closed：`UX_STATE_SCHEMA@/states/5/pagination/fullRepagination`，ux-state 与 web 双红 ✅ |
| M3 | 加非法转移 `ghost-state` | `UX_STATE_TRANSITION_DANGLING@/states/0/transitions/2`，自校验 throw ✅ |
| M4 | apps/web/src 注入 `process.env` / `globalThis.process` | `pnpm lint` 双双拦下（no-restricted-globals / no-restricted-syntax）✅ |

## 5. 承接项处置（业主更正后口径）

- **本棒关闭**：G2-03 MI-03（W2）、PB-10 followups #5（W3，文档明示路径）。
- **仅作输入、归口不变、不代签**：PB-11 #4/#6（→A-02/A-11）、PB-12 N3
  （→A-12，crash-recovery 三字段证明状态机可表达）。
- **维持**：PB-12 N2（→A-12/后续，与状态机无关）。
- 源 followups 文件均已补处置注记。

## 6. 边界声明

- 原型是验收工装：无样式体系、非设计系统、非组件库；不猜 a566a20 内容
  （决策 #14 后不引入任何外部稿未归档视觉元素）。
- PoC-A DEGRADE（决策 #11A）：状态机不假装排版问题已解决；不以 PB-12
  通过为排版背书；`PA-14U` 后置事实如实保留。
- 12 行枚举双来源（路线图 6 类 + ux-spec §4 必须呈现）已按业主更正写明，
  未加严未放宽。
