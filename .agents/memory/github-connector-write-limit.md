---
name: GitHub push credentials — how pushes are authenticated, and three traps
description: git push works via a repo-local credential.helper reading a PAT from the environment. Covers the secret-injection model, why GH_TOKEN cannot be relied on, the public-repo scope-probe trap, and diagnosing permission gaps.
---

## How pushes authenticate

`git push` over HTTPS works. Authentication comes from a **repo-local credential
helper that reads a fine-grained PAT out of the environment** — the config stores
the variable *name*, never the value, so no token literal is written to
`.git/config`:

```
git config --local credential.https://github.com.helper \
  '!f() { echo username=x-access-token; echo "password=$<VAR_NAME>"; }; f'
```

Verify after wiring: `grep -E 'github_pat_|ghp_' .git/config` must find nothing.

Prefer this over the REST contents API for anything that is not a single docs
file. `PUT /contents` makes one commit per file, cannot express renames or
deletions, cannot push existing local history, and bypasses local verification —
so a multi-file codemod pushed that way is neither atomic nor tested as pushed.

## Trap 1 — secrets are live immediately, NOT at container boot

**A newly added Replit Secret is readable in the very next shell command.** No
container restart, no workflow restart.

**Why this matters:** a previous version of this note asserted the opposite
("secrets are injected at container boot via PID 1's environment") and told a
future agent to wait for a reboot to pick up a replacement token. That was wrong,
and it produced a recommendation — "reboot to fix the credential" — that would
have burned a restart and changed nothing.

**How to apply:** never advise a reboot to make a secret take effect. Just read it.

## Trap 2 — `GH_TOKEN` is runtime-injected and cannot be managed

`GH_TOKEN` is **not** in the Secrets store and not in the env-var store
(`viewEnvVars` reports it absent), not in any dotfile, and not inherited from
PID 1. The runtime injects it directly. Consequences:

- It can be expired with **no replacement path** — there is nothing to "update".
- A Secret you create named `GH_TOKEN` risks being shadowed by the injected value.

**How to apply:** when you need a durable, manageable GitHub credential, request
it under a **distinct name** and point the credential helper at that name.

## Trap 3 — public repos make token-scope probes false-positive

Any valid token can `GET /repos/{owner}/{repo}` on a **public** repo and receive
200 with a full `permissions` block reflecting the *user's* access, not the
token's grants. Probing narrowness by reading repos therefore reports a
correctly-scoped token as over-broad.

**Decisive probe:** hit an endpoint that requires push, e.g.
`GET /repos/{owner}/{repo}/collaborators` — 200 means push-level access, 403
means none. Check `private` before drawing any conclusion from a 200.

## Diagnosing a permission gap

GitHub's 403 body only says "Resource not accessible by personal access token";
the permission actually required is in the response header:

```
gh api -i /repos/<owner>/<repo>/pulls/NNN/merge
# look for:  X-Accepted-GitHub-Permissions: pull_requests=write
```

To probe a permission without side effects, send a deliberately invalid payload:
- **403** → credential is denied the action
- **422** → credential is allowed; only the input was wrong

A merge PUT against an already-merged PR returns 200 restating the existing merge
commit — that is not proof the credential can merge under branch protection.

## Branch protection is separate — and overridable, which is the trap

The base branch may enforce review: `mergeStateStatus: BLOCKED` alongside
`mergeable: MERGEABLE`. A plain merge fails with "the base branch policy
prohibits the merge". That is a branch rule, not a credential problem.

`gh pr merge --admin` with a broadly-scoped classic PAT can override it — it has
merged a PR with `reviewDecision: REVIEW_REQUIRED` and zero reviews. **That is a
bypass of the review requirement, not a workaround.** Whether it is acceptable is
the repo owner's call per the standing admin-merge rule (see
`merge-bypass-rule.md`), never a routine step.

**Why this note exists:** a finished CI-green change looked unlandable because one
credential's 403 was read as the repo's limit, while the credential that could
land it was already configured for pushes. Then reaching for `--admin` quietly
turned an access question into a governance one.
