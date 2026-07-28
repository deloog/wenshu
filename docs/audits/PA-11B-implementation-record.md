# PA-11B 实施记录 · 目录双向对账/实际页码红线/页眉页脚一致性检查

- 任务：PA-11B（路线图 PA-11 行后半：目录↔标题双向对账、`toc_page_numbers_match`、页眉页脚一致性、实际页码红线）
- 日期：2026-07-28
- 包：`@wenshu/report-checks`（唯一改动包；零新增第三方依赖）
- 设计：[ADR-0011](../adr/0011-PA-11B目录页码与页眉页脚检查严重级与配对口径.md)
- 状态：已实现，待独立审计

## 1. 交付物

### 1.1 三条 P1 规则（P1_RULES 固定序尾追加，存量 11 条零改动）

- **p1-toc-reconcile**（目录↔标题双向对账，验收①）：应入目录的
  toc-entry 期望块未归属 → `P1_TOC_ENTRY_MISSING`（定位条目 ref +
  relatedNodeRef 配对标题 ref）；目录区域内未被期望块覆盖的非数字
  文本行（按视觉行归并）→ `P1_TOC_ENTRY_EXTRA`（定位行首 run）；
  目录栏目标题（toc-heading）未归属 → 全域不可定位，fail-closed
  降 `P1_TOC_RECONCILE_REVIEW` 人工（不猜不藏）。
- **p1-toc-page-match**（实际页码红线，验收③核心）：每条成对目录项
  `标注页码 === 标题实际印刷页`；**实际页只从证据读**（section-title
  归属 run 的 pageIndex+1，编号语义 ADR-0010），绝不用标注/假设值
  冒充实际。不符 → `P1_TOC_PAGE_MISMATCH`（metrics
  printedPage/actualPage/tocIndex）。任一侧不可判定（标题未归属、
  标题跨页异常、标注歧义）→ fail-closed 降 `P1_TOC_PAGE_REVIEW`
  人工。
- **p1-stamp-consistency**（页眉页脚一致性，验收②）：遵
  `browser_header_footer:false`——页眉页脚是 PA-11A 压印补偿，
  本规则核验压印而非假设浏览器原生存在。封面（pageIndex 0）出现
  任何压印 → `P1_STAMP_ON_COVER`；非封面页：缺页脚 →
  `P1_FOOTER_MISSING`、缺页眉 → `P1_HEADER_MISSING`、页脚归一文本
  `N/total` 且 N===pageIndex+1、total===页数（不符 →
  `P1_FOOTER_PAGE_MISMATCH`，metrics expectedPage/actualPage/
  expectedTotal/actualTotal）、页眉归一文本 === short_title 声明值
  （不符 → `P1_HEADER_INCONSISTENT`）、位置逐页均匀且在边距带内
  （不符 → `P1_FOOTER_INCONSISTENT`/`P1_HEADER_INCONSISTENT`）。
  输入无 headerText 时页眉文本对账诚实降 `P1_STAMP_REVIEW` 人工
  （存在性/位置判定不受影响）。

### 1.2 支撑模块

- `p1-toc.ts`（261 行）：目录域分析单源——attributeBlocks 归属后
  提取目录行结构（条目/标注/栏目标题），供两条 toc 规则共用；无目录
  文档全域静默（合成夹具不出声）。配对用 tocIndex 同源序号
  （expected-content 装配期给 toc-entry 与对应 section-title 挂同一
  tocIndex，禁几何启发式配对）。
- `stamp-scope.ts` 扩展：`isStampRun`/`selectStampRuns` 与既有
  `stripStampRuns` 共用同一识别依据（font tag 前缀
  `STAMP_FONT_TAG_PREFIX`，解析期事实，禁几何启发式）；页脚文本
  形态 `FOOTER_TEXT_PATTERN`（归一后 `N/total`）。
