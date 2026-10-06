import { defineConfig } from "rolldown"

export default defineConfig([
  {
    input: "packages/gui/src/main.ts",
    platform: "node",
    external: ["electron"],
    output: {
      dir: "packages/gui/dist",
      format: "cjs",
      entryFileNames: "main.js",
      sourcemap: true,
      minify: true,
    },
  },
  {
    input: "packages/gui/src/renderer.tsx",
    platform: "browser",
    transform: { jsx: "react-jsx" },
    output: {
      dir: "packages/gui/dist",
      format: "iife",
      entryFileNames: "renderer.js",
      sourcemap: true,
      minify: true,
    },
  },
])
