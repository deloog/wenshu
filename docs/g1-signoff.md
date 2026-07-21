# G1-16 G1 工程底座签署报告

> 日期：2026-07-21　状态：已汇总，待 Claude 独立审计签署；本报告不自行关闭 G1-16。
> 范围：G1-01～G1-16 全部工程底座任务；签署前不得开始任何功能实现（PA/PB/A 系列）。

## 1. 干净克隆一键验证（签署核心证据）

- 远程：`deloog/wenshu`（PRIVATE），main 锚定提交 `f278335`。
- 方式：git 协议克隆与 codeload 在当时网络下多次停滞，改用**带令牌的 codeload tarball（锚定提交 `f278335`，22,697,876 字节）** 解出干净树（无 `.git`、无本机未提交内容），已如实披露此替代及其理由。
- 执行：`pnpm install --frozen-lockfile` → `pnpm verify`，**退出 0**，完整日志见 [G1-16-cleanroom-verify.txt](audits/G1-16-cleanroom-verify.txt)：185 项 ✔，quality 119/313、layers 34、fixtures 7、fonts 3、environment 双证据、supply-chain 147 包无漂移、typecheck 14 包、production build 通过。
- 另证：ubuntu 远程 CI 矩阵在推送栈上连续 8/8 成功（最近 run `29818057945`）。

## 2. 任务清单与审计状态

| 任务 | 状态 | 证据 |
|---|---|---|
| G1-01 本地 Git 基线 | ✅（文档证据，未经独立审计） | 根提交 dcbddc9；ignore/秘密探针 |
| G1-01R 私有远程 | ✅（文档证据，未经独立审计） | [remote-repository.md](remote-repository.md)；权限留证 |
| G1-02 工具链锁定 | ✅（文档证据，未经独立审计） | toolchain.versions.json、ADR-0002 |
| G1-03 TS strict + Vite 工作区 | ✅ | Claude 复审 CONDITIONAL PASS，阻断全关闭 |
| G1-03C 配置契约 | ✅ | [configuration.md](configuration.md)；Claude 复审通过 |
| G1-04 文档对象契约 | ✅ | [document-model.md](document-model.md)；NF-03→PA-00 |
| G1-05 模板 DSL 契约 | ✅ | [template-dsl.md](template-dsl.md)；Claude 复审通过 |
| G1-06 Host 契约 | ✅ | [host-contract.md](host-contract.md)、ADR-0003；NF-01/02/04→G1-08/09 已闭环 |
| G1-07 项目/知识包契约 | ✅ | [project-contract.md](project-contract.md)、ADR-0004；1B2M 全关闭 |
| G1-08 测试骨架与并行隔离 | ✅ | [test-infrastructure.md](test-infrastructure.md)；3 MAJOR+5 MINOR 全关闭 |
| G1-09 工程质量与本地验证 | ✅ | [engineering-standards.md](engineering-standards.md)；RA-01～04+CF-01 关闭，CR-01→G1-15 已签署关闭 |
| G1-10 fixture 完整性 | ✅ | [fixture-integrity.md](fixture-integrity.md)；FX-01～03 关闭；FX-06→PA-00 |
| G1-11 并行 CI | ✅ | [ci.md](ci.md)；CI-01～05 关闭；远程矩阵 8/8 |
| G1-12 DevEco 环境 | ✅（文档证据，未经独立审计） | [deveco-environment.md](deveco-environment.md)；模拟器后置 |
| G1-13 固定字体基线 | ✅ | [font-baseline.md](font-baseline.md)；FT-01/02 关闭 |
| G1-14 参考机器与采样协议 | ✅ | [reference-machine.md](reference-machine.md)；EN-01～03 关闭 |
| G1-14W Win11 参考环境 | ✅ | 决策 #4+补充；`environment.win11.json`；W14W-01 关闭 |
| G1-15 供应链与 SBOM | ✅ | [supply-chain.md](supply-chain.md)；SM-01/02 关闭、CR-01 签署 |

审计报告与整改记录全部在 `docs/audits/`；已审计任务的全部 BLOCKER/MAJOR 均已由独立审计者签署关闭。G1-01/G1-01R/G1-02/G1-12 成于独立审计机制建立之前（首份审计任务书为 G1-03～06），以文档证据完成、未经独立审计；其中 G1-01/01R/02 已获 G1-16 审计者旁证（根提交、忽略探针、private:true、工具链版本一致），G1-12 的处置见决策记录。

## 3. 未完成项与限制索引（如实声明）

- **登记给后续任务的开放项**：NF-03 与 FX-06 → PA-00（文件名策略裁定）；PB-05A 登记项（G1-07 MINOR）。
- **环境限制**：Win11 VM 为 90 天评估版（2026-07-21 起）、en-US、1024×768（PA-05 前需调整重采）、未装 Chromium（PA-05 前置）；BIOS 模拟器后置（G1-12）。
- **方法限制（NOTE 级，已书面化）**：FT-03/FT-04（字体纵深守卫被哈希遮蔽、glyph/cmap 靠字节传递）；FT-01 Linux 大小写实证点；G1-14 §9 限制（NTFS 大小写、EACCES 未实证）；漏洞扫描不进 verify（网络依赖，复跑时点已定）。
- **决策性延期**：BASE-02（Word 基线，决策 #2）；3–5 页短文档场景入需求池（决策 #3）。
- 以上均不构成 G1 签署阻断；进入功能实现前无未闭环的 BLOCKER/MAJOR。

## 4. 命令索引（唯一权威入口）

安装：`pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store`；完整验证：`pnpm verify`（format→lint→quality→layers/unit→config→contracts→fixtures→fonts→environment→supply→typecheck→build）。
分层测试：`pnpm test:unit|contract|render|integration|e2e|layers|foundation`；CI：`pnpm ci:job <name>`、`pnpm ci:verify`。
专项：`config:check`、`contracts:check`、`fixtures:check`、`fonts:check`、`environment:check`、`supply:check`、`generated:check`、`secrets:check`、`licenses:check`。
资产维护：`env:record [--label --out]`、`sbom:build`（依赖变更后）；构建：`pnpm build`、`--filter @wenshu/web build:test|build:staging`。
