import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { SupplyChainError } from "./errors.ts";
import type { SbomPackage } from "./types.ts";

const WORKSPACE_SECTIONS = ["apps", "packages", "tools"] as const;

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

async function readManifest(
  manifestPath: string,
): Promise<Record<string, unknown> | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return undefined;
  }
  return isRecord(parsed) ? parsed : undefined;
}

interface InstalledPackage {
  readonly name: string;
  readonly version: string;
  readonly license: string;
}

async function collectStorePackages(
  storeRoot: string,
): Promise<readonly InstalledPackage[]> {
  const storeEntries = await readdir(storeRoot, { withFileTypes: true });
  const packages = new Map<string, InstalledPackage>();
  for (const storeEntry of storeEntries) {
    if (!storeEntry.isDirectory() || storeEntry.name === "node_modules") {
      continue;
    }
    const nested = join(storeRoot, storeEntry.name, "node_modules");
    const queue: string[] = [nested];
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
        const manifest = await readManifest(join(current, entry.name, "package.json"));
        if (manifest === undefined) {
          continue;
        }
        const { name, version } = manifest;
        if (typeof name !== "string" || typeof version !== "string") {
          continue;
        }
        const key = `${name}@${version}`;
        if (!packages.has(key)) {
          packages.set(
            key,
            Object.freeze({
              name,
              version,
              license: normalizeLicense(manifest["license"] ?? manifest["licenses"]),
            }),
          );
        }
      }
    }
  }
  if (packages.size === 0) {
    throw new SupplyChainError("SBOM_INVALID", "installed package store is empty");
  }
  return Object.freeze([...packages.values()]);
}

interface DirectRequest {
  readonly dependency: string;
  readonly version: string;
  readonly workspace: string;
}

async function readCatalogVersions(
  workspaceRoot: string,
): Promise<ReadonlyMap<string, string>> {
  const catalog = new Map<string, string>();
  let text: string;
  try {
    text = await readFile(join(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
  } catch {
    throw new SupplyChainError("SBOM_INVALID", "workspace catalog cannot be read");
  }
  const catalogSection = /\ncatalog:\r?\n((?: {2}[^\r\n]+\r?\n)+)/u.exec(`\n${text}`);
  if (catalogSection?.[1] !== undefined) {
    for (const line of catalogSection[1].split(/\r?\n/u)) {
      const entry = /^ {2}"?(@?[^"\s]+)"?: "?([^"\s]+)"?\s*$/u.exec(line);
      if (entry?.[1] !== undefined && entry[2] !== undefined) {
        catalog.set(entry[1], entry[2]);
      }
    }
  }
  return catalog;
}

async function collectDirectRequests(
  workspaceRoot: string,
): Promise<readonly DirectRequest[]> {
  const manifestPaths: string[] = [join(workspaceRoot, "package.json")];
  for (const section of WORKSPACE_SECTIONS) {
    let directories;
    try {
      directories = await readdir(join(workspaceRoot, section), {
        withFileTypes: true,
      });
    } catch {
      continue;
    }
    for (const directory of directories) {
      if (directory.isDirectory()) {
        manifestPaths.push(
          join(workspaceRoot, section, directory.name, "package.json"),
        );
      }
    }
  }
  const catalog = await readCatalogVersions(workspaceRoot);
  const requests: DirectRequest[] = [];
  for (const manifestPath of manifestPaths) {
    const manifest = await readManifest(manifestPath);
    if (manifest === undefined) {
      continue;
    }
    const workspace =
      typeof manifest["name"] === "string" ? manifest["name"] : "(unknown)";
    for (const key of ["dependencies", "devDependencies"] as const) {
      const section = manifest[key];
      if (!isRecord(section)) {
        continue;
      }
      for (const [dependency, specifier] of Object.entries(section)) {
        if (dependency.startsWith("@wenshu/")) {
          continue;
        }
        const version = specifier === "catalog:" ? catalog.get(dependency) : specifier;
        if (typeof version !== "string" || version.length === 0) {
          throw new SupplyChainError(
            "SBOM_INVALID",
            "workspace dependency specifier cannot be resolved",
          );
        }
        requests.push(Object.freeze({ dependency, version, workspace }));
      }
    }
  }
  return Object.freeze(requests);
}

export async function buildPackageInventory(
  workspaceRoot: string,
): Promise<readonly SbomPackage[]> {
  const [installed, requests] = await Promise.all([
    collectStorePackages(join(workspaceRoot, "node_modules", ".pnpm")),
    collectDirectRequests(workspaceRoot),
  ]);
  const requestedBy = new Map<string, string[]>();
  for (const { dependency, version, workspace } of requests) {
    const key = `${dependency}@${version}`;
    const list = requestedBy.get(key) ?? [];
    list.push(workspace);
    requestedBy.set(key, list);
  }
  const installedKeys = new Set(
    installed.map((entry) => `${entry.name}@${entry.version}`),
  );
  for (const key of requestedBy.keys()) {
    if (!installedKeys.has(key)) {
      throw new SupplyChainError(
        "SBOM_INVALID",
        "declared dependency is not installed at the resolved version",
      );
    }
  }
  const entries = installed.map((entry) =>
    Object.freeze({
      name: entry.name,
      version: entry.version,
      license: entry.license,
      direct: requestedBy.has(`${entry.name}@${entry.version}`),
      requested_by: Object.freeze(
        (requestedBy.get(`${entry.name}@${entry.version}`) ?? []).toSorted(),
      ),
    }),
  );
  return Object.freeze(
    entries.sort(
      (left, right) =>
        left.name.localeCompare(right.name, "en") ||
        left.version.localeCompare(right.version, "en"),
    ),
  );
}
