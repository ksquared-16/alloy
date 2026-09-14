---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 05 — Classroom Coach discovery (Slice A, Parts 5, 6, 7)

**Discovery only.** No connector designed, nothing implemented.

## Headline finding

> **No Classroom Coach technical capability could be established, and the
> integration direction Threads 3 and 4 assumed is not supported by any evidence
> about what Classroom Coach does.**

This meets the stop condition *"Classroom Coach API capability cannot be
established."* Per Slice A, that blocks the provider half only and explicitly
does not block Developer Platform productization. The two are reported
separately.

## Evidence register

### Source 1 — repository (exhaustive)

13 matches for `classroom.coach` across `origin/staging`. **Eleven are Alloy's
own documents describing Classroom Coach as unknown.** The only two code
references are the same string literal in one test:

```ts
// web/tests/childcareOperational/attendance/attendanceProvenance.test.ts:80,84
producerKey: "classroom-coach-prod",
```

There is no client, no configuration, no adapter, no endpoint reference, no
credential, and no schema anywhere in the repository.

**Assessment: that literal is an illustrative fixture, not a validated
requirement.** It demonstrates that the provenance resolver accepts *a* producer
key. It is not evidence that Classroom Coach produces attendance, and Thread 3
was right to record it as "two hits, both the same string literal in one test
file."

### Source 2 — existing Alloy integration code

None relevant. `org_provider_credential_*` is generic outbound-credential
infrastructure, not Classroom Coach-specific.

### Source 3 — supplied partner material

**None was supplied to this lane.**

### Source 4/5 — sanctioned external research

The product exists: **Classroom Coach AI**, `classroom-coach.com`, "AI for Early
Education".

Publicly documented product surface: lesson-plan generation, activity ideas,
incident documentation, real-time teacher coaching ("Ask Coach"), an
administrator dashboard over staff AI interactions, and trend analytics across
themes such as behaviour management and family communication.

Publicly documented data domain: incident reports, lesson plans, staff
AI-interaction logs, behavioural/classroom trend data, family-communication
references.

**No public API, developer portal, webhook documentation, data export, SSO, or
integration listing was discoverable.** A `/privacy` path returned 404. Searches
for integrations with the major childcare platforms (Procare, Brightwheel,
LineLeader) returned nothing connecting Classroom Coach to any of them.

> **Caveat, stated because it governs every classification below:** a vendor's
> marketing site being silent about an API is **not** authoritative evidence that
> no API exists. Partner/private APIs routinely go undocumented publicly. Almost
> everything below is therefore `UNKNOWN` rather than `VERIFIED_UNSUPPORTED`.

## Capability inventory

| Capability | Classification |
|---|---|
| Public API documentation exists | **VERIFIED_UNSUPPORTED** — for *public documentation* specifically; searched and absent |
| Authentication / API model | UNKNOWN |
| Tenant / account model | UNKNOWN |
| Locations | UNKNOWN |
| Classrooms | UNKNOWN |
| Staff | UNKNOWN |
| Children / students | UNKNOWN |
| Guardians | UNKNOWN |
| Enrollment / status | UNKNOWN |
| Placement | UNKNOWN |
| Schedules | UNKNOWN |
| **Child attendance** | UNKNOWN — **and see the assumption challenge below** |
| Check-in / check-out | UNKNOWN |
| Room movement | UNKNOWN |
| Staff clocking | UNKNOWN |
| Messaging | UNKNOWN |
| Announcements | UNKNOWN |
| Documents | UNKNOWN |
| Photos / media | UNKNOWN |
| Billing | UNKNOWN |
| API endpoints | UNKNOWN |
| Webhooks / events | UNKNOWN |
| External IDs | UNKNOWN |
| Update timestamps | UNKNOWN |
| Pagination | UNKNOWN |
| Rate limits | UNKNOWN |
| Create/update capability | UNKNOWN |
| Deletion / archive semantics | UNKNOWN |
| SSO | UNKNOWN |
| Deep linking | UNKNOWN |

**VERIFIED_SUPPORTED: none.** Not one technical capability could be
authoritatively confirmed. **No capability has been invented** (exit criterion 8).

## The assumption this challenges

