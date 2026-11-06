import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { assertSafeTestIdentifier } from "./identifiers.ts";
import { isTestLayer, type TestLayer } from "./layers.ts";

const PREPARED_ISOLATION = Symbol("prepared-test-isolation");
const CLAIM_FILE = "worker.claim";

export interface TestIsolationOptions {
  readonly controlledRoot: string;
  readonly runId: string;
  readonly workerIndex: number;
  readonly layer: TestLayer;
  readonly basePort?: number;
  readonly portsPerWorker?: number;
}

export interface TestIsolation {
  readonly layer: TestLayer;
  readonly controlledRoot: string;
  readonly rootDirectory: string;
  readonly databaseDirectory: string;
  readonly filesDirectory: string;
  readonly evidenceDirectory: string;
  readonly projectId: string;
  readonly portStart: number;
  readonly portEnd: number;
}

export interface PreparedTestIsolation extends TestIsolation {
  readonly [PREPARED_ISOLATION]: true;
  readonly claimToken: string;
}

const issuedPreparedIsolations = new WeakSet<PreparedTestIsolation>();
const isolationOperationTails = new WeakMap<PreparedTestIsolation, Promise<void>>();

function requireNonNegativeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function requireContained(root: string, candidate: string): void {
  const child = relative(root, candidate);
  if (
    child === "" ||
    child === ".." ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  ) {
    throw new Error("test isolation path escaped its controlled root");
  }
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

async function requireRealDirectory(directory: string): Promise<void> {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`test isolation refuses a non-directory link: ${directory}`);
  }
}

async function requireRealFile(filePath: string): Promise<void> {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`test isolation refuses a non-file link: ${filePath}`);
  }
}

async function createDirectoryWithoutFollowingLinks(directory: string): Promise<void> {
  try {
    await mkdir(directory);
  } catch (error: unknown) {
    if (!isAlreadyExists(error)) {
      throw error;
    }
  }
  await requireRealDirectory(directory);
}

async function requireRealIsolationPath(isolation: TestIsolation): Promise<void> {
  let current = isolation.controlledRoot;
  await requireRealDirectory(current);
  const segments = relative(current, isolation.rootDirectory).split(sep);
  for (const segment of segments) {
    current = join(current, segment);
    await requireRealDirectory(current);
  }
}

export function buildTestIsolation(options: TestIsolationOptions): TestIsolation {
  assertSafeTestIdentifier("runId", options.runId);
  requireNonNegativeInteger("workerIndex", options.workerIndex);
  if (!isTestLayer(options.layer)) {
    throw new Error("layer must be a registered test layer");
  }
  const workerId = `worker-${options.workerIndex}`;

  const basePort = options.basePort ?? 24_000;
  const portsPerWorker = options.portsPerWorker ?? 20;
  requireNonNegativeInteger("basePort", basePort);
  requireNonNegativeInteger("portsPerWorker", portsPerWorker);
  if (basePort < 1_024 || portsPerWorker < 1) {
    throw new Error("test ports must use a non-privileged, non-empty range");
  }

  const portStart = basePort + options.workerIndex * portsPerWorker;
  const portEnd = portStart + portsPerWorker - 1;
  if (portEnd > 65_535) {
    throw new Error("test worker port range exceeds 65535");
  }

  const controlledRoot = resolve(options.controlledRoot);
  const rootDirectory = resolve(
    join(controlledRoot, options.runId, options.layer, workerId),
  );
  requireContained(controlledRoot, rootDirectory);

  return Object.freeze({
    controlledRoot,
    layer: options.layer,
    rootDirectory,
    databaseDirectory: join(rootDirectory, "database"),
    filesDirectory: join(rootDirectory, "files"),
    evidenceDirectory: join(rootDirectory, "evidence"),
    projectId: `test-${options.runId}-${workerId}`,
    portStart,
    portEnd,
  });
}

export async function prepareTestIsolation(
  isolation: TestIsolation,
): Promise<PreparedTestIsolation> {
  requireContained(isolation.controlledRoot, isolation.rootDirectory);
  await mkdir(isolation.controlledRoot, { recursive: true });
  await requireRealDirectory(isolation.controlledRoot);

  let current = isolation.controlledRoot;
  const segments = relative(isolation.controlledRoot, isolation.rootDirectory).split(
    sep,
  );
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    await createDirectoryWithoutFollowingLinks(current);
  }
  await mkdir(isolation.rootDirectory);
  await requireRealDirectory(isolation.rootDirectory);

  const claimToken = randomUUID();
  await writeFile(join(isolation.rootDirectory, CLAIM_FILE), claimToken, {
    encoding: "utf8",
    flag: "wx",
  });
  await Promise.all([
    createDirectoryWithoutFollowingLinks(isolation.databaseDirectory),
    createDirectoryWithoutFollowingLinks(isolation.filesDirectory),
    createDirectoryWithoutFollowingLinks(isolation.evidenceDirectory),
  ]);
  const prepared = Object.freeze({
    ...isolation,
    [PREPARED_ISOLATION]: true as const,
    claimToken,
  });
  issuedPreparedIsolations.add(prepared);
  return prepared;
}

function requireIssuedPreparedIsolation(isolation: PreparedTestIsolation): void {
  const brand = Object.getOwnPropertyDescriptor(isolation, PREPARED_ISOLATION);
  if (
    !issuedPreparedIsolations.has(isolation) ||
    brand?.value !== true ||
    !Object.isFrozen(isolation)
  ) {
    throw new Error("only a runtime-issued prepared isolation is accepted");
  }
}

export async function requirePreparedTestIsolation(
  isolation: PreparedTestIsolation,
): Promise<void> {
  requireIssuedPreparedIsolation(isolation);
  requireContained(isolation.controlledRoot, isolation.rootDirectory);
  await requireRealIsolationPath(isolation);
  await Promise.all([
    requireRealDirectory(isolation.databaseDirectory),
    requireRealDirectory(isolation.filesDirectory),
    requireRealDirectory(isolation.evidenceDirectory),
  ]);
  const claimPath = join(isolation.rootDirectory, CLAIM_FILE);
  await requireRealFile(claimPath);
  const storedClaim = await readFile(claimPath, "utf8");
  if (storedClaim !== isolation.claimToken) {
    throw new Error("worker isolation claim does not match");
  }
}

export async function withPreparedTestIsolationOperation<Result>(
  isolation: PreparedTestIsolation,
  operation: () => Promise<Result>,
): Promise<Result> {
  requireIssuedPreparedIsolation(isolation);
  const previous = isolationOperationTails.get(isolation) ?? Promise.resolve();
  const release = { run: (): void => {} };
  const gate = new Promise<void>((resolveGate) => {
    release.run = resolveGate;
  });
  const tail = previous.then(() => gate);
  isolationOperationTails.set(isolation, tail);
  await previous;
  try {
    await requirePreparedTestIsolation(isolation);
    return await operation();
  } finally {
    release.run();
    if (isolationOperationTails.get(isolation) === tail) {
      isolationOperationTails.delete(isolation);
    }
  }
}

export async function cleanupSuccessfulTestIsolation(
  isolation: PreparedTestIsolation,
): Promise<void> {
  await withPreparedTestIsolationOperation(isolation, async () => {
    if ((await readdir(isolation.evidenceDirectory)).length > 0) {
      throw new Error("successful cleanup refuses non-empty failure evidence");
    }
    await rm(isolation.rootDirectory, { recursive: true });
    issuedPreparedIsolations.delete(isolation);
  });
}
