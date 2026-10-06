import { defineConfig } from "rolldown"

export default defineConfig({
  input: {
    "qwq-voice": "src/entries/voice.ts"
  },
  platform: "node",
  output: {
    dir: "dist",
    format: "esm",
    entryFileNames: "[name].js",
    banner: "#!/usr/bin/env node",
    sourcemap: true,
    minify: true,
  },
})
