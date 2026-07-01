# Child-Grain Queue Conversion — Phase C Preflight

**Path:** `docs/sprints/06_2026/child_grain_phase_c_preflight.md`  
**Date:** 2026-06-06  
**Status:** **Preflight complete** · Enrolled staging flip documented in [`completed/child_grain_phase_c_enrolled_staging_flip.md`](./completed/child_grain_phase_c_enrolled_staging_flip.md)  
**Prerequisites:** Phase A (`cca53e7a`), Phase B (see below), design [`child_grain_queue_conversion_design.md`](./child_grain_queue_conversion_design.md)

**Goal:** Know exact count/membership deltas before the first lane flip. This sprint changes **nothing** in production queue routing unless `ALLOY_QUEUE_CHILD_GRAIN_LANES` is set on an environment.

---

## Executive summary

| Lane | Already child/candidate in production? | Phase C “flip” meaning | First-flip risk |
|------|----------------------------------------|------------------------|-----------------|
| **Enrolled** | **No** — case `opportunities.status_key` today | Route to OCM builder (`enrollment_completed`) | **Low** when data aligned; **lowest** predicate surface |
| **Enrolling** | **Yes** — Card 8 `ocmrow:` (`offer_pending` + `enrolling`) | Replace Card 8 with Phase A builder (broader disposition set) | **Medium** — count may **increase** |
| **Tour** | **No** — case `tour_scheduled` (+ separate follow-up case set) | Route to OCM tour disposition set | **High** — largest count shift, mixed households |
| **Waitlist** | **Yes** — Card 6 `pcrow:` | **No membership flip** — verify predicates + UX only | **Low** for flip; focus on data/OCM alignment |

**Recommended first lane flip on staging:** **`enrollment_completed` (Enrolled)** — smallest predicate diff, doctrine-aligned (`enrolled` only), UI already honest via Phase B on existing grain rows.

**Safe to enable one lane on staging?** **Yes for Enrolled** after Phase B deploy and count script sign-off on staging org data. Use per-lane flag only; do not set `all` until Tour/Enrolling reviewed.

---

## Lane comparison table

### Predicate reference (code truth)

| Lane | Queue key | Current production path | Count unit today | Flag-enabled path (`ALLOY_QUEUE_CHILD_GRAIN_LANES`) |
|------|-----------|-------------------------|------------------|------------------------------------------------------|
| **Enrolled** | `enrollment_completed` | `opportunities` where `status_key ∈ { enrolled }` | **Cases** (households) | `opportunity_customer_members` where `outcome_status_key = enrolled` + WU join | **OCM tracks** (`ocmrow:{opp}:{ocm}`) |
| **Enrolling** | `enrollment_offers` | Card 8: OCM where `outcome_status_key ∈ { offer_pending, enrolling }` | **Children** (already) | Phase A builder: OCM where `outcome_status_key ∈` enrolling set (+ `registration_pending`, `paperwork_pending`, `start_date_scheduled`, `ready_to_enroll`) | Same grain, **wider** set |
| **Tour** | `tours` | `opportunities` where `status_key = tour_scheduled` | **Cases** | OCM where `outcome_status_key ∈` tour set (7 keys incl. `tour_requested`, `decision_pending`, `tour_no_show`, …) | **OCM tracks** |
| **Tour follow-up** | `tours_follow_up` | Case statuses `tour_completed`, `follow_up_attempted`, `tour_no_show` | **Cases** | Same OCM tour set (overlap, not identical to follow-up case set) | **OCM tracks** |
| **Waitlist** | `waitlist` | Card 6: `placement_candidates` `status ∈ { active, paused }` + child lifecycle filter | **Candidates** (already) | Flag does **not** change waitlist routing (no OCM stage for waitlist key) | **Unchanged** |

### Dev/staging DB snapshot (2026-06-06)

Script: `cd web && npx tsx scripts/childGrainPhaseCPreflight.ts`  
Org: first `enrollment_pipeline` WU (`93667019-bd28-49b5-a688-acc9bb1e0a19`, WU `76b21da2-702e-4439-9002-dc1486e3e105`)

