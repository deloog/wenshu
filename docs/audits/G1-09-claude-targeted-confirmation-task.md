# G1-09 条件项针对性确认任务书（交给 Claude）

> 审计对象：`d84f895..9e5531c`　审计角色：未参与本轮实施的原 Claude 审计者

## 1. 目标与权限

请只读确认 G1-09 复审新增的 `RA-01`～`RA-04` 是否真实关闭，并检查本轮整改是否引入同等级或更高的新问题。不要采信 [补充整改记录](G1-09-conditional-remediation.md) 的自述，也不要仅以 `pnpm verify` 全绿作为结论。

- 可读取整个仓库、运行只读命令，并在系统临时目录创建破坏性探针副本。
- 不得修改代码、Schema、fixture、测试、路线图、锁文件或 Git 历史。
- 唯一允许修改的仓库文件是 [G1-09 审计报告](G1-09-claude-audit-report.md)：在现有复审章节后追加“针对性确认”章节，保留全部历史记录。
- 完成后确认工作树中只有上述报告文件发生变化。

## 2. 不可省略的原始反例

### RA-01：`.jsx` ESLint 覆盖

1. 用真实仓库配置运行 `eslint --print-config`，确认 `.jsx` 不再返回 `undefined`，且 `no-unused-vars` 等推荐规则有效。
2. 在仓库外副本或可完整清理的临时探针中，确认一个语法合法但含未使用变量的 `.jsx` 文件会使真实 ESLint 命令失败。
3. 回归 `.js/.mjs/.cjs` 与四种 TypeScript 扩展名，确认没有因新增 JS block 丢失原规则或错误套用 TS 类型规则。

### RA-02：Host 根路径与 UNC

至少逐条重跑并断言稳定 code/path：

```text
//server/share/secret
//10.0.0.1/c$/Windows/win.ini
///etc/shadow
\Windows\win.ini
output=//server/share/secret
output=///etc/shadow
output=\Windows\win.ini
```

全部必须返回 `HOST_PLATFORM_FIELD_FORBIDDEN@/output/grant_id`。另请扩展首审/复审未覆盖的等价编码、空白或引号前缀形态，判断修复是结构性的还是只命中特定字符串；同时回归相对路径、百分比、`http://`、`https://`、`mailto:`、`data:` 等合法值，避免 fail-closed 误杀扩大。

### RA-03：生成登记去重

在仓库外假工作区直接调用真实 `inspectGeneratedFileRegistry`，至少验证：

- 完全重复登记；
- Windows 大小写变体；
- `src/generated/./x.ts` 等解析后等价路径；
- 两个不同的合法生成文件。

前三者必须产生重复登记 finding，且同一真实文件只能获得一次生成身份；最后一项不得误报。继续确认无效路径、缺失文件和未登记生成目录文件的既有门禁未回归。

### RA-04：单一 Schema 分支与精确路径

1. 对只缺 `revision` 的 project 输入，结果必须**恰好**为一项 `PROJECT_SCHEMA@/revision`。
2. 用报告原方法把期望路径换为 `/`、`/title` 和其他字段，均不得命中。
3. 分别构造四种合法 `contract_kind` 的单字段缺失输入，确认只报告对应分支错误，不混入其他 `oneOf` 分支或通用根路径。
4. 对未知、缺失或类型错误的 `contract_kind`，确认仍能安全失败，不抛异常、不执行访问器、不错误进入语义校验。
5. 回归四种合法 fixture、未来版本、模型标识专用问题码和上游兼容门禁。

## 3. 共同回归与门禁

- 使用项目规定的 D 盘 Node 24.17.0、pnpm 11.15.1 与 D 盘 store；不得因终端 PATH 命中 C 盘旧 Node 而重建或改写依赖。
- 独立运行 `pnpm verify`，记录测试文件数、测试总数、typecheck 包数与构建结果。
- 检查 `pnpm-lock.yaml`、`tsconfig.base.json` 与冻结 Schema 是否零改动；统计手写显式 `any`、TypeScript/ESLint 抑制指令和体量预警。
- 检查从 300 行告警触发后拆出的 `host-paths.contract.test.ts` 是否被测试层发现并真实执行，而不是仅减少原文件行数。
- 任何临时探针都必须位于仓库外或在结束前完整清除，并在报告中列出未执行项与限制。

## 4. 判定规则

- 任一 `BLOCKER` 或 `MAJOR`：`FAIL`，不得把 G1-09 标为最终完成。
- `RA-01`～`RA-04` 任一原始反例仍成立：不得判定该项关闭；请按实际影响重新定级。
- 四项全部关闭且无新增未归属发现：`PASS`。
- 若仅有不阻断消费者、且已明确任务归属和最迟关闭点的新 `MINOR`：可给 `CONDITIONAL PASS`，但必须逐项说明为何不阻断。

请在报告末尾给出：逐项结论、反例矩阵、回归结果、未执行项、工作树状态和最终 `PASS / CONDITIONAL PASS / FAIL`。审计者只签署事实，不提供或应用补丁。
