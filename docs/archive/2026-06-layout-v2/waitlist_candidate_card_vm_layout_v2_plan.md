# Waitlist Candidate Card VM × Layout V2 — Composition Plan

**Status:** Planning only. No runtime, schema, or Layout V2 implementation changes.
**Companion to:** [`docs/waitlist_layout_v2_audit.md`](./waitlist_layout_v2_audit.md)
**Decision being implemented:** Waitlist is a specialized operational surface (audit Option C). The placement runtime owns ranking, cohort grouping, position, overrides, and lifecycle. Layout V2 owns only the **candidate card face**. The bridge is a stable **`WaitlistCandidateCardVM`**.
**Date:** 2026-06-06

> All field names below are grounded in the current source (verified). Where the requested VM asked for a field that does not exist in today's data, it is flagged as a **data gap** with the needed join, not silently invented.

---

## 1. Existing waitlist runtime inputs

These already exist and **must not change**. They produce the candidate rows the VM will adapt.

### Projection / row assembly
- `web/lib/orchestration/placement/placementWaitlistCandidateRowProjection.ts` — expands one opportunity into per-child candidate rows + sibling context.
- `web/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity.ts` — hydrates `placement_candidates` + active overrides.
- `web/lib/ui-v2/queuePlacementWaitlistCandidatePresentation.ts` — parses `_placement_waitlist_row` into the current candidate VM.

### Priority / ranking
- `web/lib/orchestration/placement/evaluatePlacementPriority.ts` — pure evaluator (facts → bucket → `sort_tuple`).
- `web/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile.ts` / `…ProfileV2.ts` — tier buckets (`tier_employee_family` 10, `tier_staff_community_legacy` 15, `tier_sibling_enrolled` 20, `tier_sister_center` 30, `tier_general_waitlist` 100).
- `web/lib/orchestration/placement/householdPlacementFacts.ts` — `flag_employee_household`, `flag_sibling_enrolled`, `flag_sister_center`.

### Section / cohort
- `web/lib/orchestration/placement/waitlistQueueBlockSectionPlan.ts` — section plan + contiguous cohort sort.
- `web/lib/orchestration/placement/waitlistQueueSectionPresentation.ts` — cohort → section key + "Infant waitlist" title.
- `web/lib/orchestration/placement/waitlistCandidateRuntimePosition.ts` — runtime position ("3/12"), preview vs live, **never persisted**.
- `web/lib/orchestration/placement/sortPlacementCandidateQueueRows.ts` — section → cohort → tuple → id ordering.

### Override / pin
- `web/lib/orchestration/placement/placementCandidateTypes.ts` — `PLACEMENT_OVERRIDE_KINDS = ["pin","tier_boost","temporary"]` (only `pin` implemented).
- `web/lib/orchestration/placement/placementOverrideMutations.ts` — create/upsert/release.
- `web/lib/orchestration/placement/emitPlacementManualOrderActivity.ts` — audit trail.

### APIs
- `POST web/app/api/admin/placement-candidates/[candidateId]/manual-position/route.ts`
- `POST web/app/api/admin/placement-candidates/[candidateId]/overrides/route.ts`
- `…/overrides/[overrideId]/release/route.ts`

### UI renderers (live; the proof must NOT import these)
- `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` (section headers, grouping)
- `web/app/adminV2/components/workspace/blocks/QueueRowPlacementCandidatePanel.tsx`
- `…/QueueRowPlacementManualOrderControls.tsx`
- `…/QueueRowPlacementPriorityV2Panel.tsx`, `…/QueueRowPlacementPriorityStrip.tsx`

### Source-of-truth data shape (verified)
`PlacementCandidateRow` (`placementCandidateTypes.ts`): `id`, `org_id`, `opportunity_id`, `customer_id`, `opportunity_customer_member_id`, `person_id`, `site_id`, `is_synthetic_fallback`, `program_room_cohort_key`, `program_room_group_label`, `wait_since`, `desired_start_date`, `status ∈ {active,paused,withdrawn,placed}`, `metadata`.
Existing live VM `QueueRowPlacementWaitlistCandidateVm` (`web/lib/ui-v2/workspace-types.ts:307`): `childDisplayName`, `familyDisplayName`, `parentDisplayName`, `cohortKey/cohortLabel/cohortSectionTitle`, `bucketLabel`, `waitSinceLabel`, `linkModeLabel`, override fields, `runtimePosition*`, `forecastHints`, sibling fields.

