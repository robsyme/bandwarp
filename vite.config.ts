import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  // everything inlines into the one-file artifact, including the dev-harness photo
  build: { assetsInlineLimit: 100_000_000 },
});
