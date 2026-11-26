---
title: DOCUMENT_FIELD_TABLE_SCHEMA_HYGIENE_DEBT
status: sprint
owner: platform data
raised_by: Access & Identity V2 — Document Field legacy retirement V1
---

# Two empty tables left standing on purpose

Document Field Definitions was retired as a product: its two API routes, its adminV2 page, its legacy
authoring client, its configuration-registry entry, its navigation link and its two redirects are
gone. The tables were deliberately **kept**.

## What the census found

| | |
|---|---|
| `document_field_definitions` | **0 rows**, ever, across all orgs |
| `document_field_values` | **0 rows**, ever |
| Definitions referenced by a value | 0 |
| ...while `documents` | 180, across 4 doc types |
| ...and canonical `field_definitions` | 424 |

No runtime read existed anywhere outside the two retired routes. The subsystem was designed, wired to
a screen, and never used.

## Why the tables stay

Dropping them is a schema change with its own small blast radius, and none of it was needed to remove
the product surface or the Access debt:

- `deleteOpportunityLead` still names `document_field_values` in its cascade, so a drop means editing
  a live deletion path — a correctness-sensitive file that has nothing to do with this retirement.
- Demo-runtime cleanup scripts also enumerate the table.
- There is no data to migrate, so there is no urgency: an empty table costs a row in a schema dump.

Retiring the product did not require touching the schema, and expanding a code retirement into a
migration would have been scope creep with a real failure mode.

## The bounded cleanup, when someone wants it

1. Re-prove zero rows and zero readers on the deployed primary.
2. Remove the `deleteOpportunityLead` cascade reference and the demo-cleanup enumerations.
3. Drop both tables through normal schema-retirement doctrine, with the usual governed apply.

Nothing about this is urgent. It is recorded so the next reader knows the tables are empty *by
history*, not by accident, and that the product above them is gone.
