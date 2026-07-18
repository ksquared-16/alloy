---
owner: platform
status: proposed-architecture
last_reviewed: 2026-07-18
supersedes: []
---

# Workspace Operational Preparation Runtime

**Status:** Proposed architecture. Design only — not yet implemented. This document defines the inversion
of Work Unit preparation ownership from *the click* to *the Workspace*.

## 0. The inversion

Today `workUnitEntryResourceClient` (K2's one round-trip) **constructs the operational world on demand**:
the click fires K1 → K2 fetches `workUnitProvisioningAnswer` → K3 commits. Even at ~1.5 s of server
compose this is "reconstruct the world, then commit it."

Two measurements end the debate:
- The **intent-prefetch path commits in ~144 ms** — once the answer *exists*, K2→K3 is already instant.
- **Workspace already knows the finite navigation graph** — every visible Work Unit, its Work Views,
  published Surfaces, default subject, queue, Header, and Focus Panel variant.

So the objective is no longer "make `workUnitProvisioningAnswer` faster." It is:

> **Move Work Unit preparation ownership to the Workspace.** The Workspace prepares each reachable Work
> Unit as a committed operational snapshot *before* the click. **The click commits one.** Clicking a
> visible Work Unit never reconstructs the operational world — the world already exists.

This is not a new mechanism grafted on: it is the **generalization of the existing
`workUnitProvisioningPrefetch` cache** (which already proved 144 ms) into a first-class, owned, managed
store. **The same canonical resource path K2 consumes remains the only path — no second navigation cache.**

Kernel invariants are preserved verbatim: one atomic Preparation answer per reference; latest-wins; no
mixed-subject frame; never-blank. What changes is *when* Preparation runs (ahead of the gesture, in the
Workspace) and *who owns it* (Workspace, not the click). K2 narrows from **prepare-on-gesture** to
**commit-from-prepared**, with live-fetch fallback.

---

## 1. Workspace Preparation Runtime

The Workspace becomes the **Operational Preparation Runtime**: a client-side runtime that owns a
**Snapshot Store** of prepared Work Unit answers and keeps it live against the navigation graph.

Responsibilities:
- **Enumerate** the reachable navigation graph from data the Workspace already holds — process tiles
  (`ProcessSummaryCard`), Work-View rows (`WorkViewList`), Header KPIs — as a set of `AttentionRef`
  targets `(workUnit, workView)`.
- **Prepare** snapshots proactively, prioritized (§5–6), bounded in concurrency and memory (§9).
- **Maintain** them: invalidate (§3, §7, §8), refresh (§4), evict (§9).
- **Serve** K2 on commit: `workUnitEntryResourceClient` reads the store first (a ready snapshot → the
  144 ms commit), falling through to live fetch on a miss (§12).

It is a *runtime*, not a cache utility: it has a lifecycle tied to the Workspace surface, a priority
scheduler, an invalidation bus, and a bounded store. The current `workUnitProvisioningPrefetch` module is
its embryo — the store is that map, promoted to a managed, keyed, revision-tagged, priority-scheduled
structure. K1/K2/K3 are unchanged; this runtime sits *beside* the kernel and feeds K2's `EntryResource`.

---

## 2. Prepared Work Unit Snapshot

A snapshot is the **committed-terminal `ProvisioningAnswer` for one `AttentionRef`**, plus lifecycle
metadata. The `AttentionRef` identity `(target, lens, subject)` is the store key — identical to the URL
K2 builds (`provisioningAnswerUrl`), so preparation and commit key on the same value by construction.

```
PreparedWorkUnitSnapshot = {
  ref:            AttentionRef            // target workUnit + lens (workView) + optional subject — the KEY
  answer:         ProvisioningAnswer | null   // the atomic Preparation answer (null while preparing)
  status:         'preparing' | 'ready' | 'stale' | 'invalid'
  preparedAt:     number
  configRevision: number                  // surface-config revision it was composed against (§8)
  dataRevision:   number | null           // work-unit data revision it was composed against (§7)
  priority:       0 | 1 | 2 | 3           // intent / viewport / likely-next / cold (§5)
  inflight:       Promise<...> | null     // one preparation per ref (dedup)
}
```

Properties:
- **Commit-critical only.** The snapshot carries the operational world in final layout — Header geometry,
  queue rows in final layout, Work-View set, default subject, Focus-Panel composition. It carries **no
  Settlement** (§15). This is what keeps it small and cheap to hold many of.
- **Immutable.** A prepared snapshot is never mutated in place; refresh produces a *new* snapshot and
  latest-wins replaces it. This preserves the no-mixed-subject invariant — a committing snapshot is
  internally coherent.
- **Self-describing terminal.** `answer.terminal ∈ { operational | empty | error }`; each is a workable
  commit. An `error` terminal is a valid snapshot (an honest, retryable place), never a false-empty.

---

## 3. Snapshot invalidation

Invalidation answers "may this snapshot still be committed as-is?" Two distinct outcomes — the difference
is whether the **composition** is wrong or only the **data** is old:

| Trigger | Meaning | State | Commit behavior |
|---|---|---|---|
| **Configuration revision change** (§8) | Published Surface composition changed — Header/Queue/Focus-Panel variant differs | **`invalid`** | Must re-prepare before commit (composition is wrong) |
| **Mutation** to this Work Unit's data (§7) that changes membership/subject | Rows/subject differ | **`invalid`** | Re-prepare (the committed world would be wrong) |
| **Mutation** that changes only field values (not membership/subject) | Data is older, composition intact | **`stale`** | Committable now; refresh reconciles |
| **TTL / freshness bound** elapsed | Data may be old; nothing known-wrong | **`stale`** | Committable now (coherent); refresh in background |
| **Graph change** (Work Unit removed, Work View deleted) | Node no longer reachable | **evict** | Snapshot pruned |

Key principle: **`stale` is still committable** (a coherent operational world, just not the freshest
data — commit instantly, reconcile via Settlement + background refresh); **`invalid` is not** (the
composition or membership would be wrong — the click must re-prepare, falling back to the live path with
the never-blank shell). Never commit an `invalid` snapshot; always prefer committing a `stale` one over
blocking.

---

## 4. Snapshot refresh

- **Stale-while-revalidate is the default.** A `stale` snapshot commits immediately (coherent surface);
  a background refresh produces a replacement; latest-wins swaps it in. If the operator is already inside
  the committed Work Unit, the refresh reconciles in place through the existing Settlement/patch-event
  path — never a reflow, never a mixed-subject frame.
- **Triggers:** invalidation events (mutation, config revision), TTL expiry for viewport-priority
  snapshots, explicit refresh (operator pull-to-refresh), and re-entry after a bounded absence.
- **Dedup:** one in-flight preparation per `ref` (the `inflight` promise). A refresh requested while one
  is running joins it. Errors are never cached — a failed refresh drops the snapshot to a re-preparable
  state so the next commit live-fetches (never commits a failure as truth).
- **`invalid` snapshots are re-prepared, not refreshed** — the distinction from §3: refresh assumes the
  composition is right and only the data moved; re-prepare recomputes composition (new config revision).

---

## 5. Snapshot prioritization

Not every reachable Work Unit is equal. A bounded priority scheduler prepares in this order, with
preemption (a higher tier preempts lower-tier in-flight budget):

| Tier | What | When prepared |
|---|---|---|
| **P0 — Intent** | The Work Unit under active hover/focus (the current `prefetchWorkUnitProvisioning`) | Immediately on pointer/focus intent |
| **P1 — Viewport** | Work Units visible in the Workspace viewport + their active/default Work View | Eagerly on idle, gated by §6 |
| **P2 — Likely-next** | The operator's default Work Unit, most-recently-visited, highest attention count | On idle after P1 drains |
| **P3 — Cold-reachable** | Known but off-viewport Work Units | Lazily / not at all until scrolled into view |

Concurrency is bounded (precedent: `OPERATOR_LIFECYCLE_ENTRY_WARM_CAP = 6`). P0 always preempts. The
scheduler never floods the server: preparation is idle-time work, cancellable, and yields to the commit
path.

---

## 6. Viewport prioritization

Preparation is bounded to what the operator can actually see and reach — this is what makes the model
scale to a large navigation graph (prepare the ~6–12 visible tiles, not 500 Work Units).

- An `IntersectionObserver` on the Workspace tiles drives P1: a tile entering (or nearing) the viewport
  enqueues its snapshot at P1; a tile leaving deprioritizes/cancels any pending preparation for it.
- The observer margin (e.g. root-margin ahead of scroll) prepares just-below-the-fold tiles before they
  are reached. Rapid scrolling cancels superseded P1 work (cheap, no server flood).
- Viewport priority composes with intent: hovering a visible tile promotes it P1→P0.

---

## 7. Mutation invalidation

A mutation changes a Work Unit's world. The client already observes its own mutations — hook snapshot
invalidation to those events:

- **Source of truth:** the mutation seam (`drawerOperatingSaveCoordinator` → `PATCH
  /api/admin/opportunities/{id}`, stage transitions, action-registry executes). These already emit
  patch/refresh events that the committed surface consumes in place.
- **Rule:** a mutation to a record in Work Unit *W* invalidates *W*'s snapshots. Classify (§3):
  membership/subject change → `invalid` (re-prepare); field-value change → `stale` (commit + refresh).
- **Committed vs prepared:** if *W* is the currently committed Work Unit, the in-place patch path already
  reconciles it; the store simply marks the *prepared* copy stale so a later re-entry is fresh.
- **Cross-actor mutations** (another operator moves a record): not observed locally. Handled by bounded
  staleness — commit the coherent snapshot, and Settlement (counts/totals) + the next refresh reconcile.
  Optionally tightened later by a server invalidation signal (§10), never required for correctness.

---

## 8. Configuration revision invalidation

A published Surface change (Header / Queue-row / Focus-Panel variant via Settings → Surfaces) changes the
**composition** of every affected snapshot — these are `invalid`, not merely stale.

- **Revision token:** a single monotonic **surface-config revision** per org (and, if cheap, per surface
  family), derived from the max published `entity_layouts` version or a publish-event counter. Every
  snapshot records the `configRevision` it was composed against.
- **Signal:** publish already emits client events (`FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT` exists; add
  analogous Header/Queue publish signals, or a single `surfaceConfigPublished` bump). On bump, mark every
  snapshot with `configRevision < current` **invalid** → re-prepare (prioritized by §5).
- **Cheap check on commit:** the commit path compares the snapshot's `configRevision` to the current
  revision in O(1). A mismatch forces a re-prepare rather than committing a stale composition. This is the
  one check that must never be skipped — composition correctness outranks latency.
- `resolveSurfaceVariant` remains the sole applicability resolver; the revision is just the cache-coherence
  key over its published inputs.

---

## 9. Memory limits

Snapshots are commit-critical only (bounded: rows capped at `PROVISIONING_ROW_PAGE_CAP`, no Settlement
payloads) — each is small. The store is still bounded:

- **Count cap:** at most *N* snapshots (start from the warm precedent of ~6, scale with viewport size).
- **Priority-aware LRU eviction:** beyond the cap, evict the lowest-priority, least-recently-committed
  first (P3 before P2 …). Never evict the P0 intent snapshot or the currently-committed Work Unit's.
- **Bounded total:** memory ≈ *N* × (one commit-critical answer). Because Settlement is excluded (§15),
  this stays small even at large *N*.
- **Cold-reachable is not held:** P3 Work Units are prepared on demand (viewport entry), not retained, so
  the store size tracks the viewport, not the whole graph.

---

## 10. Server responsibilities

- **Sole author of a snapshot.** The `workUnitProvisioningAnswer` endpoint remains the *only* authority
  that composes a `ProvisioningAnswer` — one atomic Preparation answer per `(workUnit, lens, subject)`.
  The server stays **stateless**: it computes on request and holds no per-client snapshot state. The store
  is client-owned.
- **Amortize, don't reconstruct on the click.** The win is not a faster endpoint — it is that composition
  runs *ahead* of the gesture. Server-side follow-ons that make ahead-of-time preparation cheap:
  - a **batch preparation** path (`prepare-many`: compose several reachable Work Units in one round-trip)
    to amortize connection/serialization overhead during idle;
  - the cold-path parallelism already landed (records ∥ presentation ∥ composition) so each prepared
    answer is cheap;
  - commit-critical/Settlement split enforced server-side (§15) so a prepared answer never carries
    Settlement payloads.
- **Own the revisions.** Expose the authoritative **surface-config revision** (§8) and, where available,
  a **work-unit data revision** (§7) — cheaply queryable — as the invalidation keys.
- **Optional (later): push invalidation.** A realtime/SSE channel that emits config-publish and
  data-mutation revisions lets the client invalidate precisely instead of by TTL. Never required for
  correctness — bounded staleness + Settlement already keep the surface honest.

---

## 11. Client responsibilities

- **Own the Snapshot Store & scheduler:** enumerate the graph, prioritize (§5), viewport-gate (§6),
  prepare (call the server / batch), cache, invalidate (§7–8), refresh (§4), evict (§9).
- **Feed K2, don't replace it:** `workUnitEntryResourceClient` reads the store as its first source. The
  store *is* the canonical resource path (the prefetch cache generalized) — **no second cache, no compat
  path.** K2's contract (one Preparation answer per ref, latest-wins) is unchanged.
- **Own intent & viewport signals:** hover/focus (P0), IntersectionObserver (P1).
- **Own mutation & config invalidation hooks:** subscribe to the mutation seam and publish events.
- **Own the commit experience:** a `ready` snapshot commits instantly; a `preparing`/`stale`/miss commits
  the coherent shell / retained surface immediately and settles (§12, §15) — never blank.

---

## 12. Deep-link fallback

A direct deep-link to a Work Unit (or a restored/reloaded session) has **no Workspace mounted → no
store**. The store is a Workspace optimization, never a correctness dependency:

- K2's `EntryResource` **falls through to the live fetch** (today's path) on a store miss — the snapshot is
  prepared on demand for that one Work Unit.
