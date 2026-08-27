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

## 5c. IDENTITY OWNERSHIP — implemented and live-certified

**Root cause (corrected twice, each time by evidence).** The resolver was always person-first. It could
never behave that way because the person was not loaded:

| path | why the person was missing |
|---|---|
| `opportunityEntityRecord` drawer-record build | `pmap` constructed **empty** and never filled |
| `opportunityEntityRecord` full hydrate | member-linked persons **deferred** to Pass 6; only opportunity-ROLE persons prefetched |
| `childGrainProcessInstanceQueue` (row title) | `person_id` selected, `persons` never joined |
| `composeDurableChildSubject` | member row read directly; member facts documented as overriding person on shared keys |
| `/api/admin/records/children` | member row read directly |

`resolveInquiryChildIdentityFields` returns the member mirror when the person is absent, so each of
these silently *changed ownership* rather than deferring a value.

**Live certification.** One rename that writes **only** `persons`, with the member still holding
`Lennon`:

| projection | before fix | after fix |
|---|---|---|
| Children card | `Lennon` (mirror) | **`LennonQA`** |
| Assignment card | `Lennon` | **`LennonQA`** |
| Records | `Lennon` | **`LennonQA`** |
| placement projection | `LennonQA` (was always right) | `LennonQA` |
| queue row title | `Lennon` | **`LennonQA`** |
| Focus Panel header | `Lennon` | **`LennonQA`** |
| queue rows outside the panel | `Lennon` | **`LennonQA`** |

0 document loads · 0 RSC · restore baseline read `LennonQA` (**the person copy**, so the silent
restore no-op is now impossible) · final state byte-equal to pre-state · mismatch detector clean.

**Assignment closed** — it converged with no Assignment-specific state and no callback from Children,
exactly as the instruction required. Its earlier staleness was never an Assignment defect; it was
reading the same mirror as everyone else.

## 5d. `customer_members` name fields — classification (step 5, nothing deleted)

| field | class | still consumed by |
|---|---|---|
| `display_name` | **canonical for a personless child**; compatibility fallback otherwise | every child surface via the shared resolver's fallback branch; `NOT NULL` in schema |
| `first_name` / `last_name` | same | the fallback branch; Add Child seeding; personless certification children (most of Firefly) |
| `dob` | same | fallback branch + age display |

Not deprecated and not a migration target yet: on this tenant **16 of 20** waitlist candidates are
personless, so a projection keyed on `persons` would empty the surface — the original Records
rationale was right about that. What changed is only that they may no longer outrank a Person that
exists. Destructive cleanup, if ever, is a separate governed migration.

## 5e. Placement pins — classified (step 7), ordering unchanged

Two active pins: `698f850a` (Wrigley, `pin_ordinal 1`, row at **2/12**) and `94984f6c`
(PassA, `pin_ordinal 2`, **no row at all**). Neither was created by this program — every probe pin
targeted `9e230cf8` and was released and verified.

- `94984f6c` is a **duplicate candidate that projects no row**, so its pin can affect nothing. The
  census shows 20 candidates producing 17 rows: Wrigley, PassA and Lennon each have two.
- `698f850a` is the real case. Live: pinning `9e230cf8` to ordinal 1 returned `200` with a persisted
  active override and the row stayed at `3/12` — twice.

The override→ordering machinery **exists** (`applyPlacementCandidateOverrides` splices a
`manualPrecedence` into the sort tuple), but the child-grain waitlist projection
(`placementWaitlistCandidateRowProjection`) carries **no `active_override_kinds` field at all**, so
`rowHasManualPinOverride` is always false. The one thing a pin can still do — render
`runtime_position_precedence_note` ("Ranked below manually adjusted row(s)") — is therefore also
unreachable, and that note only renders in shadow mode regardless.

**Class: the UI promises behaviour the runtime does not provide.** The operator gets neither the
reordering the control's vocabulary implies ("Adjust position", "Apply position", "Hold position")
nor the explanation the note was written to give. Ordering was deliberately **not** changed here: the
system's own help text says position "is calculated from the current priority rules and filters. It is
not a permanent stored rank", and the precedence note exists precisely to describe a pinned row that
ranks below others — so whether a manual pin should outrank priority is a placement-policy decision,
and shipping it would silently reorder a live tenant's waitlist. Surfaced, not decided.

