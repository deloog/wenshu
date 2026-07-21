export interface SbomPackage {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly direct: boolean;
  readonly requested_by: readonly string[];
}

export interface SupplyChainSbom {
  readonly schema_version: "0.1.0";
  readonly sbom_id: "wenshu.supply-chain";
  readonly source: "pnpm-lock.yaml";
  readonly packages: readonly SbomPackage[];
}