- plumbing：finding 码注册（11 个 finding 码 + 3 个 REVIEW 码）、
  P1CheckInput 增 `headerText`（front matter short_title 声明值溯源）、
  runner 装配 `stampRuns: selectStampRuns(evidence)`、`expected-content`
  tocIndex 装配、run-p1-baseline 注入 headerText。

### 1.3 测试

- `p1-toc.integration.test.ts`（7 例）：真实签署基线（sha 锚定
  `5d7c06bc…0828`）36 条目零误报、删条目→缺项检出定位、注入多余行
  →多项检出、标注 6→9→页码漂移检出（printed 9 vs actual 6）、移动
  标题实际页→红线检出（actual 侧翻动）、跨页 fault→诚实门降人工、
  回滚隔离+*_REVIEW 不入 findings+确定性。
- `p1-stamp.integration.test.ts`（12 例）：基线 40 压印 run 零误报、
  页脚错码/总数错/缺页脚/缺页眉/页眉篡改/位置带外/封面压印各检出
  定位、压印识别 font tag 单源口径、缺 headerText 诚实门（存在性
  仍自动）、回滚隔离、分域（压印 fault 不引发内容域重判）。
- `pa-11b-mutation.unit.test.ts`（7 项决定性变异，临时副本+锚定
  变异+动态导入）：页码对账失效→漏检、**actualPage 用标注冒充实际
  （红线命门）→漏检**、缺项检出失效→漏检、页脚对账失效→漏检、
  页码 0 基变异→基线 20 页全红（物理页 pageIndex+1 防线决定性）、
  页眉对账失效→漏检、压印识别失效→基线 20 页全报缺页脚。
- 存量刷新：P1_RULE_IDS 钉 11→14；合成夹具补 stampRuns/headerText；
  验收⑤空页 fault 断言调整（§3.3）。

## 2. 基线事实（探针实测，禁猜）

- 目录页 = pageIndex 2（物理 3），36 条目；条目行 = marker run +
  标题 runs + 尾部页码标注 run（**两位页码拆成两个 run**，如
  `"1"`+`"0"` x=229.9/236.0——标注解析取标注窗口内全数字 run 拼接）。
- 压印：40 run（pageIndex 1–20，封面豁免），页眉 `"⻓⽂交付效率观察"`
  （归一后 = short_title「长文交付效率观察」）baselineY 810.42，
  页脚 `"N / 21"` baselineY 25.2，x=51.02，9pt。
- 签署基线：toc 自动发现 0、stamp 自动发现 0、人工核验项 **33**
  不回潮（10 标题灰区 + 21 逐页密度 + 2 图片清晰度；三条新规则对
  基线零新增人工项）。

## 3. 实施期关键决策与修复（如实登记）

### 3.1 标注解析：两位页码拆分

初版只取条目行尾部单个数字 run → 22 条两位页码条目假 REVIEW。
探针实测两位页码由 Edge 拆成两个相邻 run，改为标注窗口内全数字
run 拼接后基线 0 误报。该事实已书面化进 ADR-0011。

### 3.2 honest-gate fault 由「删除标题」改「跨页移动」（测试机制调整，降级非检出缺口）

原 fault（删除正文标题 run）在 PA-08 归属命门反向文档序游标上级联
fail-closed：未匹配块之前的全部期望块（含整个目录域：栏目标题 +
36 条目）随之不可归属，p1-toc-reconcile 统一降 `/toc` 全域人工——
条目级 `P1_TOC_PAGE_REVIEW` 在该 fault 下**不可达**。这是归属层
PA-08 已审定的级联语义，不是本任务检出缺口。fault 改为把标题末
run 移到下一页（归属完整、实际页不可判定单变量），条目级诚实门
行为（0 findings + 1 REVIEW + headingMatched=1）实测恢复。测试
意图（不可判定即降人工、不以残留标注冒充实际）不变。

### 3.3 验收⑤空页 fault 断言调整

