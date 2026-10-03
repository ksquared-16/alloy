# Financials V1 — billing-period commercial finalization

**Classification: `IMPLEMENTED_AWAITING_REAL_CLOCK_CERTIFICATION`.**

Everything is implemented, bound and falsified. One obligation remains and it is a *waiting*
obligation, not a missing one: Phase 22 requires a real scheduled close observed end to end, and the
clock cannot reach a boundary that does not exist yet on the deployed estate. The reasoning is in
§11 below, stated precisely rather than rounded up.

---

## Phase 0 — the #1398 repair is deployed, verified by ancestry

`/api/build-info` reported `e281b4c85f5963ed646e7b7bc9d0b125c13dcbb9`, which **is** the #1398 merge
commit, and `git merge-base --is-ancestor` confirms containment rather than inferring it from
staging HEAD.

Deployed source carries the repair: `createdBinding` is projected from the contra charge, and a
search of the deployed file finds **no hardcoded generation anywhere**.

Deployed state, read read-only (`phase0-coherence-and-clock.sql`):

| question | answer |
|---|---|
| applications measured against the charge they explain | 51 |
| generation / period_id / legacy_key all agree | 51 / 51 / 51 |
| fully coherent | **51 of 51** |

**A precision that matters, and that I will not overstate.** Those 51 rows were *already* coherent,
because every one is `legacy` on both sides. The straddle the repair fixes only appears for a
household that HAS a canonical calendar — the contra charge resolves `canonical` while the old
hardcode wrote `legacy` — and no reduction has yet been written for such a household on deployed. So
the repair is **forward-looking**: it prevents the next one, rather than having healed existing rows.
The straddle itself was measured for real, on the certification stack, in `reductionCoreS2Compatibility`.

S5 remains possible, with positive evidence: **9** live reductions whose period differs from their
source charge's (`2026-09` application against a `2026-08` source).

## Phase 3 — the clock is alive

`scheduled_work_clock`: last wake **46 seconds** before the census, `wake_count` 3,224 since
2026-09-21, worker `worker-b6b28151`. Three registered schedules, all with completed
occurrence/attempt chains. Not re-litigated beyond liveness, as instructed.

---

## Phase 1 — a configuration conflict is no longer an internal error

`BillingPeriodBindingError` was thrown by one canonical authority and **caught nowhere** — a
repo-wide search found no other file that even named it. Its HTTP fate was therefore an accident of
each route's generic handler, and the shared one (`operationalEnrollmentErrorResponse`) falls through
to `{ code: "internal_error" }, 500` while forwarding the error's own message.

One mapping now answers it, in `billingPeriodBindingHttp.ts`:

| class | status | code | message |
|---|---|---|---|
| operator-resolvable (ambiguous / invalid / unconfigured calendar, no materialized period, unresolved customer, **closed period**) | **409** | the error's own code | the business sentence the error already carried |
| infrastructure (`agreement_read_failed`, `member_read_failed`, `period_read_failed`) | 500 | `billing_period_unavailable` | **ours** |

Two things worth naming:

- **This closes a message leak rather than creating one.** The three infrastructure codes carry a raw
  PostgREST string, and the old fall-through returned it verbatim. The message is now replaced.
- **An unknown code defaults to infrastructure.** Codes are listed explicitly, never matched on a
  substring like `_read_failed`, so a code added later is operator-resolvable only when someone
  decides it is — the safe direction, because the alternative promises a fix that may not exist.

`billing.adjust_account` converged onto the same mapping rather than keeping a second error model.
It was already returning usable language; what it got wrong was the shape (400 + generic
`adjustment_failed`, and a raw database string also at 400).

### The preview wording — investigated, and it is NOT a defect

A positive `credit` previews as *"increases what the family owes."* That sentence is **correct**.
Signed amounts are the economic input and are certified behaviour: the live reductions suite asserts
*"a positive amount is money owed again"* for an adjustment that raises the balance. The preview
reports the sign truthfully.

This **corrects my own note from the previous run**, where I flagged it as a sign-convention nit. It
is not one. The only residual question is whether category `credit` should *refuse* a positive
amount — an economic-semantics decision, not copy — and per §1 it is reported and left rather than
delaying close architecture.

