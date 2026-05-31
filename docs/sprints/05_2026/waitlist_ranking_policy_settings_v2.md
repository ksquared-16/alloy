# Waitlist Ranking Policy settings V2

**Status:** Cards 1–10 complete (2026-05-31)  
**Depends on:** [Waitlist ranking validation + position controls](waitlist_ranking_validation_position_controls.md), [Priority placement orchestration](priority_placement_orchestration_may_2026.md), [Card 0.5 priority fact audit](waitlist_priority_fact_truth_child_scope.md) (fact audit in chat / sprint notes)

---

## Why the page was reframed

`/adminV2/settings/placement-priority` previously exposed engine versions, profile IDs, shadow mode, and evaluation caps as primary controls. Operators need to configure **which families receive priority** and **in what order** before testing rankings in the workspace — not metadata field names.

The page is now titled **Waitlist Ranking Policy** and speaks in **Priority Factors** (preset tiers) while persisting the same `placement_priority_v1` metadata shape.

---

## Config keys reused (no new metadata root)

| Operator concept | Metadata key | Notes |
|------------------|--------------|-------|
| Enable policy | `enabled` | Master toggle |
| Factor order | `priority_rule_order` | Full bucket permutation; fallback last |
| Factor on/off | `priority_rule_enabled_keys` | Subset of order; fallback always on |
| Preview vs live order | `shadow_mode` | UI: Preview ranking only / Order waitlist by ranking policy |
| Lanes | `queue_keys_enabled` | `["waitlisted"]` or `["waitlisted","ready_to_enroll"]` |
| Row badge | `display.show_bucket_chip` | Show priority badge on waitlist rows |
| List hint | `display.show_sort_hint` | Show explanation above waitlist |
| Profile / engine / cap | `profile_id`, `engine_version`, `evaluation_cap` | Advanced Technical Details only |

Save path unchanged: **`PATCH /api/admin/work-units/[id]`** with deep-merge + existing Zod/registry validation.

---

## Factor → bucket mapping (MVP)

| Operator label | Backend bucket key |
|----------------|-------------------|
| Employee families | `tier_staff_community` |
| Siblings currently enrolled at this location | `tier_sibling_enrolled` |
| Siblings enrolled at another location | `tier_sister_center` |
| General waitlist | `tier_general_waitlist` |

**Advanced note:** `tier_staff_community` still matches employee, staff, and community priority flags in the childcare preset. The MVP UI labels this bucket “Employee families” only; splitting buckets is a future preset change, not a settings-schema change.

Registry module: `web/lib/orchestration/placement/waitlistRankingPolicyFactors.ts`.

---

## What is configurable now

- Priority factor **order** and **enable/disable** (non-fallback factors)
- Ranking mode (preview vs live ordering)
- Which queue lanes receive the policy
- Display flags for badge and list hint
- Policy summary (read-only, derived from form state)

---

## What is deferred

- Configurable tie breakers (`wait_since`, `desired_start_date` remain preset-hardcoded)
- Referral / Legacy family factors (no facts or buckets yet)
- Per-predicate enable inside `tier_staff_community` (staff/community vs employee)
- Generic rules engine / JSON predicate builder
- Department-layer settings UI
- `display.show_runtime_position` toggle (positions always shown when computed)

---

## Why we are not building a generic rules engine yet

Card 0.5 audit: the **evaluator is already generic** (`evaluatePlacementPriority` + `FactBag`). Product policy is **tier/bucket-based** with admin control over **tier order and enablement** — sufficient for childcare waitlist pilot. A full rules engine would duplicate preset machinery without giving operators safe authoring; see Phase 2 backlog in `priority_placement_orchestration_may_2026.md`.

**Recommendation implemented:** Option B — expose ranking factors mapped to existing tiers.

---

## Files changed

| Area | Path |
|------|------|
| Settings page | `web/components/adminV2/settings/PlacementPrioritySettingsClient.tsx` |
| Factor editor | `web/components/adminV2/settings/PriorityRuleOrderEditor.tsx` |
| Factor registry | `web/lib/orchestration/placement/waitlistRankingPolicyFactors.ts` |
| Settings index / breadcrumb | `web/app/adminV2/settings/page.tsx`, `SettingsHierarchyBreadcrumb.tsx` |
| Tests | `web/tests/adminV2/*`, `web/tests/orchestration/placement/waitlistRankingPolicyFactors.test.ts` |

---

## Validation

```bash
cd web && npm run test -- tests/adminV2 tests/orchestration/placement tests/ui-v2
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:priority-facts
ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npm run qa:waitlist:ranking
```

Manual: open `/adminV2/settings/placement-priority`, reorder/disable factors, save, reopen, confirm QA scripts reflect config; toggle ranking mode and confirm `shadow_mode` in Advanced metadata preview.

---

## Follow-up — Work unit + factor source fixes (Cards A–E)

**Root causes**

1. Work unit list was unfiltered — first API row (often Compliance inbox) became the default selection.
2. `defaultPriorityRuleOrderForProfileId` only recognized `childcare_enrollment_waitlist_v1`, so V2 profiles had empty factor state and `hasRuleEditor === false`.
3. Settings UI only applied explicit `priority_rule_enabled_keys` from metadata; when omitted, state could be empty even though runtime uses `effectivePriorityRuleEnabledSet` (all tiers active).
4. Factor source fields were not surfaced in the UI.

**Fixes**

| Card | Change |
|------|--------|
| A | `waitlistRankingPolicyWorkUnits.ts` — filter eligible WUs; default to `enrollment_pipeline`; selector at top labeled **Policy applies to** |
| B | V2 profile id in `defaultPriorityRuleOrderForProfileId`; `resolveEffectivePriorityRuleConfig` for effective defaults |
| C | `sourceLabel` / `sourceKey` on each factor; rendered in `PriorityRuleOrderEditor` |
| D | Active policy banner near top (work unit, on/off, ranking mode) |
| E | Advanced retains technical fields; work unit key + labeled metadata preview |

**New modules:** `waitlistRankingPolicyWorkUnits.ts`, `resolveEffectivePriorityRuleConfig` in `waitlistRankingPolicyFactors.ts`.
