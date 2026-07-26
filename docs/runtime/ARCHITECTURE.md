# Runtime V1 — Architecture (read this first)

> This is the canonical explanation of the operator Work Unit runtime. A new engineer should be able to
> trace **ownership, the critical path, data flow, cache ownership, timing, and extension points** from
> this file alone — without reading realization ledgers or session history. For *what remains to certify*,
> see `RUNTIME-V1-CERTIFICATION-SPRINT.md`. For *why past alternatives were rejected*, see that file's
> Decision Log.

## 1. The one-sentence model

**Operator intent moves "attention" (K1); attention triggers one bounded server answer (K2); a terminal
answer atomically commits "focus" (K3); the Surface Host renders only committed focus; the URL is written
*from* focus, never read back to decide what is shown.**

```
K1 Attention  ──move──▶  K2 Provisioning  ──terminal──▶  K3 Focus (commit)  ──▶  Surface Host renders
   (intent)                (one round-trip)                (atomic)                (committed only)
       ▲                                                        │
       └───────────────── URL is projected FROM focus ─────────┘   (hydrated from URL once, on cold load)
```

## 2. The kernel triad (one owner each) — `lib/runtime/kernel/`

| Owner | File | Responsibility | Does NOT |
|---|---|---|---|
| **K1 Attention** | `attention.ts` | The single mechanism for "where the operator is" at every scope (SURFACE ⊃ LENS ⊃ SUBJECT ⊃ ASPECT). Pointer/keyboard/URL/history all funnel here. | Fetch, render, or touch the router. |
| **K2 Provisioning** | `provisioning.ts` + `workUnitEntryResourceClient.ts` | On each attention move, fetch **one** bounded Provisioning Answer (the Entry Resource). Supersede/dispose stale in-flight preparations. | Commit or render. |
| **K3 Focus** | `focus.ts` | Receive a terminal answer and **atomically commit** it (`onPreparationTerminal`): the incoming becomes visible, the outgoing ceases, focus changes, URL is projected — one transaction. | Un-commit; derive what's visible from the pathname. |
| Kernel wiring | `RuntimeKernelContext.tsx` | Composes K1→K2→K3: `attention.subscribe → focus.onAttentionMoved (yield) → provisioning.onAttentionMoved → focus.onPreparationTerminal (commit)`. | — |

**Latest-click-wins** is enforced by three cooperating guards (do not add a fourth): K2 supersede+dispose
(`provisioning.ts` — disposes preparations a newer move supersedes, re-checks at the emit boundary), K3
commit-version reject (`focus.ts` — rejects a terminal older than the committed version), and the
per-subject `fetchGenRef` in `useRecordWorkRuntime` (drawer VM). A superseded answer can never reach K3.

## 3. Surface Host — the one renderer — `lib/experience/surfaceHost/SurfaceHostContext.tsx`

- Renders the Work Unit **only** when K3 has committed one (`focus.current`). "A surface is never shown
  before it is Operational." Before commit, a single centered loader owns the region (never blank, never a
  partial reveal).
- **Cold-load hydration is the ONLY place a URL establishes attention** (`useEffect` → `attentionFromUrl`
  → `kernel.attention.hydrate`), and it runs **once** (`hydrate` throws if attention already exists).
- The URL is **projected** from committed focus via `replaceState` (subject/lens moves do NOT create
  history entries). Back/Forward restore the canonical destination stamped into `history.state`.
- Mounted in `app/adminV2/workspace/AdminV2WorkspaceClientProviders.tsx` — an **ancestor** of the Work Unit
  route subtree. (This ancestor relationship is why route-level seeds must land render-phase; see §6.)

## 4. The bounded Provisioning Answer — the above-fold ViewModel — `lib/runtime/provisioning/workUnitProvisioningAnswer.ts`

`composeWorkUnitProvisioningAnswer(req)` returns **one** terminal answer: `operational | empty | error`.
It is the single above-fold contract — everything needed to render the first operational frame, and
nothing more (no Settlement: no counts, activity, communications, related records). Key fields (operational):

