---
owner: platform
status: certified
last_reviewed: 2026-08-21
supersedes: []
---

# Operator Runtime Performance Certification

**Canonical performance doctrine for the Alloy operator runtime.** Extends — never reopens —
[`runtime-constitution-v1.md`](../../runtime/runtime-constitution-v1.md), which already names the one
anticipatory runtime (`workUnitProvisioningPrefetch`, keyed by canonical `DestinationId`). This
document states what that runtime must *achieve*, how it is measured, and which invariants may not be
casually redefined.

> Not the owner of readiness design: `workspace-operational-preparation-runtime.md` is a **superseded
> exploration** and does not describe current code. Do not extend it.

---

## 1. Two performance classes — never conflate them

| class | measured | operator relevance |
|---|---|---|
| **TRUE COLD / DIRECT ENTRY** | ~11.7 s to first usable | diagnostic + resilience. No operator takes this path. |
| **PREPARED CANONICAL JOURNEY** | **~0.4 s** to a complete surface | the operating experience |

A direct-URL cold number must never be quoted as the operator experience. The cold cell bypasses
Workspace readiness *and* the in-place K1 entry gesture; it measures a route the product does not use.

## 2. Certified production measurements

Production build, hosted Supabase, host qualified before and after each cell.

| interaction | measured | note |
|---|---|---|
| Workspace → Work Unit, no preparation | 6,693–8,482 ms | control |
| **Workspace → Work Unit, prepared** | **393–412 ms** | complete: 15 rows, 5 truthful cards, correct header |
| Work View switch | **265–347 ms** | pill/queue/identity/cards commit together |
| Queue row → identity | **120–233 ms** | |
| Queue row → child Mission, prepared | **209–233 ms** | 6,818–7,739 ms before the reveal-gate fix |
| Queue row → child Mission, unprepared | ~6.5 s | genuinely cold row |
| Focus Panel mode switch (Activity) | **18–33 ms** | height constant, context preserved |
| Activity timeline usable, cold / warm | 2,110 ms / **33 ms** | |
| Operational workspace shell | **54–101 ms** | Processing · Work Items · Operations · Inbox |
| Edit → control | 13–94 ms | |
| Dropdown → options | **25–30 ms warm**, 0 network | |
| Save acknowledgement / convergence | **77–84 ms** | UI converges before the server responds |
| Save server completion | 3,100–3,238 ms | open item |
| Organization warm navigation | TTFB ~380 ms, FCP ~410 ms | |
| CLS, prepared path | **0** | direct path 0.183, 97% one late overlay |

## 3. Readiness strategy (certified)

```
Workspace renders
  → canonical Work Unit / Work View destinations known
  → bounded idle preparation through the SAME resource owner the click consumes
  → operator clicks
  → K2 consumes the warm result
  → Work Unit commits complete
```

**Lead time, not request count, is the scarce resource.** A provisioning answer needs ~5–6 s warm.
Hover (~2.5 s of lead) marks a destination "prepared" and still yields ~4 s, because the answer is
*in flight*, not warm. Only idle-settled preparation delivers ~0.4 s.

**The bounded set is coverage, not waste.** Multiple prepared destinations independently land
sub-400 ms; narrowing to the active/default view alone restores multi-second latency on every other
destination. Current cost: ~58 subject-related requests per session (from ~24). Do not trade the
~200 ms interaction to make that number prettier.

## 4. Runtime laws (frozen)

Future work may **consume and extend** these. Redefining one requires explicit architectural
justification, regression updates, and re-certification.

