import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base: the export must load from an IPFS gateway subpath or an ENS name without rewrites.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
