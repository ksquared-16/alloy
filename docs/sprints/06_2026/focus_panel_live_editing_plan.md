# Focus Panel Live Editing — Plan & V1 Record

**Status:** Household V1 implemented (June 2026); Children V2 planned.
**Doctrine:** [`operational-depth-doctrine.md`](../../platform/operator/operational-depth-doctrine.md) (Edit is a capability of Focus) ·
[`operational-context-boundary.md`](../../platform/operator/operational-context-boundary.md) (truth is read-only) ·
[`focus-panel-edit-information-doctrine.md`](../../platform/operator/focus-panel-edit-information-doctrine.md).

> **No new mutation path, no write on `OperationalContext`.** Editing reuses the
> existing person/customer-member PATCH helpers + routes (which own permissions and
> validation) and the existing record-patch refresh events. The card receives a
> **separate injected save adapter** (the same pattern as `coordination`).

---

## 1. The save-adapter seam

`OperationalContext` is read-only by doctrine. Mutation is therefore a **separate
injected capability**, not a method on the context:

```
OpportunityFocusPanelModeGrid (owns VM + canMutate + opportunity id + truth)
  → buildOpportunityFocusPanelMutation(...) : FocusPanelMutation
     → FocusPanelCardRenderer threads `mutation` to truth cards (beside `coordination`)
        → HouseholdCard Edit depth → mutation.savePersonContact(personId, patch)
           → patchLinkedPersonFromOpportunityDrawer → PATCH /api/admin/persons/[id]
              → on 200: merge saved person into truth → dispatch record-patch events
```

- `web/lib/adminV2/runtime/focusPanel/focusPanelMutation.ts` — adapter type + builder + `mergePersonContactIntoFocusPanelTruth`.
- The adapter is provided only on the opportunity Focus Panel; `canEdit` mirrors `capabilities.canMutate`.

---

## 2. Household V1 path (implemented)

| Concern | Resolution |
|---------|-----------|
| **Fields** | Primary person `first_name`, `last_name`, `email`, `phone` only. |
| **Client helper** | `patchLinkedPersonFromOpportunityDrawer({ personId, body })` — verified **pure** (plain fetch wrapper; no drawer/React/VM dependency). |
| **Route** | `PATCH /api/admin/persons/[id]`. |
| **Validation** | Route: status validation (n/a here) + `enforcePersonCompletionOnPatch({ phase: "save" })` → 400 + `completion_requirements`. |
| **Permissions** | Route is **admin-only** (403 otherwise). Card gates the affordance on `canMutate`; route is final authority. |
| **Audit/event** | Route writes **no audit row and fires no event** today — see §5. |
| **Seed** | `seedHouseholdContactValues(truth)`: prefers explicit `first_name`/`last_name`, else splits the combined `person.primary_contact_name`; email/phone from `person.primary_*`. Patch sends **changed fields only**, so a best-effort name split is never persisted unless edited. |
| **Save model** | Local draft + dirty; Save disabled when clean; loading ("Saving…"); success ("Saved", baseline locked); error (inline, draft retained); Cancel reverts draft. **Confirmed save only** (no optimistic). |
| **Depth** | Edit is the deepest state of Focus (`edit` level); affordance appears in the expanded Focus Card, never on the collapsed summary. |

Files: `cards/HouseholdContactEdit.tsx`, `household/householdContactEditState.ts`,
`cards/HouseholdCard.tsx`, `FocusPanelCardRenderer.tsx`, `OpportunityFocusPanelModeGrid.tsx`.

---

## 3. Context recomposition model (how the card reflects the save)

The card reflects saved truth **without a manual refresh and without writing the
context** — the read-only context is *recomposed* from refreshed truth:

