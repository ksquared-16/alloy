# Person Layout Runtime + Completion Guardrails Foundation Reconciliation

Mini sprint (May 2026). Reconciles **Sprint A** (layout runtime v1) with **Sprint B** (**Completion Guardrails Foundation** — framework + bootstrap rules, not admin-configured required fields).

## What matched (no change needed)

| Area | Finding |
|------|---------|
| Completion rule ownership | Sprint B evaluators are entity/field-key based — not bound to drawer JSX |
| Operating module path | `PersonDrawerOperatingSections` still mounts `PersonDrawer*Summary`, which embed BOS panels |
| Draft save blocking | `completionBlocksSave()` only rejects on `hard_block`; parent contact missing is `soft_warning` on save |
| Name requirements | First/last name `always_required` → `hard_block` on save and preview |
| Opportunity transitions | `enforceOpportunityCompletionOnStatusTransition` returns structured `RequirementValidationResult` |
| Layout variant keys | Migration seeds `person_child_operating_v1`, `person_parent_operating_v1`, `person_generic_v1` |

## Adjustments made

| Issue | Fix |
|-------|-----|
| Completion did not know layout variant keys | Added `personDrawerLayoutCompletionBridge.ts` — maps variant → surface + `layout_variant_key` on evaluation context |
| BOS panels used hardcoded surfaces | `evaluatePersonDrawerCompletionPreview()`; panels receive `layoutVariantKey` from operating sections |
| Household preview missed drawer data | `extractRelatedFromRecord` now reads `_household_adult_links`, `_household_context`, `_customer_persons` (not only `_household_members`) |
| Variant key not on violations | `layout_variant_key` on `CompletionEvaluationContext` and violation context |

## Runtime UI verification

| Drawer | Completion summary location | Layout variant wired |
|--------|----------------------------|----------------------|
| Child operating | `PersonDrawerChildSummaryBosPanel` → `MissingRequirementsSummary` | Yes — `data-person-drawer-completion-layout-variant` |
| Parent operating | `PersonDrawerParentSummaryBosPanel` | Yes |
| Generic person | No BOS column (config overview only) | Documented gap — see below |

Layout runtime **does not hide** completion panels: BOS panels live inside summary components rendered by `person_operating_sections`.

## Client / server agreement

| Check | Client (preview) | Server (PATCH) | Aligned? |
|-------|------------------|----------------|----------|
| Parent missing contact | `soft_warning` / recommendation | `soft_warning` on save — does not block | Yes |
| Missing first/last name | `hard_block` | `hard_block` on save | Yes |
| Child start date before active | N/A on preview unless status context | `hard_block` on `status_change` | Yes (phase-aware) |
| Household primary contact | `soft_warning` on preview | `hard_block` on save when guardians exist | Yes (phase-aware by design) |
| Opportunity tour_scheduled | N/A (no opp preview UI) | Structured `completion_requirements` on 400 | Server-only v1 |

**Remaining gap:** failed person PATCH responses include `completion_requirements` JSON but drawer save UI only surfaces `error` string (`patchPersonDrawerFields`). Non-blocking for reconciliation — preview covers operator visibility.

## Draft save behavior (confirmed)

- Parent missing phone/email → **warns, does not block** ordinary draft save
- First/last name empty → **hard-block** on save
- Child enrollment fields → **hard-block** only on status transition to active/future_start/enrolled (not ordinary field draft save unless status in body)

## Config migration path (Sprint B → config)

Current: bootstrap rules in `web/lib/completion/*.ts`.

Future hook (defined, not wired):

1. `CompletionEvaluationContext.layout_variant_key` — set from Sprint A resolver
2. `resolveCompletionSurfaceForLayoutVariant()` — stable surface naming per variant
3. Next: `field_placements_v1.requirement` presets on person layout rows (same pattern as opportunity workflow v1)
4. Then: retire code bootstrap slices per field as placements seed

See `docs/sprints/archive/05_2026/required_fields_completion_guardrails_policy.md` Phase 3.

## Known gaps (deferred)

- Generic person drawer has no Assist/BOS column
- BOS CTA does not consume `toBosCompletionRequirementPayload` yet
- Completion rules do not read `person_layout_variants` from DB — profile + code rules only
- No Supabase migration needed for this reconciliation

## Tests

- `web/tests/admin/person/personLayoutCompletionReconciliation.test.ts`
- Existing: `web/tests/completion/completionRequirements.test.ts`

## Next step

Required Fields sprint: wire `field_placements_v1` requirement policies to person layout variants; optionally surface PATCH `completion_requirements` in drawer save bar.
