# G1-10 FX-01～FX-03 定点复核任务书（交给 Claude）

> 日期：2026-07-20　原报告：[G1-10-claude-audit-report.md](G1-10-claude-audit-report.md)　首审提交：`828a2ed`　报告提交：`718bdbd`　复核范围：`718bdbd..HEAD`

## 1. 边界

你是 G1-10 原独立审计角色。不要采信整改记录或全绿自述，只复核 FX-01～FX-03 及直接回归。

- 只允许严格追加修改 `docs/audits/G1-10-claude-audit-report.md`；首审 325 行不得删除或改写。
- 不得修改代码、测试、manifest、冻结原件、lockfile、路线图、配置、Schema、生成物或其他文档。
- 仓库外探针只写 `D:\tmp\g110*`，结束后删除；不得 push 或触发 Actions。
- 完成时工作树只能有原报告一处审计者修改。

## 2. FX-01

对不存在根目录、空根、删除 manifest、manifest 在 `lstat` 后消失、已登记文件在集合枚举后消失、枚举或读取权限失败（平台可行时）逐项验证：

- 必须抛 `FixtureIntegrityError`，根/文件集合问题为 `FIXTURE_SET_MISMATCH`，manifest 问题为 `FIXTURE_MANIFEST_INVALID`；
- 错误消息不得包含探针绝对根、盘符路径、Node `ENOENT/EACCES` 原始诊断或文件正文；
- 合法冻结目录以及原有链接、预算和篡改反例不得回归。

删除或绕过新的文件系统异常转换时，新增回归测试必须因收到原始异常/绝对路径而失败；确认不是只针对删除 manifest 点状修补。

## 3. FX-02

直接验证排序正确但仅大小写不同的 `a.txt/A.txt`、`REPORT-DATA.CSV/report-data.csv` 均命中可移植身份守卫；两个真正不同的合法路径通过。删除 `portable.size` 判断后，契约测试必须因期待 `portable path identity` 但未抛错而失败，不能由排序、精确重复或其他分支代打。

## 4. FX-03

至少复核：`C:foo.txt`、`a:b`、`con`、`NUL.txt`、`nested/COM1.log`、`lpt9`、尾随点、尾随空格、C0/DEL 控制字符均拒绝；大小写混合设备名及设备名带多重扩展同样拒绝。确认 `资产/图表1.png`、普通空格、`report.PDF`、`data/report 1.0.txt` 仍通过。

分别移除冒号、设备名、尾随点/空格、控制字符守卫，相关测试应因正确原因失败；不得以全局 ASCII 白名单替代可移植规则。

## 5. 回归与结论

- 运行 `pnpm fixtures:check`、包 typecheck、`pnpm test:integration`、`pnpm test:layers`、`pnpm verify`，记录实际计数。
- 重算 manifest 与 7 个冻结原件哈希，确认零改动；`FIXTURE_MANIFEST_SHA256` 不变。
- 零手写 `any`/抑制指令，体量护栏通过；CI 8 作业名、workflow、Schema、生成物和第三方依赖版本零漂移。

在原报告末尾追加“FX-01～FX-03 定点复核”章节，逐项给出原始反例、守卫承重实验、回归、未执行项和结论：

- 任一原发现未关闭或新增 BLOCKER/MAJOR：`FAIL — G1-10 不得完成`。
- 三项全部关闭且无新 BLOCKER/MAJOR：`PASS — G1-10 可以标记完成`；若有新 MINOR，必须给出归属和最迟关闭点。