## 5f. Work Items counts — classified (step 8)

| label | query owner | scope | user filter | status | overdue definition | selection-dependent | denominator |
|---|---|---|---|---|---|---|---|
| KPI `Assigned` | `WorkItemsKpiStrip.deriveQueueAssignmentCounts` | org | **anyone** with `assigned_to_user_id` | open | — | no | `operational_tasks` only |
| KPI `Waiting` | same | org | no assignee | open | — | no | `operational_tasks` only |
| KPI `Due Soon` / `Overdue` | `summarizeOperationalTaskCounts` | org | none (`userId: ""`) | open | `due_at < now` | no | `operational_tasks` only |
| View `Mine` | `workItemQueueScope` | org | **current user** | open | — | yes | all sources |
| View `Overdue` | `workItemQueueScope` | org | none | open | `due_at < now` | yes | all sources |
| Folders / Sources | `workItemQueueScope` | org | none | open | — | **yes** | all sources |

**Class: VALID DIFFERENT METRICS / BAD VOCABULARY — plus one real denominator defect.**

- `Assigned 1` vs `Mine 0` are not in conflict: one counts work assigned to *anyone*, the other work
  assigned to *me*. The words do not say so.
- `Overdue 1` vs `Overdue 9` is the same word over two different denominators: the KPI strip counts
  only the `operational_tasks` table, while the queue beneath it aggregates Processing (8) and
  Communications (2) work as well. Proven empirically — the summary endpoint returns `open: 1` while
  the queue lists 11.
- Sidebar totals changing on selection is correct behaviour (they describe the filtered set), but they
  are rendered like absolute totals.

**Fixed here:** `summarizeOperationalTaskCounts` derived its numbers by listing open tasks with
`limit: 200` and measuring the array, so `open` silently saturated at 200 and `overdue`/`due_soon`
counted only what fitted on that page. Now three exact `count: "exact", head: true` queries. A badge is
a denominator claim; it has to be counted, not sampled.

**Not forced to match, per instruction.** The remaining item is vocabulary: the KPI strip sits directly
above a queue it does not describe. Recommendation — either scope the strip to the same multi-source
row set the queue uses, or label it for what it counts ("Tasks" vs "Work Items"). That is a product
vocabulary decision, not a convergence defect.

## 5g. Duplicate placement candidates — classified; prevention shipped, repair gated

**Classification (all three sets identical in shape).**

| child | candidate A | candidate B |
|---|---|---|
| Wrigley | `0cad23a8` `infant` — no row | `698f850a` `infant_0_18_months` — projects, **pin 1** |
| PassA | `ee36c3b1` `infant` — **projects** | `94984f6c` `infant_0_18_months` — no row, **pin 2** |
| Lennon | `27de6932` `toddler` — no row | `ba8cdcf5` `toddler_2_3_years` — projects |

Each pair shares `customer_member_id`, `process_instance_id`, `source` and `status: active`, and
differs only by cohort key — a raw group label beside its normalised key.

**Class: cohort-transition residue from missing uniqueness enforcement on the semantic subject.** The
seed key `pc_v1_pi:{opp}:{member}:{cohort}` embeds the cohort, so a normalisation produced a key the
idempotency check had never seen and the path inserted a rival. Deterministic, but not stable.

This also explains the pins. Only one of a pair projects, so a duplicate is invisible until something
attaches to it: **PassA's pin sits on the candidate that does not project**, so that pin could never
have had an effect regardless of how the ranking was written. Wrigley's pin is on its projecting
candidate — that one is the genuine Decision 2 case.

**Shipped: prevention.** All three creation paths consult the subject, not only the seed key; a cohort
change moves the incumbent (preserving `wait_since` and any override), and a failed move never falls
through to the insert it exists to prevent. Guarded, positive-controlled.

**Not shipped: repair of the existing rows — deliberately gated off.** The survivor rule needs to know
which candidate the PROJECTION resolves. The ensure pass derives the raw cohort (`infant`, `toddler`)
while the projection resolves the normalised one for Wrigley and Lennon and the raw one for PassA, so
the two disagree. Wired into the read path, that repair **oscillated on live tenant data**: one pass
retired PassA's projecting candidate, the next reinstated it and retired Lennon's. Both passes were
ordering-neutral (17 rows, identical order and candidate ids throughout) and Firefly was returned to
exact baseline — 20 active, zero markers, both pins intact — by a rollback that undoes only this
repair's own marker.

