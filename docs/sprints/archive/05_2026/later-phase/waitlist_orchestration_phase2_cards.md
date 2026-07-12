# Waitlist Orchestration Phase 2 — Implementation Cards

**Status:** **Phase 2 complete** — Cards 0–7 shipped; pilot-ready with `shadow_mode: true`  
**Date:** 2026-05-27  
**Architecture:** [waitlist_orchestration_phase2_architecture.md](waitlist_orchestration_phase2_architecture.md)  
**Audit:** [waitlist_orchestration_phase2_audit.md](waitlist_orchestration_phase2_audit.md)  
**Pilot playbook:** [waitlist_orchestration_phase2_pilot_playbook.md](waitlist_orchestration_phase2_pilot_playbook.md)

---

## Implementation guardrails (Phase 2)

Locked at **Card 0** — apply to every implementation PR unless a later card explicitly revises with product sign-off:

| Guardrail | Meaning |
|-----------|---------|
| **No parallel queue engine** | Placement/waitlist projection stays on **`QueueService`** (+ modules it calls). **`resolveOpportunityQueueFromDefinition`** does not gain placement logic. |
| **No UI-only room grouping** | Program/room sections and sort keys come from **evaluator + config/cohort keys** — not hardcoded React grouping. |
| **No family-level waitlist truth** | Durable orchestration units are **placement candidates** (child × program/room cohort); the opportunity remains lifecycle/comms shell — not the ranked waitlist record. |
| **No persisted ordinal/rank in this phase** | **`scoped_waitlist_position`** / cohort `#n` remain **runtime-derived** on queue load (cap + page scoped) unless explicitly approved in a **future** card. **Do not** add snapshot/ordinal tables for rank in Cards 1–7. |
| **No financial / waitlist payment in this phase** | Deposits, contracts, subsidy timing — **integration hooks only**; no payment or billing implementation. |
| **No capacity engine** | Forecasting = **optional facts + schema hooks** (Card 6); no graduation solver, ratio optimization, or auto-promotion from forecast. |
| **Overrides are additive** | Manual overrides adjust **evaluator inputs and/or effective ordering output**; they **do not** replace or edit canonical **priority policy** (preset buckets/rules). Policy evaluation always runs; effective sort merges override layer. |

---

## Sequencing overview

```text
Card 0 ──► Card 1 ──► Card 2 ──► Card 3 ──► Card 4 ──► Card 5 ──► Card 6 ──► Card 7
 audit      data       eval/      queue      UX/        overrides  forecast   polish
 stabilize  model      runtime    integr.    workspace             hooks
```

**Parallelization:** Card 4 (UX) may start after Card 3 **API shape** is frozen; Card 5 requires Card 2–3; Card 6 is mostly schema/metadata and can overlap Card 2.

---

## Card 0 — Audit stabilization

**Status:** **Complete** (docs only — 2026-05-27)  
**Goal:** Lock Phase 2 baseline, close doc drift, and gate implementation on explicit decisions.

### Card 0 decision log (locked)

| Decision | Resolution |
|----------|------------|
| **Orchestration unit** | **Placement candidate** entity (persisted) — not metadata-only child blobs on `opportunities`. |
| **Default queue projection (original Card 0)** | **`family_row`** — one queue row per opportunity (household inquiry shell). |
| **Waitlist queue projection (revised Card 4.6)** | **`candidate_row`** — one queue row per **`placement_candidate`** (child × cohort). Opportunity/family remains lifecycle/comms context, not waitlist row identity. |
| **Candidate-level detail** | **Operational waitlist rows** are candidate rows grouped by **`program_room_cohort_key`**. Family/opportunity detail stays on row as context (household, parent, sibling indicator). Entity GET / admin read API may still use **`family_row`** projection. |
| **Rank / ordinal persistence** | **Runtime-derived only** for Phase 2 — same doctrine as V1 (`evaluation_cap`, page-local `#n`). **No** persisted cohort ordinal or rank snapshot tables in Cards 1–7. |
| **What to persist** | **Only:** `placement_candidates`, `placement_link_groups` (+ members), `placement_overrides`, and **audit trail** for overrides/mutations. |
| **Manual overrides** | Affect **evaluator inputs and/or effective ordering output**; **do not** replace canonical priority policy (preset buckets/rules). Policy eval always runs; UI shows **policy vs effective** where overrides apply. |
| **Forecasting** | **Hooks and optional facts only** (Card 6) — **not** a capacity engine, auto-promotion, or schedule solver. |
| **`queue_definition.group_by`** | **Defer / deprecate** — use **`primary_group_fact_key`** + server-side cohort keys for grouping; do not implement unused `group_by` in Card 3 without separate approval. |

