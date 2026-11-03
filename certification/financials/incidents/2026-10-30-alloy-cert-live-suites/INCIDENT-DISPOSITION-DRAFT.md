# Incident disposition draft: Financials live suites on shared alloy-cert (2026-10-30)

Incident `req_1793375528498836_49075`, lane `lane_b77b3cbb5840`. **Draft for the operator.** Nothing in
this file is approved, and nothing here has been executed beyond the one census below.

## Census evidence

| field | value |
|---|---|
| request | `gar_7518908144d8d3` → trusted-host action `tha_4d389b4074b7b0`, run `erun2_88e78dcc85a97799` |
| approval | operator approved 2026-10-31T12:55:03Z (grant `grnt_790405eaabb34019`), executed once |
| query | file `dd5dd815…a421`, executed SQL `31ce283d…ab45`, 27/27 answered, `complete: true` |
| target | `alloy-cert@127.0.0.1:54422`, class `shared_local_certification` |
| connection | attested target digest `9473d613…4b99`, compose project `alloy-cert` on 54422 |
| transaction | `read_only_rollback` (`BEGIN TRANSACTION READ ONLY … ROLLBACK`) |
| hold effect | none |

Receipt: `census-v2-execution-receipt-gar_7518908144d8d3.json`.

**Attestation boundary.** The connection check binds the final psql configuration and the Compose
project that publishes the port. It does not authenticate the server cryptographically.

## Counts and what they bound

The window is 15:52:11.391Z–15:52:32.859Z, org `00000000-0000-4000-8000-000000000001`.

| identity | before | during | after | other |
|---|---|---|---|---|
| tuition agreement `77000000-…00a1` (q01–03) | 0 | 0 | 0 | |
| tuition terms `…00b1`/`…00b2` (q04–06) | 0 | 0 | 0 | |
| tuition events, 2 exact keys (q07–09) | 0 | 0 | 0 | |
| their resolved obligations (q10–12) | 0 | 0 | 0 | |
| charges sourced from `77000000-…00a1` (q13–15) | 63 | 0 | 0 | non-draft any time (q16): 63 |
| spine agreement `fc500000-…0a0001` (q17/q18) | 1 | | | any time: 1 |
| spine household `fc500000-…0c0001` (q19) | | | | any time: 1 |
| spine charges (q20–22) | 7614 | 0 | 0 | |
| spine correction children / allocations during (q23/q24) | | 0 / 0 | | |
| spine household payments (q25/q26) | | 0 | 0 | |
| spine household periods during (q27) | | 0 | | |

What these counts establish, at census time only:

1. **Spine fixture.** The spine fixture is present: 1 agreement, 1 household and 7,614 charges, all
   created before the window. Nothing tied to those identities was created during or after the window.
   That fits the payment and correction suites failing at their first charge insert.
2. **Tuition rows from the window.** None remain: no agreement, terms, events, obligations or charges.
   That fits `beforeAll` inserting the agreement and the `afterAll` cleanup (no `CERT_KEEP`) removing it.
   The counts cannot tell "removed" apart from "never committed".
3. **Orphaned charges.** 63 charges reference the tuition agreement id as their `billable_source_id`.
   All 63 predate the window and none is a draft (q16 = q13 = 63, and q14 = q15 = 0). The agreement row
   itself is absent. These are non-draft charges from earlier runs that point at a source row which no
   longer exists. The cleanup deletes only drafts and that agreement, so the 63 surviving it is
   consistent with its code. When the agreement disappeared cannot be dated from counts.
4. **Not established:**
   - whether any pre-existing pricing terms, tuition consumption lineage or draft tuition charges in
     the org were deleted, by this run or earlier ones (the org-wide cleanup scope was deliberately
     not asked);
   - the payment suite's `live-<Date.now()>` rows;
   - the tuition household and assignment rows.

> **Counts cannot prove whether historical deletions occurred.** That needs a prior baseline or snapshot
> of alloy-cert, and none is held by this lane.

## Proposed disposition (operator decisions; none taken)

- **D1 — Close the census evidence step.** One approved census executed, 27/27 answered, read-only with
  rollback. No further live proof from this lane.
- **D2 — No restoration by this lane.** Without a baseline there is no exact specification of what to
  restore. The suites' cleanup is never replayed, and nothing is deleted to tidy up. That includes
  the 63 orphaned charges, which stay unless an owning lane specifies otherwise.
- **D3 — Record the orphaned charges.** Note the 63 non-draft charges pointing at the absent agreement
  `77000000-…00a1` as a known alloy-cert fixture state, for whichever lane owns the seed fixture.
  Only that lane decides whether alloy-cert should be re-seeded.
- **D4 — Prevention already on candidate `061e164b5`.** `liveSuiteAuthority` excludes every live suite
  before import, and only the governed isolated binding admits its one pinned suite.
- **D5 — Hold.** The Financials LIVE HOLD and the shared alloy-cert hold stay until the operator lifts
  them. This lane does not lift them.
- **D6 — Withdraw the v1 census registration** (`6a3a03bd…26aa`) in favour of v2, through its contract
  owner `OPWORK_25AD3858DE4D_SPRINT_A741F0C6D2E9`.
