# Waitlist × Layout V2 — Design & Architecture Audit

**Status:** Discovery only. No runtime, Layout V2, or schema changes were made.
**Date:** 2026-06-06
**Question being decided:** *Is Waitlist simply another Layout V2 queue layout, or is it its own operational surface?*
**Answer (short):** Waitlist is a **specialized operational surface**, not "just another queue card." The recommended model is **Option C** — a dedicated Waitlist surface that uses Layout V2 **only for candidate-card composition**, while ranking, cohort grouping, position controls, overrides, and lifecycle remain owned by the placement runtime.

> Note on screenshots: this is a static code audit; no live screenshots were captured. UI structure is documented from the rendering components (paths + lines below) instead.

---

## 0. TL;DR for the decision

| Dimension | Normal Lead/Tour/Enrolling queue | Waitlist queue |
| --- | --- | --- |
| Row grain | one row per work-unit / opportunity | **one row per child** (`placement_candidates`) |
| Ordering | static sort (`updated_at desc`, etc.) | **computed ranking** from a priority *profile* (facts → tier buckets → sort tuple), recomputed every load |
| Grouping | flat list | **cohort sections** (Infant/Toddler/Preschool/…), collapsible, with counts |
| Position | n/a | **runtime position "3/12"**, scoped to a cohort section, *never persisted* |
| Operator mutation | open / message / status | **pin / reorder / override** with required audit reason |
| State | lifecycle status | **candidate state machine** (`waitlisted → offer_pending → enrolling → enrolled`) + override records |
| Backing tables | `opportunities`, `work_units` | **`placement_candidates`, `placement_overrides`** + household-fact derivation |

Everything in the right column is **stateful or computed**. Layout V2 is **presentation-only** (see §5). Therefore the *surface* cannot be a pure Layout V2 config — but the *candidate card* within it can.

---

## 1. Waitlist runtime code map

### 1.1 Queue rendering & surface
- `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` — the shared work-unit queue renderer; imports the placement/waitlist panels and renders cohort **section headers** (collapsible, counted) for the waitlist lane. Placement imports at lines ~9–58 (`QueueRowPlacementPriorityStrip`, `QueueRowPlacementCandidatePanel`, `QueueRowPlacementManualOrderControls`, `QueueRowPlacementPriorityV2Panel`, `formatPlacementGroupHeaderTitle`, `buildPlacementV2QueueHint`).
- `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` — work-unit page that assembles candidate rows, sorts, and groups by cohort.

### 1.2 Candidate-row panels (waitlist-specific UI)
- `web/app/adminV2/components/workspace/blocks/QueueRowPlacementCandidatePanel.tsx` — candidate meta chips (bucket/rule chip, "waitlisted since", synthetic-fallback tag, "manually adjusted" tag, forecast hint) + sibling-context lines.
- `web/app/adminV2/components/workspace/blocks/QueueRowPlacementManualOrderControls.tsx` — **position adjust modal** + inline position controls (layouts: `inline`, `header-adjust`, `header-inline`, `gutter`).
- `web/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityV2Panel.tsx` — family-level placement panel (primary cohort, bucket, child expansion, sort-tuple trace).
- `web/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityStrip.tsx` — compact tier badge strip (V1).
- `web/app/adminV2/components/workspace/blocks/QueueRowOperationalBands.tsx` — lifecycle band hosting the placement/candidate sections.

