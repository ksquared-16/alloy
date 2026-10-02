# Fourth decisive proof — the arrangement inherits; the charge is still not divided

Deployed **`9a16cf6c549a052cc095b950c23379a9be7117fd`** (#1386), confirmed by ancestry.

## F–M: PASS. The three defects are fixed and the chain runs end to end.

New charge `3fb7c297` (service 2026-10-06), Charge To never touched.

```
charge.add                        entity_type=customer  ok:true
                                  write_status="created" posted:true
                                  affected_id=3fb7c297…
billing.configure_responsibility  entity_type=customer  entity_id=7796a568…  member=null
                                  shares=[{party fb4eb21b…, percentage, 10000 bp}]
                                  ok:true  arrangement_id=a0918a88…  shares:1
```

Account went 5 charges → **6**, ledger $200 → **$240**: exactly one new charge.

Durable state (census 2026-10-02T00:10:09Z) — three arrangements, each with one share at
`percentage 10000 bp` for Ada Certfree:

| arrangement | charge | meaning |
|---|---|---|
| `e5f7deef` | NULL | the standing account-scoped arrangement |
| `a639f74d` | `859f1614` | see note below |
| **`a0918a88`** | **`3fb7c297`** | **the new charge's own, inherited without touching Charge To** |

So J/K/L/M hold: a charge-scoped responsibility **arrangement** exists for the new charge, naming
Ada Certfree, percentage, 10000 bp.

## §3 readback: FAILS, and the product says why

Accounts Details for `3fb7c297` is correct and complete — Billing period November 2026, Due date
Nov 11 2026, Service Date Oct 6 2026, GL 4090, gross/net $40.00, exact created and posted timestamps,
**zero UUIDs**, and under RESPONSIBILITY ARRANGEMENT: **Ada Certfree 100%**.

But it also states:

> 1 responsible party from Oct 2, 2026. **This posted charge is not divided under it.**

and every ledger row — all six — reads **`Not allocated`** (`data-financials-responsibility="not-allocated"`).

`financial_responsibility_allocations` is **still zero**.

### The distinction this exposes

`billing.configure_responsibility` writes an **arrangement + shares**: who *would* bear this charge.
Dividing the charge's net into **allocations** is a separate canonical act — the resolve/reallocate
path (`resolveChargeResponsibility`). Add Charge's follow-up configures the arrangement and never
resolves it, so the obligation is governed by an arrangement but owed by nobody in the allocation
table, and the ledger says so truthfully.

§3 required the ledger NOT to read `Not allocated`. It does. **The readback requirement is not met**,
so the success condition is not granted.

Whether Add Charge should also resolve the charge under the arrangement it just configured — making
it three governed acts rather than two — is a domain decision, and the architectural boundary in the
prior instruction was explicit that responsibility persistence must stay independently governed
rather than folded into the charge writer. Returned rather than taken.

## Note on `a639f74d` / charge `859f1614`

The first run of this proof reused service date Oct 5, which `charge.add` correctly answered
`skipped_posted` — idempotent, the existing charge's id returned. The follow-up then configured
responsibility on that existing (third-attempt) charge. So one historical charge gained an
arrangement as a side effect of the idempotency path. It was not mutated to "look fixed", nothing
was reset, and the other four historical charges remain untouched with no charge-scoped
responsibility. Recording it because it changes the before/after picture by one row.

## Incidental: §10 idempotency, partially obtained

That same run is real evidence for the carried duplicate proof: a repeat submission returned
`write_status: "skipped_posted"`, `posted: false`, with the existing charge id — read correctly by
the client through the **public route envelope** (`data.execution_result`), which is exactly the
contract repaired in #1385. The charge count did not change. What is not yet proven is the operator-
facing notice text for that case.

## Details / Focus Panel

Accounts Details: proven, above. Focus Panel: the Details affordance is present (**89** openable
ledger rows) and opening a record dispatched **zero** financial commands — it is a read. Same-charge
parity was not obtained because the Focus Panel's subject is a different household, so the Certfree
charge is not in its ledger.
