# W7 Repair Batch 1 — the fifth decisive responsibility proof

**Result: the charge is DIVIDED. Responsibility inheritance is repaired end to end.**

Deployed revision `a0dd92a8cdda6bfce3a83a509b6210b3e378008b` (PR #1387, served by staging and
confirmed by ancestry containment, not by reading a label). Fixture: Certfree Family, customer
`7796a568-3b5f-4606-80f9-fee2dae2a419`, one responsible party Ada Certfree
`fb4eb21b-ad0e-446b-bab1-5a426fd1846e` at 100%.

One new Field trip charge was added through the product on an unused Service Date, **Oct 7 2026**,
with **Charge To never touched** — the whole point being that the standing household arrangement has
to reach the posted charge on its own.

## The three governed acts, from the live wire

All three executed. All three answered `ok: true`.

| act | entity | answer |
| --- | --- | --- |
| `charge.add` | `customer` | `write_status: "created"`, `posted: true`, key `tpl:field_trip:2026-10-07:7796a568…` → charge `6ccb9225-8c21-4fb4-b414-9b6a1afb993a` |
| `billing.configure_responsibility` | `customer` | `arrangement_id: 96b204d9-8e87-4335-a762-aecf0245de8e`, `superseded_id: null`, `shares: 1` |
| `billing.resolve_responsibility` | `customer` | `kind: "resolved"`, `allocations: 1`, `unassignedCents: 0`, `netCents: 4000` |

`resolve` sent no shares. The division is the server's arithmetic over the arrangement, not a number
the surface supplied — which is why it is a separate act and not a field on `configure`.

Account charge count moved 6 → 7. Exactly one submission, exactly one charge.

## The store, asked separately (`fifth-proof-census.sql`, `alloy_deployed_primary`)

Allocations per charge — the question stated as a count, so "the new charge only" is not a reading:

```
28bb638c  svc=2026-10-03  allocs=0  allocated=0     divided=False
3fb7c297  svc=2026-10-06  allocs=0  allocated=0     divided=False
63793ef0  svc=2026-10-02  allocs=0  allocated=0     divided=False
6ccb9225  svc=2026-10-07  allocs=1  allocated=4000  divided=True   <<< the new charge
77b02ec2  svc=2026-10-04  allocs=0  allocated=0     divided=False
7dce5d42  svc=2026-10-01  allocs=0  allocated=0     divided=False
859f1614  svc=2026-10-05  allocs=0  allocated=0     divided=False
```

One allocation row exists on this account, and it belongs to the new charge:

```json
{"charge_id": "6ccb9225…", "responsible_party_id": "fb4eb21b…", "assigned_amount_cents": 4000,
 "is_unassigned": false, "basis": "percentage", "explanation": "100.00% of $40.00.",
 "arrangement_id": "96b204d9…", "state": "active"}
```

**The six pre-existing Certfree charges still carry ZERO allocations.** They are evidence of the
defect and were deliberately not backfilled; a count that had moved on them would itself be a defect.
Arrangements went 3 → 4, the new one bound to the new charge; the standing household arrangement
`e5f7deef` (`charge_id: null`) is untouched, as are `a639f74d` and `a0918a88`.

## Readback equality — five layers, one set of figures

| layer | reads |
| --- | --- |
| preview, before confirming | Field trip $40.00 · Billing period November 2026 · Due Nov 11 2026 |
| `charges` row | `amount_cents 4000` · `occurs_on 2026-10-07` · `billable_on 2026-11-01` · `due_date 2026-11-11` · `posted` |
| arrangement | `96b204d9` active, `charge_id` = the new charge |
| share | Ada Certfree · `percentage` · `10000` bp |
| allocation | 4000c to Ada Certfree · `is_unassigned: false` · "100.00% of $40.00." |

Ledger responsibility cell for the new charge: `state="named"`, text **"Ada Certfree"**. The other six
rows read "Not allocated" — truthfully, because they are not.

Accounts Details for the new charge now carries **both** halves, which is the shape of the repair:

```
RESPONSIBILITY ARRANGEMENT   Ada Certfree 100%          (who would owe)
RESPONSIBILITY               Ada Certfree $40.00        (what they do owe)
```

Before #1387 the second block read "This posted charge is not divided under it." Details also reads
Billing period November 2026, Invoice date Nov 1 2026, Due date Nov 11 2026 — the stored values, not
a recomputation — Gross charge $40.00, Net obligation $40.00, Outstanding $40.00, and **zero UUIDs**.

### On "November", which looks wrong and is not

The period is derived from `billable_on`, not from the service date, because `billable_on` is the
column whose own comment defines the lifecycle. Every Field trip charge on this account — all seven,
the six from before this repair included — carries `billable_on 2026-11-01` and `due_date 2026-11-11`.
A field trip that happens in October bills next cycle. The new charge is identical to its six
predecessors in both columns, so nothing in the date, billing-period or due-date work regressed.

## The no-op follows nothing up (defect #5)

The same Service Date was submitted a second time. `charge.add` answered
`write_status: "skipped_posted"`, `posted: false`, carrying the EXISTING charge id `6ccb9225` — and
**neither `billing.configure_responsibility` nor `billing.resolve_responsibility` was dispatched at
all.** Four requests went out, every one of them a `charge.add` (three previews and the write). The
account stayed at 7 charges.

This is the behaviour that was broken: a no-op submission used to reconfigure a historical charge's
responsibility. It no longer does.

One observation, recorded and not absorbed per the Batch-1 boundary: the "That charge already exists
on this account. Nothing new was created." notice was not present in the DOM when read ~28s after
submit. The governed requirement — no follow-up write, counts unchanged — is met; whether the
operator is *told* is a legibility question for a later W7 scenario.

## Opening a record still dispatches no command

Focus Panel: 89 openable ledger rows, **0 requests to `/api/admin/actions/execute`** while opening.
Reading a record remains reading.
