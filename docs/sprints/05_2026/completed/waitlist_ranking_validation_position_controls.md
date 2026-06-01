# Waitlist ranking validation + position controls

**Status:** Cards 0–5 complete (2026-05-31)  
**Depends on:** [Waitlist priority fact truth](waitlist_priority_fact_truth_child_scope.md), [Priority placement orchestration](priority_placement_orchestration_may_2026.md)

---

## Goal

Finish the waitlist engine using **existing** placement priority configuration: show runtime position on V2 candidate rows, allow direct manual position adjustment, validate configured ranking order, and provide a safe pilot toggle for live ordering.

**Non-goals:** new priority config system, persisted rank table, billing, scheduling, capacity, classroom assignment.

---

## Card 0 — Configuration map (reused)

| Layer | Location |
|-------|----------|
| Work-unit config | `work_units.metadata.placement_priority_v1` |
| Department merge (optional) | `departments.metadata.placement_priority_v1` — work unit wins |
| Preset rules | Code registry — `placementPresetRegistry.ts` + `childcare_enrollment_waitlist_v2` |
| Manual override | `placement_overrides` (`override_kind: pin`, `payload.pin_ordinal`) |
| Admin UI | `/adminV2/settings/placement-priority` |

Effective resolution: `mergePlacementPriorityLayers` → `resolvePlacementQueueConfig` → `applyPlacementPriorityEffectiveProfile`.

Default tier order (configurable via `priority_rule_order`):

1. `tier_staff_community` (employee / staff / community)
2. `tier_sibling_enrolled`
3. `tier_sister_center`
4. `tier_general_waitlist` (fallback, always last)

---

## Card 1 — Runtime position display

**Behavior**

- V2 candidate rows show **`Preview position n/N`** when `shadow_mode: true`, **`Position n/N`** when live.
- Assigned by `assignWaitlistCandidateRuntimePositions` after queue sort — **not persisted**.
- Scoped to **org-level category section** (Infant, Toddler, …) among rows in the current filtered/loaded set (location filter narrows rows; denominator is section total in that set).
- Tooltip: *Position is calculated from the current priority rules and filters. It is not a permanent stored rank.*

**Shadow vs live rank source**

| Mode | List order | Position rank |
|------|------------|---------------|
| Shadow | Unchanged (or non-priority sort) | From priority `sort_tuple` within section |
| Live | Priority sort applied | Matches visible order within section |

**Key files:** `waitlistCandidateRuntimePosition.ts`, `candidateGrainWaitlistQueue.ts`, work-unit page client re-assign, `QueueRowPlacementCandidateMetaChips`.

---

## Card 2 — Manual adjustment by exact position

**UX:** `Adjust position` → modal with current `n/N`, desired select `1…N`, required reason, **Apply**; shortcuts **Move to top**, **Clear adjustment**.

**Behavior:** Reuses `placement_overrides` + `upsertPlacementPinOverride` / `releaseManualPositionOverrides`. Stores **pin intent only** (`pin_ordinal`); displayed rank remains derived after refresh.

**Activity payload** (`emitPlacementManualOrderActivity`): `from_position`, `to_position`, `position_total`, `section_key`, `site_id`, reason, actor, candidate.

**API:** `POST /api/admin/placement-candidates/[id]/manual-position`

---

## Card 3 — Config-aware ranking validation

```bash
cd web && ORG_ID=<uuid> npm run qa:waitlist:ranking
```

Validates:

- Employee priority from `persons.is_employee`
- Same-site / sister-site sibling facts
- Manual pin wins effective sort
- `wait_since` tie-breaker
- Shadow calculates priority without reorder; live reorders
- Expected order derived from **resolved admin config**, not hardcoded assumptions

Output includes `configured_priority_rule_order`, `expected_priority_order`, `actual_priority_order`, `visible_order_matches_priority`, `ok`.

---

## Card 4 — Safe live ordering toggle

```bash
cd web && ORG_ID=<uuid> npm run qa:waitlist:shadow-mode -- false
cd web && ORG_ID=<uuid> npm run qa:waitlist:shadow-mode -- true
```

- Patches **`shadow_mode`** on pilot work unit only (`enrollment_pipeline` by default).
- Does **not** globally enable live ordering.
- Lane cue: **Priority preview** (shadow) · **Ordered by priority** (live).

---

## Card 5 — Validation commands

```bash
cd web && ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:demo
cd web && ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:v2
cd web && ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:priority-facts
cd web && ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:ranking
cd web && ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:shadow-mode -- false
cd web && ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:shadow-mode -- true
cd web && npm run test -- tests/orchestration/placement tests/ui-v2 tests/admin
cd web && npx tsc --noEmit
```

---

## Deferred — Phase 2 config hardening

- Arbitrary rule / predicate authoring UI
- Per-program distinct tier lists
- `flag_sibling_waitlisted` preset tier
- Department-level placement settings UI
- `missing_fact_behavior` in admin UI
- Global org-wide authoritative rank (cross-page)
- Site-scoped program/classroom/rate catalog
- Persisted rank table (explicit non-goal)

See also `priority_placement_orchestration_may_2026.md` § Phase 2.
