import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { execFileSync } from "node:child_process";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "helmet",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

function resolveBuildCommit(): string {
  for (const name of ["BUILD_COMMIT", "GIT_SHA", "REPLIT_GIT_COMMIT_SHA"]) {
    const value = process.env[name]?.trim();
    if (value && /^[0-9a-f]{7,64}$/i.test(value)) return value;
  }
  try {
    const value = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (/^[0-9a-f]{7,64}$/i.test(value)) return value;
  } catch {
    // A source archive may not include .git. Keep the response honest rather
    // than failing a development build; deployment builds should provide Git
    // metadata or BUILD_COMMIT.
  }
  return "unknown";
}

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const buildCommit = resolveBuildCommit();
  const buildVersion = process.env.BUILD_VERSION?.trim() || pkg.version || "unknown";
  console.log(`[build] commit: ${buildCommit} | version: ${buildVersion}`);
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.mjs",
    banner: {
      js: `import{createRequire}from"node:module";import{fileURLToPath}from"node:url";import{dirname}from"node:path";const require=createRequire(import.meta.url);const __filename=fileURLToPath(import.meta.url);const __dirname=dirname(__filename);`,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.BUILD_COMMIT": JSON.stringify(buildCommit),
      "process.env.BUILD_VERSION": JSON.stringify(buildVersion),
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
