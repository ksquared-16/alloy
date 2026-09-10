---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 05 — Mutation, commands, provenance (Phases M, N, O)

## M. Are registered Operational Commands the substrate? — **Yes**

**Ratified: registered Alloy Operational Commands are the canonical internal
mutation substrate for public operational mutations.**

Evidence supporting the presumption:

- `commandRuntimeExecutionGate.ts:20` makes `registered_action` the **only**
  capability owner enabled for facade execution; every other owner is `false`.
  The substrate already has a defended external-facing boundary shape.
- Registered actions converge onto domain authority rather than reproducing it —
  the eight `attendance.*` actions all reach the one RPC that owns ingestion.
- Thread 3 labelled five domains `CANONICAL_COMMAND_CANDIDATE` on exactly this
  basis.

**One material qualification, and it is not a reason to reject the substrate.**
The command runtime performs *no* authorization: `commandRuntimeTypes.ts:165`
types `authorizationEvaluated: false` as a literal and
`executeCommandInvocation.ts:300` fails any invocation claiming otherwise.
`runRegisteredAction` has no principal check.

That seam is **closed deliberately**, not broken. So:

> **The External Contract Adapter is the authorization boundary for public
> command invocation.** It resolves and enforces effective authority (§03) before
> the runtime is entered, and it never asserts `authorizationEvaluated: true`.

This is honest about what the runtime is. It also means the adapter is
security-critical in a way the runtime is not, and must be tested as such.

### The invocation pipeline

```text
Public Operation  (stable published name)
        ↓
External Contract Adapter
    ├── application principal + installation      (§02)
    ├── tenant scope from the credential          (§02)
    ├── external scope ∩ resource boundary        (§03)
    ├── public operation allowlist
    ├── public input schema → internal command input
    ├── subject resolution (public id / external ref → internal subject)
    ├── idempotency key handling                  (§06)
    ├── provenance assignment                     (§O below)
    └── delegated actor (null in V1)
        ↓
Registered Alloy capability   (runRegisteredAction)
        ↓
Existing domain authority, invariants, triggers
        ↓
Canonical truth  +  durable audit                 (§06)
```

### The allowlist law

> **No internal action key is ever exposed automatically.** A public operation is
> a deliberately published contract with its own stable name, its own schema, and
> its own version.

Public operation names are **not** internal capability keys. `attendance.check_in`
as a public operation maps to an internal key today; if that key is renamed the
public name does not change. Publishing internal keys directly would make every
internal refactor a partner-visible breaking change — the same coupling §03
rejects for scopes.

V1 publishes exactly one operation:

| Public operation | Internal capability | Scope |
|---|---|---|
| `attendance.record_event` | the `attendance.*` registered actions | `attendance.write` |

### Preview

Where a registered action supports an eligibility preview, the adapter exposes it
as a **separate, non-mutating** operation. Preview is never a side effect of a
write, and a successful preview is **never** a promise that the write will
succeed — eligibility is re-evaluated inside the command, where it belongs.

## N. Resource write vs command — the ratified rule

> **A `PATCH` is permitted only for a bounded field correction with no
> operational consequence. Everything else is a command.**

A command is **required** when the intent carries any of: eligibility;
workflow consequences; state-machine meaning; financial consequence;
notifications; process outcomes; placement effects; significant audit semantics;
or domain invariants beyond field validation.

| Correct | Wrong |
|---|---|
| `PATCH /v1/people/{id}` for a spelling correction | — |
| `POST /v1/enrollment-participations/{id}/commands/withdraw` | `PATCH status = "withdrawn"` |
| `POST /v1/attendance/events` | `PATCH` on an attendance row |

Both failure modes are real and both are rejected:

- **Everything as CRUD** publishes the database and lets a partner drive a state
  machine by assigning to a column. Thread 3 found the internal estate already
  suffers this — `opportunities.status_key` has nine writers, one of which
  bypasses transition rules entirely.
- **Everything as a command** turns a typo fix into a ceremony and pushes
  partners toward whatever unversioned path is easier.

**Test to apply:** *if this field changed, would anything other than the field
change?* If yes — an event, a notification, an eligibility recomputation, a
balance — it is a command.

Attendance is the sharp case: a fact is **append-only by database trigger for all
roles including `service_role`**. A correction is a new fact with lineage. No
`PATCH` on attendance can exist, and the platform must not imply one could.

## O. Provenance — ratified

> ## **Provenance is not authorization.**

An external caller must never gain authority, trust, or a different code path by
submitting a trusted-looking source string. This is the law most likely to be
violated by a well-meaning implementation, because provenance fields *look* like
metadata.

### The six independent dimensions

```text
authenticated application     installation
delegated actor               request origin
integration provenance        source record reference
```

Each is recorded separately. Collapsing any two destroys the ability to answer a
real question later — most obviously "did a human do this, or did their app?"

### Who may set what

| Field | Control | Rule |
|---|---|---|
| `application_id`, `installation_id` | **Server assigned** | From the resolved principal. Never read from the request. |
| `origin` | **Server assigned** | Always `api` for this surface. |
| `source_type` / provenance channel | **Derived from installation metadata** | The principal *is* an integration, so the platform assigns `integration_api`. |
| `producer_key` / `source_key` | **Derived from the installation** | Durable producer identity, exactly as a kiosk device's producer key is read from its row. |
| `delegated_actor_id` | **Server assigned** | `null` in V1. |
| `external_id` / source record reference | **Caller supplied, bounded** | Free text, but namespaced to the installation and stored only in `integration_resource_refs` or a bounded metadata field. Never interpreted as identity or authority. |

### The `integration_api` finding, preserved and honoured

Thread 3 established that `integration_api` is a fully modeled attendance
provenance channel — resolver entry with `requiresUser: false`, present in the
database `CHECK` constraint, covered by tests — **with no production producer**,
and it corrected an earlier claim that it "fails open by silently remapping
provenance". It does not: the resolver is fail-closed and `integration_api` is
**unreachable from a request body**.

**V1 must preserve that unreachability.** The Developer Platform becomes the
first producer of `integration_api` — but it produces it because the *principal*
is an integration, resolved server-side from the credential. It does **not**
become reachable by submitting it.

> The semantic decision for external attendance provenance already exists in the
> codebase. Thread 4 supplies the missing principal, not a new channel.

### Impersonation is structurally prevented

Because `producer_key` is read from the installation row rather than accepted
from the request, one application cannot author facts attributed to another. This
is the same defence, for the same reason, that `kioskDeviceAuthority` states:
*"a kiosk request cannot name the tenant it wants to be."* Here it extends to:
**an application cannot name the producer it wants to be.**
