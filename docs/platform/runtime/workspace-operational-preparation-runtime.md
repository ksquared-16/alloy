---
owner: platform
status: proposed-architecture
last_reviewed: 2026-07-18
supersedes: []
---

# The Alloy Anticipatory Operational Runtime

**Status:** Proposed architecture; implementation in progress (see *Implementation log*, §16). This document
expands the Workspace Operational Preparation Runtime from *destination preparation* into a complete
anticipatory operational runtime.

**Implemented so far:** Phase A — the Operational Graph (client materializer + pure compiler + destination
identity + revision model), flag-gated (`NEXT_PUBLIC_OPERATIONAL_GRAPH`), enumerate-only.

## 0. Thesis — the system knows the book

Alloy already knows the full operational book. At login, **published configuration** defines the fixed
pages: Workspace composition, Work Units, Work Views, Header/Queue-row/Focus-Panel variants, Focus-Panel
modes, actions, editability, default selection, navigation relationships, operational grain. Only the
**values** change during operation: records, metrics, filters, statuses, calculations, recent mutations.

Therefore the runtime must **stop discovering composition during interaction.** It should compile the
known book once, prepare the pages the operator is about to turn to, and let interaction **commit prepared
operational state, not initiate construction.**

The operator should move through Alloy like an already-loaded book:

```
Workspace → Work Unit → Work View → queue subject → Focus Panel mode
```

Each likely next state is prepared *before* it is asked for. This is **deterministic preparation of
known operational destinations** — not speculative prefetch. The graph is finite and configuration-known;
intent, viewport, adjacency, and history choose *order*, never *possibility*.

**The inversion (recap).** Today K2 constructs the world on the gesture. The 144 ms intent-prefetch path
proves K2→K3 is instant once the answer exists. So preparation ownership moves *ahead* of the gesture: the
**Workspace Operational Preparation Runtime** prepares destinations; the gesture commits one. This
document generalizes that from "the next Work Unit" to "the next operational *state*" at every level of the
graph, and adds the **Operational Metrics Runtime** and the **single canonical loading owner**.

Five kernel invariants are preserved throughout (§Invariants): one atomic Preparation answer per
destination; latest-wins; no mixed-subject frame; one canonical resource path; never-blank.

---

## 1. The Operational Graph

The graph is the authoritative, finite enumeration of every reachable operational destination, **compiled
from published configuration and authorization** — never a second hard-coded navigation registry.

### 1.1 Node types

```
Operational Graph
├── Workspace (root — retained runtime, §4)
│   └── Work Unit
│       └── Work View
│           └── Queue Position (an ordered slot in the resolved queue page)
│               └── Subject (the committed Record of Attention for that position)
│                   └── Focus Mode (Work | Activity | … configured modes)
```

Each node type carries only *identity + composition pointers*, never data:
- **Workspace**: process-tile set, ordering, Work-Unit refs.
- **Work Unit**: business process, department, default Work View, Header variant ref.
- **Work View**: lens id, queue-row variant ref, sort/grain, filter definition, default-subject strategy.
- **Queue Position**: an index into the resolved, ordered queue page (not a record — a slot).
- **Subject**: the entity ref that fills a position (Opportunity — the sole committed subject).
- **Focus Mode**: the configured mode set for the subject + each mode's card composition (published doc).

### 1.2 Edges (adjacency)

