import { lstat, readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

const SECRET_PATTERNS = Object.freeze([
  {
    label: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  },
  { label: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/u },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/u },
  { label: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/u },
]);
const FORBIDDEN_EXTENSIONS = new Set([".key", ".p12", ".pem", ".pfx"]);

export interface SecretFinding {
  readonly filePath: string;
  readonly reason: string;
}

export function scanTextForSecrets(text: string): readonly string[] {
  return Object.freeze(
    SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
      ({ label }) => label,
    ),
  );
}

function forbiddenTrackedName(filePath: string): string | undefined {
  const name = basename(filePath).toLowerCase();
  if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) {
    return "tracked environment file";
  }
  return FORBIDDEN_EXTENSIONS.has(extname(name))
    ? "tracked credential container"
    : undefined;
}

export async function scanTrackedFiles(
  workspaceRoot: string,
  trackedFiles: readonly string[],
): Promise<readonly SecretFinding[]> {
  const findings: SecretFinding[] = [];
  for (const filePath of trackedFiles) {
    const nameFinding = forbiddenTrackedName(filePath);
    if (nameFinding !== undefined) {
      findings.push(Object.freeze({ filePath, reason: nameFinding }));
      continue;
    }
    const resolvedPath = resolve(workspaceRoot, filePath);
    const stats = await lstat(resolvedPath);
    if (stats.isSymbolicLink()) {
      findings.push(
        Object.freeze({ filePath, reason: "tracked symbolic link requires review" }),
      );
      continue;
    }
    const content = await readFile(resolvedPath);
    if (content.includes(0)) {
      continue;
    }
    for (const reason of scanTextForSecrets(content.toString("utf8"))) {
      findings.push(Object.freeze({ filePath, reason }));
    }
  }
  return Object.freeze(findings);
}
