# A-01 后续承接项

> 登记惯例：每条含内容、归口、要求。A-01 审计发现由审计者登记，实施者
> 不自行关闭。

## 1. web bundle 含 Ajv（145 kB）→ A-02

- **内容**：A-01 原型经 `UX_STATES` 模块级自校验把 Ajv 打进浏览器 bundle
  （ADR-0028 §2 已知代价）。
- **要求**：A-02 接真实 UI 时评估瘦身（拆纯数据入口或构建期校验），不
  得默认接受该体积。

> **处置（2026-08-05，A-02）：已消费，关闭。** ux-state `./data` 纯数据子路径（零 Ajv）+ apps/web 全量改道；bundle 145,462 B → 12,351 B（gzip 5.09 kB），`ajv` 命中 0——Claude 复审独立重跑生产构建逐位一致，且冻结义务字符串确在包内（真改道非剪数据）；parity 守卫防漂移。

## 2. `types:["node"]` 残余 → A-02/后续

- **内容**：ADR-0028 §5 的 eslint 收口是文本闸非类型闸；类型层面
  `process` 仍可 typecheck（不使用即不报错），动态拼接不在静态分析范围。
- **要求**：若 A-02 扩大 apps/web 代码面，评估拆
  `tsconfig.src.json`/`tsconfig.node.json`（需先解 typecheck-coverage
  门禁的逐字脚本约束）。

## 3. 浏览器 Host registry 是否改 degraded → A-02

- **内容**：PB-10 #5 本棒取文档明示路径，7 项 `supported` 登记未改。
- **要求**：A-02 接真实 UI 时评估改 `degraded` 或接持久化实现。

> **处置（2026-08-05，A-02）：已消费，关闭。** 评估结论：维持「文档明示」路径（浏览器 Host 非持久、仅开发联调），7 项 `supported` 登记不改；新增能力 `file.import.select` 如实登记 `unsupported` + `BROWSER_HOST_NO_IMPORT_PIPELINE` fallback（apps/web/src/host.ts:71-88，Claude 复审抽验一致），UI 呈现诚实降级不循环弹窗。

## 4. 状态机 additive 升级纪律 → 12 个消费者

- **内容**：`stateVersion 1.0.0` 冻结；演进须新 schema 文件 + 双版本
  reader（document-model / ADR-0010 纪律）。
- **要求**：任何消费者不得静默改 1.0.0 语义；升级走 ADR + 独立审计。

## 5. 冻结 1.0.0 的内容锚定不完整（A-02 复审 MINOR-3 登记）→ 业主裁定（A-01 契约加固 / A-13）

- **内容**：A-01 复审已把 `forbiddenSemantics` 12 态逐字钉死，但相邻字段
  未钉：四态 `requiredPresentation`（除 empty-project）、`a11y.textEquivalent`、
  `a11y.focusEntry`、`label` 均无内容锚定。A-02 复审逐条变异实测：把
  `importing.requiredPresentation` 的「原文件只读」（A-02 红线的用户可见
  表述）改为「原文件只读×」后，unit 327/327、contract 254/254、A-02 E2E
  5 pass 全绿，全仓无一处变红。单一真源逐字对账对同一真源恒真，防静默
  改写只能靠内容钉定测试。
- **要求**：按 A-01 处理 `forbiddenSemantics` 的同款做法补钉（纯增测试，
  不动冻结数据），把 12 态全部用户可见字段逐字锚定。**归口已由业主裁定
  （2026-08-05）：A-01 契约加固，不拆给 A-13**——缺口横跨
  requiredPresentation + a11y.* + label，拆开必留部分覆盖；钉定只落在契约
  测试层（packages/ux-state/test/ux-states.contract.test.ts），不得复制进
  apps/web 或场景层（内容钉进消费者即成第二份真源，踩本文件 #4 要防的
  漂移）。未加固前任何文档不得宣称 1.0.0 防静默改写已机械化全覆盖。
- **来源**：[A-02-claude-audit-report §7.5 MINOR-3](A-02-claude-audit-report.md)（2026-08-05 签署 PASS，不阻断 A-02 合并）。

> **处置（2026-08-05，A-01 契约加固）：已实施，待独立审计。** 12 态 × 5 字段（`label` / `requiredPresentation` 逐条按序 / `a11y.textEquivalent` / `a11y.focusEntry` / `cancelable`）以测试内写死字面量逐字钉定，纯增落于 `packages/ux-state/test/ux-states.contract.test.ts`（478 行，file-size 门禁 500 硬顶内），冻结数据 `states-1.0.0.json` 零字节改动，消费者层无钉定复制；60 格变异矩阵（含「原文件只读」复刻变异）+ 顺序钉定补格 + 恒真反向证据见 [A-01-minor3-remediation](A-01-minor3-remediation.md)。**上述限制句本棒不撤**：按任务书 §5 须待独立审计签署后方可解除，解除时须注明覆盖范围 = 12 态 × 5 字段。
