import {
  LAYERED_WORKSPACES,
  type Layer,
  type PlatformNamespace,
} from "./layering-registry.ts";

export interface PlatformSource {
  readonly layer: Layer;
  readonly platformNamespaces: readonly PlatformNamespace[];
}

export function platformViolation(
  source: PlatformSource,
  specifier: string,
  isStrictSource: boolean,
): string | undefined {
  if (
    specifier.startsWith("node:") &&
    isStrictSource &&
    source.layer !== "L2" &&
    source.layer !== "L3"
  ) {
    return "NODE_BUILTIN_FORBIDDEN";
  }
  const platform = LAYERED_WORKSPACES.flatMap(
    (workspace) => workspace.platformNamespaces ?? [],
  ).find(({ prefix }) => matchesPlatformNamespace(specifier, prefix));
  if (platform === undefined) return undefined;
  return source.platformNamespaces.some(({ prefix }) => prefix === platform.prefix)
    ? undefined
    : platform.forbiddenRule;
}

function matchesPlatformNamespace(specifier: string, prefix: string): boolean {
  if (prefix.endsWith(".") || prefix.endsWith("/")) {
    return specifier.startsWith(prefix);
  }
  return specifier === prefix || specifier.startsWith(`${prefix}/`);
}