### 1.3 Ranking / scoring / sectioning logic (`web/lib/orchestration/placement/`)
- `evaluatePlacementPriority.ts` — **pure evaluator**: fact predicates → bucket assignment → `sort_tuple`, with trace steps. *(verified: deterministic, no I/O.)*
- `presets/childcareEnrollmentPlacementProfile.ts` / `…ProfileV2.ts` — priority **profiles** (`childcare_enrollment_waitlist_v1` / `_v2`). Tiers + `priority_order` verified (10/15/20/30/100).
- `householdPlacementFacts.ts` — derives `flag_employee_household`, `flag_sibling_enrolled`, `flag_sister_center`.
- `waitlistCandidateRuntimePosition.ts` — **runtime position**; header comment verified: *"Derived at queue load / client filter time — never persisted."* Modes `preview | live`.
- `waitlistQueueBlockSectionPlan.ts` — section plan + contiguous cohort sort for the live QueueBlock path.
- `waitlistQueueSectionPresentation.ts` — cohort → section-key + "Infant waitlist" title formatting.
- `sortPlacementCandidateQueueRows.ts` — section → cohort → sort-tuple → id ordering.
- `placementWaitlistCandidateRowProjection.ts` — expands an opportunity into per-child candidate rows + sibling context.
- `bulkLoadPlacementCandidatesByOpportunity.ts` — hydrates candidates + active overrides.
- `childWaitlistPlacementEligibility.ts` — candidate eligibility from `outcome_status_key`.

### 1.4 Override / pin logic
- `placementCandidateTypes.ts` — `PLACEMENT_OVERRIDE_KINDS = ["pin", "tier_boost", "temporary"]` *(verified)*.
- `placementOverrideMutations.ts` — pin create / upsert / release.
- `emitPlacementManualOrderActivity.ts` — audit-trail activity records.

### 1.5 Capacity / forecast (hooks only — no engine)
- `placementForecastFactContract.ts` — header comment verified: *"Card 6 — optional waitlist forecast facts (informational hooks only). No capacity engine; facts do not affect ordering unless a future profile opts in."* Reserved keys: `expected_openings_count`, `projected_opening_window`, `projected_capacity_pressure`, `forecast_earliest_start_date`, `forecast_confidence`.
- `placementForecastFactsProvider.ts` — populates `forecast_hints` (informational strings rendered as a chip).

### 1.6 Config objects
- `placementConfigSchema.ts` — `metadata.placement_priority_v1` on `work_units` (enabled, `engine_version` v1/v2, `profile_id`, `queue_keys_enabled`, `shadow_mode`, `evaluation_cap`, `priority_rule_order`). Department→work-unit merge.
- Queue definition: `supabase/migrations/20260601130000_enrollment_pipeline_queue_definition_v2.sql` (+ `…_v2_14a.sql`) — `work_units.queue_definition` JSONB: the `waitlist` lane has `grain: "candidate"`, `count_unit: "children"`, filters on `candidate_status ∈ {active,paused}` and `child_lifecycle_status ∈ {waitlisted, offer_pending}`.

### 1.7 Database tables / migrations
- `placement_candidates` (child-grain): `opportunity_id`, `program_room_cohort_key`, `wait_since`, `desired_start_date`, `status ∈ {active,paused,withdrawn,placed}`, `is_synthetic_fallback`, `metadata`.
- `placement_overrides`: `placement_candidate_id`, `override_kind ∈ {pin,tier_boost,temporary}`, `reason`, `payload` (e.g. `{pin_ordinal}`), `expires_at`, `is_active`, audit columns.
- `persons.is_employee/employee_id/employee_source`, `opportunity_customer_members.location_id/program_room_cohort_key` — `supabase/migrations/20260528120000_waitlist_priority_fact_truth_child_scope.sql`.
- Indexes — `supabase/migrations/20260605100000_waitlist_queue_lane_query_indexes.sql`.
- Lifecycle backfill — `supabase/migrations/20260601150000_backfill_safe_ocm_lifecycle_statuses.sql`; move-to-waitlist action — `…20260603100000_activate_move_to_waitlist_lifecycle.sql`.

### 1.8 API routes
- `POST web/app/api/admin/placement-candidates/[candidateId]/manual-position/route.ts` — upsert/reset pin (move/reset; requires `reason`).
- `POST web/app/api/admin/placement-candidates/[candidateId]/overrides/route.ts` — create override.
- `…/overrides/[overrideId]/release/route.ts` — release override.

