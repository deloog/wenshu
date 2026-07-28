import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  DOCUMENT_SCHEMA_VERSION,
  SUPPORTED_DOCUMENT_SCHEMA_VERSIONS,
} from "@wenshu/document-model";

import {
  mapTemplate,
  parseApprovedFontSet,
  type ApprovedFontSet,
} from "../src/index.ts";

const fixturePath = resolve(
  import.meta.dirname,
  "../../../docs/poc-a/fixtures/formal-business.template.json",
);
const manifestPath = resolve(
  import.meta.dirname,
  "../../../assets/fonts/source-han-sans-cn/2.005R/font-manifest.json",
);

type JsonObject = Record<string, unknown>;

async function loadFixtureTemplate(): Promise<JsonObject> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as JsonObject;
}

let cachedFontSet: ApprovedFontSet | undefined;
async function loadFontSet(): Promise<ApprovedFontSet> {
  if (cachedFontSet === undefined) {
    const parsed = parseApprovedFontSet(
      JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    );
    assert.ok(parsed.ok, "frozen font manifest must parse");
    cachedFontSet = parsed.value;
  }
  return cachedFontSet;
}

test("formal-business fixture maps to a controlled template model", async () => {
  const [template, fontSet] = await Promise.all([loadFixtureTemplate(), loadFontSet()]);
  const result = mapTemplate(template, fontSet);
  if (!result.ok) {
    assert.fail(JSON.stringify(result.issues));
  }
  const model = result.value;
  assert.equal(model.templateId, "wenshu.poc-a.formal-business");
  assert.equal(model.version, "1.0.0");
  // 声明值是模板攥写时针对的契约版本；reader 支持集（含冻结 0.1.0）内即受控。
  const declaredVersion = model.documentSchema.slice("wenshu.report/".length);
  assert.ok(
    (SUPPORTED_DOCUMENT_SCHEMA_VERSIONS as readonly string[]).includes(declaredVersion),
    model.documentSchema,
  );
  assert.equal(DOCUMENT_SCHEMA_VERSION, "0.2.0");
  assert.deepEqual(model.requiredSections, [
    "cover",
    "executive_summary",
    "table_of_contents",
    "body",
    "sources",
  ]);
  assert.equal(model.fonts.fallbackPolicy, "fail_before_export");
  assert.deepEqual(
    model.fonts.faces.map((face) => [face.weight, face.postscriptName]),
    [
      [400, "SourceHanSansCN-Regular"],
      [500, "SourceHanSansCN-Medium"],
      [700, "SourceHanSansCN-Bold"],
    ],
  );
  assert.equal(model.layoutTokens.body_font_pt, 11);
  assert.equal(model.paginationRules.table_repeat_header, true);
  assert.equal(model.validators.length, 16);
  // 模型不得泄露文件访问面：无路径、无哈希、无扩展名。
  const serialized = JSON.stringify(model);
  assert.equal(serialized.includes(".otf"), false);
  assert.equal(serialized.includes("sha256"), false);
  assert.equal(serialized.includes("assets/"), false);
});

test("unknown fields are rejected, not silently ignored", async () => {
  const template = await loadFixtureTemplate();
  template["unknown_future_rule"] = { anything: true };
  const result = mapTemplate(template, await loadFontSet());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.issues[0]?.code, "TEMPLATE_SCHEMA");
  }
});

test("future DSL versions and non-empty migration rules are rejected", async () => {
  const fontSet = await loadFontSet();
  const future = await loadFixtureTemplate();
  future["dsl_version"] = "0.2.0";
  assert.equal(mapTemplate(future, fontSet).ok, false);
  const migrating = await loadFixtureTemplate();
  migrating["migration_rules"] = [{ from: "0.9.0" }];
  assert.equal(mapTemplate(migrating, fontSet).ok, false);
});

test("forbidden execution-surface keys injected into a legal template are rejected", async () => {
  const fontSet = await loadFontSet();
  const cases: Array<[string, unknown, string]> = [
    ["script", "evil-marker-XYZZY", "TEMPLATE_DYNAMIC_CODE_FORBIDDEN"],
    ["eval", "evil-marker-XYZZY", "TEMPLATE_DYNAMIC_CODE_FORBIDDEN"],
    ["file", "evil-marker-XYZZY", "TEMPLATE_FILE_ACCESS_FORBIDDEN"],
    ["path", "evil-marker-XYZZY", "TEMPLATE_FILE_ACCESS_FORBIDDEN"],
    ["url", "evil-marker-XYZZY", "TEMPLATE_NETWORK_ACCESS_FORBIDDEN"],
    ["network", "evil-marker-XYZZY", "TEMPLATE_NETWORK_ACCESS_FORBIDDEN"],
    ["capability", "evil-marker-XYZZY", "TEMPLATE_CAPABILITY_FORBIDDEN"],
    ["permission", "evil-marker-XYZZY", "TEMPLATE_CAPABILITY_FORBIDDEN"],
  ];
  for (const [key, marker, code] of cases) {
    const template = await loadFixtureTemplate();
    template[key] = marker;
    const result = mapTemplate(template, fontSet);
    assert.equal(result.ok, false, `${key} must be rejected`);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, code, `${key} code`);
      // 诊断脱敏：不回显注入的字段值。
      assert.equal(JSON.stringify(result.issues).includes(String(marker)), false);
    }
  }
});

