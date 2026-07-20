# G1-10 首审 MINOR 整改记录

> 日期：2026-07-20　首审报告：[G1-10-claude-audit-report.md](G1-10-claude-audit-report.md)　状态：已整改，待原审计角色定点复核；实施者不自行关闭发现。

## FX-01：稳定且脱敏的文件系统失败

- 根目录、manifest、目录枚举、目录项检查和文件读取的底层异常统一转换为 `FixtureIntegrityError`。
- 缺失根目录归为 `FIXTURE_SET_MISMATCH`；缺失、空根中的 manifest 归为 `FIXTURE_MANIFEST_INVALID`。
- 诊断只保留固定说明或已验证的相对清单路径，不再透出绝对工作目录。
- 新增缺失根、空根、删除 manifest 三个真实文件系统反例，并明确断言分类和绝对路径不出现。

## FX-02：大小写碰撞守卫承重

- 将排序、精确重复、可移植大小写碰撞和 `manifest.json` 排除拆成四个独立错误分支。
- 新增已满足排序要求的 `a.txt` / `A.txt` 对照，精确断言命中 `portable path identity`，不再被排序分支提前拦截。

## FX-03：Windows 可移植路径加固

- 拒绝任意段中的冒号，覆盖 `C:foo.txt` 盘符相对路径和 `a:b` NTFS 数据流。
- 拒绝 `CON/PRN/AUX/NUL/COM1～9/LPT1～9` 及带扩展名形态、尾随点/空格和 C0/DEL 控制字符。
- 保留中文路径、普通空格、文件名中间的点和大写扩展名合法性，避免 fail-closed 误伤产品的中文优先边界。

## 自检边界

冻结 D 盘 Node `24.17.0` / pnpm `11.15.1` 下，定点包测试、strict typecheck 与完整 `pnpm verify` 均通过；完整验证聚合 150/150 项测试，82 个源码/配置文件、244 个仓库文件通过质量护栏，22 个测试文件完成分层，11 个包 typecheck 和 production build 成功。本记录不替代 Claude 对守卫承重性的破坏性复核结论。
