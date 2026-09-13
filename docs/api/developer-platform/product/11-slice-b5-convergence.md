---
owner: platform
status: canonical
last_reviewed: 2026-09-11
supersedes: []
---

# 11 — Slice B.5 Gate 1: integration convergence

**Status: PARTIAL.** Gate 1 is built and certified as far as this lane can prove.
Gate 2 (the Integrations UI) was not begun, and one Gate 1 step was deliberately
left for a slotted lane. Both reasons are below.

## Execution environment

`ALLOY_WORKTREE_SLOT` is **unset**. The instruction is explicit: *"If unslotted,
stop before UI implementation and report PARTIAL/BLOCKED."* So Gate 1 ran and
Gate 2 did not.

## 1. Attendance producer audit

| Concern | Attendance implementation | Developer Platform equivalent | Same semantics? | Convergence action |
|---|---|---|---|---|
| External identity | `attendance_integration_producers` | `developer_applications` + `app_installations` | Different — producer conflates application and installation | **Platform owns** |
| Credential | `credential_hash`, SHA-256, selected on | `app_credentials`, same shape **plus bounded rotation overlap** | Same lookup, **producer has no rotation** (its own header says so) | **Platform owns** |
| Site boundary | `attendance_integration_producer_sites` | `app_installations.boundary_mode` + `location_boundary` | Equivalent; platform also expresses org-wide | **Platform owns** |
| External-ID correlation | `attendance_integration_mappings` | *(nothing — Thread 4 ratified it, nobody built it)* | Attendance filled a real vacuum | **Platform owns** via `integration_resource_refs` |
| Non-human authority | resolves `NonHumanProducerAuthority` | now derives the same type | **Same** — the good news | Keep; derive from principal |
| Attendance facts | `record_child_attendance_event` | none, and must never have one | — | **Attendance owns** |
| Idempotency, corrections, provenance | Attendance | none | — | **Attendance owns** |
| API exposure | **none — library only, no route** | `/api/v1` | — | Convergence is cheap |

**The single most important audit finding: the producer path has no HTTP route.**
Its only consumers are `ingestExternalAttendanceEvent` and three *live* tests. It
is a domain capability, not a competing external surface, so convergence costs
one function signature rather than a deprecation cycle.

## 2. Ownership classification

**GENERIC_PLATFORM_OWNED** — application identity, installation identity,
credentials and their lifecycle, resource boundary, external references.

**ATTENDANCE_DOMAIN_OWNED** — attendance validation, facts, corrections,
source-event semantics, domain provenance, canonical mutation authority. None of
this moved, and none of it should.

**COMPATIBILITY_ONLY** — `attendance_integration_producers`,
`attendance_integration_producer_sites`, `attendance_integration_mappings`, each
now carrying a `COMMENT ON TABLE` naming its successor, its temporary-bridge
status and its **removal trigger**. The disposition lives in the schema, not only
in this document.

**RETIRE** — nothing yet, deliberately. Retiring a table whose guarding tests
cannot run in this lane would be removal without proof.

## 3. Convergence architecture

```text
Developer Application
  → Installation            ← the tenant-authority root, unchanged since B.1
      → credential            (with rotation, which the producer registry lacks)
      → external scopes       attendance.write
      → resource boundary     org_wide | locations
      → integration_resource_refs
      → Application Principal
          → attendanceAuthorityForPrincipal
              → NonHumanProducerAuthority
                  → assertNonHumanCaptureAllowed
                      → canonical Attendance authority
```

**One authority derives from the other, one-way.** The platform owns *who a
producer is*; Attendance owns *what it may author*. The adapter translates and
grants nothing the installation does not already hold.

**`producer_key` was already there.** `app_installations` has carried it since
B.1, so provenance survives credential rotation without a new column — the same
law the kiosk and producer registries both state.

### The property worth stating

`attendanceAuthorityForPrincipal` resolves its sites by calling
`list_external_locations` — **the same boundary-enforced query that backs
`GET /api/v1/locations`**. So attendance authority can never reach a site the
read surface would hide from the same installation. That is not a coincidence to
maintain; it is one query with one boundary, certified by test.

