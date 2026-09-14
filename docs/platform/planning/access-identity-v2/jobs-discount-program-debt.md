---
title: JOBS_DISCOUNT_PROGRAM_DEBT
status: sprint
owner: jobs & booking
raised_by: Access & Identity V2 — Discounts authority disposition V1
---

# Four things the Discounts authority slice found and did not fix

The Access slice rehomed three Discount Program mutations from the `admin` role literal to
`ops.jobs.write`. That is all it changed. Trying to *use* those routes surfaced four separate
problems, none of them authority problems, all recorded here for the Jobs & Booking owner.

## `DISCOUNT_PROGRAM_CREATE_SCHEMA_DEFECT` — creating a program is broken

`buildDiscountProgramBenefitsInsertPayload` writes `sort_order: 0` into
`discount_program_benefits`. The canonical schema defines that table **without** a `sort_order`
column, and no migration in the tree adds one. Every create therefore fails:

```
new row for relation "discount_program_benefits" ... 'sort_order' column not found
```

This is not environment drift — it is the schema the repository itself defines. It explains the
deployed census neatly: two programs, both created before this line existed, and nothing written
since March. Pinned by PHASE 6 of `discounts-authority.cert.spec.ts`, which fails the moment the
defect is fixed so the full lifecycle proof gets restored.

## `DISCOUNT_PROGRAM_TENANT_SCOPE_DEFECT` — update and delete are not org-scoped

`updateDiscountProgram(supabase, programId, …)` and `deleteDiscountProgram(supabase, programId)`
select, update and delete by `id` alone, with no `org_id` predicate, on a `createAdminClient()`
service-role connection that bypasses RLS. A holder who knows an id can reach another tenant's
program.

Pre-existing and unchanged by the rehome — the population that can reach these handlers is identical
before and after, because `ops.jobs.write` is admin-present and ops-absent.

It is deliberately **not** fixed here. `org_id` on a Discount Program is nullable, so a naive
`.eq("org_id", ctx.orgId)` would make platform-scoped programs unreachable. The fix needs a decision
about what a null-org program means, which is Jobs product work. Pinned by PHASE 5 of the same spec.

## `JOBS_DISCOUNT_PROGRAM_PRODUCTIZATION_DEBT` — canonical model, legacy-only surface

Discount Programs are canonical for the Jobs/Booking vertical and consumed server-side by jobs,
opportunities, quote selection and patching, booking validation, campaigns and deletion eligibility.
The only authoring surface is `web/app/legacy-admin/discounts/DiscountsClient.tsx`, mounted by its own
legacy page and embedded in the legacy Pricing client. There is no adminV2 destination and no current
navigation reaches it.

Access did not remove that surface, because removing the only writer of a supported model is a
product decision. Jobs/Booking productization should either build the canonical surface and retire
the legacy one, or explicitly retire Discount Programs as a Jobs feature.

## `JOBS_DISCOUNT_MUTABILITY_DEBT` — deletable, with no history

A Discount Program can be edited and deleted outright; there is no supersession, reversal or retained
history. Today that costs nothing — the deployed census found **zero** discount applications, so no
program has ever reduced money. If the vertical becomes active it will matter, and the model will
need the same treatment `financial_reduction_applications` gives its own rows: the policy as it was,
frozen alongside what it produced.

## What Access settled, and will not revisit

`ops.jobs.write` is the owner. Not `fin.adjust`, whose catalogue text scopes it to *"what a family
owes"*; not `fin.write`; and not a `discounts.*` family, because a folder is not a product authority.
The Financials program recorded `discount_programs` as a different vertical when it built
`financial_reduction_applications`, and that boundary holds in both directions.
