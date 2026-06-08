# Seed World v1 — Execution Plan

**Path:** `docs/platform_convergence/seed_world_execution_plan.md`  
**Status:** Implementation strategy (June 2026) — **planning only**  
**Scope:** Replace noisy staging demo data with the operational world defined in [`seed_world_v1.md`](./seed_world_v1.md)  
**Out of scope:** Loaders, migrations, database resets, script authorship, or staging execution in this document

---

## Purpose

This plan defines **how** Alloy replaces the current ad-hoc demo dataset (135-family realistic seed, access-validation packages, waitlist QA rows, one-off inquiry scenarios) with **Seed World v1** — a single, tagged, deterministic BrightPath enrollment world sized for demos, QA, and performance validation.

**Authoritative target contract:** [`seed_world_v1.md`](./seed_world_v1.md)  
**Current staging tooling (reference only — to be extended or superseded):**

| Artifact | Role today | Seed World v1 intent |
|----------|------------|----------------------|
| `web/scripts/resetStagingDemoData.ts` | Org-scoped demo wipe by metadata markers | Extend cleanup scope; new package id |
| `web/scripts/seedRealisticChildcareDemoData.ts` | 135-opportunity childcare seed | **Replace** with Seed World loader (40 families) |
| `web/scripts/lib/stagingDemoMarkers.ts` | `demo_seed_package`, `seed_key`, `is_demo_data` | Add `seed_world_v1` package + `demo_world_v1_key` |
| `web/scripts/seedAccessValidationDemo.ts` | Access-scope validation rows | **Do not extend** — remove via cleanup |
| Waitlist / forms QA scripts | Targeted scenario rows | Absorb narratives into Seed World exemplars |

---

## Preconditions

Before any cutover window:

| # | Precondition | Owner |
|---|--------------|-------|
| P1 | Target org identified (`DEMO_RESET_ORG_ID` or dedicated BrightPath staging org) | Platform |
| P2 | Communications sprint / canonical comms paths stable on staging | Comms |
| P3 | Enrollment pipeline queue_definition v2 + child-grain runtime shipped | CRM / workspace |
| P4 | No active staging demos or QA runs scheduled in cutover window | Ops |
| P5 | Stakeholders notified: staging URLs will show different family names/counts | Product |
| P6 | `VERCEL_ENV` ≠ `production` for all destructive steps | Infra guard |

**Hard rule:** No wipe or reseed against production. Existing guards in `resetStagingDemoData.ts` (`VERCEL_ENV=production` refusal, `DEMO_RESET_CONFIRM`) remain mandatory.

---

## Target org decision

Choose **one** path before Phase 1:

| Option | When to use | Tradeoff |
|--------|-------------|----------|
| **A — Repurpose existing demo org** (e.g. Demo Childcare Co) | Preserve auth users, form definitions, public link tokens already wired in QA docs | Must carefully preserve Layer 0 config; cleanup is surgical |
| **B — New org `brightpath-demo`** | Clean separation from legacy UUID references in sprint docs | Requires full Layer 0 bootstrap + new auth users |

**Recommendation:** Option A for staging continuity if Layer 0 config is already childcare-complete; Option B if legacy noise in config/metadata is high.

Document the chosen org id in a **Cutover Record** (single row: org id, option, operator, timestamp) stored outside the repo — not committed.

---

## Marker & tagging contract (implementation requirement)

All Seed World rows must be discoverable for idempotent upsert and safe cleanup.

| Metadata key | Value | Applies to |
|--------------|-------|------------|
| `is_demo_data` | `true` | All seeded operational rows |
| `demo_seed_package` | `seed_world_v1` | All seeded operational rows |
| `seed_source` | `seed_world_v1_loader` | Distinguish from legacy `staging_demo_reset` |
| `seed_key` | Stable slug (e.g. `family.rivera`, `site.north`) | Rows with natural keys |
| `demo_world_v1_key` | Same as exemplar keys in design doc | Exemplar families only (QA re-seek) |

