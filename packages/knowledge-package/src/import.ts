import { mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  validateKnowledgeBundle,
  type KnowledgePackageManifest,
  type ProjectManifest,
  type SemanticAuditEvent,
} from "@wenshu/project-contract";
import { atomicWriteFile, protectImportedFile } from "@wenshu/project-storage";

import { KnowledgePackageError } from "./errors.ts";
import { sha256 } from "./serialization.ts";
import type {
  ImportKnowledgePackageOptions,
  ImportedKnowledgePackage,
} from "./types.ts";
import { mustValidateProjectContract } from "./validate.ts";
import { readZip } from "./zip.ts";

function entryBytesByPath(
  entries: ReadonlyArray<{ readonly path: string; readonly bytes: Uint8Array }>,
): ReadonlyMap<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const entry of entries) {
    map.set(entry.path, entry.bytes);
  }
  return map;
}

async function writeFileAtomicUnderRoot(
  root: string,
  entryPath: string,
  bytes: Uint8Array,
): Promise<void> {
  const rootResolved = resolve(root);
  const target = resolve(join(rootResolved, entryPath));
  const relativePath = relative(rootResolved, target);
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.startsWith("..")
  ) {
    throw new KnowledgePackageError(
      "PACKAGE_ZIP_INVALID",
      `extracted path escapes target root: ${entryPath}`,
    );
  }
  await atomicWriteFile(target, bytes);
}

function parseManifest(manifestBytes: Uint8Array): KnowledgePackageManifest {
  const value = mustValidateProjectContract(
    JSON.parse(new TextDecoder().decode(manifestBytes)) as unknown,
    "manifest",
  );
  if (value.contract_kind !== "knowledge_package") {
    throw new KnowledgePackageError(
      "PACKAGE_CONTRACT_INVALID",
      "manifest is not a knowledge_package",
    );
  }
  return value as KnowledgePackageManifest;
}

function parseProject(projectBytes: Uint8Array): ProjectManifest {
  const value = mustValidateProjectContract(
    JSON.parse(new TextDecoder().decode(projectBytes)) as unknown,
    "project manifest",
  );
  if (value.contract_kind !== "project") {
    throw new KnowledgePackageError(
      "PACKAGE_CONTRACT_INVALID",
      "truth/project.json is not a project manifest",
    );
  }
  return value as ProjectManifest;
}

function parseAudits(auditBytes: Uint8Array): readonly SemanticAuditEvent[] {
  const lines = new TextDecoder()
    .decode(auditBytes)
    .split("\n")
    .filter((line) => line.length > 0);
  const audits: SemanticAuditEvent[] = [];
  for (const [index, line] of lines.entries()) {
    const value = mustValidateProjectContract(
      JSON.parse(line) as unknown,
      `audit line ${index}`,
    );
    if (value.contract_kind !== "semantic_audit_event") {
      throw new KnowledgePackageError(
        "PACKAGE_CONTRACT_INVALID",
        `audit line ${index} is not a semantic_audit_event`,
      );
    }
    audits.push(value);
  }
  return Object.freeze(audits);
}

async function verifyEntryHashes(
  manifest: KnowledgePackageManifest,
  filesByPath: ReadonlyMap<string, Uint8Array>,
  tempRoot: string,
): Promise<void> {
  for (const entry of manifest.entries) {
    const bytes = filesByPath.get(entry.path);
    if (bytes === undefined) {
      throw new KnowledgePackageError(
        "PACKAGE_MISSING_ENTRY",
        `declared entry is missing from package: ${entry.path}`,
        { path: entry.path },
      );
    }
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== entry.sha256) {
      throw new KnowledgePackageError(
        "PACKAGE_HASH_MISMATCH",
        `sha256 mismatch for ${entry.path}: expected ${entry.sha256}, got ${actualSha256}`,
        { path: entry.path },
      );
    }
    await writeFileAtomicUnderRoot(tempRoot, entry.path, bytes);
  }
}

/**
 * Import a knowledge package into a brand-new directory. Extraction is staged
 * in a sibling temp directory; only after every byte hash is verified and the
 * project contract bundle validates does the temp directory become the final
 * project root. On any failure the temp directory is removed and the target
 * root is never created.
 */
export async function importKnowledgePackage(
  options: ImportKnowledgePackageOptions,
): Promise<ImportedKnowledgePackage> {
  const targetRoot = resolve(options.targetRoot);
  const sourceBytes = await readFile(options.sourcePath).catch((error: unknown) => {
    throw new KnowledgePackageError(
      "PACKAGE_IO_FAILURE",
      `failed to read source package: ${error instanceof Error ? error.message : String(error)}`,
    );
  });

  let tempRoot: string | undefined;
  try {
    const existingStat = await stat(targetRoot).catch(() => undefined);
    if (existingStat !== undefined) {
      throw new KnowledgePackageError(
        "PACKAGE_IO_FAILURE",
        `import target already exists: ${targetRoot}`,
      );
    }

    const zipEntries = readZip(sourceBytes);
    const filesByPath = entryBytesByPath(zipEntries);
    const manifestBytes = filesByPath.get("manifest.json");
    if (manifestBytes === undefined) {
      throw new KnowledgePackageError(
        "PACKAGE_MISSING_ENTRY",
        "manifest.json is missing from package",
      );
    }
    const manifest = parseManifest(manifestBytes);

    await mkdir(dirname(targetRoot), { recursive: true });
    tempRoot = await mkdtemp(`${targetRoot}.wenshu-import-`);

    await verifyEntryHashes(manifest, filesByPath, tempRoot);

    const projectBytes = filesByPath.get("truth/project.json");
    const auditBytes = filesByPath.get("truth/audit.ndjson");
    if (projectBytes === undefined) {
      throw new KnowledgePackageError(
        "PACKAGE_MISSING_ENTRY",
        "truth/project.json is missing",
      );
    }
    if (auditBytes === undefined) {
      throw new KnowledgePackageError(
        "PACKAGE_MISSING_ENTRY",
        "truth/audit.ndjson is missing",
      );
    }
    const project = parseProject(projectBytes);
    const audits = parseAudits(auditBytes);

    const bundleResult = validateKnowledgeBundle(project, manifest, audits);
    if (!bundleResult.ok) {
      throw new KnowledgePackageError(
        "PACKAGE_MANIFEST_MISMATCH",
        `knowledge bundle failed cross-validation: ${JSON.stringify(bundleResult.issues)}`,
      );
    }

    // Register imported material files as originals before the final rename.
    for (const entry of manifest.entries) {
      if (entry.role === "truth.material") {
        protectImportedFile(options.grant, basename(entry.path));
      }
    }

    await rename(tempRoot, targetRoot);
    tempRoot = undefined;

    return Object.freeze({ manifest, project, audits });
  } catch (error) {
    if (tempRoot !== undefined) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
    if (error instanceof KnowledgePackageError) {
      throw error;
    }
    throw new KnowledgePackageError(
      "PACKAGE_IO_FAILURE",
      error instanceof Error ? error.message : String(error),
    );
  }
}