---

## Phase 2 — draft doctrine, locked

Auto-post changed what a persistent draft means. A fully-resolved ordinary charge with no explicit
review policy now posts itself, so a canonical draft that persists is **exceptional** by
construction: `REVIEW_REQUIRED`, `POST_FAILED`, or another explicitly measured unresolved state.

For finalization:

| | |
|---|---|
| drafts block close | **no** |
| close posts drafts | **no** |
| close voids drafts | **no** |
| a draft whose canonical period is CLOSED may later post into it | **no** — refused, and the draft is preserved |
| legacy drafts (no `billing_period_id`) | outside canonical close semantics entirely |

S5 owns prospective remediation. The guard's job is to make that the only available answer.

---

## Phases 4–7 — one close authority

`closeBillingPeriod` — one `financial_billing_periods.id`, one customer, `fin.adjust` to execute.
Not accounting close; not a generic status mutation.

- **No early close.** Eligible only once the persisted `ends_on` has elapsed in the org's own
  timezone. `fin.adjust` is authority to *execute* an eligible close, not to shorten a household's
  calendar — asserted directly: an authorised operator is refused on 2026-11-12.
- **Snapshotted bounds.** Eligibility reads the materialized row's own `starts_on`/`ends_on`/cadence.
  Nothing in the service reads a customer or location calendar, so a configuration change cannot
  restate a boundary. The database agrees independently: `enforce_financial_billing_period_immutability`
  raises `billing_period_bounds_frozen`.
- **Attribution.** `operator` carries the human; `system` carries nobody. A system close that tries
  to name a person is refused by the service *and* by
  `financial_billing_periods_close_actor_shape_chk`.
- **One transition.** A second close returns the existing attribution untouched — including when the
  later caller is a different actor kind. The first transition is the commercial fact.

**Idempotency turned out to be doubly protected, and the plant is how I found that out.** The
"duplicate close rewrites `closed_at`" plant came back GREEN on the first attempt. Not a gap: the
early return and the `.eq("status","open")` conditional UPDATE each independently prevent it, so
removing one leaves the other. Defeating **both** reds the suite. Reported rather than presented as a
first-try pass.

---

## Phases 8–9 — automatic close rides the existing runtime

A new registered handler, `financials.billing_period_close.evaluate`, on the clock that already
runs. No bespoke cron, no second scheduler, and **no second close implementation** — the handler
calls the same service with `close_actor: "system"`, so "who asked" is a parameter rather than a
code path.

Registered by migration `20261118120000`, the same path periodic billing took. One active **daily**
row per org that already holds canonical periods — a platform-wide row would wake and close nothing,
because the handler treats a null `org_id` as "no tenant", never "every organisation". Applied twice
locally: `INSERT 0 1` then `INSERT 0 0`, self-test passing both times.

Rolling continuity is S1's and is untouched: close reopens nothing, reshapes no bounds and regroups
no economics.

---

## Phases 10–13 — the guards, at two deliberately different boundaries

**Creation** (`bindChargeBillingPeriod`, the one place a customer + date becomes a period id):
a closed period refuses **before** the caller writes anything. Not written-then-reversed, not moved
to the next open period, not fallen back to a legacy key, not silently re-pointed at the current open
period. Reductions (Phase 12) and generated billing (Phase 13) reach this same guard through
`createChildcareDraftCharge`, so they are covered by construction rather than by three separate
rules that could drift.

**Posting** (`postChildcareCharge`, the posting authority): a draft carrying a closed period's id
cannot become owed. This is the guard a creation check cannot replace, because posting is an UPDATE
that re-resolves nothing.

### The live run caught my guard being dead

The post guard reads `charge.billing_period_id` — and `loadCharge` selected an explicit column list
that **did not include it**. An omitted column arrives as `undefined` rather than as an error, so the
guard silently skipped and a draft posted into a closed period. Typecheck could not see it: a
`.select()` string is not typed. The projection is fixed and carries a comment saying why those three
columns must stay.

This is the second time this run that a dropped select column produced a false green. It is the
reason the lifecycle suite is not mocked.