---

## 2. Current Waitlist UI inventory

**Section header (per cohort):** title "Infant waitlist / Toddler waitlist / …", row count `(n)`, collapsible chevron with `aria-expanded`, dev diagnostics attrs. *No capacity/seat counts today.*

**Candidate row (one per child):**
- Primary identity: `childDisplayName` (e.g. "Alex (4y)").
- Cohort/program label; **bucket/rule chip** (e.g. `tier_sibling_enrolled`).
- **Position**: `runtimePositionLabel` "Position 3/12" (or "Preview position …" in shadow mode), with help + precedence note.
- "Waitlisted since {date}" meta chip.
- Sibling context lines + link-mode label ("strictly linked with siblings").
- Tags: **Override** (amber), **Manually adjusted** (purple), **No child on file** (synthetic fallback), **Forecast hint** (info).

**Actions on a row:** Adjust position (modal: current position read-only, target dropdown 1..N, "Move to top", **required reason** textarea), Clear adjustment, Create override (pin/tier_boost/temporary via drawer).

**Data shape:** `QueueRowPlacementWaitlistCandidateVm` (`web/lib/ui-v2/workspace-types.ts` ~307–351) — identity, cohort (`cohortKey/cohortLabel/cohortSectionTitle/bucketLabel`), `waitSinceLabel`, sibling fields, override fields (`hasActiveOverride`, `activeOverrideKinds`, `activeOverrides`), manual-position fields (`hasManualPositionAdjustment`, `pinOverrideId`), runtime-position fields (`runtimePosition*`), `forecastHints`, `shadowMode`.

---

## 3. Operational purpose (what it helps an operator do)

Waitlist answers a different question than the Lead queue. Lead Management is **"work this record next"** (a flat to-do list). Waitlist is **"who gets the next available spot in this cohort, and why."** Concretely the operator:

1. **Ranks within a cohort** — children are ordered by a fair, policy-driven priority (employee → sibling-enrolled → sister-center → general; tie-broken by wait time then desired start). Operators read *why* via the bucket chip + trace.
2. **Compares candidates in context** — sibling links, link modes, "waitlisted since," and position make adjacent candidates comparable at a glance.
3. **Overrides when policy isn't enough** — pin/reorder a child to a specific position with a mandatory audit reason; the system records who/when/why.
4. **Moves a child toward a seat** — `waitlisted → offer_pending → enrolling → enrolled` via lifecycle action (today a manual status move, not an automated offer).

The unit of work is the **child-in-cohort**, not the family record. That is the defining difference.

---

## 4. Unique Waitlist capabilities

### Generic queue capabilities (a Lead card also has these)
- A card per row, identity/title, status pill, contact/related rows, a location, an action affordance, lifecycle awareness.

### Waitlist-specific capabilities (a Lead card does **not** have)
1. **Cohort sectioning** — collapsible per-program groups with counts (not a flat list).
2. **Computed ranking** — sort tuple from a priority *profile*, recomputed each load; configurable rule order + shadow mode.
3. **Runtime position** — "3/12" scoped to a cohort section; never persisted; preview vs live.
4. **Tier/bucket reasoning** — fact-derived bucket + human-readable reason + trace.
5. **Manual overrides** — pin / tier_boost / temporary, in a dedicated table, with audit activity.
6. **Position controls** — adjust/reset modal with required reason and precedence handling.
7. **Sibling/link awareness** — family relationships and link modes affect display and (future) co-placement.
8. **Child-grain expansion** — one opportunity fans out to multiple candidate rows.
9. **Lifecycle state machine** — candidate status + child outcome status drive lane membership.
10. **Forecast hooks** — reserved capacity/opening facts (informational only today).

---

## 5. Can Layout V2 represent Waitlist today?

