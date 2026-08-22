---
owner: platform
status: canonical
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
| Focus Panel Activity content, settled / early-switch | **315–327 ms** / 1,905–3,998 ms | see §12 — early-switch cost is Communications contention, NOT a missing prefetch |
| Operational workspace shell | **54–101 ms** | Processing · Work Items · Operations · Inbox |
| **Operational workspace shell, resumed** | **5–24 ms** | see §10 — 9/9 scenarios across three workspaces |
| **Focus Panel card destination** | **31–155 ms** | see §13 — controls present at commit |
| **Focus Panel command destination** | **28–80 ms** | see §13 — Tour and Billing commit with 0 requests |
| **Operations workspace reopen** | **0 requests** in the freshness window | see §9 — was 7 every open |
| Edit → control | 13–94 ms | |
| Dropdown → options | **25–30 ms warm**, 0 network | |
| Save acknowledgement / convergence | **77–84 ms** | UI converges before the server responds |
| **Save server authoritative completion** | **1,736–1,759 ms** | was 3,376 ms — see §14. Post-write readback removed |
| **`/organization` warm navigation** | **17–63 ms** to destination commit | see §15. First cold entry to a route family 1,486–2,594 ms |
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
25. **The latest operator intent wins.** Two loads in flight, responses unordered: an older response may never overwrite a newer one. One gate per load — two loads sharing one gate cancel each other, which shows up as a green toast over a stale projection.
26. **NO UNEXPLAINED PAGE REFRESH. Convergence is normal; refresh is exceptional.** A canonical mutation updates the SMALLEST affected authoritative projection through canonical invalidation owners. It never reloads the document, and it never re-renders a whole route to show a row that changed. A refresh is legitimate only for an auth transition (sign-out, idle logout, login), which is a navigation, not a data-freshness mechanism. Corollary: the same command must have the same blast radius from every surface that offers it — a command that converges from one surface and refreshes from another is a defect even when both "work".
27. **A broadcast only converges COUNTS if its action key is registered as membership-changing.** Otherwise listeners patch the rows they can see and never refetch the ones they cannot, so totals stay stale while the visible row looks correct. Replacing a reload with a broadcast is only safe once the key is registered.
28. **A signal converges only what something SUBSCRIBES to.** Registering the action key (law 27) is necessary and not sufficient. `placement_manual_order` is registered membership-changing, the broadcast fires, KPIs and the record VM converge — and the queue rows do not, because the Work Unit surface listens to nothing: `shouldRefetchWorkUnitQueueRowsForEvent` / `shouldRefreshQueueSummariesForEvent` / `shouldPatchWorkUnitQueueRowsForEvent` are exported, documented and unit-tested with **zero production callers**. Before a reload is replaced by a signal, name the subscriber that will do the work the reload did. Corollary: a source-text guard must name a file that exists — the guard for this contract reads a route path deleted in a route move, so it protected nothing.
29. **A record patch converges the card that owns the record, never the projections that copy its facts.** `dispatchOpportunityDrawerRecordPatch` updates the Focus Panel's record, so a child rename updates the Children card while the Assignments card on the same panel and the queue rows behind it keep the old name — two names for one child on one screen. A fact displayed outside its record's own card needs the queue signal as well, and "until the user refreshes the browser" is not an acceptable contract for it.
30. **MOUNTED PROJECTION CONVERGENCE.** When canonical truth changes, every currently-mounted projection that displays that truth must either reconcile directly from the authoritative mutation result, or receive a canonical targeted invalidation/event. It may not remain stale until a browser refresh. This does NOT oblige unmounted surfaces to update in realtime — but an unmounted consumer still needs a stated freshness contract for its next use (a cache its mutation invalidates, or a re-read on open). "Until the operator reloads" is not a contract.
31. **A membership or counted-fact mutation must invalidate BOTH the row/list projection AND every mounted derived count it governs.** They are separate projections with separate owners and must be decided independently — refreshing rows does not refresh totals, and refreshing totals does not refresh rows. The action key must be registered explicitly; never assume "a broadcast went out" means counts moved. Corollary to law 28: the surface that owns the rows and the surface that owns the counts must each have a subscriber, and on a Work Unit route the Workspace's own nonce is not one — it is only mounted on `/workspace`.
32. **An instrument that cannot observe a mechanism reports its absence.** A probe that taps `window.dispatchEvent` cannot see an in-module pub/sub bus, and duly recorded a working configuration invalidation as "no signal is emitted at all". Before a missing-signal finding is believed, prove the instrument can see a signal of that KIND — the same positive-control discipline guards already owe (§6).
33. **A publication-versioned object is not a reversible probe target.** Restoring its value APPENDS a revision; it does not remove the one you wrote. A Program renamed and restored during certification left the live label exactly correct and two revisions named `Toddler RCPROBE` in its history, permanently. So the reversible-probe contract has two halves: verify EVERY projection the mutation touched (not the surface you edited — a prior probe restored a child's name in its own card and left the placement projection wrong to this day), and refuse versioned configuration as a probe target up front, because no restore can make it clean.
34. **ONE CANONICAL HUMAN IDENTITY OWNER (implemented).** For a person-backed child, `persons` owns intrinsic human identity; `customer_members` is the identity fallback only while no Person exists. A participation/member record may carry scoped or compatibility data, but may never become a second independently writable live identity authority. The write already targeted `persons`; what made the member a rival authority was that every READ resolved from it — not by choosing it, but because the person was never loaded. `resolveInquiryChildIdentityFields` was person-first from the start and returns the member mirror when the person is absent, so two separate performance decisions — a persons map built empty, and member-linked persons deferred to a later hydrate pass — silently changed ownership rather than deferring a value. **A name is first-paint content; there is no later in which to render it.** Corollary, and the reason this was invisible for weeks: when every surface reads the same wrong mirror they all agree, so cross-surface consistency is not evidence of correctness — only agreement with the WRITE target is. Guarded by `tests/runtime/childIdentityOwnerContract.test.ts` (10), positive-controlled.
35. **PLACEMENT CANDIDATE UNIQUENESS.** One semantic candidate key may have only one active canonical candidate. The subject is (org, opportunity, customer_member); a cohort change MOVES that candidate and never mints a rival. A deterministic key is not automatically a STABLE one: `pc_v1_pi:{opp}:{member}:{cohort}` embeds a mutable classification, so every creation path deduping on it alone inserted a second active candidate the moment a cohort key was normalised. Moving rather than re-creating is load-bearing beyond tidiness — `wait_since` and any operator override are keyed to the candidate id, so re-creation silently resets a child's queue time and orphans their pin. Guarded by `tests/runtime/placementCandidateUniquenessContract.test.ts` (7), positive-controlled.
36. **OPERATOR OVERRIDE HONESTY.** An active operator override the UI exposes must affect canonical runtime behaviour, or the UI must not claim it does. Proven violated for waitlist pins: the override→sort-tuple machinery exists, but the child-grain projection carries no `active_override_kinds`, so the ranking never sees it and the precedence note written to explain a pinned row cannot render either. The operator gets neither the effect nor the explanation.
37. **DATABASE COUNTING.** An aggregate count must not be derived from a bounded result page when the true universe can exceed that bound. `summarizeOperationalTaskCounts` measured a `limit: 200` list, so `open` silently saturated at 200 and `overdue`/`due_soon` counted only what fitted on that page. A badge is a denominator claim; it has to be counted, not sampled.
38. **A REPAIR WITH A CONTESTED SURVIVOR RULE MAY NOT RUN IMPLICITLY.** Data repair belongs in an explicit, reviewable, run-once path — never as a side effect of a read. A duplicate repair wired into the Work View read path chose its survivor by the cohort the ENSURE pass derives, while the projection resolves a different normalised cohort; the two disagreed about which candidate was live, so each page load flipped the survivor back and forth on real tenant data. Prevention may be always-on precisely because it cannot oscillate — it only moves a candidate the child already has. Corollary: a repair that can act must also be able to UNDO its own action, or a wrong survivor rule becomes permanent the first time it runs.
39. **ONE RESOLVER IS NECESSARY, NOT SUFFICIENT — THE INPUTS MUST MATCH TOO.** Two call sites sharing a resolver still disagree when they feed it different facts. The waitlist projection resolves a cohort from the candidate's stored key/label plus OCM context; the ensure path has only process-instance facts, so the same owner returned `infant_0_18_months` for one and `unknown_program_room` for the other. Corollary, and the expensive half: **a migration that changes an identity key changes it for every row at once**, so any write that migration performs BEYOND identity is a mass mutation by definition — here it rewrote 14 of 17 stored cohorts on a single page load and re-sectioned a live waitlist. A key migration must write the key and nothing else. **Implemented:** the duplicate repair now has no default survivor at all — a caller must name the survivor per subject, and a subject without an explicit decision is reported and skipped. An implicit default IS the contested rule.

## 5. Invariant → guard matrix — SUPERSEDED BY §17

> Kept for history. **§17 is the authority.** Four rows below read "gap" and are now CLOSED: latest
> intent wins, Save persistence / no false success, Activity subject switching, and floating surfaces
> vs navigation. Where the two disagree, §17 is correct.

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
- ~~Save server completion ~3.2 s~~ — **RESOLVED (§14): 3,376 ms → 1,759 ms.**
- Operational workspace **shell** launch is uniform and premium (54–101 ms, constant height, clean Escape). The **data** lifecycle is classified below (§8) — two earlier readings of it were wrong and are corrected there.
- ~~Activity cold timeline 2.1 s~~ — **RECLASSIFIED (§12).** Not a preload gap: the prefetch already
  fires ~14 s ahead. The early-switch cost is contention with the record's own in-flight preparation,
  dominated by the Communications cascade. **External owner.** (11 requests on an in-Activity subject
  switch is still observed.)
- `QueueRowModel.entityType` is typed `"opportunity" | "job" | "schedule"` while the provisioning answer emits `"child"` — type/runtime divergence.
- Queue rows 404 on `/view-models/drawer/opportunity/<row id>`: ~1.4 s of wasted server work per row click.
- ~~`/organization/processes` operator gating not yet certified~~ — **CERTIFIED (§15).** `entity-layouts`
  and `stage-bootstrap` do NOT gate process selection, stage selection, the editor or controls:
  controls are usable at 54 ms while those requests continue to ~3,530 ms. **Classified SECONDARY.**
- Validation broker pins `--max-old-space-size=4096` for typecheck while the package script uses 8192; typecheck OOMs.

**Not yet certified**
- ~~`/organization` operator interaction; card/command destination readiness~~ — **BOTH CERTIFIED**
  (§15 and §13).
- **CLOSED:** operational workspace resume semantics — decided, implemented at a shared owner, and certified (§10).
- **`/api/admin/records/children` at ~3.3-4.5 s** is the largest single number left in the operator runtime. Owner: Records. Not a caching problem — see §10.
- ~~Save server tail (~3.2 s) and Activity cold prepared content (~2.1 s) remain owed~~ — Save
  **RESOLVED (§14)**; Activity **reclassified to an external owner (§12)**. Current budget status is
  §16.
- A speculative drawer-VM prefetch on `/workspace` 404s (`/api/admin/view-models/drawer/opportunity/<id>`), i.e. readiness spending a request on a destination that does not resolve. Bounded and harmless, but it is measurable waste.


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


---

## 11. Performance budgets — SUPERSEDED BY §16

> This table was written mid-programme and is kept only for history. **§16 is the authority**: it
> carries the final numbers, adds the card/command/resume/Organization/Save-completion budgets, and
> pairs every budget with a structural regression guard. Where the two disagree, §16 is correct.

A budget is a REGRESSION GATE, not an aspiration: a number that has been achieved on a production
build and must not be given back. Where a budget is not yet met, it is recorded as **owed** with the
measured value, so the gap is explicit rather than implied by silence.

| surface | metric | budget | measured | status |
|---|---|---|---|---|
| Operational workspace launch | T2 shell | **< 200 ms** | 5–24 ms | **met** |
| Resumed workspace | T2 shell on reopen | **< 200 ms** | 5–24 ms (all three workspaces, A/B/C) | **met** |
| Resumed workspace | T3 resumed primary content, warm | **< 500 ms** | 14–28 ms | **met** |
| Resumed workspace | T3 resumed primary content, Operations → Children | < 500 ms | **3,335 ms** | **owed** — `/api/admin/records/children` (§10) |
| Operational workspace reopen | requests inside the freshness window | **0** | 0 (Operations, Processing, Work Items) | **met** |
| Prepared operator journey | T3 primary usable | **< 600 ms** | 393–412 ms | **met** |
| Work View switch | T3 | **< 500 ms** | 265–347 ms | **met** |
| Queue subject identity | T3 | **< 400 ms** | 120–233 ms | **met** |
| Child Mission switch | T3 | **< 400 ms** | 209–233 ms | **met** |
| Save | T1 acknowledgement | **< 150 ms** | 77–83 ms | **met** |
| Save | T2 server tail | < 1,000 ms | **~3,200 ms** | **owed** |
| Activity | T3 cold prepared content | < 1,000 ms | **~2,100 ms** | **owed** |
| Card destination commit | T2 | < 200 ms | not yet measured | **owed** |
| Command destination commit | T2 | < 200 ms | not yet measured | **owed** |
| `/organization` warm navigation | T2 | < 300 ms | not yet measured | **owed** |
| Prepared path | cumulative layout shift | **0** | 0 | **met** |
| True cold / direct entry | T3 Work Unit | (no budget — see §1) | 11,708 ms | accepted class |

**Budgets are per performance class.** A cold-start number and a prepared-journey number are not
comparable and must never be averaged into one figure; §1 exists because conflating them is how a
premium journey gets reported as a regression, and a cold path gets reported as fine.


---

## 12. Activity cold readiness — investigated, NO CHANGE MADE

**Result: the prepare-the-timeline hypothesis is DISPROVED. No code was changed.** Recorded in full
because the disproof is the useful artifact — the next person to look at "Activity is slow" should
not rebuild a prefetch that already exists and already works.

### What was measured

| transition | result |
|---|---|
| Summary → Activity, mode switch | **15 ms** |
| Summary → Activity, content usable (record just opened) | 1,905–3,998 ms (n=6, high variance) |
| Summary → Activity, content usable (record open ~12 s) | **315–327 ms (n=6, ±6 ms)** |
| subject switch while in Activity | 47 ms |
| Activity → Summary | 183 ms |

### The hypothesis, and how it died

The first A/B looked decisive: issuing `/api/admin/activity?…&limit=100` from the page before the
click took usable from **1,944 ms → 326 ms**, reproducible six times with a ±6 ms spread. The tight
spread is what made it convincing — and what should have been the warning, because a *contention*
effect does not produce ±6 ms.

Three controls killed it:

1. **The app already fetches it.** `prewarmFocusPanelActivityMode` fires ~14 s before the click, and
   NO activity request occurs after the click — the timeline was never on the click path. (It is
   requested **twice**; see waste below.)
2. **Recency was not the variable.** Warming 12 s ahead instead of 1.5 s ahead gave the same ~320 ms.
3. **The decisive control — wait 12 s and fetch NOTHING — also gave 319–324 ms.**

So the variable was never the fetch. It is **settling time**. The 1.5 s wait-only control (1,169 /
2,277 ms) straddled both populations and was too noisy to expose that; only the 12 s wait-only
control separated them.

> **Methodology rule earned here: a control must match the treatment on EVERY dimension, including
> the ones that look incidental.** The treatment carried a delay; the first control carried a
> *different* delay. That single mismatch turned "waiting helps" into "prefetching helps" and would
> have bought a prefetch this codebase already has.

### What Activity slowness actually is

Switching to Activity within the first seconds of opening a record makes the cockpit compete with
that record's own in-flight preparation. The cascade is dominated by the **Communications runtime the
cockpit composes** — `family-workspace` alone spans 2,136 → 6,265 ms, plus three
`threads/*/messages`, `identities`, and `drawer-recipients`.

**Owner: Communications** (see the duplicate-loader handoff). Out of scope for this slot by
instruction, and NOT a readiness problem — the readiness is already there and already correct.

### Waste observed (not fixed)

- `/api/admin/activity?…&limit=100` is requested **twice** per record during prewarm.
- The ribbon renders `RIBBON_EVENT_COUNT = 3` events from a **100-event** payload.
- `takeOpportunityDrawerActivityPrefetch` is consumed only by `OpportunityDrawerVmTabPanes` (the VM
  drawer), not by the inline Activity cockpit — so the prefetched snapshot warms the network and the
  server, but the cockpit does not read the slot.


---

## 13. Card / command readiness — CERTIFIED

The whole Focus Panel interaction family commits through ONE shared seam: `data-fp-depth="active"`
(or a popup for menu-style commands). No card-specific or command-specific fast path was added, and
none was needed.

### Measured (production build, `scripts/pe3CardCommandReadiness.mjs`)

| transition | T1 ack | T2 destination | T3 usable | T4 quiet | requests | verdict |
|---|---|---|---|---|---|---|
| CMD Message | 1 ms | 80 ms | 80 ms | 6,257 ms | 5–9 | **premium commit**, secondary debt |
| CMD Send form | 0 ms | 49 ms | 49 ms | 525 ms | 2 | **premium** |
| CMD Tour | 1 ms | 28 ms | (menu) | 31 ms | **0** | **premium** |
| CARD Children | 1 ms | 31 ms | 31 ms | 488 ms | 2 | **premium** |
| CARD Household | 1 ms | 121–155 ms | 121–156 ms | 638 ms | 1 | **premium** |
| CARD Assignment | 1 ms | 53 ms | 53 ms | 532 ms | 1 | **premium** |
| CARD Billing Preview | 1 ms | 32 ms | 32 ms | 508 ms | **0** | **premium** |

**Every destination commits in 28–155 ms against a <200 ms aspiration, and T3 equals T2 in every
case** — the destination arrives already carrying its controls, rather than committing and then
becoming usable. Tour and Billing Preview commit with **zero requests**: pure prepared state. Return
to base is a uniform ~3.0 s Escape dwell in the harness, not a measured cost.

### Destination requirement classification

| requirement | class |
|---|---|
| focused subject, family settlement, recipient identity | **KNOWN BEFORE INTENT** — present at commit |
| child identity + existing assignment state | **KNOWN BEFORE INTENT** |
| tour context and its action set | **KNOWN BEFORE INTENT** (0 requests) |
| `lifecycle-builder/participant-decisions`, `family-close` | **SAFE TO PREPARE** (fires at ~60–90 ms, does not gate commit) |
| `locations`, `location-program-categories`, `financial-config` | **SECONDARY AFTER COMMIT** |
| message history, thread messages, recipients, identities | **SECONDARY AFTER COMMIT — EXTERNAL OWNER** |
| capacity / slot availability | **SECONDARY AFTER COMMIT** — never gates the destination |

### No cross-child leakage — PROVEN

Asserted on the canonical identity seam (`data-children-focused-member` within
`[data-identity-depth="details"]`), selecting two DIFFERENT children in sequence:

```
child A  PassA Kid  member 1e30034b…  shows self: true
child B  PassB Kid  member c1cd2074…  shows self: true   shows previous child: FALSE
distinct member ids: true            VERDICT: PASS
```

> The first version of this assertion was **vacuous** and was rewritten. It scoped to
> `[data-fp-depth]` — which is the WHOLE Focus Panel, listing every child in the family — so "the
> pane shows child A" was satisfied by the roster and could never have detected leakage. Identity
> assertions must be scoped to the identity seam, not to the surface that contains it.

### Secondary debt — EXTERNAL OWNER (Communications)

`Message` commits in 80 ms but does not go quiet until **6.3 s**: three `threads/*/messages`,
`identities`, `family-workspace` and `drawer-recipients` hydrate afterwards. The composer, recipient
and controls are usable at 80 ms, so this is secondary hydration, not a blocked destination — but it
is the same Communications cascade recorded in §12 and the duplicate-loader handoff. **Not fixed
here by instruction.** One console error accompanies it (a 404 on a speculative drawer-VM prefetch,
also recorded in §7).

### Two harness defects corrected during this work

1. **`el.click()` is the wrong gesture for a menu command.** Menu-style commands open on
   **pointerdown**; a lone synthetic `click` left the Tour menu closed (`aria-expanded` stayed
   `false`, zero new nodes) and made a working command look **broken**. The harness now dispatches a
   full `pointerdown → pointerup → click` sequence. Same family as the synthetic-`mouseenter` error
   in §10.
2. **The reported CLS (0.178–0.528) is a MEASUREMENT ARTIFACT, not a product defect.** Chrome marks
   layout shifts within ~500 ms of real user input as `hadRecentInput` and excludes them; a
   *synthetic* event sets no such flag, so the deliberate 240 ms depth animation
   (`--alloy-os-fp-depth-ms`) is scored as unexpected movement. The Focus Panel grid width is
   **stable at 895 px before and after** the transition — the 863 px seen mid-flight is the
   animation, and it returns. **No layout fix is warranted; do not chase these numbers.**


---

## 14. Save server tail — REDUCED

**The question was: when is authoritative persistence actually complete, and what is the server
waiting for after that?** It is answerable now because the mutation path is span-instrumented
(`x-alloy-patch-spans`), so the tail attributes to a STEP rather than to "the server".

| span | before | after |
|---|---|---|
| auth → write | 1 ms | 2 ms |
| pre-write guards (existence → 404, field definitions → 400) | 896 ms **serial** | **698 ms concurrent** |
| authoritative upsert | 1,036 ms | 1,059 ms |
| **post-write readback** | **1,442 ms** | **0 ms** |
| **total** | **3,376 ms** | **1,759 ms** |

**Authoritative persistence completes at ~1.74 s, and the response now returns immediately after
it.** Previously the server spent a further 1,442 ms — **43% of the response** — re-reading the row
to shape a response BODY. The write is already durable when those reads begin: they carry no
invariant, no audit guarantee and no transaction work. And every caller of this endpoint in the
codebase **discards the body** (it is parsed only to surface `error` on failure), so the operator was
waiting on a projection nobody reads.

### Classification of post-write work

| work | class |
|---|---|
| existence check (produces 404) | **MUST COMPLETE BEFORE SUCCESS RESPONSE** — but may overlap the definition check |
| field-definition check (produces 400) | **MUST COMPLETE BEFORE SUCCESS RESPONSE** — but may overlap the existence check |
| canonical upsert | **MUST COMPLETE** — this is the authoritative write |
| profile-field readback | **REDUNDANT READ / RECOMPOSITION** |
| canonical row readback | **REDUNDANT READ / RECOMPOSITION** |

### Fixed at the shared mutation owner, not with a second endpoint

- `Prefer: return=minimal` — the standard HTTP way for a caller to say it does not want the
  representation. **The default response is unchanged**, so any consumer that wants the row still
  gets it; only callers that opt in skip the readback. Both in-repo callers opt in.
- The two pre-write guards now run **concurrently**. Both are still awaited and both still gate the
  write — the operator simply no longer pays their sum.

**Preserved and verified:** no false success · durable persistence (`persisted=true`) · transaction
correctness · reload agreement · **exact restoration** (`exact_restore=true`, Firefly left as found).
**The acknowledgement UX is untouched:** T1 76–83 ms, local convergence 77–84 ms.

The remaining 1,736 ms is ~700 ms of required guards plus a ~1,030 ms authoritative upsert against a
REMOTE Supabase. That is required work against network-bound round trips, not projection rebuilding.

> A guard caught a genuine behaviour change while making this: with the guards concurrent, the
> definition query now runs even when the member is missing (it used to be short-circuited). Still
> 404, still zero writes — one extra read on the rare failure path, buying ~200 ms on every success.

---

## 15. `/organization` operator certification

Canonical pages only. Legacy Layout Builder, Opportunity Drawer Layout, drawer-era configuration and
diagnostic routes were **not** entered.

| page | T1 ack | T2 committed (warm) | T2 committed (cold) | controls usable | requests |
|---|---|---|---|---|---|
| Surfaces | 5 ms | 33–49 ms | — | 342 ms | 2 |
| Locations | 2 ms | 17 ms | — | 335 ms | 4 |
| Access | 1 ms | 39–54 ms | 1,496 ms | 39 ms | 0–3 |
| Processes | 1 ms | 54 ms | — | 54 ms | 9 |
| Data Model (entities) | 2 ms | — | 1,486–2,594 ms | same as commit | 1 |
| Statuses (`data-model?section=statuses`) | 2 ms | — | 1,454–1,486 ms | same as commit | 0 |
| Surfaces — **warm revisit** | 1 ms | **45 ms** | — | 45 ms | 0 |

**Warm navigation is premium (17–63 ms). First entry to a route family costs ~1.5–2.6 s.** The
timeline is consistent across pages: the RSC payload arrives at 16–311 ms, the route's JS chunk is
requested at ~1,474–2,033 ms, and commit follows it.

**Nav-intent prefetch does NOT close that gap** — A/B with a matched-dwell control:

```
cold   (no lead)        t2 = 1,537 ms
dwell  (2.5s, no hover) t2 = 1,639 ms
hover  (2.5s real hover)t2 = 1,522 ms
```

Hover is indistinguishable from dwell. Classified **TRUE-COLD TECHNICAL DEBT**, not a readiness gap —
and explicitly not "fixed" by a prefetch that measurement shows does nothing.

### Processes — the specific question answered

`entity-layouts` and `stage-bootstrap` **do NOT gate interaction.** Controls are usable at **54 ms**
while those requests continue to ~3,530 ms; the page carries live inputs, and the process editor
opens with its own controls (Stages, Work Views, Commands, Automation, Health, History).
**Classified SECONDARY.** No transfer-size optimisation is warranted, and no duplicate "fast
settings" endpoint was created.

### Organization behaves as ONE runtime

No inconsistent page behaviour survived scrutiny. Every settings route shares one streaming reserve
(`app/adminV2/settings/loading.tsx`), deliberately structure-neutral so entry is an additive content
fill rather than a layout rearrangement.

> **A reported inconsistency was withdrawn.** The harness flagged "Surfaces blanks its main region
> while Access does not" (21 chars vs 701). That is the **shared loading reserve doing its job** — a
> skeleton has no text, so a character-count metric scores a calm, width-stable reserve as a blank.
> Not a defect. A metric that cannot tell a reserve from an empty page will manufacture consistency
> defects that do not exist.

> **Main-thread blocking is NOT measured.** The `longtask` observer returned zero entries on every
> page, including ones taking 1.5 s+ — it has no positive control in this harness, so no claim is
> made from its silence in either direction.


---

## 16. Final performance budget matrix

Every area carries **two** things: a PRODUCTION EXPERIENCE BUDGET (what the operator must feel,
measured on a production build) and a STRUCTURAL REGRESSION GUARD (a deterministic test that fails
when the *mechanism* regresses). The guard is what runs in CI. **No wall-clock assertion is used as a
CI gate** — timing is measured deliberately, on a qualified host, never in a flaky test.

| area | production experience budget | measured | structural regression guard |
|---|---|---|---|
| Workspace → prepared Work Unit | < 600 ms | 393–412 ms | reveal lifecycle + readiness invariants (8) |
| Work View switch | < 500 ms | 265–347 ms | reveal gate armed per work unit |
| Queue → identity | < 400 ms | 120–233 ms | child mission reveal contract (6) |
| Prepared Queue → Mission | < 400 ms | 209–233 ms | child mission reveal contract |
| Operational workspace shell | < 200 ms | 8–101 ms | — (browser-certified) |
| **Resumed workspace shell** | **< 200 ms** | **5–24 ms** | workspace resume contract (14) |
| **Resumed primary content (warm)** | **< 500 ms** | **14–28 ms** | warm lifecycle (9) + resume contract |
| **Workspace reopen requests (in TTL)** | **0** | **0** | warm lifecycle — reuse + invalidation seam |
| **Card transition (destination commit)** | **< 200 ms** | **31–155 ms** | latest-wins ordering (7) |
| **Command destination commit** | **< 200 ms** | **28–80 ms** | latest-wins ordering (7) |
| Activity shell | < 200 ms | 18–33 ms | subject-gate ordering (3) |
| Dropdown (warm) | < 100 ms | 25–30 ms | — |
| Save acknowledgement | < 150 ms | 74–83 ms | no-false-success contract (6) |
| **Save authoritative completion** | **< 2,000 ms** | **1,736–1,759 ms** | no-false-success + span classification |
| **Organization warm navigation** | **< 300 ms** | **17–63 ms** | — (browser-certified) |
| Organization first entry (cold) | *(no budget — true-cold class)* | 1,486–2,594 ms | — |
| Prepared-path layout shift | 0 | 0 | BOS forbidden parking (5) |

**Budgets are per performance class.** A cold-start number and a prepared-journey number are never
averaged into one figure — §1 exists because conflating them reports a premium journey as a
regression and a cold path as fine.

---

## 17. Final guard matrix

| invariant | owner | guard | status |
|---|---|---|---|
| 6/7/8/10 reveal lifecycle + readiness | `useCommittedWorkUnitSurfaceRuntime` | `revealLifecycleAndReadinessInvariants.test.ts` (8) | **guarded** |
| child mission reveal / no sibling work | `overlayChildMissionOntoSettledFocusModel` | `childMissionRevealContract.test.ts` (6) | **guarded** |
| 12 workspace resume | `lib/runtime/workspaceResume.ts` | `workspaceResumeContract.test.ts` (14) + `pe3WorkspaceResumeCert.mjs` A/B/C × 3 | **guarded** |
| 21 workspace data lifecycle | `lib/runtime/warmCache.ts` + Operations adopter | `operationsWorkspaceWarmLifecycle.test.ts` (9) | **guarded** |
| 23 invalidation seam | per-workspace warm owner | same file — mutation drops day, not configuration | **guarded** |
| **latest-click-wins** | `lib/runtime/latestWins.ts` | `latestWinsOrderingContract.test.ts` (4) | **guarded** |
| **Activity subject switching** | `createSubjectGate` | `latestWinsOrderingContract.test.ts` (3) | **guarded** |
| **15 Save persistence / no false success** | `applyCustomerMemberMutationPatch` | `saveNoFalseSuccessContract.test.ts` (6) | **guarded** |
| **20 forbidden parking** | `chooseBosParkingGeometry` | `bosForbiddenParkingContract.test.ts` (5) | **guarded** |
| 24 readiness follows resume | `warmOperationsWorkspace` + sidebar nav intent | browser-measured request chain | **partial** |
| cross-child leakage | `data-children-focused-member` | `pe3CardCommandReadiness.mjs` identity assertion | **browser-certified** |
| **Assignment child scoping** | `resolveFocusPanelMutationOpportunityId` + assignment subject binding | `operationalAssignments/assignmentSubjectBinding.test.ts`, `adminV2/runtime/resolveFocusPanelMutationOpportunityId.test.ts`, `subjectContractGeneralization.test.ts`, `subjectGrainDerivedOnce.test.ts` | **guarded (pre-existing)** |
| **Avatar identity propagation** | child avatar resolution | `adminV2/runtime/identitySemanticAvatar.test.ts`, `childAvatarSessionPreview.test.ts`, `resolveChildPhotoUrl.test.ts` | **guarded (pre-existing)** |
| **Escape layering** | Focus Panel escape ownership | `focusPanel/escapeLayerOwnership.test.ts` | **guarded (pre-existing)** |
| **Command return grammar** | command surface handoff | `adminV2/commandSurfaceHandoffUx.contract.test.ts`, `commandSurfaceCardNavigation.test.ts`, `commandSurfaceExecutionReceipt.contract.test.ts` | **guarded (pre-existing)** — one source-inspection assertion in the handoff suite fails on staging independently of this branch; see §7 |

**All five named guard gaps are closed, and every high-risk contract named at freeze has a
deterministic owner.** The four rows above were already guarded before this programme — they are
recorded here so the matrix is complete, and **no test was added merely to raise the count**.

**All five named guard gaps are closed.** Every guard is deterministic and positive-controlled: each
reuse/ordering assertion is paired with a case that MUST fetch or MUST commit, so a mechanism that
silently stopped working entirely could not pass.

---

## 18. Final classification

### CERTIFIED / PREMIUM
- Workspace → prepared Work Unit, Work View switch, Queue identity, prepared Queue → Mission.
- Operational workspace launch and **resume** (Processing, Work Items, Operations) — 9/9 scenarios.
- Operational workspace **warm data lifecycle** — 0 requests on reopen inside the freshness window.
- **All Focus Panel card and command destinations** — 28–155 ms, controls present at commit.
- Activity mode shell and subject switching.
- Save acknowledgement and local convergence.
- `/organization` **warm** navigation, and Processes interaction.

### CERTIFIED WITH SECONDARY DEBT
- **Message command** — commits in 80 ms; secondary hydration continues to ~6.3 s (Communications).
- **Processes** — controls usable at 54 ms; `entity-layouts` / `stage-bootstrap` continue to ~3.5 s
  without gating anything.
- **Operations → Children resume** — section restores immediately; its list content waits on Records.

### EXTERNAL OWNER
- **Communications** — duplicate loader ownership; the Activity early-switch cascade; the timeline
  double-fetch and a 100-event payload rendering 3 events. See the handoff artifact.
- **Records** — `/api/admin/records/children` at ~3.3–4.5 s.
- **BOS rail owner** — remaining direct-path late re-park (product placement decision).
- **Vacilando** — ABANDONED execution-run checkpoint transition.

### TRUE-COLD TECHNICAL DEBT
- Work Unit bare cold path: 11,708 ms (accepted class; see §1).
- `/organization` first entry to a route family: 1,486–2,594 ms. **Nav-intent prefetch measurably
  does not help** — do not "fix" it with one.

### OPEN PLATFORM DEFECT
- A speculative drawer-VM prefetch on `/workspace` 404s
  (`/api/admin/view-models/drawer/opportunity/<id>`): readiness spending a request on a destination
  that does not resolve. Bounded and harmless, but it is measurable waste and it is the source of the
  console error seen during card/command measurement.


---

## 19. Post-merge verification

Merged to staging as **`fab0b6fedc95c4cf1932d7066675683dd3f854ee`** (PR #482, 2026-08-21). The merged
tree is byte-identical to the certified build, so the numbers in this document describe shipped
behaviour rather than a pre-merge branch.

Post-merge smoke on the shipped tree — **15/15 PASS** (`scripts/pe3PromotionSmoke.mjs`): Workspace →
prepared Work Unit (5 cards, correct header) → Work View switch → Activity → Children (identity seam
carries the selected member) → Assignment → Message → Send Form → Tour → queue child switch (identity
follows the row) → operational workspace → resumed stable position → `/organization`.

**One number corrected against shipped behaviour:** `/organization` warm navigation was recorded as
17–55 ms; repeated post-merge runs observed up to 63 ms, so the range is now **17–63 ms**. Still
comfortably inside the < 300 ms budget, but the document states what was measured rather than the
most flattering window.

The 11 console errors observed during the smoke are the known speculative drawer-VM prefetch 404
(§18, OPEN PLATFORM DEFECT) — unchanged by this promotion.


---

## 20. Unexpected page refresh — first wave

**The report was "the app sometimes appears to randomly refresh".** Visual behaviour cannot separate a
document reload from an RSC route refresh from a subtree remount, and those have different owners, so
the symptom was classified before anything was changed (`scripts/rcRefreshDetector.mjs`, which
appends every event to `sessionStorage` — an in-memory log dies with the document, which is exactly
the evidence that matters).

### What the detector proved

Over canonical journeys plus idle dwell on a production build:

| signal | count | reading |
|---|---|---|
| `DOCUMENT_REPLACED` | 3 | all three are the harness's own `goto`s |
| RSC requests (`_rsc=`) | **0** | no `router.refresh()` fired |
| `LOCATION_RELOAD_CALLED` | **0** | nothing reloaded the document |
| page crashes | 0 | |

**The refresh is NOT an idle or background phenomenon.** Passive operation does not refresh. It is
**mutation-triggered**, which is why it appears random: it depends on what the operator did and from
which surface.

### Owners found and fixed

1. **Both operator command rails omitted `invalidate`.** `applyRegistryResolvedActionClient`
   documents `router.refresh()` as legacy behaviour for hosts that supply none. The record header
   supplies one; `WorkspaceRightRailActions` and `WorkUnitRightRailActions` did not — so the SAME
   command converged surgically from the header and re-rendered the whole route from a rail. Both now
   use the canonical owners: the targeted scoped update when a record is selected (there is a row for
   listeners to match), the surface-neutral broadcast when there is not.

2. **`WaitlistPlacementAdjustControl` reloaded the DOCUMENT — sometimes.** Both fallbacks called
   `window.location.reload()`, and whether they fired depended on whether attention happened to carry
   a lens. That state-dependence is the whole explanation for "random". The reload was doing real
   work (it guaranteed the operator saw the new order), so it was replaced by a signal carrying the
   same guarantee — `placement_manual_order` is already registered as membership-changing, so
   listeners refetch rows AND counts (law 27).

Auth-transition refreshes (sign-out, idle logout, login) are deliberately untouched: they navigate to
`/login` and are not a data-freshness mechanism.

### Honest limit on this evidence

**The rail path could not be exercised live on this tenant.** Both command rails render ZERO actions
on the certification tenant at this route, so there is no before/after measurement of a rail command
here — the defect and the fix are established by the code path (a host without `invalidate` reaches
`else host.router.refresh()`) and frozen by guard, not by a live A/B. Stated rather than implied.

Guards: `tests/runtime/noUnexplainedPageRefreshContract.test.ts` (5), including a positive control
that the legacy fallback still exists (so the guard protects something) and one proving the
comment-stripper cannot hide a real reload.

### Still open in this area

- `LifecycleActivationBoard.reloadConfiguration` (Organization) calls `window.location.reload()` as
  an explicit stale-draft recovery. Operator-initiated rather than random, so it is Priority 6
  ("convergence after save") rather than Priority 1.
- `/legacy-admin/*` reloads are out of the canonical operator contract and were not touched.