Cross-links added: **`docs/product/crm-system.md`**, **`docs/archive/2026-06-superseded-system/workspace-system.md`** (Phase 2 = planned architecture, not shipped runtime).

### Scope (completed)

- [x] Publish [audit](waitlist_orchestration_phase2_audit.md) + [architecture](waitlist_orchestration_phase2_architecture.md) + this cards doc.  
- [x] Cross-links from CRM + workspace system docs.  
- [x] Decision log + implementation guardrails (above).  

### Dependencies

- None (reads V1 sprint + codebase).

### Risks

| Risk | Mitigation |
|------|------------|
| Stakeholders expect immediate UX wins | Emphasize architecture-first scope in comms |
| Dual interpreter debt ignored | Keep Card 0.5 V1 lock on Growth path in acceptance criteria for Card 3 |

### Doctrine constraints

- No production behavior change in Card 0.  
- Queues remain preview; no new parallel engines.

### Acceptance criteria

- [x] Audit + architecture + cards published; Card 0 decisions committed (this section).  
- [x] Cross-links in `crm-system.md` and `workspace-system.md`.  
- [x] Implementation guardrails section added.  
- [x] Explicit **out of scope**: capacity solver, billing, AI ranking, persisted rank, parallel queue engine.  
- [ ] Product/engineering formal sign-off (optional checkbox for pilot kickoff).  
- [ ] V1 regression suite green before **Card 1** code lands (`tests/orchestration/placement/`, `tests/queues/`).

---

## Card 1 — Data model

**Status:** **Complete** (schema + docs — 2026-05-27)  
**Goal:** Introduce **placement candidate** (+ optional **link group**) as durable orchestration units without breaking opportunity lifecycle.

### Card 1 decisions (locked at implementation)

| Topic | Resolution |
|-------|------------|
| Link groups | Normalized **`placement_link_groups`** + **`placement_link_group_members`** |
| Cohort key | **`program_room_cohort_key`** (canonical) + **`program_room_group_label`** (V1 string compatibility) |
| No OCM children | **`is_synthetic_fallback = true`** candidate per opportunity × cohort |
| Overrides table | **`placement_overrides`** included now; merge/APIs in **Card 5** |
| Candidate `status` | `active`, `paused`, `withdrawn`, `placed` (minimal substates) |
| Rank persistence | **None** — no ordinal/snapshot columns |

### Implementation notes

| Artifact | Path |
|----------|------|
| Migration | `supabase/migrations/20260527140000_waitlist_orchestration_placement_foundation.sql` |
| Table semantics | [architecture §11](waitlist_orchestration_phase2_architecture.md) |
| Reference CSV | `docs/supabase/reference/*.csv` — full export via Gate 1A (`npm run export:supabase-schema`) |

**Gate 1A (2026-05-27):** Migration applied on dev DB; reference CSVs regenerated; live catalog matches §11.

**Not wired until later cards:** drawer/queue UI (Card 4), override merge (Card 5). **`QueueService` V2** available behind `engine_version: "v2"` (Card 3).

### Dependencies

- Card 0 decisions (entity shape, link group model).

### Risks

| Risk | Mitigation |
|------|------------|
| Duplicate candidates on re-run backfill | `seed_key` + partial unique indexes on active/paused |
| OCM / metadata mismatch | Integrity trigger on insert/update |
| Migration weight on large orgs | Empty tables until backfill; batched script later |

### Doctrine constraints

- **Opportunity remains** lifecycle SoT — candidates do not replace `status_key`.  
- **Person/household canonical** — FK to `customer_members` / `persons`, not metadata child blobs.  
- No queue table as SoT.

### Acceptance criteria

- [x] Schema in `supabase/migrations/20260527140000_waitlist_orchestration_placement_foundation.sql`.  
- [x] RLS: org-scoped SELECT; owner/admin/ops mutate; service_role ALL.  
- [x] Reference `supabase_tables.csv` updated; full export documented when DB connected.  
- [x] Architecture §11 documents final shapes; **no rank columns**.  
- [x] Backfill script shipped in **Card 2** (`npm run dev:backfill:placement-candidates`).  
- [x] Admin read API shipped in **Card 2**.  
- [x] No queue/UI wiring in Card 1.

