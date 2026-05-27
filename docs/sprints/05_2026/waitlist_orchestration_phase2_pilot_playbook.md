# Waitlist Orchestration Phase 2 — Pilot Playbook

**Status:** Phase 2 implementation **complete** (Cards 0–7). Pilot-ready with `shadow_mode: true`.  
**Date:** 2026-05-27  
**Cards:** [waitlist_orchestration_phase2_cards.md](waitlist_orchestration_phase2_cards.md)  
**Architecture:** [waitlist_orchestration_phase2_architecture.md](waitlist_orchestration_phase2_architecture.md)

---

## Pilot readiness checklist

Use before enabling V2 on a production-adjacent org:

| Step | Check | How to verify |
|------|-------|---------------|
| 1 | **Migration applied** | `placement_candidates`, `placement_link_groups`, `placement_link_group_members`, `placement_overrides` exist; reference CSVs refreshed (Gate 1A). |
| 2 | **Candidates backfilled** | `ORG_ID=<uuid> DRY_RUN=1 npm run dev:backfill:placement-candidates` then apply without `DRY_RUN`. Active count > 0 for waitlisted opps. |
| 3 | **V2 enabled on work unit** | `work_units.metadata.placement_priority_v1.engine_version === "v2"` and registered `profile_id` (e.g. `childcare_enrollment_waitlist_v2`). |
| 4 | **Shadow mode on** | `shadow_mode: true` — policy chips + diagnostics; SQL list order preserved; position numbers hidden. |
| 5 | **Waitlist route verified** | Open Admin V2 workspace → waitlisted lane; rows show child × cohort (not merged family row). |
| 6 | **Candidate rows grouped by cohort** | Section headers use `program_room_cohort_key`; siblings in separate sections when cohorts differ. |
| 7 | **Manual order adjustment tested** | Inline ↑/↓ within cohort; required note; “Manually adjusted” chip; reset releases pin. |
| 8 | **Activity timeline tested** | Create/update/release emits `opportunity_waitlist_manual_adjustment_*` on opportunity timeline. |
| 9 | **Forecast hint tested** (if metadata exists) | Optional `placement_candidates.metadata.placement_forecast_v1` → subtle hint chip only; **no sort change**. |
| 10 | **V1 fallback tested** | Disable v2 or remove candidates → opportunity-row V1 strip; no queue errors. |
| 11 | **Known limitations reviewed** | See [Remaining gaps](#remaining-gaps--future-phases) below. |

**Ops sign-off (future):** flip `shadow_mode: false` only after checklist + stakeholder review.

---

## Current pilot config

Stored on work unit as **`metadata.placement_priority_v1`**:

```json
{
  "version": 1,
  "enabled": true,
  "engine_version": "v2",
  "profile_id": "childcare_enrollment_waitlist_v2",
  "profile_revision": "<from preset>",
  "queue_keys_enabled": ["waitlisted"],
  "shadow_mode": true,
  "evaluation_cap": 200,
  "display": { "show_bucket_chip": true, "show_sort_hint": true }
}
```

Reference layer: `web/lib/orchestration/placement/placementPriorityDemoPatch.ts` → `PLACEMENT_PRIORITY_DEMO_LAYER_V2`.

### Admin settings surface

**`/adminV2/settings/placement-priority`** — per work unit:

- Enable / disable waitlist priority
- **Queue engine** — V1 (opportunity rows) vs V2 (candidate rows)
- **Profile preset** + revision (read-only in effective-config summary)
- **Preview mode (shadow)** — maps to `shadow_mode`
- Evaluation cap, rule order, display toggles

Saving PATCHes `work_units.metadata.placement_priority_v1` (preserves `engine_version` when V2 selected).

### Manual config (no UI)

```sql
-- Example: merge V2 layer onto enrollment pipeline work unit (adjust ids)
UPDATE work_units
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{placement_priority_v1}',
  '<PLACEMENT_PRIORITY_DEMO_LAYER_V2 json>'::jsonb,
  true
)
WHERE org_id = '<org_id>' AND key = 'enrollment_pipeline';
```

Or run QA gate with explicit apply: `APPLY_V2_CONFIG=1 ORG_ID=<uuid> npm run qa:waitlist:v2`.

---

## QA scripts

All run from **`web/`** with `.env.local` / service role configured.

| Script | npm alias | Default behavior | Mutations |
|--------|-----------|------------------|-----------|
| V2 gate | `npm run qa:waitlist:v2` | Dry-run backfill + queue probe | **None** unless `APPLY_V2_CONFIG=1` or `RUN_BACKFILL=1` |
| Override gate | `npm run qa:waitlist:override` | Pin create/update/release + eval | **Yes** — creates overrides; `CLEANUP=1` (default) releases them |
| Render trace | `npm run qa:waitlist:trace` | Trace named child through VM | **Read-only** |
| Backfill | `npm run dev:backfill:placement-candidates` | Requires `ORG_ID` | Writes unless `DRY_RUN=1` |

### Example commands

```bash
cd web

# Read-only V2 verification
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:v2

# One-shot pilot bootstrap (explicit mutations)
ORG_ID=<uuid> APPLY_V2_CONFIG=1 RUN_BACKFILL=1 npm run qa:waitlist:v2

# Manual order QA (pilot route defaults)
npm run qa:waitlist:override

# Trace Hayes family rows (read-only)
npm run qa:waitlist:trace

# Backfill
ORG_ID=<uuid> DRY_RUN=1 npm run dev:backfill:placement-candidates
ORG_ID=<uuid> npm run dev:backfill:placement-candidates
```

### Pilot QA route (Hayes demo)

```
/adminV2/workspace/dept/04958a78-32ca-4091-bcd3-4bbaef3fee4b/work-unit/5ba90557-876d-4450-9c28-36beac6e83be?queue=waitlisted
```

Test candidate: **Mia Hayes** (`2028f5a8-65c4-46f5-9100-12970c80785e`), Pre-K cohort.

---

## Architecture summary (shipped)

| Topic | Phase 2 behavior |
|-------|------------------|
| **Queue row identity** | **Candidate row** — one list row per `placement_candidate` (child × cohort), not one row per opportunity. |
| **Grouping** | Server-side by `program_room_cohort_key`; opportunity/family context on row. |
| **Rank / `#n`** | Runtime-derived on load (`evaluation_cap`, page-local); **not persisted**. |
| **Policy vs effective** | Evaluator always runs; manual pin overrides merge on sort; overrides do not edit preset rules. |
| **V1 fallback** | When v2 off, no candidates, or explicit fallback — legacy `_placement_priority` on opportunity rows. |
| **Forecast (Card 6)** | Optional metadata → fact bag + at most one hint chip; **no ordering impact by default**. |

Correction from Card 0 default: waitlist **operational** queue uses **`candidate_row`** projection; entity GET / drawer may still use **`family_row`**.

---

## Remaining gaps / future phases

**Explicitly out of scope for Phase 2:**

| Gap | Notes |
|-----|-------|
| **Capacity / openings engine** | Card 6 hooks only; no graduation solver, ratio optimization, or auto-promotion. |
| **Classroom transition forecasting** | Metadata contract reserved; no live forecast jobs. |
| **Sibling coordination policy engine** | Link groups stored; strict cross-cohort coordination not enforced in sort. |
| **Accepted-not-started pipeline** | Fact key reserved; no workflow. |
| **Waitlist deposits / payments** | No billing integration. |
| **Full settings UI** | Minimal admin surface only; no org-wide policy studio. |
| **BOS recommendations for placement** | Activity events payload-ready; no agent ranking. |
| **Live pilot (`shadow_mode: false`)** | Requires ops sign-off; reorder within cap when off. |
| **Cross-opportunity strict links** | `strictly_together` within opportunity only. |
| **Waitlist mutator / workflow events** | `add_to_waitlist_placeholder` not replaced; no `placement_priority_snapshot_changed` packet. |
| **Persisted rank / ordinal** | Deferred unless product reopens. |
| **Growth interpreter shim** | Dual-path debt documented; V1 lock on Growth path unchanged. |

### Recommended next sprint

1. **Phase 2.1 — Live pilot:** `shadow_mode: false` on one work unit + ops monitoring.  
2. **Waitlist mutator:** Real admin action to create/activate candidates (replace placeholder).  
3. **Capacity read model:** Read-only openings count feeding forecast facts (still no auto-promotion).  
4. **Settings hardening:** Org-level defaults, audit of config changes.

---

## Validation (Card 7 closeout)

Targeted checks before merge:

```bash
cd web
npm run test -- tests/orchestration/placement/
npm run test -- tests/ui-v2/queuePlacementWaitlistCandidatePresentation.test.ts
npm run test -- tests/api/admin/placement-candidates-manual-position.test.ts
ORG_ID=<pilot> npm run qa:waitlist:v2
npm run qa:waitlist:override
npx tsc --noEmit   # required; document unrelated pre-existing errors if any
```

---

## References

- [Implementation cards](waitlist_orchestration_phase2_cards.md)  
- [Architecture](waitlist_orchestration_phase2_architecture.md)  
- [Priority Placement V1](priority_placement_orchestration_may_2026.md)  
- `docs/product/crm-system.md`, `docs/system/workspace-system.md`
