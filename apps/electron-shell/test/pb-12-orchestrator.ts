/**
 * PB-12 W3 orchestration helpers: spawn/kill real Electron processes, read and
 * assert real files. Nothing here mocks, stubs, or re-implements a package
 * under test. The zip reader/writer exists solely to build a *semantically*
 * tampered package (valid structure and CRCs, one flipped payload byte) so
 * the real importer's PACKAGE_HASH_MISMATCH layer is what rejects it.
 */ import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

const electronBinary = createRequire(import.meta.url)("electron") as string;
const shellDir = fileURLToPath(new URL("..", import.meta.url));

export interface ExitResult {
  readonly code: number | null;
  readonly signal: string | null;
}

export interface E2EProcess {
  readonly child: ChildProcess;
  readonly reportPath: string;
  readonly importMarkerPath: string;
  readonly readyMarkerPath: string;
  readonly exit: Promise<ExitResult>;
  stderrTail(): string;
}

export interface SpawnE2EOptions {
  readonly workdir: string;
  readonly reportDir: string;
  readonly recover?: boolean;
  readonly extraEnv?: Readonly<Record<string, string>>;
}

export type ReportLine = Readonly<Record<string, unknown>>;

export interface SummaryLine {
  readonly type: "summary";
  readonly mode: string;
  readonly status: "pass" | "fail";
  readonly chains: readonly ChainLine[];
  readonly savedDocument?: { readonly fileName: string; readonly sha256: string };
  readonly knowledgePackage?: {
    readonly fileName: string;
    readonly sha256: string;
    readonly manifestSummary: Readonly<Record<string, unknown>>;
  };
  readonly imported?: Readonly<Record<string, unknown>> | null;
  readonly recovery?: { readonly removedResidue: number };
}

export interface ChainLine {
  readonly id: string;
  readonly status: "pass" | "fail";
  readonly detail: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Spawns the real Electron binary in e2e mode; ELECTRON_RUN_AS_NODE is stripped. */
export function spawnE2E(options: SpawnE2EOptions): E2EProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_OPTIONS: "--experimental-strip-types",
    E2E_WORKDIR: options.workdir,
    E2E_REPORT_DIR: options.reportDir,
    E2E_IMPORT_MARKER: join(options.workdir, "import-marker.json"),
    E2E_READY_MARKER: join(options.workdir, "ready-marker.json"),
    ...options.extraEnv,
  };
  delete env["ELECTRON_RUN_AS_NODE"];
  const args = [
    "./src/e2e-main.cjs",
    "--e2e",
    ...(options.recover === true ? ["--recover"] : []),
  ];
  const child = spawn(electronBinary, args, { cwd: shellDir, env });
  const stderrChunks: Buffer[] = [];
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  const exit = new Promise<ExitResult>((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  const stderrTail = () => Buffer.concat(stderrChunks).toString("utf8").slice(-2000);
  return {
    child,
    reportPath: join(options.reportDir, "scenario-report.ndjson"),
    importMarkerPath: join(options.workdir, "import-marker.json"),
    readyMarkerPath: join(options.workdir, "ready-marker.json"),
    exit,
    stderrTail,
  };
}

/** Awaits process exit; on timeout SIGKILLs and fails with the stderr tail. */
export async function awaitExit(
  proc: E2EProcess,
  timeoutMs: number,
): Promise<ExitResult> {
  const result = await Promise.race([
    proc.exit,
    sleep(timeoutMs).then(() => "timeout" as const),
  ]);
  if (result === "timeout") {
    proc.child.kill("SIGKILL");
    await proc.exit;
    throw new Error(
      `electron run timed out after ${timeoutMs} ms\n${proc.stderrTail()}`,
    );
  }
  return result;
}

/** Real SIGKILL (TerminateProcess on Windows) and an exit-code wait. */
export async function killAndAwait(proc: E2EProcess): Promise<ExitResult> {
  if (proc.child.exitCode === null && proc.child.signalCode === null) {
    proc.child.kill("SIGKILL");
  }
  return awaitExit(proc, 30_000);
}

/** Polls for a file to appear (interval <= 25 ms per PB-12 timing spec). */
export async function waitForFile(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await stat(path).then(
      () => true,
      () => false,
    );
    if (found) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for file: ${path}`);
    await sleep(20);
  }
}

export async function readReport(reportPath: string): Promise<readonly ReportLine[]> {
  const text = await readFile(reportPath, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as ReportLine);
}

/** Polls the NDJSON report until the predicate matches (interval <= 25 ms). */
export async function waitForReportLines(
  reportPath: string,
  predicate: (lines: readonly ReportLine[]) => boolean,
  timeoutMs: number,
): Promise<readonly ReportLine[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const lines = await readReport(reportPath).catch(() => [] as readonly ReportLine[]);
    if (predicate(lines)) return lines;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for report lines in ${reportPath}`);
    }
    await sleep(20);
  }
}

