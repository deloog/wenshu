export interface FixtureEntry {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface FixtureManifest {
  readonly schema_version: "0.1.0";
  readonly fixture_set_id: "wenshu-poc-a";
  readonly fixture_version: "1.0.0";
  readonly entries: readonly FixtureEntry[];
}

export interface VerifiedFixtureSet {
  readonly rootDirectory: string;
  readonly manifest: FixtureManifest;
  readonly manifestSha256: string;
}

export interface FixtureCopyEvidence {
  readonly schema_version: "0.1.0";
  readonly fixture_set_id: "wenshu-poc-a";
  readonly fixture_version: "1.0.0";
  readonly source_manifest_sha256: string;
  readonly project_id: string;
  readonly copy_root: "poc-a-fixtures";
  readonly entries: readonly FixtureEntry[];
}

export interface FixtureCopyResult {
  readonly copyDirectory: string;
  readonly evidenceManifestPath: string;
  readonly evidence: FixtureCopyEvidence;
}
