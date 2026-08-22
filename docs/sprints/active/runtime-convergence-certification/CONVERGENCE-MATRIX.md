---
owner: platform
status: sprint
last_reviewed: 2026-08-21
supersedes: []
---

# Live convergence matrix — what updates when canonical truth changes

Evidence for ledger items **2 (live convergence)**, **8 (counts/KPIs)** and **9 (cross-surface truth)**.
Doctrine stays in
[`operator-runtime-performance-certification.md`](../../../platform/runtime/operator-runtime-performance-certification.md);
this file is the measurement.

**Substrate.** Firefly Early Learning on `:3015`, lane HEAD `46680f333` (the accepted Priority 1
commits). Every mutation below was performed through the real operator UI with real keystrokes, and
every one was **restored to its exact original value and the restoration proven**.

**Instrument.** `web/scripts/rcConvergence.mjs` — patches `window.dispatchEvent` to record the
SIGNAL each mutation emits (rather than subscribing, which can only see events someone already wired),
records every request against a phase marker, and tracks document replacement, `location.reload`,
history writes and surface mount identity.

## 1. Mutation matrix

| # | Mutation / fact | Canonical write owner | Signal emitted | Current convergence | Affected projections that converged | Request blast radius | Refresh required? | Defect |
|---|---|---|---|---|---|---|---|---|
| **A** | Child profile field (`child.special_instructions`) | `focusPanelMutation.saveInquiryChild` → `PATCH /api/admin/customer-members/{id}` | `adminv2:opportunity-drawer-record-patch` ×2, `adminv2:layout-runtime-body-record-patch` ×2 | **IMMEDIATE_LOCAL** | Children card (optimistic, then confirmed) | **1 request total.** 0 follow-up GET, 0 RSC, 0 document loads | no | none — optimal |
| **A2** | Child **name** (`child.last_name`) | same owner → same PATCH | same two record-patch signals — **no `adminv2:opportunity-updated`** | **IMMEDIATE_LOCAL** for the owning card; **STALE_UNTIL_MANUAL_REFRESH** everywhere else | Children card only | 1 request | **yes, for the other surfaces** | **DEFECT 2** |
| **B** | Waitlist placement position | `WaitlistPlacementAdjustControl` → `POST /api/admin/placement-candidates/{id}/manual-position` | `adminv2:opportunity-updated {action_key:"placement_manual_order"}` | **BROADCAST** → KPIs + drawer only | OIP KPIs (`metrics/resolve`), Focus Panel record VM | apply 3, reset 7 (incl. `forms`, `drawer-recipients`, `delivery-subjects` — unrelated) | **yes, for rows/order** | **DEFECT 1** |
| **C** | Work item state | `dispatchOperationalWorkRefresh` (`lib/workItems/operationalWorkRefresh.ts`) | `adminv2:opportunity-operational-tasks-refresh` + `dispatchOpportunityQueueUpdated(id, kind)` (+ processing/comms variants) | **EVENT_DRIVEN**; launcher badge additionally **BOUNDED_POLL 120 s** | badge counts, drawer task strip, MyTasksPanel | not measured live | no | see note |
| **D** | Processing review | same owner, `kind:"processing_review"` | `adminv2:processing-queue-refresh` + `warmProcessingQueueCache({force:true})` | **EVENT_DRIVEN + warm-cache force** | exactly **one** subscriber: `app/adminV2/components/MyTasksPanel.tsx` | not measured live | unknown beyond that subscriber | latent |
| **E** | Operations / roster | — | — | **not exercisable** — Firefly's operating day is empty (0 children expected, 0 staff scheduled), so no roster row exists to mutate | — | — | — | see §5 |
| **F** | Organization config (Program name) | `POST /api/admin/configuration/programs` | `publishConfigurationInvalidation("programs")` + `invalidateProgramsCollection` (in-module bus) | **TARGETED_INVALIDATE + REFETCH** | the configuration editor/list, and any mounted subscriber | `update_draft` + `validate_draft` + `publish` + 1 GET (+ 1 RSC, now removed) | no | **NOT a defect — see §3b** |

