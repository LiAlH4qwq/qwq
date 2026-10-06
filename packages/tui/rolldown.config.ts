import { defineConfig } from "rolldown"

export default defineConfig({
  input: {
    "qwq-tui": "src/entries/tui.ts"
  },
  platform: "node",
  transform: { jsx: "react-jsx" },
  output: {
    dir: "dist",
    format: "esm",
    entryFileNames: "[name].js",
    banner: "#!/usr/bin/env node",
    sourcemap: true,
    minify: true,
  },
})
