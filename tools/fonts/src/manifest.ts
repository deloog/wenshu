import { FontIntegrityError } from "./errors.ts";
import type {
  FontCoverage,
  FontFileEntry,
  FontLicense,
  FontManifest,
  FontSource,
  FontStyle,
  FontWeight,
} from "./types.ts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SHA1_PATTERN = /^[a-f0-9]{40}$/u;
const EXPECTED_COVERAGE_SOURCES = Object.freeze([
  "docs/poc-a/fixtures/chart-overview.svg",
  "docs/poc-a/fixtures/chart-process.svg",
  "docs/poc-a/fixtures/golden-report.md",
]);
const FILE_KEYS = Object.freeze([
  "bytes",
  "cmap_codepoint_count",
  "git_blob_sha1",
  "glyph_count",
  "path",
  "postscript_name",
  "sha256",
  "style",
  "version_string",
  "weight",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function requireRecord(
  value: unknown,
  keys: readonly string[],
  message: string,
): Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new FontIntegrityError("FONT_MANIFEST_INVALID", message);
  }
  return value;
}

function parseFontFile(value: unknown): FontFileEntry {
  const file = requireRecord(value, FILE_KEYS, "font file entry shape is invalid");
  const style = file["style"];
  const weight = file["weight"];
  const expected = {
    Regular: { weight: 400, path: "SourceHanSansCN-Regular.otf" },
    Medium: { weight: 500, path: "SourceHanSansCN-Medium.otf" },
    Bold: { weight: 700, path: "SourceHanSansCN-Bold.otf" },
  } as const;
  if (typeof style !== "string" || !(style in expected)) {
    throw new FontIntegrityError("FONT_MANIFEST_INVALID", "font style is invalid");
  }
  const typedStyle = style as FontStyle;
  const identity = expected[typedStyle];
  if (file["path"] !== identity.path || weight !== identity.weight) {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font path, style, and weight do not agree",
    );
  }
  for (const key of ["bytes", "glyph_count", "cmap_codepoint_count"] as const) {
    const numeric = file[key];
    if (typeof numeric !== "number" || !Number.isSafeInteger(numeric) || numeric < 1) {
      throw new FontIntegrityError(
        "FONT_MANIFEST_INVALID",
        "font numeric metadata is invalid",
      );
    }
  }
  if (
    typeof file["sha256"] !== "string" ||
    !SHA256_PATTERN.test(file["sha256"]) ||
    typeof file["git_blob_sha1"] !== "string" ||
    !SHA1_PATTERN.test(file["git_blob_sha1"]) ||
    typeof file["postscript_name"] !== "string" ||
    file["postscript_name"] !== `SourceHanSansCN-${typedStyle}` ||
    typeof file["version_string"] !== "string" ||
    !file["version_string"].includes("2.005")
  ) {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font hash or identity metadata is invalid",
    );
  }
  return Object.freeze({
    path: identity.path,
    style: typedStyle,
    weight: identity.weight as FontWeight,
    bytes: file["bytes"] as number,
    sha256: file["sha256"],
    git_blob_sha1: file["git_blob_sha1"],
    postscript_name: file["postscript_name"],
    version_string: file["version_string"],
    glyph_count: file["glyph_count"] as number,
    cmap_codepoint_count: file["cmap_codepoint_count"] as number,
  });
}

function parseSource(value: unknown): FontSource {
  const source = requireRecord(
    value,
    [
      "release_asset_bytes",
      "release_asset_name",
      "release_asset_sha256",
      "release_url",
      "repository_url",
      "selected_path",
      "tag",
    ],
    "font source shape is invalid",
  );
  if (
    source["repository_url"] !== "https://github.com/adobe-fonts/source-han-sans" ||
    source["release_url"] !==
      "https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R" ||
    source["tag"] !== "2.005R" ||
    source["selected_path"] !== "SubsetOTF/CN" ||
    source["release_asset_name"] !== "19_SourceHanSansCN.zip" ||
    source["release_asset_bytes"] !== 50700226 ||
    typeof source["release_asset_sha256"] !== "string" ||
    source["release_asset_sha256"] !==
      "3a769d1b082ebd813cdb4c06ea57d29b340bce548edcc8e61976b78ca28e6236"
  ) {
    throw new FontIntegrityError("FONT_MANIFEST_INVALID", "font source is invalid");
  }
  return Object.freeze({
    repository_url: "https://github.com/adobe-fonts/source-han-sans",
    release_url: "https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R",
    tag: "2.005R",
    selected_path: "SubsetOTF/CN",
    release_asset_name: "19_SourceHanSansCN.zip",
    release_asset_bytes: 50700226,
    release_asset_sha256:
      "3a769d1b082ebd813cdb4c06ea57d29b340bce548edcc8e61976b78ca28e6236",
  });
}

