# PA-11B 目录双向对账/实际页码红线/页眉页脚一致性检查独立审计任务书（交给 Claude）

> 日期：2026-07-28　实施基线：PA-11B PR 合并提交（见 gh pr 记录）　报告目标：`docs/audits/PA-11B-claude-audit-report.md`

## 1. 角色与写入边界

你是独立只读审计者。不要采信实施记录、探针输出或测试全绿自述；独立
重放测量、重算对账、审查取舍。

- 只允许新增/修改上述审计报告；不得修改代码、测试、Schema、fixture、
  基线 PDF、文档或配置。
- 仓库外探针只写 `D:\tmp\pa11b*`，结束后删除；不得 push、创建 PR 或
  触发 Actions。

## 2. 实际页码红线（首要一刀）

- **模拟硬编码猎杀**：构造目录标注页码/页脚页码与标题实际页漂移的
  fault（自构，不抄实施方用例），确认全部被检出并定位；特别验证
  「actualPage 从证据读」不可被标注侧污染——标注与实际**同向同步
  漂移**（两者一起改错）时，检出依赖的必须是标题归属 run 的
  pageIndex 而非任何标注值。
- **独立重算**：从签署基线证据自写解析，重算 TOC 36/36 条目标注
  页码 vs 标题归属 run 实际页、页脚 20/20 页 `N === pageIndex+1`
  且 total===21——不接受实施方断言，自算全量。
- 变异复核：独立重跑 `pa-11b-mutation.unit.test.ts` 7 项，确认每项
  锚定机制要害（特别第 2 项「actualPage=标注冒充实际」与第 5 项
  「0 基页码→基线 20 页全红」的决定性）；可自构第 8 项蒙混路径
  （如 honest-gate 条件改恒假使 REVIEW 变 finding、标注拼接窗口
  收窄漏多位页码）验证必被拦。

## 3. 双向对账与配对口径

- 配对机制审查：toc-entry ↔ section-title 配对靠 expected-content
  装配期同源 tocIndex（ADR-0011 §2），确认无几何启发式配对、无
  文本相似度匹配；同名标题场景归属层 fail-closed 路径独立构造验证。
- 缺项/多余/栏目标题未归属三类 fault 独立复现并核对定位粒度
  （条目 ref + relatedNodeRef 标题 ref / 行首 run / /toc 全域人工）。
- 标注解析：两位页码双 run 拼接口径（实施记录 §3.1）独立实测——
  自构三位页码/标注夹非数字文本场景，确认歧义 fail-closed 降人工
  而非猜。

## 4. 压印一致性与识别口径

- 压印识别单源：核 isStampRun/selectStampRuns/stripStampRuns 共用
  同一 STAMP_TAG_PATTERN（font tag 前缀，解析期事实）；确认判定域
  无几何启发式识别（位置/字号只用于位置均匀性判定，不用于识别
  「这是不是压印」）。
- 页脚文本对账：归一化路径（normalizePdfText）与 `N/total` 形态
  断言；封面豁免（pageIndex 0 任何压印 → P1_STAMP_ON_COVER）
  独立构造验证。
- 页眉对账溯源：期望值 = front matter short_title 声明值（经
  input.headerText），确认不读目录/封面文本冒充；缺 headerText 时
  诚实门降 P1_STAMP_REVIEW 且存在性/位置判定仍自动（独立复现）。
- 分域：压印 fault（移入版心/篡改/删除）不引发 P0/P1 内容域发现
  （零重判）；PA-07 遮挡判定对压印的既有排除不回潮。

## 5. 诚实门与报告契约

- findings/manualChecks 通道不串：任何 `*_REVIEW` 码绝不入 findings
  （全报告扫描）；manualChecks 不并入自动检出计数。
- 检出报告契约 v1.1.0 零漂移：新码注册不改 schema、validate-report
  对既有 fixture 双版本分发不回潮；诊断只带定位+数值，不回显正文
  （页眉篡改只报 textMatch 0，不带篡改文本）。
- 基线零误报：签署基线三新规则 0 findings、0 新增 manualChecks，
  人工核验项总数 33 不回潮（独立跑 run-p1-baseline 复核）。

## 6. 测试调整诚实性（重点审查）

- 实施记录 §3.2（honest-gate fault 删除改跨页）：独立判断论证是否
  成立——归属反向游标级联 fail-closed 是否确使删除类 fault 下条目级
  REVIEW 不可达（自构删除 fault 复现 `/toc` 全域降级）；调整后测试
  意图不变、不是为迁就实现而降低断言强度。
- 实施记录 §3.3（验收⑤断言调整）：确认新发现的
  P1_FOOTER_MISSING/P1_HEADER_MISSING@5 是正确行为而非误报。

## 7. 边界与门禁

- 零 PA-07~10 夹带：diff 核存量规则文件零改动、P1_RULES 只追加；
  存量测试刷新仅限规则数钉定/输入装配/§3.3 断言。
- 零新增第三方运行时依赖（SBOM 无新增）；冻结物零漂移（基线 PDF、
  模板、fixture 字节不变）。
- `pnpm verify` 复核 exit 0；远程 CI 8 作业矩阵 8/8 且与必需检查
  同名同数为签署生效条件。

## 8. 结论规则

- 任一目录标注页码/页脚页码与实际物理页不符且未被检出、actualPage
  存在非证据来源路径（标注/假设/硬编码）、压印识别使用几何启发式、
  同名/歧义场景被猜测而非降人工、`*_REVIEW` 混入 findings 冒充自动
  覆盖、基线人工项 33 回潮或新增误报、存量规则被改动、新增未申报
  依赖：`FAIL — PA-11B 不得完成，PA-12 不得启动`。
- 无 BLOCKER/MAJOR 且 MINOR 有归属：可给 `CONDITIONAL PASS`；完全
  满足给 `PASS`。审计者只给结论，由 Codex 完成台账。
