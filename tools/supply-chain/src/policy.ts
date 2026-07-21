import type { SbomPackage } from "./types.ts";

export const PERMISSIVE_LICENSES: ReadonlySet<string> = new Set([
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
]);

// Licenses that are neither permissive nor forbidden: each requires a written
// conclusion in docs/supply-chain.md before it may remain in the tree.
export const REVIEWED_LICENSES: ReadonlyMap<string, string> = new Map([
  ["BlueOak-1.0.0", "docs/supply-chain.md"],
  ["MPL-2.0", "docs/supply-chain.md"],
  ["Python-2.0", "docs/supply-chain.md"],
]);

export function licensePolicyViolation(license: string): string | undefined {
  const normalized = license.trim().toUpperCase();
  if (/\bA?GPL(?:-|\b)/u.test(normalized)) {
    return "GPL/AGPL license is forbidden";
  }
  if (PERMISSIVE_LICENSES.has(license)) {
    return undefined;
  }
  if (REVIEWED_LICENSES.has(license)) {
    return undefined;
  }
  return "license is neither permissive nor reviewed";
}

export interface PolicyFinding {
  readonly packageName: string;
  readonly version: string;
  readonly license: string;
  readonly reason: string;
}

export function checkLicensePolicy(
  packages: readonly SbomPackage[],
): readonly PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  for (const entry of packages) {
    const reason = licensePolicyViolation(entry.license);
    if (reason !== undefined) {
      findings.push(
        Object.freeze({
          packageName: entry.name,
          version: entry.version,
          license: entry.license,
          reason,
        }),
      );
    }
  }
  return Object.freeze(findings);
}

export function reviewedLicensesInUse(
  packages: readonly SbomPackage[],
): ReadonlyMap<string, readonly string[]> {
  const inUse = new Map<string, string[]>();
  for (const entry of packages) {
    if (!REVIEWED_LICENSES.has(entry.license)) {
      continue;
    }
    const list = inUse.get(entry.license) ?? [];
    list.push(`${entry.name}@${entry.version}`);
    inUse.set(entry.license, list);
  }
  return inUse;
}
