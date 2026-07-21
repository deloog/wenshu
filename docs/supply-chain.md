# G1-15 供应链初审与 SBOM/许可证基线

> 日期：2026-07-21　状态：已实现，待独立审计；G1-15 尚未由实施者自行关闭。
> 来源：原子路线图 G1-15（R-LICENSE/R-SEC）、G1-09 后续项 CR-01；许可例外须业主批准，本文不含任何例外。

## 1. SBOM 与可重建性

依赖物料清单由 `tools/supply-chain`（`@wenshu/supply-chain`）生成，真源是平台无关的冻结 `pnpm-lock.yaml`（lockfileVersion `9.0`）：

- `pnpm sbom:build`：重建 `sbom/sbom.json`（契约 `0.1.0`，确定性输出、无时间戳，同一代码树在 Windows/Linux/macOS 字节级相同）。
- `pnpm supply:check`：逐项重建并与已提交 SBOM 字节比对（漂移即失败）、执行许可政策门禁、校验声明依赖与 lockfile 解析一致；已接入根 `verify` 与 CI `security` 作业。
- 当前清单：**147 个包（10 个直接、137 个传递）**，全部来自 npm 官方注册表、经 lockfile integrity 哈希锁定；`workspace:*` 内部包不计入。
- 许可数据来源：本机已安装包读其 manifest `license` 字段；27 个 os/cpu 专属可选二进制（`@rolldown/binding-*`、`lightningcss-*` 平台变体、`fsevents`）与 wasm32 链（`@emnapi/*`、`@napi-rs/wasm-runtime`、`@tybys/wasm-util`、`tslib`）并非在每个平台都安装，其许可登记在 `src/license-overrides.ts` 受审覆盖表；已安装时覆盖值必须与包内 manifest 一致，两者皆无则 fail-closed。

## 2. 直接依赖与用途

| 依赖 | 版本 | 用途 | 许可 |
|---|---|---|---|
| typescript | 6.0.3 | 全部包的生产/测试语言与 strict 编译 | Apache-2.0 |
| vite | 8.1.5 | `@wenshu/web` 开发/构建（含 lightningcss CSS 处理） | MIT |
| eslint / @eslint/js / typescript-eslint | 10.7.0 / 10.0.1 / 8.64.0 | 静态规则门禁（`pnpm lint` 与质量单测） | MIT / MIT / MIT |
| prettier | 3.9.5 | 格式门禁 | MIT |
| ajv | 8.20.0 | 各契约包的 JSON Schema 校验 | MIT |
| json-schema-to-typescript | 15.0.4 | 契约 Schema → 生成类型 | MIT |
| yaml | 2.9.0 | `@wenshu/supply-chain` 解析冻结 lockfile | ISC |
| @types/node | 24.13.3 | Node 类型声明（仅编译期） | MIT |

版本由 `toolchain.versions.json`、根 manifest 与 `pnpm-workspace.yaml` catalog 锁定；`@wenshu/quality` 自本任务起显式声明 `eslint@10.7.0`（关闭 CR-01）。

## 3. 许可结论（逐项书面）

政策：宽松许可（0BSD/MIT/ISC/Apache-2.0/BSD-2-Clause/BSD-3-Clause）直接接受；GPL/AGPL/未知许可一律阻断（`licenses:check` 与 `supply:check` 双门禁 fail-closed）。0BSD 为 OSI 批准的宽松许可，因 `tslib@2.8.1`（wasm32 链，各平台均不安装）进入白名单。当前树中三个非宽松许可逐项结论如下：

- **MPL-2.0 — `lightningcss@1.32.0` 与 `lightningcss-win32-x64-msvc@1.32.0`（Vite 的 CSS 处理器，传递）**：MPL-2.0 为文件级弱 copyleft，义务仅及于 MPL 许可文件本身。项目以其发布的二进制/库形式经 Vite 调用，不修改其任何源文件，故无开源项目代码的义务。**结论：可接受**，约束：禁止原地修改或 patch 该包（确需修改时走 fork 公开对应文件或更换方案）；其 LICENSE 随 `node_modules` 保留。
- **Python-2.0 — `argparse@2.0.1`（ESLint 链传递）**：该包是 Python argparse 的 JS 移植；Python-2.0 为宽松许可（无 copyleft，含背书/商标限制）。项目不分发 Python 解释器，仅作为构建工具链传递依赖存在于开发环境，不进入产品运行时。**结论：可接受**。
- **BlueOak-1.0.0 — `minimatch@10.2.5`（传递）**：宽松许可（MIT 等价）。**结论：可接受**。

以上三项均非"例外"（无需业主逐项批准），但结论在此书面留档；任何新增非宽松许可必须先补书面结论，涉及 copyleft 扩张或不明确时按审批矩阵请示业主。

## 4. 漏洞审查

- 2026-07-21 `pnpm audit --json`（npm 官方咨询源）：critical/high/moderate/low/info = **0/0/0/0/0**。
- 漏洞查询需要网络，为保持 `pnpm verify` 离线确定性**不设为门禁**；复跑时点：每次依赖变更、G1-16 签署前、以及发现上游公告时。复跑命令：`pnpm audit`。

## 5. 依赖声明完整性（CR-01 关闭）

- `tools/quality` 的测试直接导入 `eslint`，已在其 manifest 显式声明 `eslint@10.7.0`（与根一致）。
- 新增 `phantom-dependency` 守卫（`tools/quality/src/phantom-dependencies.ts`，接入 `pnpm quality:check` 与 CI `static` 作业）：用 TypeScript 编译器 API 提取每个工作区包全部静态/动态 import、re-export 与三斜线类型引用，凡外部包未在**本包** manifest 声明即报错，防止只修单点。

## 6. 验证与回滚

- 验证：`pnpm supply:check`（SBOM 漂移 + 许可政策 + 声明/安装一致）、`pnpm quality:check`（phantom 守卫）、`pnpm verify` 全链路。
- 回滚：删除 `tools/supply-chain`、`sbom/`、本文及接线，恢复 `tools/quality` manifest 与 quality 工具即可，不影响其他任务产物。