### Gate 1A — migration apply + reference refresh (2026-05-27)

**Applied:** `20260527140000_waitlist_orchestration_placement_foundation.sql` against active dev DB (`DATABASE_URL` from `web/.env.local`, **direct `:5432`** session — pooler `:6543` used for read-only export only).

**Recorded:** `supabase_migrations.schema_migrations` version `20260527140000` (`waitlist_orchestration_placement_foundation`).

**Verification (live catalog):**

| Check | Result |
|-------|--------|
| All 4 tables exist | Pass |
| Columns match architecture §11 | Pass (no mismatches) |
| CHECK constraints (`status`, `link_mode`, `override_kind`, synthetic identity, cohort key nonempty, temporary requires `expires_at`) | Pass |
| Partial unique indexes (`seed_key`, OCM×cohort, synthetic×cohort, active pin) | Pass |
| Integrity triggers (4 validate + 3 `updated_at`) | Pass |
| RLS enabled on all 4 tables | Pass |
| 3 policies per table (`select_org`, `mutate_crm`, `service_all`) | Pass |
| Rank/ordinal columns | **0** (pass) |

**Reference CSVs:** Regenerated via `npm run export:supabase-schema` — all 8 files under `docs/supabase/reference/`.

**Schema vs docs:** No drift; Card 1 / architecture §11 unchanged.

---

## Card 2 — Candidate runtime foundation (backfill, API, adapter, v2 preset)

**Status:** **Complete** (2026-05-27)  
**Goal:** Child-first placement candidate runtime **without** changing queue UI or `QueueService` projection (Card 3).

### Shipped

| Area | Path / command |
|------|----------------|
| Cohort mapping | `web/lib/orchestration/placement/resolveProgramRoomCohort.ts` |
| Backfill | `web/lib/orchestration/placement/backfill/placementCandidateBackfill.ts` · `npm run dev:backfill:placement-candidates` |
| Read API | `GET /api/admin/opportunities/[id]/placement-candidates` · `loadOpportunityPlacementCandidates.ts` |
| Fact adapter | `web/lib/orchestration/placement/adapters/placementCandidateFacts.ts` |
| V2 preset | `childcare_enrollment_waitlist_v2` · `presets/childcareEnrollmentPlacementProfileV2.ts` |
| Family rollup scaffold | `rollupFamilyPlacementSortTuple.ts` (Card 3 consumer) |
| Evaluator label | `program_room_group_label` fact preferred over slug for snapshot display |

### Explicitly not shipped (Card 2)

- **`QueueService`** row projection / reorder (Card 3)  
- **Admin V2** waitlist UI changes (Card 4)  
- **Override merge** behavior (Card 5)  
- **Link group** auto-creation on backfill (runtime defaults missing group → `independent`)  
- Persisted rank / ordinal  

### Dev validation (pilot org)

- Dry-run: 18 waitlisted opportunities → 21 real candidates proposed, 0 synthetic.  
- Apply: 21 `placement_candidates` inserted (idempotent `seed_key`).  
- Loader smoke: `projection_mode: family_row`, per-child cohort + display name, no rank fields.

### Dependencies

- Card 1 schema (Gate 1A applied).

### Acceptance criteria

- [x] `resolveProgramRoomCohort` + tests.  
- [x] Idempotent backfill with dry-run counts.  
- [x] Placement candidates GET API (org-scoped, no ordinal).  
- [x] `buildPlacementCandidateFacts` + `evaluatePlacementCandidate` + v2 preset in registry.  
- [x] `pickFamilyRollupSortTuple` scaffold + test.  
- [x] V1 preset + opportunity-only `QueueService` path **unchanged**.  
- [x] Targeted Vitest: 24 tests in placement suite (new + existing).  

---

## Card 3 — Queue integration

**Status:** **Complete** (2026-05-27)  
**Goal:** Wire candidate evaluation into **`QueueService`** for waitlist lanes behind config; maintain V1 fallback.

### Shipped

