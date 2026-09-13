---
owner: platform
status: canonical
last_reviewed: 2026-09-13
supersedes: []
---

# 14 — Slice B.7: the producer model is gone

The convergence that began in B.5 and became real in B.6 is finished. External
attendance integration has one identity model, one authority path, one
correlation owner, and no bridge.

## The active model, and the only one

```
application principal
  → attendanceAuthorForPrincipal
    → AttendanceIngestAuthor          (resolved; no credential, no producer lookup)
      → ingestExternalAttendanceEvent
        → canonical Attendance fact
          … correlated through integration_resource_refs
```

`app_installations` is the authority. `app_credentials` holds the credential, with
rotation the producer table never had. `integration_resource_refs` owns
external-identity correlation. `attendance_integration_events.installation_id` is
the sole author of an inbound event.

Attendance still owns facts and corrections. None of that moved, and none of it
should have.

## What was retired, in order

| Step | Result |
|---|---|
| `attendance_integration_events.producer_id` + FK | dropped — `20260913160000` |
| `producerAdministration.ts` | deleted |
| `app/api/admin/attendance/producers` (3 routes) | deleted |
| The operator screen over them | deleted |
| Retirement-lock compatibility allowlist | removed |
| `attendance_integration_producers` | dropped — `20260913161000` |
| `attendance_integration_producer_sites` | dropped — `20260913161000` |
| `attendance_integration_mappings` | dropped — `20260913161000` |

Two tenancy trigger functions went with the tables they guarded; each was used by
exactly one of them and by nothing else.

## Why deletion rather than dormancy

Two governed censuses of `alloy_deployed_primary` — 2026-09-11
(`tha_48371a66661a9e`) and 2026-09-13 (`tha_51fdfde3610cfc`), same target
fingerprint — each returned zero producers, zero producer sites, zero mappings
and zero producer-attributed events.

So the recorded removal trigger, "all rows converged to installations", is
satisfied vacuously. That is the strongest form it can take rather than the
weakest: there was never a row to convert, which is also why **no
producer→installation migration flow was built**. A conversion tool for an empty
set is fiction with a progress bar.

A nullable column with a live foreign key is not inert. It kept the producer
table undroppable, kept a second author identity in the shape so a future writer
could "just set `producer_id`", and made a two-author CHECK read like a live rule
when only one column could ever be populated. An empty runtime table with zero
authority is an invitation, not an archive.

## What replaced the guarantees that were removed

- The two-author CHECK became a tautology with one author column, so it was
  dropped rather than left looking like a rule.
- `uq_integration_event_unattributed` was restated, not deleted: its predicate
  named both author columns, and the same guarantee in terms of the surviving one
  is `WHERE installation_id IS NULL`. An event nobody could attribute is still
  recorded exactly once.
- The dropped foreign key used to make a bad `producer_id` write fail loudly. A
  repository lock replaces it: no production module may write `producer_id`.
- The `unattributed` disposition stays in the CHECK vocabulary. The current seam
  cannot produce it, but rows that already carry it are history.

## The retirement lock has no exceptions now

It briefly carried a four-path allowlist, because Attendance Thread 8 shipped an
operator surface over these tables while this thread retired their authority, and
neither side deserved to be deleted to make the other pass. That surface is gone,
so the exception is gone with it. The lock now forbids every production read and
write of the three table names, with no carve-out, and additionally forbids
writing `producer_id`.

## Certification

Live Attendance gate, each file run alone against Kong 54421:

| Suite | Tests | Result |
|---|---|---|
| `assignedScopeAuthority.live` | 18 | PASS |
| `crossChannelConvergence.live` | 8 | PASS |
| `doorAccessNegative.live` | 5 | PASS |
| `parentTokenizedIntent.live` | 18 | PASS |
| `developerPlatformIngestion.live` | 20 | PASS |
| **Total** | **69** | **69 pass · 0 fail · 0 skip** |

69 rather than 68: the assertion that `producer_id` came back NULL was replaced
by one that selecting it is now an error, and a test that the event ledger has no
producer author column left to write was added. Headless: 10 files, 179 tests.
`typecheck` and `typecheck:tests` both `rc=0`.

One live test failed first and was right to: it still selected `producer_id`, and
PostgREST refuses the whole request rather than returning null, so the row came
back undefined. The schema was correct and the test was stale.

## G-14

**Closed.** Not reduced — closed. There is one authority for "who may author this
external attendance event", and no table, column, route, module or screen through
which the retired one could return.

## What is next

Gate 2 — the Integrations UI — over a model that is finally single. That was
always the condition B.5 set, and it is now met.
