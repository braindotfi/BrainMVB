import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Build a proper ESM module from the CJS tweetnacl source.
// nacl-fast.js is a UMD IIFE: (function(nacl){ ... })(module.exports || self.nacl)
// We strip the UMD footer and redirect the IIFE argument to our own exports
// object, then re-export it as a default ESM export.
//
// NOTE: the old regex approach (`[^)]+`) failed because nacl's UMD footer has
// nested parens: (self.nacl = self.nacl || {}) — the regex stopped at the
// inner ) and never matched, leaving __naclExports empty ({}) at runtime.
// We use exact string matching to avoid that.
function buildTweetnaclEsm(): string {
  const UMD_FOOTER =
    `})(typeof module !== 'undefined' && module.exports ? module.exports : (self.nacl = self.nacl || {}));`;
  const src = fs.readFileSync(
    path.resolve(import.meta.dirname, "node_modules/tweetnacl/nacl-fast.js"),
    "utf-8",
  );
  const trimmed = src.trimEnd();
  if (!trimmed.endsWith(UMD_FOOTER)) {
    // Fallback: export whatever self.nacl gets populated to
    return `${src}\nexport default (typeof self !== 'undefined' ? self.nacl : {});\n`;
  }
  // Strip the UMD footer, redirect the IIFE to write into __naclExports
  const body = trimmed.slice(0, trimmed.length - UMD_FOOTER.length);
  return `const __naclExports = {};\n${body}})(__naclExports);\nexport default __naclExports;\n`;
}

const TWEETNACL_ESM = buildTweetnaclEsm();
const TWEETNACL_VIRTUAL_ID = "\0tweetnacl-esm";

// Inline JS stubs injected during esbuild pre-bundling (optimizeDeps/dev phase).
// NOTE: tweetnacl is intentionally NOT stubbed here — esbuild handles CJS→ESM
// natively and produces a working nacl implementation for the dev server.
const ESBUILD_STUBS: Record<string, string> = {};

const esbuildStubPlugin = {
  name: "brain-stub-crossmint-cjs",
  setup(build: any) {
    for (const pkg of Object.keys(ESBUILD_STUBS)) {
      const filter = new RegExp(`^${pkg.replace(/\//g, "\\/").replace(/-/g, "\\-")}$`);
      build.onResolve({ filter }, () => ({ path: pkg, namespace: "brain-stub" }));
    }
    build.onLoad({ filter: /.*/, namespace: "brain-stub" }, (args: any) => ({
      contents: ESBUILD_STUBS[args.path] ?? "",
      loader: "js",
    }));
  },
};

// Vite plugin for Rollup (production builds).
// tweetnacl gets a virtual ESM module with the real nacl source inlined,
// so Rollup doesn't have to deal with CJS interop at all.
const tweetnaclEsmPlugin: Plugin = {
  name: "tweetnacl-esm",
  enforce: "pre",
  resolveId(id) {
    if (id === "tweetnacl") return TWEETNACL_VIRTUAL_ID;
    return null;
  },
  load(id) {
    if (id === TWEETNACL_VIRTUAL_ID) return TWEETNACL_ESM;
    return null;
  },
};

export default defineConfig({
  plugins: [
    tweetnaclEsmPlugin,
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
  optimizeDeps: {
    esbuildOptions: {
      // NOTE: changing this define busts the browserHash so browsers
      // fetch fresh pre-bundled chunks (v1 = bs58+tweetnacl fully fixed).
      define: { __BRAIN_DEP_VERSION__: '"v4"' },
      plugins: [esbuildStubPlugin],
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 5000,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
