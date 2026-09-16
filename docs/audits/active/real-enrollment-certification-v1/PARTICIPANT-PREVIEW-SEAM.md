# Running the participant runtime over ephemeral state

**Status:** seam delivered and tested; the preview that uses it is not built yet.
**Recorded:** 2026-09-16, lane `lane_2cea84351d90`.

## Why this exists

The admin preview must not be a second participant presentation. The first attempt drifted straight
back into "fill out a Form" — an 80-field page with Next/Back — which is the failure this record is
meant to prevent happening a third time.

## The re-audit (this supersedes the 2026-08 numbers)

The earlier audit found ~59 persistence calls across ~18 files and concluded that a whole
`ParticipantSessionStore` was required. The runtime has been consolidated since. Measured on this
tree, across `lib/enrollment/participantRuntime`, `lib/public/forms` and
`app/api/public/forms/[token]` — 72 files:

| Measure | Count |
|---|---|
| Files importing a service-role client | 12 (all routes; **zero** runtime files) |
| Write calls (`insert`/`update`/`upsert`/`delete`) | 20 |
| Read calls (`.from`) | 82 |
| Builder methods used against `form_packet_sessions` | 5 — `from` · `select` · `eq` · `maybeSingle` · `update` |

**The seam already exists.** Every mutating runtime function takes `supabase` as its first
parameter, and no runtime file constructs a client. `selectNextParticipantTurn` and
`answerParticipantQuestion` take no client at all — the conversation's decisions are already pure.

So a narrower existing dependency seam was available, and per the instruction it is used instead of
introducing a `ParticipantSessionStore`: **the client parameter is the seam.**

## Owner map

| Responsibility | Owner |
|---|---|
| Token → session access | `lib/public/forms/resolveParticipantEnrollmentFromToken.ts` |
| Objective / what Alloy still needs | `participantRuntime/resolveParticipantEnrollmentObjective.ts` |
| Known-information resolution | `participantRuntime/resolveParticipantCanonicalValues.ts` |
| Next question selection (pure) | `participantRuntime/selectNextParticipantTurn.ts` |
| Question-vs-answer handling (pure) | `participantRuntime/answerParticipantQuestion.ts` |
| Turn application (writes) | `participantRuntime/applyParticipantTurnResponse.ts` |
| Grouped confirmation | `participantRuntime/applyConfirmationGroup.ts` |
| Semantic correction | `participantRuntime/semanticValueEditor.ts`, `applyParticipantValueEdit.ts` |
| Party / second guardian | `participantRuntime/applyPartyResponse.ts`, `childPartyRuntime.ts` |
| Handbook step document | `participantRuntime/resolveAcknowledgmentStepDocument.ts` |
| Upload destination | `participantRuntime/resolveParticipantUploadDestination.ts` |
| Wire model to the client | `participantRuntime/participantObjectiveWireModel.ts` |
| Conversation presentation | `app/forms/embed/[token]/EnrollmentConversationCard.tsx` (3 fetch sites) |
| Thread / composer / uploads | `ParticipantThread.tsx`, `ParticipantComposer.tsx`, `ParticipantUploads.tsx` |
| Completion / review | `CompiledArtifactReview.tsx`, `compileParticipantArtifact.ts` |

`childPartyRuntime.ts` is the only runtime file that writes canonical people tables. Everything else
the conversation mutates is three tables.

## The boundary (built, tested)

`lib/enrollment/participantPreview/ephemeralParticipantClient.ts` — a client-shaped proxy:

- `form_packet_sessions`, `form_packet_session_items` and `form_submissions` are served from, and
  written to, memory. The read-modify-write is **real**, which is what write-suppression could never
  deliver: a suppressed write makes the runtime read back what it never wrote and behave as though
  nobody answered.
- Every other table refuses `insert`/`update`/`upsert`/`delete`. Not by a deny-list — by refusing
  every mutating verb on everything not named, so a table added next quarter is refused by default.
- Storage is refused wholesale: a preview file in a real bucket is a real consequence.
- Reads pass through, so preview shows the real published Form, the real Handbook and the real
  classifications.

Proven by `web/tests/enrollment/ephemeralParticipantClient.test.ts` (13 tests), including a refusal
for a table that is deliberately not enumerated.

## What remains

1. Build the ephemeral session: a `PacketSessionRow` plus `form_packet_session_items` pinning each
   step's published version — the rows `formPacketService` writes at session realization.
2. Preview routes mirroring `enrollment-objective` and `enrollment-turn`, running the same
   orchestration with the ephemeral client.
3. Give `EnrollmentConversationCard` an `apiBase` prop (defaulting to its current path) so the
   **same** component serves preview. Three fetch sites.
4. Mount it in place of the current static preview body.
5. Generic family first. Subject-context preview (read-only) is the enhancement after it — it must
   not be bought by compromising the seam.

## Do not

Do not fork a second conversation UI, and do not reach this by `if (preview) don't write`. Both were
tried; the first is what Kelly rejected, the second is why this boundary is an object.

---

# Follow-up, recorded not implemented: immunization extraction

When an immunization document is received, the desired later flow is:

document received → document intelligence extracts vaccine / dose / date facts → mapped into the
**Health-owned D-H5 vocabulary** → governed candidate facts → operator review and approval where
required → canonical Health truth.

Enrollment must not invent a competing vaccine model. Filing a document under a type is not reading
what is inside it, and the packet step says so today. This is a post-E2E follow-up and is not part
of the preview work above.

---

# Closeout: where preview stops, and why it is not a suppression

Reached through the real runtime, with the QA accelerator driving the SAME turn functions:

- 79 turns, 0 refusals, Admissions work 15/80 → 79/80 (99%)
- every party offer declined through `applyPartyResponse` (`outcome: declined`)
- the runtime then asked, conversationally: **"Before I prepare the paperwork, please attach
  Immunization record."** — classification `Immunization record`, family-facing wording, no
  extraction claimed

## The boundary, exactly

`outstandingRequiredEvidence` computes what is still owed from a set the module's own comment
describes as:

> "the set of field ids a canonical Document already satisfies for this session — read from
> `documents`, not from a submission payload, because the obligation must be answerable before any
> artifact has been prepared or submitted."

So an evidence obligation is satisfied by a **canonical Document and nothing else**. There is no
submission-payload representation to inject, which means there is no clean seam for an ephemeral
upload. `POST /api/public/forms/[token]/enrollment-upload` writes both a Supabase Storage object and
a `documents` row; the ephemeral client refuses both.

Satisfying it in preview would require fabricating a `documents` row — preview asserting a real
record exists. That is the fake runtime state the slice was told to stop at, so preview stops here
and the upload control refuses locally and says why.

## What this gates

The evidence request comes BEFORE paperwork preparation, so the artifact phase — Family Handbook
presentation, acknowledgment, signature, and completion — sits behind this same single boundary.
They are not separately blocked; there is one gate.

## What would unblock it

An evidence-satisfaction seam that can be answered by session-scoped state as well as by a Document
— i.e. `outstandingRequiredEvidence` taking its `onFile` set from an injected resolver rather than
reading `documents` directly. That is a runtime change with real product consequences for the
operational path and is explicitly NOT something to slip in behind a preview.

The signature asset has the same shape: `enrollment-signature-asset` writes `documents` + Storage.
It is behind the evidence gate, so it was not reached, and it is named here so it is not rediscovered.
