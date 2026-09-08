import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "desktop-dist",
      "desktop-runtime",
      "release",
      "playwright-report",
      "test-results",
      "compiled/**/*.exe",
      ".agents",
      "ecosystem/plugins/reference/google-flow-browser-images/captured-flow-session.json",
      "ecosystem/plugins/reference/google-flow-browser-images/iniciar-captura.bat",
      "ecosystem/plugins/reference/google-flow-browser-images/scripts/analyze-captured-session.mjs",
      "ecosystem/plugins/reference/google-flow-browser-images/scripts/capture-flow-session.mjs",
      "ecosystem/plugins/reference/google-flow-browser-images/scripts/extract-generations.mjs",
      "ecosystem/plugins/reference/google-flow-browser-images/scripts/find-prompt-rpcs.mjs",
      "ecosystem/plugins/reference/google-flow-browser-images/scripts/generation-rpcs.json",
      "ecosystem/plugins/reference/google-flow-browser-images/scripts/print-ui-actions.mjs",
      "ecosystem/plugins/reference/google-flow-browser-images/scripts/rpc-analysis.json",
      "ecosystem/plugins/reference/*/windows-enterprise-install/artifacts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