| Area | Path |
|------|------|
| Config | `placement_priority_v1.engine_version`: `"v1"` \| `"v2"` (default `v1`) |
| Bulk load | `bulkLoadPlacementCandidatesByOpportunity.ts` |
| V2 apply | `applyPlacementV2ToOpportunityQueueRows.ts` → `_placement_priority_v2` |
| Family rollup | `computeFamilyPlacementRollup.ts` (strict = max within group) |
| QueueService | `attachPlacementToEnrichedOpportunityItems` (async; v2 branch) |
| Demo layer | `PLACEMENT_PRIORITY_DEMO_LAYER_V2` (`shadow_mode: true`) |

### Config shape (work unit / department metadata)

```json
{
  "placement_priority_v1": {
    "version": 1,
    "enabled": true,
    "engine_version": "v2",
    "profile_id": "childcare_enrollment_waitlist_v2",
    "profile_revision": "2026-05-27",
    "queue_keys_enabled": ["waitlisted"],
    "shadow_mode": true,
    "evaluation_cap": 200
  }
}
```

- **`shadow_mode: true`** — attach `_placement_priority_v2`, preserve SQL order.  
- **`shadow_mode: false`** — reorder evaluated prefix by `family_rollup.sort_tuple`.  
- **No candidates** — V1 `_placement_priority` + `fallback_to_v1` on v2 payload.  
- **Legacy `_placement_priority`** untouched when v2 evaluates candidates (no silent shape change).

### Pilot enable

Patch `work_units.metadata.placement_priority_v1` on enrollment work unit (after backfill), or use `PLACEMENT_PRIORITY_DEMO_LAYER_V2` in seeds.

### Not shipped (Card 3)

- `placement_priority_snapshot_changed` event.  
- KPI consolidation spike.  
- Queue UI for candidates → **Card 4**.

### Acceptance criteria

- [x] V2 disabled → V1 path unchanged.  
- [x] V2 + candidates → `_placement_priority_v2` on rows.  
- [x] Shadow / non-shadow reorder tests.  
- [x] Missing candidates → V1 fallback + diagnostics.  
- [x] Multi-child → `candidates[]` on family rollup during eval (Card 3); **Card 4.6** fans out to one queue row per candidate for waitlist UI.  
- [x] Strict link conservative rollup.  
- [x] No persisted rank/ordinal.  
- [x] Vitest: 100 tests in placement + QueueService placement suite.

---

## Card 4 — UX / workspace integration (superseded for waitlist by Card 4.6)

**Status:** **Superseded** for waitlist presentation (2026-05-27) — initial slice shipped **family_row** UI; **Card 4.6** corrects to **candidate_row**.  
**Goal:** Present child-first orchestration from `_placement_priority_v2` without owning sort logic in React.

### Original Card 4 slice (retained for reference / non-waitlist paths)

| Area | Path |
|------|------|
| V2 parse / format (family rollup) | `web/lib/ui-v2/queuePlacementPriorityV2Presentation.ts` |
| Family row panel (legacy) | `QueueRowPlacementPriorityV2Panel.tsx` |
| V1 `#n` tooltip | `QueueRowPlacementPriorityStrip.tsx` |

**Lesson:** Multi-child families must **not** appear as one row with combined cohort labels (e.g. “Preschool · Pre-K · Young Toddler”). See **Card 4.6**.

---

## Card 4.6 — Waitlist candidate-row projection correction

**Status:** **Complete** (2026-05-27)  
**Goal:** Waitlist queue UI is **candidate/child-row based**, not family-row based. Each child appears in their own program/cohort section; opportunity/family is context only.

### Doctrine (locked)

| Topic | Resolution |
|-------|------------|
| **Waitlist row identity** | One **`placement_candidate`** per queue list row (child × **`program_room_cohort_key`**). |
| **Opportunity / family** | Context on each row (household name, parent/contact, opportunity id) — lifecycle/actions still target the **opportunity**. |
| **Grouping** | Server-side cohort sections from **`program_room_cohort_key`** — no combined multi-cohort labels on a single row. |
| **Siblings** | Read-only **`sibling_context`** indicator (same opportunity / link group) — **do not merge** sibling candidates into one row. |
| **Rank** | Runtime-derived only — **no persisted ordinal**. |
| **V1 fallback** | Unchanged when V2 off, no candidates, or `fallback_to_v1`. |
| **Card 5** | **Not started** — no override create/release UI. |

### Shipped

