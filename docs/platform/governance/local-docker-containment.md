# Local Docker containment — one shared stack

**Status:** active governance · **Applies to:** every Alloy session (Claude, Cursor, human), managed or not.

## The rule

There is **one** local Supabase stack on this machine: project `alloy-cert`, defined by the committed
`certification/supabase/config.toml`. Sessions **share** it and take a **lease** on it. Nobody starts their own.

```bash
alloy-stack use        # join the shared stack (starts it only if nobody has it up)
alloy-stack status     # what is running, and which sessions hold leases
alloy-stack release    # at sprint end — stops the stack if you are the last one out
alloy-stack doctor     # explain any violation; non-zero exit if unclean
```

`alloy-sprint-finish <slot>` releases the lease automatically, so a finished sprint cannot leave containers behind.

## What went wrong

Docker reached **35 containers across 4 stacks** while nominally running a handful of sessions. The four:

| Stack | Containers | Origin | Age when found |
|---|---|---|---|
| `alloy-cert` | 10 | the sanctioned shared stack | 45h |
| `6lmr` | 11 | default `supabase start`, no owner | 2 days |
| `alloy-objhost` | 8 | a **temp scratchpad directory**, worktree since deleted | 2 days |
| `alloy-tour-wt2` | 6 | a second cert dir (`certification-tour/`) | minutes |

Three causes, all structural — none of them carelessness by any one session:

1. **The documentation told sessions to replicate.** `certification/README.md` stated that the 544xx ports were
   chosen not to collide with the 543xx / 553xx / 563xx stacks "so all can run concurrently."
   `scripts/processing/processingIdentityCertPorts.md` was a step-by-step playbook for standing up another one.
   Agents followed the docs correctly; the docs were wrong.
2. **Nothing in the lifecycle ever stopped a stack.** `alloy-sprint-finish` stopped the dev server and the browser
   and never touched Docker. `alloy-clean` explicitly refused to touch Docker data. Stacks outlived their sessions,
   their worktrees, and in one case the entire directory they were started from.
3. **No enforcement surface existed.** The repo had no `.claude/settings.json` and no hooks, so "please share the
   stack" was advice, and advice does not survive a fresh session with no memory of this incident.

## Why enforcement, not guidance

The failure mode is an agent reasoning its way to a locally sensible decision — *"I'll use my own disposable
Postgres rather than touch anyone's stack"* — which is individually defensible and collectively ruinous. Since that
reasoning recurs in every new session, the fix has to live where the session cannot argue with it:

- **`PreToolUse` hook** — `scripts/local-dev/hooks/guard-supabase-start.sh` blocks `supabase start` unless it targets
  the shared project. Detection parses the actual subcommand, so `supabase --workdir /tmp/mine start` is caught too.
- **Two install points** — checked in at `.claude/settings.json` (every new worktree inherits it) and installed to
  `~/.claude/settings.json` (every existing session picks it up immediately).
- **Reference-counted teardown** — leases in `~/.local/state/alloy/stack/leases`. The last release stops the stack.
  A lease whose worktree is gone, or that has not been refreshed in 12h, expires on its own, so a crashed session
  cannot pin the stack forever.

## Safety properties

Reaping is destructive and cost one live session its stack during development of this tooling, so:

- `alloy-stack reap` **previews only**. Nothing is removed without `--confirm`.
- Stacks whose containers started less than an hour ago are **skipped** as probably in-use; `--force` overrides.
- Stopping **keeps data volumes**. Only `--volumes` discards them, and never by default. The earlier data loss came
  from `supabase stop --no-backup`; that flag is not used anywhere in the teardown path.
- `supabase stop` is only ever handed a workdir whose `config.toml` declares the project being stopped — otherwise
  the stop is label-scoped to that project's containers and cannot reach a neighbour's.

## If you think you need your own stack

You almost certainly do not — the shared stack replays every migration and carries the synthetic tenant
(`northwind-early-learning`), which is what per-sprint stacks were reaching for. The one real case is
schema-destructive testing that would corrupt the shared tenant.

That is a decision for Kelly, not a workaround. Ask. If it is granted, the stack is registered in
`~/.config/alloy/stack.conf` so the reaper knows about it, and it is stopped the same day.

## Cleaning up

```bash
alloy-stack doctor              # is this machine contained right now?
alloy-stack reap                # preview what would be freed
alloy-stack reap --confirm      # stop unsanctioned stacks, keeping their data
docker volume ls | grep supabase   # stale volumes from stacks that no longer exist
```
