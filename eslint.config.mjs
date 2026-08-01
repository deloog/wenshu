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
);