**Legacy packages to remove** (extend `LEGACY_DEMO_SEED_PACKAGES` conceptually):

- `staging_realistic_childcare_seed_v1`
- `enrollment_pipeline_demo_v1` / `v2`
- `childcare_demo_v1`
- `access_validation_demo_v1` / `v2`
- `waitlist_demo_v1` and related QA-only markers

**Config preservation rule:** Do **not** tag platform config rows (`status_definitions`, `form_definitions`, lifecycle builder JSON) with demo markers unless they are seed-created duplicates — prefer **patch-in-place** on org config.

---

## 1. Backup strategy

### What to back up

| Tier | Contents | Method | Retention |
|------|----------|--------|-----------|
| **T0 — Full org snapshot** | All `org_id`-scoped rows for target org | Supabase logical backup or `pg_dump --data-only` filtered by org | 30 days minimum |
| **T1 — Config extract** | `departments`, `work_units`, `status_definitions`, lifecycle builder storage, `form_*`, `action_*`, `record_*` layouts, `org_settings`, tour availability rules | JSON export per table filtered by `org_id` | Permanent (small) |
| **T2 — Identity extract** | Auth user ids bound to demo personas (`user_roles`, `user_access_profiles`, `user_department_access`, `user_site_access`) | JSON export | Permanent |
| **T3 — Manifest** | Counts by table, list of demo `seed_key`s, public link ids referenced in QA docs | Generated summary artifact | With T0 |

### Backup procedure (Phase 1)

1. Record cutover timestamp (`T_cutover`) in Cutover Record.
2. Run **pre-flight counts** (table row counts by org) — baseline for validation delta.
3. Execute **T1 + T2** exports first (fast, restorable config).
4. Execute **T0** full snapshot to secure storage (not the repo).
5. Verify backup integrity: restore smoke test to **disposable** database or validate dump header + row counts.
6. Store backup location + checksum in Cutover Record.

### What backup does **not** need

- Other orgs on shared staging project
- Global platform tables (`role_definitions`, migrations history)
- `docs/supabase/reference/*.csv` (regenerate from schema export when needed)

---

## 2. Reset strategy

### Philosophy

**Surgical org wipe** — delete operational/demo narrative data; **preserve** Layer 0 configuration and auth unless explicitly rebuilding.

Align with existing doctrine in `resetStagingDemoData.ts`:

> Does not touch auth, orgs, org config, role_definitions, status_definitions, field_definitions, etc.

Seed World cutover **extends** deletion to newer operational tables not covered by the current reset script.

### Tables requiring cleanup extension (beyond current reset)

| Domain | Tables (org-scoped) | Delete strategy |
|--------|---------------------|-----------------|
| Waitlist | `placement_candidates` | Metadata marker or FK via OCM/opportunity |
| Tours | `tour_bookings` | FK via `opportunity_id` in demo set |
| Comms (canonical) | `communication_messages`, `communication_threads` | Marker or FK via opportunity |
| Comms (scheduled) | `communication_scheduled_sends` | Marker or FK |
| Tasks | `operational_tasks`, `task_assist_proposals` | Marker or FK |
| Forms runtime | `form_submissions`, `form_submission_documents`, `form_packet_sessions`, `form_packet_items` | Marker or FK |
| Documents | `documents` | Marker or FK via submission junction |
| Events | `workflow_events`, `workflow_runs`, `workflow_action_runs` | FK via demo opportunities |
| Legacy comms | `messages`, `messages_outbox` | Existing reset partial coverage — verify |

### Reset phases

| Step | Action | Gate |
|------|--------|------|
| R0 | **Dry-run count** — all tables in delete scope | Zero unexpected production org hits |
| R1 | **Execute delete** — children before parents (see §5) | `DEMO_RESET_CONFIRM=RESET_STAGING_DEMO_DATA` + `--execute` |
| R2 | **Orphan sweep** — persons/customers with demo markers but no FK parents | Optional second pass |
| R3 | **Post-reset counts** — expect 0 demo opportunities, 0 demo customers | Automated assertion |