- The **never-blank invariant holds** independent of the store: the destination commits its shell /
  retained surface immediately and fills in when the live fetch returns (already true — 0 blank frames
  cold).
- Optional later: a lightweight persisted hint (last-visited refs) could warm one snapshot on a deep-link
  mount, but the correctness path is always live-fetch fallback.

---

## 13. Back / forward behavior

- Browser history is already a K1 input (the `popstate → K1` adapter). Back/forward produces an
  `AttentionRef`; K2 consumes it from the store or live-fetches — **the same single path.**
- **Forward to a Work Unit** with a valid snapshot → instant commit. With an `invalid`/absent snapshot →
  re-prepare / live-fetch behind the coherent shell.
- **Back to the Workspace** → the store survives (Workspace remounts and re-enumerates; surviving valid
  snapshots are reused). Re-entering a Work Unit is instant when its snapshot is still valid.
- Latest-wins + the O(1) config-revision check (§8) guarantee a re-committed snapshot is never a stale
  composition.

---

## 14. Return-to-Workspace continuity

- Returning to the Workspace must itself be instant and coherent — the Workspace surface is retained or
  re-committed from its own prepared state (this is EXP-4: the Workspace gets the same Runtime continuity
  as the Work Unit). No blank on return.
- The Snapshot Store **survives the round-trip** (Workspace → Work Unit → Workspace), so re-entering any
  recently-prepared Work Unit is instant.
