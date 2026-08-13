import { defineConfig } from "vitest/config";
import path from "node:path";

// Dedicated vitest config (does NOT extend vite.config.ts, so the dev-only
// tweetnacl/plugin wiring never loads in tests). These suites pin the BFF's
// safety-critical invariants — see server/brain/bff-invariants.test.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  // The rendering tests import real page components (.tsx). Vitest compiles
  // them with esbuild, which defaults to the classic `React.createElement`
  // transform — the pages assume Vite's automatic JSX runtime instead.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    setupFiles: ["server/testEnv.ts"],
    include: [
      "server/**/*.test.ts",
      "client/src/**/*.test.ts",
      "client/src/**/*.test.tsx",
    ],
    globals: false,
  },
});