### Location / structure reset policy

| Entity | Reset? | Notes |
|--------|--------|-------|
| `locations` (sites/units) | **Patch or upsert** | Prefer upsert-by-`seed_key` to BrightPath names; do not delete if breaks FK from preserved config |
| `departments` | **Preserve** | Patch metadata (attention buckets) only |
| `work_units` | **Preserve row** | Patch `queue_definition` + metadata |
| `persons` tagged demo | **Delete** | After opportunity/customer cascade |
| Staff persona persons | **Preserve** | Not tagged as demo narrative |

### Noise sources to eliminate

- 135-opportunity realistic seed (wrong scale vs v1 target 38 cases)
- Access Validation labeled rows (`FORBIDDEN_VISIBLE_SUBSTRINGS` in current seed)
- Duplicate campus names (North/South/West vs BrightPath naming)
- Orphan QA families from one-off scripts (`seedOneChildcareInquiryScenario`, waitlist demo scripts)
- Untagged rows that match FK closure of demo opportunities (include in FK-linked delete)

---

## 3. Configuration preservation

### Preserve (read-only during reset)

| Config surface | Why preserved |
|----------------|---------------|
| `organizations` row + `org_settings` | Tenant anchor, AI policy, timezone |
| `status_definitions` (opportunities + OCM) | Platform vocabulary |
| `field_definitions`, field groupings | Settings control plane |
| `record_drawer_layouts` / `record_layouts` | Drawer behavior |
| `action_definitions` + placements | Execute-now / capture-first actions |
| `form_definitions` + published versions | Reuse existing demo forms where valid |
| `form_packet_definitions` | Enrollment packet structure |
| `role_definitions`, `role_permission_grants` | RBAC |
| Auth users + `user_roles` | Login personas |
| `communication_provider_bindings` | Stub/sandbox delivery |
| `tour_availability_rules` | Patch slots if sites change |

### Patch after reset (before seed load)

| Surface | Patch intent |
|---------|--------------|
| `organizations.name` | → BrightPath Early Learning (if Option A) |
| `organizations.timezone` | → `America/Chicago` |
| `work_units` (`enrollment_pipeline`) | Confirm queue_definition v2 bundle + placement priority enabled |
| `departments.metadata` | Canonical Needs Attention buckets + readiness projection |
| `locations` | Align to 3 sites × 4 units per `seed_world_v1.md` |
| `user_access_profiles` | Wire Alex / Jordan / Sam / Riley scopes per design doc |
| Public link metadata | Update vertical slug to childcare where legacy `cleaning` drift exists |

### Do not preserve (replace via seed)

- All demo-tagged customers, persons (narrative), opportunities, OCM, candidates, bookings, comms, tasks, packets, documents tied to old packages
- `access_validation_demo_*` department trees if still present
- Legacy waitlist demo candidates not in v1 design

### Config validation checklist (pre–Phase 3)

Run **config-only** gates before inserting families:

- [ ] Lifecycle Builder enrollment process exists with stage requirements
- [ ] `enrollment_pipeline` queue lanes match v2 visible sections
- [ ] OCM status keys include `interested`, `waitlisted`, `enrolling`, `enrolled`, `not_enrolling`, `deferred`, `withdrawn`
- [ ] Opportunity pipeline keys cover tour substates + `qualification`
- [ ] Form packet `enrollment_packet.standard_v1` published
- [ ] Tour availability rules cover 3 sites
- [ ] Attention buckets: 9 lenses seeded on department or WU metadata
- [ ] Demo login users resolve with expected department/site scope

---

## 4. Data generation order

Follow Seed World layering (`seed_world_v1.md` § Data strategy). Each layer completes before the next starts.

