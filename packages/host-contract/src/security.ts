const forbiddenPlatformKeys = new Set([
  "absolutepath",
  "abilitycontext",
  "arkts",
  "command",
  "electron",
  "electronipc",
  "exec",
  "filepath",
  "filesystem",
  "ipc",
  "nodeintegration",
  "path",
  "preload",
  "shell",
  "systempath",
]);

export function isForbiddenPlatformKey(normalizedKey: string): boolean {
  return forbiddenPlatformKeys.has(normalizedKey);
}

export function isUnsafePathValue(value: string): boolean {
  let decoded = value;
  let stabilized = false;
  for (let pass = 0; pass < 16; pass += 1) {
    if (/%(?=[A-Za-z0-9])(?![A-Fa-f0-9]{2})/u.test(decoded)) {
      return true;
    }
    let next: string;
    try {
      next = decodeURIComponent(decoded.replace(/%(?![A-Fa-f0-9]{2})/gu, "%25"));
    } catch {
      return true;
    }
    if (next === decoded) {
      stabilized = true;
      break;
    }
    decoded = next;
  }
  if (!stabilized) {
    return true;
  }
  const containsControlCharacter = [...decoded].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
  const isHttpUrl = /^https?:\/\//iu.test(decoded);
  return (
    containsControlCharacter ||
    /file:/iu.test(decoded) ||
    (!isHttpUrl && /[A-Za-z]:[\\/]/u.test(decoded)) ||
    /(?:^|[^A-Za-z0-9])[A-Za-z]:[A-Za-z0-9._-]/u.test(decoded) ||
    /\\\\[^\\]/u.test(decoded) ||
    (!isHttpUrl && /(?:^|[\s=:'"(])[\\/]/u.test(decoded)) ||
    /(?:^|[^A-Za-z0-9])\.\.(?:[\\/]|$)/u.test(decoded)
  );
}
