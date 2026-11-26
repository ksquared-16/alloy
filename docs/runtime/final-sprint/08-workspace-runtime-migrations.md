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
| 4 | **Inbox / Communications** | **~150 fetches** on open + a React max-update-depth loop — TWO loops: (a) a runaway `/inbox/threads?folder=scheduled` fetch loop (~140×), (b) a KPI render loop | (a) Split the scheduled-sends fetch off the churning announcements-sync effect — open **150→19**, scheduled 140→2. (b) Traced the render loop (component stack) to `CommandCenterShell` → `setInboxKpis`: the KPI provider's setters set state unconditionally, so a per-render snapshot push cycled the context identity → effect → setState. Made the setters **idempotent** (return prev reference when unchanged). Open now **0 max-update-depth errors**, content paints warm. | `0a99433b1`, `490ec39c9` |

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

## Cache migration onto the shared primitive — status

**Four caches migrated** onto `createWarmCache` as back-compat facades (consumers unchanged;
browser-certified 0-fetch warm reopen after each swap):

| Cache | Scope mode | Commit |
|---|---|---|
| `processingFormsWarmCache` | singleton | `514b20149` |
| `operationalIntelligenceWarmCache` | keyed (site\|window\|compare) | `514b20149` |
| `processingQueueWarmCache` | singleton | `824062a99` |
| `operationalTasksWorkspaceCache` | keyed (filter) | `824062a99` |

**Three caches deliberately NOT migrated** — they need capabilities the primitive does not have, and
extending it to fit one or two outliers would be exactly the speculative abstraction-stretching the
"emerge from repeated implementations, don't extract prematurely" directive warns against:

| Cache | Why it doesn't fit the single-cache primitive |
|---|---|
| `drawerFamilyWorkspacePrefetchCache` | **Prefix invalidation** (drop all channels/threads for one entity/customer) + **in-flight exposure** (`getDrawerFamilyWorkspaceInflight`) + thread-scoped keys. Also the critical Activity/Inbox comms path — high risk for low benefit. |
| `oipWorkspaceWarmCache` | **Fuzzy site-key fallback** (`getLatestOipWarmSnapshotForSite` reuses the freshest entry for a site when the exact key set differs) + metric-key-set merging. Not a plain keyed cache. |
| `communicationsWorkspaceWarmCache` | A **multi-dataset orchestrator** (templates + announcements + bindings + status-options + …), not a single keyed cache. |

The primitive cleanly captured the SIMPLE keyed/singleton warm-cache shape that four surfaces
independently grew. The three above are legitimately different shapes; folding them in would grow the
primitive to fit them rather than letting it stay the thing the migrations actually converged on.

## Remaining

- **Inbox full warm-first:** both loops are fixed and the workspace paints warm, but it still
  revalidates ~18 comms sources on open. These are orchestrated by `communicationsWorkspaceWarmCache`
  (the multi-dataset cache that doesn't fit the single-cache primitive); routing each comms consumer
  through it warm-first + widening the nav-intent warm would make the Inbox fully no-fetch on a warm
  reopen. Content already paints warm, so this is a background-revalidation reduction, not a visible-load
  fix.
- **The deeper lifecycle:** these surfaces now share the warm-first data lifecycle, but are not yet
  K1→K2→K3 commit consumers (they remain `openWorkspaceModal` modals). Promoting the modal open to a
  runtime commit is the remaining architectural step, now that the data lifecycle is unified.