**What is NOT present today (data gaps — see §7):** child birthdate/age, program/classroom name (only the cohort *key/label* exists), schedule preference, household phone/email, location *name* (only `site_id`), and any **numeric** priority score (ranking is bucket + tuple, not a number).

---

## 2. Proposed `WaitlistCandidateCardVM`

A **read-only, already-resolved** contract the placement runtime produces and Layout V2 consumes. Every field is pre-computed upstream; Layout V2 only places it. Optional fields marked `// gap` require a join not in today's path.

```ts
export type WaitlistCandidateCardVM = {
  // identity
  candidateId: string;            // placement_candidates.id
  opportunityId: string;          // placement_candidates.opportunity_id
  householdId?: string;           // customer_id
  childId?: string;               // person_id (nullable; synthetic fallback rows have none)
  isSyntheticFallback: boolean;

  child: {
    name: string;                 // childDisplayName ("Alex (4y)")
    ageLabel?: string;            // gap — derive from person.birthdate
    birthdate?: string;           // gap — person.birthdate join
    programLabel?: string;        // program_room_group_label (cohort label, not classroom)
    desiredStartDate?: string;    // placement_candidates.desired_start_date
    schedulePreference?: string;  // gap — not modeled today
  };

  household: {
    name?: string;                // familyDisplayName
    primaryContactName?: string;  // parentDisplayName
    phone?: string;               // gap — contacts join
    email?: string;               // gap — contacts join
    locationName?: string;        // gap — site/location label join (only site_id today)
  };

  waitlist: {
    cohortKey: string;            // program_room_cohort_key
    cohortLabel?: string;         // cohortLabel
    cohortSectionTitle?: string;  // "Toddler waitlist"
    tierKey?: string;             // bucket key (e.g. tier_sibling_enrolled)
    tierLabel?: string;           // bucketLabel (human reason)
    tierPriorityOrder?: number;   // bucket priority_order (10/20/…); NOT a free score
    positionLabel?: string;       // runtimePositionLabel ("Position 3/12")
    positionMode?: "preview" | "live";
    positionHelp?: string;        // runtimePositionHelp / precedence note
    waitSince?: string;           // wait_since (or waitSinceLabel)
    desiredStartDate?: string;
    status?: string;              // candidate status ∪ child lifecycle (waitlisted/offer_pending/…)
    shadowMode: boolean;
    linkModeLabel?: string;       // sibling link mode
    siblingContextLines?: string[];
  };

  overrides: {
    hasActive: boolean;           // hasActiveOverride
    kinds: string[];              // activeOverrideKinds (["pin"] today)
    pinned?: boolean;             // kinds.includes("pin")
    tierBoost?: boolean;          // reserved (not implemented)
    temporary?: boolean;          // reserved (not implemented)
    manuallyAdjusted?: boolean;   // hasManualPositionAdjustment
    reason?: string;              // manualAdjustmentReason / override reason
  };

  // Capabilities — computed by runtime (permissions + state), Layout V2 only
  // decides whether/where to surface the action button. The mutation stays runtime-owned.
  actions: {
    canOpen?: boolean;
    canMessage?: boolean;
    canCreateOffer?: boolean;     // lifecycle waitlisted → offer_pending
    canOverride?: boolean;
    canAdjustPosition?: boolean;
    canAskBos?: boolean;
  };

  // Opaque payloads the runtime fills; Layout V2 reserves a slot, never interprets them.
  widgets: {
    priority?: unknown;           // tier trace / sort-tuple explanation
    position?: unknown;           // position control payload (interactive — runtime-owned)
    capacity?: unknown;           // reserved (no engine yet)
    recommendation?: unknown;     // reserved (no engine yet)
  };
};
```

**Naming note vs. the requested draft:** `priorityScore?: number` is intentionally renamed `tierPriorityOrder` because the system has **no numeric score** — it ranks by tier bucket + tie-break tuple. Surfacing a fake "score" would misrepresent the algorithm.

---

## 3. Layout V2 composition boundary

### Allowed (presentation of an already-resolved VM)
- Candidate card **title** (e.g. `{child.name}`) and **subtitle** (cohort / household).
- **Badges/pills**: tier label, status, override/pinned/adjusted, forecast hint.
- **Child row fields**: name, age, program label, desired start.
- **Household/contact fields**: name, primary contact, phone, email, location (when hydrated).
- **Priority/tier/position display** (as text/pill — value only).
- **Widget placement** (priority / capacity / recommendation slots).
- **Action area reservation** + which action buttons appear (driven by `actions.*` capability booleans).
- Zone order, icons/adornments, flexible widths, conditional visibility.

