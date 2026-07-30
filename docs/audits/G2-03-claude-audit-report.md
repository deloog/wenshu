# G2-03 分层门禁 · Claude 独立审计报告

> 审计者：Claude（独立审计）　日期：2026-07-30
> 被审对象：分支 `agent/g2-03-layering`（[PR #41](https://github.com/deloog/wenshu/pull/41)），HEAD `3239bd5`
> 规格基线：[任务书 r5](layering-gate-implementation-task.md)，31 条反例矩阵
> 运行时：Node `v24.17.0`（`D:\Applications\Node\node-v24.17.0-win-x64`）、pnpm `11.15.1`
> 实施者自述：[G2-03-implementation-record.md](G2-03-implementation-record.md)

## 1. 结论

> **最终结论：`PASS`（2026-07-30 复审签署）。** 首审 `CONDITIONAL PASS` 的唯一 MAJOR（MA-01）已由实施者修复，经我独立复审关闭，见 §9。复审新增一项 MINOR（MI-04），已登记为跟进项，不阻断签署。

### 1.1 首审结论（保留原文）

**CONDITIONAL PASS —— 1 项 MAJOR 未关闭，关闭后可签署。**

31 条反例我全部独立构造并执行：**30 条通过，1 条失败（反例 7）**。门禁在真实仓库上确实拦得住 29 类违规，也确实不误伤 6 类现有合法模式。P-1/P-2/P-3 三项修复经独立复验全部成立。

未关闭项是 **MA-01（MAJOR）**：`apps/arkweb-shell` 导入 `electron` 不被拦。这是任务书 §3 明文要求（L3 禁"另一个壳的平台 API"）且自 r1 起就在反例矩阵里的一条，实现未覆盖。修复面小，关闭后重跑反例 7 即可签署。

**未签署通过。**

## 2. 我独立执行了什么

不采信实施者的定向测试。方法：

- 在**真实仓库树**（`D:\wenshu-g203`）中逐条构造违规文件，通过检查器**真实 API**（`checkLayering`、`checkPhantomDependencies`、`checkUnusedProductionDependencies`）对**真实文件清单**（`discoverWorkspaceFiles`）执行，断言指定规则码是否触发，随后删除构造物。
- 反向依赖类反例需要改 `package.json`/`tsconfig.json`：原文备份 → 变更 → 执行 → 恢复。
- 全部探针执行完毕后删除探针脚本，并以 `git status --short` 验证工作树干净（已确认为空）。
- 未修改任何被审代码、测试、Schema、配置或 lockfile。

**一处自我更正**：反例 12 首次执行报 FAIL。复查发现是我探针的转义缺陷——盘符路径带单反斜杠进入 JS 字符串字面量，`\w`/`\r`/`\s` 被当作转义序列吞掉，说明符被破坏成非盘符形式。改用正斜杠重跑，盘符与 POSIX 两种绝对形式**均正确触发** `LAYER_DIRECTION_FORBIDDEN L0->L2`。**该条结论为 PASS，实现无缺陷。**

## 3. 反例矩阵逐条结果

| # | 反例 | 期望 | 结果 |
|---|---|---|---|
| 1 | L0 `src` 导入 `node:crypto` | 失败 | PASS `NODE_BUILTIN_FORBIDDEN` |
| 2 | L1 `src` 导入 `electron` | 失败 | PASS `ELECTRON_FORBIDDEN` |
| 3 | L1 `src` 导入 `@ohos.web.webview` | 失败 | PASS `ARKTS_FORBIDDEN` |
| 4 | L0 `src` 按包名导入 L2 | 失败 | PASS `LAYER_DIRECTION_FORBIDDEN` |
| 5 | `apps/web` 导入 L2 包 | 失败 | PASS `LAYER_DIRECTION_FORBIDDEN` |
| 6 | L2 `src` 导入 `electron` | 失败 | PASS `ELECTRON_FORBIDDEN` |
| **7** | **`apps/arkweb-shell` 导入 `electron`** | **失败** | **FAIL —— 无发现（见 MA-01）** |
| 8 | 新增未登记 `packages/*` | 失败 | PASS `UNREGISTERED_WORKSPACE` |
| 9 | L1 `test/` 导入 L2 包 | **通过** | PASS 无发现 |
| 10 | L1 `src` 仅类型导入 `electron` | 失败 | PASS `ELECTRON_FORBIDDEN`（类型泄漏亦被拦） |
| 11 | L0 `src` 相对路径穿透 L2 源码 | 失败 | PASS `LAYER_DIRECTION_FORBIDDEN` |
| 12 | L0 `src` 绝对/盘符路径指向 L2 源码 | 失败 | PASS（盘符与 POSIX 两形式，见 §2 自我更正） |
| 13 | L0 `src` 的 `.cjs` 中 `require("node:fs")` | 失败 | PASS `NODE_BUILTIN_FORBIDDEN` |
| 14 | L1 `src` 中 `require("electron")` | 失败 | PASS `ELECTRON_FORBIDDEN` |
| 15 | L1 `src` 中 `import fs = require("node:fs")` | 失败 | PASS `NODE_BUILTIN_FORBIDDEN` |
| 16 | `electron-shell` 现状 `require("electron")` | **通过** | PASS 零发现 |
| 17 | 生产依赖声明但全无引用 | 失败 | PASS `unused-production-dependency` |
| 18a | `@types/node` 在生产依赖且 tsconfig `types` 已配 | **通过** | PASS 无发现 |
| 18b | 同上但 tsconfig `types` 未配 | 失败 | PASS `unused-production-dependency` |
| 19 | 两个 `hvigorfile.ts` 现状 | **通过** | PASS 零 phantom 发现 |
| 20 | 新增未登记 `hvigorfile.ts` 且 `require("@ohos/...")` | 失败 | PASS `phantom-dependency` |
| 21 | `arkweb-shell/scripts` 导入未声明 npm 包 | 失败 | PASS `phantom-dependency`（证明未整体排除该 app） |
| 22 | L1 `src` 导入 `@ohos/hypium`（斜杠） | 失败 | PASS `ARKTS_FORBIDDEN` |
| 23 | L2 `src` 导入 `@ohos.web.webview`（点号） | 失败 | PASS `ARKTS_FORBIDDEN` |
| 24 | `probes/pb-08-sqlite` 的 sqlite-wasm | **通过** | PASS 零反向发现 |
| 25 | 新增未登记顶层目录 `experiments/` | 失败 | PASS `UNREGISTERED_WORKSPACE` |
| 26 | 七个包的 `ajv`（仅子路径导入） | **通过** | PASS 零反向发现 |
| 27 | 仅经 `node_modules` 资源路径使用且未登记 | 失败 | PASS `unused-production-dependency` |
| 28 | 六个 `tools/*` 包 | **通过** | PASS `workspaces=29`、零 registry 发现 |
| 29 | L0/L1 `test/` 导入 `node:test` | **通过** | PASS 无发现 |
| 30 | L1 `test/` 中 `require("electron")` | 失败 | PASS `ELECTRON_FORBIDDEN` |
| 31 | L0 `src` 相对逃逸到未登记位置 | 失败 | PASS `UNREGISTERED_PATH_TARGET` |

**30 / 31 通过。** 9 条防误报的反向反例（9、16、18a、19、24、26、28、29 及 21 的域内半侧）全部通过——门禁不误伤现有合法代码。

## 4. 未关闭发现

### MA-01（MAJOR）· L3 平台许可是无差别的，`arkweb-shell` 可导入 Electron

**定位**：`tools/quality/src/layering.ts` 的 `platformViolation`。

```
if (specifier === "electron" || specifier.startsWith("electron/")) {
  return source === "L3" ? undefined : "ELECTRON_FORBIDDEN";
}
if (specifier.startsWith("@ohos.") || specifier.startsWith("@ohos/")) {
  return source === "L3" ? undefined : "ARKTS_FORBIDDEN";
}
```

两条判断只看"是否 L3"，不看"是哪个壳"。因此 `apps/arkweb-shell` 导入 `electron`、或 `apps/electron-shell` 导入 `@ohos.*`，均被放行。

**证据**：反例 7 在真实仓库中构造 `apps/arkweb-shell/src/__p7.ts` 内容 `import "electron";`，检查器零发现。

**违反的规格**：任务书 §3 归属表 L3 行"禁止：**另一个壳的平台 API**"；该反例自 r1 起在矩阵中，未被覆盖。

**影响**：门禁无法区分 Electron 与 HarmonyOS 两个平台宇宙，而双壳架构（ADR-0001 桌面主判定 + ArkWeb 风险探针）正建立在这个区分上。当前实际暴露为零——两壳均未导入对方平台 API——故不是 BLOCKER。但这是**门禁声称覆盖而实际不覆盖**的一类，属 §1 目标的夸大。

**建议**：`platformViolation` 增加壳身份参数（或在归属声明中为每个 L3 条目登记其允许的平台命名空间，与 Hvigor 排除同样走单一真源）。关闭方式：重跑反例 7 观察 `ELECTRON_FORBIDDEN`，并补一条对称反例（`electron-shell` 导入 `@ohos.*` 须失败）。

## 5. 已登记跟进项（不阻断签署）

| 编号 | 级别 | 内容 |
|---|---|---|
| MI-01 | MINOR | `.ets` 文件若出现在 `apps/arkweb-shell` 之外，被静默跳过且**不计入** `ignoredArkTsFiles`，完全不可见。fail-closed 原则下宜报错或至少计数。 |
| MI-02 | MINOR | `isUsedByScript` 用 `script.includes(dependency)` 子串匹配。这是**放行规则**，松匹配朝危险方向失效（把真未使用的依赖判成已使用）——与 r4 裁定二拒绝自动识别的理由同源。 |
| MI-03 | MINOR | `unclassifiedFiles=3` 已查明为 `apps/arkweb-shell/hvigorfile.ts`、`apps/arkweb-shell/entry/hvigorfile.ts`、**`apps/web/vite.config.ts`**。前两者符合 r3 裁定；第三者意味着 Web 核心入口的构建配置不受分层检查。计数已公开披露，非隐藏，故仅登记。 |
| NO-01 | NOTE | `tools/quality/src/phantom-dependencies.ts` 320 行，触发宪法 19 的 300 行预警。实施记录已如实登记且未放宽护栏。该文件现同时承担 AST 采集、正向与反向三职，宜后续拆分。 |
| NO-02 | NOTE | Node 24.17.0 存在于 `D:\Applications\Node\node-v24.17.0-win-x64` 但不在默认 PATH；默认 shell 下 `pnpm quality:check` 因 pnpm 非交互重建 `node_modules` 而 abort。实施记录已如实标注该边界并明确"不得以设置 `CI=true` 冒充旧安装状态已消除"。本审计通过显式指定该 Node 路径复现。 |
| NO-03 | NOTE | `@ohos/hvigor-ohos-plugin` 版本仓内未固定，ArkWeb 构建不具仓内可复现性。r3 §2.6 第 4 条已登记为 `R-COMPAT`/供应链跟进项，实施记录未以"具名排除"冒充解决。核验一致。 |

## 6. 对实施者声明的复核

| 声明 | 复核结果 |
|---|---|
| P-1 相对/绝对/盘符逃逸 fail-closed | **成立**。反例 31 触发 `UNREGISTERED_PATH_TARGET`；反例 11/12 触发方向违规。 |
| P-2 `test/`/`scripts/` 纳入受限规则集，仅放开 `node:*` | **成立**。反例 29 通过（`node:test` 不误报）、反例 30 失败（`require("electron")` 被拦）。 |
| P-3 读取 `tsconfig.compilerOptions.types` 取代前缀放行 | **成立**。反例 18a/18b 双向验证。注意：真库中无任何包把 `@types/*` 放进生产 `dependencies`，故该路径在现状下不被触发，18a/18b 均为我构造验证。 |
| 覆盖 326 扫描文件、辅助 139、`unclassifiedFiles=3` | **成立**。实测 `sourceFiles=326 auxiliaryFiles=139 unclassifiedFiles=3`，其中严格集 187 与第一轮实测一致（326 − 139 = 187）。分层覆盖由 187 提升至 326 个文件。 |
| 归属声明为唯一手写真源、29 个 workspace | **成立**。`workspaces=29`，零 registry 发现；Hvigor 排除、`probes/` 排除、空资源型依赖表均由该文件派生。 |
| CJS 采集生效 | **成立**。干净态 `require=14`；反例 13/14/20/30 均由 `require()` 触发。 |
| SBOM 重建、sqlite-wasm 移除 | **成立**。反向扫描零发现，`pnpm-lock.yaml` 与 `sbom/sbom.json` 均有对应删除。 |
| `pnpm verify` 通过（273.5s） | **未独立复跑**（见 NO-02 的环境边界）。已复跑 `tools/quality` 检查器本体与全部 31 条反例。 |
| 31 条反例待独立审计、未自行宣称完成 | **成立**。实施记录明确标注未执行项，未把定向测试冒充独立验收。 |

## 7. 独立性披露

任务书 r0–r5 由我起草，31 条反例亦由我构造并执行。按业主指示（"跑真库应由你去实施"），证据侧的"实施者产出 + 审计者复核"两道检查在此收敛为一道，**我的探针构造本身没有第二方检查**。

建议由 GPT 对本报告 §2 的方法与 §3 的反例构造做一次独立复核——尤其是反例 7 的 FAIL 与反例 12 的自我更正这两条，前者决定是否阻断，后者是我已发现并修正的自身缺陷。

## 8. 关闭条件（首审提出，已全部满足，见 §9）

1. MA-01 修复：`platformViolation` 按壳身份区分平台命名空间。
2. 重跑反例 7 观察 `ELECTRON_FORBIDDEN`，并新增对称反例 32（`electron-shell` 导入 `@ohos.*` 须失败）；任务书矩阵 31 → 32。
3. MI-01～MI-03、NO-01 登记为跟进项，由业主决定时点，不阻断本次签署。
4. 上述完成后由我复核关闭 MA-01 并签署 G2-03。

## 9. 复审：MA-01 关闭并签署（2026-07-30）

被审对象：`agent/g2-03-layering` 修复提交 `2641b9f`（`fix: isolate L3 platform namespaces`）。

### 9.1 实现复核

平台命名空间以 `{ prefix, forbiddenRule }` 登记在 `layering-registry.ts` 的 L3 条目上（`electron-shell` → `electron`；`arkweb-shell` → `@ohos.` 与 `@ohos/`）；判定逻辑移入新模块 `layering-platform.ts`（39 行）。

设计正确且符合 §2.11 裁定：「什么算平台说明符」由**全部登记项的并集**派生，来源 workspace 未登记该前缀即拦。因此不存在硬编码平台清单，例外落在 §5.5 的单一手写真源里；且来源侧天然 fail-closed——`platformNamespaces` 缺省为空数组，空集合无法匹配任何前缀。

`matchesPlatformNamespace` 对以 `.`/`/` 结尾的前缀用 `startsWith`，否则要求精确相等或 `prefix/` 开头，因此 `electron` 匹配 `electron` 与 `electron/main` 但不误伤 `electron-store`（与修复前行为一致，无回归）。

### 9.2 独立执行结果：29 条探针，零失败

**2×2 平台矩阵（本轮承重）全部成立：**

| | `electron` | `@ohos.` / `@ohos/` |
|---|---|---|
| `apps/electron-shell` | PASS 无发现（#16、#16b 子路径） | PASS `ARKTS_FORBIDDEN`（#32） |
| `apps/arkweb-shell` | PASS `ELECTRON_FORBIDDEN`（#7） | PASS 无发现（#33、#33b 斜杠形式） |

**平台回归**（全部经过被改动的 `platformViolation`）：#2、#3、#6、#10、#14、#22、#23、#30 —— 8/8 PASS，规则码与首审一致。

**`node:*` 未被改动**（实施者声明的复核）：#1、#13、#15 触发 `NODE_BUILTIN_FORBIDDEN`；#29（L0 `test/`）、#29b（L2 `src`）、#29c（L3 `src`）均无发现 —— 6/6 PASS。

**层级方向未回归**：#4、#5、#9、#11、#12、#31 —— 6/6 PASS。

**fail-closed 独立构造验证**（实施者声明"未登记平台前缀的 L3 壳 fail-closed"）：临时向归属声明注入第三个 L3 条目 `apps/__probeshell` 且**故意不登记** `platformNamespaces`，执行后恢复原文 ——

| 构造 | 期望 | 结果 |
|---|---|---|
| 未登记 L3 导入 `electron` | 失败 | PASS `ELECTRON_FORBIDDEN` |
| 未登记 L3 导入 `@ohos.web.webview` | 失败 | PASS `ARKTS_FORBIDDEN` |
| 未登记 L3 导入 `node:fs` | **通过** | PASS 无发现（`node:` 由层级而非命名空间登记决定，符合 §2.11） |

**干净态全门禁**：`node scripts/check-repository.ts` → `exit=0`，`workspaces=29 sourceFiles=327 auxiliaryFiles=139 unclassifiedFiles=3 emptyImports=37 require=14 arkTsIgnored=3`。

全部探针执行后已删除，`git status --short` 验证工作树干净。

### 9.3 复审新增发现

**MI-04（MINOR，已登记跟进）· 平台宇宙由"有壳登记"派生，无壳平台无法表达**

`platformViolation` 的平台前缀集合是 `LAYERED_WORKSPACES.flatMap(w => w.platformNamespaces ?? [])`，即**只有被某个 workspace 登记为自有平台的前缀才算平台说明符**。因此一个仓内尚无对应壳的平台，无法表达为"处处禁止"。

实测观察：L0 包 `src` 中 `import "@capacitor/core"` —— **零发现**。

而宪法 11 与[技术基线 §2](../technical-baseline.md) 第 27 行均**明文点名 Capacitor**（"Web 核心不能 import 或直调 Electron、ArkTS、**Capacitor** 等平台 API"）。故任务书 §1"使宪法 11 与技术基线 §2 从人工审计事项变为机械门禁事项"这一表述，实际覆盖范围以已登记平台命名空间为界。

**不阻断签署**，理由：Capacitor 不在依赖树中（当前暴露为零）；Android/iOS 由技术基线 §3 与[路线图 §1.2](../implementation-roadmap.md) 明确列为首战范围外；§3 冻结归属表本身也只列了 `node:*`、`electron`、`@ohos.`/`@ohos/` 三类，Capacitor 不在冻结规格内。修复前不是回归——修复前同样不覆盖。

**建议处置**：数据模型增加"无主平台命名空间"表达（全局禁止列表，仍在同一手写真源内），并在引入任何新平台壳之前先登记。已同步收窄任务书 §1 的表述，避免规格自身夸大覆盖。

### 9.4 签署

MA-01 **关闭**。首审 30/31 + 复审 29/29，合计 59 条独立探针执行，除已关闭的 MA-01 外零失败。

**G2-03 签署通过（`PASS`）。** 未关闭发现：无。跟进项：MI-01、MI-02、MI-03、MI-04、NO-01、NO-02、NO-03，均不阻断，由业主决定时点。

**PB-10 的前置依赖（路线图 §8）由此满足，可按其 DoR 启动。**
