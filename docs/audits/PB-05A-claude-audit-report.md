# PB-05A 冻结审计哈希指称 / 模型标识 / system 权限（关闭 G1-07 NF-01/02/03）· Claude 独立审计报告

> 审计者：Claude（独立只读审计）　日期：2026-07-29
> 实施基线：PR #35 分支 `pb-05a-audit-contract`（提交 `4b42f7d`）；**base = `pb-05-locatable-diff`（PR #34，尚未并入 main）**
> 远程验证：CI **8/8 pass**；worktree 隔离 `pnpm install --frozen-lockfile` 复跑 project-contract **27/27**（audit-semantics **10/10**）
> 审计方法：**NF-02 不误杀/凭证无入口独立喂对抗 + NF-01 主体伪造/跨 action 变义独立喂对抗 + NF-03 system 正反矩阵独立跑 + 0.1 兼容独立复现 + 残留启发式 grep**;探针收尾已删除。
> 写入边界：本轮仅新增本文件；GitHub 只读。

---

## 1. 结论

**PASS —— PB-05A 通过。** 无 BLOCKER/MAJOR/MINOR。**G1-07 登记的 NF-01/02/03 三项独立坐实关闭**;审计哈希指称、模型标识、system 权限已冻结,PB-06 前置就绪。

- **合并顺序须知(非缺陷,提示台账)**:#35 以 **#34 分支为 base**、#34 尚未并 main。合并须**先 #34 再 #35**;我审的是 #35 相对 #34 分支的**净增量**(11 文件),NF 逻辑与 PB-05 无耦合。
- **NF-01 关闭(命门,我独立喂对抗)**:0.2 事件 `template_applied` 两侧哈希主体**必须为 `template`**、其余 action 必须为 `document`;**用 document 主体伪造模板哈希 → 拒**、缺主体 → 拒;**主体字段随 action 显式固定、不跨 action 隐式变义**(非模板事件填 `template` 主体 → 拒)。
- **NF-02 关闭(命门,我独立喂对抗)**:`provider` 改为**封闭 enum 注册表**、`model` 去子串黑名单只留字符集;**含 `key/secret/token/sk-` 子串的合法 model 零误杀**;**凭证字段无入口**(`additionalProperties:false`,`credential/api_key/token/secret/password` 全拒);旧敏感子串/熵启发式**已彻底移除**(grep 为空)。
- **NF-03 关闭(命门,我独立跑矩阵)**:`system` **唯一允许 `template_applied`**;system × 其余 4 类 action **全拒**、user × 同 action 通过——正反矩阵成立。
- **0.1 兼容诚实**:0.1 非模板旧事件**可读**;0.1 模板事件 **fail-closed**(须迁移重建为 0.2)。

## 2. NF-02 结构化注册 / 凭证无入口 / 不误杀（命门,独立喂对抗）

旧契约以负向前瞻子串黑名单 `(?!.{0,20}(?:key|secret|token))` 兼防凭证——**既误杀 `keystone/tokenizer` 又以关键词猜测充当密钥防护**(NF-02 病灶)。新契约结构化替代,我在仓外独立跑真实 `validateProjectContract`:

| 对抗 | 结果 |
|---|---|
| model = `keystone`/`monkey`/`tokenizer`/`api-key-thing`/`secret-sauce`/`token-master`/`sk-model-x` | **全 valid(零误杀)** |
| 加字段 `credential`/`api_key`/`token`/`secret`/`password`/`authorization` | **全 `PROJECT_SCHEMA` 拒(无入口)** |
| provider = anthropic/openai/google/local/test | valid;`other`/`evil`/`sk-leak` → **拒(封闭注册表)** |
| 加字段 `prompt`/`content`/`document_text` | **全拒(正文/提示不入审计真相)** |

**判定**:凭证防护归受控配置边界、不伪装成审计校验(ADR-0020 §2);合法产品标识不被关键词误杀;`additionalProperties:false` 使凭证结构性无入口——NF-02 关闭。