C and D are **code-certified, not live-certified**: the Work Items row markup would not bind to a
deterministic locator inside the probe budget, and Processing mutations are document reviews that are
not safely reversible on Firefly. Their owners and signals are read from source and stated as such.

## 2. DEFECT 1 — the Work Unit queue subscribes to nothing

Kelly's Mutation B asked whether the P1 signal updates **rows AND counts**. It updates **counts, not rows.**

The Priority 1 fix is sound and is now **live-proven**: adjusting a waitlist position emits
`adminv2:opportunity-updated{placement_manual_order}` with **0 document loads, 0 RSC requests and no
remount**. `window.location.reload()` is gone. But the reload it replaced also guaranteed the operator
saw the new order, and that half did not survive.

Three independent proofs:

1. **Live (B).** `POST … /manual-position` returned `200 {"ok":true,"override":{override_kind:"pin",
   payload:{pin_ordinal:1},is_active:true}}`. The broadcast fired. Follow-up traffic was
   `metrics/resolve` + the drawer VM. **No `provisioning-answer`, no `queue-view-totals`, no
   `work-unit-queue-summaries`.** A fresh server read still returned `3/12 mode=live`.
2. **Live (A2).** Renaming a child updated the Children card while the **Assignments card on the same
   Focus Panel** and the **queue rows behind it** kept the old name — two names for one child on one screen.
3. **Code.** `shouldRefetchWorkUnitQueueRowsForEvent`, `shouldRefreshQueueSummariesForEvent` and
   `shouldPatchWorkUnitQueueRowsForEvent` are exported, documented and unit-tested, and have
   **zero production callers**. The current route
   `app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx` (71 lines) registers no listener.

**Why nobody noticed.** `tests/admin/opportunityInquiryChildrenQueueRefresh.test.ts` asserts the
work-unit page contains `shouldRefetchWorkUnitQueueRowsForEvent` — but it reads
`app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`, **which no longer
exists**. The guard that would have caught this now reads a deleted file.

Only **three** listeners exist on the canonical bus, and none owns queue rows:

| Listener | Converges | On |
|---|---|---|
| `useOperationalAnswers` | OIP metric KPIs | membership-changing keys → `prefetchOipMetricsWarm(force)` |
| `useWorkspaceSurfaceRuntime` | workspace landing cards + Work View totals | membership keys → bust caches, bump nonce (**only while `/workspace` is mounted**) |
| `useRecordWorkRuntime` | Focus Panel record VM | `planRecordWorkRefresh(actionKey)` |

## 3b. CORRECTION — Organization config was NOT a convergence defect

The Priority 2 audit recorded "no canonical signal is emitted" and "3 POSTs for one name change".
**Both were wrong, and the record is corrected here rather than quietly restated.**

- The save **does** publish canonical invalidation: `invalidateProgramsCollection(orgId, …)` plus
  `publishConfigurationInvalidation("programs", …)`, and the workspace's own
  `subscribeConfigurationInvalidation` listener reloads on it — that listener's `reload({force:true})`
  IS the single follow-up GET that was measured. Convergence was already correct.
- The three POSTs are three **distinct operations** on one endpoint, proven by their bodies:
  `{"action":"update_draft"}`, `{"action":"validate_draft"}`, `{"action":"publish"}`. A
  draft → validate → publish lifecycle, not a triple write.

**Why the audit got it wrong.** The probe tap patches `window.dispatchEvent` and therefore sees only
`window` CustomEvents. `publishConfigurationInvalidation` is an in-module pub/sub bus, so a working
canonical signal was invisible to the instrument and read as "no signal at all". *An instrument that
cannot observe a mechanism reports its absence.* The harness now says so in its own header.

