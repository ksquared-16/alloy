# S3/S4 TERMINAL REAL-CLOCK CERTIFICATION — GRANTED

**`FINANCIALS_V1_BILLING_PERIOD_COMMERCIAL_FINALIZATION_COMPLETE_CERTIFIED`**

The final S3/S4 evidence debt is closed. A canonical customer billing period reached its commercial
boundary and was closed, unattended, by the real scheduled-work clock — exactly once, attributed to
the system, with its materialized bounds untouched.

Collected `2026-10-05T04:03:30.179Z` against `alloy_deployed_primary`.
Deployed SHA `f981b23ba9a7221ddb9999a6e88c4412624b6e22`.

Artifact verified before execution: `phase3-real-clock-collection.sql`, sha256
`ed2e4631b10620be5c44439ba7cbdd1f63a5bc74001fb17a4907e6297052a284` — **exact match**. Read-only
throughout: nothing was written, no handler invoked, no occurrence manufactured, the fixture
unmodified, nothing closed by hand.

## The unattended chain, end to end

| link | durable evidence |
|---|---|
| schedule | `2edf2559-d500-4edc-a96c-501c383315de` — daily, active, org `93667019…` |
| occurrence | **`623122f4-7fab-4f19-8df0-0c2e93cffa7e`** — `due_at 2026-10-05T04:00:00Z`, created by the clock, status `completed` at `04:00:00.281Z`, `attempt_count: 1`, no failure |
| claim / lease | worker **`worker-df98e6ad`**, diagnostic `lease: "applied"` |
| attempt | **`6ab19722-8f0e-4872-88ab-43fc68fa77c1`** — n=1, `04:00:00.828Z → 04:00:01.176Z`, outcome **`completed`** |
| handler | `financials.billing_period_close.evaluate` — the deployed close handler |
| handler result | `evaluated_for: "2026-10-04"`, `eligible_found: 1`, **`closed_count: 1`**, `closed: [{ billing_period_id: 59f50689…, period_key: "2026-10-03~2026-10-03", customer_id: fd000000…c0003 }]`, `refused: []`, `already_closed: []` |
| close service | `closeBillingPeriod`, reached through the handler — no second implementation |
| database transition | `59f50689…` **open → closed** |

**The persisted close time sits inside the attempt window.** `closed_at = 2026-10-05T04:00:01.043Z`,
between the attempt's `04:00:00.828Z` start and its `04:00:01.176Z` finish. The close corresponds to
the actual scheduled execution rather than to anything else.

## It was a real transition, not a row that was already closed

| | before the wait (2026-10-03T02:24Z) | after (2026-10-05T04:03Z) |
|---|---|---|
| status | `open` | **`closed`** |
| closed_at | `null` | **`2026-10-05T04:00:01.043Z`** |
| close_actor | `null` | **`system`** |
| closed_by | `null` | `null` |
| updated_at | `2026-10-03T02:22:49.179Z` | **`2026-10-05T04:00:01.043Z`** |

`updated_at` moved from materialization time to close time, so the row was genuinely written during
that attempt.

## Attribution — the system, and no fabricated human

`close_actor = system`, `closed_by IS NULL` (`closed_by_is_null: true`). No operator was invented to
satisfy a column. `closed_by_operator: 0` across the entire estate for this proof.

## Snapshotted boundary — unchanged

The closed row still carries exactly what was materialized before the wait:

```
period_key           2026-10-03~2026-10-03
starts_on / ends_on  2026-10-03 / 2026-10-03
cadence              daily
calendar_scope       customer
calendar_policy_id   d322a255-7941-48d0-b262-68068b660be5
calendar_snapshot    { "cadence": "daily", "anchor_on": "2026-01-05" }
```

Nothing was regenerated or restated during close. The period that closed is the exact period
materialized two days earlier.

## Next-period continuity

`d93a6a6f-2ea3-45ed-b878-b5549c518772` (`2026-10-04~2026-10-04`) remains **open**, with
`updated_at` still `2026-10-03T02:22:49.179Z` — untouched by the close. `gap_days_before_next` from
the closed period is **0**: contiguous, no overlap, no gap. No additional future period was
materialized by the close.

## Exactly once — and the two wakes together are the proof

| | |
|---|---|
| close occurrences | **2** |
| close attempts | **2** |
| close transitions | **1** (`closed_by_system: 1`, `closed_by_operator: 0`) |

- `5e9c35a3…` — due `2026-10-04T04:00:00Z`, `evaluated_for: "2026-10-03"`, `eligible_found: 0`,
  `closed_count: 0`. It **declined**, correctly: in the org's business timezone the period had not
  yet finished.
- `623122f4…` — due `2026-10-05T04:00:00Z`, `evaluated_for: "2026-10-04"`, `eligible_found: 1`,
  `closed_count: 1`. It closed it, once.

Two wakes, one transition. A closed period cannot be rediscovered because
`findClosableBillingPeriods` filters `status = 'open'`, so the row is structurally not a candidate —
which is stronger than an idempotent re-scan, and distinct from it. **A third close occurrence has
not yet fired** (`schedule_next_due_at: 2026-10-06T04:00:00Z`), so the post-close-wake observation
is structural plus the single recorded transition, and I am not claiming an observed third wake.

## Clock health control

Healthy throughout, which is what separates "did not close" from "scheduler stopped":

- last wake `2026-10-05T04:00:01.263Z` (208s before collection), **wake_count 3,847**, worker
  `worker-df98e6ad`
- all three registered handlers completed occurrences on both 10-04 and 10-05: close at `04:00Z`,
  periodic billing at `03:14Z`, autopay at `00:00Z`

## Empty-period control (§12)

Both periods empty at collection time: `charges_in_period: 0`, `reductions_in_period: 0`,
`is_empty: true`. The whole synthetic household carries `charges_any: 0`, `payments_any: 0`,
`reductions_any: 0`, `obligations_any: 0` — no unrelated actor touched the fixture, so attribution is
uncompromised.

An empty period is a canonically valid commercial period under S1, and automatic close is required
to work with zero economics or many. No money was manufactured to make the fixture look realistic.

*Staging note, stated rather than hidden:* the pre-staged `phase3` artifact carried no emptiness
question — my own gap when arming it. §12 was satisfied with one additional read-only census
(`phase4-empty-period-control.sql`, sha256
`c5015b0f24e0402d720d66849b9f89cc02caa948a10ac3a850ca97ae8b47450f`, run `04:06:00.050Z`). Attribution
never depended on it: the closing attempt's own diagnostic names the period it closed.

## The one-day lag, now confirmed as a schedule-time characteristic

The previous collection found the first wake declining with `evaluated_for: "2026-10-03"`, and I
recorded the cause as the schedule firing at **04:00 UTC** while the org sits west of UTC−4 — so
`04:00Z` falls on the previous business day. This collection confirms it from the other side: the
next wake evaluated `2026-10-04` and closed immediately.

So a period becomes eligible at local midnight but is closed by the wake roughly 24 hours later. It
can only ever close **late, never early**, which is the doctrine — but the lag is incidental rather
than designed. Moving the schedule to about **12:00 UTC** would be after local midnight for every US
zone and would close on the first eligible local day. Recorded for the Director; **not changed
here**, because this is a collection-only run.

## Carried forward unchanged

- **Generated-billing deployed-estate evidence debt** — still outstanding, unrelated to this proof.
- **W7** — paused. Kelly's testimony untouched. No QA change, no PASS, no advancement.
- S1, S2, S3/S4 and S5 architecture not reopened; the fixture not modified.
