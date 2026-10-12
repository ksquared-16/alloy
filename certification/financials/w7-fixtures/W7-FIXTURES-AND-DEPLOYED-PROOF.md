# W7-F011 / W7-F012 — fixtures seeded, deployed proof, and what is still open

Deployed build: `cf55dcf987aa2c735fd34eed0e48777909bd924c` (PR #1429), `/api/build-info` confirmed
2026-10-12 19:29 UTC. Follow-up PR #1430 (standing responsibility in Add Charge) — see §4.

## 1. Seed

`environment.execute_registered_reconciliation` `seed_financials_demo_tenant`, staging, request
`gar_e5e58ecb490c77`, `expected_repo_head` = `cf55dcf98`. Canonical root `/Users/vacilando/Alloy` was
verified first: branch `staging`, HEAD `cf55dcf98` (0/0 vs origin/staging), no tracked changes,
fixture sha256 `9a788543…222be` identical to the merged tree.

Runner diagnostic: `legacy demo households already present: left untouched` · `INSERT 0 5 · 0 6 ·
0 8 · 0 8 · 0 6 · 0 5 · 0 7 · 0 1` · `w7_fixture: converged`. No legacy teardown ran.

## 2. The five households, read back from the deployed primary

Census `w7-household-census.sql` (`gar_bec51148297b9d`):

| Household | Children · campus | Adults | Standing responsibility | Account override | Charges / payments / journal |
|---|---|---|---|---|---|
| W7 QA · Monthly Family | Milo Monthly · North | Mara Monthly | Mara 100% | none | 0 / 0 / 0 |
| W7 QA · Weekly Family | Willa Weekly · South | Wes Weekly | Wes 100% | none | 0 / 0 / 0 |
| W7 QA · West Family | Wyatt Westbrook · West | Wren Westbrook | Wren 100% | none | 0 / 0 / 0 |
| W7 QA · Multi-Site Family | Mika · North, Max · South | Morgan, Sam Multisite | 50 / 50 | monthly account calendar | 0 / 0 / 0 |
| W7 QA · Split Family | Sasha Split · North | Dana, Rosa (parents), Gale (guardian) | Dana 50 / Rosa 50 — Gale eligible, not responsible | none | 0 / 0 / 0 |

Campus calendars: North monthly · South weekly anchored Wed 2026-01-07 · West weekly anchored Mon
2026-01-05. Org default monthly from 2026-10-08. Legacy Alvarez still present (16 charges, 17
payments, 50 journal entries — untouched).

## 3. Deployed UI proof (QA session `gar_a8b98ab638f0af`, cf55dcf98)

Policies — `/settings/organization/financials?chapter=policies`: org default one row of four
("Monthly · 1st–last day · 7 days before period · 1st day of period · None"), each with Edit ·
Schedule change · History; overrides one table, North "Monthly · 1st–last day", South "Weekly ·
Wed–Tue", West "Weekly · Mon–Sun", every other cell "Inherits"; no ISO date in the panel; no
pending or "no longer listed" location; history opens to "Current · Monthly · 1st → last day of each
month · From Oct 8, 2026". Screenshots: `deployed/policies-*.png`.

Add Charge — four cells at one top edge (Service date editable; Billing period, Invoice date, Due
date labelled derived / read-only). Recompute on Alvarez Household (demo), Field trip:

| Service date | Billing period | Invoice | Due | Posting |
|---|---|---|---|---|
| Nov 5, 2026 | November 2026 | Oct 25, 2026 | Nov 1, 2026 | Draft until Nov 1 |
| Oct 20, 2026 | October 2026 | Oct 20, 2026 | Oct 20, 2026 | Posts on confirm |
| Nov 18, 2026 | November 2026 | Oct 25, 2026 | Nov 1, 2026 | Draft until Nov 1 |

Commit parity (non-W7 household, by instruction): charge `5c9c0bf3-c3c8-43a9-95b3-97bf1090070b`,
committed at service date Nov 18, 2026, persisted as service 2026-11-18 · period 2026-11
(Nov 1–30) · billable_on 2026-10-25 · due 2026-11-01 · draft, allocations Dana $20 / Rosa $20 —
identical to the preview (`w7-parity-identity-mygrant-census.sql`, `gar_eaad8437178894`).

## 4. Found on deployed and repaired (PR #1430)

On W7 QA · Split Family (standing 50/50, no charges) Add Charge showed **no** Responsibility: the
control was gated on allocation payers, which exist only after a first charge. PR #1430 reads the
household arrangement while Add Charge is open and offers it from the standing shares.

**Proven on deployed `d580e590` (PR #1430 merge), 2026-10-12 19:55 UTC:** W7 QA · Split Family's Add
Charge reads `CHARGE APPLIES TO · Household · RESPONSIBILITY · Dana Split 50% · Rosa Split 50% ·
household responsibility · Change →`, four date cells unchanged, no execute call issued.
Screenshot `deployed/addcharge-w7split-responsibility-d580e59.png`.

## 5. Open — QA actor identity (blocker)

`w7-actor-link-census.sql`: **no** role-holding login in the staging organization has an active
`user_person_links` row — 11 logins, including the managed QA identities that created 73, 26 and 22
charges. The W7-F002 convergence that would link a managed QA login to a named QA Person
(`QA_PERSON_SOURCE = "alloy_qa_fixture"`) is in this repository's `scripts/local-dev`, but the
installed toolkit is now built from `ksquared-16/vacilando` (`20261012-ddebb3288369`), whose
`vac-qa-access-assign.mjs` does not contain it. Linking a login to a person is an access decision;
it is not made here.

## 6. Mygrant — recorded, not cleaned

See `MYGRANT-RESIDUE.md`.