```
PATCH 200
  → mergePersonContactIntoFocusPanelTruth(truth, savedPerson)   // updates the keys the
        Household evidence reads: person.primary_contact_name / _email / _phone,
        _identity.primary_person.label, + generic opportunity hydration
  → dispatchOpportunityDrawerRecordPatch(opportunityId, merged)
  → useOpportunityDrawerVmPayload onRecordPatch → patchDisplayRecord → setDisplayVm
  → OpportunityFocusPanelModeBody → OpportunityFocusPanelModeGrid props update
  → buildOperationalContext useMemo recomputes → context.truth carries saved values
  → HouseholdCard re-derives buildHouseholdCardEvidence → shows the new value
```

> **Verified gate:** the host *does* receive recomposed truth — the record-patch
> listener (`useOpportunityDrawerVmPayload`) merges into `displayVm`, which flows to
> the Focus Panel host. (Tested via `mergePersonContactIntoFocusPanelTruth` →
> `buildHouseholdCardEvidence` reflecting saved values.)
>
> **Integration nuance:** the generic `applyPersonPatchToOpportunityHydration` updates
> *different* keys than the Household evidence reads, so the merge also sets the
> namespaced `person.primary_*` keys explicitly. Without that, the card would not
> reflect the save.

---

## 4. Children V2 path (planned — not implemented)

| Concern | Plan |
|---------|------|
| **Fields** | Program (`desired_program_type` → route enriches `desired_program_category_id`), Room (`program_room_cohort_key`), Schedule (`desired_schedule_type`), Desired Start (`desired_start_date`) — native columns on `opportunity_customer_members`. |
| **Client helper** | `patchOpportunityCustomerMemberFromInquiryChild(ocmId, patch)`. |
| **Route** | `PATCH /api/admin/opportunity-customer-members/[id]`. |
| **Validation** | `validateInquiryChildPlacementPatch` — site required before program/room; location→program→room cascade; program-category FK enriched server-side. |
| **Permissions** | **Admin or ops** (`requireAdminOrOps`). |
| **Audit/event** | No audit row; **placement-candidate sync fires post-PATCH**; lifecycle event only on `outcome_status_key` change (not these fields). |
| **⚠️ Feature flag** | Gated by **`childcare_operational_enrollment_v1` (OFF by default)** — client visibility gate. Children operational edit UI must sit behind it. |
| **Why later** | Flag-gated + placement cascade + ops/admin role nuance. Household contact (admin-only, no flag) is the safe first slice. |

Children editing reuses the **same adapter seam** (extend `FocusPanelMutation` with
`saveChildEnrollment(ocmId, patch)`); no new path. **Subject Change** (recompose the
panel to a Child Focus Panel) is a separate, heavier runtime primitive — out of scope.

---

## 5. Audit decision (this sprint)

The person/customer-member/OCM field-PATCH routes **do not write audit rows today**.
This sprint **preserves that parity**: reusing the routes neither adds nor bypasses
audit (there is nothing to bypass). If audited field history becomes a requirement,
it is a **route-level backend change**, tracked separately — not card work.

---

## 6. Future enhancement — optimistic save

V1 is confirmed-save (await 200, then refresh). The existing
`drawerOperatingSaveCoordinator` provides optimistic apply + rollback and dirty
"save-all" across sections. A future pass can register the Household edit as a
coordinator section to get optimistic rendering + rollback parity with the drawer,
and to participate in a single "Save all" across multiple in-flight card edits.
Deferred to keep V1 minimal and safe.

---

## 7. Tests

- `focusPanelMutation.test.ts` — adapter success (returns ok + dispatches merged record-patch), failure (returns error, dispatches nothing), empty-person guard, `canEdit` mirrors `canMutate`, `mergePersonContactIntoFocusPanelTruth` key updates + immutability.
- `householdContactEditState.test.ts` — seed (combined-name split, explicit-mirror preference, null personId), dirty, changed-only patch (empty→null), and **card-reflects-refreshed-truth** (merge → `buildHouseholdCardEvidence` shows saved values).
- Regression: `linkedRecordFieldEditing.test.ts`, `customerMembersPatchRoute.test.ts` (reused helpers/routes unmodified — pass).
