# Agent instruction templates

Phase 2 generates **concrete** per-worktree instructions automatically:

```bash
alloy-agent-create <initiative>
alloy-agent-instructions <slot|name>          # print
alloy-agent-instructions <slot|name> --copy   # pbcopy
alloy-agent-open <slot|name>                  # also copies when pbcopy exists
```

Generated file (git-ignored in the worktree):

```text
<worktree>/.alloy-agent-instructions.md
```

Runtime copy:

```text
~/.local/state/alloy-dev/instructions/<worktree-name>.md
```

---

## Generic fallbacks (Phase 1)

Use only when metadata/instructions are unavailable. Prefer the generated file.

### Cursor agent

```text
You are working in an Alloy Git worktree for parallel local development.

Hard constraints:
- Work ONLY in this assigned worktree directory. Do not edit other worktrees or the canonical checkout unless explicitly told.
- Use ONLY the assigned branch for this worktree.
- Use ONLY the assigned PORT for any local app server (see .env.local.agent and alloy-agent-status).
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
Permanent slots: 1 Product · 2 Architecture · 3 Performance · 4 UI/UX · 5 Refactor · 6 Experimental.
```

### Claude agent

Same constraints as Cursor. Prefer architecture/doctrine lane when on slot 2, or refactor/infrastructure when on slot 5, unless the human redirects.