export function summaryOf(lines: readonly ReportLine[]): SummaryLine {
  const summary = lines.find((line) => line["type"] === "summary");
  if (summary === undefined) {
    throw new Error(`no summary line in report (${lines.length} lines)`);
  }
  return summary as unknown as SummaryLine;
}

export function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function sha256File(path: string): Promise<string> {
  return sha256Bytes(await readFile(path));
}

/**
 * Independent re-implementation of the knowledge-package canonical JSON
 * (sorted keys, compact UTF-8) so the orchestrator can predict the exported
 * document digest from the on-disk document without importing the package.
 */
export function canonicalJsonBytes(value: unknown): Buffer {
  const sortKeys = (entry: unknown): unknown => {
    if (entry === null || typeof entry !== "object") return entry;
    if (Array.isArray(entry)) return entry.map(sortKeys);
    const source = entry as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key]);
    return sorted;
  };
  return Buffer.from(JSON.stringify(sortKeys(value)), "utf8");
}

interface ZipPart {
  readonly path: string;
  readonly bytes: Buffer;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function readZipParts(zip: Buffer): readonly ZipPart[] {
  let eocd = -1;
  for (
    let offset = zip.length - 22;
    offset >= Math.max(0, zip.length - 22 - 65535);
    offset -= 1
  ) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("tamper: EOCD not found");
  const total = zip.readUInt16LE(eocd + 8);
  let offset = zip.readUInt32LE(eocd + 16);
  const parts: ZipPart[] = [];
  for (let index = 0; index < total; index += 1) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error("tamper: central directory signature mismatch");
    }
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const pathLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const path = zip.subarray(offset + 46, offset + 46 + pathLength).toString("utf8");
    const dataStart =
      localOffset +
      30 +
      zip.readUInt16LE(localOffset + 26) +
      zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    parts.push({
      path,
      bytes: method === 0 ? Buffer.from(data) : inflateRawSync(data),
    });
    offset += 46 + pathLength + extraLength + commentLength;
  }
  return parts;
}

function writeZip(parts: readonly ZipPart[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let centralOffset = 0;
  for (const part of parts) {
    const pathBytes = Buffer.from(part.path, "utf8");
    const checksum = crc32(part.bytes);
    const candidate = deflateRawSync(part.bytes);
    const useDeflate = candidate.length < part.bytes.length;
    const data = useDeflate ? candidate : part.bytes;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_SIGNATURE, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(useDeflate ? 8 : 0, 8);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(part.bytes.length, 22);
    header.writeUInt16LE(pathBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(part.bytes.length, 24);
    central.writeUInt16LE(pathBytes.length, 28);
    central.writeUInt32LE(centralOffset, 42);
    localParts.push(header, pathBytes, data);
    centralParts.push(central, pathBytes);
    centralOffset += header.length + pathBytes.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(parts.length, 8);
  eocd.writeUInt16LE(parts.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

/**
 * Flips one payload byte of the given entry and rebuilds the archive with
 * valid structure and CRCs, so only the manifest sha256 layer can reject it.
 */
export function tamperZipEntry(zip: Buffer, entryPath: string): Buffer {
  const parts = readZipParts(zip).map((part) => ({
    path: part.path,
    bytes: Buffer.from(part.bytes),
  }));
  const target = parts.find((part) => part.path === entryPath);
  const first = target?.bytes[0];
  if (target === undefined || first === undefined) {
    throw new Error(`tamper: entry not found or empty: ${entryPath}`);
  }
  target.bytes[0] = first ^ 0x01;
  return writeZip(parts);
}
