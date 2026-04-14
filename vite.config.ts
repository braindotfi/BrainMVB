import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const STUB_DIR = path.resolve(import.meta.dirname, "client/src/stubs");

const stubCrossmintCjsDeps: Plugin = {
  name: "stub-crossmint-cjs-deps",
  enforce: "pre",
  resolveId(id) {
    if (id === "@crossmint/wallets-sdk") {
      return path.join(STUB_DIR, "crossmint-wallets-sdk.ts");
    }
    if (id === "tweetnacl") {
      return path.join(STUB_DIR, "tweetnacl.ts");
    }
    if (id === "bs58") {
      return path.join(STUB_DIR, "bs58.ts");
    }
    return null;
  },
};

export default defineConfig({
  plugins: [
    stubCrossmintCjsDeps,
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util", "events"],
      globals: { Buffer: true, process: true, global: true },
      protocolImports: true,
    }),
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