- `workUnit {id,key,name,departmentId}`, `businessProcess`, `activeWorkView`, `lensSet`, `contextFrame`.
- `rows[]` — one bounded page (cap 100), canonical order, each with recognition `context`.
- `recordOfAttention {id, strategy}` — the **Operational Subject** (the default/selected record).
- `currentBusinessState {stageKey, stageLabel, …}` + `primaryAction` — Situation → Action.
- `focusPanelStageWork` — the subject's Current Work slice (progress/requirements/blocked). **Commit-critical**
  and **reused by the client** (see §7, CP-2) so Current Work renders at commit without a fetch.
- `focusPanelSubjectSnapshot` — Household + Children first-operational identity (from data already resolved).
- `focusPanelSummaryDoc` — the published Summary composition. `presentation`, `actionsProjection`,
  `settlement` (Settlement-only locators the operational renderer never reads).

The HTTP seam is `GET /api/admin/work-units/[id]/provisioning-answer`. Both it and the RSC route seed call
the **shared** `composeProvisioningAnswerForRoute` so the fetched answer and the seeded answer are identical.

## 5. Data flow — cold selected-subject critical path

```
1. Route gate + slug→identity resolution   resolveWorkUnitRouteIdentityCached (React cache(), deduped)
2. Server-compose the Provisioning Answer   composeProvisioningAnswerForRoute  (in [workUnitSlug]/layout.tsx)
3. Seed the K2 cache (resolved answer)       ProvisioningAnswerSeed  (render-phase useMemo, see §6/§7)
4. Client hydrates → K1 hydrate → K2 consume WARM (no network hop)  → K3 commit  → Surface Host renders
5. Reveal marks primary-reveal active; the committed answer paints Current Work + Household/Children
6. Enriched drawer VM (Settlement) loads     useRecordWorkRuntime → /view-models/drawer/opportunity/{id}
   (fills the deeper cards; stage-work is REUSED from the answer's slice — no separate /stage-work fetch)
```

**First meaningful card** comes from step 4–5 (the answer). **All cards** settle at step 6 (the enriched VM).

## 6. Route ownership — `app/adminV2/workspace/work-unit/[workUnitSlug]/`

- `layout.tsx` — the surface anchor. Server-resolves route identity (`loadWorkUnitSlugRouteMetaServer`) and
  server-composes + **seeds** the Provisioning Answer, then renders `WorkUnitSlugRouteHost` +
  `ProvisioningAnswerSeed`. **It renders the Host, not `children`** — so a seed placed in `page.tsx` is
  never mounted; seeds live in the layout. The seed is **awaited** (resolved answer), not streamed
  (Decision D-002/D-003).
- `page.tsx` / `[recordId]/page.tsx` — route anchors returning `null`. **Subject is a query param
  `?subject_id`** (Decision D-004); the `[recordId]` path segment is legacy (drives the legacy drawer) and
  is being retired (task RA-2). The Surface Host renders the surface; the pages render nothing.

## 7. Cache ownership (two caches, explicit producers)

**Provisioning cache** — `lib/runtime/kernel/workUnitProvisioningPrefetch.ts`. One `Map` keyed by the exact
K2 URL (`provisioningAnswerUrl(target, lens, subject)`), 60 s TTL, one-shot consume. **Three producers**,
one consumer (K2):
1. intent prefetch (`prefetchWorkUnitProvisioning`) — operator hover/focus.
2. **server seed** (`seedProvisioning`) — the route layout hands K2 a resolved answer so cold load resolves
   warm. *The seed key MUST equal K2's consume key — this is guarded by a committed key-parity unit test
   (`web/tests/runtime/workUnitProvisioningPrefetch.test.ts`, exercising the `lib/runtime/kernel/` seam); a
   drift is a silent slowdown, so the test is the alarm.*
3. K2 cold fetch (`fetchProvisioningEntryDeduped`) — the fallback when nothing warmed it.

