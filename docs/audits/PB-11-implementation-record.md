# PB-11 实施记录：知识包导出与干净环境重导入

> 任务 ID：PB-11
> 范围来源：路线图 §6
> R-* 标注：R-OUTPUT / R-DATA
> 状态：已实现，待独立审计

## 1. 一句话完成目标

实现 `@wenshu/knowledge-package`（L2），使项目能在已授权目录内导出完整知识包 ZIP，
并在全新目录/全新 Node 进程中重新导入；所有真源 entry 的 SHA-256 必须从真实字节计算，
闭合 G1-07 m-01。

## 2. 范围内/范围外

范围内：
- 知识包 ZIP 容器（自写最小 ZIP，node:zlib，零新增第三方运行时依赖）。
- canonical JSON/NDJSON 序列化与 SHA-256 字节校验。
- 导出 API `exportKnowledgePackage`、导入 API `importKnowledgePackage`。
- 与 `@wenshu/project-storage` grant/原子写/原件保护集成。
- 干净环境 round-trip、篡改拒绝、派生可删、事务回滚的集成测试。
- ADR-0026、实施记录、Claude 审计任务书、更新 `docs/project-contract.md` 说明 m-01 关闭方式。

范围外（ roadmap 原文，逐条可对账）：
- PB-12 端到端 E2E 与闸门报告。
- A-11 项目列表/搜索 UI。
- docx/Markdown 导出（A-10X）。
- ArkWeb 真机验证。
- 派生索引成为真源的任何设计。

## 3. 关键决策与业主裁定

| 决策 | 选项 | 裁定 | 依据 |
|---|---|---|---|
| D1 容器格式 | node:zlib + 自写最小 ZIP / 第三方库 | 自写 ZIP | 零新增运行时依赖纪律 |
| D2 落点包 | 新建 `@wenshu/knowledge-package` / 扩展 project-storage | 新建 L2 包 | 职责隔离，需新增 workspace 已获批 |
| D3 Host 边界 | 新增 host 读能力 / L2 直接文件 IO | L2 直接 IO，以 grant 目录为边界 | Host 只负责目录授权，PB-11 负责格式 |

## 4. 实现要点

### 4.1 包结构

```text
packages/knowledge-package/
├── package.json        # L2，依赖 project-contract/document-model/template-model/project-storage/contract-runtime
├── tsconfig.json
├── src/
│   ├── index.ts        # 公开 API
│   ├── export.ts       # exportKnowledgePackage
│   ├── import.ts       # importKnowledgePackage + grant 集成
│   ├── types.ts        # 选项/结果类型
│   ├── validate.ts     # 契约校验收窄
│   ├── serialization.ts# canonical JSON/NDJSON + SHA-256
│   ├── zip.ts          # 最小 ZIP 读写
│   └── errors.ts       # 问题码
└── test/
    └── package.integration.test.ts
```

### 4.2 哈希口径

- `canonicalJsonStringify`：递归字典序排序对象键，紧凑无尾换行。
- `canonicalNdjsonBytes`：审计事件每行 canonical JSON，末尾统一 `\n`。
- 所有 `truth.*` entry 的 `sha256` 与 `size_bytes` 均来自上述字节。

### 4.3 导入事务

1. 读取源 ZIP 字节。
2. 解析 ZIP，读取 `manifest.json` 并校验。
3. 创建 `<targetRoot>.wenshu-import-<uuid>` 临时目录。
4. 逐 entry 用原子写解压；同时计算 SHA-256 与 manifest 比对。
5. 校验 `truth/project.json`、`truth/audit.ndjson` 与 bundle 交叉引用。
6. 将材料原件登记到 `grant.protectedFiles`。
7. `rename` 临时目录为最终目录。
8. 任何失败删除临时目录，目标目录永不半存在。

## 5. 验证清单

- [x] `pnpm --filter @wenshu/knowledge-package typecheck` 通过
- [x] `pnpm --filter @wenshu/knowledge-package test` 10/10 通过
- [x] 干净环境 round-trip（同一进程）
- [x] 干净环境 round-trip（独立 Node 子进程）
- [x] 逐类真源篡改拒绝：truth.project、truth.audit、truth.document、truth.template、truth.material
- [x] manifest 自报 sha256 错误时触发 `PACKAGE_HASH_MISMATCH`
- [x] 删除派生 entry 后仍可导入
- [x] 导入失败不留下目标目录/半包
- [x] 决定性变异：短路 `import.ts` 的字节哈希校验后，6 条篡改/篡改判定测试因正确原因失败（已恢复）
- [x] 导入后材料原件在 grant 中登记为只读
- [x] `sbom.json` 重建（170 包，仅新增 `@wenshu/knowledge-package` workspace 条目）
- [ ] 远程 CI 8/8（待推送后执行）

## 6. 已知限制

- 导入目标目录必须事先不存在；覆盖/合并由 A-02/A-11 在 Host 层决策。
- `formal_versions` 非空时的历史文档/模板打包未实现，当前测试使用空数组。
- 派生 entry 的 source_sha256s 由调用方提供，PB-11 不验证其语义是否指向包内真源
  （该检查由 `validateProjectContract` 的 `derived_data` 规则承担）。

## 7. 变更清单

- 新增 `packages/knowledge-package/`
- 更新 `tools/quality/src/layering-registry.ts`：登记新 workspace 为 L2
- 更新 `package.json`：`contracts:test` 加入 `@wenshu/knowledge-package test`
- 更新 `docs/project-contract.md`：说明 m-01 闭合方式
- 新增 `docs/adr/0026-PB-11知识包导出与干净环境重导入.md`
- 新增 `docs/audits/PB-11-claude-audit-task.md`
- 本文件