| Area | Path |
|------|------|
| Candidate fan-out | `web/lib/orchestration/placement/placementWaitlistCandidateRowProjection.ts` |
| Candidate sort | `web/lib/orchestration/placement/sortPlacementCandidateQueueRows.ts` |
| QueueService wiring | `QueueService.ts` — expand after `applyPlacementV2ToOpportunityQueueRows` |
| Row payload | `_placement_waitlist_row` (`row_projection: "placement_candidate"`) |
| UI parse | `web/lib/ui-v2/queuePlacementWaitlistCandidatePresentation.ts` |
| Candidate panel | `QueueRowPlacementCandidatePanel.tsx` |
| Queue wiring | `QueueBlock.tsx`, work-unit `page.tsx` (`opportunityId` for actions) |
| Types / styles | `workspace-types.ts`, `workspace.css` |
| QA gate | `web/scripts/qaWaitlistPlacementV2Gate.ts` |

### Row payload (waitlist presentation)

Each V2 waitlist row exposes **`_placement_waitlist_row`**: `placement_candidate_id`, `opportunity_id`, child/family/parent display names, single **`program_room_cohort_key`** + label, bucket, `wait_since`, **`sibling_context`**, and per-candidate **`placement_priority_v2`** diagnostics. List **`id`** = `pcrow:{opportunity_id}:{placement_candidate_id}`.

### UI behavior

- **Primary name** = child; **secondary** = household/family + parent/contact.  
- **Sibling indicator** when other candidates share the opportunity or link group (“N siblings also waitlisted”, expandable summary).  
- **Actions** (Open, Update status, Message, Ask BOS) remain tied to **`opportunity_id`**.  
- **No** combined cohort headers on one row; **no** override management UI.

### Acceptance criteria

- [x] Multi-child opportunity → separate rows in separate cohort sections (e.g. Liam in Preschool 3–4, Sophia in Young Toddler).  
- [x] Each row includes family + sibling context without merging.  
- [x] V1 fallback unchanged when V2 disabled or missing candidates.  
- [x] Opportunity actions preserved.  
- [x] No persisted rank; no Card 5 override UI.  
- [x] Vitest: `placementWaitlistCandidateRowProjection`, `queuePlacementWaitlistCandidatePresentation`, `QueueServicePlacementProjection`.

### Not shipped (Card 4.6)

- Override create/release UI (Card 5).  
- Entity drawer `_placement` section polish (optional follow-up).  
- Payment, forecasting, persisted rank.

---

## Card 4.7 — Candidate row layout cleanup

**Status:** **Complete** (2026-05-27)  
**Goal:** UI-only readability pass for **`placement_candidate`** rows now that projection is correct — use horizontal space, child as primary title, structured placement summary.

### Shipped

| Area | Change |
|------|--------|
| Scan layout | `CrmCompactQueuePreview` — dedicated 3-zone row: identity (child + household + siblings) · contact/timing · placement summary |
| Components | `QueueRowPlacementCandidateContext` (siblings/link) + `QueueRowPlacementCandidateSummary` (Program, Priority, Waiting since, Site) |
| CRM slice | Candidate rows exclude `children_programs` fact group — program lives in summary column only |
| Lane hint | `buildPlacementV2QueueHint` — shadow copy at queue header only (no per-row “Preview only…” noise) |
| Styles | `workspace.css` — `--waitlist-candidate` grid, summary dl, secondary sibling toggle |

### Acceptance criteria

- [x] Child name is primary row title (top of identity zone).  
- [x] Program / bucket / wait / site in structured summary column — not crammed under status.  
- [x] Left-heavy overload reduced; contact column uses middle space.  
- [x] Sibling indicator visible but secondary.  
- [x] V1 fallback, grouping, opportunity actions, no rank, no override UI preserved.  
- [x] Hayes trace: three distinct cohort sections, no combined labels (`debugWaitlistHayesRenderTrace.ts` → `PASS`).

### Not shipped (Card 4.7)

- Override create/release UI (Card 5).  
- Entity drawer `_placement` section polish.

---

## Card 4.8 — Restore consistent queue row layout

**Status:** **Complete** (2026-05-27)  
**Goal:** Keep candidate-row projection behavior but render within the **standard work-unit CRM compact row** — Child/Program columns, family identity left, compact waitlist chips.

### Shipped

| Area | Change |
|------|--------|
| Layout | Removed Card 4.7 custom 3-zone scan branch — candidate rows use same left/middle/actions grid as other work-unit rows |
| Identity | `primaryIdentity` = family/customer name; parent as secondary household context |
| Fact groups | Restored `children_programs` grid: Child = candidate name, Program = single cohort label |
| Waitlist meta | `QueueRowPlacementCandidateMetaChips` — bucket, wait since, site as compact chips in middle zone |
| Siblings | `QueueRowPlacementCandidateContext` remains in left column (secondary) |