The one real (small) finding survives: the editor's Continuity URL sync called
`router.replace(href)` even when `href` was the address already displayed, and the App Router issues
an RSC round trip for that. Guarded now — the sync only runs for a **different** href — which removes
the RSC without touching the convergence contract.

## 3. DEFECT 2 — a record patch does not reach the projections that copy the record's facts

`saveInquiryChild` dispatches only `dispatchOpportunityDrawerRecordPatch` +
`dispatchDrawerLayoutRuntimeBodyRecordPatch`, and emits `adminv2:opportunity-updated` **only** when the
patch touches waitlist-affecting participation fields. A profile-only save (special instructions,
allergies, medical notes, gender) and an **identity** save (first/last name) therefore emit no queue
signal at all.

For A that is correct — nothing else displays the fact, and `/api/admin/records/children` does not carry
it. For **child name** it is a defect: the name is displayed in queue rows, the Assignments card,
Records and Operations.

The same mutation also has **two owners with different contracts** — case-grain
(`focusPanelMutation.ts`: optimistic patch + confirm) and durable-child grain
(`buildDurableChildFocusPanelMutation.ts`: no optimistic patch, no event, just `onSaved()`) — which is
the situation Law 26's corollary forbids.

**Corroboration in live data.** One Firefly child renders as `Lennon Kurzman` in the record surfaces and
as `perf-probe-1787311039569 Kurzman` in the placement projection. That projection is **not cached** —
a rename appears in it within the same second and reverts on restore (proven) — so this is a second,
divergent copy of the name, not staleness. It is served on **every `/workspace` load**.

## 4. Counts / KPI matrix

| Count / KPI | Canonical truth | Computation owner | Mutation that changes it | Invalidation signal | Current trigger | Latency | Can it stay stale? |
|---|---|---|---|---|---|---|---|
| Workspace KPIs (Needs attention, Overdue work, Pipeline Children) | OIP metrics | `useOperationalAnswers` → `/api/admin/metrics/resolve` (warm cache) | any membership-changing key | `adminv2:opportunity-updated` | **TARGETED_INVALIDATE + REFETCH** (live-proven in B) | immediate | no |
| Work View totals (Waitlist 16, All 1, …) | queue view totals | `useWorkViewTotals` → `POST /api/admin/queue-view-totals` (batched, one request for all pills) | membership keys | workspace `refreshNonce` folded into the scope key | **TARGETED_INVALIDATE**, but **only while `/workspace` is mounted** | immediate on workspace | **yes** — on a Work Unit route nothing re-resolves them |
| Queue summaries | `…/work-unit-queue-summaries` | work-unit surface | membership keys | *(policy exists, unwired — DEFECT 1)* | **STALE_UNTIL_MANUAL_REFRESH** | — | **yes** |
| Work Items launcher badge | `/api/admin/operational-tasks` summary | `useOperationalTasksNavCounts` (+ session cache) | work-item lifecycle | `adminv2:opportunity-operational-tasks-refresh` | **EVENT_DRIVEN + BOUNDED_POLL 120 s** | ≤120 s worst case | no |
| Communications unread badge | `/api/admin/communications/unread-count` | `useInboxUnreadNavCount` (+ `alloy:inbox:unread-count:v1` cache) | inbound message / read | — | **BOUNDED_POLL 120 s** | ≤120 s | no |
| Processing counts (Active Work, Needs Review, Published) | processing queue | `warmProcessingQueueCache` | processing review | `adminv2:processing-queue-refresh` | **EVENT_DRIVEN + warm force**, one subscriber | immediate for that subscriber | latent elsewhere |
| Records totals | `/api/admin/records/children` (`total`) | route | child add/remove | `child.add` broadcast | **BROADCAST** | immediate | no |
| Work Items sidebar (Folders / Views / Sources) | operational tasks | Work Items workspace | selection **and** mutation | — | **filter-relative recompute** | immediate | see below |