1. **Intent acknowledgement** — operator intent commits immediately; never blocked on secondary network work.
2. **Attention vs Settlement** — Record of Attention may change while Settlement stays stable. A child-to-child switch inside one family must not tear down the family Settlement runtime.
3. **Subject identity** — if canonical identity is already known from Queue context, commit it immediately; do not wait for provisioning to rediscover it.
4. **Child Mission reveal** — child identity commits immediately; stable family cards may remain; the prior child's Current Work must never appear as current; that one card reserves until authoritative Mission arrives; a prepared Mission may commit at once.
5. **Latest intent wins** — stale async work never replaces newer operator intent.
6. **Primary reveal lifecycle** — the gate may never remain permanently armed. Every begin needs a valid end under the lifecycle that actually owns the reveal. Family runtime reuse must not suppress child-subject preparation.
7. **Readiness** — same canonical owner as demand loading. No second preload API, no duplicate truth. Bounded, deduped, freshness-owned, subordinate to foreground intent.
8. **Workspace → Work Unit readiness** — prepared entry consumes the same K2 resources the click would.
9. **Work View readiness** — no second Work View preloader; Workspace readiness already prepares those destinations.
10. **Queue subject readiness** — follows LIVE attention, not a settlement anchor shared by every child row.
11. **Card / command destination grammar** — shared destination ownership; known context commits before non-critical enrichment.
12. **Operational workspace runtime** — shared launch, readiness, loading, resume and close/reopen grammar.
13. **Focus Panel modes** — Summary and Activity are modes of one runtime; switching preserves subject/context and obeys the latest-intent and reveal laws.
14. **Field controls** — open locally when options are known; no network to activate a control.
15. **Save** — visible acknowledgement immediate; optimistic convergence reconciles with authoritative persistence; no false success.
16. **Motion** — preserves continuity; stable geometry over animation that masks layout churn.
17. **StrictMode measurement** — development double-invocation is not production duplicate-fetch evidence.
18. **Performance measurement** — separate T0 intent / T1 acknowledgement / T2 destination / T3 primary usable / T4 hydrated. T4 alone is not a UX metric.
19. **Two performance classes** — see §1.
20. **Floating surfaces may never cover primary navigation.** A parked or floating surface may be positioned by score, but regions carrying a surface's primary navigation are forbidden territory, not a low score. Scoring alone cannot express "never here": on a dense surface every candidate overlaps something and the least-bad winner can still swallow a control.
21. **An operational workspace's dataset survives its own modal unmount.** The shared modal host unmounts children on close for every workspace alike, so anything owned in `useState`/`useRef` dies with the close and the workspace reloads cold on reopen. Data lifecycle belongs to a module-scoped warm owner (`lib/runtime/warmCache.ts`), never to the component tree. A `useRef` cache is not a cache — it has exactly the component's lifetime.
22. **A workspace reopens to its last stable internal position, and never to transient state.** Stable navigation (section, mode, view, lens, filter, lane) is remembered; an editor, dialog, popover, half-completed form, selected record or command destination is not. The exclusion is STRUCTURAL: a position is a flat `Record<string, string>` of navigation identity, so transient state has no representation and cannot be committed by mistake. A remembered position is a hint, never an authority — anything that fails its workspace's validity guard falls back to the default rather than opening broken.
23. **Reuse is only safe with an invalidation seam.** A TTL alone is not freshness. Every cached projection a command can change must be dropped by that command, at every layer that holds it. Caching a mutable projection without its seam is how a green toast leaves a stale board on screen.
24. **Readiness follows resume.** Preparing the default destination for a workspace that reopens somewhere else prepares the wrong thing. Readiness reads the remembered position, and arms on nav intent (hover/focus) — warming inside the modal's own open effect runs at the same instant the workspace mounts and cannot shorten a serial chain.

## 5. Invariant → guard matrix

