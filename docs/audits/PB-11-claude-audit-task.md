# PB-11 独立审计任务书

> 审计角色：Claude（独立只读审计/复审）
> 实施者：Codex
> 任务 ID：PB-11
> 范围：知识包导出与干净环境重导入（R-OUTPUT / R-DATA）
> 交付审计报告：`docs/audits/PB-11-claude-audit-report.md`

## 审计目标

验证 PB-11 是否真正闭合 G1-07 m-01：知识包中 `truth.project` 与 `truth.audit`
两个 entry 的 SHA-256 必须从真实序列化字节计算并校验，而不是沿用 manifest 自报值。
同时验证范围、边界、回滚与测试真实性。

## 必查项

### 1. 字节级哈希（m-01 命门）

- [ ] 用真实字节改一位 `truth/project.json`，导入必须失败，且失败码为
  `PACKAGE_HASH_MISMATCH` 或 `PACKAGE_MANIFEST_MISMATCH`。
- [ ] 用真实字节改一位 `truth/audit.ndjson`，导入必须失败。
- [ ] 确认 `truth.project` 的 sha256 不是从 manifest 自报值复制，而是
  `canonicalJsonBytes(project)` 后 `sha256()` 计算所得。
- [ ] 确认 `truth.audit` 的 sha256 覆盖整份 NDJSON 字节（含末尾换行）。

### 2. 真源篡改矩阵

- [ ] `truth/document.json` 改一位 → 拒绝。
- [ ] `truth/template.json` 改一位 → 拒绝。
- [ ] `truth/material/*` 改一位 → 拒绝。
- [ ] manifest 中任一 `sha256` 改一位（文件字节不变）→ 拒绝。

### 3. 干净环境 round-trip

- [ ] 在真正的新目录、新 Node 进程中完成导入；逐项对账 project_id、document_id、
  audit event_id、material hash、template_id。
- [ ] 导入进程不得复用导出进程的内存状态（建议 spawn 新 Node 实例验证）。

### 4. 派生不是必要条件

- [ ] 删除所有 `derived/*` 文件与 manifest 中对应 entry 后，包仍可导入。
- [ ] 保留 derived 文件但删除 manifest entry（或反之）→ 应有明确失败。

### 5. 事务回滚

- [ ] 导入中途注入失败（如篡改后导入），目标目录不存在、无半包、无残留文件。
- [ ] 临时目录前缀为 `.wenshu-import-` 且失败后被清理。

### 6. 原件保护

- [ ] 导入后调用 `isImportedOriginal(grant, materialFileName)` 返回 `true`。
- [ ] 确认 `protectImportedFile` 由 `importKnowledgePackage` 在验证通过后、
  `rename` 之前或之后调用，而不是依赖调用方额外登记。

### 7. 分层与依赖

- [ ] 新包 `@wenshu/knowledge-package` 已在 `tools/quality/src/layering-registry.ts`
  登记为 L2。
- [ ] 无新增第三方运行时依赖；`package.json` 只声明 workspace 依赖与
  `@types/node`、`typescript` devDependencies。
- [ ] 无 `node:*` 以外的平台导入，无 `electron`/`@ohos.`/`@ohos/` 导入。

### 8. 测试真实性

- [ ] 集成测试不 mock ZIP/文件系统/序列化；真实读写临时目录与文件。
- [ ] 决定性变异：手动注释/短路 `importKnowledgePackage` 中的 byte-hash 校验后，
  至少一条篡改测试应错误地通过（变红）。
- [ ] 子进程 round-trip 测试确实启动新 Node 实例，而非同一进程内的函数调用。

### 9. 文档与契约

- [ ] ADR-0026 存在，说明容器格式、哈希口径、Host 边界、事务回滚。
- [ ] `docs/project-contract.md` 已更新，说明 m-01 闭合方式。
- [ ] 实施记录存在，范围外逐条可对账。

## 审计边界

- 不审计 A-02/A-11 UI、PB-12 E2E、docx/Markdown 导出、ArkWeb 真机。
- 不审计 `@wenshu/project-storage` 本身（已由 PB-10 审计），只审计 PB-11 对它的使用。

## 签署

审计结论写入 `docs/audits/PB-11-claude-audit-report.md`。