```
Phase 3 execution order
═══════════════════════════════════════════════════════════════

Layer 0 — Config patch (§3)
    │
Layer 1 — Org structure
    ├─ locations (sites → units)          [upsert by seed_key]
    ├─ departments                        [patch metadata]
    ├─ work_units                         [patch queue_definition]
    └─ staff access profiles              [upsert scopes — no narrative data]
    │
Layer 2 — Identity & households
    ├─ persons (parents, then children)
    ├─ customers (households)
    ├─ customer_persons (role links)
    └─ customer_members (child roster)
    │
Layer 3 — Pipeline cases
    ├─ opportunities (case status, WU, location)
    ├─ opportunity_customer_members (per-child inquiry)
    ├─ opportunity_persons (secondary contacts)
    ├─ placement_candidates (waitlist grain)
    └─ tour_bookings + opportunity metadata mirror
    │
Layer 4 — Operational activity
    ├─ workflow_events (status changes, tour events, packet projections)
    ├─ communication_threads → communication_messages
    ├─ communication_scheduled_sends
    ├─ operational_tasks (+ next_follow_up_at sync)
    ├─ form_packet_sessions → items → form_submissions
    ├─ form_submission_documents → documents
    └─ optional task_assist_proposals (linked subset)
    │
Layer 5 — Attention & readiness stressors
    ├─ Deliberate field gaps (R1–R8 catalog)
    ├─ Timestamp offsets (stale, overdue, tour passed)
    └─ Verify resolver flags (no manual `_needs_attention` on rows)
```

### Generation modes

| Mode | Use |
|------|-----|
| **Exemplar pass** | Insert 10 named families first with exact `demo_world_v1_key` — anchors QA |
| **Bulk pass** | Deterministic PRNG (`seed = 20260606`) fills remaining counts to design totals |
| **Stressor pass** | Apply Layer 5 gaps and timestamps last so evaluators see final state |

### Server-path preference

Use existing server helpers for writes where loaders are implemented:

| Write | Preferred path |
|-------|----------------|
| Opportunity insert/update | `normalizeOpportunityWritePayload` / `insertOpportunityWithPersonFirst` |
| Status change + events | `updateOpportunityStatusWithEvent`, tour booking service |
| OCM PATCH semantics | Match admin API field allowlist |
| Packet session | `formPacketService` patterns |
| Comms enqueue | Canonical thread + message insert patterns |
| Task create | `validateOperationalTaskCreateBody` + follow-up sync |

Avoid raw PostgREST inserts that skip normalization — causes person/contact drift and breaks drawer hydration tests.

### Temporal anchoring

All date fields computed from **`T_load`** (loader execution time), not hard-coded calendar dates — ensures stale/tour/overdue attention reasons remain valid after reload.

---

## 5. Referential integrity strategy

### FK-safe delete order (Phase 2 cleanup)

Delete **dependents before parents** within org scope:

1. `communication_messages` → `communication_threads`
2. `communication_scheduled_sends`
3. `task_assist_proposals` → `operational_tasks`
4. `form_submission_documents` → `form_submissions` → `form_packet_items` → `form_packet_sessions`
5. `documents` (demo-tagged)
6. `workflow_action_runs` → `workflow_runs` → `workflow_events`
7. `placement_candidates`
8. `tour_bookings`
9. `opportunity_customer_members` → `opportunity_persons` → `opportunity_tags`
10. Quotes, messages, jobs, schedules (existing reset order)
11. `opportunities`
12. `customer_member_contacts` → `customer_members` → `customer_persons` → `contacts`
13. `customers`
14. `person_relationships`, `person_locations` → `persons` (demo narrative only)
15. Optional: demo-tagged `locations` **only if** no preserved FKs

### FK-safe insert order (Phase 3 seed)

Reverse of delete order within each layer; never insert OCM before `customer_members` + `opportunities` exist.

### Invariant enforcement (post-insert validators)

