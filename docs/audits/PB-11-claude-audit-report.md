# PB-11 Claude 独立审计报告（首审）

> 审计对象：`PB-11` 知识包导出与干净环境重导入（R-OUTPUT/R-DATA）。
> 审计基线：`main` `2b49900` → `ed0dc27`（PR #50 squash，19 文件，+1688）。**代码已在审计前合入 `main`**，见 MAJOR-2。
> 审计方法：隔离干净克隆（`D:\tmp\pb10-audit` @ `ed0dc27`，`pnpm install --frozen-lockfile`）+ 全套件与 `pnpm verify` 独立复跑 + **自建对抗探针**（单点篡改 × 5 类真源、自洽改写、手工改写 ZIP 原始字节的穿越、未声明条目、派生删除、grant 边界）+ **失效方向变异**（短路字节哈希校验）。审计只新增本报告一个文件。
> 审计环境：Win10 `wenshu-dev-primary`，D 盘冻结 Node v24.17.0 / pnpm 11.15.1。

## 1. 结论

**FAIL —— PB-11 首审不通过，不得标记完成，不得据此放行 `PB-12`/`A-11`。** 两项 MAJOR（一项代码、一项流程）、六项 MINOR；无 BLOCKER。

摘要：**m-01 是真闭合的，防篡改的承重部分立住了**——我对五类真源逐类改一位字节，五次全部 `PACKAGE_HASH_MISMATCH`；即便把 manifest 里对应的 `sha256` 一并改成新值，`document`/`template`/`material` 仍被交叉校验拦下；手工改写 ZIP 原始字节做目录穿越也被拒。**但 ADR 声明的"以已授权 grant 目录为边界"在代码里根本没有实现**——`targetRoot` 与 `grant` 是两个互不相干的参数，我把包导进了一个与授权目录毫无关系的位置，而授权目录自始至终是空的（MAJOR-1）。另外，**这一棒在独立审计之前就已经 squash 合入 `main`**，与 AGENTS 的实施/审计分离规则相悖，也使上述缺陷已经落在主干上（MAJOR-2）。

## 2. 我独立坐实的部分（这些是真的）

| 项 | 我的独立结果 |
|---|---|
| 干净克隆可复现 | `pnpm install --frozen-lockfile` 成功；`pnpm verify` **exit 0**；`quality:check` 通过（384 源文件，仅一条测试文件 300 行预警） |
| 包测试 | `@wenshu/knowledge-package` **10/10** |
| **m-01 命门（单点篡改）** | 我把 `truth/project.json`、`truth/audit.ndjson`、`truth/document.json`、`truth/template.json`、`truth/materials/*` **逐类翻转一个 bit**，**5/5 全部 `PACKAGE_HASH_MISMATCH`**。`truth.project`/`truth.audit` 的 sha256 确实来自 `canonicalJsonBytes`/`canonicalNdjsonBytes` 的真实字节，不是 manifest 自报值的复制 |
| 交叉校验有第二道 | 把文件字节与 manifest 中对应 `sha256` **一并**改成自洽的新值：`document`/`template`/`material` 仍被 `PACKAGE_MANIFEST_MISMATCH` 拦下（project.json 钉住了它们的哈希）——不是"只信 manifest 自报" |
| 目录穿越 | 我绕过它自己的 `createZip`，**直接改写 ZIP 原始字节**把条目路径改成 `../../document.json`（等长替换，偏移不变）→ 导入被拒。读侧 `validateEntryPath` 与 `writeFileAtomicUnderRoot` 双层都在 |
| 派生不是必要条件 | 删除 derived 文件 + manifest 条目后仍可导入 ✓ |
| 事务不留半包 | 所有失败用例中目标目录均未出现，临时目录被清理，无残留 |
| 决定性变异 | 我把 `import.ts:117` 的 `actualSha256 !== entry.sha256` 短路为 `if (false)` ⇒ **6 条测试变红**（10→4 pass/6 fail），与实施记录自述一致 |
| 子进程 round-trip 为真 | 测试确实 `spawnSync(process.execPath, ["--input-type=module","--eval",…])` 起**独立 Node 实例**导入并回吐 `projectId`/`audits`，不是同进程函数调用 |
| 供应链 | **零新增第三方依赖**；lockfile 仅增 workspace link；`sbom.json` 仅多一条 workspace 条目（170 包） |
| 分层 | 新包登记 L2，源码只用 `node:*`，无 `electron`/`@ohos` |

