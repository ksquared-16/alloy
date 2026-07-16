# Alloy — Claude instructions

This repository uses the Alloy **Managed Sprint Operations** workflow for implementation sprints.

**Required reading before any Alloy sprint:**

[`docs/platform/governance/managed-sprint-operations.md`](docs/platform/governance/managed-sprint-operations.md)

Also respect:

- [`docs/platform/governance/agent-repo-boundaries.md`](docs/platform/governance/agent-repo-boundaries.md)
- [`docs/platform/governance/workspace-orchestration.md`](docs/platform/governance/workspace-orchestration.md)
- Cursor-shared rules under `.cursor/rules/` (same operating constraints)

## Bootstrap

Use the installed toolkit:

```bash
alloy-sprint-start <name> --provider claude [--slot auto|N] [--with-server|--without-server]
```

Work **only** in the returned worktree. Permanent ports are **3011–3016**. Do not invent ports. Worktree-local dependencies only. Start localhost only when required.

## Git / deploy

- Coherent local commits throughout; multiple commits are expected.
- “Commit” never implies “push.”
- Do not push, merge, rebase, create/update a PR, trigger Vercel, or modify `staging` until Kelly explicitly authorizes promotion.
- Do not modify sibling worktrees or the canonical checkout during implementation.

## First response

On the first reply to Kelly, print only the compact assignment card from `managed-sprint-operations.md` §4 (sprint, slot, provider, worktree, branch, port, localhost or “server not required”, auth readiness, server status, and operator commands). No implementation theory in that first message.

```text
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
