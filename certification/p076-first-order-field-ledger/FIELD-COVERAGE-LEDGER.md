# P0-7.6 · A′ FIRST-ORDER FIELD COVERAGE LEDGER

Authoritative before-mutation ledger. No field is implemented without a named canonical owner, and
no field is "derived equivalently" — every row names the owner that already decides the value.

Baseline: `composeFirstOrderWorkUnitProjection` at `604f91076` produces **6** contracted fields.

Columns: `owner` = canonical semantic owner · `inputs` = raw/source inputs · `inA′` = are those
inputs already read by A′ · `+read` = additional read required · `auth` = authorization ·
`cfg` = configuration dependency · `class` = Part-8 classification · `path` = expected
critical-path contribution.

## Legend — Part 8 classification

- **A** `PURE_PROJECTION_FROM_EXISTING_A_PRIME_DATA` — zero new reads.
- **B** `EXISTING_CANONICAL_READ_CAN_BE_SHARED` — an A′ read already resolves the inputs; widen it.
- **C** `ADDITIONAL_CANONICAL_READ_REQUIRED` — explicit budget impact, stated per row.
- **D** `CONTRACT_OWNER_UNRESOLVED` — blocks that field.

---

## business_process — 0/6 in A′

| field | owner | inputs | inA′ | +read | auth | cfg | class | path |
|---|---|---|---|---|---|---|---|---|
| `processName` | `buildOpportunityWorkspaceLifecycleRail` → `process_name` | `departments.metadata` | NO | YES · `work_units→departments` embed, 1 query 1 hop | org member | `business_process` configured | **C** | phase 1, ~1 hop; shorter than `population→children`, expected +0ms |
| `stageCount` | same → `stages.length` | `departments.metadata` | NO | shared with above | org member | same | **C** | shared |
| `currentStageKey` | `opportunities.stage_key` (population row) | population | YES | NO | org member | same | **A** | 0 |
| `currentStageLabel` | rail `stages[].label` matched on `stage_key` | `departments.metadata` + population | partial | shared | org member | same | **C** | shared |
| `stagePosition` | rail `stages` index of `stage_key` | as above | partial | shared | org member | same | **C** | shared |
| `stageEnteredAt` | `opportunities.stage_entered_at` (population row) | population | YES | NO | org member | same | **A** | 0 |

> The canonical answer composer itself calls this builder with `statusDefs: []` and
> `statusKey: null` (`workUnitProvisioningAnswer.ts:2339`), resolving the current marker from the
> record's own stage. A′ follows the same rule, so no status-definition read is required.

## financials — 3/7 in A′ (`availableCents`, `pendingCents`, `heldCents`)

| field | owner | inputs | inA′ | +read | auth | cfg | class | path |
|---|---|---|---|---|---|---|---|---|
| `periodKey` | `resolveBillingPeriod` / `FinancialsCardVM.period` | commercial policy cadence | NO | YES · `commercial_policies` | `financialsRead` | `financials` configured | **C** | phase 1, 1 hop, parallel — expected +0ms |
| `responsibilityCents` | `reconcileRows` (pure) | `charges` ledger rows | NO | YES · `charges` + `payment_allocations` | `financialsRead` | same | **C** | **budget impact stated below** |
| `balanceCents` | `reconcileRows` (pure) | as above | NO | shared | `financialsRead` | same | **C** | shared |
| `paymentsCents` | `reconcileRows` (pure) | as above | NO | shared | `financialsRead` | same | **C** | shared |
| `pastDueCents` | `pastDueFor` (pure) | as above + today | NO | shared | `financialsRead` | same | **C** | shared |

> **Budget impact — the charges ledger.** `reconcileRows`/`pastDueFor` are pure and exported
> (`buildFinancialsCardVM.ts:2020,2082`), so the arithmetic is free. Their input is not.
> `charges` sits at hop 3 of `customer_members → child_enrollment_agreements → charges →
> payment_allocations`. `readAccountPrepaidPosition` ALREADY resolves hops 1–2 and already runs to
> hop 4, and it is the resolver that bounds the measured DAG (ends 375ms). Sharing its agreement
> and member ids makes `charges` an additional hop-3 fan-out rather than a new chain — but it is
> still an addition to the binding branch, so this is the one family whose cost must be MEASURED
> before it is accepted, against the Part-12 >100ms stop rule.

