/**
 * CI guard for the npm lockfile.
 *
 * This deliberately checks two things before npm ci:
 *   1. package.json's declared dependency sections match the lockfile root.
 *   2. every tarball URL points at the public npm registry, not Replit's
 *      package firewall or another private/local host.
 *
 * npm ci --dry-run in the workflow remains the authoritative npm-level sync
 * check, including transitive package entries. Keeping the cheap, readable
 * checks here gives CI a useful failure message before npm prints its usage
 * page.
 */

import fs from "node:fs";
import process from "node:process";

const manifestPath = "package.json";
const lockPath = fs.existsSync("package-lock.json")
  ? "package-lock.json"
  : fs.existsSync("npm-shrinkwrap.json")
    ? "npm-shrinkwrap.json"
    : null;

const failures = [];
const fail = (message) => failures.push(message);

if (!lockPath) fail("package-lock.json or npm-shrinkwrap.json is missing");

if (lockPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const lockfile = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const root = lockfile.packages?.[""];

  if (!root) {
    fail(`${lockPath} has no packages[""] root entry`);
  } else {
    const dependencySections = [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
      "peerDependenciesMeta",
    ];

    const canonicalJson = (value) => {
      if (Array.isArray(value)) return value.map(canonicalJson);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonicalJson(value[key])]),
        );
      }
      return value;
    };

    for (const section of dependencySections) {
      if (
        JSON.stringify(canonicalJson(manifest[section] ?? {})) !==
        JSON.stringify(canonicalJson(root[section] ?? {}))
      ) {
        fail(`${section} in package.json does not match packages[""] in ${lockPath}`);
      }
    }

    const allowedHosts = new Set(["registry.npmjs.org"]);
    const badResolved = [];

    for (const [packagePath, entry] of Object.entries(lockfile.packages ?? {})) {
      if (!entry?.resolved) continue;

      let url;
      try {
        url = new URL(entry.resolved);
      } catch {
        badResolved.push(`${packagePath}: invalid URL ${entry.resolved}`);
        continue;
      }

      if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
        badResolved.push(`${packagePath}: ${entry.resolved}`);
      }
    }

    if (badResolved.length > 0) {
      failures.push(
        "resolved package URLs must use https://registry.npmjs.org/",
      );
      for (const entry of badResolved) failures.push(`  - ${entry}`);
    }

    if (failures.length === 0) {
      console.log(
        `lockfile metadata is valid: ${lockPath}; ` +
          `${Object.keys(lockfile.packages ?? {}).length - 1} packages; ` +
          "all resolved URLs use registry.npmjs.org",
      );
    }
  }
}

if (failures.length > 0) {
  console.error("lockfile validation failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}