| Law | Canonical owner | Guard | Status |
|---|---|---|---|
| 4 child Mission reveal | `overlayChildMissionOntoSettledFocusModel` | `tests/focusPanel/childMissionRevealContract.test.ts` (6 cases, siblings at different stages) | **guarded** |
| 6 reveal lifecycle | `drawerVmPrewarmScheduler` + `useCommittedWorkUnitSurfaceRuntime` | `tests/runtime/revealLifecycleAndReadinessInvariants.test.ts` | **guarded** (positive-controlled) |
| 7 readiness = canonical URL | `workUnitProvisioningPrefetch` | same file + `tests/runtime/workUnitProvisioningPrefetch.test.ts` | **guarded** |
| 8 Workspace readiness set | `useWorkspaceSurfaceRuntime` | same file (includes Work View hrefs; bounded cap) | **guarded** |
| 10 attention-relative window | `useCommittedWorkUnitSurfaceRuntime` | same file | **guarded** |
| 5 latest intent wins | Focus Panel runtime | browser-verified only (A→B→A→B at 40–60 ms) | **gap** |
| 15 Save persistence / no false success | child-scoped mutation owner | browser-verified round trip only | **gap** |
| 12 operational workspace resume | `lib/runtime/workspaceResume.ts` | `tests/runtime/workspaceResumeContract.test.ts` (14) + `scripts/pe3WorkspaceResumeCert.mjs` (A/B/C × 3 workspaces) | **guarded** |
| 21 workspace data lifecycle | `lib/runtime/warmCache.ts` + `lib/scheduling/operationsWorkspaceWarmCache.ts` | `tests/runtime/operationsWorkspaceWarmLifecycle.test.ts` (9) | **guarded** |
| 23 invalidation seam | per-workspace warm owner | `operationsWorkspaceWarmLifecycle.test.ts` (mutation drops day, not configuration) | **guarded** |
| 24 readiness follows resume | `warmOperationsWorkspace` + `SidebarOperationsNavItem` | browser-measured (request chain) | **partial — no deterministic guard** |
| 13 Activity subject switching | Focus Panel runtime | browser-verified only | **gap** |
| 20 floating surfaces vs navigation | `chooseBosParkingGeometry` + `BosPresentationControllerContext` | browser-verified (real pointer clicks on both tabs) | **gap — no deterministic guard yet** |
| 1, 11, 14, 16 | various | measured, not guarded | **gap** |

## 6. Measurement methodology and pitfalls

Every one of these produced a **plausible but false** result during this program.

- **Dev-only instrumentation.** `perfDevDetailEnabled()` is `NODE_ENV !== "production"`; the scheduler's `log()` emits nothing in the build being measured. Production diagnosis needs production-visible diagnostics.
- **A no-op save measured as a real one.** Setting `el.value` + dispatching `input` does not reach a React controlled input: the field commits unchanged, the run reports a clean 200 with credible timings. Type real keystrokes; always prove the persisted value after reload.
- **Ancestor-text field binding.** Matching an Edit control by ancestor text selects a container holding several fields — the mutation went to a person-scoped endpoint instead of the child's. Bind by deterministic field identity/document order.
- **Inverted readiness signal / dead selector.** `data-focus-panel-cell-reserved` means *placeholder holding space*, and `…-preparing` carries a typeKey, never `"true"` — the original harness stamped "all cells reserved" exactly when nothing was usable.
- **Settlement anchor mistaken for subject identity.** `data-inline-focus-panel-subject` is a settlement anchor and does not follow the selected row; reading it as identity made a working surface look broken for 11 s.
- **Direct URL vs canonical journey.** See §1.
- **Host gate anti-correlated with load.** Under 8 pinned cores the control request got *faster* (idle parks cores and drops clocks). Admissibility rests on counted criteria plus cell dispersion, never on a lone latency proxy.
- **StrictMode ×2.** Verify any duplicate-fetch claim against production.
- **Guards must be positive-controlled.** A gate or test never demonstrated to fail is not a gate.

## 7. Open items

**Owned elsewhere**
- `adminv2-bos-rail-overlay` still moves horizontally at ~21–24 s, which is ~97% of direct-path CLS (0.1795). Its parked position genuinely overlaps page controls, so it re-parks to escape them — the algorithm working as designed. A conditional "do not re-park when unobstructed" was measured and produced no change; eliminating the shift is a decision about where the floating rail should live. **Rail owner.** (The pointer-interception half is FIXED — see law 20.)

**Runtime debt**
- Save server completion ~3.2 s (client UX already premium).
- Operational workspace **shell** launch is uniform and premium (54–101 ms, constant height, clean Escape). The **data** lifecycle is classified below (§8) — two earlier readings of it were wrong and are corrected there.
- Activity cold timeline 2.1 s; 11 requests on subject switch while Activity is open.
- `QueueRowModel.entityType` is typed `"opportunity" | "job" | "schedule"` while the provisioning answer emits `"child"` — type/runtime divergence.
- Queue rows 404 on `/view-models/drawer/opportunity/<row id>`: ~1.4 s of wasted server work per row click.
- `/organization/processes`: 89% of 2,853 KB is one `entity-layouts` response; `stage-bootstrap` 6.4 s. Both secondary to paint — operator gating not yet certified.
- Validation broker pins `--max-old-space-size=4096` for typecheck while the package script uses 8192; typecheck OOMs.

