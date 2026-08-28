# M1 — durable child-health truth moves to child grain (D-H1)

## What was wrong

`allergy_notes` and `medication_flag` were registered at `entity_type: "enrollment"`. That says an
allergy is a fact about an *admission*. It is a fact about a *child*, and it outlives every
admission, every re-enrollment, and every year the family stays.

The consequence was not cosmetic. A child enrolled twice had two places for the same allergy, and
neither was authoritative.

## Inventory — what exists today

| Surface | Before | Notes |
|---|---|---|
| `systemFieldRegistry` rows | `allergy_notes` (enrollment), `medication_flag` (enrollment) | the two health rows |
| Child-grain health destination | `customer_member.allergies` (FC-CM-1) | already existed, already seeded for all orgs |
| Question resolution (`questionResolutionModel`) | health intent → `enrollment.allergy_notes` | what an imported packet question bound to |
| Builder picker (`processingFormBuilderLibrary`) | offered both enrollment rows | what an operator could pick by hand |
| Tenant `field_values` rows | none found under an enrollment-grain health key | the enrollment rows were a *registry* concept; storage was already `customer_member` |

The last row is why this correction is cheap: the child-grain destination was already the one with
seeded `field_definitions` in every org. The registry was pointing new bindings at the wrong grain
while the storage layer had been right all along.

## Compatibility plan

Additive. No row deleted, no data moved.

1. Add `child_allergies` — `entity_type: "child"`, `field_key: "allergies"`,
   `shared_value_key: "child_allergies"`, `crm_mapping_key: "child.allergies"`.
2. Repoint `allergy_notes.shared_value_key` to `"child_allergies"` and mark it
   `deprecated: true, superseded_by: "child_allergies"`.
3. Mark `medication_flag` deprecated with **no** replacement. Medication is a Health-foundation kind
   (D-H5) and Enrollment must not create a competing destination for it.
4. New bindings — imported or hand-picked — resolve to the child row. Already-published forms keep
   the `field_source` they were stamped with and continue to resolve.

## No silent loss — the mechanism, not the promise

Both rows carry the same `shared_value_key`. `packetFieldPlan.canonicalKeyFor` dedupes on
`shared_value_key` **first**, so the two grains collapse to one ask-once identity: a packet holding
both an old enrollment-grain question and a new child-grain one asks the parent **once**, and the
answer reaches both. `tests/forms/healthGrainCorrection.test.ts` asserts the collapsed key and the
`shared_alias` basis rather than asserting the intent.

## Reversibility

The change is registry rows, not stored data. Reverting is: delete the `child_allergies` row and
clear the two deprecation flags. Nothing in `field_values` was written, moved, or rekeyed, so a
revert cannot strand a value. That is the whole reason M1 was done as a registry correction and not
as a data migration.

## Deliberately not done

- **M2 semantic extraction** — turning "peanuts (hives, carries EpiPen)" into a structured allergy
  record. That is the Health foundation's job.
- **Deleting the legacy rows.** They are the resolution path for every form already published with
  them. Deprecated means "not offered", never "not resolvable".
