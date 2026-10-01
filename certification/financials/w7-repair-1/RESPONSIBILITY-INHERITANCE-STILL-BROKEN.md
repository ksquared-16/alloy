# RESPONSIBILITY_INHERITANCE_STILL_BROKEN

Third decisive attempt, on deployed **`ca2711db691fe6ac14f9aee2b0972556cd79af7f`** (#1385).
Stopping here as instructed rather than continuing into Details certification.

## What changed, and it is real progress

The previous two defects are **fixed and confirmed live**:

1. `/api/admin/financials/responsibility-positions` now emits `responsiblePartyId` — verified against
   the deployed route.
2. The action envelope is now read correctly — `data.affected_id` came through as
   `859f1614-0898-4991-82c1-a2055207fb43`, and **`billing.configure_responsibility` ACTUALLY
   EXECUTED**, which it never did before.

## The live trace

```
ACTION TRACE:
  {"action":"charge.add","mode":"execute"}
  {"action":"billing.configure_responsibility","mode":"execute"}     <-- it runs now

RESPONSES:
  {"ok":true,  "affected_id":"859f1614-0898-4991-82c1-a2055207fb43",
               "execution_result":{"write_status":"created","posted":true,
                                   "resolution_key":"tpl:field_trip:2026-10-05:7796a568-…"}}
  {"ok":false, "affected_id":null, "execution_result":null}          <-- refused
```

Operator-visible message, which the surface reported truthfully rather than swallowing:

> The charge was created, but one step did not complete: responsibility for this charge —
> Action "billing.configure_responsibility" does not support entity type "customer".

## Root cause

`lib/adminV2/actions/definitions/financialResponsibilityActions.ts`:

```ts
supportedEntityTypes: ["child", "person", "opportunity_customer_member", "opportunity"],
```

**`customer` is absent.** The Certfree Field trip is `billable_source_type: "customer"` — a
HOUSEHOLD-grain charge — so the card invokes the action against a `customer` entity and the registry
refuses it before the payload is ever considered.

The payload itself is well formed: it carries `customer_id`, `charge_id`, `effective_start` and the
`shares` parsed from the standing arrangement. The refusal is purely the declared entity-type
surface of the action.

Note this is why the account-level **Manage responsibility** panel succeeds while Add Charge's
follow-up fails: the panel reaches the same writer through a supported entity type.

## Durable state — census of the deployed store, 2026-10-01T23:27:04Z

| | |
|---|---|
| charges on Certfree | **5** |
| standing arrangement | 1, active, account-scoped, Ada Certfree `percentage` **10000 bp** |
| charge-scoped arrangements | **0** |
| `financial_responsibility_allocations` | **0 — q4 absent entirely** |

All five charges are preserved and unmutated, including the two historical ones that failed for the
two earlier reasons. No QA testimony was touched.

## The shape of this batch, stated plainly

Three defects, one chain, each hidden behind the one in front of it:

1. the producer dropped the party id → shares were filtered out → the writer was never called;
2. the consumer read the executor's response shape → the created charge id was lost → the writer
   was never called;
3. the writer's registry does not accept the entity type a household charge presents → the writer
   is called and refuses.

Each was invisible until the one before it was fixed, and in every case the source and the tests
looked correct. That is the argument for the deployed mounted proof being the acceptance authority,
and it is why this is being returned as evidence rather than repaired on my own judgement.