## children — 1/3 in A′ (`childCount`)

| field | owner | inputs | inA′ | +read | auth | cfg | class | path |
|---|---|---|---|---|---|---|---|---|
| `childCount` | `enrichOpportunityRowsWithChildrenForCompactQueue` | `_inquiry_children` | YES | NO | org member | `children` configured | **A** | 0 |
| `insight` | `childrenInsight` → `normalizeFocusPanelChildrenRowsFromTruth` | `_inquiry_children` | YES | NO | org member | same | **A** | 0 |
| `enrollingCount` | `childrenInsight` (rows where `outcome_status_key !== "declined"`) | `_inquiry_children` | YES | NO | org member | same | **A** | 0 |

## household — 0/6 in A′

| field | owner | inputs | inA′ | +read | auth | cfg | class | path |
|---|---|---|---|---|---|---|---|---|
| `label` | `opportunities.name` / `.title` (population row) | population | YES | NO | org member | `household` configured | **A** | 0 |
| `updatedAt` | `opportunities.updated_at` (population row) | population | YES | NO | org member | same | **A** | 0 |
| `primaryContactName` | `enrichOpportunityRowsWithCrmProjection` → `_primary_contact_name` | CRM enrichment | YES | NO | org member | same | **A** | 0 |
| `primaryContactLine` | same → `_primary_contact_line` | CRM enrichment | YES | NO | org member | same | **A** | 0 |
| `locationLabel` | same → `_location_label` | CRM enrichment | YES | NO | org member | same | **A** | 0 |
| `childCount` | children enrichment (shared with the Children card) | `_inquiry_children` | YES | NO | org member | same | **A** | 0 |

> Household's contracted face is `householdInsight(record, title)` →
> `resolveLeadDrawerCommandHeaderMeta`, which is pure over the enriched record. Every input it
> reads is already produced by A′'s CRM enrichment. Emergency-contact and pickup counts are NOT on
> the household face — they belong to health_safety, and are carried there rather than duplicated.

## attendance — 1/2 in A′ — **and the one in A′ is WRONG**

| field | owner | inputs | inA′ | +read | auth | cfg | class | path |
|---|---|---|---|---|---|---|---|---|
| `state` | `AttendanceCardVM.state` | attendance fold | YES | NO | org member | `attendance` configured | **A** | 0 |
| `date` | `AttendanceCardVM.date` | attendance fold | YES | NO | org member | same | **A** | 0 |
| `expectedRoomLabel` | `AttendanceCardVM.expected.roomLabel` | attendance fold | YES | NO | org member | same | **A** | 0 |
| `unavailableReason` | `AttendanceCardVM.unavailableReason` | attendance fold | YES | NO | org member | same | **A** | 0 |

> **DEFECT FOUND BY THE LEDGER.** The composer's existing attendance fact reads
> `(attendance as { todayLabel?: unknown }).todayLabel`. `AttendanceCardVM` has no `todayLabel`.
> The cast makes it typecheck, `?? ""` makes it `known("")`, and the projection therefore reports
> a KNOWN EMPTY STRING for a card whose read SUCCEEDED. That is the exact failure mode the state
> model exists to prevent, produced by my own composer. The owner's field is `state`.

## health_safety — 1/3 in A′ (`profileFactCount`)

| field | owner | inputs | inA′ | +read | auth | cfg | class | path |
|---|---|---|---|---|---|---|---|---|
| `profileFactCount` | `loadCustomerMemberProfileFieldsByMemberId` | `field_values` | YES | NO | `healthView` | `health_safety` configured | **A** | 0 |
| `requirementsSatisfied` | `buildHealthSafetyCardVM` → `DOCUMENT_BACKED_REQUIREMENTS` × `documents` | `documents` | NO | YES · 1 query 1 hop | `healthView` | same | **C** | phase 1, parallel with the profile read — expected +0ms |
| `requirementsTotal` | same (constant length of the configured requirement set) | — | n/a | NO | `healthView` | same | **A** | 0 |
| `emergencyContactCount` | `buildHealthSafetyCardVM` → `person_child_relationships` | that table | NO | YES · 1 query 1 hop | `healthView` | same | **C** | phase 1, parallel — expected +0ms |

