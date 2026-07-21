import { SupplyChainError } from "./errors.ts";
import { buildPackageInventory } from "./inventory.ts";
import type { SbomPackage, SupplyChainSbom } from "./types.ts";

const PACKAGE_KEYS = Object.freeze([
  "direct",
  "license",
  "name",
  "requested_by",
  "version",
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

export async function buildSbom(workspaceRoot: string): Promise<SupplyChainSbom> {
  const packages = await buildPackageInventory(workspaceRoot);
  return Object.freeze({
    schema_version: "0.1.0",
    sbom_id: "wenshu.supply-chain",
    source: "pnpm-lock.yaml",
    packages,
  });
}

export function serializeSbom(sbom: SupplyChainSbom): string {
  return `${JSON.stringify(sbom, null, 2)}\n`;
}

function parseSbomPackage(value: unknown): SbomPackage {
  if (!isRecord(value) || !hasExactKeys(value, PACKAGE_KEYS)) {
    throw new SupplyChainError("SBOM_INVALID", "sbom package entry shape is invalid");
  }
  const { name, version, license, direct, requested_by } = value;
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    typeof version !== "string" ||
    version.length === 0 ||
    typeof license !== "string" ||
    license.length === 0 ||
    typeof direct !== "boolean" ||
    !Array.isArray(requested_by) ||
    !requested_by.every((item) => typeof item === "string") ||
    (direct && requested_by.length === 0)
  ) {
    throw new SupplyChainError("SBOM_INVALID", "sbom package entry values are invalid");
  }
  return Object.freeze({
    name,
    version,
    license,
    direct,
    requested_by: Object.freeze(requested_by as string[]),
  });
}

export function parseSbom(value: unknown): SupplyChainSbom {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["packages", "sbom_id", "schema_version", "source"])
  ) {
    throw new SupplyChainError("SBOM_INVALID", "sbom shape is invalid");
  }
  if (
    value["schema_version"] !== "0.1.0" ||
    value["sbom_id"] !== "wenshu.supply-chain" ||
    value["source"] !== "pnpm-lock.yaml" ||
    !Array.isArray(value["packages"]) ||
    value["packages"].length === 0
  ) {
    throw new SupplyChainError("SBOM_INVALID", "sbom identity is invalid");
  }
  return Object.freeze({
    schema_version: "0.1.0",
    sbom_id: "wenshu.supply-chain",
    source: "pnpm-lock.yaml",
    packages: Object.freeze(value["packages"].map(parseSbomPackage)),
  });
}
