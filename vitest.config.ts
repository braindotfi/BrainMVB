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
    },
  },
  test: {
    environment: "node",
    setupFiles: ["server/testEnv.ts"],
    include: [
      "server/**/*.test.ts",
      "client/src/**/*.test.ts",
    ],
    globals: false,
  },
});