### Acceptance criteria

- [x] Row visually matches normal work-unit queue records.  
- [x] Child column = candidate child; Program column = single cohort.  
- [x] No combined cohort labels; no Card 4.7 bottom/summary preview block.  
- [x] V1 fallback, grouping, opportunity actions, no rank, no override UI preserved.

### Not shipped (Card 4.8)

- Override create/release UI (Card 5).

---

## Card 5 — Overrides

**Status:** **Complete** (2026-05-27)  
**Goal:** Auditable manual placement overrides on **`placement_candidate`** rows — pin, tier_boost, temporary.

### Shipped

| Area | Path |
|------|------|
| Merge layer | `applyPlacementCandidateOverrides.ts` — policy eval preserved; effective bucket/sort tuple adjusted |
| Expiry filter | `filterActivePlacementOverrides.ts` |
| Payload validation | `placementOverridePayload.ts` |
| Mutations | `placementOverrideMutations.ts` |
| Create API | `POST /api/admin/placement-candidates/[candidateId]/overrides` |
| Release API | `POST /api/admin/placement-candidates/[candidateId]/overrides/[overrideId]/release` |
| Evaluator wiring | `evaluatePlacementCandidate` + `bulkLoadPlacementCandidatesByOpportunity` (payload + expiry) |
| Queue UI | `QueueRowPlacementManualOrderControls` — inline ↑/↓ + note modal; “Manually adjusted” chip |

### Behavior

- Overrides target **`placement_candidate_id`** + **`program_room_cohort_key`** (DB trigger enforced).  
- **Reason required** on create and release; release sets `is_active=false` (history preserved).  
- **Policy evaluator always runs**; overrides adjust effective bucket / manual precedence in sort tuple.  
- **No persisted rank/ordinal** — pin uses runtime sort prefix only.  
- Audit via `logAdminAudit` on create/release.

### Acceptance criteria

- [x] Create/release admin APIs (admin/ops gated).  
- [x] Evaluator ordering reflects active tier_boost / pin overrides.  
- [x] Candidate row shows override chip + inline manual order controls (Card 5.1).  
- [x] V1 fallback and candidate-row projection unchanged.  
- [x] Tests: merge layer, API routes, chip display.

---

## Card 5.1 — Manual order UX correction

**Status:** **Complete** (2026-05-27)  
**Goal:** Replace action-stack Override modal with inline ↑/↓ controls (Forms preview pattern).

### Shipped

| Area | Path |
|------|------|
| Inline controls | `QueueRowPlacementManualOrderControls.tsx` — ↑/↓ beside row, required note modal |
| Upsert API | `POST /api/admin/placement-candidates/[candidateId]/manual-position` |
| Pin upsert | `upsertPlacementPinOverride` + `releaseManualPositionOverrides` in `placementOverrideMutations.ts` |
| Chip copy | “Manually adjusted” + reason tooltip (no “pin” / “tier_boost” in UI) |
| Cohort bounds | Move up disabled on first row; move down disabled on last row in section |

### Behavior

- Move up/down creates or updates active **pin** override for that candidate in cohort.  
- **Reset adjustment** releases pin override(s) with required note.  
- Shadow mode: adjustment saved + chip shown; list order unchanged unless config allows live sort.  
- Opportunity quick actions unchanged; no override controls in action stack.

### Acceptance criteria

- [x] Inline ↑/↓ on V2 candidate rows within cohort sections.  
- [x] Required note before apply; stored as override reason + audit.  
- [x] “Manually adjusted” chip with tooltip; secondary reset.  
- [x] Card 5 backend/audit preserved; no V1 regression.

---

## Card 5.2 — Manual order UI polish

**Status:** **Complete** (2026-05-27)  
**Goal:** Polish inline ↑/↓ label and portaled modal overlay (no logic changes).

### Shipped

- “Adjust order” label under ↑/↓ (replaces confusing “PREVIEW”).
- Modal rendered via `createPortal` to `document.body` — consistent dim backdrop, no queue-card clipping/glow artifacts.
- Dialog-specific button + textarea styles; subtle shadow-mode note in modal.

### Acceptance criteria