test("document schema binding rejects mismatched declarations", async () => {
  const fontSet = await loadFontSet();
  // 声明值先被 G1-05 schema 层（const 白名单）拒绝——无论哪一层，必须拒绝。
  for (const declared of ["wenshu.report/0.2.0", "wenshu.other/0.1.0"]) {
    const template = await loadFixtureTemplate();
    template["supported_document_schema"] = declared;
    assert.equal(mapTemplate(template, fontSet).ok, false, declared);
  }
  // 映射层绑定守卫自身的决定性：reader 支持集漂移时必须由本层拦截（注入模拟支持集）。
  const template = await loadFixtureTemplate();
  const drifted = mapTemplate(template, fontSet, ["9.9.9"]);
  assert.equal(drifted.ok, false);
  if (!drifted.ok) {
    assert.equal(drifted.issues[0]?.code, "TEMPLATE_MAP_UNSUPPORTED_DOCUMENT_SCHEMA");
    assert.equal(drifted.issues[0]?.path, "/supported_document_schema");
  }
});

test("template declaration vocabulary stays inside the reader-supported set", async () => {
  // G1-05 模板 schema 的声明词表必须是 document reader 实际支持的版本（ADR-0010）。
  const schemaPath = resolve(
    import.meta.dirname,
    "../../template-model/schema/template.schema.json",
  );
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as JsonObject;
  const properties = schema["properties"] as JsonObject;
  const declared =
    properties["supported_document_schema"] &&
    (properties["supported_document_schema"] as JsonObject)["const"];
  assert.equal(typeof declared, "string");
  const version = String(declared).slice("wenshu.report/".length);
  assert.ok(
    (SUPPORTED_DOCUMENT_SCHEMA_VERSIONS as readonly string[]).includes(version),
    String(declared),
  );
});

test("font binding rejects unknown families, versions, and unregistered weights", async () => {
  const fontSet = await loadFontSet();
  const wrongFamily = await loadFixtureTemplate();
  (wrongFamily["fonts"] as JsonObject)["primary"] = "Not A Registered Font";
  const familyResult = mapTemplate(wrongFamily, fontSet);
  assert.equal(familyResult.ok, false);
  if (!familyResult.ok) {
    assert.equal(familyResult.issues[0]?.code, "TEMPLATE_MAP_FONT_UNKNOWN");
  }

  const wrongVersion = await loadFixtureTemplate();
  (wrongVersion["fonts"] as JsonObject)["version"] = "1.000R";
  assert.equal(mapTemplate(wrongVersion, fontSet).ok, false);

  // schema 枚举允许 300，但受控注册表只有 400/500/700——绑定层必须拦截。
  const wrongWeight = await loadFixtureTemplate();
  (wrongWeight["fonts"] as JsonObject)["weights"] = [300, 400];
  const weightResult = mapTemplate(wrongWeight, fontSet);
  assert.equal(weightResult.ok, false);
  if (!weightResult.ok) {
    assert.equal(weightResult.issues[0]?.code, "TEMPLATE_MAP_FONT_WEIGHT_UNREGISTERED");
    assert.equal(weightResult.issues[0]?.path, "/fonts/weights/0");
  }
});

test("font registry parsing fails closed on malformed manifests", () => {
  for (const bad of [
    null,
    [],
    {},
    { family: "x" },
    { family: "x", version: "1", files: [] },
  ]) {
    assert.equal(parseApprovedFontSet(bad).ok, false, JSON.stringify(bad));
  }
  const duplicate = {
    family: "x",
    version: "1",
    files: [
      { weight: 400, style: "Regular", postscript_name: "X-Regular" },
      { weight: 400, style: "Bold", postscript_name: "X-Bold" },
    ],
  };
  assert.equal(parseApprovedFontSet(duplicate).ok, false);
});

test("verify wiring cannot omit the template map package", async () => {
  const packagePath = resolve(import.meta.dirname, "../../../package.json");
  const parsed = JSON.parse(await readFile(packagePath, "utf8")) as unknown;
  const scripts = (parsed as Record<string, unknown>)["scripts"];
  const contracts = String((scripts as Record<string, unknown>)["contracts:test"]);
  assert.match(contracts, /@wenshu\/template-map/u);
});