> `persons` (contact NAMES) is a SECOND hop off `person_child_relationships`. The COUNT does not
> need it, so the count is taken at hop 1 and the names are deliberately not carried into Stage 1 —
> Stage 2 may add them. Adding a dependent hop to buy a name is not a first-order trade.

---

## Part 8 roll-up

| class | fields | meaning |
|---|---|---|
| **A** | 15 | zero additional read |
| **C** | 10 | additional canonical read required |
| **D** | 0 | no contracted field is owner-unresolved |

Of the 10 class-C fields, **6 cost one parallel single-hop query each in phase 1** (department
metadata ×4 fields, documents ×1, relationships ×1) and are expected to contribute 0ms because
phase 1 is already bounded by `population → children` at ~375ms. The remaining **4 are the
financials ledger** and are the only rows whose budget is not obviously free.

---

# OUTCOME OF THIS SLICE

## Coverage

| card | before | after | contracted | remaining |
|---|---|---|---|---|
| business_process | 0 | 6 | 6 | 0 |
| financials | 3 | 3 | 7 | **4 — the charges ledger** |
| children | 1 (wrong) | 2 | 2 | 0 |
| household | 0 | 6 | 6 | 0 |
| attendance | 1 (wrong) | 4 | 4 | 0 |
| health_safety | 1 | 4 | 4 | 0 |
| **total** | **6** | **25** | **29** | **4** |

The contracted total is 29 rather than the 27 previously reported: `requirementsTotal` and
`enrollingCount` are separate contracted facts, not derivations of their neighbours.

## Two defects the ledger found in code that was already merged and already gated

**1 — Attendance published a FALSE KNOWN EMPTY.** The composer read
`(attendance as { todayLabel?: unknown }).todayLabel`. `AttendanceCardVM` does not declare
`todayLabel`. The cast satisfied the typechecker, `?? ""` produced `known("")`, and a SUCCESSFUL
attendance read therefore stated, with confidence, that there was nothing to say about the child's
day. The suite's own mock returned `{ todayLabel: "No record" }` — a stub that invented the
contract and therefore agreed with the defect. Both are fixed: the composer reads `state`, and the
mock returns the owner's real shape.

**2 — The child count was a count of OPPORTUNITIES.** `known(children.size)` is the size of the
enrichment map, one entry per row in the population. On a fourteen-family population it reported
fourteen children for a family with two. It now comes from
`normalizeFocusPanelChildrenRowsFromTruth`, the normalizer the Children card itself uses.

Neither was caught by twenty gates written specifically about this composer, because every one of
them asserted that the facts present carried honest STATES. None asserted that the facts were the
RIGHT ONES. That is the gap this ledger closes.

## Reads added — three, all in phase 1, all configuration-gated

| resolver | queries | hops | gate |
|---|---|---|---|
| `process_config` | 1 | 1 (FK embed `work_units → departments`) | `business_process` configured |
| `health_supplements` | 2 (parallel) | 1 | `health_safety` configured AND `healthView` |

Query count 17 → 20, pinned by a gate. Every new read is addressed by work unit or by the focused
child, so none of them consumes the population and none is chained behind it — pinned by a gate
that fails if any of them starts after the population ends.

## Plant battery — 12 attempted, 12 bound (10 on the first pass)

Two plants stayed green on the first pass and both were gate defects, not code defects:

- **`childCount = children.size` survived.** The fixture had two map entries and a subject with two
  children, so the defect and the truth produced the same number. The test comment had explicitly
  named this collision risk and the fixture did not eliminate it. A third population row now makes
  the two quantities differ by construction.
- **A health reader returning zero on a failed read survived.** The composer suite mocks that
  module wholesale, so its error handling was never executed anywhere. `tests/runtime/
  healthFirstOrderSupplements.test.ts` now gates the reader where it is defined.

## What remains — the financials ledger, and why it is not in this slice

`periodKey`, `responsibilityCents`, `balanceCents`, `paymentsCents` and `pastDueCents` need the
`charges` ledger. `reconcileRows` and `pastDueFor` are pure and exported, so the arithmetic costs
nothing; the read does. `charges` sits at hop 3 of a chain whose first two hops
`readAccountPrepaidPosition` already performs — and that resolver is the one currently BINDING the
measured DAG at 375ms. Adding to the binding branch is the only change in this programme whose cost
cannot be predicted from the existing measurements, so it is stated here as class C with an
unmeasured budget rather than implemented on an assumption that it is free.