## 3. NF-01 哈希主体 / NF-03 system 矩阵 / 0.1 兼容（命门,独立喂对抗）

| 对抗 | 结果 |
|---|---|
| **NF-01** system `template_applied` + 主体=`template` | valid |
| 　同上但主体=`document`(伪造文档哈希) | **拒** |
| 　`template_applied` 缺主体 | **拒** |
| 　**跨 action**:`ai_change_decided` + 主体=`template` | **拒**(非模板须 `document`,主体不隐式变义) |
| **NF-03** system + `template_applied` | valid |
| 　system + `ai_change_decided`/`user_changed_after_ai`/`source_linked`/`formal_version_approved` | **4/4 全拒** |
| **0.1** 非模板(`ai_change_decided`,无新字段) | **valid(可读)** |
| 　0.1 模板事件 | **拒(fail-closed)** |

**判定**:哈希主体逐 action 显式、模板不能靠 document 哈希表达、字段不跨 action 变义;system 权限以正反测试而非调用方约定固定;0.1 reader 双读、模板 fail-closed——NF-01/NF-03 关闭、迁移诚实。

## 4. Schema 0.x 兼容、诊断、门禁、供应链

- **0.x 加性扩展(我核 diff)**:`schema_version` 扩为 `enum["0.1.0","0.2.0"]`;`before/after_hash_subject` 仅在 `0.2.0` 经 `if/then` **条件必填**,0.1 形状不删——符合路线图"Schema 变更按 `0.x` 规则";本任务显式授权升级契约/ADR。
- **诊断精确**(测试 + 我核):失败回 `PROJECT_AUDIT_HASH_INVALID`/`_RESPONSIBILITY_INVALID`/`_DECISION_INVALID`/`PROJECT_TIMESTAMP_INVALID` + 精确 JSON path(承接 NF-04/G1-09 稳定码口径)。
- **门禁**:project-contract **27/27**(audit-semantics 10/10);PR CI **8/8**;`pnpm install --frozen-lockfile` exit 0。
- **供应链**:`ajv`(catalog)+ 现有 workspace 包,无新增第三方重依赖;冻结物(除本任务授权的审计契约 0.2 扩展外)零漂移。
- **ADR-0020 诚实**:明写"凭证防护归受控配置边界、不能伪装成审计契约校验""0.x 兼容扩展、reader 双读、不删 0.1 读取形状""不实现审计存储/序列化迁移/事件写入器"——不夸大范围。
- **诚实说明**:本轮我探针数次因**路径/fixture 定位误用**(node 把 `/d/tmp` 解析为 `D:\d\tmp`、空重定向、fixture 在 `./fixtures` 非 `./test/fixtures`)报错,均为**我方环境误用、非产物缺陷**,修正后 NF-01/02/03 全部独立确认。如实登记。

## 5. 结论与交接

**PB-05A 独立审计 PASS。** 审计哈希主体逐 action 显式且不变义、模板不伪造文档哈希、模型标识结构化注册且凭证无入口不误杀、system 权限正反矩阵固定、0.1 兼容诚实 fail-closed——G1-07 **NF-01/02/03 关闭**,审计语义冻结。

- **PB-06 放行条件**:①本报告 PASS(已满足);②合并顺序 **#34 → #35** 落地 main。二者齐备后 **PB-06(语义审计事件/出处链)** 方可开工——其可消费本轮冻结的 hash subject、结构化模型出处、权限矩阵;**可与已签署的 PB-07 并行**(schema 隔离)。
- 承接:NF-04/`m-05` 继续由 G1-09 处理;`m-01` 由 PB-11 用真实序列化字节哈希关闭(本轮不涉)。

按 CLAUDE.md,本报告由审计者给出结论,台账由 Codex 完成;实施者不自行关闭发现。
