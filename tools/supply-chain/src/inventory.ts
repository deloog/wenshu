import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";

import { SupplyChainError } from "./errors.ts";
import { LICENSE_OVERRIDES } from "./license-overrides.ts";
import type { SbomPackage } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLicense(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (isRecord(value) && typeof value["type"] === "string") {
    return value["type"].trim();
  }
  return "UNKNOWN";
}

function splitPackageKey(key: string): { name: string; version: string } {
  const at = key.lastIndexOf("@");
  if (at < 1 || at === key.length - 1) {
    throw new SupplyChainError("SBOM_INVALID", "lockfile package key is invalid");
  }
  return { name: key.slice(0, at), version: key.slice(at + 1) };
}

function stripPeerSuffix(version: string): string {
  return version.replace(/\(.*\)$/u, "");
}

interface InstalledLicense {
  readonly name: string;
  readonly version: string;
  readonly license: string;
}

async function collectInstalledLicenses(
  storeRoot: string,
): Promise<ReadonlyMap<string, string>> {
  const licenses = new Map<string, string>();
  let storeEntries;
  try {
    storeEntries = await readdir(storeRoot, { withFileTypes: true });
  } catch {
    return licenses;
  }
  for (const storeEntry of storeEntries) {
    if (!storeEntry.isDirectory() || storeEntry.name === "node_modules") {
      continue;
    }
    const queue: string[] = [join(storeRoot, storeEntry.name, "node_modules")];
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) {
        break;
      }
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === ".bin") {
          continue;
        }
        if (entry.name.startsWith("@")) {
          queue.push(join(current, entry.name));
          continue;
        }
        try {
          const manifest: unknown = JSON.parse(
            await readFile(join(current, entry.name, "package.json"), "utf8"),
          );
          if (!isRecord(manifest)) {
            continue;
          }
          const { name, version } = manifest;
          if (typeof name !== "string" || typeof version !== "string") {
            continue;
          }
          const installed: InstalledLicense = {
            name,
            version,
            license: normalizeLicense(manifest["license"] ?? manifest["licenses"]),
          };
          licenses.set(`${installed.name}@${installed.version}`, installed.license);
        } catch {
          continue;
        }
      }
    }
  }
  return licenses;
}

interface DirectRequest {
  readonly dependency: string;
  readonly version: string;
  readonly workspace: string;
}

async function workspaceName(
  workspaceRoot: string,
  importerPath: string,
): Promise<string> {
  try {
    const manifest: unknown = JSON.parse(
      await readFile(
        importerPath === "."
          ? join(workspaceRoot, "package.json")
          : join(workspaceRoot, importerPath, "package.json"),
        "utf8",
      ),
    );
    if (isRecord(manifest) && typeof manifest["name"] === "string") {
      return manifest["name"];
    }
  } catch {
    // fall through to the stable importer path label
  }
  return importerPath;
}

async function collectDirectRequests(
  workspaceRoot: string,
  importers: Record<string, unknown>,
): Promise<readonly DirectRequest[]> {
  const requests: DirectRequest[] = [];
  for (const [importerPath, importer] of Object.entries(importers)) {
    if (!isRecord(importer)) {
      continue;
    }
    const workspace = await workspaceName(workspaceRoot, importerPath);
    for (const section of ["dependencies", "devDependencies"] as const) {
      const declared = importer[section];
      if (!isRecord(declared)) {
        continue;
      }
      for (const [dependency, entry] of Object.entries(declared)) {
        if (dependency.startsWith("@wenshu/") || !isRecord(entry)) {
          continue;
        }
        const version = entry["version"];
        if (typeof version !== "string" || version.startsWith("link:")) {
          continue;
        }
        requests.push(
          Object.freeze({
            dependency,
            version: stripPeerSuffix(version),
            workspace,
          }),
        );
      }
    }
  }
  return Object.freeze(requests);
}

function resolveLicense(key: string, installed: ReadonlyMap<string, string>): string {
  const storeLicense = installed.get(key);
  const override = LICENSE_OVERRIDES.get(key);
  if (
    storeLicense !== undefined &&
    override !== undefined &&
    storeLicense !== override
  ) {
    throw new SupplyChainError(
      "SBOM_INVALID",
      "installed license disagrees with the reviewed override",
    );
  }
  const license = storeLicense ?? override;
  if (license === undefined) {
    throw new SupplyChainError(
      "SBOM_INVALID",
      "package license is unavailable on this platform and has no reviewed override",
    );
  }
  return license;
}

export async function buildPackageInventory(
  workspaceRoot: string,
): Promise<readonly SbomPackage[]> {
  const document: unknown = parse(
    await readFile(join(workspaceRoot, "pnpm-lock.yaml"), "utf8"),
  );
  if (!isRecord(document) || document["lockfileVersion"] !== "9.0") {
    throw new SupplyChainError("SBOM_INVALID", "lockfile version is unsupported");
  }
  const packages = document["packages"];
  if (!isRecord(packages) || Object.keys(packages).length === 0) {
    throw new SupplyChainError("SBOM_INVALID", "lockfile packages section is invalid");
  }
  const requests = await collectDirectRequests(
    workspaceRoot,
    isRecord(document["importers"]) ? document["importers"] : {},
  );
  const installed = await collectInstalledLicenses(
    join(workspaceRoot, "node_modules", ".pnpm"),
  );
  const requestedBy = new Map<string, string[]>();
  for (const { dependency, version, workspace } of requests) {
    const key = `${dependency}@${version}`;
    const list = requestedBy.get(key) ?? [];
    list.push(workspace);
    requestedBy.set(key, list);
  }
  const lockfileKeys = Object.keys(packages);
  for (const key of requestedBy.keys()) {
    if (!lockfileKeys.includes(key)) {
      throw new SupplyChainError(
        "SBOM_INVALID",
        "declared dependency cannot be resolved in the lockfile",
      );
    }
  }
  const entries = lockfileKeys.map((key) => {
    const { name, version } = splitPackageKey(key);
    return Object.freeze({
      name,
      version,
      license: resolveLicense(key, installed),
      direct: requestedBy.has(key),
      requested_by: Object.freeze((requestedBy.get(key) ?? []).toSorted()),
    });
  });
  return Object.freeze(
    entries.sort(
      (left, right) =>
        left.name.localeCompare(right.name, "en") ||
        left.version.localeCompare(right.version, "en"),
    ),
  );
}
