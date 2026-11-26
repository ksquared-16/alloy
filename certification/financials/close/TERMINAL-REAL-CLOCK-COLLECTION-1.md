# Terminal real-clock collection #1 — `TOO_EARLY_FOR_TERMINAL_COLLECTION`

**Collected 2026-10-04T09:54:01Z against `alloy_deployed_primary`. Deployed SHA
`f981b23ba9a7221ddb9999a6e88c4412624b6e22`.**

Artifact verified before execution: `phase3-real-clock-collection.sql`, sha256
`ed2e4631b10620be5c44439ba7cbdd1f63a5bc74001fb17a4907e6297052a284` — **exact match**. One governed
census, no writes, no product actions.

## Outcome: not failed, and not yet proven

**Every link in the chain worked.** The close did not happen because the period was **not yet
eligible in the authority's own timezone** — and my arming-run arithmetic, not the product, was
wrong about when that would be.

## The chain, as it actually ran

| link | evidence |
|---|---|
| schedule | `2edf2559-d500-4edc-a96c-501c383315de`, active, due `2026-10-04T04:00:00Z` |
| occurrence | **`5e9c35a3-3ac4-4b84-bb99-0463a2e0d291`** — created `04:00:00.639Z`, status `completed`, `attempt_count: 1`, no `failure_reason` |
| claim / lease | worker **`worker-73da426b`**, diagnostic `lease: "applied"` |
| attempt | **`a820fddd-33ef-45f3-98fa-5a6756a12c08`** — started `04:00:01.109Z`, finished `04:00:01.366Z`, outcome **`completed`** |
| handler | `financials.billing_period_close.evaluate` — the deployed close handler |
| result | `eligible_found: 0`, `closed_count: 0`, `closed: []`, `refused: []`, reason *"no billing period has finished its interval"* |

Nothing was manufactured: the occurrence was created by the clock, claimed by a real worker, and
leased.

## The one field that explains it

```
"evaluated_for": "2026-10-03"
```

The handler ran at `2026-10-04T04:00:01Z` and evaluated for **org-local 2026-10-03**.
`fetchOrgTimeZoneIana` → `fetchOperationalTimezoneForOrg` resolves the org's *operational* timezone
from `org_settings.metadata`, and this org sits west of UTC−4, so `04:00Z` on the 4th is still the
**3rd** locally.

`findClosableBillingPeriods` filters `ends_on < todayYmd`. With `todayYmd = "2026-10-03"` and the
period's `ends_on = 2026-10-03`, the comparison is false. **The handler was correct to find nothing** —
the period had not finished its interval in the timezone the close service deliberately uses, and
closing it then would have been an early close, which the doctrine forbids.

## My error, stated plainly

The arming run predicted *"first eligible wake = 2026-10-04T04:00:00Z"*. That was derived from the
database's **UTC** `current_date`, while the close service uses the **org's business** date. Those
differ by the UTC offset, and `04:00Z` lands on the previous org-local day.

**The true first eligible wake is `2026-10-05T04:00:00Z`** — org-local `2026-10-04`, when
`ends_on 2026-10-03 < 2026-10-04` holds. Confirmed independently by the schedule's own forward
state: `schedule_next_due_at: 2026-10-05T04:00:00+00:00`, `schedule_is_active: true`.

## State as collected

| | |
|---|---|
| certification period `59f50689…` | `2026-10-03~2026-10-03`, **open**, `closed_at` NULL, `close_actor` NULL, `closed_by` NULL, `updated_at` still `2026-10-03T02:22:49Z` — untouched since materialization |
| next period `d93a6a6f…` | `2026-10-04~2026-10-04`, **open**; gap to the previous period **0 days** |
| bounds / snapshot | unchanged: `starts_on`/`ends_on` `2026-10-03`, cadence `daily`, scope `customer`, policy `d322a255…`, snapshot `{cadence: daily, anchor_on: 2026-01-05}` |
| exactly-once | `close_occurrences_total: 1`, `close_attempts_total: 1`, `closed_by_system: 0`, `closed_by_operator: 0` — one occurrence, one attempt, zero transitions |
| empty-period control | `charges_in_period: 0`, `reductions_in_period: 0` for both periods. No unrelated actor touched the fixture; attribution is uncompromised |
| clock health | last wake `09:50:00Z` (240s before census), **wake_count 3,629**, worker `worker-62a1e5fd`. All three handlers completed occurrences on 10-04 — close at `04:00Z`, periodic billing at `03:14Z`, autopay at `00:00Z` |

So: scheduler healthy, chain healthy, zero transitions, and a correct zero.

## A real finding worth a decision

Independent of this certification: the close schedule fires at **04:00 UTC**, which for an org west
of UTC−4 is the *previous* local day. A period therefore becomes eligible at local midnight but the
same-UTC-day wake still sees the previous local date — so **close lands roughly 24 hours after
eligibility rather than on the first local day after the period ends.**

That is economically safe — it can only ever close *late*, never early, which is the doctrine — but
it is a latency characteristic, not an intentional design. Moving the schedule to about **12:00 UTC**
would put it after local midnight for every US zone and close on the first eligible local day.
Recorded for the Director; **not changed here**, because this is a collection-only run.

## Next collection

At or after **`2026-10-05T04:00:00Z`**, re-run the same artifact (hash above, unchanged). Expected on
success: a second occurrence for `2edf2559…` whose diagnostic shows `evaluated_for: "2026-10-04"`,
`closed_count: 1` naming `59f50689…`; that period `closed` with `close_actor = system` and
`closed_by` NULL; bounds and snapshot unchanged; `d93a6a6f…` still open.

If that wake also reports `evaluated_for` behind the period's `ends_on`, the schedule time itself is
the blocker and the finding above becomes the required repair rather than an observation.