Retry needs nothing of its own: the refusal message contains "closed", `isRetryablePostFailure`
classifies it **permanent**, and the draft stops retrying an illegal post and becomes attention work.

---

## Phases 14–20 — the November model, against a real database

`billingPeriodCloseLifecycle.live.test.ts`, 11 cases, real services and real money:

| | before close | after close |
|---|---|---|
| commercial economics | $1,075 | **$1,075** |
| paid | $1,000 | **$1,000** |
| remaining | $75 | **$75** |
| status | open | **closed** |

And what survives it:

- **Debt survives.** The $75 charge is still posted, un-voided, still bound to November, and
  `currentlyCollectibleCents` is still the full 7,500. Close is not forgiveness.
- **Payment after close settles it** — `outstandingCents` to 0 — while the period stays closed with
  its original `closed_at`, the charge keeps its `billing_period_id`, and the `payments` table has no
  period column at all. Settlement is not period mutation.
- **Autopay is unaffected by construction.** It selects on `status`/`billable_source_*`/`due_date`
  then asks for the collectible ceiling, and reads **no period column anywhere** — asserted against
  the source with comments stripped, for Autopay and for payment settlement both.
- **Post-close refusals**: new November charge refused, November reduction refused, November draft→post
  refused. **Zero** new November economics: the charge count stays at 2 and the posted total stays
  107,500. No automatic December correction was created.
- **December continued independently** and only became closed when its own boundary was reached.
- **Accounting is independent**: the two closes share no column, table or service.
- **The database refuses a reopen** on its own, independently of the service.

---

## Phase 23 — ten plants, each red then green

| plant | result |
|---|---|
| closed period accepts a new charge | RED |
| draft posts into a closed period | RED |
| post guard blinded by a dropped select column | RED |
| close ignores snapshotted bounds | RED |
| duplicate close rewrites `closed_at` (both layers defeated) | RED |
| transition not conditional on still being open | RED |
| system close fabricates `closed_by` | RED |
| automatic close claims operator authorship | RED |
| automatic close ignores the boundary | RED |
| tenantless occurrence closes periods | RED |

Each disables real production code, never a test. Restored: green.

---

## Phase 24 — regression

| gate | result |
|---|---|
| typecheck | PASS |
| typecheck:tests | PASS |
| `test:financials-economic-writers` | **65 suites / 819 tests** — the three new suites added to the required manifest |
| S1/S2 billing-period suites | 45 PASS |
| scheduled work | 79 PASS / 20 skipped |
| Payments, Autopay, responsibility, prepaid/held | 571 PASS |
| migration guards | PASS |
| access/RLS | no attributable red |
| prebuild | PASS once the new modules are committed (the import gate correctly refused them untracked) |

**Attributable red: zero.** Four `tests/dataModel/` failures (Data Model UI / Operational
Calculations) reproduce **identically at base** — confirmed by reverting my changed files and
re-running.

---

## Phase 22 — why the real clock has not certified yet

The chain is built and registered. What is missing is a boundary for it to find:

1. the handler must be **deployed** — this candidate is not merged yet;
2. the migration must be **applied** to staging;
3. an **elapsed OPEN canonical period** must exist on the deployed estate. Every deployed canonical
   period is dated 2026-11 or later, and today is 2026-10-03. **Nothing has elapsed**, so the clock
   would wake, find nothing, and complete as a healthy no-op — which proves the chain runs but not a
   close transition.

Creating an elapsed period means writing a charge dated in the past on a synthetic fixture, which is
a money write into the deployed estate — refused by this session's real-world-transaction guard, the
same block carried as evidence debt from the previous run. Not worked around.

So the terminal proof waits on a real boundary, exactly as Phase 22 anticipates. Nothing is faked and
no occurrence was manufactured.

---

## Phase 21 / Phase 25 — untouched

`29944d3e` keeps legacy monthly history and an explicit biweekly canonical future; its periods close
on its own explicit calendar. `50b19065` remains unconfigured and was **not** used for close
certification. W7 remains paused; Kelly's testimony is untouched; no QA rewrite, no PASS, no
advancement.

## Hard boundary

Stopped before S5. No prospective corrections, no Adjustment UX, no statements or invoices.
