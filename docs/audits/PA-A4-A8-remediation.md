# PA-A4 / PA-A8 整改记录（PA-03 前置门禁 · 独立原子交付）

> 日期：2026-07-24　对应登记：[PA-01-followups.md](PA-01-followups.md)（PA-A4、PA-A8 同批处置）　状态：已修复，待 Claude 独立审计；实施者不自行关闭。
> 定位：PA-03 轨道第一个交付物、消费文档文本渲染前的硬前置；单独成原子提交，可独立签署。

## PA-A8（MINOR）— 控制字符与行中孤立 \r fail-closed（已修复）

- 问题属实：U+0000 NUL、BS、ESC、DEL、U+2028 及行中孤立 `\r` 原样进入 `paragraph.text`，PA-03 渲染与 PDF 生成消费行为未定义。
- **处置裁定（登记方向二选一，取 fail-closed）**：导入边界对 C0（`U+0000–U+0008`、`U+000B–U+001F`，**显式保留 `\t`**）、DEL（`U+007F`）、C1（`U+0080–U+009F`）、`U+2028`/`U+2029` 一律 fail-closed 拒绝。行尾 `\r` 已在 CRLF 剥离阶段计为语法消费（PA-A3），扫描阶段残留的 `\r` 必为行中孤立 `\r`，一并拒绝。
  - 取舍理由：与严格子集哲学和宪法 #18（可信失败优先于虚假通过）一致——静默清洗会改变用户正文且不易察觉；拒绝信息携带行号与码点（如 `control character U+001B … line 5`），用户可定位。`\t` 按 followups 登记方向显式保留并进入内容。
- 实现：`parser.ts` 在行切分/CRLF 剥离后、front matter 解析前逐行扫描，命中即抛 `IMPORT_UNSUPPORTED_SYNTAX`；**不回显正文**（仅行号 + 码点）。实现以码点判定函数表达字符类（初版控制字符正则触发冻结规则 `no-control-regex`，不改规则、改为码点判定）。
- 测试：单测 8 种形态（NUL/BS/ESC/DEL/C1 NEL/U+2028/U+2029/孤立 `\r`）逐一枚举拒绝 + `\t` 保留进入内容；集成测试导入边界端到端拒绝。
- 变异自证：守卫置空 → 单测与集成双双**变红**，且单测失败信息为「Missing expected exception」——**无任何邻近守卫代打**，该守卫是唯一防线（DoD §2 正确原因变红）。

## PA-A4（MINOR）— 前导 BOM 剥离并计入语法消费（已修复）

- 问题属实：带 BOM 文件被拒且错误信息误导（指向"缺 front matter 围栏"）。
- **处置裁定（登记方向二选一，取剥离计账）**：读入后剥离前导 `U+FEFF`，计入第 1 行（front matter 围栏行）`syntaxChars`（3+1=4），对账口径对原始文件闭合；BOM 无信息损失，Windows 记事本/Excel 导出为常态输入。正文中间的 `U+FEFF` 不作特殊处理（如实登记）。
- 测试：单测（`sourceChars` 含 BOM、逐行/汇总恒等式、块结构与无 BOM 版 deepEqual）；集成测试 **BOM + CRLF 组合**（Windows 记事本默认形态）端到端对账闭合。
- 变异自证：删 BOM 剥离 → 单测与集成双双**变红**（front matter 围栏校验报旧错，即回到 PA-A4 原状）。

## 实施者验证

- `pnpm --filter @wenshu/markdown-import test`：unit 12 + contract 5 + integration 10 = **27 pass / 0 fail**（原 23 + 新增 4）。
- 变异自证两处均变红（见上），变异后已逐字节还原，`git diff` 产品代码仅 `parser.ts`。
- `pnpm format:check` 通过；`pnpm verify` **exit 0 全绿**。
- 冻结物零改动、零新增依赖；golden fixture（LF、无 BOM）行为逐字节不变。

## 明确未做

- PA-A7（front matter 非 title 键记账口径）不在本轮范围，归属不变。
- 渲染层（PA-03）尚未实现；本交付仅保证 PA-03 消费 `paragraph.text` 时不再可能见到控制字符/孤立 `\r`（导入边界 fail-closed）。
