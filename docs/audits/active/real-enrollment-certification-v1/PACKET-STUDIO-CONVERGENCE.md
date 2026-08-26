# Packet Studio — what is true today, and the one thing that would make it lie

**Run:** `erun_3714532bcada2f9a` · **Browser acceptance not performed** · BP untouched

## 0. The finding that changes the shape of this pass

The instruction reads Studio's step composition as *"traditional ordered form builder"* framing over a
system that is really a compiled semantic workflow. I traced the runtime, and it is the other way
round:

```
formPacketService: session.current_sequence_index → next pending item by sequence_index
                   shared_values merged forward; fields with a shared_value_key prefill
```

**Participant Runtime executes form by form, in packet order, carrying shared values forward.**
Ask-once is implemented as *prefill-and-do-not-re-ask*, not as one semantic questionnaire compiled
across the packet.

So Studio's step composition is not legacy framing — it is an accurate picture of execution. Making
the Studio workspace present collection as semantic-across-the-packet would produce **a UI describing
a runtime that does not exist**. That is the same class of error as "configured blocking" implying
enforcement, and this run is explicitly forbidden from changing Participant Runtime.

**The compiled-workflow experience you want is a RUNTIME slice first, and a Studio slice second.**

## 1. Current model vs intended

| Lifecycle step | Owner today | State |
|---|---|---|
| Import + understand sources | Processing (`composePacket`, discovery) | ✅ certified |
| Correlate repeated destinations → facts | `packet_intake.correlations` | ✅ **180 → 86** |
| Canonical values identified | `suggestFieldBinding`, ownership routing | ✅ certified |
| Owners retained (relationship/doc/ack/signature) | disposition vocabulary | ✅ certified |
| Ambiguity surfaced | `needsOperatorReview`, held states | ✅ certified |
| Operator resolves only the unsafe | bulk-accept safety + review sections | ✅ certified |
| Packet ready | `form_packet_definitions` + items | ⚠️ no readiness *model* (see §10) |
| BP compiles Forms → requirements | `compilePacketToStageRequirements` | ✅ built this program |
| Start Enrollment derives work | `launchParticipantEnrollment` | ✅ B1 |
| Runtime asks only what's needed | `shared_values` prefill | ⚠️ **partial — step-wise, not semantic** |
| Artifacts rendered in authored order | packet items + review rollup | ✅ order preserved |

Everything upstream of the runtime already exists. **Nothing here needs a second packet-analysis
model** — and I built none.

## 2. Studio changes made

* **“Saved pipeline” → “Included forms.”** *"5 forms · the order a family meets them, and the order
  they are reviewed in."* Numbering kept, because it is load-bearing.
* **“Held for another area” demoted.** Moved below the packet and collapsed into a disclosure. The
  hold itself is untouched and still provable.

## 3. Studio changes designed, not built — and why

The *“What Alloy understood”* panel (86 facts, categories, `180 destinations → 86 facts`, ask-once
inspection, known-vs-needs-collection preview) is buildable from data that already exists, but two
things stopped me short of shipping it this run:

1. **No read path.** The analysis lives on `processing_cases.metadata.packet_intake`. The packet
   definition carries `source_case_id`, so it is reachable — but there is **no API exposing packet
   intake analysis**; only `/api/admin/processing/cases/[caseId]/form-draft`. A new read endpoint is
   needed, and shipping an unverifiable new API plus a large panel with no browser proof is how the
   last two wrong click-paths happened.
2. **The §0 finding.** A “what the family will be asked” preview would describe semantic collection.
   Honest framing is *“what Alloy understood from these documents”* — an analysis summary, not an
   execution preview. That distinction has to be settled before the panel is written, not after.

## 4. Step composition — **keep it**

Order carries real semantics, in three places:

* `form_packet_sessions.current_sequence_index` — the participant's position;
* review rollup orders by `sequence_index`;
* `buildPacketReviewInsightV1` labels steps by it.

What should change is the *manual rebuilding*: with the Processing handoff, items arrive already
determined, so composition should be **confirm-and-reorder**, not author-from-scratch. That is a
smaller change than removing it, and it does not misdescribe the runtime.

## 5. Launch Packet / Sessions & review

`mintPacketPublicLinkForAdmin` is a genuine standalone capability, and `launchParticipantEnrollment`
mints its own link for Enrollment. Both are real; they serve different callers.

**Recommendation: keep, relabel.** Launch becomes *“Send this packet directly (standalone)”* with a
line saying Enrollment sends its own automatically. Removing it would delete a valid capability;
leaving it unlabelled implies production Enrollment needs an operator to launch — which B1 disproved.

## 6. Ask-once — what is actually proven

* **Analysis grain:** 180 destinations → 86 facts via 3 correlations. Certified.
* **Runtime grain:** `shared_value_key` + `shared_values` merged forward across steps. Real, and
  narrower than the analysis: it prevents re-asking *within one session*.

Studio can honestly show the first. It cannot yet show "asked once across the packet" as an execution
claim.

## 7. Multi-child / household — partial

* **Across recipients of one packet:** solved. `packet_instance_id` shares one session across
  recipient links, and `householdOnly` withholds `person_id` so each submit does not re-pin the
  participant for everyone else.
* **Across two children:** each child gets its own journey, session and packet — `startEnrollmentService`
  creates one `process_instance` per `customer_member_id`. Household facts are re-collected unless
  canonical prefill answers them. **I found no proof either way**, and no evidence of a "collect
  household once across sibling journeys" mechanism. Named as an open question, not a gap I confirmed.

## 8. Artifact invariants — restated and unregressed

**Collection is semantic-ish; review and signature are artifact-based.** Nothing in this run touched
the certified partition: 6 logical artifacts, 5 executable, 3 uploads, 5 signatures, per-artifact
signature isolation, generated-document fidelity, zero bank-credential asks.

## 9. Browser acceptance — not performed

Same blocker, fifth run: no operator session in this lane. Both changes here are small and visible on
the packet screen; neither can be claimed until seen.

## 10. Packet readiness (§10)

There is **no packet readiness model** today — `form_packet_definitions` has `is_active` and nothing
else. `packet_intake_review` decisions exist at the analysis grain, and `needsOperatorReview` already
distinguishes real ambiguity from safe conclusions. The readiness definition you describe (all
artifacts understood · every need owned · decisions resolved · reconciliation balanced) is
**composable from existing parts but not currently expressed**. That is a real gap and a candidate
slice.

## 11. Blockers before BP Publish + parent certification

1. **An operator session** — the standing blocker for the BP publish and every browser proof.
2. Nothing in this run blocks it. The BP bridge is unchanged: Packet non-authoritative, BP
   authoritative, one-time compile.