**Not yet certified**
- `/organization` operator interaction (Part 5), card/command destination readiness (Part 3), operational workspace resume semantics (product decision).


---

## 8. Operational workspace data lifecycle — classified

Measured over four open/close cycles on a production build, keeping full URLs. **Shape, not a single
count, is the diagnostic:** flat means a loader, rising means an accumulating effect.

| workspace | requests per open | shape | classification |
|---|---|---|---|
| Processing | 3, 0, 0, 2 | warm + occasional refresh | **healthy** — warm reuse with explicit freshness |
| Work Items | 4, 0, 0, 0 | warm after first | **healthy** |
| Operations | 7, 7, 7, 7 → **8, 0, 0, 6** | flat → warm | **FIXED** — adopted the shared warm primitive (§9) |
| Inbox / Communications | 20, 22, 23, 22 | **plateau** | **genuine duplicate loader** — see below |

### Two corrections to earlier reporting

1. **Operations' "scheduling ×5 / roster ×2" are not duplicates.** With query strings retained they
   are seven DISTINCT queries — `view=sites`, `view=roster`, `view=assignment_roster`, two `week_of`
   values, two roster dates. **Legitimate distinct queries.** Stripping the query string is what made
   them look like waste.
2. **Communications is not an accumulating leak.** It plateaus at ~22; `templates` steps 4 → 6 once
   and stays. Earlier described as "growing", which the four-cycle shape disproves.

### Communications: duplicate loader ownership — HANDOFF

Per open, five reference URLs are each fetched **twice, ~6.4 s apart**:
`templates`, `templates?status=active`, `announcements`, `status-options?grain=family`,
`status-options?grain=child`.

`lib/communications/v2/communicationsWorkspaceWarmCache.ts` already provides a unified warm cache
with a 90 s TTL and in-flight dedup, and `InboxModal` warms it at open (the +0 ms burst). But
`app/adminV2/communications/TemplatesWorkspace.tsx` and `AnnouncementsWorkspace.tsx` **import that
cache and also declare their own `TEMPLATES_API` / `ANNOUNCEMENTS_API` / `STATUS_OPTIONS_API`
constants and fetch them directly** — the +6.4 s burst is the workspace components re-fetching
through a second loader they own.

**A bundle-scoping fix was hypothesised, implemented, measured, and DISPROVED** (routing the cache
through `globalThis` changed nothing) — recorded so the wrong explanation is not retried. The cause
is duplicate loader ownership, one of this program's named deprecation classes.

**Owner: Communications.** Not fixed here to avoid colliding with that lane. The remedy is to route
those components through the existing warm cache they already import.


---

## 9. Operations warm data lifecycle — fixed

Operations was the one operational workspace that reloaded its entire dataset on every open. The gap
was **never the shared host**: `AdminV2WorkspaceBosModalShell` unmounts children on close for every
workspace alike. Processing survives that unmount because its data lives in module-scoped warm
caches; Operations' lived in `useState`/`useRef` inside `RosterWorkspace`. Its loaders were
component-scoped rather than workspace-runtime-scoped — it even had a `weekCache` already, as a
`useRef`, i.e. with exactly the component's lifetime.

**Remedy:** adopt the existing platform primitive `lib/runtime/warmCache.ts` — the same one
Processing, Work Items and Operational Intelligence already read through. Not an Operations-only
parallel cache. Two caches, because Operations has two freshness classes:

| class | TTL | reads | why |
|---|---|---|---|
| REFERENCE | 5 min | `view=sites`, `view=assignment_types`, `records/bootstrap` | configuration the day is *described in*; authored in Studio, changed rarely |
| DAY | 30 s | `view=roster…`, `view=assignment_roster…`, `/api/admin/roster…` | the commitments themselves; this is what an operator watches and what mutates |

**Freshness is not only a TTL.** `invalidateOperationsDay()` is the seam `reloadAssignments` and the
attendance command use, so a changed commitment re-reads immediately instead of waiting out 30 s.
Both layers drop — the in-session ref and the cross-open cache. A non-2xx is never cached as data.

### Measured (production build, four open/close cycles, full URLs retained)

