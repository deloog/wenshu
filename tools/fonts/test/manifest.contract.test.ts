import assert from "node:assert/strict";
import test from "node:test";

import { FontIntegrityError, parseFontManifest } from "../src/index.ts";

const styles = Object.freeze([
  { path: "SourceHanSansCN-Bold.otf", style: "Bold", weight: 700 },
  { path: "SourceHanSansCN-Medium.otf", style: "Medium", weight: 500 },
  { path: "SourceHanSansCN-Regular.otf", style: "Regular", weight: 400 },
]);

function validManifest(): Record<string, unknown> {
  return {
    schema_version: "0.1.0",
    font_set_id: "wenshu.poc-a.source-han-sans-cn",
    family: "Source Han Sans CN",
    version: "2.005R",
    format: "OTF",
    source: {
      repository_url: "https://github.com/adobe-fonts/source-han-sans",
      release_url: "https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R",
      tag: "2.005R",
      selected_path: "SubsetOTF/CN",
      release_asset_name: "19_SourceHanSansCN.zip",
      release_asset_bytes: 50700226,
      release_asset_sha256:
        "3a769d1b082ebd813cdb4c06ea57d29b340bce548edcc8e61976b78ca28e6236",
    },
    license: {
      path: "LICENSE.txt",
      spdx: "OFL-1.1",
      bytes: 4463,
      sha256: "d".repeat(64),
      git_blob_sha1: "3ff0ccaba06857bf292ade9a50f16a0f02b3b8d4",
    },
    coverage: {
      inspected_with: "fontTools 4.60.1",
      sources: [
        "docs/poc-a/fixtures/chart-overview.svg",
        "docs/poc-a/fixtures/chart-process.svg",
        "docs/poc-a/fixtures/golden-report.md",
      ],
      required_codepoint_count: 884,
      required_codepoints_sha256: "e".repeat(64),
      missing_codepoint_count: 0,
    },
    files: styles.map(({ path, style, weight }, index) => ({
      path,
      style,
      weight,
      bytes: 8_000_000 + index,
      sha256: `${index}`.repeat(64),
      git_blob_sha1: `${index}`.repeat(40),
      postscript_name: `SourceHanSansCN-${style}`,
      version_string: "Version 2.005;addfeatures 5.0.0b21",
      glyph_count: 31_072,
      cmap_codepoint_count: 30_926,
    })),
  };
}

test("font manifest accepts only the frozen family, release, and three weights", () => {
  const parsed = parseFontManifest(validManifest());
  assert.deepEqual(
    parsed.files.map(({ style, weight }) => ({ style, weight })),
    [
      { style: "Bold", weight: 700 },
      { style: "Medium", weight: 500 },
      { style: "Regular", weight: 400 },
    ],
  );
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.files));

  for (const mutation of [
    { ...validManifest(), family: "system-ui" },
    { ...validManifest(), version: "latest" },
    { ...validManifest(), extra: true },
    { ...validManifest(), files: [] },
  ]) {
    assert.throws(() => parseFontManifest(mutation), FontIntegrityError);
  }
});

test("font entries, source, license, and coverage fail closed", () => {
  const wrongOrder = validManifest();
  wrongOrder["files"] = [...styles].reverse().map(({ path, style, weight }) => ({
    path,
    style,
    weight,
    bytes: 1,
    sha256: "a".repeat(64),
    git_blob_sha1: "b".repeat(40),
    postscript_name: `SourceHanSansCN-${style}`,
    version_string: "Version 2.005",
    glyph_count: 1,
    cmap_codepoint_count: 1,
  }));

  const mutations: Record<string, unknown>[] = [wrongOrder];
  for (const key of ["source", "license", "coverage"] as const) {
    const manifest = validManifest();
    manifest[key] = { invalid: true };
    mutations.push(manifest);
  }
  for (const mutation of mutations) {
    assert.throws(
      () => parseFontManifest(mutation),
      (error: unknown) =>
        error instanceof FontIntegrityError && error.code === "FONT_MANIFEST_INVALID",
    );
  }
});
