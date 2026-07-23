# PA-00 导入资源文件名策略裁定实施记录

> 日期：2026-07-23　状态：已裁定并实现 FX-06 补齐，待独立审计；本记录不关闭 PA-00、NF-03、FX-06。前置：G1-04/G1-10 已签署、G2-01/02 已签署。

## 裁定内容（NF-03 关闭申请）

- 两选项比较后裁定**选项 A：导入时安全规范化重命名**，v0.1.0 Schema 不放宽、不升级（无消费者契约重跑需求）；选项 B（受控 Unicode 白名单）及其被否理由记录在 [决策 #7](../../决策记录.md) 与 [document-model.md §7](../document-model.md)。
- 固定决策矩阵覆盖任务书要求的全部形态：中文、空格、大写扩展名、目录含点、webp、Windows 保留字符 `< > " | ? *`，并补充设备名、尾随点/空格、Unicode 规范化、NTFS 大小写碰撞四行。
- 规范化重命名规则（内容寻址、幂等、原名经导入报告+语义审计留痕、扩展名白名单、内容 sniff 核验）已写入 document-model.md §7.2，作为 PA-01/A-02D 的实现约束。

## FX-06 补齐实现

- `tools/fixtures/src/manifest.ts`：`isCanonicalFixturePath` 逐段拒绝 `< > " | ? *`（`WINDOWS_FORBIDDEN_CHARACTER_PATTERN`），既有拒绝面（冒号/控制字符/保留名/尾随点空格/穿越）不变。
- 逐字符承重测试：`tools/fixtures/test/manifest.contract.test.ts` 新增 6 字符 × 3 位置（文件名/目录名/段内）全拒 + 既有允许面（中文、大写扩展名、段内点/空格）不回退。
- fixture-integrity.md 承诺保持"同时适用 Windows 与 POSIX"并更新为已补齐状态——选择"补齐"而非"收窄文档"。

## 边界与验证

- 未实现解析器（PA-01 范围）；未触碰冻结 fixture 原件、文档 Schema、生成物；fixture 校验锚点不变（谓词仅收紧，7 个原件均合法）。
- `pnpm fixtures:check` 通过（7 冻结原件 + 新承重测试）；`pnpm verify` 退出 0。
- 本批经 PR 流程？——按 G2-01 治理，功能任务须走 PR；本任务为文档+测试守卫补齐，实施记录与审计任务书附上，请审计者裁定是否须补 PR 形式。

## 待独立审计

实施者不得自行关闭 PA-00/NF-03/FX-06；审计任务书见 [PA-00-claude-audit-task.md](PA-00-claude-audit-task.md)。FX-06 按登记要求须由独立审计签署关闭。
