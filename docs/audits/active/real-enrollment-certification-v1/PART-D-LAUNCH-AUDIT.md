# Part D — why Process-driven Enrollment cannot be certified yet

**Recorded:** 2026-09-16, lane `lane_2cea84351d90`, against published revision **33** on the current branch.
**Verdict:** the old Part D is wrong, and the corrected Part D is not yet executable. Three findings.

## The two states Kelly saw, and what each one is

Measured on the Certopp Family Focus Panel, both visible at once:

| What is shown | Where | What it actually is |
|---|---|---|
| **New Lead** (case header), **Lead** (queue chip) | case | The **Business Process stage** of the family case. The case is in `lifecycle_wu_lead`. |
| **Enrolling** (chip beside Pathb Certopp) | child | The child's **enrollment disposition**, and the process rail places Pathb under the Enrolling column. |

These are not the same axis and must not be reconciled into one. The durable child record reports
`businessProcess.stageKey = null` and `status_key = null`; the child appears in no Enrolling queue —
searching the queues, Pathb is found only in **All**, inside a case whose stage is **Lead**
(Registration: absent, Enrolled children: absent).

So: the case has not reached Enrolling. The child carries an Enrolling disposition. The outstanding
work Alloy itself names is **"Pathb Certopp needs program & schedule"** — not paperwork.

## Finding 1 — the Enrolling stage has no actions at all

Revision 33, process `enrollment`, stage `enrolling`:

```json
requirements_v1: { "requirements": [ {
  "kind": "packet", "level": "required", "scope": "record",
  "timing": "stage_exit", "enforcement": "blocking",
  "requirement_id": "enrollment_packet",
  "packet_definition_id": "c03425c9-2b05-4847-8495-2b2713e36243" } ] }

action_catalog_v1: { "version": 1, "candidate_actions": [] }
```

The packet requirement is configured correctly and names exactly one packet — Enrollment Paperwork
2026–2027. **The authority for "the Process chooses the packet" exists and is right.**

But `candidate_actions` is empty, so there is no action for a "Send enrollment paperwork" button to
BE. This is configuration, not code — and changing it means publishing a new process revision, which
this slice is explicitly forbidden from doing.

## Finding 2 — the launch owner exists but is not reachable from Current Work

`enrollment.start` (`lib/adminV2/actions/definitions/enrollmentActions.ts`) is the canonical owner:
subject is the durable child (`customer_members.id`), label **"Start enrollment"**, confirmation
required, and it returns `participantLaunch { sessionId, packetDefinitionId, publicLinkId, stageKey }`.
It is idempotent — `reused: true` when an open journey already exists. It resolves the packet itself,
so no operator picker is needed anywhere.

It is surfaced in exactly one place: `RecordsChildrenSection` (Records → Children). It is **not** in
the Focus Panel, not in Current Work, and not in any stage action catalog.

## Finding 3 — nothing delivers participant access

`startEnrollmentService` mints access and says so plainly in its own contract: *"the journey started
and there is nothing to send yet" is a real and legitimate outcome*. It reports a launch; it does not
send.

The registered action inventory contains **"Send tour invitation"** — the precedent to model on — and
no equivalent for paperwork. So today the only way a family receives access is the copy-a-link path
Kelly correctly rejected as the normal workflow.

## Also found: the Enrollment context tab is inert

From the child record, clicking the **Enrollment** context does nothing — same URL, same content.
The cause is in the search/context payload: the enrollment context resolves with
`stage_key: null`, and `buildSubjectContexts` computes

- `destination_work_unit_key` from `hostWorkUnitKeys.get(context_id)` → null
- `destination_work_view_id` only `if (context_id && stage_key)` → null

so the destination has nowhere to go. The Household destination carries
`host_work_unit_key: lifecycle_wu_lead` and works, which is why that was the only route Kelly could
reach. **Search itself is fine** — "Open Pathb" opens the child record correctly.

## What Part D needs before it can be written

1. An action on the Enrolling stage's catalog binding `enrollment.start` — a revision 33 successor.
2. A delivery action for participant access, modelled on `Send tour invitation`, so the operator
   verb is *Send paperwork* and not *mint a URL*.
3. Either a subject genuinely at Enrolling, or agreement that the action belongs earlier.
4. The inert Enrollment context destination fixed, so the child's enrollment surface is reachable.

Until 1–3 exist there is no operator flow to certify, so Part D was not rewritten: writing it would
have meant describing a screen that does not exist.
