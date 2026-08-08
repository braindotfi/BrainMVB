---
name: Memory changes ship alone and are always announced
description: PR hygiene rule for any commit touching .agents/memory/ — separate PR, explicit callout in the summary.
---

# Memory changes ship alone and are always announced

Two rules, both standing:

1. **A change to anything under `.agents/memory/` gets its own PR.** Never ride it along on a feature branch, even as a tidy separate commit at the tip. If a piece of work produces both code and a memory entry, that is two PRs.
2. **The PR summary must call out the memory touch explicitly, at the top.** State which files and that it is docs-only. Say so even when the answer is "no memory change in this PR" on a branch where one was expected — the absence is also information.

**Why:** memory files are not product code and are not reviewed the same way. A reviewer scanning a 70-file frontend diff will not notice two markdown files at the bottom of the list, and cannot easily tell whether they are documentation or something that changes agent behaviour. Burying them means they get approved by default rather than on their merits. The rule was set after a design-token PR carried a memory commit at its tip; the fix was to split it out and to flag it in the summary either way.

**How to apply:** before opening any PR, run `git diff --name-only <base>..HEAD | grep '^\.agents/'`. Any hit means split the branch — cherry-pick the memory commit onto a fresh branch off the base, drop it from the original with a reset plus force-push-with-lease, and open the second PR. Then put the callout in *both* summaries. The same applies to memory content being *removed*: a strip or redaction is still a memory change and still ships alone.
