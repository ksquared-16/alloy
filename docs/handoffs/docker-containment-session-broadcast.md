# Broadcast — Docker containment is now enforced

Paste the block below into **each in-flight session** (Claude or Cursor). It is written to be acted on directly.

---

## Paste this

> **Docker containment is now in force. Please adopt it before you continue.**
>
> Docker had reached 35 containers across 4 stacks because every session that ran `supabase start` got its own
> 8–11 container stack, and nothing ever stopped them. That is fixed. Sessions now **share one** local Supabase
> stack (`alloy-cert`) and take a lease on it.
>
> **What changed for you:**
>
> 1. `supabase start` is now **blocked** by a `PreToolUse` hook unless it targets the shared stack. This is already
>    live in your session — hooks are evaluated per tool call, so you do not need to restart.
> 2. There is a new command, `alloy-stack`, already on your PATH.
> 3. `alloy-sprint-finish <slot>` now releases your lease, so finishing cannot leave containers behind.
>
> **Do this now:**
>
> ```bash
> alloy-stack use        # register that you are using the shared stack
> alloy-stack status     # confirm: one stack, and your lease on it
> ```
>
> If you were using your own stack, it has been stopped — **your data volume was kept**. Point your work at the
> shared stack instead; it already replays every migration and carries the `northwind-early-learning` synthetic
> tenant, which is almost certainly what you wanted.
>
> **When you finish:**
>
> ```bash
> alloy-stack release    # stops the shared stack if you are the last one out
> ```
>
> **Do not** start your own stack to work around this. "I'll use my own disposable Postgres rather than touch
> anyone's stack" is the exact reasoning that caused the problem — it is locally sensible and collectively
> ruinous. If you believe you truly need an isolated stack (schema-destructive testing is the only real case),
> ask Kelly rather than starting one.
>
> Full rationale: `docs/platform/governance/local-docker-containment.md`

---

## Sessions needing specific follow-up

**The interactive-tour session** (`wt2-interactive-tour-invitation`, stack `alloy-tour-wt2`, 6 containers) had its
stack stopped during this work. Its data volume `supabase_db_alloy-tour-wt2` is **intact**. That session should
switch to the shared stack. If it genuinely needs its old data back first:

```bash
supabase start --workdir /Users/Kelly/Code/alloy-worktrees/wt2-interactive-tour-invitation/certification-tour
```

That command is blocked by the hook by design — clear it with Kelly first, migrate what is needed, then release.

## Why new sessions inherit this automatically

| Layer | Where | Reaches |
|---|---|---|
| Enforcement hook | `.claude/settings.json` (committed) | every new worktree cut from staging |
| Enforcement hook | `~/.claude/settings.json` | every session on this machine, including running ones |
| `alloy-stack` | `~/.local/share/alloy/bin`, symlinked into `~/bin` (on login PATH) | every shell, immediately |
| Lease teardown | `alloy-sprint-finish` | every managed sprint that finishes |
| Doctrine | `CLAUDE.md` + governance doc | every session at context load |

The command deliberately lives **outside any worktree**, so teardown keeps working after the worktree that hosted
it is deleted — the failure that left `alloy-objhost` running for two days past its worktree's deletion.
