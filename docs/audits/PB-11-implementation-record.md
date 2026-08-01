# PB-11 实施记录：知识包导出与干净环境重导入

> 任务 ID：PB-11
> 范围来源：路线图 §6
> R-* 标注：R-OUTPUT / R-DATA
> 状态：已实现，首审 FAIL 修复完成，待 Claude 复审

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
| D2 落点包 | 新建 `@wenshu/knowledge-package` / 扩展 project-storage | 新建 L2 包 | 职责隔离；需新增 workspace **已获批**——批准出处：本任务开工三项裁定（D1/D2/D3）即业主书面授权，其中 D2 明确「新建 L2 包并登记进业主冻结的分层归属表」；首审 MI-05 询问后业主于 2026-08-01 再次书面确认 D2 即该改动的批准 |
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
- [x] `pnpm --filter @wenshu/knowledge-package test` 21/21 通过（首审修复后：10 原有 + 11 边界对抗）
- [x] 干净环境 round-trip（同一进程）
- [x] 干净环境 round-trip（独立 Node 子进程）
- [x] 逐类真源篡改拒绝：truth.project、truth.audit、truth.document、truth.template、truth.material
- [x] manifest 自报 sha256 错误时触发 `PACKAGE_HASH_MISMATCH`
- [x] 删除派生 entry 后仍可导入
- [x] 导入失败不留下目标目录/半包/临时目录残留
- [x] 决定性变异（首轮）：短路 `import.ts` 的字节哈希校验后，6 条篡改测试因正确原因失败（已恢复）
- [x] 决定性变异（修复轮，三条各自独立验证、已恢复）：
  - M1 短路 grant 包含关系判定 → grant 外导入与同级前缀陷阱 2 条测试变红；
  - M2 摘除未声明条目对账 → 走私文件测试变红；
  - M3 摘除 `maxOutputLength` → DEFLATE 炸弹测试变红；单独摘除声明尺寸前置检查 → STORE 炸弹测试变红（两道防线各自有决定性反例）
- [x] grant 边界 fail-closed：目标在 grant 外 / 同级前缀陷阱 / `read_only` grant 三种反例全部 `PACKAGE_GRANT_SCOPE_VIOLATION` 且无文件系统副作用；grant 根等于目标根的正例通过
- [x] 原件保护生效性（真实 Host 强制点）：导入后经 `file.export.write`（`overwrite:true`）覆盖材料原件 → `HOST_PERMISSION_DENIED`，盘上字节不变
- [x] 未声明走私文件 `PACKAGE_UNDECLARED_ENTRY`；截断包与原始字节穿越改写均为 `PACKAGE_ZIP_INVALID`（不再与磁盘故障同码）
- [x] 解压上限：DEFLATE 炸弹与 STORE 炸弹均 fail-closed
- [x] `sbom.json` 重建（170 包，仅新增 `@wenshu/knowledge-package` workspace 条目）
- [x] 远程 CI 8/8（首轮实现 PR #50，run `30648388219` 全部 success）；修复轮 CI 见复审记录

## 6. 已知限制

- 导入目标目录必须事先不存在；覆盖/合并由 A-02/A-11 在 Host 层决策。
- `formal_versions` 非空时的历史文档/模板打包未实现，当前测试使用空数组。
- 派生 entry 的 source_sha256s 由调用方提供，PB-11 不验证其语义是否指向包内真源
  （该检查由 `validateProjectContract` 的 `derived_data` 规则承担）。

## 7. 首审 FAIL 修复（2026-08-01）

Claude 首审 [`FAIL`](../audits/PB-11-claude-audit-report.md)：2 MAJOR + 6 MINOR。处置：

| 发现 | 处置 |
|---|---|
| MAJOR-1 grant 边界不存在 | **已修代码**（业主裁定方向①）：入口强制 `read_write` + targetRoot ⊆ grant.root（含前缀陷阱），`PACKAGE_GRANT_SCOPE_VIOLATION` fail-closed，先于任何文件系统变更；原件保护经真实 Host `file.export.write` 验证覆盖生效。ADR-0026 §4 已改写为实现口径 |
| MAJOR-2 审计前已合入 main | 业主裁定：**main 上以修复 PR 关闭**（本轮 PR，不合入，待复审 PASS 后合并）；今后恢复「审计通过后才合并」既有流程 |
| MI-01 自洽改写不可检出 | **口径缺陷非实现缺陷**；业主 2026-08-01 书面批准收窄为「检出单点/不自洽篡改；自洽改写需签名，不在 PB-11 范围」，写入 ADR-0026 §7.1 并登记 PB-12/A-15 承接 |
| MI-02 解压无上限 | 已修：条目 ≤1000、单条 ≤64 MiB（maxOutputLength+声明前置双保险）、总量 ≤256 MiB；残余威胁模型登记 A-15 |
| MI-03 恶意包与磁盘故障同码 | 已修：`ZipError` → `PACKAGE_ZIP_INVALID` 保留原因 |
| MI-04 未声明文件静默接受 | 已修：ZIP 条目↔manifest 双向对账，`PACKAGE_UNDECLARED_ENTRY`；ZIP 重复路径即拒 |
| MI-05 归属表批准出处 | 业主 2026-08-01 确认开工裁定 D2 即批准，出处已写入 §3 D2 行 |
| MI-06 实施记录与事实不符 | 已修：§5 CI 勾选项按 run `30648388219` 实际结果更正 |
| 复审 C1 挡炸弹行无决定性测试 | 已修：新增说谎型炸弹测试（header 声明 100 字节、deflate 实际超限），断言错误码 **且** 命中 "inflate failed" 路径；仅断言错误码不决定性（删除 maxOutputLength 后会退化为同码 size mismatch），故断言消息路径。变异重跑（复审 §9.4 同法）：删除 `maxOutputLength` → **说谎炸弹测试变红**，如实声明的 DEFLATE/STORE 炸弹仍绿（各自由声明前置检查把守）——三条上限防线各有独立决定性反例 |

新增对抗测试 11 条（`test/package-boundary.integration.test.ts`）：grant 外/前缀陷阱/read_only/相等正例、原件保护真实 Host 强制点、走私文件、截断包、原始字节穿越、DEFLATE/STORE/说谎三型炸弹。NOTE 项（崩溃残留孤儿目录、`formal_versions` 空、目标须不存在、grant 边界不解析 realpath）转入 [PB-11-followups](PB-11-followups.md)。

## 8. 变更清单

- 新增 `packages/knowledge-package/`
- 更新 `tools/quality/src/layering-registry.ts`：登记新 workspace 为 L2
- 更新 `package.json`：`contracts:test` 加入 `@wenshu/knowledge-package test`
- 更新 `docs/project-contract.md`：说明 m-01 闭合方式
- 新增 `docs/adr/0026-PB-11知识包导出与干净环境重导入.md`
- 新增 `docs/audits/PB-11-claude-audit-task.md`
- 本文件