| | requests per open | day on screen |
|---|---|---|
| before | 7, 7, 7, 7 | 2,845 ms |
| after (scheduling views only) | 8, 2, 2, 6 | 3,273 → ~21 ms |
| **after (both roster surfaces)** | **8, 0, 0, 6** | **2,845 → 30 ms** |

Cycle 4 refreshing 6 is the freshness contract working, not a regression: the day class expired, the
configuration class did not. **A second loader is invisible to a path-keyed harness** — the first cut
left `/api/admin/roster` fetching on every open because `DailyRoster` and `AttendanceWorkspace` own
their own reads of the same day.

> **Measurement note.** `pe3WorkspaceDataLifecycle.mjs` keys requests by PATH ONLY
> (`.split("?")[0]`), which made Operations' seven DISTINCT queries look like duplicates of two.
> `pe3OperationsWarmAB.mjs` keys by FULL URL, which is what makes "reused" and "refetched"
> distinguishable at all.

---

## 10. Workspace resume — certified

**Product decision:** an operational workspace reopens to its LAST STABLE INTERNAL POSITION.

Implemented ONCE at `lib/runtime/workspaceResume.ts`, not as three parallel resume stores. A
workspace *declares* its position and its validity guard (`operationsResume.ts`,
`processingResume.ts`, `workItemsResume.ts`); a future workspace inherits resume by declaring, not by
reimplementing. Writes MERGE, so a workspace with two owners (Work Items keeps its view in the modal
and its queue scope in the panel) does not have them erase each other.

Storage is `sessionStorage`, holding navigation identity only — never a business-record payload.
Restoring *where* the operator was must never become a stale second copy of *what* they were seeing.

**Processing deliberately cannot resume its case-detail view.** `DigitalMailroomWorkView` is
`"overview" | "work"`, and `"work"` only means anything with a selected case — which is transient and
not persisted. A remembered `"work"` is therefore invalid by construction and falls back to the
default, so Processing never reopens onto an empty case detail.

This **overrides** RosterWorkspace's previous deliberate "always default to Work" choice, which
argued Studio should not be remembered. Under the resume decision, returning someone to the day when
they deliberately left themselves in configuration is what loses their place.

### Certification — `scripts/pe3WorkspaceResumeCert.mjs`

| workspace | A: non-default section restored | B: section kept, transient absent | C: return to default restored | T2 shell |
|---|---|---|---|---|
| Processing | PASS (Studio/Forms) | PASS | PASS | 11–21 ms |
| Work Items | PASS (Queue) | PASS (1 transient open → 0) | PASS | 16–24 ms |
| Operations | PASS (Children) | PASS | PASS | 5–17 ms |

Shell commits in **5–24 ms** against the <200 ms target, on all three, in every scenario.

> **This harness twice produced a vacuous pass and was hardened both times.** A single `Escape`
> dismisses an open popover and leaves the workspace standing, so the next "reopen" measured an
> already-open modal: 0 ms shell, no acknowledgement, and every assertion after it true for the wrong
> reason. The close is now verified and an unclosed workspace throws. Separately, comparing active-tab
> LABEL TEXT failed spuriously because cohort tabs embed live counts (`"All Children15"`); the
> assertion compares section identity instead.

### Open — resumed primary content is not uniformly warm

Every resumed destination commits in 14–28 ms **except Operations → Children, at ~4.1 s.** Decomposed
against the live request chain:

```
click +22 ms    req  /api/admin/records/bootstrap
     +750 ms    res  200                                (728 ms, serial)
     +762 ms    req  /api/admin/records/children?cohort=all&offset=0
    +4415 ms    res  200                                (3,653 ms — the endpoint itself)
```

Two separate problems. The 728 ms bootstrap is now removed from the serial chain by arming readiness
on **nav intent** (hover/focus on the sidebar item) rather than inside the modal's open effect, which
fires at the same instant the workspace mounts and can never shorten a serial chain.

The remaining **3,653 ms is `/api/admin/records/children` itself** — a server-side critical path, not
a caching problem, and not fixable by warming. **Owner: Records.** It is the largest single number
left in the operator runtime and deserves its own decomposition; the route runs a serial
`requireAdminOrOps → getAdminContextCached → getAdminAccessContextCached → resolveSearchAccessEnvelope
→ queryChildCohortPage` prologue before a bulk `Promise.all`.
