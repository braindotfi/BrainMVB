import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const STUB_DIR = path.resolve(import.meta.dirname, "client/src/stubs");

// Build a proper ESM module from the CJS tweetnacl source.
// We replace the UMD footer so the lib writes into our __naclExports object,
// then we re-export it as a default ESM export.
function buildTweetnaclEsm(): string {
  const src = fs.readFileSync(
    path.resolve(import.meta.dirname, "node_modules/tweetnacl/nacl-fast.js"),
    "utf-8",
  );
  // Replace the UMD condition at the very end with our own export target.
  // Original: })(typeof module !== 'undefined' && module.exports ? module.exports : (self.nacl = self.nacl || {}));
  const patched = src.replace(
    /\}\)\(typeof module[^)]+\);?\s*$/,
    "})(__naclExports);",
  );
  return `const __naclExports = {};\n${patched}\nexport default __naclExports;\n`;
}

const TWEETNACL_ESM = buildTweetnaclEsm();
const TWEETNACL_VIRTUAL_ID = "\0tweetnacl-esm";

// Inline JS stubs injected during esbuild pre-bundling (optimizeDeps/dev phase).
// NOTE: tweetnacl is intentionally NOT stubbed here — esbuild handles CJS→ESM
// natively and produces a working nacl implementation for the dev server.
const ESBUILD_STUBS: Record<string, string> = {
  "@crossmint/wallets-sdk": `
    export class WalletNotAvailableError extends Error {
      constructor(msg) { super(msg); this.name = "WalletNotAvailableError"; }
    }
    export class CrossmintWallets {
      static from() { return new CrossmintWallets(); }
      getOrCreate() { return Promise.reject(new WalletNotAvailableError("not available")); }
    }
    export class EVMWallet {}
    export class SolanaWallet {}
    export class StellarWallet {}
    export class Wallet {}
    export function isExportableSignerAdapter() { return false; }
    export class IframeDeviceSignerKeyStorage {
      getKeys() { return Promise.resolve([]); }
    }
  `,
  bs58: `
    const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const BASE = 58;
    const MAP = {};
    for (let i = 0; i < ALPHA.length; i++) MAP[ALPHA[i]] = i;
    export function encode(bytes) {
      if (!bytes.length) return "";
      let lead = 0;
      for (let i = 0; i < bytes.length && bytes[i] === 0; i++) lead++;
      const digits = [0];
      for (let i = 0; i < bytes.length; i++) {
        let c = bytes[i];
        for (let j = 0; j < digits.length; j++) { c += digits[j] << 8; digits[j] = c % BASE; c = (c / BASE)|0; }
        while (c > 0) { digits.push(c % BASE); c = (c / BASE)|0; }
      }
      let r = ALPHA[0].repeat(lead);
      for (let i = digits.length - 1; i >= 0; i--) r += ALPHA[digits[i]];
      return r;
    }
    export function decode(str) {
      if (!str.length) return new Uint8Array(0);
      let lead = 0;
      for (let i = 0; i < str.length && str[i] === ALPHA[0]; i++) lead++;
      const b = [0];
      for (let i = 0; i < str.length; i++) {
        const v = MAP[str[i]];
        if (v === undefined) throw new Error("Non-base58 char: " + str[i]);
        let c = v;
        for (let j = 0; j < b.length; j++) { c += b[j] * BASE; b[j] = c & 0xff; c >>= 8; }
        while (c > 0) { b.push(c & 0xff); c >>= 8; }
      }
      while (b.length > 1 && b[b.length-1] === 0) b.pop();
      const out = new Uint8Array(lead + b.length);
      for (let i = 0; i < b.length; i++) out[lead + i] = b[b.length - 1 - i];
      return out;
    }
    export default { decode, encode };
  `,
};

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
// resolveId fires for every module in the graph including inside node_modules.
// tweetnacl gets a virtual ESM module with the real nacl source inlined,
// so Rollup doesn't have to deal with CJS interop at all.
const stubCrossmintCjsDeps: Plugin = {
  name: "stub-crossmint-cjs-deps",
  enforce: "pre",
  resolveId(id) {
    if (id === "@crossmint/wallets-sdk") return path.join(STUB_DIR, "crossmint-wallets-sdk.ts");
    if (id === "tweetnacl") return TWEETNACL_VIRTUAL_ID;
    if (id === "bs58") return path.join(STUB_DIR, "bs58.ts");
    return null;
  },
  load(id) {
    if (id === TWEETNACL_VIRTUAL_ID) return TWEETNACL_ESM;
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
  optimizeDeps: {
    esbuildOptions: {
      plugins: [esbuildStubPlugin],
    },
  },
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