Layout V2 is, by design, **presentation-only**: a validated JSON doc of Section → Row → Column → Item (+ subgrids, related lists, widget *placeholders*, templates, conditions, adornments, queue-card zones, flexible widths). It carries **no business logic, no computed values, no state, and no data fetching** — widgets are positional placeholders that "own their own data and behavior." (See `docs/layout_v2_foundation_design.md` and `web/lib/layout/layoutV2.ts`.)

Mapping every Waitlist visual element against that:

### Fully supported today (pure presentation of an already-resolved value)
- Child name / family / parent (fields, templates).
- Cohort label, bucket/rule label, "waitlisted since" (fields → text/pill).
- Override / manually-adjusted / synthetic / forecast as **badges/pills** (`renderHint: status|badge`).
- Sibling context as text/related rows.
- Contact row, location label, action-area reservation (queue-card zones: header/body/actions).
- The **candidate card composition itself** (which fields show, order, icons, pills, widths).

### Partially supported (value can be shown; behavior/structure cannot)
- **Runtime position "3/12"** — Layout V2 can render the *string* if the VM provides it, but cannot compute it, scope it to a section, or keep preview/live modes.
- **Cohort section grouping** — Layout V2 has no "group rows by a computed key into collapsible sections" primitive; sections are static, author-defined, and per-doc, not per-data-partition.
- **Action stack** — the zone can be reserved and labeled, but the *operations* (pin/reset/override with audit) are not layout fields.

### Not supported (stateful / computed / interactive — out of scope by design)
- Ranking / scoring / sort-tuple evaluation.
- Manual override + pin mutation + audit trail.
- Position adjust/reset modal and precedence logic.
- Candidate comparison and sibling co-placement constraints.
- Capacity / availability / seat matching; offer/accept/decline workflow.
- Recommendation logic.

**Conclusion:** Layout V2 can express ~**the candidate card's face** but **not the waitlist's machinery** (grouping, ranking, position, overrides, lifecycle). The machinery is exactly what makes Waitlist a surface rather than a layout.

---

## 6. Ideal future model — recommendation

- **Option A — standard queue layout.** *Rejected.* It cannot express grouping, ranking, position, or overrides without smuggling business logic into the presentation layer (violates the Layout V2 non-goals and the "no runtime cutover / presentation-only" constraint).
- **Option B — queue layout + specialized widgets.** *Viable but risky.* Widgets are placeholders that own their data, so "Candidate Ranking," "Position Controls," and "Override" could be widgets dropped into a queue doc. But making the *whole surface* (section grouping, lane semantics, sort) a Layout V2 doc would push grouping/sort decisions into config they can't safely own. Good for **pieces**, wrong for the **frame**.
- **Option C — dedicated Waitlist surface that uses Layout V2 only for card composition.** ✅ **Recommended.** The placement runtime keeps ownership of lane membership, cohort sectioning, ranking, runtime position, overrides, and lifecycle. Layout V2 owns only **how a single candidate card is composed** (which fields/badges/zones appear). This matches what already exists: a specialized `QueueBlock` + placement panels backed by `placement_candidates`/`placement_overrides`, where only the card face is a presentation concern.

**Recommendation: Option C.** It preserves the Layout V2 invariant (presentation-only, no business logic), avoids encoding ranking/grouping into config, and still lets admins restyle the candidate card through the same builder used for Lead cards.

---

## 7. Waitlist × Layout V2 integration boundary (if specialized)

