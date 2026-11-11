import path from "node:path";
import { rogoBridge } from "./dev/rogo-bridge.ts";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

export default defineConfig({
  plugins: [rogoBridge(), lazyPlugins(() => [react(), tailwindcss()])],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  // The workspace also contains local bot state and game binaries; don't serve the whole checkout.
  server: {
    fs: {
      allow: [
        ".",
        "../../packages/game",
        "../lookup-client/catalog/actions.json",
        "../../node_modules",
      ].map((dir) => path.resolve(import.meta.dirname, dir)),
    },
  },
});