- [x] Label reads “Adjust order”.
- [x] Modal centered with clean backdrop; required note unchanged.
- [x] Apply / reset behavior unchanged.

---

## Card 5.3 — Manual order final polish

**Status:** **Complete** (2026-05-27)  
**Goal:** Compact gutter controls; remove operator-facing shadow-mode copy.

### Shipped

- Compact left-gutter arrow pill (↑/↓); “Adjust” hint on row hover only; tooltip “Adjust order”.
- Removed shadow-mode modal copy.
- Row height aligned with standard queue rows (`align-items: center`).

---

## Card 5.4 — Manual adjustment activity stream

**Status:** **Complete** (2026-05-27)  
**Goal:** Emit workflow_events on create/update/release (not on queue refresh).

### Shipped

| Area | Path |
|------|------|
| Emitter | `emitPlacementManualOrderActivity.ts` |
| Hook | `placementOverrideMutations.ts` — upsert pin + manual reset |
| Timeline labels | `opportunityActivityTimelineFormat.ts`, `activitySignals.ts` |

### Event types

- `opportunity_waitlist_manual_adjustment_created`
- `opportunity_waitlist_manual_adjustment_updated`
- `opportunity_waitlist_manual_adjustment_released`

Payload includes: `opportunity_id`, `placement_candidate_id`, `placement_override_id`, `program_room_cohort_key`, `cohort_label`, `child_display_name`, `action`, `direction`, `pin_ordinal`, `reason`, `actor_user_id`, `summary`.

### Acceptance criteria

- [x] Create / update / reset each emit one activity event on opportunity.
- [x] Human summary lines for timeline + BOS-ready structured metadata.
- [x] No events on queue refresh / re-eval.

---

## Card 6 — Forecasting hooks

**Status:** **Complete** (2026-05-27)  
**Goal:** Extensibility for predicted openings — **no capacity engine**.

### Shipped

| Area | Path |
|------|------|
| Fact contract | `placementForecastFactContract.ts` — optional forecast fact keys + `placement_forecast_v1` metadata shape |
| Provider hook | `placementForecastFactsProvider.ts` — resolve metadata → fact bag + UI hints |
| Evaluator attach | `buildPlacementCandidateFacts` merges forecast facts (`unknown` when absent) |
| Queue preview | `applyPlacementV2ToOpportunityQueueRows` — `forecast_hints` on candidate preview |
| Row projection | `placementWaitlistCandidateRowProjection.ts` — `forecast_hints` on `_placement_waitlist_row` |
| UI | `QueueRowPlacementCandidateMetaChips` — one subtle chip when hint present |
| Fixtures | `placementForecastFixtures.ts` — test/demo metadata samples |

### Forecast fact keys (informational by default)

- `expected_openings_count`, `expected_transition_count`, `projected_opening_window`
- `projected_capacity_pressure`, `sibling_alignment_window`, `estimated_wait_window_days`
- Architecture-reserved: `forecast_earliest_start_date`, `forecast_confidence`, `forecast_source`, `accepted_not_started`, `temporary_hold_until`

Metadata path: **`placement_candidates.metadata.placement_forecast_v1`** (candidate wins over opportunity metadata).

### Doctrine (unchanged)

- **No capacity engine**, no recurring forecast job, no auto-promotion, no billing/payment logic.
- Forecast facts do **not** appear in default profile tie-breakers — **no ordering impact**.
- Waitlist rank remains runtime-derived; `shadow_mode` stays on for pilot.

### Acceptance criteria

- [x] Schema/docs for forecast fields (metadata contract, no DDL).  
- [x] Evaluator accepts forecast facts without error; unknown when absent.  
- [x] Tests: present / unknown / absent; sort tuple unchanged with forecast.  
- [x] UI hint only when forecast metadata present.  
- [x] Explicit **not included**: graduation pipeline, ratio solver, schedule integration, seat assignment.

### Not shipped (future)

- Capacity service integration, forecast refresh jobs, drawer read-only panel, BOS reasoning consumption (payload-ready via `workflow_events`-free fact bag + row hints).

---

## Card 7 — Operational polish + closeout

**Status:** **Complete** (2026-05-27)  
**Goal:** Polish, document, and close Phase 2 **without new major functionality**. Pilot-ready with checklist + QA script safety defaults.

**Scope revision:** Original Card 7 included waitlist mutator + workflow snapshot events — **deferred** to a future sprint. This card is docs/settings/QA only.

