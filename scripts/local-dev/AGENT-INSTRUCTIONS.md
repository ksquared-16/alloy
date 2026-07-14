# Agent instruction templates

Phase 2 generates **concrete** per-worktree instructions automatically:

```bash
alloy-agent-create <initiative>
alloy-agent-instructions <slot|name>          # print
alloy-agent-instructions <slot|name> --copy   # pbcopy
alloy-agent-open <slot|name>                  # also copies when pbcopy exists
```

Phase 3 adds **verification context**:

```bash
alloy-agent-prepare <slot>
alloy-agent-login <slot>
alloy-agent-context <slot> --copy
alloy-agent-ready <slot>
```

Generated files (git-ignored in the worktree):

```text
<worktree>/.alloy-agent-instructions.md
<worktree>/.alloy-agent-context.md
<worktree>/web/.env.local.agent
```

Auth storage (never commit):

```text
~/.local/state/alloy-dev/auth/slot<N>/storage-state.json
```

See `VERIFICATION-SECURITY.md` for the full security model.

---

## Generic fallbacks (Phase 1–3)

Use only when generated files are unavailable.

### Cursor agent

```text
You are working in an Alloy Git worktree for parallel local development.

Hard constraints:
- Work ONLY in this assigned worktree directory.
- Use ONLY the assigned branch and PORT (see alloy-agent-status).
- Use ONLY your slot's QA identity and browser storage state — never production.
- At start: confirm pwd, branch, git status --short.
- Do NOT push, merge, delete branches, or remove worktrees.
- Commit coherent changes locally when appropriate.
- Focused checks: single-file Vitest, lint of touched files.
- Heavy checks: alloy-validate <worktree> <kind> only (serialized).
- Do NOT start a second dev server or duplicate toolkit browser.
- Do NOT run `npm run dev` directly — use `alloy-dev-start` / `devup` (agent-safe `.env.local.agent` + trusted server injection; privileged values never enter the worktree).
- Do NOT request or expect service-role / DB secrets in the worktree — they are injected only into the toolkit-owned server process.

UI verification (required for user-visible work):
- Test in the assigned localhost browser — never claim UI verified from code alone.
- Report route, steps, expected vs observed, console errors, failed requests, evidence paths.
- Focused: alloy-agent-verify <slot> route /path
- Full Playwright: alloy-validate <worktree> playwright only.
- Never expose cookies, tokens, or storage-state contents.
- Stop browsers: alloy-agent-browser-stop <slot>

Port map: slot N → 3010+N (3011–3016). Login: /login (Supabase email/password).
```

### Claude agent

Same as Cursor. Prefer architecture/doctrine on slot 2, refactor/infrastructure on slot 5 unless redirected.

Claude Desktop: open the exact worktree folder printed by `alloy-agent-open` if no `claude` CLI exists.