| ID | Rule | Failure severity |
|----|------|------------------|
| I1 | Every opportunity has valid `work_unit_id` → enrollment pipeline | **Block** |
| I2 | OCM.customer_id path matches opportunity.customer_id | **Block** |
| I3 | Waitlist candidates ⊆ children with OCM `waitlisted` \| `offer_pending` | **Block** |
| I4 | Enrolling/enrolled queue grain matches OCM disposition | **Block** |
| I5 | ≤1 active non-terminal `tour_bookings` per opportunity | **Block** |
| I6 | Confirmed tour → metadata `tour_date` / `tour_time` mirror | **Warn** |
| I7 | Withdrawn members not in active pipeline lanes | **Block** |
| I8 | ≥6 mixed-sibling households with divergent OCM statuses | **Block** (exemplar contract) |
| I9 | No visible label contains `Access Validation` or forbidden substrings | **Block** |
| I10 | Exemplar `demo_world_v1_key` rows all resolvable | **Block** |

### Transaction strategy

| Scope | Approach |
|-------|----------|
| Exemplar families (10) | Single transaction per family (all layers 2–4 for that household) |
| Bulk filler | Batched transactions (e.g. 10 families per batch) |
| Layer 5 stressors | Final transaction pass |

On batch failure: roll back batch, log `seed_key` + error, continue only if error is non-structural — otherwise abort loader.

---

## 6. Validation strategy

### Automated validation tiers

| Tier | When | Checks |
|------|------|--------|
| **V0 — Config** | After Phase 2, before seed | §3 checklist |
| **V1 — Counts** | After Phase 3 | Entity totals vs `seed_world_v1.md` scale table (±0 for exemplars, ±5% bulk) |
| **V2 — Integrity** | After Phase 3 | Invariants I1–I10 |
| **V3 — Queue lanes** | After Phase 3 | `GET /api/admin/work-units/:id/queues?summary_mode=all` — lane counts vs §5 queue distribution |
| **V4 — Attention** | After Phase 3 | Each of 9 bucket keys has ≥1 row; 12–15 unique opportunities flagged |
| **V5 — Exemplar keys** | After Phase 3 | SQL/API lookup by `metadata.demo_world_v1_key` for all 10 families |
| **V6 — TypeScript** | CI | `cd web && npx tsc --noEmit` on loader modules when implemented |
| **V7 — Existing QA harness** | Staging | Adapt `qaWaitlistDemoWalkthrough`, `qaEnrollmentLeadOpportunityProof`, queue determinism tests where org-agnostic |

### Count validation matrix (target)

| Entity | Target | Validator |
|--------|-------:|-----------|
| `customers` | 40 | org count + demo package filter |
| `customer_members` (children) | 58 | relationship = child |
| `opportunities` (active/recent) | 38 | status ≠ archived noise |
| `opportunity_customer_members` | 54 | — |
| `placement_candidates` | 14 | active/paused |
| `tour_bookings` (active) | 9 | non-terminal |
| `communication_threads` | 85 | — |
| `operational_tasks` | 45 | 27 open |
| `form_packet_sessions` | 12 | by status breakdown |
| Needs attention opportunities | 12–15 | resolver union |

### Manual validation spot checks

Minimum 5 drawer opens after automated pass:

1. Patel — new lead  
2. Rivera — mixed siblings / two sites  
3. Okonkwo — waitlist position  
4. Santos — packet + document gap  
5. Kim — withdrawn roster  

---

## 7. Rollback strategy

### Rollback triggers

- Invariant failures at **Block** severity after Phase 3
- Queue lane empty when design requires ≥N rows
- Staging demo broken for scheduled external demo (<24h)
- Unexpected deletion of preserved config (status definitions, forms)

### Rollback paths

| Path | Steps | Recovery time |
|------|-------|---------------|
| **RB1 — Full restore** | Restore T0 snapshot to staging org | Hours (infra dependent) |
| **RB2 — Config-only restore** | Restore T1 + T2 JSON; re-run previous demo seed | ~1 hour |
| **RB3 — Forward fix** | Patch loader; run incremental exemplar pass only | ~30 min |

**Default:** RB1 if opportunity/customer counts drop to zero unexpectedly or config rows deleted.

