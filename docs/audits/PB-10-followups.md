# PB-10 后续承接项

> 非阻断项，由独立审计者在终局签署时建议建立，供 PB-11/A-02 及后续棒次归口查阅。

## 1. `protectImportedFile` 的调用责任 → A-02 / PB-11

> **处置（2026-08-01，PB-12）：已消费，关闭。** PB-11 导入已登记原件保护，PB-12 E2E 链环⑦干净重导入真实行使该登记路径；见 [PB-12-followups §1](PB-12-followups.md)。

- **内容**：PB-10 只提供导入原件只读保护机制（`grant.protectedFiles` + `isImportedOriginal`），本身没有导入能力；`file.import.select` 在 `0.2.0` 中仍为 `unsupported`。
- **要求**：A-02/PB-11 在实现新建/打开项目与导入流程时，必须在创建/复制原件后显式调用 `protectImportedFile` 进行登记。未登记的既有文件仍可能被 `overwrite:true` 覆盖。
- **已记录于**：ADR-0025 §2 / PB-10-implementation-record.md §已知承接与限制。

## 2. 带扩展名的 Windows 保留设备名仍被接受

- **内容**：`SAFE_FILE_NAME` 已拒绝裸保留名（`NUL`、`CON`、`COM1`…`LPT9`）与尾点。带扩展名的形式（如 `NUL.md`、`CON.txt`）当前仍被接受。
- **实测**：本机 NTFS 上这些文件是普通文件，内容可正确读回，未造成数据丢失。
- **建议**：若将来出现不走 `\\?\` 语义的调用路径，需重新评估是否一并拒绝。

## 3. ≤10 s 恢复指标的范围 → PB-12 / A-12

> **处置（2026-08-01，PB-12）：已消费，关闭。** 端到端「重开到可操作」复测完成：链环⑥（本地 402–436 ms、ubuntu CI 892.7 ms）+ 采样批次 `artifacts/perf/2026-08-01-PB-12/`（p95 664.0 ms）；见 [PB-12-followups §1](PB-12-followups.md) 与 ADR-0027 §2。

- **内容**：PB-10 的 `≤10 s` 指标度量的是存储层 `recoverGrantDirectory` + `openProjectStore` + 工件校验。
- **要求**：PB-12/A-12 必须做端到端“强杀后重开到可操作”的复测，不得直接引用本批次结果冒充端到端恢复。

## 4. ArkWeb 文件桥 → 仍 `needs_device_to_verify`

- **内容**：PB-10 未在 ArkWeb 真机或模拟器上验证 OPFS/Worker/WASM 等价持久化与锁语义。
- **要求**：保持 `needs_device_to_verify` 标记，后续在 ArkWeb 壳探针中真实验证。

## 5. 浏览器 Host 的持久化语义

- **内容**：`apps/web` 中的浏览器 Host 是纯内存实现，刷新即失，却在 registry 中把 7 项能力登记为 `supported`。
- **建议**：接真实 UI 前，要么将相关能力改为 `degraded`，要么在文档中明示“浏览器 Host 非持久，仅用于开发与联调”。
- **处置注记（2026-08-01，`A-01`）**：**已消费**（取第二路径）。A-01 D2 原型可运行触发「接真实 UI 前」时点：原型「设置」区与 [ADR-0028 §6](../adr/0028-A-01Alpha信息架构状态机冻结与缺失设计稿处置.md) 明示「浏览器 Host 非持久，仅用于开发与联调」；registry 的 7 项 `supported` 登记**不改**，A-02 接真实 UI 时再评估是否改 `degraded`。