### Shipped

| Area | Detail |
|------|--------|
| **Settings visibility** | `/adminV2/settings/placement-priority` — queue engine (v1/v2), shadow mode, profile preset/revision summary; `engine_version` preserved on save |
| **Pilot playbook** | [waitlist_orchestration_phase2_pilot_playbook.md](waitlist_orchestration_phase2_pilot_playbook.md) — checklist, config, QA commands, gaps |
| **QA script safety** | `qaWaitlistPlacementV2Gate` — read-only by default (`APPLY_V2_CONFIG=1`, `RUN_BACKFILL=1` to mutate); headers on all four scripts; npm aliases `qa:waitlist:*` |
| **Docs closeout** | Architecture, CRM, workspace system docs updated; sprint status closed |

### Pilot readiness checklist

See full checklist in [pilot playbook](waitlist_orchestration_phase2_pilot_playbook.md). Summary:

- [x] Migration applied (Card 1 / Gate 1A)
- [x] Backfill script + dry-run path documented
- [x] V2 config path documented (settings UI + `PLACEMENT_PRIORITY_DEMO_LAYER_V2`)
- [x] `shadow_mode: true` default for pilot documented
- [x] Waitlist route + candidate-row grouping verified (QA gates)
- [x] Manual order + activity timeline shipped (Card 5)
- [x] Forecast hint path documented (Card 6; optional metadata)
- [x] V1 fallback documented + tested
- [x] Known limitations + future phases captured

### Deferred (future sprint — not Card 7)

- Replace **`add_to_waitlist_placeholder`** with real mutator
- `placement_priority_snapshot_changed` workflow packet
- Growth interpreter shim spike
- Per-program `priority_rule_order` (if not delivered earlier)
- Live pilot (`shadow_mode: false`) ops sign-off
- Global / persisted cohort ordinal

### Acceptance criteria

- [x] Settings or docs expose `engine_version`, `shadow_mode`, profile id/revision
- [x] Pilot checklist published
- [x] QA scripts: clear env vars, safe defaults, concise output
- [x] Active docs updated (cards, architecture, CRM, workspace)
- [x] Remaining gaps documented
- [x] Targeted tests + QA gates run (see playbook)

---

## Cross-card doctrine checklist

Use on every PR:

- [ ] Org-scoped reads/writes (`org_id`).  
- [ ] No placement logic in `resolveOpportunityQueueFromDefinition`.  
- [ ] No lifecycle decisions from queue JSON.  
- [ ] Childcare/vertical semantics in preset + adapters only.  
- [ ] Explainability preserved (policy + effective + override).  
- [ ] Active docs updated in same change when behavior changes.

---

## Suggested commit / PR grouping

| PR | Cards |
|----|-------|
| Docs only | 0 |
| Schema + backfill | 1 |
| Evaluator + tests | 2 |
| QueueService + API | 3 |
| UI + entity GET | 4 |
| Overrides | 5 |
| Forecast fields | 6 |
| Mutator + polish | 7 (closeout only — mutator deferred) |

---

## References

- [Phase 2 audit](waitlist_orchestration_phase2_audit.md)  
- [Phase 2 architecture](waitlist_orchestration_phase2_architecture.md)  
- [Phase 2 pilot playbook](waitlist_orchestration_phase2_pilot_playbook.md)  
- [Priority Placement V1](priority_placement_orchestration_may_2026.md)

---

## Remaining decisions before Card 2

Card 1 locked schema shape. **Resolve at Card 2 kickoff:**

| Topic | Options | Notes |
|-------|---------|-------|
| **`program_room_cohort_key` normalization** | Backfill helper: copy `metadata.program_room_group` vs slugify + site prefix | Card 2 fact adapter should document mapping |
| **Backfill timing** | Card 2 prep script vs pilot-only manual seed | Uses `placement_candidates.seed_key` |
| **Admin read API** | `GET /api/admin/opportunities/:id/placement-candidates` | Needed for drawer (Card 4) — can land Card 2 |
| **Link group default** | Auto `independent` per opportunity vs explicit create | Evaluator treats missing group as independent |
| **Preset id** | `childcare_enrollment_waitlist_v2` vs bump v1 revision | Card 2 evaluator preset |
| **Product sign-off** | Formal pilot approval | Card 0 optional checkbox |

---

*End of implementation roadmap.*
