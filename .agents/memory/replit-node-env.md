---
name: Replit NODE_ENV is unset outside the workflow process
description: NODE_ENV is empty in the Replit shell even when the workflow sets it; use REPLIT_DEV_DOMAIN presence as the dev-context signal instead.
---

## Rule
Never gate dev-context logic on `process.env.NODE_ENV === "development"` in this project. `NODE_ENV` is unset (empty string) when code runs outside the workflow process — in `node -e`, `tsx` scripts, tests, or any shell command that doesn't inherit the workflow's env.

Use `process.env.REPLIT_DEV_DOMAIN` as the reliable signal instead: if it is present and non-empty, the process is running inside a Replit preview.

**Why:** The workflow start command is `NODE_ENV=development tsx server/index.ts`. That sets `NODE_ENV` only for that process and its children. Any other execution context (shell, `npm test`, curl harnesses) sees `NODE_ENV=""`. A guard like `NODE_ENV === "development" && REPLIT_DEV_DOMAIN` therefore always falls through to the production default, silently sending production URLs from a dev environment.

**How to apply:**
- `passwordResetUrl()` and any similar URL-builder that must point at the dev app: check `REPLIT_DEV_DOMAIN` first, then fall back to the production domain.
- For conditional logic that must distinguish dev from prod in server code: prefer `REPLIT_DEV_DOMAIN` over `NODE_ENV`.
- Tests that need to verify this branching should clear/set `REPLIT_DEV_DOMAIN`, not `NODE_ENV`.
