import { defineConfig } from "vite-plus";

const generated = [
  "**/dist/**",
  "**/node_modules/**",
  ".claude/**",
  "apps/web/public/**",
  "apps/lookup-client/decompiled/**",
  "apps/lookup-client/catalog/actions.json",
  "apps/lookup-client/routine/rules.json",
  "apps/lookup-client/catalog/ACTION_MAP.md",
  "scratch/**",
  "captures/**",
  "data/**",
  "startup/**",
  "device-check-*/**",
  "apps/bot/assets/templates/**",
];

export default defineConfig({
  fmt: { ignorePatterns: generated },
  lint: {
    ignorePatterns: generated,
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  test: { projects: ["apps/web"] },
});
