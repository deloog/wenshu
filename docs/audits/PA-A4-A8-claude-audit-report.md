# PA-A4 / PA-A8（PA-03 前置门禁）· Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-24
> 实施基线：`044b9f5`（`origin/main` tip，已推送）　整改记录：`docs/audits/PA-A4-A8-remediation.md`
> 远程验证：run `30079559019`（ubuntu-24.04）8/8 success，PA-A8/A4 测试逐条复现（见 §5）
> 写入边界：本轮仅新增本文件；未改代码/测试/Schema/配置；仓外探针写于 `D:\tmp\pa48*`，收尾已删除；GitHub 只读。

---

## 1. 结论

**PASS —— PA-A8 与 PA-A4 关闭，PA-03「消费文档文本渲染前」的硬前置门禁满足。**

- 已推送且远程 CI 已复现（`044b9f5`，8/8，控制字符/BOM 测试在 ubuntu 实跑绿），**签署即时生效**，无待推送条件。
- 两处守卫均经我**独立重跑变异证实变红**（各 25/2），非采信"自证变红"；且两者都有专属测试承重（强于 PA-B2）。
- 一处**观察项**（PA-C1：Cf 格式字符仍放行）不阻断关闭，作为 PA-03 的知情项登记。

---

## 2. PA-A8（控制字符与行中孤立 `\r` fail-closed）核验

**代码检查（`parser.ts`）：**
- `isDisallowedControl(cp)`：拒 C0（`≤0x08`、`0x0B–0x1F`）、DEL（`0x7F`）、C1（`0x80–0x9F`）、`U+2028`、`U+2029`；**显式保留 `\t`(0x09) 与 `\n`(0x0A)**。
- 扫描位置在行切分 + CRLF 剥离**之后、front matter 解析之前**，逐行按 `for...of`（码点迭代，astral 安全）；命中即抛 `IMPORT_UNSUPPORTED_SYNTAX`，信息 `control character U+XXXX … line N`——**只带码点 + 行号，不回显正文**（§5）。
- 行尾 `\r` 已在 CRLF 阶段计为语法（PA-A3），扫描期残留 `\r` 必为行中孤立 `\r`，落入 `0x0B–0x1F` 被拒。

**独立实证（正文植入哨兵，检查回显）：**
- 11 类逐一正确：NUL/BS/VT/ESC/US/DEL/NEL(C1)/U+2028/U+2029/行中孤立 `\r` **全部拒绝**，均带码点 + 行号、**无一回显哨兵**；`\t` **接受并进入内容**。
- 覆盖全面：front matter 行内控制字符同样拒绝。
- **无误伤**：emoji（astral）、全角标点、CJK+拉丁+数字均正常接受。

## 3. PA-A4（前导 BOM 剥离并计入语法消费）核验

**代码检查（`parser.ts`）：**
- `hasBom = source.startsWith("\uFEFF")`；`text = hasBom ? source.slice(1) : source`，其后一切基于 `text`。
- `sourceChars: source.length`（**含 BOM**）；对账 map 对第 1 行加 `(line===1 && hasBom ? 1 : 0)`——BOM 计入第 1 行（front matter 围栏）`syntaxChars`。

**独立实证：**
- 前导 BOM 接受，`sourceChars`==原始文件字符数（25==25）、汇总恒等式闭合；BOM+CRLF（记事本默认）30==30 闭合。
- **逐行恒等式对含 BOM 的原始文件成立**：line1 raw = `"﻿---"`（长度 4）= content 0 + syntax 4。
- BOM 版与无 BOM 版**块结构 deepEqual**——BOM 未渗入内容。

## 4. 守卫变异——独立重跑（不采信自述）

仓外副本 `D:\tmp\pa48mut` 重建工作树（基线 **27 pass / 0 fail**），还原后 `diff -r` 逐字节一致：

| 变异 | 结果 | 判定 |
|---|---|---|
| 控制字符守卫置空（`isDisallowedControl` 恒 false） | 25/2 | 变红 ✔ |
| 删 BOM 剥离（`hasBom` 恒 false） | 25/2 | 变红 ✔ |

两处守卫都有专属测试承重，其移除均被 CI 察觉——不存在 PA-B2 式"守卫活但删之无察觉"的缺口。

## 5. 门禁、冻结物与远程复现

- `pnpm --filter @wenshu/markdown-import test`：unit 12 + contract 5 + integration 10 = **27 pass / 0 fail**（原 23 + 新增 4）。
- `pnpm verify`：**exit 0**。
- **冻结规则未放宽**：初版控制字符正则触发冻结 eslint 规则 `no-control-regex`，实施者**未改规则**、改用码点判定函数——`git diff bec3a63..044b9f5 -- '*eslint*'` 为空，符合宪法（不靠放松规则过检查）。
- 冻结 golden-report（LF、无 BOM）复算 `12664/11136/1225/303` **逐字节不变**，无控制字符误伤。
- 冻结物零漂移、SBOM 147→147、零新增依赖。
- **远程 ubuntu 复现**：run `30079559019` contracts job 日志逐条——`control characters and stray carriage returns fail closed`、`leading BOM is stripped and accounted as per-line syntax`、`BOM-prefixed CRLF input reconciles against the raw file`、`control characters fail closed at the import boundary` 均在 ubuntu-24.04 实跑通过。

## 6. 观察项（不阻断）

### PA-C1 · 观察项 · Cf 格式字符（含中段 U+FEFF）仍放行 —— 交 PA-03 知情

- **证据**：正文中段的 `U+FEFF`（ZWNBSP）被接受进入内容；整改记录已如实登记"正文中间的 U+FEFF 不作特殊处理"。同理其他 Cf 格式字符（ZWJ `U+200D`、方向标记 `U+200E/200F` 等）不在拒绝集内。
- **定性**：**不是缺陷,是正确的范围划定**。PA-A8 的风险是 NUL/ESC/DEL 等**未定义渲染行为**的控制字符,已全部关闭;Cf 是零宽/格式显示字符,在浏览器渲染中有良好定义,不属"未定义行为"。
- **交接**：PA-03 应知悉渲染层仍会见到零宽/格式字符与合法 `\t`;若 PA-03 的 DOM/文本对账或视觉断言对零宽字符敏感,在 PA-03 范围内处置(归一或显式保留),不必回改导入边界。

## 7. 复现命令

```bash
pnpm --filter @wenshu/markdown-import test    # 27 pass / 0 fail（12/5/10）
pnpm verify                                    # exit 0
git diff --name-only bec3a63..044b9f5 -- '*eslint*' docs/poc-a/fixtures/ '*.schema.json' sbom/ pnpm-lock.yaml   # 空
```

审计探针（11 类控制字符 + `\t` 保留 + 无误伤 + BOM 对账/逐行/deepEqual、2 处守卫变异）均在 `D:\tmp\pa48*` 仓外副本执行,收尾已删除。**本轮 `git status --short` 仅本报告文件。**

## 8. 结论与交接

**PA-A8、PA-A4 关闭。PA-03「消费文档文本渲染前控制字符已 fail-closed」的硬前置门禁满足。**

- PA-03 可消费 `paragraph.text` 等文本渲染——导入边界已保证渲染层不再见到 C0/C1/DEL/LS/PS 与行中孤立 `\r`。
- **PA-C1** 请 PA-03 知情（Cf 格式字符仍会出现,属正确范围划定,如需处置在 PA-03 内）。
- **PA-A7**（front matter 非 title 键记账口径）归属不变,未在本轮,不阻断 PA-03。
- 任何 PA-03 调用 `importMarkdownDocument` 的点须遵决策 #9 调用点契约（传公共根）。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