Threads 3 and 4 treated **attendance ingestion by Classroom Coach** as the
reference case — Thread 4 built its entire V1 around it and made
`POST /v1/attendance/events` the one published operation.

Classroom Coach's documented product domain contains **no attendance data**. It
is a teacher-support and AI-coaching product holding lesson plans, incident
reports and coaching interactions. Nothing discoverable suggests it captures
check-in/check-out.

Two possibilities, and the evidence does not separate them:

1. Classroom Coach is not an attendance source, and the assumed direction is
   simply wrong.
2. Classroom Coach has capabilities its public site does not describe.

Either way, **Thread 3's decision D-1 — is Classroom Coach inbound, outbound, or
both? — remains open, and is now the highest-value unanswered question in the
program.** Thread 3 flagged it as "cheap, and everything branches on it." It was
not answered, and Thread 4 proceeded on the assumed answer.

**This does not invalidate Thread 4.** Attendance remains the strongest authority
in the codebase and the best *technical* proving ground for the platform. What
changes is that attendance can no longer be justified as "what the partner
needs" — only as "the domain most ready to be externalized safely."

### A likelier shape, offered as hypothesis and not as a finding

If Classroom Coach consumes classroom context (children, rooms, staff) to
generate plans and document incidents, the integration is plausibly **Alloy
outbound or Classroom Coach reading Alloy** — the reverse of what Thread 4 built.
That would need `GET /v1/children`, `/v1/locations` (both already V1) and
possibly incident/document write-back (not specified). It would also need the
**outbound** credential half that `org_provider_credential_*` already provides
and Thread 4 never designed.

This is a hypothesis. It must be confirmed with the partner, not adopted.

## Part 6 — generic platform validation

> **Can the generic Developer Platform represent a Classroom Coach integration
> without provider-specific behaviour leaking into the platform?**

Assessed against the platform's structure rather than against unknown provider
behaviour:

| Concern | Verdict |
|---|---|
| Installation binding | **Holds.** Application × org, tenant from the credential. Provider-neutral. |
| Location boundaries | **Holds**, if Classroom Coach is location-scoped. Mapping provider locations → Alloy locations is adapter work, correctly. |
| External refs | **Holds.** `integration_resource_refs` is installation-scoped and keyed on domain resource types. |
| Child correlation | **Holds structurally**, untestable without provider identifiers. |
| Room/classroom correlation | **Gap.** Alloy rooms are `LATER`; classroom is likely a first-class Classroom Coach concept. |
| Canonical reads | **Holds** for children and locations. |
| Governed operations | **Holds** for attendance; unknown whether that is the needed operation. |
| Attendance ingestion | **Structurally sound, and possibly the wrong direction.** |
| Idempotency | **Holds.** |
| Provenance | **Holds.** `integration_api` + installation-derived producer key. |
| Reconciliation | **Partial.** `updated_since` polling exists in spec; nothing verifies a provider supports timestamps or pagination. |

**Conclusion: the generic platform is not redefined by Classroom Coach**
(exit criterion 9). No provider-specific concept needed to enter it. What the
exercise exposed is that the platform was validated against an *assumed* partner
shape, and the assumption is unconfirmed.

## Part 7 — installation concept

Bounded, and largely blocked. Using only what is verified:

```text
Classroom Coach  (Application, partner_managed)
  └── Installation
        Alloy organization         ✅ defined (Thread 4)
        Allowed Alloy locations    ✅ defined (Thread 4)
        Granted scopes             ✅ defined (Thread 4)
        Health                     ✅ defined (§03)
        ─────────────────────────────────────────
        Classroom Coach account    ❌ BLOCKED — no known account model
        CC location mapping        ❌ BLOCKED — no known location object
        Sync configuration         ❌ BLOCKED — no known syncable objects
        Direction (in/out/both)    ❌ BLOCKED — D-1 unanswered
```

**What can realistically happen after "Connect" today: nothing.** There is no
known endpoint to call, no known credential to present, and no known object to
map. A Connect button would be a control that cannot complete its own action.

**Recommendation: do not ship a Classroom Coach entry until D-1 is answered.**
Shipping a provider tile that cannot connect trains operators to distrust the
Integrations surface on its first impression, which is expensive to undo.

The generic Integrations collection can ship without it. It has value with
tenant-private applications alone.