## 4–6. Credential, boundary, correlation

Credential and boundary convergence are **decided and expressible**: every
property the producer registry carried is carried by the installation model, plus
rotation, which the producer registry explicitly lacks.

`integration_resource_refs` is **built** (`20260911150000`) — installation-scoped,
domain `resource_type` rather than a physical table name, active-row partial
unique indexes in both directions so a relink is a deliberate transition, and
`orphaned` retained so a reinstall reconciles rather than duplicating. The
migration **backfills** from `attendance_integration_mappings`, joining on the
producer's durable `producer_key`; a mapping whose producer has no installation is
**left where it is rather than guessed at**.

## 7. What was deliberately NOT done, and why

**`ingestExternalAttendanceEvent` was not rewired.**

The rewire is designed and small: stop resolving a credential inside the domain
adapter and accept an already-resolved authority instead. Its regression suite is
`tests/childcareOperational/attendance/live/*` — **live tests requiring the
certification database and a slot.**

Rewiring production attendance ingestion while the tests that guard it cannot run
would be shipping the irreversible half of a convergence unverified. Gate 1's own
exit requires regression certification to pass, and for this path that
certification *is* the live suite.

So the seam is specified and the first slotted run does it, with the live suite as
its gate.

## 8. Principal convergence — settled

`ApplicationPrincipal → attendanceAuthorityForPrincipal → NonHumanProducerAuthority`.
One direction. `resolveIntegrationProducer` becomes a bridge with a removal
trigger, not a second authority.

## 9. Certification performed

21 tests in `web/tests/platform/external/convergenceCertification.test.ts`:

- correlation resolves, and **installation namespaces stay separate** — the same
  external id in two installations resolves to two different children
- unmapped fails closed; disabled does not resolve; **ambiguous is refused rather
  than guessed**, even though the database already forbids it
- cross-organization lookup refused; resource types never confused
- `attendance.write` → `attendance.record`; a read scope maps to nothing; an
  **internal key presented as a scope grants nothing**
- boundary → sites for restricted, org-wide, and empty; empty yields **no
  authority at all**
- authority **cannot exceed what the same installation could read**
- no scope, no attendance permission

**Not performed:** the live Attendance regression (needs a slot).

## Gate 1 exit assessment — honest

| Requirement | State |
|---|---|
| One credential system owns integration identity | **Decided and built**; producer table bridged with a removal trigger |
| One boundary system owns access | **Decided and built** |
| One external-ref system owns correlation | **Built and certified** |
| Attendance still owns facts/corrections | **Yes — untouched** |
| Regression certification passes | **Unit: yes. Live: not runnable here** |

Gate 1 is therefore **substantially met but not fully certified**, which is why
this slice is PARTIAL and why Gate 2 did not begin even setting the slot aside.

## Remaining generic gaps

| # | Gap |
|---|---|
| G-14 | **Reduced, not closed.** The model is converged; the legacy tables remain as bridges until the ingestion rewire and per-org conversion land. |
| G-15 | **Closed** — `integration_resource_refs` exists and is canonical. |
| G-16 | No deletion feed, unchanged. |
| G-17 | **New.** `attendance.write` is in the catalog with no public route, by instruction. The catalog can now describe a capability the API does not expose — acceptable here, but it means catalog membership is not evidence of a live endpoint. |

## Remaining mutation blockers

SEC-0c · SEC-0 (gated on D-3) · generic idempotency layer · approved first
mutation contract. **Unchanged.** `attendance.write` existing in the catalog does
not change any of them, and no public mutation was added.

## Classroom Coach

Untouched. No adapter, no provider client, no seeded Application, no placeholder.
**D-1 remains unanswered.**

## Recommended next slice

1. **In a slotted lane**, rewire `ingestExternalAttendanceEvent` to accept
   resolved authority, and re-run the live Attendance suite as its gate.
2. Convert existing producers to installations; when none remain, retire the three
   bridge tables against their recorded triggers.
3. **Then** Gate 2 — the Integrations UI — over a model that is finally single.

Building the UI before step 2 would mean building it over a model still absorbing
a second system, which is the mistake B.4 warned about.