### Not allowed (runtime-owned)
- Ranking algorithm / tier assignment / sort tuple.
- Cohort grouping into sections + collapse state.
- Position calculation (preview/live, section scope).
- Override/pin **mutation** behavior (create/upsert/release, audit reason).
- Lifecycle state transitions (`waitlisted → offer_pending → …`).
- Capacity/availability matching, offer workflow, recommendation logic.

**Invariant:** Layout V2 receives `WaitlistCandidateCardVM` fully resolved and renders it. It never computes, sorts, groups, or mutates. This preserves the Layout V2 non-goals (presentation-only, no business logic) from `layout_v2_foundation_design.md`.

---

## 4. Waitlist-specific Layout V2 preset (default card)

A `waitlist_candidate_card` queue doc (`metadata.renderAs: "waitlist_candidate_card"`) that deliberately differs from the Lead card by leading with **priority + position** (the operator's primary scan signals), then child/household, then flags and actions.

Proposed bounded zones (extend `LAYOUT_QUEUE_ZONES` in a later sprint — not now):

```
header.identity        → child name (+ household subtitle)
header.priority        → tier pill (tierLabel) + reason
header.position        → "Position 3/12" (positionLabel, preview/live aware)
body.child             → age, program label, desired start
body.household         → primary contact, phone, email, location
body.program_fit       → cohort/section context (+ future capacity widget slot)
body.availability      → desired start / schedule preference (+ future availability widget)
body.override_flags    → pinned / manually-adjusted / tier-boost badges
actions.stack          → Open / Message / Create Offer / Override / Ask BOS (capability-gated)
```

Differences from the Lead `work_unit_card`: priority + position are first-class header zones (Lead has none); children are not a repeated related list (the card **is** one child); the action stack swaps "Update Status" for "Create Offer / Override."

---

## 5. Stage-specific layout targeting

**Requirement:** resolve different cards for Lead vs Waitlist (vs Tour later) on the same `surface = queue`.

`entity_layouts` already keys on `(org_id, entity_type, surface, layout_key, version)`; only `surface` is CHECK-constrained (`drawer|queue`). `entity_type` and `layout_key` are free text with no FK. Options:

| Option | Mechanism | Schema change? | Verdict |
| --- | --- | --- | --- |
| **A. layout_key convention** | `layout_key = "waitlist_candidate_card"` | **None** | ✅ Recommended |
| B. new `layout_context` column | add column + index + resolver change | Yes (migration) | ❌ Over-engineered now |
| C. metadata-based targeting | filter on `doc.metadata.stage` | None, but resolver must scan/parse | ⚠️ Slower, fuzzier |
| D. separate table | `waitlist_layouts` | Yes | ❌ Fragments the model |

**Recommendation — Option A (layout_key convention) + a dedicated `entity_type`:**
- `entity_type = "placement_candidate"` (the rows are candidate-grain; cleaner identity than overloading `opportunities`). Adding this value needs only a code-level allowlist entry (`ALL_ENTITY_PRESENTATION_TYPES` + field catalog) — **no DB migration** (no CHECK on `entity_type`).
- `surface = "queue"`, `layout_key = "waitlist_candidate_card"`.
- Lifecycle/stage ("Lead Management → Waitlist") is *expressed by* the `(entity_type, layout_key)` pair, not a new column.

Resolution stays the existing chain: org published → default published → curated default — now also parameterized by `layout_key`. The resolver/list APIs already carry `layout_key`; the only addition is letting callers request a non-`default` key. Defer any `layout_context` column until ≥3 stages need orthogonal targeting on the same key.

---

## 6. Proof implementation plan (first sprint)

**Scope:** proof/config only — no live runtime cutover, no schema change, no Layout V2 schema change beyond additive zones.

1. **Adapter (read-only):** `placementCandidateToCardVM()` mapping the existing candidate VM/row → `WaitlistCandidateCardVM`. Pure, in `web/lib/layout/` or `web/lib/ui-v2/`. Gaps (age/phone/email/location) resolve to `undefined` → card shows blank, never a UUID.
2. **Proof renderer:** `WaitlistCandidateCardProofRenderer` mirroring the live placement card visual with concrete Alloy tokens (same pattern as `QueueCardProofRenderer`), importing **no** production `QueueBlock`/placement panels.
3. **Proof API:** read-only `GET /api/admin/layout-proof/waitlist-candidates` (flag-gated, like the opportunities proof route) returning real candidates mapped to the card VM. No mutations.
4. **Settings:** add a **Waitlist** card option to `/adminV2/settings/layouts` (new `entity_type = placement_candidate`, `surface = queue`, `layout_key = waitlist_candidate_card`); reuse the existing builder + zone UX.
5. **Proof page:** add a Waitlist proof mode to `/adminV2/layout-proof` rendering real candidates through the card VM + the proof renderer; actions simulated.
6. **Editing:** Layout V2 edits the **card face only**; section grouping/position/override controls are shown as reserved, non-editable runtime zones.

Everything behind `LAYOUT_V2_PREVIEW_ENABLED` (default OFF). Verification mirrors prior sprints: `npm test -- tests/layout/`, lint/typecheck changed files, `npm run build`.

---

## 7. Risks & open questions

1. **Data gaps.** Age/birthdate, classroom/program name (vs cohort key), schedule preference, household phone/email, and location *name* are **not** on the candidate row today — they need joins (person, contacts, sites). The VM should treat them optional; the proof should render blanks, not fabricate. Decide which gaps Phase 1 hydrates vs. defers.
2. **No numeric score.** Ranking is tier-bucket + tie-break tuple, not a number. The VM exposes `tierPriorityOrder`, not `priorityScore`. Don't let the card imply a numeric ranking the engine doesn't produce.
3. **Ranking correctness must stay runtime-owned.** The card must render the runtime's `positionLabel`/`tierLabel` verbatim; any divergence (e.g. the proof re-sorting) would mislead operators. Proof renders, never ranks.
4. **Capacity/recommendation engines don't exist** (forecast facts are "informational hooks only"). The VM reserves `widgets.capacity/recommendation` as opaque slots so adding engines later needs no VM/schema change.
5. **Entity identity: `placement_candidate` vs `opportunities`.** Recommend `placement_candidate` (candidate-grain truth) via the allowlist (no migration). Risk: more catalog/registry plumbing than reusing `opportunities`. Trade-off documented in §5.
6. **Actions representation.** Actions are **capabilities** on the VM (booleans), not layout fields; the layout decides *placement*, the runtime owns *behavior* (pin/override/offer with audit). Open: exact capability → button mapping and whether "Create Offer" needs a confirm modal (runtime-owned).
7. **Overrides display.** Pin is implemented; `tier_boost`/`temporary` are reserved stubs. The card should badge only active, implemented kinds and avoid implying unbuilt behavior.
8. **Two renderers drift.** Proof card vs live placement panels — mitigate by sharing zone vocabulary + tokens and treating the proof as presentation-only.

---

## 8. Recommended implementation phases

| Phase | Deliverable | Runtime impact | Effort |
| --- | --- | --- | --- |
| **1. VM contract + proof renderer** | `WaitlistCandidateCardVM` type, read-only adapter, proof renderer, read-only proof API | None (proof only, flag OFF) | **S–M** (~1 sprint) |
| **2. Layout preset + settings editing** | `waitlist_candidate_card` default doc + zones, Waitlist option in `/adminV2/settings/layouts`, Waitlist mode in `/adminV2/layout-proof` | None | **M** |
| **3. Stage-specific targeting** | `layout_key` + `placement_candidate` entity_type resolution wired through list/resolve/create APIs (no schema change) | None | **S–M** |
| **4. Runtime adoption** | Live placement card consumes the resolved layout once proof converges; behind flag, reversible | Live (separate, gated) | **L** (own sprint) |

---

## Summary

- **Architectural recommendation:** Option C — placement runtime keeps ranking/grouping/position/overrides/lifecycle; Layout V2 composes the **candidate card face only**, bridged by a read-only `WaitlistCandidateCardVM`.
- **Targeting:** `layout_key = "waitlist_candidate_card"` + `entity_type = "placement_candidate"`, `surface = "queue"` — **no schema change, no new column, no new table**.
- **First sprint:** VM adapter + proof renderer + read-only proof API + settings/proof entry — all flag-gated, no runtime cutover.
- **Biggest risks:** data gaps (age/contact/location/program-name joins), the temptation to encode ranking in config, and the absent capacity/recommendation engines (reserved as opaque widget slots).
- **Feasibility:** High. The runtime already emits a candidate VM with most card fields; the work is an adapter + proof surface, not new placement logic — efficient to build on the existing runtime.