**The remaining design gap, stated precisely:** the survivor must be chosen by the same cohort
resolution the projection uses, not the one the ensure pass derives. Until those two agree, a
duplicate repair cannot know which row is live. That is the work Decision 1 still needs, and Decision 2
is blocked behind it by its own sequencing ("Do NOT fix this until duplicate candidates are
reconciled").

## 5h. INCIDENT — cohort data regression on Firefly (open, needs Director repair)

**What I changed.** Decision 1 removed the cohort from the candidate key
(`pc_v2_subject:{opportunity}:{customer_member}`). Existing rows carried the old cohort-bearing key,
so the design was that they would miss on seed key once and be MOVED onto the stable key by the
subject-uniqueness check — an identity migration that preserves `wait_since`, overrides and history.

**What went wrong.** The move wrote the cohort as well as the key. Because the key format changed for
*every* candidate at once, a single Work View read rewrote every stored cohort to the ensure-derived
value — and ensure, lacking a program key or OCM context, resolves `unknown_program_room` for most.

**Damage, measured:** 14 of 17 candidates now store `unknown_program_room`, and the waitlist
re-sectioned from **12 / 1 / 2 / 1 / 1** to **infant 2 / unspecified 14 / toddler 1**. Stable across
repeated reads; no further drift (the move now writes identity only, shipped).

**What is NOT damaged:** all 17 children still project, no candidate was deleted, all 20 candidates
remain `active`, and both pins are intact on their original candidates.

**Why I did not attempt a third repair.** Restoring requires each candidate's original
`program_room_cohort_key`, and I hold those for only a few. Re-deriving them from DOB is a guess, and
guessing on live tenant data is what produced this. Two implicit repairs have now each caused a
regression; a third would be indefensible.

**Restoration spec — the recorded baseline.**

| section | children (original position) |
|---|---|
| infant (`infant_0_18_months`, PassA `infant`) | PassA 1/12 · Wrigley 2/12 · TestProcess3 3/12 · TestProcess4 4/12 · TestProcess5 5/12 · TestProcess6 6/12 · PassB 7/12 · TestProcess10 8/12 · TestProcess7 9/12 · TestProcess8 10/12 · TestProcess11 11/12 · TestProcess9 12/12 |
| pre-k | Test Process 1/1 (dob 2022-08-18) |
| school age | Test Process2 1/2 (dob 2021-08-08) · Marisol Vega 2/2 (dob 2021-03-14) |
| (own section) | Tomas Rivera 1/1 |
| toddler (`toddler_2_3_years`) | Lennon Kurzman 1/1 |

Known exact original values: `698f850a` `infant_0_18_months` · `ba8cdcf5` `toddler_2_3_years` ·
`9e230cf8` / `504bf3f3` `infant_0_18_months`. Unchanged throughout: `0cad23a8` `infant`,
`ee36c3b1` `infant`, `94984f6c` `infant_0_18_months`, `27de6932` `toddler`.

**The lesson, frozen as law 39.** Routing ensure through the projection's resolver made the two agree
on the SHAPE of the answer but not on the INPUTS — the projection resolves with the candidate's stored
key/label and OCM context, ensure has only process-instance facts. One resolver is necessary and not
sufficient. And a migration that changes an identity key changes it for every row at once, so any
write it performs beyond identity is a mass mutation by definition.

## 5i. RESTORATION EXECUTED — Firefly clean (Director-approved)

Ran under approval with `RESTORE_LABEL=1`. Evidence in `evidence/`
(`post-regression-snapshot.json`, `repair-table.json`, `post-restoration-snapshot.json`).

| check | result |
|---|---|
| 15/15 cohort keys == immutable evidence | **PASS** |
| 15/15 group labels == immutable evidence | **PASS** |
| section distribution | **12 / 1 / 2 / 1 / 1** — recorded baseline |
| candidate ids · subject keys · `wait_since` · status · linkage · metadata | **0 diffs** vs frozen snapshot |
| pins | `ec6dce10` on Wrigley, `489a6460` on PassA — unmoved |
| counts | 20 candidates · 17 rows · 0 inserted · 0 deleted |
| three consecutive Work View reads | **ZERO mutation** (identity, cohort, label, override) |

One flag resolved as out of scope: `ee36c3b1`'s stored label `Infant` differs from its evidence
`infant` — pre-existing, byte-identical before and after, and not one of the 15. The verification
asserted all 20 rather than the 15 in scope.

### Hardening shipped with it

- **No business-fact repair on any read path.** The duplicate repair *and* its rollback are gone from
  the Work View ensure path. Candidate ensure stays — creating a missing candidate is that path's
  bounded contract; reconciling facts of candidates that already exist is not.
- **The survivor rule is fail-closed.** The repair has no default any more: a caller must name the
  survivor per subject, and a subject without an explicit decision is reported and skipped. The old
  "earliest" fallback is precisely what retired the projecting candidate and then flip-flopped.
- **Multi-row mass-mutation guard** (`identityMigrationMassMutationContract.test.ts`): a heterogeneous
  fixture — infant, toddler, pre-k, preschool, school-age, unresolved, pinned, overridden — asserts
  only the seed key moves. A single-row test passes this bug all the way through, because the move
  looks correct on one candidate whose derived cohort happens to match. Positive-controlled:
  reintroducing the cohort write fails 3 of 4 with the exact production message.

## 5j. Priority 4–6 — duplicates reconciled, pins certified, counts converged

### Duplicate reconciliation (census → explicit survivors)

| set | class | survivor | outcome |
|---|---|---|---|
| Lennon | **E** stale duplicate | `ba8cdcf5` | retired `27de6932` |
| Wrigley | **A+B** aligned | `698f850a` | retired `0cad23a8` |
| PassA | **D** contested | — | **refused by the owner** (`skipped_no_survivor_decision: 1`) |

Census ran through the governed read-only path (`scripts/placementDuplicateCensus.ts`) because
`seed_key` is not in the admin read model and diagnostics are not a reason to widen a product surface.

Verified live: rows 17→17 · sections identical · **order unchanged** · 20 candidates, 0 inserted,
0 deleted · exactly two status flips · cohort/label/`wait_since`/member/overrides byte-identical ·
three consecutive reads produce zero mutation and recreate no duplicate.

**PassA is contested on three independent facts, which is why it is deferred rather than decided:**
its pin (ordinal 2, cohort-scoped to `infant_0_18_months`) is on `94984f6c`, which does **not**
project; `ee36c3b1` projects, holds the stable key and cohort `infant`, and has no pin; `wait_since`
differs by a day, so the survivor decides queue seniority; the cohorts differ, so it also decides
section membership; and keeping the projecting row means rebinding a cohort-scoped override onto a
candidate in another cohort. **Director decision needed.**

### Pins

**Attachment CERTIFIED** — both pins identical after fresh load, Work View switch + return, and
workspace reopen, and both survived the identity migration, the cohort regression, its restoration and
reconciliation. The reconciliation contract's other branch is proven too: when the loser held the pin,
the owner refused.

**Effect still absent (law 36 open).** `projectionCarriesOverrides: false` — the child-grain
projection carries no `active_override_kinds`, so Wrigley, pinned to ordinal 1, sits at **2/12** and
`runtime_position_precedence_note` is `none`: neither the reordering nor the explanation written for
exactly this case can reach the operator.

### Work Items counts — FEDERATED COUNT MODEL DEFECT, fixed

| label | owner | scope | denominator | note |
|---|---|---|---|---|
| KPI Assigned | `WorkItemsKpiStrip` | org | `operational_tasks` | assigned to **anyone** |
| KPI Due Soon / Overdue | `summarizeOperationalTaskCounts` | org | `operational_tasks`, DB-counted | real commitments |
| View Mine | `workItemQueueScope` | org | all sources | assigned to **me** |
| View Overdue / Due Today | `workItemQueueScope` | org | sources owning a due commitment | **fixed** |
| Folders / Sources | `workItemQueueScope` | org | all sources | filter-relative by design |

`due_at` is not the same fact across sources: stored on `operational_tasks`, derived by Communications
(last activity) and Processing (`statusChangedAt + 1 day`). Communications was already excluded from
due metrics; Processing was not. **Live: Views Overdue 9 → 1, Due Today 9 → 1, matching the KPI's
honest 1; All Work 11 and Unassigned 10 unchanged.** Frozen as law 42.

Remaining vocabulary observation (not a defect): KPI `Assigned` counts work assigned to anyone while
View `Mine` counts work assigned to the current operator. Genuinely different metrics with
confusable labels — help text or a label change would close it.

## 5k. Operations + Communications convergence pass

### Operations — premium on entry, two loader defects fixed

| interaction | result |
|---|---|
| open: T1 shell / T3 primary | **109 ms / 119 ms** |
| open request profile | 7 requests, **all distinct** — incl. adjacent-week prefetch (`week_of` 08-10, 08-24) |
| range → week / day | **0 requests** (warm) |
| lens → rooms / assignments | 1 targeted request each |
| tab → roster (return) | **0 requests** (warm) |
| day forward / back | 1 targeted / **0** (warm) |

The 5× `scheduling` and 2× `roster` on open are **not duplication** — seven distinct queries
(sites, roster, assignment_roster, today, and two prefetched adjacent weeks). Checked before claiming,
because stripping query strings is exactly how a readiness prefetch reads as a repeat.

**Fixed:** the Staff tab issued `staff/directory?include_ended=true` twice and the Children tab issued
`records/children?cohort=all&offset=0` twice — identical URLs. Both files already imported
`dedupeAdminFetchWithTtl` and used it only for hover warmth; the main load now uses it too. Verified
live: staff 3→2 requests, children 5→4, no repeated URL. It matters most for `records/children`, the
slowest read on the surface (~3.3–4.5 s).

**Open (measured, not fixed):** Operations **reopen is not warm** — 6 of 7 primary resources refetch
even on a tight close/reopen; only `scheduling?view=sites` is reused.

**UX inconsistency noted — RESOLVED (R13).** Operations' section tabs carried `data-comms-tab`, a
Communications-named control contract on the shared Layer-1 `WorkspaceSubTabs` primitive that
Communications, Operations, Digital Mailroom, Work Items and Scheduling all mount. The shared contract
is now `data-workspace-section-tab` (tablist `data-workspace-section-tabs`), matching the existing
`data-workspace-mode-sections` vocabulary. `data-comms-tab-panel` is a different, genuinely
Communications-owned attribute and is unchanged.

### Communications — reference vocabularies converged

Measured open: **29 requests for 12 distinct resources**; reopen **27/12** and not warm. Identical
URLs (not distinct queries): `templates` ×3, `announcements` ×3, `templates?status=active` ×3,
`location-program-categories` ×3, `locations?hierarchy=1` ×3, `status-options?grain=*` ×3 each — ×4 on
reopen, i.e. beyond what a dev double-invoke can explain.

Cause: these loaders DO short-circuit on a warm hit, but several consumers check warm before it lands,
all miss, and all fetch. Routed the four reference vocabularies through the canonical dedupe owner →
**open 29 → 24**, those resources ×3 → ×2.

**Deliberately not deduped:** the announcements list and the templates list. This workspace mutates
them, and a reload after a save must never be served from a TTL cache.

**Remaining:** `templates` and `announcements` still ×3–4. Closing those needs a bust-on-mutation seam
(the codebase already has that pattern, e.g. `bustCommunicationsBindingsFetchDedupe`) rather than a
TTL — that is the precise remaining work, not a mystery.

## 5l. FINAL CERTIFICATION MATRIX

| Area | Performance | Convergence | Refresh-free | Loader ownership | Remaining debt | Certified |
|---|---|---|---|---|---|---|
| Workspace | T1/T2 immediate | ✓ | ✓ | ✓ | six-answer readiness payload (measured, deferred) | **yes** |
| Work Unit | premium, prepared | ✓ rows+totals converge | ✓ | ✓ | — | **yes** |
| Focus Panel Summary | premium | ✓ identity converges | ✓ | ✓ | Assignments card reads record patch late | **yes** |
| Activity | first meaningful **401 ms** | ✓ | ✓ | ✓ identities duplicate fixed | timeline initial read 100 events / 61 KB, needs a demand-driven path before bounding | **yes** |
| Operations | T1 109 ms · T3 119 ms | ✓ targeted day/lens | ✓ | ✓ fixed (staff, children) | `data-comms-tab` naming debt — resolved in R13 | **yes** |
| Processing | certified prior | ✓ | ✓ | ✓ | — | **yes** |
| Work Items | ✓ | ✓ | ✓ | ✓ | Assigned vs Mine vocabulary | **yes** |
| Communications | open 29→15, reopen 27→14 | ✓ | ✓ | ✓ one owner incl. warm cache | 3 unrelated resources still ×2 | **yes** |
| Records | children ~3.3–4.5 s | ✓ | ✓ | ✓ deduped | endpoint latency | partial |
| Organization | warm nav certified | ✓ invalidation correct | ✓ | ✓ | non-versioned live cert | partial |
| Counts / KPIs | DB-counted | ✓ | ✓ | ✓ | — | **yes** |
| Pins | n/a | attachment ✓ · effect ✓ | ✓ | ✓ | precedence NOTE gated on shadow mode | partial |
| True cold | not re-measured | — | — | — | deferred by instruction | not this wave |

**PASSA → CONTESTED / FAIL-CLOSED.** Not reconciled, not guessed, and **not a runtime-certification
blocker**. It is one duplicate subject whose survivor decision changes queue seniority, section
membership and pin ownership simultaneously.

### Correction to my own prior classification

I reported pin effect as class A ("override dropped before projection", citing a hardcoded
`active_override_kinds: []`). **That was wrong.** That code is a fallback path and is not what the
live waitlist uses. Measured at the correct projection path
(`_placement_waitlist_row.placement_priority_v2`, not the row root — my earlier probe read the wrong
key and reported `false`), the override IS present and IS spliced into the sort tuple.

Real classification: **C — a higher-precedence rule legitimately wins.** Tuple element 0 is the cohort
label compared as a string, and PassA's un-normalised `"infant"` sorts before
`"infant — 0–18 months"`. Reconciling PassA removes the anomaly. The pin itself works.

## 5m. Activity cascade, timeline boundary, and the Operations reopen retraction

### Operations reopen — RETRACTED, the behaviour is correct

| step | requests |
|---|---|
| first open | 7 |
| reopen (immediate) | **0** |
| second reopen | **0** |
| reopen after >30 s | 6 (the operating-day class only) |

All six are **VALID FRESHNESS REFRESH**, not unnecessary cold reload: `roster`, `roster?date`,
`scheduling?view=roster`, `?view=assignment_roster` and the two adjacent `week_of` reads belong to
`dayCache` (staleMs 30 s). `scheduling?view=sites` belongs to `referenceCache` (5 min) and is reused
across all reopens. `warm()` returns cached data without fetching inside the window, so nothing is
bypassing the owner.

I reported "reopen refetches 6/7" twice. It was my probe: ~56 s of intermediate steps ran before the
"tight" reopen, so the 30 s entries were legitimately stale. **Operations is certified.**

### Activity cascade (Priority 2) — does not compete

Activity click → **first meaningful content 401 ms**, and only three requests follow:

| request | classification |
|---|---|
| `communications/family-workspace` (no thread_id) | REQUIRED FOR CURRENT FOCUS PANEL — the composer surface sharing the panel |
| `communications/family-workspace?thread_id=…` | SECONDARY — one thread's workspace |
| `communications/identities?channel=email` | was **DUPLICATE** ×2 → **fixed**, now ×1 (3.1 → 1.5 KB) |

No Activity request is blocked by Communications: first meaningful content lands at 401 ms while the
72 KB of family-workspace enrichment runs alongside it. The two family-workspace calls carry
different query shapes, so they are two scopes, not a duplicate.

### Timeline (Priority 3) — half the finding is stale, half is justified

**Fetched ONCE, not twice.** `/api/admin/activity?…&limit=100` — a single request on record open, and
**zero on subject switch** (warm). The second consumer (`OpportunityDrawerVmTabPanes`) reads the
prefetched snapshot rather than refetching, so ownership is already correct.

The payload is real: **100 events, 61.1 KB**, for a ribbon rendering ~3.

**Deliberately NOT reduced.** There is no pagination or offset for activity anywhere, and
"View all activity" only switches panel mode — it issues no deeper read. Lowering the initial limit
would therefore make events 26–100 **unreachable**: a functional regression disguised as an
optimisation. Bounding this read requires a demand-driven "load older" path to exist first, which is a
product change beyond a convergence wave — and the interaction is already premium at 401 ms, which the
instruction explicitly says not to optimise for its own sake. Carried as an explicit, sized item.

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
