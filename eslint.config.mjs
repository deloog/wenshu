import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/oh_modules/**",
      "**/dist/**",
      "**/dist-scenario/**",
      "**/build/**",
      "**/out/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/artifacts/**",
      "**/tmp/**",
      // ArkTS/Hvigor files are compiled by the frozen DevEco toolchain, not ESLint.
      "apps/arkweb-shell/**",
    ],
  },
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
  },
  eslint.configs.recommended,
  {
    files: ["**/*.jsx"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    // Electron injects a limited `process` binding (with argv) into sandboxed
    // preload scripts; it is a real runtime global, not a rule exemption.
    files: ["apps/electron-shell/src/preload.cjs"],
    languageOptions: {
      globals: { process: "readonly" },
    },
  },
  {
    // A-01 / ADR-0028 D5: apps/web/src is web-layer production code. The G2-03
    // layering gate governs imports, but apps/web/tsconfig.json still declares
    // types:["node"], so process/Buffer could typecheck WITHOUT any import and
    // slip browser-unsafe Node globals into the web bundle. Close that global
    // hole here (imports stay governed by the layering gate; vite.config.ts and
    // test/ are auxiliary and unaffected).
    files: ["apps/web/src/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "process", message: "Node globals are forbidden in apps/web/src (web layer)." },
        { name: "Buffer", message: "Node globals are forbidden in apps/web/src (web layer)." },
        { name: "__dirname", message: "Node globals are forbidden in apps/web/src (web layer)." },
        { name: "__filename", message: "Node globals are forbidden in apps/web/src (web layer)." },
        { name: "global", message: "Node globals are forbidden in apps/web/src (web layer)." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='globalThis'][property.name='process']",
          message: "globalThis.process bypasses no-restricted-globals; Node APIs are forbidden in apps/web/src.",
        },
        {
          selector: "MemberExpression[object.name='globalThis'][property.name='Buffer']",
          message: "globalThis.Buffer bypasses no-restricted-globals; Node APIs are forbidden in apps/web/src.",
        },
      ],
    },
  },
);