## 3. MAJOR（阻断签署）

### MAJOR-1　ADR 声明的 grant 目录边界在代码中不存在，导入可写到授权范围之外

- **定位**：[packages/knowledge-package/src/types.ts:52-59](../../packages/knowledge-package/src/types.ts)、[src/import.ts:135-204](../../packages/knowledge-package/src/import.ts)。
- **事实**：`ImportKnowledgePackageOptions` 把 `targetRoot`（写到哪）与 `grant`（授权凭据）声明为**两个互不相干的字段**，`importKnowledgePackage` 全程**没有任何一处检查 `targetRoot` 是否位于 `grant.root` 之内**。`grant` 唯一的用途是第 198-202 行调用 `protectImportedFile`。
- **与文档的冲突**：[ADR-0026](../adr/0026-PB-11知识包导出与干净环境重导入.md) 决策行明写"读写以**已授权 grant 目录为边界**"，§4 又写"PB-11 的 API 直接接收已授权目录（grant root）与 ZIP 文件路径"。实现与之不符。
- **我的独立复现**：构造一个授权目录 A 与一个毫不相干的目标目录 B，把 A 的 grant 与 B 的 `targetRoot` 一起传进去：

  ```text
  targetRoot unrelated to grant.root  -> IMPORTED  files=[derived,truth]
       写入了 …\wenshu-probe2-wXMS4C\project
       授权目录是 …\wenshu-elsewhere-oTqRvx （内容: [] —— 自始至终是空的）
  ```