The polling inventory is small and deliberate: exactly **two** 120 s polls
(`useOperationalTasksNavCounts`, `useInboxUnreadNavCount`). There are no other count polls.

**Counts that disagree with each other.** On one screen the Work Items KPI row reads `1 Assigned /
1 Overdue` while its own Views list reads `Mine 0 / Overdue 9`, and the sidebar totals change when a
view is selected (`All Work` 11 → 10, `Overdue` 9 → 8). These are different scopes sharing one label,
not a convergence failure — but they are an operator-facing contradiction and belong to Priority 3.

## 5. Cross-surface truth

| Fact | Truth owner | Surfaces displaying it | Mutation owner | Freshness contract per surface |
|---|---|---|---|---|
| Child special instructions / allergies / medical notes | `customer_members` | Children card only | `saveInquiryChild` | **IMMEDIATE** (single surface — no contract needed) |
| **Child name** | `persons` / `customer_members` | Children card, Assignments card, queue rows, Records, Operations | `saveInquiryChild` | Children card **IMMEDIATE**; every other surface **"until the user refreshes"** — *not an acceptable contract* |
| Waitlist position / order | placement overrides → derived at load | queue rows, Focus Panel, KPIs | `manual-position` | KPIs **ON TARGETED INVALIDATION**; drawer **ON TARGETED INVALIDATION**; **rows have no contract** |
| Work-item state | operational tasks | launcher badge, Work Items workspace, drawer strip, MyTasksPanel | `dispatchOperationalWorkRefresh` | **ON TARGETED INVALIDATION + BOUNDED POLL (120 s)** — explicit and adequate |
| Program (configuration) | `configuration/programs` | config editor; consumed by Enrollment/queue vocabularies | config POST | editor **ON TARGETED INVALIDATION**; mounted subscribers **ON TARGETED INVALIDATION**; unmounted consumers **ON NEXT OPEN** (collection cache invalidated) |

## 6. Request blast radius

| Action | Requests | Classification |
|---|---|---|
| Child field save (A) | 1 PATCH | **EXPECTED TARGETED** — the floor |
| Placement apply (B) | 1 POST + `metrics/resolve` + drawer VM | expected targeted, but **incomplete** (rows missing) |
| Placement reset (B) | 7, including `forms`, `drawer-recipients`, `delivery-subjects` | **REDUNDANT / UNRELATED** — a placement order change does not alter form or recipient vocabulary |
| Program rename (F) | `update_draft` + `validate_draft` + `publish` + 1 GET (RSC now removed) | **EXPECTED TARGETED** — three distinct operations, not a triple write (correction, §3b) |
| `/workspace` root load | **6 unscoped** `provisioning-answer` prefetches, one of them **222 KB** | **BROAD** — Priority 3 |
| Open one Work Unit | **5 scoped** `provisioning-answer` (one per Work View: 4 × ~10 KB + 1 × 108 KB) + 30 other API calls | **BROAD** |

The five per-open `provisioning-answer` calls are **five distinct `work_view_id` queries, not
duplicates** — stripping the query string makes them read as one repeated call, which is the exact
false finding the previous phase recorded.

## 5b. LIVE CERTIFICATION (managed runtime on current HEAD)

The managed dev server was rebound to this lane's HEAD and **proved** to be serving it before any
browser evidence was accepted: the served client chunk `lib_presentation_a6aaa381._.js` contains
`subscribeWorkUnitConvergence`, which exists only at this HEAD.

### Work Unit convergence — CERTIFIED

| | before the fix | after |
|---|---|---|
| signal | `placement_manual_order` | same |
| queue rows (`provisioning-answer`) | **not refetched** | **refetched** |
| totals (`queue-view-totals`) | **not refetched** | **refetched** |
| KPIs / record VM | refetched | refetched |
| document loads / RSC / remount | 0 | **0** |
| selected subject | — | **preserved** (SUBJECT-scope re-commit) |
| restore | — | exact, all 16 positions |

### Child identity — root cause PROVEN, residue REMOVED