PA-11A 搬移 fault 删除 p5 全部 run 同时移除该页压印 → 新规则如实
报 `P1_FOOTER_MISSING@5`+`P1_HEADER_MISSING@5`（正确行为，非误报）。
该用例不再 deepEqual 全量 findings 清单，改为 some 断言目标发现。

### 3.4 exactOptionalPropertyTypes 修复

- P1CheckInput `headerText?: string` → `string | undefined`（输入
  显式传 undefined 与缺省同语义：诚实门降人工）；一处类型改动消
  全部测试/脚本 TS2379。
- 三处测试闭包内判别联合 narrow 失效（assert.ok 不跨函数边界）：
  narrow 后赋顶层常量（`template`/`basePage`）供闭包引用。

### 3.5 变异工装两处适配

report-checks 此前无文件级变异工装（PA-11A 在 pdf-export 起先例）。
本包适配：临时副本置于**包内**（workspace 依赖 @wenshu/* 可解析，
用毕即删）；`validate-report.ts` 运行时锚定 src 外的契约 schema，
副本须一并复制 `schema/` 目录。

## 4. 验证证据（本机 Win10 dev-primary，非签署环境）

- report-checks：**146/146**（存量 120 + 新增 26：toc 7 + stamp 12 +
  变异 7）。
- 决定性变异 7/7 全绿（每项控制组确认锚定机制要害，非测恒真式）。
- `run-p1-baseline`：findings=0、manualChecks=33（不回潮）。
- 质量门：生产文件 ≤261 行、测试文件 ≤333 行；prettier/typecheck
  随 verify 链。
- `pnpm verify`：exit 0（远程 CI 8 作业矩阵随 PR 复现，以 CI 8/8
  为生效条件）。

## 5. 门禁映射（开工指令逐条）

| 门禁 | 落实 |
|---|---|
| 目录↔标题双向对账（缺项/多余/指错页/标题未入目录均检出） | p1-toc-reconcile + p1-toc-page-match；四类 fault 内存派生全检出定位 |
| 目录项页码 === 标题实际印刷页；实际页从证据读非假设（红线命门） | actualPage = section-title 归属 run pageIndex+1；变异「actualPage=标注冒充」锚定变红 |
| 页脚页码 === pageIndex+1（封面例外） | p1-stamp-consistency；0 基变异 → 基线 20 页全红（防线决定性） |
| 页眉页脚一致性（遵 browser_header_footer:false 核压印补偿方式） | 核验压印存在/文本/位置逐页均匀；ADR-0011 §4 书面证成 |
| 压印识别共用 stamp-scope 单源口径（font tag 前缀，禁几何启发式） | isStampRun/selectStampRuns/stripStampRuns 同一 STAMP_TAG_PATTERN；变异识别失效 → 基线 20 页全报 |
| 同名标题歧义 fail-closed 降人工 | 归属层三重防线既有语义；标注歧义/标题跨页/未归属 → P1_TOC_PAGE_REVIEW |
| 能力触顶入 manualChecks 不伪装 | 缺 headerText → P1_STAMP_REVIEW（存在性仍自动）；*_REVIEW 绝不入 findings（断言钉定） |
| 只检测不代改 | 三规则纯判定，零写出路径 |
| 零 PA-07~10 夹带 | 存量规则零改动（diff 可核）；分域测试：压印 fault 不引发内容域发现 |
| 禁重解析/禁 mock | 唯一输入 PA-06 冻结证据模型 + 受控模板路径；集成测试真实签署基线 sha 锚定 |
| 诊断只带定位+数值不回显正文 | metrics 全数值（printedPage/actualPage/tocIndex/expectedPage…）；页眉对账只报 textMatch 0/1 |

## 6. 交棒

- **PA-12 汇总闸门**：PA-07~11 全检查族就位（P0 四规则 + P1 十四
  规则）；届时逐项复核 PA-J1/PA-K1/PA-L1~L4/PA-M1~M5 与 PA-11B
  新增承接项（[PA-11B-followups](PA-11B-followups.md)）真实承接。
