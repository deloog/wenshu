/**
 * Shared mirror-workspace harness for the G2-04 counterexample matrix.
 * Each case copies the real roadmap, applies one mutation, and materializes
 * a minimal mirror workspace (empty placeholder files for every target the
 * ledger links to in the real workspace) so the gate runs real file-system
 * resolution — nothing about parsing or file reads is stubbed.
 */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const REAL_ROADMAP = resolve(workspaceRoot, "docs/implementation-roadmap.md");

const LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/gu;

export interface MirrorOptions {
  /** Additional report file names created in the mirror's audits directory. */
  readonly extraAuditFiles?: readonly string[];
}

export interface Mirror {
  readonly roadmapPath: string;
  readonly cleanup: () => Promise<void>;
}

async function realRoadmapText(): Promise<string> {
  return readFile(REAL_ROADMAP, "utf8");
}

function ledgerLinkTargets(text: string): readonly string[] {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.startsWith("### 3.1"));
  const end = lines.findIndex((line) => line.startsWith("## 4."));
  const targets: string[] = [];
  for (let index = start; index >= 0 && index < end; index++) {
    const line = lines[index] ?? "";
    for (const match of line.matchAll(LINK_PATTERN)) {
      const target = match[1];
      if (target !== undefined && !/^https?:\/\//u.test(target)) targets.push(target);
    }
  }
  return Object.freeze(targets);
}

/** Builds a mirror workspace around one mutated copy of the real roadmap. */
export async function makeMirror(
  mutate: (text: string) => string,
  options?: MirrorOptions,
): Promise<Mirror> {
  const mutated = mutate(await realRoadmapText());
  const root = await mkdtemp(join(tmpdir(), "wenshu-g204-"));
  const docsDir = join(root, "docs");
  const auditsDir = join(docsDir, "audits");
  await mkdir(auditsDir, { recursive: true });
  const roadmapPath = join(docsDir, "implementation-roadmap.md");
  await writeFile(roadmapPath, mutated, "utf8");
  const realDocsDir = resolve(workspaceRoot, "docs");
  for (const name of await readdir(join(realDocsDir, "audits"))) {
    await writeFile(join(auditsDir, name), "", "utf8");
  }
  for (const name of options?.extraAuditFiles ?? []) {
    await writeFile(join(auditsDir, name), "", "utf8");
  }
  for (const target of ledgerLinkTargets(mutated)) {
    const realTarget = resolve(realDocsDir, target);
    if (!existsSync(realTarget)) continue; // broken links must stay broken
    const mirrorTarget = resolve(docsDir, target);
    if (statSync(realTarget).isDirectory()) {
      await mkdir(mirrorTarget, { recursive: true });
    } else {
      await mkdir(dirname(mirrorTarget), { recursive: true });
      await writeFile(mirrorTarget, "", "utf8");
    }
  }
  return Object.freeze({
    roadmapPath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  });
}

/** Runs one mutation against the real roadmap text; throws if it did not apply. */
export function replaceOnce(text: string, from: string, to: string): string {
  const index = text.indexOf(from);
  if (index < 0 || text.indexOf(from, index + 1) >= 0) {
    throw new Error(`mutation anchor not unique or missing: ${from.slice(0, 60)}`);
  }
  return text.slice(0, index) + to + text.slice(index + from.length);
}
