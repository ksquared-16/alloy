# Form re-projection — doctrine built, corpus proven, publication gated

**Run:** `erun_5cc4f4632e42ce48` · **No Form version published** · **Live session untouched**

## 1. Frozen inventory of the five certified versions

| Form | fields | noisy | shared_key | uploads | sigs | schema hash |
|---|---|---|---|---|---|---|
| Oregon CIS | 50 | **43** | **0** | 1 | 2 | `8c60003a0d6b` |
| Nonmedical Exemption | 38 | **20** | **0** | 2 | 1 | `989b68dd0b58` |
| Admissions Packet | 76 | 0 | 1 | 0 | 0 | `a2c01403df04` |
| Tuition Agreement | 5 | 0 | 2 | 0 | 1 | `ab61c75d2348` |
| Handbook Ack | 4 | 0 | 2 | 0 | 1 | `ef517c410ef6` |

Counts confirmed, not assumed. **173 fields · 63 noisy · `shared_value_key` on 5 of 173.**

That last number is the one I had not expected: the certified *180 → 86* correlation never reached
the published Forms, so one fact could not populate many destinations. Ask-once was barely wired.

## 2. Exact projection root cause

`buildFormDraftFromStructure`:

```ts
input.structure.sections.forEach((sec) => {
  for (const f of sec.fields) {
    fields.push({ id, label: f.label, type: mapType(f.suggested_type), … });
  }
});
```

**One destination → one participant field**, `label` taken from the OCR string, `type` from the
reader's widget guess. Concepts, correlations, dispositions and `shared_value_key` are never
consulted. `applyDiscovery` runs *afterwards* and can bind or confirm, but the field set and its copy
are already fixed by then.

The grain is the defect. Labels are a symptom.

## 3. Participant-question eligibility model — built

`participantQuestionEligibility.ts` classifies each concept from evidence that already exists — its
disposition, its canonical binding, the canonical label registries — into: **question ·
structured_collection · prefill_confirm · upload · acknowledgement · signature · static_content ·
artifact_placement_only · held · hold_for_review.**

No parallel classification: the disposition table maps the certified vocabulary rather than
re-deriving it.

**One distinction is load-bearing.** A canonical *key* may be humanised (`person.phone` → "Phone")
because it is an identifier Alloy chose. A *source string* never is, because it is what a scanner
read off a bilingual government form. Where neither a registry nor a canonical key can name a
concept, it is **held for review** — publishing OCR as participant copy is worse than telling an
operator a decision is owed.

## 4. Before / after on the real corpus (dry run)

| Artifact | asked | hold | upload | ack | sig | placement | held | noisy-asked |
|---|---|---|---|---|---|---|---|---|
| CIS Page 1 | 4 | 1 | 1 | 1 | 2 | 2 | 8 | **0** |
| CIS Page 2 | 0 | 4 | 2 | 3 | 1 | 1 | 1 | **0** |
| Admissions Packet | 26 | 23 | 0 | 0 | 0 | 2 | 8 | **0** |
| Tuition Agreement | 0 | 0 | 0 | 11 | 1 | 1 | 1 | **0** |
| Handbook Ack | 0 | 0 | 0 | 0 | 1 | 1 | 0 | **0** |

**173 published fields → 30 asked concepts. Zero noisy labels among them.**
**3 uploads and 5 signatures preserved.**

**CIS immunization:** the vaccine grid is **held** (8 on Page 1), not asked — Health owns the dose
series, and V1's minimum is exactly that a parent is not shown every raw vaccine destination. The
exemption remains its own artifact path; nothing encodes "exempt" as fake missing doses.

**Phone:** types as `phone` even though the Oregon box is numeric — asserted directly, because that
widget guess is what stored `1231231234`.

## 5. 🛑 Why nothing was published

**28 concepts hold for review.** That is the model refusing to guess, and §4 specifies exactly that
behaviour — but §11 gates publication on §10/§13 corpus certification, and a projection with 28
unresolved concepts is not certified. Publishing now would trade OCR noise for silent omissions.

Those 28 need either a registered semantic label or an operator decision. That is the next bounded
step, and it is an operator-facing queue, not more code.

## 6. §12 — re-pinning is safe, and needs no BP change

Proven from the resolution code rather than recalled:

* BP requirements reference **`form_definition_id`**, never a version.
* The BP-derived packet creates items with `pinned_form_definition_version_id: null`.
* At session creation, `loadPublishedFormEnvelope(…, pinned ?? null)` resolves the **latest
  published** version and records it as the session item's `resolved_form_definition_version_id`.
* Precedence for an active session is **session-resolved → definition pin → latest published**, and
  *"Each step's version is chosen now and never re-chosen."*

So: **new versions flow to future sessions automatically; the live session is immune and stays
historical evidence; Revision 1 never names a version, so its authority is untouched.**
**No BP revision change is required** — §12's STOP condition does not trigger.

One forward-only update *will* be needed when versions are published: **Studio packet `579327c1`
carries explicit pins**, and an operator pin outranks latest-published. It must be re-pointed, which
is an item update, not an authority change.

## 7. Untouched

Live session `b25caf02` — untouched, unconsumed, draft submission intact. The five certified
versions — **byte-identical**, hashes above. Revision 1, Studio packet, Financials, safeguarding —
untouched.

## 8. READY FOR PARTICIPANT RUNTIME EXPERIENCE SLICE: **NO**

The doctrine is built and proven, but the Forms are not re-projected or republished. Polishing the
conversation now would still polish a conversation reading 173 raw fields.

**Next:** resolve the 28 held concepts, wire the eligibility model into `buildFormDraftFromStructure`,
re-realize, certify against §13, publish new versions, re-point the Studio packet.
