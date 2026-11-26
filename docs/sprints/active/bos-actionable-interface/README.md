---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
supersedes: []
---

# BOS Actionable Interface — Implementation Planning Package

> **Planning only.** Not doctrine. Not an implementation sprint for product code.  
> **Slot 2** · branch `agent/cursor/2-bos-actionable-interface-plan` · worktree `wt2-bos-actionable-interface-plan`  
> **Base:** `origin/staging` @ `31c710068`  
> **Reference command:** Create Lead  
> **Horizons:** H1 = actionable Create Lead in BOS · H2 = slash command catalog · H3 = proactive briefing (foundation only)

## Mission

Evolve BOS from a passive assistant / modal launcher into Alloy’s **universal conversational interface for executing registered operational commands**, without becoming a parallel mutation runtime.

Governing law (unchanged):

> AI assists, proposes, explains, and prepares.  
> Humans confirm.  
> Registered platform commands execute.  
> The server remains authoritative.

## Executive verdict

| Question | Answer |
|---|---|
| Is the platform already mostly built for this? | **Yes.** Registered `create_lead`, Processing identity gate, paste parser, command model, success/refresh contract, and Command Surface shell/controller already exist. |
| What is missing? | Orchestrator has **no** create-lead route; Conversation+Form shared draft session does not exist; Actions still open the modal via `adminv2:open-create-lead`; `CommandSurfaceShell` / `useCommandSurfaceController` are **built but unwired** in production UI; `bosProposalSupport` flags contradict across registries. |
| When is a Processing Case created? | **At registered execute** (today and V1) — not when conversation starts. Conversation prepares the same payload; execute opens/reuses the case. |
| Is every BOS command a Processing Case? | **No.** Only intake/identity commands (Create Lead today). Other commands stay on direct registered execute / assist proposal paths. |
| V1 scope? | Complete Create Lead Conversation + Form convergence in BOS + generic command-session foundation. Slash menu and daily briefing are **foundation stubs only**. |
| Runtime target? | **Operational Command Runtime** (`POST /api/admin/actions/execute`). Not the unfinished Mutation/Execution Runtime in `business-process-execution-platform.md`. |

## Package index

| # | Document | Purpose |
|---|---|---|
| 1 | [README](./README.md) (this file) | Executive brief |
| 2 | [01-current-state-trace](./01-current-state-trace.md) | Code-grounded present reality |
| 3 | [02-target-operator-experience](./02-target-operator-experience.md) | Target UX for H1–H3 |
| 4 | [03-architecture-and-ownership](./03-architecture-and-ownership.md) | Decisions 1–25 + ownership |
| 5 | [04-command-session-and-data-contracts](./04-command-session-and-data-contracts.md) | TypeScript contracts |
| 6 | [05-create-lead-reference-flow](./05-create-lead-reference-flow.md) | Create Lead end-to-end V1 |
| 7 | [06-processing-integration](./06-processing-integration.md) | Processing reuse boundary |
| 8 | [07-conversation-form-ui-spec](./07-conversation-form-ui-spec.md) | Conversation/Form UI |
| 9 | [08-slash-command-extension](./08-slash-command-extension.md) | Horizon 2 design |
| 10 | [09-daily-briefing-future](./09-daily-briefing-future.md) | Horizon 3 design |
| 11 | [10-security-permissions-audit](./10-security-permissions-audit.md) | Trust model |
| 12 | [11-implementation-phases](./11-implementation-phases.md) | Phased build |
| 13 | [12-implementation-work-packages](./12-implementation-work-packages.md) | Cursor-executable packages |
| 14 | [13-acceptance-scenarios](./13-acceptance-scenarios.md) | Acceptance matrix |
| 15 | [14-testing-and-certification](./14-testing-and-certification.md) | Test plan |
| 16 | [15-migration-compatibility-cleanup](./15-migration-compatibility-cleanup.md) | Migration / cleanup |
| 17 | [16-risks-tradeoffs-deferred](./16-risks-tradeoffs-deferred.md) | Risks + deferred |
| 18 | [17-execution-prompt](./17-execution-prompt.md) | Fresh-session implementation prompt |

## Key decisions (compressed)

1. **BOS is a placement over Operational Command Runtime** — never a second executor.
2. **Conversation is a command-input adapter** that writes into a shared `BosCommandDraft`.
3. **Form and Conversation share one draft**, one eligibility model, one preview, one execute path.
4. **Processing Case is created only on registered Create Lead execute** (unchanged authority).
5. **Host = existing BOS rail / `AICommandSurfaceShell`**, expanded into command-session mode — not a new shell.
6. **Reuse** `deriveCreateLeadCommand*`, `executeCreateLeadCommand`, `buildCreateLeadSuccess`, intake parser, Processing identity APIs, and wire the existing unwired Command Surface controller for Form/preview anatomy.
7. **Immediate V1 milestone stops after** Create Lead reference + generic session foundation. H2/H3 are designed, not built.

## Remaining product decisions

**None blocking V1.** Two deferred preferences (reversible, documented in `16`):

- Durable cross-device unfinished drafts (V1 uses tab `sessionStorage`).
- Operator default mode preference Conversation vs Form (V1 defaults Conversation; Form always one click away).

## Recommended implementation starting point

1. Bootstrap managed sprint from this branch’s planning package (or rebase onto fresh `origin/staging`).
2. Start at **WP-01** in [`12-implementation-work-packages.md`](./12-implementation-work-packages.md).
3. Stop after **Phase 5 / WP-12** (Create Lead production-quality reference + placement convergence). Do not implement slash menu or daily briefing beyond stubs.

## Explicit non-goals (this package / V1)

- No new mutation runtime.
- No client service-role writes.
- No second form engine or identity resolver.
- No rebuilding Processing.
- No redesign of BOS visual identity.
- No reopening Presentation Runtime architecture.
- No implementing all registered commands conversationally.
- No autonomous apply / auto-create.
- No push / merge / staging promotion from the planning branch without Kelly’s approval.
