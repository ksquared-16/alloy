# S3/S4 — scheduled-work clock PASSES; drafts-at-close needs one Director decision

Censuses only. No close implemented, no schema change, no writer change. Deployed `2befaf1624`.

## §2 — the scheduled-work clock is LIVE. Gate passed.

`web/vercel.json` declares a five-minute cron on `/api/scheduled-work/wake`, bearer-authenticated.
It is not merely declared:

```
wake_count     3154
first_wake_at  2026-09-21T19:25:02Z
last_wake_at   2026-10-02T18:15:00Z   (15 minutes before the census ran)
last_worker_id worker-bba17b83
```

Eleven days at a five-minute cadence is ~3,168 wakes; **3,154 observed is 99.5% delivery,
unattended.** And the chain executes end to end rather than the endpoint merely answering: 20
occurrences materialised, with 20 matching attempts. The most recent wake recorded
`claimed 0, completed 0` — correct, because nothing was due.

So automatic close may be built on this runtime. No bespoke scheduler is needed and none should be
added.

*Flaw in my own census, stated so the record is accurate:* q2 and q6 probed `work_kind`, `is_enabled`
and `status`, which are not columns on these tables, so they returned null. The liveness conclusion
rests on q1, q3 and q4, which used real columns.

## §15 — what close would do to drafts, measured

| | |
| --- | --- |
| drafts today | **35**, worth **$4,852.26** |
| generation | **all 35 `legacy`** — `billing_period_id` NULL on every one |
| bound to a canonical period | **zero** |
| producers | tuition 20, discount 7, manual credit 6, one-time 1, late pickup 1 |
| `posting_review` policy | **none configured** |
| `draft_expiration` policy | **none configured** — and it is in the database CHECK yet was never added to the TS model, so no expiry mechanism exists at all |
| obligations pre-posting | 21 `drafted` / `pending`, each with a draft charge |

Two consequences follow. First, **close today would encounter no drafts it governs**: every existing
draft is legacy, and §12 says legacy rows are not canonical open periods awaiting close. Second, the
question is still live for the future, because generated/tuition drafts DO persist — 20 of them — and
after S2 those arise as `canonical`.

## The structural hole this exposed

**Posting a draft is `UPDATE charges SET status = 'posted'` — not an insert.** The posting path never
reads `billing_period_id`.

So the guard §11 names, which lives in `bindChargeBillingPeriod` at CREATION, cannot see it. A draft
bound to November can be posted after November closes, and money enters a closed commercial period
through a path no creation-time guard touches. S2's immutability trigger does not stop it either: it
freezes *membership*, and this changes *status*.

Closing a period without answering this would ship a finality boundary with a documented way through
it.

## The decision

**A — refuse to post a draft whose canonical period is closed (recommended).** Extends the guard from
creation to the equivalent write. Creates nothing, destroys nothing, and is the only option that
leaves "closed means final" true. The draft stays visible and inert; after S5 it is corrected
prospectively. Cost: an operator can hold a draft that can no longer be posted where it sits, and
until S5 their only remedy is to re-create it in an open period.

**B — post drafts at close.** A close that bills is not a close: it would create money in the period
at the moment that period is declared final, and automatic close would do it unattended.

**C — void drafts at close.** Destroys authored work silently, and `$4,852` of current drafts shows
the scale that can accumulate. Also irreversible.

**D — refuse to close while drafts exist.** An unreviewed draft would block commercial finality
indefinitely, and because close is automatic at the period boundary, it would stall forever with no
operator prompted. Wrong for a boundary that cadence defines.

I recommend **A**, and I think it follows from the locked doctrine rather than extending it — *"after
close, ordinary new economics may not silently enter that closed period"*, and posting a draft is
ordinary new economics. But B, C and D differ materially in what happens to real money, which is why
§15 asked for this to be surfaced rather than chosen.

## What is ready the moment this is answered

The clock gate is passed; no close authority exists yet (confirmed: no close action key, no close
service, nothing beyond S1's `status`/`closed_at`/`closed_by`/`close_actor` columns and the
no-reopen trigger). Close is designable immediately on the existing runtime, with `fin.adjust`, at
`financial_billing_periods.id` grain, defaulting to §5's option A — close only once `ends_on` has
elapsed — since nothing in current doctrine establishes early close.
