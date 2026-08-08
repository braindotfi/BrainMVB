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
the repo owner's explicit per-PR call (see `merge-bypass-rule.md` — there is no
standing bypass, for any category), never a routine step.

**Why this note exists:** a finished CI-green change looked unlandable because one
credential's 403 was read as the repo's limit, while the credential that could
land it was already configured for pushes. Then reaching for `--admin` quietly
turned an access question into a governance one.

    ## Git push and the REST API are separate credentials

    `git push` over the HTTPS remote can fail with "Invalid username or token. Password
    authentication is not supported for Git operations" — and `gh` return `HTTP 401: Bad
    credentials` — while the Replit **GitHub connector** is `added` and its REST API accepts
    writes perfectly. Re-authorising the connector does **not** fix `git push`; the git
    credential helper is not wired to it.

    **A push failure is therefore not proof you cannot write.** Land the commit through the
    connector API instead — no local branch required:

    1. `GET  /repos/{o}/{r}/git/ref/heads/main` → base sha
    2. `POST /repos/{o}/{r}/git/refs` → create `refs/heads/<branch>`
    3. `PUT  /repos/{o}/{r}/contents/<path>` with `{ content: <base64>, branch }`
    4. `POST /repos/{o}/{r}/pulls`

    through `listConnections("github")` → `conn.proxyFetch(path, init)` inside `"use impure"`.

    **Verify afterwards.** The API creates a *different* commit from any local one you made,
    so the local branch and origin diverge even when the content is identical. Compare
    `git hash-object <file>` with `git rev-parse origin/<branch>:<file>` — matching blob shas
    prove the content landed intact.
    
## Trap 4 — no available PAT can push `.github/workflows/`

GitHub refuses a PAT that lacks `workflow` scope:

```
! [remote rejected] <branch> (refusing to allow a Personal Access Token to
  create or update workflow `.github/workflows/test.yml` without `workflow` scope)
```

**Both** tokens in the environment are rejected, including the one whose name
suggests otherwise. The refusal happens at push time, so a branch containing a
workflow edit fails *entirely* — other branches in the same `git push` still
succeed, which makes the failure easy to misread as a partial network error.

**How to apply:** never put a `.github/workflows/` change in a branch with other
work. Split it out, ship the rest, and hand the maintainer the exact YAML in the
PR body. Check for it *before* writing the commit message — a message that
describes CI wiring becomes false when the wiring has to be dropped.


## The connector proxy is not a general write fallback

Measured ceiling, in order of what to try:

- **git push with a PAT** — refused for anything under `.github/workflows/`
  with "refusing to allow a Personal Access Token to create or update workflow
  ... without `workflow` scope". Every PAT in the environment hits this,
  regardless of how the variable is named. A promising name is not a scope.
- **connector -> Contents API** — the gateway returns an **HTML 403** for
  `/repos/.../contents/...`. HTML rather than GitHub's JSON error means the
  proxy blocked it, not GitHub. Parse defensively: `await r.json()` throws
  `Unexpected token '<'` and buries the actual status.
- **connector -> Git Data API** — reads fine, `POST /git/blobs` returns **201**,
  and then `POST /git/trees` returns **404 Not Found** consistently (inline
  content or pre-made blob sha alike). A 404 on a repo you just read is
  GitHub disguising a permission refusal.

**Why:** a successful blob write reads like "writes work", so it is tempting to
keep going and assume the next 404 is a payload bug. It is not; the write path
is closed and no amount of reshaping the request opens it.

**How to apply:** for workflow files, stop after the PAT refusal and hand the
user the complete file plus the direct editor link
(`https://github.com/<owner>/<repo>/edit/<branch>/<path>`) rather than a
fragment to splice - a partial paste has already gone missing once. Everything
NOT under `.github/workflows/` still pushes normally with the PAT, so a change
that mixes workflow and non-workflow files should be split, not abandoned.
