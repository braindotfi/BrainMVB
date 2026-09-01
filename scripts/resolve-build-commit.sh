#!/usr/bin/env bash
set -euo pipefail

readonly github_main_ref="refs/remotes/origin/main"

fail() {
  echo "build attestation failed: $*" >&2
  exit 1
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  fail "the deployment source does not include Git metadata"

canonical_commit="$(git rev-parse --verify "${github_main_ref}^{commit}" 2>/dev/null)" ||
  fail "origin/main is unavailable; sync the Replit workspace from GitHub main before publishing"

[[ "${canonical_commit}" =~ ^[0-9a-f]{40}$ ]] ||
  fail "origin/main did not resolve to a full Git SHA"

# Compare the index and working tree directly with origin/main. This permits a
# Replit snapshot commit with different commit metadata only when its tracked
# source is byte-for-byte identical to the canonical GitHub main tree.
if ! git diff --quiet "${canonical_commit}" --; then
  fail "the deployment source differs from origin/main; publish the synced main tree"
fi

printf '%s\n' "${canonical_commit}"
