---
owner: platform
status: canonical
last_reviewed: 2026-09-13
supersedes: []
---

# 13 — Slice B.6: the ingestion rewire, executed and certified

Supersedes the block recorded in [12](12-slice-b6-blocked.md), which was a
measurement error rather than an environment. This is what the slotted run was
supposed to do, and what it did.

## What the rewire is

`ingestExternalAttendanceEvent` no longer accepts a credential and no longer
resolves a producer for itself. It takes an author the caller already proved:

```
application principal → attendanceAuthorForPrincipal → AttendanceIngestAuthor → ingest
```

Attendance used to answer "who may author this" by reading
`attendance_integration_producers` while the Developer Platform answered the same
question from an application, an installation and a credential. Two independent
authorities for one question was G-14. There is now one, and the direction is
one-way: the installation IS the authority, and `producer_key` carries provenance
onto the canonical fact exactly as a legacy producer's did.

Correlation moved with it: `integration_resource_refs` owns external-identity
correlation; `attendance_integration_mappings` is a read-only bridge.

The credential path was removed rather than deprecated, on evidence: a governed
census of the deployed primary returned zero legacy producers. A dormant
credential path is still a credential path.

## What this slice does NOT do

Producer→installation conversion and bridge retirement are the next slice. No
bridge table is dropped here. The recorded removal triggers are unchanged.

## Certification

Certified against the `alloy-cert` topology — Kong `127.0.0.1:54421`, Postgres
`127.0.0.1:54422` — from slot 8, port 3018. Each live file run alone: two live
files in one Vitest run destroy each other's tenant.

| Suite | Tests | Result |
|---|---|---|
| `assignedScopeAuthority.live` | 18 | PASS |
| `crossChannelConvergence.live` | 8 | PASS |
| `doorAccessNegative.live` | 5 | PASS |
| `parentTokenizedIntent.live` | 18 | PASS |
| `developerPlatformIngestion.live` | 19 | PASS |
| **Live total** | **68** | **68 pass · 0 fail · 0 skip** |

Thread 5 headless: 8 files, 151 tests, all passing.

### The count is 68, not 70, and that is the whole story

Staging's gate was 70, of which 21 belonged to
`externalProducerIngestion.live.test.ts` — a suite that exercised the credential
and mapping path this slice retires. It was deleted with that path.

Deleting it also deleted the only proof of an invariant that is **Attendance's,
not the identity model's**: that an external author may not author attendance for
an **adult**. The guard never went anywhere — `resolveChildMemberEligibility`
still runs on every ingestion — but nothing proved it any more, and a guard no
test binds is a guard waiting to be refactored away.

So four scenarios were ported onto the converged path rather than left to lapse:

- **M1** — a reference to a legitimate child still commits (the positive control,
  without which M2 proves only that *something* refused).
- **M2** — a reference that resolves to an ADULT authors no attendance
  (`member_not_a_child`), and no ledger row exists for that member.
- **M2** — the installation's own `resource_type: "child"` claim changes nothing.
  An installation does not get to describe Alloy's subjects.
- **M5** — a reference REPOINTED at an adult stops working. A guard applied only
  at reference-creation time would miss this; this one runs on every ingestion.

Two further Attendance-owned invariants were ported for the same reason:

- the same event id carrying a different payload fingerprint **conflicts**
  (`payload_conflict`) and authors nothing, while the committed fact keeps its
  `applied` disposition — demoting it would orphan every correction that already
  named that provider event;
- a correction naming an original this installation never committed is refused
  (`unknown_correction_target`).

**These were proved binding, not merely green.** With the subject-validity guard
disabled in the seam, exactly M2 and M5 fail and nothing else does. With
fingerprint comparison disabled, exactly the conflict scenario fails. Before this
change, both defects passed the entire suite unnoticed.

What was *not* ported is the credential-and-mapping machinery itself — wrong
secret, disabled mapping, mapping borrowed across producers. Those describe a
model that no longer exists. An unresolvable principal is now refused at the
request boundary and never reaches ingestion, so "a credential we do not
recognise tried to author attendance" is a fact the boundary records, not this
inbox.

## Bridge disposition

**BRIDGE_RETIREMENT_READY**, with one precondition recorded below.

| Evidence | Measurement |
|---|---|
| Deployed primary, 2026-09-11 (`tha_48371a66661a9e`) | every measure **0** |
| Deployed primary, 2026-09-13 (`tha_51fdfde3610cfc`) | every measure **0** |
| Certification database | 0 producers, 1 installation |
| Code readers of the three tables | **none** — the two remaining mentions are comments |
| Dependent views | none |

Two independent governed censuses of the same target, two days apart, agree:
zero producers, zero sites, zero mappings, zero events authored via a producer.
Nothing is left to converge, so the removal trigger is satisfied vacuously —
which is the strongest form it can take, not the weakest.

**Precondition for the retiring slice.** `attendance_integration_events` still
carries `producer_id` with a foreign key into `attendance_integration_producers`.
No row uses it (`events_via_producer = 0`), but the column and constraint must be
retired in the same change that drops the tables.
