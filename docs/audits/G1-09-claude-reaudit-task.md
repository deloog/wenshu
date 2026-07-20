# Claude 独立复审任务书：G1-09

> 状态：待执行　原审计者：Claude　整改者：Codex　日期：2026-07-20

## 1. 复审对象与权限

首审报告：`docs/audits/G1-09-claude-audit-report.md`。

整改提交：`cba2aee fix: remediate G1-09 audit findings`；首审报告提交为 `41b7726`，原实施提交为 `7757a37`。

请不要采信 `docs/audits/G1-09-remediation.md` 的自述或 `pnpm verify` 全绿，逐项重跑首审原始反例并寻找整改引入的新绕过。只允许在原报告末尾**追加复审章节**：

`docs/audits/G1-09-claude-audit-report.md`

不得删除、改写首审记录；不得修改其他仓库文件。需要植入文件、改 manifest、改 fixture 或改 tsconfig 的探针必须在 D 盘仓库外副本执行并清理。不得运行 format、fix、generate 或修改 Git 历史。

## 2. 必须逐项复跑

### M-01：TypeScript 扩展名覆盖

1. 对 `.ts/.tsx/.mts/.cts` 分别检查 ESLint `--print-config`，四者都必须启用 TypeScript 规则和 `no-explicit-any`。
2. 在仓库外副本分别放入含显式 `any` 的 `.mts/.cts`，确认 ESLint 与质量 AST 扫描拒绝；401 行生产文件、501 行测试文件必须命中正确体量失败。
3. 将 `.mts/.cts` 从 tsconfig include 漏掉，`checkTypecheckCoverage` 必须报告；正常 include 后 `tsc --listFiles` 与质量结论一致。
4. `.TS/.MTS/.CTS` 等已知扩展名大小写变体必须由质量门禁主动失败，不能仅因 tsc 不编译而静默成为死文件。
5. 检查 `.jsx/.mjs/.cjs` 的 lint/禁止指令扫描没有因扩展白名单重构回归；不要要求 JavaScript 接受 TypeScript 专属类型规则。

### M-02：生成文件身份

至少验证以下矩阵：

- `src/generated/` 新增未登记文件：`quality:check` 必须失败；
- manifest 额外登记该手写文件：质量登记检查即使接受，所在包 `generate:check` 也必须因登记表与真实生成器不一致而失败；
- 删除登记、登记不存在文件、包有 `generate:check` 却无登记：必须失败；
- 四个合法登记文件必须仍接受 Prettier、ESLint、禁止语法扫描和字节漂移检查，仅豁免手写体量阈值；
- 近似目录名、大小写路径、`../`、绝对路径和重复/额外登记不能取得机器产物身份。

重点判断 manifest 与四个真实生成器之间是否形成双向互锁，而不只是把原来的目录自助豁免改成 manifest 自助豁免。

### 六项 MINOR

1. `m-01`：在仓库外副本向 project-contract 的 invalid 目录新增第三个 fixture，测试必须自动发现；元数据缺失必须失败。
2. `m-02`：`missing-project-field.json` 必须命中 `PROJECT_SCHEMA@/revision`；改成 `/` 或另一个缺失字段时断言必须失败。抽查 JSON Pointer 对 `~`、`/` 的转义没有错误。
3. `m-03`：逐键确认 provider/model Schema 正则已恢复到 G1-07 冻结值；`sk-*`、key/secret/token 形状仍返回专用 `PROJECT_MODEL_IDENTIFIER_INVALID` 路径，而不是泛化 Schema；不得扩大 Schema 接受集合或执行访问器。
4. `m-04`：重跑首审 27 项 Host 敌意矩阵，必须全部继续拒绝；`50% complete`、anchor/mode、mailto/data、HTTP/HTTPS、相对路径等合法对照必须通过。另测 `%zz`、`%z`、混合裸百分号与有效编码、多字节 UTF-8、重复编码和超过 16 轮预算。
5. `m-05`：`fixtures.test.data/plain.json` 等仅父目录含 `.test.`/`.spec.` 的文件不得成为测试候选；真实测试文件、大小写变体和各位置逃逸仍按 G1-08 规则发现。
6. `m-06`：G1-15 路线图必须明确列出 BlueOak-1.0.0 的书面结论/移除门槛；本整改不得自行批准该许可证。

## 3. 回归与新风险

- 运行锁定 D 盘环境下的 frozen install 与 `pnpm verify`；整改者最后一次自检为 exit 0，共 115 项测试、13 个测试文件、9 个工作区包 typecheck 和 production build。
- 核对 `project-contract.schema.json` 与 G1-07 基线的 ModelContext 两条正则，确认生成声明零漂移。
- 审查生成登记逻辑的路径归属、跨包串扰、大小写、符号链接、重复项和未来新增生成包行为。
- 检查 Host 解码循环是否对普通 `%` 与畸形编码给出一致、可说明的边界，同时不放回路径穿透。
- 检查整改文件体量、零 `any`、零抑制指令、format/lint/typecheck 覆盖和文档台账一致性。
- 寻找修复仅命中首审样例、但同类扩展名或登记形态仍能绕过的情况。

## 4. 结论规则

- `PASS`：首审 2 MAJOR 与 6 MINOR 全部关闭，且无新增未关闭问题；
- `CONDITIONAL PASS`：2 MAJOR 全部关闭，仅有不阻塞消费者且已明确归属/最迟关闭点的 MINOR；
- `FAIL`：任一 MAJOR 未关闭、出现新 BLOCKER/MAJOR，或完成证据仍可假绿。

复审章节必须逐项列出首审发现的状态、原始反例与复跑结果、新发现、实际命令、未执行项、工作树边界和最终结论。复审放行前 G1-11 仍不得启动；实施者不得自行把发现标为关闭。
