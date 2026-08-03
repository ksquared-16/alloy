# Alloy — Claude instructions

This repository uses the Alloy **Managed Sprint Operations** workflow for implementation sprints.

## Canonical root — check this first

**The only sanctioned engineering root is `/Users/Kelly/Alloy`.**

```bash
alloy-root          # which root am I in, and is it sanctioned?
```

`/Users/Kelly/Alloy-Claude` was **retired as an engineering root in July 2026**. Do not start work there, and do not build on what is there. If `alloy-root` says `retired`, `unmanaged`, or `outside`, **stop and re-bootstrap from the canonical repository** — nothing you do in an unsanctioned root can be trusted, no matter how correct it looks.

This is not hypothetical. Two sprints of design work were done in a clone that was **1481 commits behind `origin/staging` and did not contain `scripts/local-dev` at all** — while a canonical governance doc said that clone was the right place for exactly that work. It has the same `git remote` as the canonical repo, so the remote proves nothing. **Being in the right repository is not being on the right base.**

**Required reading before any Alloy sprint:**

[`docs/platform/governance/managed-sprint-operations.md`](docs/platform/governance/managed-sprint-operations.md)

Also respect:

- [`docs/platform/governance/agent-repo-boundaries.md`](docs/platform/governance/agent-repo-boundaries.md) — one canonical root
- [`docs/platform/governance/workspace-orchestration.md`](docs/platform/governance/workspace-orchestration.md)
- Cursor-shared rules under `.cursor/rules/` (same operating constraints)

## Bootstrap

From `/Users/Kelly/Alloy`, use the installed toolkit:

```bash
alloy-sprint-start <name> --provider claude [--slot auto|N] [--with-server|--without-server]
```

Work **only** in the returned worktree. Permanent ports are **3011–3016**. Do not invent ports. Worktree-local dependencies only. Start localhost only when required.

## Git / deploy

- Coherent local commits throughout; multiple commits are expected.
- “Commit” never implies “push.”
- Do not push, merge, rebase, create/update a PR, trigger Vercel, or modify `staging` until Kelly explicitly authorizes promotion.
- Do not modify sibling worktrees or the canonical checkout during implementation.

## Local Docker — one shared stack

**Never run `supabase start`.** There is one local Supabase stack on this machine (`alloy-cert`) and every session
shares it. Starting your own creates 8–11 containers that outlive the session — that is how Docker reached 35
containers across 4 stacks and stalled everyone's progress.

```bash
alloy-stack use        # join the shared stack (starts it only if nobody has it up)
alloy-stack status     # what is running, and which sessions hold leases
alloy-stack release    # at sprint end — stops the stack if you are the last one out
```

`alloy-sprint-finish` releases your lease for you. `supabase start` outside the shared stack is blocked by a
`PreToolUse` hook. "I'll just use my own disposable Postgres" is the exact reasoning that caused this — if you think
you need an isolated stack, ask Kelly rather than starting one.

Required reading: [`docs/platform/governance/local-docker-containment.md`](docs/platform/governance/local-docker-containment.md)

## First response

On the first reply to Kelly, print only the compact assignment card from `managed-sprint-operations.md` §4 (root, sprint, slot, provider, worktree, branch, port, localhost or “server not required”, auth readiness, server status, and operator commands). No implementation theory in that first message.

The card must state the **root** and its class, from `alloy-root`. A sprint that cannot name its root has not started.

```text
alloy-root
alloy-worker-status
alloy-worker-pause <slot>
alloy-worker-resume <slot>
alloy-worker-doctor <slot>
alloy-sprint-finish <slot>
```

## Short invocation Kelly may paste

```text
Use the Alloy managed sprint workflow defined in the repository. Bootstrap and execute this sprint: [objective]. On your first response, give me the assigned slot, worktree, localhost URL, and operator commands.
```
