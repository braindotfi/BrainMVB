import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const resolver = resolve(process.cwd(), "scripts/resolve-build-commit.sh");
const temporaryDirectories: string[] = [];

function git(repository: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
  }).trim();
}

function makeRepository(): { repository: string; canonicalCommit: string } {
  const repository = mkdtempSync(
    resolve(tmpdir(), "brain-mvb-build-attestation-"),
  );
  temporaryDirectories.push(repository);
  git(repository, "init", "--initial-branch=main");
  git(repository, "config", "user.email", "build-attestation@brain.invalid");
  git(repository, "config", "user.name", "Build Attestation Test");
  writeFileSync(resolve(repository, "source.txt"), "canonical source\n");
  git(repository, "add", "source.txt");
  git(repository, "commit", "-m", "canonical source");
  const canonicalCommit = git(repository, "rev-parse", "HEAD");
  git(repository, "update-ref", "refs/remotes/origin/main", canonicalCommit);
  return { repository, canonicalCommit };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Replit build attestation", () => {
  it("reports canonical origin/main when Replit snapshot metadata has a different SHA", () => {
    const { repository, canonicalCommit } = makeRepository();
    git(
      repository,
      "commit",
      "--allow-empty",
      "-m",
      "Replit snapshot metadata",
    );

    const resolved = execFileSync("bash", [resolver], {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        REPLIT_GIT_COMMIT_SHA: "2e63e021ae913c39244df65fa13e0ec0db0ec9bf",
      },
    }).trim();

    expect(resolved).toBe(canonicalCommit);
    expect(resolved).not.toBe("2e63e021ae913c39244df65fa13e0ec0db0ec9bf");
  });

  it("fails closed when the deployment source differs from origin/main", () => {
    const { repository } = makeRepository();
    writeFileSync(resolve(repository, "source.txt"), "unreviewed source\n");

    const result = spawnSync("bash", [resolver], {
      cwd: repository,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "deployment source differs from origin/main",
    );
  });

  it("fails closed when canonical GitHub main metadata is absent", () => {
    const { repository } = makeRepository();
    git(repository, "update-ref", "-d", "refs/remotes/origin/main");

    const result = spawnSync("bash", [resolver], {
      cwd: repository,
      encoding: "utf8",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("origin/main is unavailable");
  });
});