**Stage-work cache** — `lib/adminV2/viewModel/drawer/opportunity/stageWork/opportunityStageWorkResource.ts`.
Keyed by (org/opp/dept/stage), 90 s TTL, mutation-invalidated. Producers: the drawer VM's fetch, and
`seedOpportunityStageWork` (CP-2) — seeded from the answer's `focusPanelStageWork` at commit so the drawer
VM consumes it warm instead of re-fetching `/stage-work`. Same key-parity discipline (unit-tested).

**Why render-phase seeds:** the Surface Host is an ancestor; its cold-load consume runs in a post-hydration
effect. A seed must be written **during render** (`useMemo`) in the same/earlier boundary so it lands before
that effect. Effects run child→parent *after* render, so an ancestor effect seed would be too late.

## 8. The enriched drawer VM (Settlement) — `useRecordWorkRuntime` + `composeOpportunityDrawerViewModel`

After commit, `useRecordWorkRuntime(subjectId)` loads the full drawer VM
(`/api/admin/view-models/drawer/opportunity/{id}`) — the deeper family/contacts/documents/activity that the
above-fold answer deliberately omits. This is the dominant remaining cost (~5–6 s server compose) and the
current perceived-performance frontier (tasks CP-1/CP-4). It **enriches**; it never creates the operational
Current Work (that is the answer's, §4). Latest-click-wins here is the per-subject `fetchGenRef`.

The stage-work sub-route (`/api/admin/view-models/drawer/opportunity/{id}/stage-work`) still exists as the
**fallback** the CP-2 seed avoids — on the cold default path the seed (§7) satisfies the warm check so that
fetch never fires; it is the path used when there is no seed (a row switch, a stale cache, a mutation
invalidation). A parallel `/api/admin/v2/view-models/drawer/opportunity/{id}` endpoint also exists; the
runtime path above is the canonical one.

## 9. Timing model

| Metric | Source | Warm (local prod) |
|---|---|---|
| TTFB | route gate + (blocking) answer compose | ~1.4 s (cheap on a warm config cache) |
| first meaningful card | committed answer (§4) at hydration | ~3.6 s |
| all meaningful cards | enriched drawer VM (§8) | ~11 s (frontier: CP-1/CP-4 → <6 s target) |

Cold adds the answer compose to TTFB (~+2 s), repaid by removing the post-hydration provisioning round-trip.

## 10. Extension points (how to add to the runtime)

- **A new work-view / queue** — configuration (department metadata `work_views_v1` + stages). No runtime
  code: the answer resolves the active lens, rows, subject, and Current Work from config.
- **A new Focus Panel card** — declare the card in the composition
  (`lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards.ts`) and add a render branch in
  `components/admin/focusPanel/FocusPanelCardRenderer.tsx`. Load a noncritical card via `next/dynamic` so
  it stays off the first-paint graph, and **feed its data from the enriched drawer VM (§8), NOT from the
  Provisioning Answer** — adding data to the answer inflates TTFB/first-card (§9). Critical above-fold
  cards (Household/Children/Current Work) are the exception: they are answer-sourced by design.
- **A new action surface** — render it behind its `surface ===` branch and load it via `next/dynamic`
  (see `CurrentWorkActionPanel`, `CreateLeadEventHost`) so it stays off the initial graph.
- **A new subject type (e.g. Parent/Teacher runtime)** — the answer contract is currently opportunity-shaped
  (`focusPanelSubjectSnapshot`, `inquiry_children`); generalize it (task SC-1) before reusing the runtime for
  a different subject. The kernel/Surface Host are subject-agnostic.

## 11. Invariants (do not break)

1. One record-open owner (the Focus Panel subject). *(RA-2 retires the legacy path-drawer duality.)*
2. The Surface Host renders only committed focus — no partial/false-empty/wrong-record/stale reveal.
3. The URL is projected from focus, hydrated from URL exactly once.
4. One Provisioning Answer per preparation; seeds match K2's key (unit-tested) or fall open to a fetch.
5. Latest-click-wins via the three generation guards (§2) — do not add a fourth owner.
6. Seeds are render-phase and idempotent; they can only help, never trap the surface.
