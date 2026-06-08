# Staging Feedback Fix Pass — Deferred Targeted Fixes

Implemented in this pass: **Priority A (ordering)** and **Priority C1 (person status reveal gate)**.
The following are investigated, root-caused, and have precise plans, but were deferred because they
touch interactive/state-machine logic that cannot be safely validated without running the app
(no node_modules in this environment), or require a bundle change beyond "smallest safe".

---

## B — Work-unit pill click: row-action flash (deferred)

**Already good (do not re-fix):** pill selection is optimistic/synchronous (`setActiveWorkUnitId` at
work-unit page ~1194 / ~2287, before any fetch), and the shell + stale rows survive the swap
(`hasLifecycleInPageWorkUnitSwitchFlag` early-return ~1219; `lifecyclePillRetainRows` override ~4302).

**Residual cause:** on a lifecycle sibling swap the row actions are torn down —
`queueRowActionsHydratedRef.current = false; setQueueRowActionsReady(false)` (work-unit page
~2279-2280 and ~1217-1218) — so retained rows briefly render with **no action buttons**
(`rowActionsPending` → `rowQuickActions = []` in QueueBlock ~1221), which reads as "dead".

**Why deferred:** the safe-looking fix (keep `queueRowActionsReady` true, refetch in the background)
means retained rows show the **previous** work unit's actions until the new set lands. Row actions
are per-`work_unit_id`, so a brief window of wrong-context actions is a possible **functional**
regression (clicking an action resolved for a different WU). This must be validated at runtime
(confirm rows+actions swap atomically, or only retain actions when the incoming set matches) before
changing. Smallest safe plan: gate the teardown behind `hasLifecycleInPageWorkUnitSwitchFlag()` AND
ensure `hydrateWorkUnitQueueRowActions` swaps rows+actions together; verify on staging.

Separately, the perceived "delay to records" is dominated by wu-bootstrap (~700-950ms) + queue rows
(~700-1100ms) latency — that is the hard-nav / warm-up problem tracked under the future Dept→Work-Unit
navigation card, not a quick local fix.

---

## C2 — Classic (non-inquiry) opportunity header actions not gated (deferred)

**Cause:** the opportunity reveal gate waits for header actions on the **inquiry** path
(`canRevealHeaderActions`, AdminEntityDrawer ~8069) but the **classic non-inquiry** branch
(~8070-8073) does not, so header quick-actions can pop in after reveal for classic opportunities.

**Plan (small mirror):** extend the classic branch to also require `opportunityRegistryHeaderReady`
(~6942) when `opportunityHeaderActionsExpectRegistry` (~6944), mirroring the inquiry path. Header
actions are server-revalidated + client warm-cached (`peekOpportunityDrawerHeaderActionsCache`), so
repeat opens stay instant.

**Why deferred:** the opportunity reveal path is the most complex state machine in the drawer
(coordinator + presentation gate + a pre-existing 1400ms timeout at ~8099). A gate change there
needs runtime validation to avoid slowing/stalling first opens.

---

## C3 — Operational-tasks / follow-up strip loads after reveal (deferred)

**Cause:** the above-fold operational compact strip (follow-up/tasks) fetches live per-entity task
state post-mount, uncached (`OpportunityOperationalCompactStrip.tsx` ~360-369 →
`taskAssistV11OpportunityApi.ts` ~229), independent of the reveal gate — so it always shows a
skeleton then fills after the drawer is exposed.

**Why NOT gate on it:** it is live, least-cacheable data; blocking reveal on it would slow every open
and risk staleness (violates the doctrine).

**Plan (bundle, not gate):** seed the above-fold summary from the bootstrap's
`operational_tasks_summary` sidecar (`fetchOperationalTasksSummary` → `adminV2SidecarSession`,
`taskAssistV11OpportunityApi.ts` ~66-67), which the bootstrap already touches, so the strip renders
complete at first paint and the live list reconciles **invisibly** below the fold. This is a
component-level bundle change (consume the already-available summary), deferred as it is beyond the
"smallest safe" scope of this pass.

---

## Pre-existing doctrine flags (note, not in scope)

The opportunity drawer has timeout-based fallbacks (presentation gate ~8099 = 1400ms; reveal-coord
timeout ~7887). These pre-date this sprint and conflict with the "no timeouts" doctrine; revisiting
them belongs with C2's reveal-gate work, with runtime validation.