| Lane | Current count | Flag / OCM reference count | Delta | Notes |
|------|---------------|----------------------------|-------|-------|
| Enrolled | 0 | 0 | 0 | No sample rows — flip is **no-op** on this org until data exists |
| Enrolling | 0 | 0 | 0 | Card 8 already active; Phase A builder adds 0 rows here |
| Tour (`tours`) | 0 | 0 | 0 | — |
| Tour follow-up | 0 | 0 | 0 | — |
| Waitlist | **24** | 0 (OCM waitlisted ref) | — | **Waitlist already candidate-grain**; 24 `placement_candidates` |

**Operator-visible changes when counts differ (general):**

| Scenario | Added rows | Removed rows |
|----------|------------|--------------|
| Enrolled flip | OCM `enrolled` where case status ≠ `enrolled` | Case `enrolled` where no OCM `enrolled` child |
| Enrolling flag builder | OCM in `registration_pending`, `paperwork_pending`, `start_date_scheduled`, `ready_to_enroll` | None (superset of Card 8) |
| Tour flip | Per-child touring while case status is `open` / `qualification` | Case `tour_scheduled` with no touring OCM |
| Waitlist | N/A (already candidate) | Synthetic `synthetic-waitlist:` rows if any (Phase F) |

### Row IDs after flip

| Grain | Row `id` | `drawer_open` |
|-------|----------|---------------|
| OCM | `ocmrow:{opportunity_id}:{ocm_id}` | `entity_id` = opportunity; `active_subject` = OCM |
| Candidate | `pcrow:{opportunity_id}:{placement_candidate_id}` | `entity_id` = opportunity; `active_subject` = candidate |

### Placement + `active_subject` quality (Phase B)

| Lane | `placement_context` | `active_subject` | Drawer focus |
|------|---------------------|------------------|--------------|
| Enrolled (after flip) | OCM `location_id` + program fields when set; else `_inquiry_children` match | `child` + `stage_key: enrolled` | `subject_highlight` — **ready** |
| Enrolling (today Card 8) | From `_inquiry_children` / enrichment | `child` + `stage_key: enrolling` | **Ready** (Phase B) |
| Tour (after flip) | OCM columns + `_row_subject_placement` on Phase A rows | `child` + `stage_key: tour` | **Ready** after flip |
| Waitlist (today) | Candidate `site_id` / cohort on `_placement_waitlist_row` | `candidate` + `waitlist` | **Ready** (Phase B) |

---

## Recommended rollout order

1. **Enrolled** (`ALLOY_QUEUE_CHILD_GRAIN_LANES=enrollment_completed`) — first flip; aligns with design §8; count = OCM enrolled tracks.
2. **Enrolling** (`enrollment_offers`) — only after comparing Card 8 vs Phase A builder counts on staging; expect **+** rows if legacy dispositions exist on OCM without `offer_pending`/`enrolling`.
3. **Tour** (`tours` then `tours_follow_up`) — after Smith mixed-household QA; communicate count increase.
4. **Waitlist** — **no lane flip**; run candidate predicate audit, synthetic row inventory, location-scope QA.

---

## Rollback plan

| Layer | Rollback |
|-------|----------|
| **Lane routing** | Remove queue key from `ALLOY_QUEUE_CHILD_GRAIN_LANES` or unset env → immediate revert to case/Card 8 paths |
| **Card 8 enrolling** | `ALLOY_QUEUE_ENROLLMENT_CHILD_GRAIN_DISABLED=1` forces v1 compat (legacy case enrolling) |
| **Card 6 waitlist** | `ALLOY_QUEUE_WAITLIST_CANDIDATE_GRAIN_DISABLED=1` |
| **Queue row context** | `ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1` strips `_queue_row_context` (UI fallback) |
| **Deploy** | Revert commit; no DB migration required for Phase C per-lane flags |

---

## Env flag values (exact)

