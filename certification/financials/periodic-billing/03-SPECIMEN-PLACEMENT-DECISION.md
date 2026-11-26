# Certification specimen placement — a decision is required

**Promotion is done and proven inert.** PR #1181 merged `c361680a9`; deployed and verified; zero
Periodic Billing schedules exist; the Human-QA tenant reads *"Recurring tuition is NOT billed
automatically."* §1–§4 and §17 (unprovisioned half) are complete.

**Stopped before provisioning**, because §2 and §5 cannot both be honoured in this estate and
provisioning moves money.

## First: a correction to the previous run's census

I reported that the first wake would bill Certb $1,450.00. **That was wrong, and it was wrong in
the direction that matters.**

`previewTuitionGeneration` never queries `charges` — it shares the due/not-due decision with
generation but not the convergence check, so it reports `generated` for periods that already have
charges. The database says those charges exist:

| Assignment | Agreement | Charges |
|---|---|---|
| Certb (monthly) | `fa3767f8…` | `2026-09-01` **posted** $1,450.00; `2026-10-01` draft |
| Certa (weekly) | `43ef5615…` | `09-01, 09-08, 09-15, 09-22, 09-29` — five drafts, $185.00 each |

Every canonical period that has begun is already converged. **The Human-QA tenant's outstanding set
is ZERO**, not 3-and-1. So §18's pre-activation census is: Certa weekly 0 outstanding, Certb monthly
0 outstanding, nothing over N, and §19/§20 have nothing to converge.

Activating Kelly's tenant today would therefore mutate **nothing**.

## The conflict

The Periodic Billing schedule is per **organization**. Measured:

| Org | Locations | Customers | Agreements | Live tuition terms | Charge templates | Policies |
|---|---|---|---|---|---|---|
| Firefly Early Learning | 22 | 11 | 8 | 2 | 5 (incl. `tuition`) | 3 |
| Alloy Bend | 0 | 0 | 0 | 0 | 0 | 0 |
| W-17 self-test | 0 | 0 | 0 | 0 | 0 | 0 |

Kelly's Human-QA family lives in **Firefly**, the only organization with any commercial
configuration at all. The other two are empty shells — a billing specimen there would first need an
entire organization built: locations, programs, rate plans, a `tuition` charge template, policies,
a family, a child, an enrollment and an accepted term. That is a program, not a step, and it would
need certifying in its own right.

So a specimen that exercises real billing must live in Firefly, and provisioning Firefly's schedule
to wake it **also activates Kelly's tenant** — which §2 forbids until §21.

## Recommendation

Proceed in Firefly, because the risk §2 exists to prevent is measured to be zero:

1. Create a certification specimen family in Firefly — **not** the Certhouse family — with an
   accepted tuition term shaped so exactly one canonical period is due and unconverged.
2. Provision Firefly's Periodic Billing schedule.
3. Let the real clock (`*/5 * * * *`, 58 wakes recorded, last at 00:10 UTC) wake it.
4. Certify §7–§14 against the specimen.

The first wake bills **only the specimen**, because Certhouse has no outstanding work. Kelly's
family is not the probe and is not mutated, which is what §2 and §5 are protecting; only the letter
of "do not provision Kelly's organization yet" cannot hold, since the organization is the grain.

The specimen is a fixture mutation in the QA organization (one extra family and child), so it is
not made before this ruling.

## Also measured

**Autopay has zero scheduled work on staging** — total `scheduled_work` rows = 1, and that one is
the inert `clock_activation_certification` probe (`org_id` null, `next_due_at` NULL). Autopay's
handler is productized and registered, but no arrangement exists, so §15's *live dispatch*
non-regression cannot be demonstrated without first creating an autopay arrangement. Its code is
untouched by this work.

**Charge Aging** remains `evaluated("charge_aging", …)` / `not_productized_v1` at the deployed SHA.
