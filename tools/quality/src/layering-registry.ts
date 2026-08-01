export type Layer = "L0" | "L1" | "L2" | "L3" | "web";

export interface PlatformNamespace {
  readonly prefix: string;
  readonly forbiddenRule: "ELECTRON_FORBIDDEN" | "ARKTS_FORBIDDEN";
}

export interface LayeredWorkspace {
  readonly directory: string;
  readonly layer: Layer;
  /** Platform APIs are allowed only when the owning shell lists their prefix here. */
  readonly platformNamespaces?: readonly PlatformNamespace[];
  /** IDE-supplied Hvigor plugins are not npm dependencies; this list is deliberately exact. */
  readonly npmDependencyScanExclusions?: readonly string[];
}

/** Non-workspace roots must be declared here; no directory-level wildcard is permitted. */
export const EXCLUDED_TOP_LEVEL_DIRECTORIES = Object.freeze(["probes"] as const);

/** Resource-only production dependencies require an explicit, reviewable entry. */
export const RESOURCE_DEPENDENCIES: readonly {
  readonly workspace: string;
  readonly dependency: string;
}[] = Object.freeze([]);

/** The owner-approved G2-03 membership table. This is the only handwritten source. */
export const LAYERED_WORKSPACES: readonly LayeredWorkspace[] = Object.freeze([
  { directory: "packages/config", layer: "L0" },
  { directory: "packages/contract-runtime", layer: "L0" },
  { directory: "packages/document-model", layer: "L0" },
  { directory: "packages/host-contract", layer: "L0" },
  { directory: "packages/project-contract", layer: "L0" },
  { directory: "packages/template-model", layer: "L0" },
  { directory: "packages/ux-state", layer: "L0" },
  { directory: "packages/editor-diff", layer: "L1" },
  { directory: "packages/editor-transactions", layer: "L1" },
  { directory: "packages/semantic-audit", layer: "L1" },
  { directory: "packages/semantic-editor", layer: "L1" },
  { directory: "packages/semantic-tools", layer: "L1" },
  { directory: "packages/template-css", layer: "L1" },
  { directory: "packages/template-map", layer: "L1" },
  { directory: "packages/markdown-import", layer: "L2" },
  { directory: "packages/pdf-evidence", layer: "L2" },
  { directory: "packages/pdf-export", layer: "L2" },
  { directory: "packages/project-storage", layer: "L2" },
  { directory: "packages/report-checks", layer: "L2" },
  { directory: "packages/report-render", layer: "L2" },
  { directory: "packages/test-support", layer: "L2" },
  { directory: "packages/knowledge-package", layer: "L2" },
  { directory: "tools/ci", layer: "L2" },
  { directory: "tools/environment", layer: "L2" },
  { directory: "tools/fixtures", layer: "L2" },
  { directory: "tools/fonts", layer: "L2" },
  { directory: "tools/quality", layer: "L2" },
  { directory: "tools/supply-chain", layer: "L2" },
  {
    directory: "apps/electron-shell",
    layer: "L3",
    platformNamespaces: Object.freeze<PlatformNamespace[]>([
      { prefix: "electron", forbiddenRule: "ELECTRON_FORBIDDEN" },
    ]),
  },
  {
    directory: "apps/arkweb-shell",
    layer: "L3",
    platformNamespaces: Object.freeze<PlatformNamespace[]>([
      { prefix: "@ohos.", forbiddenRule: "ARKTS_FORBIDDEN" },
      { prefix: "@ohos/", forbiddenRule: "ARKTS_FORBIDDEN" },
    ]),
    npmDependencyScanExclusions: Object.freeze([
      "apps/arkweb-shell/hvigorfile.ts",
      "apps/arkweb-shell/entry/hvigorfile.ts",
    ]),
  },
  { directory: "apps/web", layer: "web" },
]);
