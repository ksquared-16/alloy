---
owner: product
status: sprint
last_reviewed: 2026-08-17
sprint: records-roster-completion-phase0
base: origin/staging @ 287aa2372
---

# B1 — Start Enrollment as the participant-runtime launch owner

Status: **investigation complete, wiring STOPPED at stop condition 1.**

The product decision is accepted and the flow is right. The launch cannot be wired yet because
one input to it — *which packet definition realizes an Enrollment journey* — has no canonical
source anywhere in the product, and every way of supplying it is a new product or configuration
authority.

Traced against staging `287aa2372`. Firefly was read, never written.

---

## 1. The trace

| Question | Answer |
| --- | --- |
| Operator entry point | Records → Children section, "Start enrollment" — [RecordsChildrenSection.tsx:363](web/components/adminV2/records/RecordsChildrenSection.tsx:363), gated by `childNextActions` |
| Registered action | `enrollment.start` — [enrollmentActions.ts:58](web/lib/adminV2/actions/definitions/enrollmentActions.ts:58) |
| Service handler | [startEnrollment](web/lib/records/startEnrollmentService.ts:56) — **the sole owner. No competing production owner exists.** |
| When the process instance is created / resumed | `createEnrollmentProcessInstance`, already idempotent: `reused: true` when an open journey exists. D-96 revision pin rides the creating INSERT |
| D-98 department selection | Inherited, not re-decided — `resolveEnrollmentBusinessProcessRevision` uses context work unit, else the sole Enrollment department, else refuses to pin |
| How a packet definition is selected today | **Only by an operator picking one in a modal.** `send_enrollment_packet` dispatches `adminv2:open-enrollment-packet` ([applyRegistryResolvedActionClient.ts:655](web/lib/admin/actions/applyRegistryResolvedActionClient.ts:655)) into the Opportunity drawer's modal runtime. Nothing derives a packet from the Enrollment process |
| How public participant links are composed | [`mintPacketPublicLinkForAdmin`](web/lib/forms/packets/mintPacketPublicLinkForAdmin.ts) — reusable as-is; takes `supabase` + `orgId` + body, returns `plaintext_token` and `embed_path` |
| Communications delivery | Not involved. The Packet Composer route returns `shares[].url` and delivers nothing. **This slice should create and return the link only** |

Two other creators of Enrollment process instances exist — Create Lead child persistence and the
Processing identity ports — but neither is a "Start Enrollment" surface, so stop condition 2 does
not fire.

## 2. The smallest path that could work

`startEnrollment` itself. It already holds org, child, resolved context and the created process
instance, and every remaining piece exists and is reusable:

```
startEnrollment
  → createEnrollmentProcessInstance          (exists, idempotent, pins D-96)
  → ??? packet definition                    ← THE GAP
  → mintPacketPublicLinkForAdmin             (exists)
  → launchEnrollmentObjectiveSession(pi, linkId, packetDefinitionId)   (exists, tested, zero callers)
  → return the link
```

Ordering note for whoever wires it: the link must be minted **before** the session, because
`form_packet_sessions.started_via_public_link_id` is how `resolveParticipantEnrollmentFromToken`
finds the session, and it is 1:1.

Idempotency would come out clean. `launchEnrollmentObjectiveSession` already resolves the current
`in_progress` session first and returns `outcome: "resumed"`, so a second Start Enrollment
duplicates no packet items and creates no second objective. One consequence to accept explicitly:
**on resume no usable URL can be returned**, because only `token_hash` and `token_prefix` are
stored and the plaintext token is shown once at mint. Regenerating would mean repointing
`started_via_public_link_id` on a live session — a column whose name is a provenance claim — so
this slice should return the existing link's identity and leave regeneration to its own doctrine.

## 3. Why it stopped

**No canonical packet-definition selection exists for Enrollment.**

The one canonical thing the governing revision says about forms is its stage requirements:
`RequirementRefV1` admits `{kind: "form", form_definition_id}`, and
[`effectiveFormRequirements`](web/lib/lifecycle/effectiveStageRequirements.ts:260) is its canonical
projection — already written and tested, with no production consumer. Deriving a packet from that
would introduce no new authority. Two facts stop it:

**(a) A freshly started journey has no stage to read requirements from.** `startEnrollment` passes
`stageKey: null` deliberately ("the journey's configured entry decides position"), and Create Lead
does the same. Nothing in the product resolves an Enrollment *entry stage* —
`resolveCreateLeadEntryStageKey` is Create-Lead-specific. Requirements, information needs and turns
all project from a stage, so a stage-less instance yields an empty objective by construction.
Choosing an entry stage is lifecycle authority: it decides where the child lands in operator work
views.

**(b) Firefly configures no Enrollment forms at all.** Read from the hosted tenant:

- Latest published revision is **12**, department `3933ac47-…` ("Enrollment"), published
  2026-08-13. Exactly one department publishes Enrollment, so there is no D-98 ambiguity.
- `requirements_v1` is **ABSENT on every Enrollment stage** — `lead`, `tour`, `decision`,
  `waitlist`, `enrolling`, `enrolled`. Consistent with D-97 self-containment landing 2026-08-15,
  two days *after* revision 12 was published.
- So the question becomes what a republish would materialize. The live department metadata carries
  `lifecycle_progression_requirements_v1` and `lifecycle_builder_stage_field_rules_v1`, and every
  entry in both is a **field rule** — `child:first_name`, `person:email`, `opportunity:tour_date`,
  `child:classroom`. **There is not one `form` requirement.** `effectiveFormRequirements` would
  return `[]` even after republishing.

So even with an entry-stage rule, the derivation yields an empty packet, no session and no link.

## 4. The decision Kelly owns

| Option | What it means | Cost |
| --- | --- | --- |
| **A. Start Enrollment picks a packet** | Give Start Enrollment the same operator choice `send_enrollment_packet` already offers on the Opportunity drawer | A new operator surface, and the launch is only as canonical as the operator's pick |
| **B. Configuration binds a packet to Enrollment** | A new authored binding — process/stage → packet definition — read at launch | A new configuration authority, and a builder surface to author it |
| **C. Derive from stage form requirements** (recommended) | Reuse `effectiveFormRequirements` over the governing revision; materialize a packet keyed by (revision, stage) | No new authority, but needs an entry-stage rule **and** Firefly must author `form` requirements before anything projects |

C is the only one that adds no authority, and it is the one that reveals the real gap: Firefly's
Enrollment process governs fields, not forms. Whatever is chosen, **Firefly needs Enrollment form
requirements authored and republished before the participant runtime has any content to converse
about** — that is true under all three options and is independent of the launch seam.

## 5. What did land

B2 is fixed and certified — see [PARTICIPANT-RUNTIME-LIVE-QA-PREREQUISITES.md](../../runtime/PARTICIPANT-RUNTIME-LIVE-QA-PREREQUISITES.md)
for the original finding and `tests/lifecycle/participantProviderAuthorization.test.ts` for the
seven controls, now registered in the Enrollment configuration certification job.
