# PB-07 实施记录：可合并操作模型与三层记录隔离

- 日期：2026-07-29
- 状态：已实现，待 Claude 独立审计
- 基线：`origin/main` 的 PB-02/PB-03/PB-04 已签署状态

## 交付

`probes/pb-07-yjs/` 是独立、可锁定安装的 Yjs 13.6.27 最小候选探针。它真实建立两个
离线 `Y.Doc` 副本，分别提交一个稳定节点改写和一个稳定节点插入，然后交换双方的 Yjs update。
探针断言两份状态收敛，并逐个核验事务 `affectedNodeIds` 与现存节点 ID 的稳定映射。

`records.schema.json` 将三层记录严格拆成：

- 编辑历史：事务 ID、actor、命令和受影响节点；
- CRDT 合并记录：候选名、merge ID、state-vector/update digest；
- 语义审计：用户责任主体、裁决动作和 locator。

测试向语义审计注入事务 ID，确认 `additionalProperties: false` 语义的精确字段守卫拒绝它。
没有自动同步、网络、存储、UI 或生产 CRDT API；没有把探针声称为 Alpha 同步。

## 供应链与冻结物

候选依赖只在 `probes/pb-07-yjs/package-lock.json` 中固定。根 `pnpm-lock.yaml`、`sbom/sbom.json`、
G1-04 契约、PB-02 操作层和 PB-03/04 事务/工具契约均未修改。候选及二级依赖均为 MIT，
来源、integrity 和 SHA-256 记录于 ADR-0019。

## 实际验证

在隔离目录运行 `npm ci --ignore-scripts && npm test`：2/2 通过（离线双副本收敛/稳定映射、
三层 schema 隔离）；`npm audit --omit=dev` 为 0 vulnerabilities。根仓 `pnpm lint`、测试层
审计均通过。

本机两次 `pnpm verify` 都仅在既有的
`packages/pdf-export/test/cancellation.render.test.ts` 浏览器取消测试失败（一次为 2506 ms 超过
2 s，另一次为 abort 时 DevTools websocket 失败）；该测试随后单包复跑 65/65 通过。此失败未
由 PB-07 改动触及，且不被宣布为通过；远程 CI 是交审前的最终验证。隔离探针也不被根
`pnpm verify` 冒充为生产测试。
