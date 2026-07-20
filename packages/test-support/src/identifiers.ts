const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/u;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;

export function assertSafeTestIdentifier(
  label: string,
  value: string,
  maxLength = 64,
): void {
  if (
    value.length > maxLength ||
    !SAFE_IDENTIFIER.test(value) ||
    WINDOWS_RESERVED_NAME.test(value)
  ) {
    throw new Error(`${label} must be a safe opaque identifier`);
  }
}