- **连带后果**：`protectImportedFile(options.grant, basename(entry.path))` 把材料的**裸文件名**登记进一个并不覆盖这些文件的 grant。PB-10 的原件保护按 `grantRoot` 下的平坦文件名判定，而材料实际落在 `targetRoot/truth/materials/<id>.<ext>`——**这一路径上的"导入原件保护"是装饰性的**：登记的名字与真实文件位置不对应。这正是 [PB-10-followups #1](PB-10-followups.md) 交给 PB-11/A-02 的那条承接项，当前并未真正兑现。
- **为什么是 MAJOR**：失效方向是 **fail-open**（写到授权范围之外），且写在权威 ADR 里的安全边界与实现不符——A-02/A-11 的实现者读 ADR 会理所当然地认为传了 grant 就受约束。当前实际暴露为零（唯一调用方是测试），与 `G2-03` 首审 MA-01 同一口径。
- **修复方向**（任选其一，须书面裁定）：① `importKnowledgePackage` 在入口校验 `targetRoot` 必须位于 `resolve(grant.root)` 之内，否则 fail-closed（并让 `protectImportedFile` 登记与真实落点一致的名字/相对路径）；② 若确实要允许 grant 与 targetRoot 解耦，则**改 ADR**，删掉"以 grant 目录为边界"的表述，明确写出"边界由调用方保证"，并把该责任登记为 A-02/A-11 的硬前置。**不接受实现与 ADR 各说各话。**

### MAJOR-2　（流程）代码在独立审计之前已合入 `main`

- **事实**：PR #50 已 squash 合入 `main`（`ed0dc27`），台账尚无 `PB-11` 行，本报告是第一次独立审计。
- **与规则的冲突**：[AGENTS §实施与独立审计](../../AGENTS.md) 明写「每项原子实施任务完成自检后标记"已实现，待独立审计"；**独立审计 `PASS` 或合规的 `CONDITIONAL PASS` 后才可标记最终完成并启动依赖任务**」；[DoD §9](../../DEFINITION-OF-DONE.md) 同义。PB-10 的流程是「PR 挂起 → 审计 → 修复 → 复审 → 合并」，PB-11 反了过来。
- **实际后果**：MAJOR-1 这条 fail-open 缺陷此刻**已经在主干上**。若后续棒次从 `main` 分叉，它会被继承。
- **要求**：由业主裁定修复路径——(a) 在 `main` 上以修复 PR 关闭 MAJOR-1（推荐，回滚成本更高），或 (b) revert `ed0dc27` 后重走审计流程。无论哪种，**这一棒在关闭 MAJOR-1 之前都不得标 ✅**，`PB-12` 也不得据此开工。

## 4. MINOR

| ID | 定位 | 事实与要求 |
|---|---|---|
| MI-01 | 口径（roadmap + [project-contract §3](../project-contract.md)） | **自洽改写不可检出**。我把 `truth/project.json` 的 `title` 改成"被改写的标题"、把审计事件的 `occurred_at` 改掉，并同步更新 manifest 的 `sha256` ⇒ **两次都导入成功**，改写后的标题原样出现在 `imported.project.title`。原因是包自带 manifest 即信任根，无外部锚（签名）。路线图 PB-11 行的验收句写的是绝对语气"**所有真源篡改拒绝**"——按字面未满足。**这不是实现缺陷，是口径缺陷**：须由业主书面收窄为"检出单点/不自洽篡改；自洽改写需签名，不在 PB-11 范围"，写进 ADR-0026 与实施记录，并登记为 `PB-12` 闸门与 `A-15` 安全专项的承接项。不得让绝对语气的验收句停留在路线图里而实现只做到一半 |
| MI-02 | [src/zip.ts:225](../../packages/knowledge-package/src/zip.ts) | `inflateRawSync(compressed)` **未设 `maxOutputLength`**，也没有条目数/总解压体积上限。声明的 `uncompressedSize` 由包自己提供，攻击者可与之对齐，故第 232 行的比对不构成防线——解压**先于**任何限制发生。这是仓内第一段解压不可信输入的代码。[路线图 A-15](../implementation-roadmap.md) 明列"压缩炸弹"属安全专项，故不算 PB-11 范围失守，但**新开的攻击面必须登记承接**；廉价缓解（`{ maxOutputLength }` + 条目数上限）建议顺手做掉 |
| MI-03 | [src/import.ts:208-219](../../packages/knowledge-package/src/import.ts) | **恶意包与磁盘故障不可区分**。`zip.ts` 抛的是 `ZipError`（`INVALID_PATH`/`CORRUPT`/`UNSUPPORTED`），不是 `KnowledgePackageError`，于是被外层 catch 统一裹成 `PACKAGE_IO_FAILURE`。实测：手工构造的 `../../document.json` 穿越包 → 调用方拿到的是 `PACKAGE_IO_FAILURE`，与"读盘失败"同码。对照 PB-09 §4 的同类 MINOR（磁盘满错误被掩盖）。建议把 `ZipError` 映射到 `PACKAGE_ZIP_INVALID` 并保留原因 |
| MI-04 | 任务书 §4 第 2 项 | **未声明的多余文件被静默接受**。我在包里塞入 `smuggled.txt`（不登记进 manifest）⇒ **导入成功**、无任何报错（该文件未落盘，因为提取只遍历 manifest 条目）。这恰好就是任务书自列的验收项「保留 derived 文件但删除 manifest entry（或反之）→ **应有明确失败**」——反向（manifest 有条目、文件缺失）会 `PACKAGE_MISSING_ENTRY`，正向没有防线。**任务书这一条未满足**，须补 ZIP 条目集合与 manifest 条目集合的双向对账 |
| MI-05 | [tools/quality/src/layering-registry.ts:48](../../tools/quality/src/layering-registry.ts) | 实施者**自行**在业主冻结的分层归属表中新增了 `packages/knowledge-package`。层级判定（L2）本身正确、无技术异议；但 [G2-03 边界](../implementation-roadmap.md) 与本任务开工指令 D2 都要求"确需新建 workspace 先停止上报，不得自行加行"。实施记录 §3 写"需新增 workspace **已获批**"，我无从核验该批准是否真实存在。**请业主确认**：若已批准，请在记录中写明批准出处；若未批准，这是一次越权修改冻结表 |
| MI-06 | [实施记录 §5](PB-11-implementation-record.md) | 验证清单最后一项「远程 CI 8/8（**待推送后执行**）」仍是未勾选状态，而实际 run `30648388219` 已 8/8。完成声明与事实不符（方向无害，但 DoD §2 要求如实列出实际执行的检查） |

## 5. NOTE（不要求整改）

- **崩溃残留不在 PB-10 的恢复域内**：导入用 `mkdtemp(\`${targetRoot}.wenshu-import-\`)` 建**同级**临时目录。正常失败路径会清理，但硬杀进程会留下 `.wenshu-import-*` 目录，而 PB-10 的 `recoverGrantDirectory` 只清 `.wenshu-tmp-*` 前缀——两套前缀互不覆盖，孤儿目录无人回收。PB-12 端到端强杀场景值得覆盖一次。
- **`formal_versions` 非空未实现**，已在实施记录 §6 如实登记，测试用空数组。
- 导入要求目标目录事先不存在；覆盖/合并策略留给 A-02/A-11，记录已声明。
- 测试文件 418 行，触 300 行预警未越 500 硬限，属正常。

## 6. 任务书必查项逐条对账

| 任务书项 | 判定 | 依据 |
|---|---|---|
| 1 字节级哈希（m-01 命门） | **通过** | `truth.project`/`truth.audit` 改一位均 `PACKAGE_HASH_MISMATCH`；sha256 确从 canonical 字节计算；NDJSON 含末尾换行 |
| 2 真源篡改矩阵 | **通过** | document/template/material 改一位全拒；manifest 单改 sha256（文件不变）→ 拒 |
| 3 干净环境 round-trip | **通过** | 真新目录 + `spawnSync` 独立 Node 实例，逐项对账 |
| 4 派生不是必要条件 | **部分通过** | 删除派生（文件+条目）后仍可导入 ✓；但"文件在、manifest 条目不在"**无失败**（MI-04） |
| 5 事务回滚 | **通过** | 所有失败用例目标目录不存在、无半包、临时目录已清理 |
| 6 原件保护 | **不通过** | `protectImportedFile` 确由导入方调用 ✓，但登记进的 grant 与落盘位置无关（MAJOR-1），保护不成立 |
| 7 分层与依赖 | **通过（带 MI-05）** | L2 登记正确、零新增第三方依赖、无平台导入；越权改冻结表待业主确认 |
| 8 测试真实性 | **通过** | 不 mock ZIP/文件系统；子进程为真；短路哈希校验 ⇒ 6 条变红 |
| 9 文档与契约 | **部分通过** | ADR-0026 / project-contract / 实施记录齐备，但 ADR 的 grant 边界表述与实现不符（MAJOR-1） |

## 7. 复现

```powershell
$env:PATH = 'D:\DevTools\pnpm;D:\Applications\Node\node-v24.17.0-win-x64;' + $env:PATH
git clone --no-hardlinks D:\wenshu <clone>; cd <clone>; git checkout ed0dc27
pnpm install --frozen-lockfile --store-dir D:\DevCaches\pnpm-store
pnpm --filter @wenshu/knowledge-package test    # 10/10
pnpm verify                                     # exit 0
# 变异（改完即还原）：import.ts:117 `actualSha256 !== entry.sha256` → `false`  ⇒ 10→4 pass/6 fail
```

自建探针（用后即删，未入库）：五类真源单点翻位、自洽改写（字节+manifest sha 同步更新）、手工改写 ZIP 原始字节的 `../../` 穿越、未声明条目走私、派生删除、grant 与 targetRoot 解耦。

## 8. 交接与关闭条件

- **MAJOR-1 由 Codex 修复，由我复审关闭**；实施者不得自行关闭发现。
- **MAJOR-2 由业主裁定**修复路径（`main` 上修 vs revert 重走），并请明确今后是否维持「审计通过后才合并」的既有流程。
- MI-01 需要**业主书面裁定**口径收窄（这不是实施者能自行决定的验收标准变更）；MI-02～MI-06 由实施者在同一轮处置，MI-05 需业主确认批准出处。
- **台账提醒**：本报告落盘后，§3.1 没有 `PB-11` 行会立即触发检查 8a，而该门禁**现在真的会让 `quality:check` 退出码非 0**（PB-10 MAJOR-5 已修）。请**当轮**补 `PB-11` 行，状态如实写 `🔄 已实现，待独立审计`，链接本报告；指纹按 [AGENTS 台账证据指纹规则](../../AGENTS.md) 用 `main` 上的 `ed0dc27`。
- 复审时我会重点重跑：grant 边界的 fail-closed 反例、材料原件保护在真实落点上的生效性、ZIP 条目集合双向对账、以及本报告 §2 全部通过项的不回潮。

---

*本报告由独立审计角色出具；台账与代码修复由实施者完成。审计期间仅新增本文件。*
