import assert from "node:assert/strict";
import { test } from "node:test";

import { extractSuspiciousIdTokens, extractTaskIds } from "../src/roadmap-model.ts";
import { parseRoadmap } from "../src/roadmap-parse.ts";

const MINIMAL_DOC = `## 2. 需求与风险标识
| ID | 已批准要求/风险 | 权威来源 |
|---|---|---|
| R-TEST | 真实测试 | 宪法 17 |
## 3. 阶段与关键路径
\`\`\`text
G1-01 → G1-01R → G1-11
\`\`\`
### 3.1 执行台账
| 任务 | 状态 | 完成/阻断证据 |
|---|---|---|
| G1-01 | ✅ 已完成 | 证据 |
| G1-01R | ✅ 已完成 | 证据 |
| G1-11 | ✅ 已完成 | 证据 |
## 4. G1
| ID | 单一目标与来源 | 依赖 → 消费者 | 范围 | 证据 | 风险 |
|---|---|---|---|---|---|
| G1-01 | 目标。R-TEST | G0/GR → 全任务 | a | b | c |
| G1-01R | 目标 | G1-01 → G1-11 | a | b | c |
| G1-11 | 目标 | G1-01R/03C → G1-16 | a | b | c |
## 9. 并行实施波次
| 波次 | 可并行组 | 冻结 | 串行 |
|---|---|---|---|
| W1 | G1-02只读选型、G1-03C | a | b |
## 10. 双向追踪矩阵
| 要求 | 实现任务 | 验证/闸门任务 |
|---|---|---|
| R-TEST | G1-01/01R/11 | G1-11 |
## 11. 变更与停止规则
- 规则
`;

test("extractTaskIds expands family shorthand across separators", () => {
  assert.deepEqual(extractTaskIds("G1-01/01R/02/03"), [
    "G1-01",
    "G1-01R",
    "G1-02",
    "G1-03",
  ]);
  assert.deepEqual(extractTaskIds("G1-04/08/10/16、G2-01/02、PA-00"), [
    "G1-04",
    "G1-08",
    "G1-10",
    "G1-16",
    "G2-01",
    "G2-02",
    "PA-00",
  ]);
  assert.deepEqual(extractTaskIds("PA-14E/14H/14U"), ["PA-14E", "PA-14H", "PA-14U"]);
  assert.deepEqual(extractTaskIds("G1-08/PA/PB/A"), ["G1-08"]);
  assert.deepEqual(extractTaskIds("G1-15/16, PA-15 DEGRADE 裁定"), [
    "G1-15",
    "G1-16",
    "PA-15",
  ]);
});

test("extractSuspiciousIdTokens flags malformed ID-like tokens only", () => {
  assert.deepEqual(extractSuspiciousIdTokens("PB-O9 是拼错"), ["PB-O9"]);
  assert.deepEqual(extractSuspiciousIdTokens("PB-19 合法形态"), []);
  assert.deepEqual(extractSuspiciousIdTokens("R-TEST 与 ADR-0013"), []);
});

test("parseRoadmap parses a minimal document with expected counts", () => {
  const { model, issues } = parseRoadmap(MINIMAL_DOC);
  assert.deepEqual(issues, []);
  assert.equal(model.counts.tasks, 3);
  assert.equal(model.counts.dependencyEdges, 3);
  assert.equal(model.counts.requirementIds, 1);
  assert.equal(model.counts.ledgerEntries, 3);
  assert.equal(model.counts.criticalPathEdges, 2);
  assert.equal(model.counts.waveGroups, 1);
  assert.deepEqual(model.tasks[2]?.dependencies, ["G1-01R", "G1-03C"]);
  assert.deepEqual(
    model.criticalEdges.map((e) => `${e.from}->${e.to}`),
    ["G1-01->G1-01R", "G1-01R->G1-11"],
  );
});

test("chain breaks in §3 do not create phantom edges", () => {
  const doc = MINIMAL_DOC.replace(
    "G1-01 → G1-01R → G1-11",
    "G1-01 → G1-01R；G1-11 → G1-01R",
  );
  const { model } = parseRoadmap(doc);
  assert.deepEqual(
    model.criticalEdges.map((e) => `${e.from}->${e.to}`),
    ["G1-01->G1-01R", "G1-11->G1-01R"],
  );
});

test("unparsable rows in every structural region are reported, never skipped", () => {
  const cases: readonly [string, string, RegExp][] = [
    ["| R-TEST | 真实测试 | 宪法 17 |", "| 杂物 | 坏行 | 坏 |", /§2 需求表行无法解析/],
    ["| G1-01 | ✅ 已完成 | 证据 |", "| GX-01 | ✅ | 坏 |", /§3.1 台账行无法解析/],
    [
      "| G1-01 | 目标。R-TEST | G0/GR → 全任务 | a | b | c |",
      "| 杂物 | x | y → z | a | b | c |",
      /任务表行无法解析/,
    ],
    [
      "| G1-01R | 目标 | G1-01 → G1-11 | a | b | c |",
      "| G1-01R | 目标 | 没有箭头 | a | b | c |",
      /缺少 "→"/,
    ],
    [
      "| W1 | G1-02只读选型、G1-03C | a | b |",
      "| X9 | G1-02 | a | b |",
      /§9 波次表行无法解析/,
    ],
    [
      "| R-TEST | G1-01/01R/11 | G1-11 |",
      "| 无要求 | G1-01 | G1-11 |",
      /§10 矩阵行无法解析/,
    ],
  ];
  for (const [good, bad, pattern] of cases) {
    const { issues } = parseRoadmap(MINIMAL_DOC.replace(good, bad));
    assert.ok(
      issues.some((issue) => pattern.test(issue.message)),
      `expected ${pattern} in ${JSON.stringify(issues)}`,
    );
  }
});

test("missing required sections fail closed instead of parsing as empty", () => {
  const { issues, model } = parseRoadmap("## 2. 需求\n");
  assert.ok(issues.length > 0);
  assert.equal(model.counts.tasks, 0);
});

test("wave segments with fewer than two IDs are not parallel groups", () => {
  const doc = MINIMAL_DOC.replace(
    "G1-02只读选型、G1-03C",
    "G1-02只读选型；G1-03C 单独；散文段",
  );
  const { model } = parseRoadmap(doc);
  assert.equal(model.counts.waveGroups, 0);
});