### Rollback procedure

1. Stop loader if still running.
2. Announce staging freeze on rollback path.
3. Restore from T0 or RB2 as appropriate.
4. Re-run V0–V3 validators on restored state.
5. Update Cutover Record with rollback reason + new attempt date.
6. Post-mortem: which invariant failed, cleanup gap, or config patch error.

### Partial rollback (not preferred)

Do **not** leave staging in half-old / half-new state overnight. If Phase 3 fails mid-batch, either complete forward fix or full rollback — not a mixed 135 + 40 family org.

---

## 8. Acceptance testing

### Acceptance criteria (launch gate)

All must pass before declaring Seed World v1 **staging-ready**:

| AC | Criterion |
|----|-----------|
| AC1 | Zero legacy demo packages remain in org operational data |
| AC2 | Automated V1–V5 validation green |
| AC3 | All 12 demo walkthrough scripts (`seed_world_v1.md` § Demo walkthrough scripts) pass manually |
| AC4 | Site filter (Downtown) reduces waitlist/tour counts correctly |
| AC5 | Scoped user (Riley) sees Downtown-only visibility |
| AC6 | Global search finds exemplar children by first name |
| AC7 | AdminV2 dept bootstrap loads without false-empty queue states |
| AC8 | No forbidden visible demo strings in queue/drawer UI |
| AC9 | Performance: dept bootstrap + drawer GET within staging SLO on 3 exemplar opens |
| AC10 | Cutover Record complete (backup checksum, operator, timestamp) |

### Acceptance test phases

| Phase | Focus | Entry criteria |
|-------|-------|----------------|
| **AT-1 Smoke** | Login, dept page loads, one drawer open | V3 pass |
| **AT-2 Walkthrough** | 12 scripted operator paths | AT-1 pass |
| **AT-3 Access** | Corporate / regional / director personas | AT-1 pass |
| **AT-4 Performance** | Bootstrap timing, 50-row queue cap | AT-2 pass |
| **AT-5 Regression** | Existing Vitest suite with staging org env optional | CI green |

### Sign-off

| Role | Sign-off |
|------|----------|
| Platform engineering | V1–V5 automated + rollback tested |
| Product / demo owner | AT-2 walkthrough scripts |
| QA | AC8 + exemplar key seek |
| Infra | T0 backup verified restorable |

---

## Phased execution schedule

### Phase 1 — Export, backup, validation

**Goal:** Safe baseline before any deletion.

| Step | Activity | Output |
|------|----------|--------|
| 1.1 | Confirm target org + Option A/B | Cutover Record started |
| 1.2 | Run pre-flight table counts | Baseline count manifest |
| 1.3 | Export T1 config + T2 identity | JSON artifacts in secure storage |
| 1.4 | Execute T0 full org snapshot | Backup + checksum |
| 1.5 | Verify restore smoke (disposable DB) | Backup validity sign-off |
| 1.6 | Run V0 config checklist | Pass/fail report |
| 1.7 | Document public link ids / QA doc UUIDs that must survive | Preservation list |

**Exit gate:** T0 verified; V0 green or explicit patch plan for Phase 2.

---

### Phase 2 — Cleanup

**Goal:** Remove noisy demo data without destroying Layer 0 config.

| Step | Activity | Output |
|------|----------|--------|
| 2.1 | Extend delete scope for comms, tasks, tours, candidates, packets (implementation) | Updated reset dry-run |
| 2.2 | Run **dry-run** reset — review counts vs baseline | Dry-run report |
| 2.3 | Stakeholder ack on count deltas | Written approval |
| 2.4 | Execute reset with env gates | Post-reset zero demo opportunities |
| 2.5 | Orphan sweep for untagged FK closure rows | Clean org narrative slate |
| 2.6 | Patch Layer 0 config (§3) | BrightPath structure ready |
| 2.7 | Re-run V0 | Config ready for seed |

**Exit gate:** Post-reset counts near zero for pipeline entities; preserved config intact; V0 green.