Edges are the deterministic "next page" relationships the scheduler traverses:
- Workspace → Work Unit (tile / KPI / Work-View-row entry href).
- Work Unit → Work View (sibling lenses under the same process — ordered, adjacency = display order).
- Work View → Queue Position (the ordered page; adjacency = row ± window, §6).
- Queue Position → Subject (1:1 — the position's committed subject).
- Subject → Focus Mode (the configured modes; adjacency = active + commonly-used, §7).

### 1.3 Destination identity

A **destination** is a path to a leaf-or-intermediate operational state. Its identity is the explicit,
stable tuple:

```
DestinationId = (workUnitId, workViewId, subjectId | null, focusMode | null)
```

- `workUnitId` + `workViewId` map to the provisioning `AttentionRef(target, lens)`.
- `subjectId` is the committed Record of Attention (null = "use the Work View's default-subject strategy",
  resolved at prepare time and pinned into the id once known).
- `focusMode` is the Focus-Panel mode (null = the configured primary mode).

Identity is **content-addressed on config + authorization revision** (§1.5), so two operators, or the same
operator before/after a publish, never collide on a stale composition. This id is the store key and the K2
resource key — one identity, one canonical path.

### 1.4 Graph revision & authorization scoping

- **Graph revision** = a monotonic token over `(surfaceConfigRevision, authorizationRevision,
  navigationStructureRevision)`. Any change bumps it; prepared destinations tagged with an older graph
  revision are re-scoped (nodes may appear/disappear) — see §1.6.
- **Authorization scoping**: the graph is enumerated **post-authorization** — it contains only destinations
  the operator may reach. A permission change bumps `authorizationRevision`, re-compiles the graph, and
  **invalidates** (not staleness) any prepared destination now out of scope. Preparation must never prepare
  a destination the operator is not authorized for (§14 security).
- **Configuration-revision scoping**: composition pointers resolve through `resolveSurfaceVariant` at the
  current `surfaceConfigRevision`; a publish bumps it and invalidates affected destinations (§8/§11).

### 1.5 Ownership: server-authored, client-materialized (jointly composed)

- **Server authors** the graph: configuration + authorization live server-side; the server **compiles** the
  published book + the operator's grants into an authoritative Operational Graph + Presentation Manifest
  (§15) and a graph revision. This is the single source of truth for *what is reachable*.
- **Client materializes** it: the Workspace holds the compiled graph to **traverse and schedule**
  preparation (order, adjacency, viewport). The client never *invents* reachability — it only chooses order.
- **Jointly composed**: the server emits the graph + manifest + revision at login (and on revision bump);
  the client is a scheduler over it. The graph is NOT a hard-coded client registry and NOT re-derived ad
  hoc during interaction.

### 1.6 How graph changes invalidate prepared state

| Graph change | Trigger | Effect on prepared destinations |
|---|---|---|
| Surface publication | `surfaceConfigRevision` bump | Affected destinations → **invalid** (re-prepare, §8/§11) |
| Permission change | `authorizationRevision` bump | Out-of-scope destinations → **evict + invalid**; recompile graph |
| Nav structure change (Work Unit/View add/remove) | `navigationStructureRevision` bump | Removed nodes → **evict**; new nodes → schedulable |
| Tenant / location scope change | scope bump | Recompile graph for the new scope; evict prior-scope destinations |

---

## 2. Prepared Operational Destination (canonical prepared unit)

### 2.1 Rename

`PreparedWorkUnitSnapshot` is retired. The prepared object is not a Work Unit — it is a **destination**:
Work Unit + Work View + queue state + selected subject + Focus-Panel mode. The canonical term is:

> **`PreparedOperationalDestination`** (operator metaphor: *a page already loaded in the book*).

Used consistently below; `DestinationId` (§1.3) is its stable identity.

### 2.2 Data contract

```
PreparedOperationalDestination = {
  id:              DestinationId              // stable identity + store key + K2 resource key
  answer:          ProvisioningAnswer | null  // the atomic commit-critical Preparation answer (null while preparing)
  subjectRef:      SharedSubjectProjectionRef // ref into the shared subject truth (§9), not a copy
  focusMode:       FocusMode                  // the mode this destination commits into
  status:          'preparing' | 'ready' | 'stale' | 'invalid'
  preparedAt:      number
  graphRevision:   number                     // §1.4 — scope coherence
  configRevision:  number                     // §8 — composition coherence (O(1) commit check)
  dataRevision:    number | null              // §7/§10 — data coherence (metrics/rows)
  priority:        0..5                        // §5
  inflight:        Promise | null              // one preparation per id (dedup)
}
```

- **Commit-critical only** (§3). No Settlement payload — this is what keeps a destination small and lets the
  store hold the queue window × mode set × adjacent views at once.
- **References shared truth** (§9): `subjectRef` points at one shared subject projection; a subject's Work
  and Activity destinations share it — no duplicated record fetch.
- **Immutable**; refresh produces a new destination, latest-wins swaps it (no mixed-subject).

---

## 3. Commit-critical vs Settlement (strengthened)

A prepared destination is **not operational** unless it can *atomically* present the operator's first
meaningful action. Commit-critical is defined by that test, not by cost.

**Commit-critical — MUST be in the destination, committed atomically by K3:**
- Work Unit identity; active Work View.
- **Header** (geometry: KPI slots reserved `pending:true`, title, identity).
- **Queue** in final layout + **queue selection** (the selected position).
- **Selected subject** (committed Record of Attention — one, coherent, no mixed subject).
- **Useful Focus Panel** in the **configured primary mode**: Situation → Decision → Action, primary
  commands, and the **required editability state**.
- **Authoritative empty state** when applicable (an empty Work View is a workable place, not a spinner).

**Settlement — fetched AFTER commit, into reserved space, may be briefly stale:**
- Full activity history, documents, communications, deep relationship history.
- Secondary cards; long-tail calculations; secondary metrics; non-critical enrichment.
- KPI **values**, Work-View **counts**, queue **totals** (metric *values*, §10).

**Guardrail:** *Settlement must never become a label for "expensive to prepare."* If a datum is needed for
the operator's first meaningful action, it is commit-critical — it must be prepared, not deferred. The
split is a **usefulness** boundary, enforced server-side (the answer carries only commit-critical fields)
and honored client-side (preparation never prefetches Settlement across the store — only the *committed*
destination settles, §9).

---

## 4. Workspace as retained operational runtime

The Workspace is the **root of the Operational Runtime**, not a disposable route. It prepares *itself* and
its destinations, and it is retained across navigation.

**Login → steady state:**
```
login
→ Workspace composition compiled (graph + manifest, §1.5, §15)
→ Workspace visible (retained shell, §12)
→ Workspace metrics begin synchronizing (§10 — projections, not presentation)
→ visible destination preparation begins (§5 P2)
→ adjacent destination preparation follows (§5 P1/P4)
```

**Retained across navigation** (returning to Workspace must NOT reconstruct it):
- tile composition + ordering; navigation structure;
- scroll position (where appropriate); active filters (where appropriate);
- the **PreparedOperationalDestination store**;
- live metric subscriptions / refresh state (§10).

The Work Unit surface keeps the retained Workspace reachable for an **instant return** (§13). One
continuous operating surface — not two routes that reload each other.

---

## 5. Preparation scheduler & priority model

Bounded, cancellable, preemptive. Hover **may** raise priority; hover is **never required**.

| Tier | What | Trigger |
|---|---|---|
| **P0 — explicit intent** | pointer-down / keyboard activation / touch-start / direct nav intent on a specific destination | immediate, preempts all |
| **P1 — current-destination adjacency** | adjacent Work Views; queue subjects within the window (§6); alternate Focus modes for the selected subject (§7) | on entering a Work Unit |
| **P2 — visible Workspace destinations** | first visible tile first, then remaining visible tiles | on Workspace idle, viewport-gated (§6-equivalent) |
| **P3 — viewport-near** | tiles just above/below the viewport | on idle after P2 |
| **P4 — likely-next** | by ordering, prior navigation, operator history *where safe* (§14) | on idle after P3 |
| **P5 — cold/background** | remaining reachable graph | lowest, heavily throttled or skipped |

Rules: bounded concurrency (precedent `OPERATOR_LIFECYCLE_ENTRY_WARM_CAP = 6`); **cancellation** on
priority change / viewport exit / rapid traversal; **anti-storm** — coalesce, debounce viewport churn,
never fan out P4/P5 while P0/P1 are pending. The scheduler always yields to the commit path.

---

## 6. Queue subject adjacency preparation (Queue Continuity)

**Core requirement.** When a queue is visible and a subject is selected, the subjects *around* it are
already prepared. Moving row 4 → row 5 must **not** trigger Focus-Panel construction — row 5's
commit-critical Focus-Panel state already exists.

```
Queue: 1 2 3 [4←selected] 5 6 7      prepare window: selected ± W (default W = 2)
```

- **Window**: `selected ± W`, `W` configurable; default 2. Cost-aware adaptive `W` (shrink under memory/CPU
  pressure, grow when idle).
- **Direction-aware**: bias toward travel direction — descending selection prioritizes `+1, +2` over `-1`.
- **Rapid traversal**: holding arrow-down streams selection; the scheduler **cancels** superseded
  in-flight preparations and keeps only the current ± window (latest-wins). Never a preparation storm.
- **Latest-wins**: the committed subject is always the newest selection; a late-arriving prepared neighbor
  never overrides a newer selection.
- **Cancellation + memory**: window entries outside `selected ± (W + hysteresis)` are evicted (LRU,
  priority-aware, §9). The window is bounded regardless of queue length.

**Queue mutation behaviors:**

| Event | Classification | Behavior |
|---|---|---|
| Queue **reorder** (sort change) | positions remap | Re-key positions; re-prepare the window around the *subject* (identity follows the subject, not the index) |
| Queue **filter change** | membership changes | Window destinations → **invalid**; re-resolve page + default subject |
| Queue **pagination** | new page | Prepare the new page's window; retain the current until commit |
| Queue **mutation** (field) | data change | Affected row → **stale** (commit + refresh) |
| **Selected subject deletion** | membership + identity gone | Selected destination → **invalid**; commit the *next valid* position's prepared destination (never a deleted subject, never a mixed frame) |

Stale vs invalid for the queue follows §11. The selected row and neighbors are "pages already loaded
around the current page."

### 6.1 Queue selection is a first-class Runtime Focus transition (Failure 2)

A Queue-row click is **not** a page/drawer open — it is a subject transition inside one retained Work
Unit. It must be atomic and immediate:

```
current subject → row intent → immediate ack → Runtime Focus moves → selected-row state + useful Focus Panel commit atomically
```

On pointer / keyboard / touch selection the runtime must: **acknowledge immediately**; **visually select
the intended row immediately**; **preserve Work Unit / Work View / queue**; **move only Runtime Focus**;
commit the matching Focus-Panel subject. It must never: show the old subject with the new row selection,
or the new subject with the old row selection; blank the panel; remount the Work Unit shell; show a
route-level loader; require hover. Selected row + Focus Panel remain **one atomic subject commit**. An
optimistic selected-row highlight is permitted **only** as *pending intent* clearly distinct from committed
truth — and is unnecessary when the adjacent subject is prepared (§6), because the commit is then immediate.

### 6.2 Queue selection state machine

```
committedSubject   — the authoritative committed Record of Attention; owns Focus Panel content, URL, Runtime Focus
intentSubject      — the immediate operator intent (row just selected); owns row highlight + a11y announcement + keyboard focus
preparedSubject    — an adjacency-prepared destination ready to commit (§6)
pendingSubject     — an intent whose destination is not yet prepared (preparing)
failedSubject      — a preparation that errored
```

Rules:
- `committedSubject` remains authoritative until an **atomic** new commit — Focus Panel never shows a
  half-committed subject.
- `intentSubject` records the latest selection immediately (drives the highlight); **latest intent always
  wins**; obsolete in-flight requests are cancelled/ignored; **no late response may restore a previously
  selected subject** (latest-wins by monotonic intent sequence, not row index).
- `preparedSubject` present → commit immediately (`intent → committed`, one frame).
- `pendingSubject` → hold the prior `committedSubject` coherent (or the canonical Thinking… state, §12) and
  commit atomically when prepared; **no partial mixed-subject transition**.
- `failedSubject` → return to the last coherent `committedSubject`; record why the adjacency scheduler
  missed (for §18).
- **Deletion** of the committed or intended subject resolves deterministically: commit the next valid
  position's prepared destination; never a deleted subject.
- **Queue reorder** must not confuse position identity with subject identity — selection identity uses the
  **canonical subject id**, never the row index.

**Which state controls what** (single owner each):
| Concern | Controlled by |
|---|---|
| Row highlight | `intentSubject` (immediate) |
| Focus Panel content | `committedSubject` (atomic) |
| URL | `committedSubject` |
| Runtime Focus (K2/K3 committed ref) | `committedSubject` |
| Accessibility announcement | `intentSubject` → then `committedSubject` on commit |
| Keyboard focus | `intentSubject` |

### 6.3 Queue selection performance contract

Measured **separately** from Workspace navigation (never averaged into a broader Work-Unit metric).
Metrics: intent acknowledgment · selected-row visual response · Runtime Focus commit · useful Focus-Panel
commit · full Settlement.

- **Prepared** (adjacent subject in window): ack ≤ 1 frame; selected-row visual ≤ 1 frame; Runtime Focus +
  useful Focus Panel commit **ideally < 100 ms, p75 ≤ 200 ms**; 0 blank frames; 0 continuity breaks; 0
  mixed-subject frames.
- **Unprepared** (outside window): immediate ack; prior coherent subject retained or canonical centered
  **Thinking…** (§12); no partial mixed-subject transition; prepare + atomically commit; **record why the
  adjacency scheduler failed to have it ready** (window too small / rapid traversal / eviction).

Certify (§17): (1) next row; (2) previous row; (3) rapid repeated clicks; (4) keyboard up/down + Enter;
(5) touch; (6) row outside the preparation window; (7) queue reorder during selection; (8) selected-record
deletion; (9) filter change; (10) Work-View change preserving subject; (11) Work-View change requiring a
new default subject; (12) Work ↔ Activity after row selection.

### 6.4 Queue ownership (exactly one owner per responsibility)

| Responsibility | Sole owner |
|---|---|
| Queue-row presentation contract | Published Surface (queue-row variant) |
| Selected Queue-Row variant | Work View assignment |
| Row collection + selection interaction | Queue Runtime |
| Committed subject | Runtime Focus |
| Nearby subject preparation | Preparation Runtime (§6) |
| Committed subject presentation | Focus Panel Runtime |

Delete/disable any legacy owner that independently controls: the selected row; a drawer subject; the Focus
Panel subject; queue-row fallback presentation; row-click fetching; or route navigation on row selection. A
row click must not behave like opening a page or drawer — it is a subject transition in one retained Work
Unit.

---

## 7. Focus Panel mode preparation (Mode Continuity)

The committed subject's configured Focus-Panel modes are prepared so **Work ↔ Activity is immediate** — no
remount, no skeleton, no new shell, no subject reconstruction, no mode-specific cold request during normal
operation.

- **Prepare**: the active mode + adjacent/commonly-used modes for the committed subject; the configured
  mode composition (published doc via `resolveSurfaceVariant`) and each mode's **commit-critical** data.
- **Shared truth (§9)**: modes share **subject identity, record projection, actions, relationship context,
  configuration revision** — one owner. Only **mode-specific presentation + card selection** differs. A
  mode destination is a *presentation over shared subject truth*, never a second truth owner. Switching
  modes rebinds presentation to the same `subjectRef`; it does not refetch the record.
- **No duplicate data**: Work and Activity for subject S reference the same `SharedSubjectProjection(S)`;
  the store holds one subject projection + N small mode presentations.

---

## 8. Work View adjacency preparation (Work View Continuity)

Within the active Work Unit, sibling Work Views are prepared before selection — switching a Work View
feels like **turning a page**.

```
Enrollment ├── Needs Attention ←active  ├── Waiting  └── Recently Completed
```

With `Needs Attention` active, prepare for `Waiting` and `Recently Completed`:
- the queue-row variant (may be **shared** across Work Views — one published variant, §EXP-3);
- the first **queue page** + its **default selected subject** (per the view's strategy);
- the **commit-critical Focus-Panel** state for each default subject.

Define:
- **Adjacency** = sibling lenses in display order under the process.
- **Shared variants**: multiple Work Views may resolve the same published queue-row/Focus-Panel variant;
  the destination references it once (dedup, §9). *(This is EXP-3: Work-View→variant assignment first-class,
  many-views-share-one-variant.)*
- **Filters**: each Work View's filter definition scopes its own page.
- **Subject preservation**: on switch, if the currently committed subject is a **valid member** of the
  target view, preserve it as the selection; else fall back to the target view's default-subject strategy.
- **Empty views**: prepare the authoritative-empty destination (workable, not a spinner).
- **Stale vs invalid**: filter-definition change → **invalid**; value change within members → **stale** (§11).

---

## 9. Shared data & deduplication

There must be **one authoritative runtime path** and no repeated preparation of the same truth.

```
SharedSubjectProjection(S)   ← one owner, one fetch
├── Work-mode presentation    (references S)
├── Activity-mode presentation (references S)
└── … other modes            (reference S)
```

- **SharedSubjectProjection**: the committed subject's record projection (identity, record VM inputs,
  actions, relationship context) — one owner, ref-counted by the mode destinations that use it.
- **Destination-specific presentation**: mode card selection + layout (published doc) — cheap, per mode.
- **Queue-row projection**: the resolved compact row context — shared by the queue and by hover.
- **Metric projection**: owned by the Metrics Runtime (§10), referenced by tiles/Header — not duplicated
  per destination.
- **Reference counting / reuse**: a shared projection is retained while any prepared destination references
  it; evicted when the last reference is evicted (§9 memory).
- **One canonical store**: Workspace, Work Unit, queue, Focus Panel, hover, and back/forward all consume
  the **same** PreparedOperationalDestination store and the **same** K2 resource identity. **No separate
  competing caches.** (This absorbs `workUnitProvisioningPrefetch` as the store's seed.)

---

## 10. Operational Metrics Runtime (+ the count-after-deletion bug)

Metrics are **continuously-updated operational projections**, architecturally **separate** from static
presentation configuration. The three planes:

```
Presentation Manifest          (static — compiled from published config; §15)
Prepared Operational Destinations  (commit-critical composition; §2)
Operational Metrics Runtime    (live values — counts, totals, calculations; §10)
```

A mutation (e.g. deleting a child or family lead) must update **every affected projection**:
Workspace process-tile count · Workspace summary metrics · Work Unit Header metrics · Queue totals ·
relevant calculations · affected destination `dataRevision`. It must **not** rebuild unrelated presentation
configuration.

Define:
- **Metric ownership**: one Metrics Runtime owns metric values; tiles/Header/totals are *subscribers/
  projections*, never independent owners.
- **Calculation ownership**: derived calculations are projections over the same runtime, invalidated by the
  same events.
- **Mutation invalidation + cross-surface fan-out**: a mutation carries an *entity + scope* key; the runtime
  fans out invalidation to exactly the projections whose scope includes it (tile, summary, Header, totals),
  and bumps the affected destinations' `dataRevision` (→ stale, §11). See the **root-cause map** below.
- **Revision tokens**: each metric projection carries a data revision; a subscriber renders the value at a
  revision and reconciles forward (never backward).
- **Reconciliation after mutation**: optimistic decrement/increment on the initiating client (immediate,
  correct-direction), reconciled to the confirmed server count; the two must converge (optimistic is a
  *hint*, confirmed is *truth*).
- **Multi-operator updates**: another operator's mutation is not locally observed → bounded refresh
  (subscription or short TTL) reconciles; never retains a known-wrong count indefinitely.
- **Bounded refresh**: coalesced, deduped (the existing `dedupeAdminFetch` / warm-cache dedup), scope-keyed.
- **Optimistic vs confirmed**: optimistic counts are labeled internally and always reconciled; a failed
  mutation **rolls back** the optimistic delta.
- **Deletion semantics**: a delete decrements membership counts AND invalidates any destination whose
  selected subject was the deleted record (→ **invalid**, commit next valid — §6).
- **Failure recovery**: on refresh/mutation failure, prefer the last confirmed value + a refresh retry;
  never silently keep an optimistic-but-unconfirmed count.

> **The system must not retain a known-wrong count to preserve presentation continuity.** Presentation
> continuity (no reflow) applies to *composition*, not to *values*: a value corrects in place.

### 10.1 Root-cause map — Workspace tile counts stale after deletion

Traced (read-only). There is **no revision token**; all metric refresh hinges on one browser event
**`OPPORTUNITY_QUEUE_UPDATED_EVENT = "adminv2:opportunity-updated"`**, gated by
`isQueueMembershipMutationActionKey(action_key)`. Three independent metric owners, each with its own cache:

| Surface | Owner | Cache | Refresh trigger |
|---|---|---|---|
| Work-View tile counts | `useWorkViewTotalsState` (`useWorkViewTotals.ts`) → `fetchQueueViewTotalsBatched` → `/api/admin/queue-view-totals` (live, exact) | `shortResponseCache` (4 s) + session totals seed (`skipFreshFetchRef`) | membership event → `refreshNonce`→scopeKey; else 4 s TTL |
| Process-tile cards + rollup summary | `loadOperatorLifecycleLandingCards` | module `cachedCards` + `dedupeAdminFetchWithTtl` (30 s) over `/work-unit-queue-summaries`, `/lifecycle-catalog`, … | membership event → `invalidateOperatorLifecycleLandingCache` + `bustLifecycleSiblingFetchDedupe`; else 30 s TTL |
| Header KPIs / card signals | `useOperationalAnswers` → `oipWorkspaceWarmCache` | module `entries` (90 s SWR) | membership event → `prefetchOipMetricsWarm({force})`; else 90 s TTL |

**The gaps (why a delete leaves counts stale):**
- **Gap A (primary):** the opportunity/lead delete runtime is server route `POST /api/admin/opportunities/[id]/delete`, but **no client code calls it and nothing dispatches `OPPORTUNITY_QUEUE_UPDATED_EVENT` after a delete.** All three owners refresh only off that event (or TTL) → counts served from un-invalidated caches until a TTL lapses or reload.
- **Gap B:** even if dispatched, the gate `QUEUE_MEMBERSHIP_ACTION_KEYS` includes `delete_lead` but **not `delete_child`**; child mutations dispatch `"inquiry_children_placement"` (a display-patch key), which never refreshes the metric owners.
- **Gap C:** the delete UI is a stub (`delete_child` `enabled=false`); the VM-drawer action path (`applyRegistryResolvedActionClient` → `/actions/execute` → `dispatchOpportunityQueueUpdated`) is bypassed by deletion.
- **Gap D:** `bustOperatorRuntimeReadCaches` does **not** clear the 4 s batched-totals `shortResponseCache`; and return-navigation re-paints the retained session surface + skips the fan-out (`skipFreshFetchRef`).

**Fix direction (this runtime, §10):** replace the single ad-hoc event + membership gate with a **revision-token metric runtime** where the delete runtime bumps the affected scope's `dataRevision` and fans out invalidation to every projection (tile / summary / Header / totals), busting *all* caches including the 4 s batched-totals cache — and connect the delete runtime to that fan-out (Gap A/C) with a classification (§11) that treats deletion as membership-affecting for `delete_lead` **and** `delete_child`.

---

## 11. Stale vs Invalid — classification matrix

**Stale**: composition/membership/authorization/identity remain valid; only *values* changed. **Committable
now**, refreshed in place. **Invalid**: composition, membership, authorization, or identity is no longer
valid. **Must not be committed** — re-prepare (fall back to the never-blank shell if needed).

| Mutation / event | Classification | Rationale / behavior |
|---|---|---|
| Field-value mutation (non-membership) | **stale** | value changed; commit + refresh in place |
| Status mutation (no membership move) | **stale** | value; refresh |
| Status mutation that changes Work-View membership | **invalid** | membership moved; re-resolve page/subject |
| Stage transition (moves the row between views) | **invalid** for source/target views | membership + possibly selection changed |
| Record **deletion** | **invalid** (for destinations selecting it / counting it) + **stale** (for unrelated value counts) | subject gone → commit next valid; counts decrement (§10) |
| Record **creation** | **stale** (counts) / membership add → re-resolve affected view page | new member; counts increment; page may gain a row |
| Queue **reorder** (sort) | **stale** (identity follows subject) | positions remap; window re-prepared around subject (§6) |
| Queue **filter change** | **invalid** | membership definition changed; re-resolve |
| Work View change (definition) | **invalid** | composition/filter changed |
| **Surface publication** (Header/Queue/Focus variant) | **invalid** | composition changed (§8); O(1) `configRevision` check |
| **Permission change** | **invalid** (+ possibly evict) | authorization scope changed (§1.4) |
| **Tenant / location scope change** | **invalid** (recompile graph) | scope changed (§1.6) |
| **Calculation refresh** (derived metric) | **stale** | value recomputed; refresh in place |

Doctrine: **prefer committing a `stale` destination over blocking; never commit an `invalid` one.**

---

## 12. Loading ownership model — one canonical preparation owner

Anticipatory preparation makes visible loading **uncommon**, not impossible. Cold cases remain: cold login,
deep link, expired/invalid snapshot, permission/config change, unusual destination, preparation failure,
network loss, restoration miss. All use **one** canonical preparation experience.

**Preferred continuity:**
```
prior coherent surface remains visible → atomic destination commit
```
**Fallback (nothing coherent to retain):**
```
stable app shell → centered "Thinking…" → atomic destination commit
```
**Never:**
```
blank → midnight-blue shell → second shell → skeleton → partial panel → final panel
```

**Visual contract (the one preparation owner):**
- exactly **one** stable application shell — never a second/nested shell, never a duplicate midnight-blue
  loading shell, never a blank canvas, never a loader-then-skeleton;
- the existing preparation visual, **centered in the usable operational canvas** and **materially
  enlarged**; primary copy **"Thinking…"**; optional secondary copy quiet + nontechnical;
- **one** preparation owner, one visual, one transition; respects reduced motion; `role="status"`,
  `aria-live="polite"`.

The runtime must have **exactly one canonical preparation owner** for operational navigation; every other
loading boundary on the operational path is deleted or subordinated to it (§13, phase I/J).

## 13. Duplicate midnight-blue loader — root-cause map

Traced (read-only). Scope correction: the operational path is entirely under `app/adminV2/workspace/**`
(`/workspace` + `/workspace/work-unit/{slug}` are rewrites). The "midnight-blue" is
`palette.midnightForge = #273F52` — the **sidebar rail + top-nav chrome** of `AlloyOperationalBootShell`
(`components/admin/workspace/AlloyOperationalBootShell.tsx`; its root/content are actually white). This one
component is the "shell."

**Three owners render `AlloyOperationalBootShell`:**
| # | Owner | File:line | Category |
|---|---|---|---|
| B | Route-level streaming fallback | `app/adminV2/loading.tsx:8` | Next.js `loading.tsx` |
| C | Client Suspense fallback | `app/adminV2/components/AdminV2Shell.tsx:319` | `<Suspense>` — suspends because `AdminV2ShellInner` calls `useSearchParams()` (`:100`) during hydration |
| D | No-org edge fallback | `app/adminV2/workspace/layout.tsx:69` | rare edge |

**Refresh sequence of `/workspace` — the duplicate:**
```
SHELL #1  app/adminV2/loading.tsx:8            → AlloyOperationalBootShell   (server auth/bootstrap streaming)
SHELL #2  AdminV2Shell.tsx:319 Suspense fallback → AlloyOperationalBootShell   (client hydration: useSearchParams @:100 suspends)  ← the DUPLICATE
then      real Sidebar/TopNav (also midnight) + WorkspaceSurfaceSkeleton "Preparing workspace" until model.ready
```
`BosExecutionLoader` ("Preparing workspace…") is embedded *inside* the boot shell (`AlloyOperationalBootShell.tsx:144`), so it too renders twice — reinforcing the duplicate impression. (The Work Unit surface itself is already cold-shell-free: `ProvisionedWorkUnitSurface.tsx:28` returns `null` until Focus commits.)

**Root cause:** two owners paint the **identical** `AlloyOperationalBootShell` — the route `loading.tsx`
(legitimate: covers the server auth/bootstrap window) and the `AdminV2Shell:319` Suspense fallback
(redundant: merely re-paints during client hydration when `useSearchParams()` suspends).

**Canonical owner that survives:** the route-level boot shell (`app/adminV2/loading.tsx`) — the single
preparation owner for the genuine server window. **Delete/subordinate the redundant `AdminV2Shell:319`
fallback**, OR hoist the `useSearchParams()` suspension (`:100`) so hydration no longer re-triggers the
full boot shell. Then subordinate `WorkspaceSurfaceSkeleton` to the same owner (§12: prior coherent surface
→ atomic commit, else one centered "Thinking…"). Phase **I** establishes the single owner; phase **J**
deletes the redundant one. Other loading owners on the path (`WorkspaceSurfaceSkeleton`,
`WorkUnitWorkspaceColdShell`, `workspaceRouteSkeletons`) are subordinated to or deleted by the canonical
owner. Retarget the surviving visual to §12's contract: centered, materially enlarged, **"Thinking…"**,
`role="status"` / `aria-live="polite"`, reduced-motion aware.

---

## 14. Security & resource-budget model (risk analysis)

| Risk | Mitigation (required) |
|---|---|
| **Stale operational truth** | commit-critical composition is revision-guarded (never wrong); values are stale-only + reconciled (§10/§11); never retain a known-wrong count |
| **Authorization leakage** | graph enumerated post-authorization (§1.4); never prepare a destination out of scope; permission change → recompile + evict/invalidate; preparation carries the operator's grants |
| **Preparation storms** | bounded concurrency; cancellation; viewport gating; debounce/coalesce; P4/P5 yield to P0/P1; adaptive window (§6) |
| **Excessive browser memory** | commit-critical only (no Settlement in store); priority-aware LRU; count caps; shared projections ref-counted (§9); window bounded regardless of queue length |
| **Server load amplification** | batch preparation (prepare-many, §Server); dedup/coalesce (existing warm-cache/dedup); idle-time only; skip P5 under load; per-operator budget |
| **Invalidation bugs** | explicit stale/invalid matrix (§11); O(1) revision checks on commit; single invalidation bus; certification (§17) exercises each row |
| **Snapshot identity collisions** | content-addressed `DestinationId` including graph+config+authz revision (§1.3/§2); no index-based keys (subject identity, not row index, §6) |
| **Multi-tab behavior** | per-tab store; revision tokens shared via storage events (optional); each tab reconciles independently; no cross-tab truth ownership |
| **Cross-operator mutations** | bounded refresh / subscription; optimistic local + confirmed server; never retain known-wrong (§10) |
| **Config-publication races** | monotonic `configRevision`; commit-time O(1) check forces re-prepare on mismatch (§8); publish invalidates before it can be committed stale |
| **Offline / intermittent network** | never-blank shell; preparation failures drop to re-preparable (never cache a failure); commit falls back to live/coherent-shell (§12) |
| **Hidden second truth owner** | one canonical store + one K2 resource identity (§9); phase J deletes competing caches; certification asserts single owner |
| **Excessive background calculation** | metrics are projections invalidated by scope-keyed events, not recomputed globally (§10); calculations lazy/deferred (Settlement) unless commit-critical |
| **Preparing sensitive data not yet opened** | prepare **commit-critical composition** only; do NOT prefetch Settlement (documents/communications/history) across the store — only the *committed* destination settles (§3/§9); respect field-policy authorization in preparation |

---

## 15. Settings compilation implications

Settings authors the **operational book**; the runtime **compiles** it. Future Settings work reduces to:

```
author configuration → publish revision → compile Operational Graph + Presentation Manifest → invalidate affected prepared destinations
```

Settings authors: Workspace graph, Work Units, Work Views, Surface assignments, queue variants, Focus-Panel
modes, actions, editability, default destinations, adjacency (where configurable). The runtime compiles
published config + authorization into the **Operational Graph** (§1) and a **Presentation Manifest** (the
static composition pointers) — so a new operational surface is *authored + published*, not *route-coded*.

**Configurable vs platform doctrine:**
- **Configurable** (author in Settings): graph membership, variant assignment, mode availability, default
  destinations, adjacency ordering, filters, editability, actions, grain.
- **Platform doctrine** (not configurable): the preparation runtime, the commit-critical/Settlement
  boundary, the invariants, the stale/invalid semantics, the single loading owner, the metrics-runtime
  ownership, `resolveSurfaceVariant` as the sole resolver, K1/K2/K3.

---

## 16. Phased implementation plan

### Implementation log

- **Phase A — Operational Graph · LANDED (enumerate-only, flag-gated).**
  - New owner: pure compiler + client materializer of the reachable-destination graph, compiled from
    authorized config — no second navigation registry.
  - Modules: `web/lib/runtime/graph/destinationId.ts` (§1.3 identity + store key), `operationalGraph.ts`
    (node/edge model, revision version-vector §1.4, adjacency accessors §1.2),
    `compileOperationalGraph.ts` (pure `graph = f(config, authz)`, content-addressed revision token),
    `materializeOperationalGraph.ts` (client nav tree + published Work Views → graph),
    `operationalGraphFlag.ts` (`NEXT_PUBLIC_OPERATIONAL_GRAPH`, default OFF — rollback boundary).
  - Invariant honored: finite & complete enumeration (one node-level destination per reachable
    (Work Unit, Work View)); authorization-scoped (unauthorized units are absent by construction);
    deterministic & content-addressed (identical input → identical `revisionToken`).
  - Tests: `web/tests/runtime/graph/operationalGraph.test.ts` (19 cases — enumeration, identity
    round-trip, revision dominance, adjacency, dedupe/order, materializer). Green.
  - Not yet: server-side graph compile + Presentation Manifest emission at login; commit ownership
    (the graph enumerates & schedules; it does not yet own commit — that arrives with Phases B/D).
  - Browser evidence: deferred — Phase A wires no surface (flag OFF). Certified when a surface consumes
    the graph (Phases D/E).

### Plan



Each phase: **new owner · legacy owner deleted · runtime invariant · browser evidence · performance
measurement · rollback boundary · exact stop condition.**

| Phase | Scope | New owner | Legacy deleted | Invariant | Browser evidence | Perf | Rollback | Stop condition |
|---|---|---|---|---|---|---|---|---|
| **A** | Operational Graph + Presentation Manifest | server graph compiler + client materializer | ad-hoc nav derivation | graph = f(config, authz); one revision | graph enumerates all reachable destinations; matches published config | compile time bounded | feature-flag the compiler; fall back to current nav | graph cannot be compiled from config+authz without a second registry |
| **B** | Canonical Prepared Destination Store | store (generalize `workUnitProvisioningPrefetch`) | the raw prefetch map | one store, one K2 resource identity | K2 commits from store; single resource path | warm-commit ~150ms preserved | keep prefetch as-is behind flag | a second cache is unavoidable |
| **C** | Workspace retained runtime | Workspace root runtime | disposable Workspace route remount | return-to-Workspace never reconstructs | back → retained Workspace instant, 0 blank | return commit time | retain behind flag | Workspace cannot be retained without breaking route semantics |
| **D** | Visible Work Unit preparation | scheduler P2/P3 + viewport | eager viewport prefetch guesswork | commit-from-prepared for visible tiles | visible tile click ~instant, 0 blank | prep concurrency bounded | flag off → live path | preparation storms uncontrollable |
| **E** | Work View adjacency preparation | scheduler P1 (views) | on-click view construction | sibling view switch = commit | Needs Attention ↔ Waiting immediate | switch commit time | flag | shared-variant dedup impossible |
| **F** | **Queue-row renderer fidelity correction** (Failure 1) | CRM enricher (`display_name`=name only) + runtime vocab (legacy aliases) | the `_primary_contact_line` composite as `display_name`; dropped legacy keys | renderer emits ONLY the authored supported fields; no phantom/dropped values | authored config ↔ runtime row match field-by-field (contact = "Taryn Wenc · email", no phantom phone) | payload unchanged | revert the 3 edits | the compact anatomy cannot express an authored field AND Settings still exposes it |
| **G** | **Queue selection state machine + atomic Runtime Focus commit** (Failure 2) | Queue Runtime selection SM (§6.2); Runtime Focus owns committed subject | any legacy owner of selected-row/drawer-subject/row-click-fetch/route-nav-on-select (§6.4) | one atomic subject commit; latest-wins; no mixed-subject; row-click ≠ page/drawer | 12-scenario cert (§6.3): next/prev/rapid/keyboard/touch/reorder/delete/filter/view-change/mode | queue-selection perf measured separately (§6.3) | flag the SM | a selection cannot commit atomically from prepared state |
| **H** | **Queue subject adjacency preparation** (window §6) | scheduler P1 (selected ± W) | on-select Focus-Panel construction | row±W prepared; latest-wins; no mixed subject; direction-aware | row 4→5 immediate; rapid traversal no storm | window memory bound | flag | cancellation/latest-wins not guaranteeable |
| **I** | **Focus Panel mode preparation** | mode presentation over SharedSubjectProjection (§7/§9) | per-mode cold request; mode remount | modes share one subject truth; no second owner | Work ↔ Activity immediate, no remount/skeleton | dedup: one record fetch/subject | flag | modes cannot share truth without duplication |
| **J** | Metrics Runtime + targeted invalidation | Operational Metrics Runtime (§10) | scattered metric caches / unwired deletion (§10.1 Gaps A–D) | one metric owner; mutation fan-out; no known-wrong count | delete a lead/child → tile/Header/totals correct immediately | invalidation fan-out bounded | flag → current metrics | correct fan-out impossible without a second owner |
| **K** | Canonical "Thinking…" preparation experience | single loading owner (§12) | route loading.tsx / nested Suspense / duplicate shells (§13) | exactly one shell; never-blank; no duplicate midnight-blue | refresh shows one centered Thinking… then atomic commit | shell transitions = 1 | keep old shells behind flag | a single owner cannot cover all cold cases |
| **L** | Delete duplicate loading + legacy preparation ownership | — | the redundant `AdminV2Shell:319` Suspense fallback (§13) + every non-canonical loader/shell/cache/route/flag/test/doc (§9, §6.4) | one owner per responsibility (config-runtime doctrine) | repo-search: no second loader/cache/owner | — | staged deletion | a legacy owner cannot be removed without regression |
| **M** | Certification + performance freeze | — | — | all invariants hold under cert | §17 + §6.3 browser cert green | §18 perf cert green | — | any invariant unverifiable |

Amended per the Queue Runtime Correction: **F** (fidelity, the Failure-1 fix — already landed and browser-
proven) and **G** (selection state machine, Failure 2) precede **H** (queue adjacency) and **I** (Focus mode).
Phases A→E pipeline once the store (B) and graph (A) exist; **F** is independent and already done; **G** depends
only on the current committed-subject path (not the full store); **H/I** depend on the store; **J** and **K** run
parallel to D–I; **L** follows the owner it replaces; **M** is last.

---

## 17. Browser certification plan

Certify each non-negotiable experience, each with 0 blank frames, 1 shell, no mixed subject:
1. **Workspace → Work Unit**: click → immediate ack → Header + Queue + selection + useful Focus Panel commit *together* (one atomic frame).
2. **Queue row → row**: select adjacent row → selected row + Focus Panel update immediately (row±W prepared); rapid traversal no storm, latest-wins.
3. **Focus mode Work ↔ Activity**: immediate switch, **no remount / skeleton / new shell / subject reconstruction** (assert same subject node identity across the switch).
4. **Work View Needs Attention ↔ Waiting**: immediate destination commit; subject preserved when valid, else default.
5. **Return to Workspace (back)**: retained Workspace appears immediately (no reconstruct, 0 blank).
6. **Cold fallback** (deep link / expired snapshot / cold login): stable shell → centered enlarged **Thinking…** → atomic operational commit; **exactly one shell**, no duplicate midnight-blue.
7. **Deletion correctness**: delete a child/lead → no stale selected record; tile/Header/queue-total counts correct immediately (§10).
8. **Config publication**: publish a variant → next commit reflects new composition (O(1) revision check); no stale composition committed.
9. **Permission change**: out-of-scope destination not preparable/committable.
Instrumentation reuses `runtimeStatRunner` (ack/legible/commit/blank_frames/continuity_breaks/op_first_sight)
+ DOM identity assertions (subject node identity across mode switch; single `[data-…-shell]`).

## 18. Performance certification plan

Production-like warmed build (`next build` + `next start`, not dev/Turbopack). Report **p50/p75/p95/max**
for each, per input mode (intent-prefetched, immediate click, keyboard, touch, deep link, back/forward,
cache miss, expired, prep failure):
- **ACK, LEGIBLE, Operational Commit, commit-critical coherence, Focus-Panel first meaningful content,
  full Settlement**; **server compose**; **request count / duplicate count / payload bytes**.
- Preparation budget: prepared destinations held (count/bytes), preparation concurrency, cancellation
  rate, prep-hit ratio on commit, storm guard (max concurrent prep).
- Targets: intent-prefetched near-instant; **no multi-second blank on cold**; commit-critical fast enough
  for continuity; Settlement after. No material regression vs the current baseline; store memory bounded.
- Freeze: once green, the preparation runtime is frozen except by the same phased, certified process.

---

## Invariants preserved (non-negotiable)

1. **One atomic Preparation answer per destination** — the destination *is* that answer; K3 commits it whole.
2. **Latest-wins** — a newer valid destination supersedes; commit uses the latest valid, never superseded.
3. **No mixed-subject frame** — a destination is internally coherent; refresh swaps whole destinations.
4. **One canonical resource path** — Workspace, Work Unit, queue, Focus Panel, hover, back/forward all
   consume the same store + K2 resource identity. No second cache, no compatibility path.
5. **Never-blank** — any miss/preparing/invalid commits a coherent prior surface or the single Thinking…
   shell; never blank, never a duplicate shell, never a mixed subject, never a required hover, never a
   stale selected record after deletion, never a wrong metric count after mutation.

## Relationship to shipped work
- `workUnitProvisioningPrefetch` (144 ms) → seed of the **Prepared Destination Store** (§2, phase B).
- `workUnitEntryResourceClient` → the **commit reader**; unchanged contract, reads the store first.
- Cold-path parallelism (records ∥ presentation ∥ composition; queue ∥ header) → makes each prepared
  destination cheap to compose ahead of time (§Server, phase D).
- `resolveSurfaceVariant` → sole applicability resolver; `configRevision` is its coherence key (§8).
- The commit-critical/Settlement boundary (U-P7 / U-S*) → §3, already the shape of `ProvisioningAnswer`.
- EXP-3 (Work-View→variant assignment, many-views-share-one-variant) → §8 shared variants.
- EXP-4 (Workspace runtime continuity) → §4 retained Workspace.
- The Work Unit Configuration Runtime Constitution → the composition owners this runtime prepares.