| Purpose | Value |
|---------|--------|
| **Default production** | unset — no Phase A lane routing |
| **First staging flip (Enrolled only)** | `ALLOY_QUEUE_CHILD_GRAIN_LANES=enrollment_completed` |
| **Enrolling builder replace** | `ALLOY_QUEUE_CHILD_GRAIN_LANES=enrollment_offers` |
| **Tour flip** | `ALLOY_QUEUE_CHILD_GRAIN_LANES=tours` or `tours,tours_follow_up` |
| **All OCM lanes (dev only)** | `ALLOY_QUEUE_CHILD_GRAIN_LANES=all` |
| **Disable row context** | `ALLOY_QUEUE_ROW_CONTEXT_DISABLED=1` |

Phase B honest `row_subject` does **not** require `ALLOY_QUEUE_CHILD_GRAIN_LANES`.

---

## UI readiness checklist (Phase B)

| Check | Status |
|-------|--------|
| Queue card shows child/candidate `queue_row.subject_label` | **Yes** — `applyQueueRowContextToLayoutRecord` + Phase B context |
| Duplicate subject suppressed only on case-grain rows | **Yes** — `isCaseGrainQueueRowContext` |
| Drawer focus strip (`subject_highlight`) | **Yes** — `buildDrawerSubjectContextFromQueueRowContext` + drawer display closeout |
| Lifecycle rail stage override | **Yes** — `applyDrawerSubjectStageFocusToLifecycleRailModel` |
| Placement on card when OCM/candidate site set | **Partial** — depends on OCM `location_id` / enrichment |
| Tests | `childGrainHonestRowSubject.test.ts`, `drawerSubjectFocusPresentation.test.ts` |

---

## Blockers and risks

| Blocker / risk | Severity | Mitigation |
|----------------|----------|------------|
| **OCM `outcome_status_key` not synced with case `status_key`** | High for Enrolled/Tour | Run preflight script per org; fix backfill before flip |
| **Empty OCM `location_id`** | Medium | Placement omitted; not a flip blocker |
| No `enrollment_stage_key` column | Low | Stage derived from disposition + queue key mapping |
| **Enrolling Phase A superset** adds rows | Medium | Diff counts before enabling `enrollment_offers` on flag |
| **Tour count jump** + duplicate household perception | High | Ops comms; case line on every row; flip one lane |
| **Waitlist: OCM waitlisted ≠ candidate rows** | Medium | 24 candidates vs 0 OCM waitlisted on dev org — candidate path is authoritative today |
| **Synthetic waitlist rows** | Low | Inventory `synthetic-waitlist:` ids; remove in Phase F |
| **Location scope** | Medium | OCM builder scopes on `OCM.location_id`; case tour used `opportunities.location_id` |
| **Performance** | Low–medium | OCM query per lane; batch enrichment unchanged; monitor Tour lane |
| **Row id / selection cache** | Medium | Warm-nav uses row `id`; ocmrow ids already on Enrolling/Waitlist |

---

## Staging verification checklist (before first flip)

- [ ] Deploy Phase B commit to staging
- [ ] Run `npx tsx scripts/childGrainPhaseCPreflight.ts` on staging org(s) with real enrollment data
- [ ] Record Enrolled case count vs OCM enrolled count; sign off delta
- [ ] Set `ALLOY_QUEUE_CHILD_GRAIN_LANES=enrollment_completed` **only** on staging
- [ ] Verify Enrolled lane count matches OCM enrolled script count
- [ ] Open `ocmrow:` row → drawer focus strip + child highlight + lifecycle rail `enrolled`
- [ ] Verify case-grain lanes (New Leads, Tour) unchanged
- [ ] Location-scoped user: Enrolled rows respect OCM `location_id` scope
- [ ] Rollback: unset flag → counts return to case-grain

---

## Preflight tooling

```bash
cd web
source .env.local  # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npx tsx scripts/childGrainPhaseCPreflight.ts
npx tsx scripts/childGrainPhaseCPreflight.ts --org-id <org_uuid>
```

---

## Related

- Design: [`child_grain_queue_conversion_design.md`](./child_grain_queue_conversion_design.md)
- Phase A flag: `web/lib/queues/childGrainLanesFeatureFlag.ts`
- Phase B attach: `web/lib/workUnits/attachQueueRowContextToItems.ts`

---

## Document maintenance

Update after first staging lane flip with actual before/after counts and operator sign-off.
