---
owner: platform
status: final-sprint-report
last_reviewed: 2026-07-19
report: Operational Workspace Runtime Migrations
---

# Operational Workspace Runtime Migrations

Converting the operational workspaces to the Runtime lifecycle, one at a time, per the directed order
(Processing → Work Items → Operational Intelligence → Inbox/Communications). No abstraction was built
up front; the shared implementation was extracted only after the migrations converged. Every migration
was browser-certified before the next.

The operator-facing Runtime property proven per surface: **the surface never loads on open** — the
exact entries it reads are warmed in the background on nav intent (hover/focus), served warm-first, and
deduped to one request per scope.

## Migrations (all browser-certified)

| # | Surface | Before | After | Commit |
|---|---|---|---|---|
| — | **Activity** (Focus Panel) | Communications showed "Loading conversation…" on switch (prewarm warmed the wrong cache) | Prewarms the V2 workspace **and the first thread's messages**; opens warm, no load, no remount | `b5206c361` |
| 1 | **Processing** | `/forms` ×4 storm + pop-in on open (no shared forms cache) | `processingFormsWarmCache` (deduped, warm-first); warmed on nav intent with the queue. Cold 4→1; warm reopen **0 fetches**, content instant | `86f396b0b` |
| 2 | **Work Items** | `/operational-tasks` ×6 (open×3, completed×3 — three consumers each fetched raw) | `loadWorkspaceOperationalTasks` (deduped, warm-first); all three consumers + nav intent share one request per filter. Cold 6→2; warm reopen **0 fetches**, content instant | `e5f072af0` |
| 3 | **Operational Intelligence** | 5 fetches + a pulsing skeleton every open; `metrics/trends` fetched but **discarded** | Dead trends fetch removed; `operationalIntelligenceWarmCache` (warm-first) for the OI model. Cold 5→2; warm reopen **no skeleton**, intelligence **0 fetch** | `65e235702` |
| 4 | **Inbox / Communications** | **~150 fetches** on open — a runaway `/inbox/threads?folder=scheduled` loop (~140×) + React max-update-depth | Split the scheduled-sends fetch off the churning announcements-sync effect. Open **150→19**, scheduled 140→2, no loop | `0a99433b1` |

## The extracted shared implementation

After the four migrations, the SAME shape had been reimplemented five times (Processing queue,
Processing forms, Work Items tasks, OI, family-communication workspace):

- a scope-keyed module cache `{ data, fetchedAt, error }`,
- one in-flight request per key (concurrent consumers dedupe),
- stale-while-revalidate freshness,
- a snapshot getter + a subscribe seam,
- `warm({ force })` armed on nav intent,
- a warm-first accessor.

Extracted once into `lib/runtime/warmCache.ts` (`createWarmCache`) — singleton caches pass a constant
`keyOf`; keyed caches derive the key from params. Commit `514b20149` migrates the two caches created
this session onto it (`processingFormsWarmCache`, `operationalIntelligenceWarmCache`) as thin
back-compat facades — consumers unchanged, behavior identical (0 fetches on warm reopen after the swap).

## Remaining (mechanical follow-on)

- **Migrate the remaining bespoke caches onto `createWarmCache`:** `processingQueueWarmCache`,
  `operationalTasksWorkspaceCache`, `oipWorkspaceWarmCache`, `drawerFamilyWorkspacePrefetchCache`,
  `communicationsWorkspaceWarmCache`. Each is a facade swap like the two already done; low risk, no
  behavior change. This is the final purification "one shared implementation" step.
- **Inbox full warm-first:** the runaway loop is fixed, but the Inbox still refetches ~24 comms sources
  on reopen (templates, announcements, categories, locations, status-options, bindings, threads). These
  can be routed through `createWarmCache` + warmed on nav intent for a fully no-load Inbox.
- **The deeper lifecycle:** these surfaces now share the warm-first lifecycle, but are not yet
  K1→K2→K3 commit consumers (they remain `openWorkspaceModal` modals). Promoting the modal open to a
  runtime commit is the remaining architectural step, now that the data lifecycle is unified.