```
Layout V2 surfaces (presentation-only, config-driven)
├── Lead queue card            ← full Layout V2 queue doc (renderAs: work_unit_card)
├── Tour queue card            ← full Layout V2 queue doc
├── Enrolling queue card       ← full Layout V2 queue doc
└── Waitlist CANDIDATE CARD    ← Layout V2 queue doc, card face ONLY
                                  (zones: header.title/status/attention/location,
                                   body.contact/children/tour, actions.stack)

Waitlist OPERATIONAL SURFACE (placement runtime — NOT Layout V2)
├── Lane membership + filters         ← work_units.queue_definition (waitlist lane)
├── Cohort sectioning + collapse      ← waitlistQueueBlockSectionPlan / sectionPresentation
├── Ranking (profile → buckets → tuple)← evaluatePlacementPriority + profiles
├── Runtime position (3/12, preview)  ← waitlistCandidateRuntimePosition
├── Overrides / pins + audit          ← placement_overrides + manual-position API
├── Lifecycle (waitlisted→…→enrolled) ← outcome_status_key state machine
└── Capacity / forecast / recommend   ← reserved hooks (no engine yet)
```

**Exact boundaries:**
- **Layout V2 provides:** the candidate-card *template* — which fields, badges, icons, pills, zone placement, widths. It receives an already-resolved candidate VM and renders it. It must **not** know about ranking, sections, or overrides.
- **Placement runtime provides:** the candidate VM (already ranked, positioned, sectioned, override-annotated), the section frame, and all mutating controls (pin/reset/override). The position string, bucket chip text, and override flags arrive **pre-computed** on the VM; Layout V2 only places them.
- **Contract surface:** a stable `WaitlistCandidateCardVM` (subset of `QueueRowPlacementWaitlistCandidateVm`) is the seam. Layout V2 zone refs resolve against that VM exactly like the Lead card resolves against the opportunity record. Specialized chrome (section headers, position controls, override modal, action operations) stays outside the layout doc.
- **Specialized widgets (future, opt-in):** Candidate Ranking trace, Capacity/Openings, Availability Matching, Recommendation — modeled as **widget placeholders** the placement runtime fills, droppable into the card's body/actions zones, never as layout-owned logic.

---

## 8. Final recommendation & plan

**Decision: Waitlist is its own operational surface (Option C).** Layout V2 should be adopted for **candidate-card composition only**; the placement runtime retains ranking, sectioning, position, overrides, lifecycle, and (future) capacity/recommendation.

### Risks
1. **Leaky abstraction** — pressure to express grouping/ranking in config. Mitigate by freezing the boundary in §7: Layout V2 never sees ranking/section logic; it only places a resolved VM.
2. **VM coupling** — the card template depends on `WaitlistCandidateCardVM` field names. Mitigate with a documented, versioned card-VM contract (mirrors how the Lead card depends on the opportunity record shape).
3. **Two card renderers drifting** — the proof `QueueCardProofRenderer` vs the live `QueueBlock` candidate panels. Mitigate by sharing zone vocabulary + tokens and treating the proof as presentation-only.
4. **Override/position are interactive** — never expressible as layout fields; keep them runtime-owned and only *reserve* the action zone in the layout.
5. **Capacity/recommendation are unbuilt** — design the card-VM seam to carry optional `forecast`/`capacity`/`recommendation` widget payloads now, so adding the engines later needs no layout-schema change.

### Suggested phases (discovery-derived; not authorized to implement here)
- **Phase 0 (this doc):** decision + boundary. ✅
- **Phase 1:** define `WaitlistCandidateCardVM` contract (subset of `QueueRowPlacementWaitlistCandidateVm`); document which fields/badges are "card face."
- **Phase 2:** add a `waitlist_candidate` card surface to Layout V2 (a queue doc whose zones resolve against the card VM) — proof/config-only, behind the existing flag; no live cutover.
- **Phase 3:** model specialized elements (ranking trace, position, override status, forecast) as **widget placeholders** in the card zones; runtime fills them.
- **Phase 4 (separate track, not Layout V2):** if/when capacity, availability matching, offer workflow, and recommendation engines are built, they live in the placement runtime and surface through the Phase-3 widget seams.

**Bottom line:** *Waitlist is not "just another layout."* It is a specialized placement surface whose **card face** can and should be composed with Layout V2, while its **ranking/grouping/position/override/lifecycle machinery** stays in the placement runtime. Adopt Option C.
