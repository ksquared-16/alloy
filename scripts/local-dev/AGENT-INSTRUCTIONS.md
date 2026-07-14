# Agent instruction templates (Phase 1)

Copy the appropriate block into the agent session for a worktree.

---

## Cursor agent

```text
You are working in an Alloy Git worktree for parallel local development.

Hard constraints:
- Work ONLY in this assigned worktree directory. Do not edit other worktrees or the canonical checkout unless explicitly told.
- Use ONLY the assigned branch for this worktree.
- Use ONLY the assigned PORT for any local app server (see .env.local.agent and alloy-dev-status).
- At start, confirm: `pwd`, `git branch --show-current`, and `git status --short`.
- Do NOT push.
- Do NOT merge.
- Do NOT delete branches.
- Do NOT remove worktrees.
- Do NOT stash/reset/clean user work. Preserve uncommitted and committed work.
- Commit coherent changes locally when appropriate.
- Run focused checks directly (single-file / narrow Vitest, lint of touched files).
- For broad checks (full typecheck, full Vitest, Next build, Playwright, verify:module-imports), use `alloy-validate <worktree-name> <kind>` only.
- Do NOT background heavy checks.
- Do NOT start a second dev server for this worktree. Prefer `alloy-dev-start` / `alloy-dev-stop`.
- Stop temporary processes you start.
- Before finishing, report any processes you left running (dev server, validators, watchers).

Port map: slot N → port 3010+N (3011–3016). Canonical staging uses 3000.
```

---

## Claude agent

```text
You are working in an Alloy Git worktree for parallel local development.

Hard constraints:
- Work ONLY in this assigned worktree directory. Do not edit other worktrees or the canonical checkout unless explicitly told.
- Use ONLY the assigned branch for this worktree.
- Use ONLY the assigned PORT for any local app server (see .env.local.agent and alloy-dev-status).
- At start, confirm: `pwd`, `git branch --show-current`, and `git status --short`.
- Do NOT push.
- Do NOT merge.
- Do NOT delete branches.
- Do NOT remove worktrees.
- Do NOT stash/reset/clean user work. Preserve uncommitted and committed work.
- Commit coherent changes locally when appropriate.
- Run focused checks directly (single-file / narrow Vitest, lint of touched files).
- For broad checks (full typecheck, full Vitest, Next build, Playwright, verify:module-imports), use `alloy-validate <worktree-name> <kind>` only.
- Do NOT background heavy checks.
- Do NOT start a second dev server for this worktree. Prefer `alloy-dev-start` / `alloy-dev-stop`.
- Stop temporary processes you start.
- Before finishing, report any processes you left running (dev server, validators, watchers).

Port map: slot N → port 3010+N (3011–3016). Canonical staging uses 3000.
```
