#!/usr/bin/env node
/**
 * Fail a change that silently deletes shipped UI.
 *
 * Why this exists
 * ---------------
 * Three times, a long-lived branch holding a stale copy of a file was merged
 * into main and quietly took finished work with it:
 *
 *   - "Sync today completed work into main" deleted the Settings Escalation
 *     block and the Auto-Approve Limit row -- a money-authorization control --
 *     which then sat missing from main for four days. Nobody decided to remove
 *     them; the merge just carried an older copy of two files.
 *   - "Sync current BrainMVB changes to main" (101 files, -5860 lines) removed
 *     eleven test ids, four of them merged only hours earlier the same day.
 *   - Six memory index entries were lost the same way and had to be restored.
 *
 * In every case the deletion was invisible in review because it was buried in a
 * large "sync" diff, and no check ever asserted that UI which existed yesterday
 * still exists today.
 *
 * What it does
 * ------------
 * Compares this branch against its merge-base with the base ref and fails if a
 * `data-testid` / `testId` that exists on the base has no occurrence anywhere in
 * the branch. Removing UI stays completely allowed -- it just has to be *stated*,
 * by listing the id in scripts/ui-removals-allowed.txt with a reason. The point
 * is that deleting a user-facing control becomes a decision someone wrote down,
 * rather than a side effect of a merge.
 *
 * Deliberate limits, so nobody reads more into a green run than it can support:
 *   - It only sees literal ids in client/src. Template-literal ids
 *     (`row-escalation-${id}`), untagged copy, and server routes are invisible.
 *     A subhead can lose its text and keep its id, and this check will not care.
 *   - It is presence-anywhere, not per-file: moving a control between files is
 *     correctly silent.
 *   - It cannot tell a deliberate redesign from an accident. That is the whole
 *     point -- it forces a human to say which one it was.
 *
 * Usage:  node scripts/check-removed-ui.mjs [baseRef]     (default origin/main)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const BASE = process.argv[2] || process.env.BASE_REF || "origin/main";
const ALLOWLIST = "scripts/ui-removals-allowed.txt";
/* Matches all three spellings a test id is written in, which is load-bearing:
   an attribute (testId="x"), an object property in a config array
   (testId: "x"), and the prefix a shared component expands (testIdPrefix).
   A pattern that only knows the attribute form reports live controls as
   deleted -- Inbox's priority/status/type filters are declared as object
   properties and look missing to the narrower regex. */
const TID = /(?:data-testid|testId|testIdPrefix)\s*[=:]\s*"([^"{}]+)"/g;

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function idsIn(ref) {
  let out = "";
  try {
    /* Must stay in step with TID above: the grep is the first filter, so a
       narrower pattern here silently hides ids from the regex that follows. */
    out = git(
      "grep", "-rhoE",
      '(data-testid|testId|testIdPrefix)[[:space:]]*[=:][[:space:]]*"[^"{}]+"',
      ref, "--", "client/src",
    );
  } catch {
    return new Set(); // grep exits 1 when it matches nothing
  }
  return new Set([...out.matchAll(TID)].map((m) => m[1]));
}

let mergeBase;
try {
  mergeBase = git("merge-base", BASE, "HEAD").trim();
} catch {
  console.error(`Cannot resolve a merge base with ${BASE}. Fetch it first:\n  git fetch origin ${BASE.replace(/^origin\//, "")}`);
  process.exit(2);
}

const before = idsIn(mergeBase);
const after = idsIn("HEAD");
const removed = [...before].filter((id) => !after.has(id)).sort();

const allowed = new Map();
if (existsSync(ALLOWLIST)) {
  for (const line of readFileSync(ALLOWLIST, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [id, ...reason] = trimmed.split(/\s+/);
    allowed.set(id, reason.join(" ").replace(/^[-–—:]\s*/, ""));
  }
}

/* Advisory only: a very large client deletion is the shape every one of these
   incidents had. It does not fail the run -- it asks for a second pair of eyes. */
let churn = 0;
try {
  const stat = git("diff", "--numstat", mergeBase, "HEAD", "--", "client/src");
  for (const line of stat.trim().split("\n")) {
    const [, del] = line.split("\t");
    if (del && del !== "-") churn += Number(del);
  }
} catch { /* nothing to measure */ }

const unstated = removed.filter((id) => !allowed.has(id));
const stated = removed.filter((id) => allowed.has(id));

console.log(`Comparing HEAD against ${BASE} (merge-base ${mergeBase.slice(0, 7)})`);
console.log(`  test ids on base: ${before.size}   on HEAD: ${after.size}   deleted lines in client/src: ${churn}`);

if (churn >= 1000) {
  console.log(`\n  NOTE: this branch deletes ${churn} lines under client/src. Every incident this`);
  console.log(`  check exists for looked exactly like that. Worth a careful read of the diff.`);
}

if (stated.length) {
  console.log(`\n  ${stated.length} removal(s) declared in ${ALLOWLIST}:`);
  for (const id of stated) console.log(`    - ${id} — ${allowed.get(id) || "no reason given"}`);
}

if (!unstated.length) {
  console.log("\nOK — no undeclared UI removals.");
  process.exit(0);
}

console.error(`\nFAIL — ${unstated.length} test id(s) exist on ${BASE} but nowhere in this branch:\n`);
for (const id of unstated) console.error(`    ${id}`);
console.error(`
If you meant to remove this UI, say so: add each id to ${ALLOWLIST}
with a short reason, e.g.

    toggle-system-activity   superseded — Settings audit log shows the full trail by default

If you did NOT mean to remove it, your branch is probably carrying a stale copy
of a file. Rebase onto ${BASE} and re-check before merging.`);
process.exit(1);
