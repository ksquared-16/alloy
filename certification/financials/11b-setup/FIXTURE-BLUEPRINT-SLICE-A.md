---
title: Slice A fixture — what to keep, what is residue
status: fixture
recorded: 2026-09-20
---

# KEEP — configuration, rebuild for Human QA

**A site-scoped weekly tuition rate on the North Campus school-age variant.**

| field | value |
|---|---|
| route | `POST /api/admin/commercial/tuition-rates` |
| variant | `ee157cff-3546-4172-b591-984b96fbec10` (school_age / custom attendance) |
| location | `1a5644a7-45c4-413b-9021-5f556118b6e2` |
| cadence | `weekly` · payer `private_pay` |
| amount | `19500` ($195.00) |
| effective | from `2026-09-01`, open-ended |
| id created | `424c7a8a-5bd5-4c63-93f6-5591dc0afcd8` |

**Why it is legitimate, not test scaffolding.** The resolver's own doctrine is that a
location-scoped rate beats the org default. The organisation keeps its $185.00/weekly school-age
default; this campus prices the same variant, payer and cadence differently. Both are effective on
the assignment's own `asOf`, and neither would normally be rejected — the site rate wins the
narrowing and the org default remains `applicable`.

**What it gives a tester.** One recommendation and one genuine alternative, which is the only
configuration in which Expand options, Override, and the governed reason can be exercised at all.
Without it Certa has exactly one applicable option and the whole override path is unreachable.

Rebuild this rate for Human QA. It is the fixture the scenario needs, not residue.

# RESIDUE — certification transactions, do not rebuild

- `enrollment_pricing_terms` rows for Certa created during this run: term `5e4c3bfe…`
  (`overridden`, $185.00/weekly, reason "Family kept the organisation rate agreed at enrolment.")
  superseding `19baf6ca…`. A Human-QA walkthrough should reach its own override rather than
  inherit this one.
- The responsibility arrangement `fbe49182…` ($33.00, from 2026-09-20) written by the earlier
  responsibility slice.

# CONSEQUENCE TO EXPECT WHEN REBUILDING

Authoring the site rate moves the resolution key (measured: `2f92ec30` → `9ae3fec2`), so any
standing accepted term immediately reads `acceptedIsStale: true` and the Assignment surface shows
**Tuition needs review**. That is correct behaviour and is itself the review fixture — a tester
gets the review state for free, and resolving it is the walkthrough.
