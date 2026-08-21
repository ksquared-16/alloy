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
| 12 operational workspace resume | shared workspace host | none — behaviour not yet decided | **gap / product decision** |
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
| Operations | 7, 7, 7, 7 | **flat** | **primary dataset, refetched per open** — no warm reuse, but no accumulation |
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