---

### Phase 3 — Seed generation

**Goal:** Load Seed World v1 per design doc.

| Step | Activity | Output |
|------|----------|--------|
| 3.1 | Implement loader (separate workstream — not this doc) | `seed_world_v1` package |
| 3.2 | Exemplar pass — 10 keyed families | Anchors queryable by `demo_world_v1_key` |
| 3.3 | Bulk pass — fill to scale targets | Count manifest match |
| 3.4 | Layer 4 activity — comms, tasks, packets, documents | Operational density |
| 3.5 | Layer 5 stressors — gaps + timestamps | Attention buckets populated |
| 3.6 | Run invariants I1–I10 | Integrity report |

**Exit gate:** V1 + V2 green; no Block failures.

---

### Phase 4 — Verification

**Goal:** Automated + spot-check confirmation.

| Step | Activity | Output |
|------|----------|--------|
| 4.1 | V3 queue lane validation | Lane count report |
| 4.2 | V4 attention bucket validation | Bucket coverage report |
| 4.3 | V5 exemplar key resolution | 10/10 keys found |
| 4.4 | V7 adapted QA scripts | Script pass log |
| 4.5 | Manual spot checks (5 drawers) | Spot-check checklist |
| 4.6 | Compare staging UI screenshots to pre-cutover checklist | Visual regression notes |

**Exit gate:** V3–V5 green; spot checks pass.

---

### Phase 5 — Launch readiness validation

**Goal:** Staging declared demo-ready for product, sales, and performance work.

| Step | Activity | Output |
|------|----------|--------|
| 5.1 | AT-1 smoke | Smoke pass |
| 5.2 | AT-2 full walkthrough (12 scripts) | Walkthrough sign-off |
| 5.3 | AT-3 access personas | Scope validation |
| 5.4 | AT-4 performance sampling | Timing log |
| 5.5 | AT-5 CI regression | Green build |
| 5.6 | Update sprint/docs references pointing at old org narratives | Doc drift cleanup (separate PR) |
| 5.7 | Final sign-off table (§8) | **Seed World v1 staging-ready** |

**Exit gate:** AC1–AC10 satisfied; Cutover Record closed.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Reset misses new tables (comms, tasks, packets) | High | Orphan noise | Extend dry-run table list; FK closure pass |
| Config accidentally deleted | Low | High | T1 backup; preserve list in §3 |
| QA docs reference old UUIDs | High | Medium | Preservation list + doc update Phase 5.6 |
| Loader skips person-first normalization | Medium | High | Mandate server helpers §4 |
| Attention reasons stale after load | Medium | Medium | Relative timestamps from `T_load` |
| 135→40 count shock for operators | Medium | Low | Pre-announce; BrightPath naming |
| Shared staging concurrent QA | Medium | Medium | Cutover window + freeze |
| Rollback untested | Low | High | Phase 1 restore smoke mandatory |

---

## Implementation workstreams (post-plan)

These are **separate deliverables** — not part of this planning doc:

| Workstream | Deliverable | Depends on |
|------------|-------------|------------|
| WS1 | Extended reset + orphan sweep | Phase 2 design |
| WS2 | `seed_world_v1` loader + markers | `stagingDemoMarkers` extension |
| WS3 | Validation CLI (counts + invariants + queue summary) | WS2 |
| WS4 | npm script entries (`demo:seed-world`, etc.) | WS1–WS3 |
| WS5 | QA doc UUID migration guide | Cutover Record |

---

## Document map

| Doc | Relationship |
|-----|--------------|
| [`seed_world_v1.md`](./seed_world_v1.md) | **What** to load |
| **This file** | **How** to cut over safely |
| `docs/sprints/05_2026/staging_demo_reseed_sprint.md` | Historical intent — superseded by platform convergence |
| `docs/execution/operating-doctrine.md` | Same-PR doc updates if loader changes behavior |

---

## Revision history

| Date | Change |
|------|--------|
| 2026-06-06 | Initial execution plan |