function parseLicense(value: unknown): FontLicense {
  const license = requireRecord(
    value,
    ["bytes", "git_blob_sha1", "path", "sha256", "spdx"],
    "font license shape is invalid",
  );
  if (
    license["path"] !== "LICENSE.txt" ||
    license["spdx"] !== "OFL-1.1" ||
    license["bytes"] !== 4463 ||
    typeof license["sha256"] !== "string" ||
    !SHA256_PATTERN.test(license["sha256"]) ||
    license["git_blob_sha1"] !== "3ff0ccaba06857bf292ade9a50f16a0f02b3b8d4"
  ) {
    throw new FontIntegrityError("FONT_MANIFEST_INVALID", "font license is invalid");
  }
  return Object.freeze({
    path: "LICENSE.txt",
    spdx: "OFL-1.1",
    bytes: 4463,
    sha256: license["sha256"],
    git_blob_sha1: "3ff0ccaba06857bf292ade9a50f16a0f02b3b8d4",
  });
}

function parseCoverage(value: unknown): FontCoverage {
  const coverage = requireRecord(
    value,
    [
      "inspected_with",
      "missing_codepoint_count",
      "required_codepoint_count",
      "required_codepoints_sha256",
      "sources",
    ],
    "font coverage shape is invalid",
  );
  if (
    typeof coverage["inspected_with"] !== "string" ||
    !coverage["inspected_with"].startsWith("fontTools ") ||
    !Array.isArray(coverage["sources"]) ||
    coverage["sources"].length !== EXPECTED_COVERAGE_SOURCES.length ||
    typeof coverage["required_codepoint_count"] !== "number" ||
    !Number.isSafeInteger(coverage["required_codepoint_count"]) ||
    coverage["required_codepoint_count"] < 1 ||
    typeof coverage["required_codepoints_sha256"] !== "string" ||
    !SHA256_PATTERN.test(coverage["required_codepoints_sha256"]) ||
    coverage["missing_codepoint_count"] !== 0
  ) {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font coverage evidence is invalid",
    );
  }
  const sources = coverage["sources"];
  if (
    !sources.every(
      (source, index) =>
        typeof source === "string" && source === EXPECTED_COVERAGE_SOURCES[index],
    )
  ) {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font coverage sources are invalid",
    );
  }
  return Object.freeze({
    inspected_with: coverage["inspected_with"],
    sources: EXPECTED_COVERAGE_SOURCES,
    required_codepoint_count: coverage["required_codepoint_count"],
    required_codepoints_sha256: coverage["required_codepoints_sha256"],
    missing_codepoint_count: 0,
  });
}

export function parseFontManifest(value: unknown): FontManifest {
  const manifest = requireRecord(
    value,
    [
      "coverage",
      "family",
      "files",
      "font_set_id",
      "format",
      "license",
      "schema_version",
      "source",
      "version",
    ],
    "font manifest shape is invalid",
  );
  if (
    manifest["schema_version"] !== "0.1.0" ||
    manifest["font_set_id"] !== "wenshu.poc-a.source-han-sans-cn" ||
    manifest["family"] !== "Source Han Sans CN" ||
    manifest["version"] !== "2.005R" ||
    manifest["format"] !== "OTF" ||
    !Array.isArray(manifest["files"]) ||
    manifest["files"].length !== 3
  ) {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font manifest identity is invalid",
    );
  }
  const files = manifest["files"].map(parseFontFile);
  const sorted = [...files].sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  );
  if (files.some((file, index) => file.path !== sorted[index]?.path)) {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font files must use canonical sorted order",
    );
  }
  if (new Set(files.map((file) => file.weight)).size !== 3) {
    throw new FontIntegrityError(
      "FONT_MANIFEST_INVALID",
      "font weights must be unique",
    );
  }
  return Object.freeze({
    schema_version: "0.1.0",
    font_set_id: "wenshu.poc-a.source-han-sans-cn",
    family: "Source Han Sans CN",
    version: "2.005R",
    format: "OTF",
    source: parseSource(manifest["source"]),
    license: parseLicense(manifest["license"]),
    coverage: parseCoverage(manifest["coverage"]),
    files: Object.freeze(files),
  });
}
