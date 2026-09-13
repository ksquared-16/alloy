---
owner: platform
status: canonical
last_reviewed: 2026-09-13
---

# Thread 5 ingestion rewire — promoted closeout

Run `erun_3172c173a6e54c42`. Verification only; no product change, no new PR.

## Governed action

`gar_c28a532b4b7ece` — `repository.merge_pull_request` — **complete, Succeeded**
(filed 15:18:56Z, settled 15:19:58Z). Trusted-host action `tha_2a8e82f9928ae6`
records `expected_head_sha` equal to the certified candidate, and checks
`required 3 / passing 3`, with `failing`, `pending`, `missingRequired` all empty.

## The chain

| | |
|---|---|
| Certified candidate | `3672fa0e538fff2f1cf1cade97e4700084437685` |
| PR | #894, base `staging` |
| Merge SHA | `b120b4c8c51361d73a49544f607af29ae32a0eb7` |
| Staging before merge | `52d0f3cffbd19ee396127f60ac958d9e6707765b` |
| Final `origin/staging` | `b120b4c8c51361d73a49544f607af29ae32a0eb7` |

Ancestry, each link measured rather than inferred:

- candidate is an ancestor of merge — **YES**
- merge is an ancestor of `origin/staging` — **YES**
- candidate is an ancestor of `origin/staging` — **YES**

The merge commit has exactly two parents, `52d0f3cff` and `3672fa0e5`: prior
staging and the certified candidate, and nothing else.

The promoted tree differs from the certified candidate in **0 files**. Staging
carries the tree that was certified, not a re-resolved variant.

## Promoted-tree verification, read from `origin/staging`

### A. Ingestion authority

`ingestExternalAttendanceEvent` takes exactly four parameters — `supabase`,
`providerKey`, `event`, `author: AttendanceIngestAuthor`. No credential is
accepted. `presentedCredential` survives only at line 123, inside the docstring
explaining why it was removed; a naive grep reports it as present, and reading
the signature is what settles it.

No legacy producer is resolved inside the seam: zero matches for
`resolveIntegrationProducer`, `hashProducerCredential`, or a read of
`attendance_integration_producers`. Author identity arrives through
`attendanceAuthorForPrincipal`. Correlation remains owned by
`integration_resource_refs`, reached through `attendanceIngestAuthor.ts` and
`platform/external/integrationResourceRefs.ts` — the seam delegates it rather
than naming the table, which is why a grep of the seam alone reads as absent.
The subject-validity guard `resolveChildMemberEligibility` is present.

### B. Restored Attendance invariants

`developerPlatformIngestion.live.test.ts` is present with 19 `it` blocks, and
every scenario restored during certification survives promotion: M1 positive
control, M2 adult reference, M2 the installation's own claim, M5 reference
repointed at an adult, payload conflict on a reused event id, and a correction
naming an original never committed. Codes asserted: `member_not_a_child` ×2,
`payload_conflict` ×2, `unknown_correction_target` ×1.

### C. Retirement lock

Present and **not broadened**. The allowlist holds exactly the four intended
Thread 8 administration paths, all exact — no directory prefix, no wildcard.
All three legacy tables remain under the lock, and both guards survive: the
stale-entry guard and the never-allowlist-the-seam guard.

### D. Route capabilities

Every term of the resolution contract holds in the promoted tree:

| Contract term | Result |
|---|---|
| Retain every staging entry | YES |
| Alter zero staging entries | YES |
| Add the 12 Thread 5 entries | 12/12 present, 12/12 byte-identical |
| Lose zero Thread 5 entries | YES |
| Retain staging ratchet 631 | 631 |

626 staging routes + 12 Thread 5 routes = 638 promoted routes. No non-route key
differs from staging.

### Unexpected-file check

98 files entered staging through PR #894: 79 added, 16 modified, 3 deleted.

The three deletions are exactly the retired legacy path — `externalMapping.ts`,
`producerAuthority.ts`, and `externalProducerIngestion.live.test.ts`.

Eight files fall outside the attendance-integration footprint; each traces to a
named Thread 5 candidate commit (the API inventory and OpenAPI contract, the
external request boundary, and Organization → Integrations). All are
Documentation/API work, which is this thread.

Attendance product code touched by the PR lies **only** under
`attendance/integration/`. No migration in the PR drops a bridge table or the
`producer_id` column.

### Re-certification against the promoted tree

Live Attendance gate, each file run alone: **68 pass · 0 fail · 0 skip** —
assignedScopeAuthority 18, crossChannelConvergence 8, doorAccessNegative 5,
parentTokenizedIntent 18, developerPlatformIngestion 19. Thread 5 headless:
**153 pass**.

## Bridge retirement — next slice, not this one

Disposition remains **BRIDGE_RETIREMENT_READY** on the evidence already
recorded: governed censuses `tha_48371a66661a9e` (09-11) and
`tha_51fdfde3610cfc` (09-13) against `alloy_deployed_primary`, same target
fingerprint, both zero across producers, producer sites, mappings and
producer-attributed events; certification database 0 producers / 1 installation;
no production code reads the tables; no dependent views.

Nothing was retired here. The next slice, in order:

1. Drop `attendance_integration_events.producer_id` and its foreign key.
2. Retire `producerAdministration.ts`.
3. Retire the three `app/api/admin/attendance/producers/**` routes.
4. Then drop `attendance_integration_producers`,
   `attendance_integration_producer_sites`, `attendance_integration_mappings`.
5. Preserve and verify installation authority and `integration_resource_refs`
   correlation.
6. Certify that no producer authority path survives.

Steps 2 and 3 also remove the reason the retirement lock carries an allowlist, so
that exception should disappear in the same change.

The Integrations UI remains deferred until the model is single.
