export type FontStyle = "Bold" | "Medium" | "Regular";
export type FontWeight = 400 | 500 | 700;

export interface FontFileEntry {
  readonly path: string;
  readonly style: FontStyle;
  readonly weight: FontWeight;
  readonly bytes: number;
  readonly sha256: string;
  readonly git_blob_sha1: string;
  readonly postscript_name: string;
  readonly version_string: string;
  readonly glyph_count: number;
  readonly cmap_codepoint_count: number;
}

export interface FontSource {
  readonly repository_url: "https://github.com/adobe-fonts/source-han-sans";
  readonly release_url: "https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R";
  readonly tag: "2.005R";
  readonly selected_path: "SubsetOTF/CN";
  readonly release_asset_name: "19_SourceHanSansCN.zip";
  readonly release_asset_bytes: 50700226;
  readonly release_asset_sha256: string;
}

export interface FontCoverage {
  readonly inspected_with: string;
  readonly sources: readonly string[];
  readonly required_codepoint_count: number;
  readonly required_codepoints_sha256: string;
  readonly missing_codepoint_count: 0;
}

export interface FontLicense {
  readonly path: "LICENSE.txt";
  readonly spdx: "OFL-1.1";
  readonly bytes: 4463;
  readonly sha256: string;
  readonly git_blob_sha1: string;
}

export interface FontManifest {
  readonly schema_version: "0.1.0";
  readonly font_set_id: "wenshu.poc-a.source-han-sans-cn";
  readonly family: "Source Han Sans CN";
  readonly version: "2.005R";
  readonly format: "OTF";
  readonly source: FontSource;
  readonly license: FontLicense;
  readonly coverage: FontCoverage;
  readonly files: readonly FontFileEntry[];
}

export interface VerifiedFontSet {
  readonly rootDirectory: string;
  readonly manifestSha256: string;
  readonly manifest: FontManifest;
}