- Settlement figures visible on the Workspace (KPI values, Work-View counts, queue totals) refresh on
  return under bounded staleness — the committed tiles never blank while they reconcile.
- Symmetry: just as the Workspace prepares Work Unit snapshots, the Work Unit surface should keep the
  Workspace's prepared/retained surface reachable for an instant return — one continuous operating
  surface, not two pages that reload each other.

---

## 15. Commit-critical vs Settlement — the boundary that makes this cheap

This split is what makes preparing *many* snapshots affordable and *correct*. It is enforced server-side
(the answer already carries only commit-critical fields) and honored client-side (preparation never
prefetches Settlement).

**Commit-critical — IN the snapshot, prepared before click, committed atomically by K3:**
- Header **geometry**: KPI slots (label/icon/accent/sourceKey — reserved, `pending:true`), title, identity.
- Queue rows in **final layout**: the compact slots with context values, in canonical order (no reflow).
- Work-View **set**: the pills (no counts).
- **Default subject**: the committed Record of Attention (`recordOfAttention`), resolved from the same
  evaluated page — no second evaluator, no mixed subject.
- Focus-Panel **composition**: which cards, the resolved published doc (not the record VM).
- Provenance: resolved surface/source/variant (already in the DOM).

**Settlement — NOT in the snapshot, fetched AFTER commit, into reserved space:**
- KPI **values**; Work-View **counts**; queue **totals**.
- The Focus-Panel **record VM** (`useRecordWorkRuntime` for the committed subject) + right-rail actions,
  activity, history.

