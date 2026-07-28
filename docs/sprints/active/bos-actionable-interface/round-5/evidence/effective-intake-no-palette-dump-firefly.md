---
owner: platform
status: active
last_reviewed: 2026-07-27
package: F5-effective-intake
---

# Firefly authenticated QA — effective Create Lead intake (no palette dump)

## Session

- Host: `http://127.0.0.1:3012`
- Org: Firefly Early Learning (`93667019-bd28-49b5-a688-acc9bb1e0a19`)
- Department: New Leads work unit → `3933ac47-077a-4de8-aaac-8aed48d80413`
- Endpoint: `GET /api/admin/lifecycle/action-intake-spec?action_key=create_lead&department_id=3933ac47-077a-4de8-aaac-8aed48d80413&stage_key=lead`

## Verdict

| Check | Result |
|---|---|
| `optional` palette dump | **Empty** (`optional: []`) — fixed |
| Person label | **Person** (not Parent / Guardian) |
| Opportunity label | **Lead** |
| Location `record_creation` | **No** — `opportunity:location` is **recommended** only; not in `required` |
| Child absent after remove | **Still present** — Child fields remain in department **recommended** rules (not caused by palette dump) |

## Exact effective field set (2026-07-27)

### Required
- `person:first_name`
- `person:last_name`

### Recommended
- `person:email`, `person:phone`
- `child:date_of_birth`, `custom:child:location_id`, `child:first_name`, `child:last_name`, `child:program_interest`
- `opportunity:location`

### Optional
- _(none)_

### Constraints
- `at_least_one` on `person:email` | `person:phone`

## Form observation

BOS Create Lead → Form shows **Person** with First/Last/Email/Phone visible in the required primary block.

Child / Lead cards should appear when those groups are in the effective spec. Live API still includes Child + Lead because Firefly Lead-stage **recommended** still lists those rules — removing them from Builder recommended (set to Off) is required for Child to disappear.

## Operator follow-up

To clear Child from Form: set every Child rule to **Off** on the Lead stage (not only remove from Required). Recommended still materializes the Child entity group by design under the corrected effective-intake contract.
