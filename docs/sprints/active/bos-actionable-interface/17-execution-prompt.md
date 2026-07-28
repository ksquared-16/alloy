---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 17 — Final Execution Prompt (Implementation Session)

Copy-paste this into a **fresh Cursor implementation session**.

---

## Mission

Implement **BOS Actionable Interface — Horizon 1** per the planning package at:

`docs/sprints/active/bos-actionable-interface/`

Create Lead becomes a BOS conversational + Form command experience over the existing Operational Command Runtime and Processing identity gate.

## Hard constraints

- Do **not** push, merge, rebase onto staging, open a PR, or trigger Vercel unless Kelly explicitly authorizes.
- “Commit” means **local commit only**.
- Do **not** create migrations.
- Do **not** invent a parallel mutation path, form engine, identity resolver, or Processing runtime.
- Do **not** create a Processing Case until registered `create_lead` execute (same as today).
- Do **not** auto-open the created lead on success.
- Do **not** redesign BOS visual identity or reopen Presentation Runtime architecture.
- Do **not** implement full slash menu or daily briefing product (stubs only if time after V1).
- Do **not** target `POST /api/admin/mutations/execute` — bind to `POST /api/admin/actions/execute` only.
- Server remains authoritative; human confirms; registered commands execute.

## Bootstrap

1. Use Alloy managed sprint workflow from canonical `/Users/Kelly/Alloy`:

```bash
alloy-sprint-start bos-actionable-interface --provider cursor --slot auto --without-server
```

(Or reuse/finish prior planning slot only if Kelly directs.)

2. First reply: print assignment card (root, sprint, slot, worktree, branch, port, localhost or server not required, auth, server status, operator commands).

3. Read in order:

- `docs/sprints/active/bos-actionable-interface/README.md`
- `01-current-state-trace.md`
- `03-architecture-and-ownership.md`
- `04-command-session-and-data-contracts.md`
- `05-create-lead-reference-flow.md`
- `06-processing-integration.md`
- `11-implementation-phases.md`
- `12-implementation-work-packages.md`
- `docs/platform/modules/ai-platform.md`
- `docs/platform/modules/actions-and-workflows.md`
- `docs/platform/modules/documents-and-forms.md` (Processing gate)
- `docs/system/bos-identity-doctrine.md`

4. Confirm worktree with `alloy-root` and `pwd`.

## Execution order

Execute work packages **WP-01 → WP-12** exactly as specified in `12-implementation-work-packages.md`.

- One package ≈ one local commit (coherent message).
- After each package: run listed tests.
- Start localhost only when Live QA requires UI (`alloy-dev-start`, port from slot).

## When to stop

**Stop after WP-12** (V1 Create Lead reference + placement convergence + certification).

Optional WP-13/14 stubs only if Kelly asks or residual time with zero risk to V1.

## Product approval vs local decisions

| Requires Kelly | Decide locally using the plan |
|---|---|
| Push / PR / staging promote | Default Conversation mode |
| Expanding into H2/H3 UI | Pin BOS when Form too narrow |
| New durable draft tables | sessionStorage persistence details |
| Changing Processing commit authority | Component extraction boundaries inside intake |
| Auto-open lead | Evidence chip styling within identity doctrine |

If a genuine product fork appears that the plan did not resolve: **stop and ask** — do not silently invent architecture.

## Evidence

Capture per `14-testing-and-certification.md`: screenshots, test logs, live case/opportunity ids.

## What not to redesign

- Processing IdentityReviewPanel semantics
- createLead eligibility floor
- Success/refresh contract (`buildCreateLeadSuccess`)
- BOS mark/smoke/reveal identity
- Focus Panel / Work Unit action ownership split
- Queue preview vs entity GET authority

## Commits

Local, coherent, conventional. Multiple commits expected. Never `--no-verify` unless Kelly orders.

## Final report to Kelly

Include: commits, tests, localhost URL or “server not required”, git ahead/behind, push state (**unpushed**), processes left running, residual risks.

## Operator commands

```text
alloy-worker-status
alloy-worker-pause <slot>
alloy-worker-resume <slot>
alloy-worker-doctor <slot>
alloy-sprint-finish <slot>
```
