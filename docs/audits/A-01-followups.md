# A-01 后续承接项

> 登记惯例：每条含内容、归口、要求。A-01 审计发现由审计者登记，实施者
> 不自行关闭。

## 1. web bundle 含 Ajv（145 kB）→ A-02

- **内容**：A-01 原型经 `UX_STATES` 模块级自校验把 Ajv 打进浏览器 bundle
  （ADR-0028 §2 已知代价）。
- **要求**：A-02 接真实 UI 时评估瘦身（拆纯数据入口或构建期校验），不
  得默认接受该体积。

## 2. `types:["node"]` 残余 → A-02/后续

- **内容**：ADR-0028 §5 的 eslint 收口是文本闸非类型闸；类型层面
  `process` 仍可 typecheck（不使用即不报错），动态拼接不在静态分析范围。
- **要求**：若 A-02 扩大 apps/web 代码面，评估拆
  `tsconfig.src.json`/`tsconfig.node.json`（需先解 typecheck-coverage
  门禁的逐字脚本约束）。

## 3. 浏览器 Host registry 是否改 degraded → A-02

- **内容**：PB-10 #5 本棒取文档明示路径，7 项 `supported` 登记未改。
- **要求**：A-02 接真实 UI 时评估改 `degraded` 或接持久化实现。

## 4. 状态机 additive 升级纪律 → 12 个消费者

- **内容**：`stateVersion 1.0.0` 冻结；演进须新 schema 文件 + 双版本
  reader（document-model / ADR-0010 纪律）。
- **要求**：任何消费者不得静默改 1.0.0 语义；升级走 ADR + 独立审计。
