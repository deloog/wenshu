import assert from "node:assert/strict";
import test from "node:test";

import { IA_AREAS, IA_EXCLUSIONS, buildShellNav } from "../src/prototype/shell.ts";

test("shell nav is exactly the eight ux-spec §3 upper-bound items, verbatim", () => {
  const areas = buildShellNav();
  assert.equal(areas.length, 8);
  assert.deepEqual(
    areas.map((area) => area.label),
    [
      "项目/文件夹与最近项目",
      "文档编辑区",
      "AI 工作区（目标、约束、计划、diff 与裁决）",
      "页面预览与问题检查",
      "引用/出处查看",
      "版本历史",
      "导出与完整知识包",
      "设置（模型/BYOK、字体、隐私、存储）",
    ],
  );
});

test("exclusion list is exactly the six ux-spec §3 exclusions", () => {
  assert.deepEqual([...IA_EXCLUSIONS], [
    "知识图谱视图",
    "模板市场",
    "自动同步",
    "多端协同",
    "复杂表格",
    "PPT",
  ]);
});

test("settings area carries the browser-Host non-persistence note (PB-10 #5)", () => {
  const settings = IA_AREAS.find((area) => area.id === "settings");
  assert.ok(settings !== undefined);
  assert.ok(settings.note.includes("浏览器 Host 非持久"));
  assert.ok(settings.note.includes("仅用于开发与联调"));
});