The census used the product's own read-only endpoint
(`GET /api/admin/opportunities/{id}/placement-candidates`) plus a live rename, not SQL.

Candidate `ba8cdcf5` had **both** `customer_member_id` and `person_id` set, and its metadata held no
probe string — so the earlier "orphaned candidate / metadata fallback" hypothesis was **wrong**.
Renaming the last name changed the projection to `perf-probe-1787311039569 KurzmanRC`, which proves
the projection composes `persons.first_name + persons.last_name`.

**Class: DUPLICATE WRITABLE IDENTITY TRUTH, caused by a read/write owner split.**

- `patchInquiryChildIdentityFromDrawer` writes **`persons`** when the child is person-linked, and
  never touches `customer_members` (exclusive branch).
- The Children card, the drawer VM, the durable-child subject and `/api/admin/records/children` all
  read **`customer_members`**.
- Only the placement projection reads `persons`.

So the first identity edit diverges the two copies, the divergence is invisible on every surface the
operator normally uses, **and it cannot be repaired through the UI**: the editor's baseline is the
member copy, so typing the correct value produces no write at all. That is exactly how
`perf-probe-1787311039569` survived — a prior probe wrote `persons`, and every later attempt to
"restore" it was a silent no-op.

Repaired through the canonical mutation owner (`PATCH /api/admin/persons/{id}`, the same org-scoped
route the Children card itself calls, which recomputes `full_name`). Verified: projection, row title,
Records, persons scan all read `Lennon Kurzman`; **0 of 20 candidates now mismatch**.

### Identity convergence — PARTIAL

`inquiry_child_identity` is now registered as label-changing (the set is documented as "membership,
sort order, OR ROW LABELS/COUNTS"). With it: queue rows converge, totals converge, `0` document loads
and `0` RSC, restore exact.

**Still stale: the Assignments (`scheduling`) card.** Its memos are correct
(`evidence ← context`, `subjects ← [evidence, context.truth]`), so the patched truth is not reaching
sibling cards — meaning the Children card was showing its OWN optimistic edit rather than converging
from `dispatchOpportunityDrawerRecordPatch`. Open defect, precisely localized, not guessed at.

## 6b. Probe hygiene — what this program left on Firefly, exactly

| Probe | Live truth after restore | Residue |
|---|---|---|
| A / A2 child fields + name | exact original, verified by re-read | none |
| B waitlist placement | all 16 positions identical, no active overrides | none |
| F Program name | `draft.label = "Toddler"`, list and consumers correct | **two revisions named `Toddler RCPROBE` in the object's version history — permanent** |

The Program residue is version HISTORY, not divergent truth: publishing a restore appends a revision
rather than removing the one before it. That is the object behaving correctly and the PROBE being
wrong to treat it as reversible. Frozen as law 33, and enforced in the harness:
`assertReversibleTarget` now refuses a publication-versioned target, and `assertRestored` fails a
probe that verifies only the surface it edited.

The pre-existing `perf-probe-1787311039569` name is the same failure one generation earlier — a
prior probe restored the child in the card it was editing and never checked the placement projection.

## 7. Priority 3 (Operations) preparation

- Firefly's operating day is **empty** — 0 children expected, 0 staff scheduled, all four Operations
  KPIs zero. Operational mutations have no subject; a live Operations convergence pass needs seeded
  roster data first.
- Assignments is the reachable operational surface: the Assignments card reports *16 children · no
  assignment yet · needs a room*, and it is one of the surfaces proven stale by DEFECT 2.
- `/workspace` prefetching six unscoped provisioning answers (222 KB for waitlist alone) is the largest
  single payload item found.

## 8. Priority 4 (Communications) carried forward

Unchanged and untouched by this pass: `TemplatesWorkspace` / `AnnouncementsWorkspace` duplicate
canonical-loader ownership, status options, the Activity early-switch cascade, the timeline duplicate
fetch and the oversized activity payload.