Consequences:
- A snapshot is small (commit-critical only) → the store can hold many under §9's caps.
- Preparation cost does **not** multiply Settlement across all reachable Work Units — only the *committed*
  Work Unit settles. Preparing the world is cheap precisely because the world's *values* stay deferred.
- Staleness is graceful: commit-critical composition is revision-guarded (§8) so it is never wrong;
  Settlement values are allowed to be briefly stale and reconcile after commit without breaking coherence.

---

## Invariants preserved (non-negotiable)

1. **One atomic Preparation answer per reference.** The snapshot *is* that answer; K3 commits it whole.
2. **Latest-wins.** A newer valid snapshot supersedes; commit always uses the latest valid, never a
   superseded one.
3. **No mixed-subject frame.** A snapshot is internally coherent (one committed subject); refresh swaps
   whole snapshots, never partial state.
4. **One canonical resource path.** K2 consumes the store; the store is the intent-prefetch cache
   generalized. No second navigation cache, no compatibility path.
5. **Never-blank.** Any miss/preparing/invalid state commits a coherent shell or retained surface
   immediately — the world is prepared ahead, and when it isn't, a coherent surface still holds.

## Relationship to shipped work

- `workUnitProvisioningPrefetch` (intent-prefetch cache, 144 ms) → the **embryo of the Snapshot Store**;
  §1–2 promote it to a managed, keyed, revision-tagged, priority-scheduled runtime.
- `workUnitEntryResourceClient` (K2's one round-trip, store-consuming) → the **commit reader**; unchanged
  contract, now reads a managed store first.
- Cold-path parallelism (records ∥ presentation ∥ composition; queue ∥ header) → makes each *prepared*
  answer cheap to compose ahead of time (§10).
- `resolveSurfaceVariant` → the sole applicability resolver; the config revision (§8) is its coherence key.
- The commit-critical/Settlement boundary (U-P7 / U-S*) → §15, already the shape of `ProvisioningAnswer`.
