# Action Intake Spec Resolver — P0

**Path:** `docs/sprints/06_2026/action_intake_spec_resolver_p0.md`  
**Date:** 2026-05-31  
**Status:** Implemented (structured create_lead only; no BOS)

## Goal

When an operator clicks **Create Lead**, resolve required information from Lifecycle Builder and drive a dynamic intake modal before calling the existing execute path.

## Delivered

| Piece | Location |
|-------|----------|
| Types | `web/lib/lifecycle/actionIntakeSpecTypes.ts` |
| Payload mapping + platform minimums | `web/lib/lifecycle/createLeadIntakeFieldMap.ts` |
| Resolver + validation | `web/lib/lifecycle/resolveActionIntakeSpec.ts` |
| API | `GET /api/admin/lifecycle/action-intake-spec` |
| Client fetch | `web/lib/lifecycle/fetchActionIntakeSpec.ts` |
| Dynamic modal + preview | `web/components/admin/opportunity/actions/CreateLeadModal.tsx` |
| Workspace wiring | dept + work-unit pages pass `departmentId` |
| Tests | `web/tests/lifecycle/actionIntakeSpecResolver.test.ts` |

## Resolution rules (create_lead V1)

1. **Source:** `effectiveFieldRulesForStage("lead", department.metadata)` merged with org field palette labels (`mergeLifecycleFieldPaletteForStage`).
2. **Entities:** Person and Child only (no opportunity/customer capture at create).
3. **Policy:** Child rules in department `required_rule_ids` are **recommended** at capture (not blocking) — aligns with lifecycle information matrix.
4. **Platform floor:** Person first/last name always required; **at least one** of phone or email (`constraints`).
5. **Output tiers:** `required`, `recommended`, `optional` (palette fields not in dept rules).

## Operator flow

1. Open Create Lead → fetch intake spec for `department_id` + `stage_key=lead`.
2. **Capture** step — fields grouped by entity; missing required messages block **Review lead**.
3. **Preview** step — summary of entered values.
4. **Confirm & create lead** → `mapActionIntakeValuesToCreateLeadPayload` → `executeCreateLeadFromModal` → `POST /api/admin/actions/execute` (`create_lead`).

## BOS (later)

Same `ActionIntakeSpec` JSON from `GET …/action-intake-spec` — BOS will explain fields, accept paste, propose values, and return to preview/confirm without a parallel rule set.

## Follow-ups

- Server-side execute validation against spec (optional hardening).
- Create child on execute when child_* payload keys present (`submitAddInquiryChildFromDrawer` pattern).
- Pass `process_id` from workspace when lifecycle context is available.
- Extend resolver to additional `action_key` values.
