---
owner: platform
status: accepted
last_reviewed: 2026-07-24
supersedes: []
---

# Phase 7 — Document-to-Packet: Accepted Product-Realization & Execution Plan

**Status:** ACCEPTED baseline for execution (2026-07-24). This is the single canonical plan for the
Document-to-Packet journey. The live execution ledger is
[`../../sprints/active/phase-7-document-to-packet-ledger.md`](../../sprints/active/phase-7-document-to-packet-ledger.md).

Architecture is frozen (see [`../milestones/packet-obligation-architecture-closeout.md`](../milestones/packet-obligation-architecture-closeout.md)).
This is Product Realization + implementation execution, not architecture.

---

## Product outcome (the Phase 7 acceptance contract)

An operator must be able to, in one coherent journey:

Upload an existing document → convert/correct it as a digital form → preserve its original document
presentation → compose it with other requirements into a packet → assign requirements to participants →
send it to a family → let the family complete it **conversationally** → generate the completed documents →
review and sign them → submit the packet → review it in Digital Mailroom Work → return one requirement
for correction → receive the corrected submission → approve and commit → file the final packet and its
documents → send completed copies → resend a failed copy.

**Partial infrastructure completion is NOT Phase 7 completion.** A slice is complete only when its
operator- or participant-visible acceptance outcome works — never because a data model or service exists.

---

## Repository audit & gap classification (verified 2026-07-24, five parallel code audits)

Legend: 🟢 reusable · 🟡 exists-needs-integration · 🔴 defect (broken existing feature) · ⬛ missing · ⚪ out-of-scope-for-early-proof.

| Stage | Reality | Class |
|---|---|---|
| Upload source document | Upload → `documents` + PDF text/AcroForm extraction, classification, entity-linking | 🟢 |
| Understand (fillable/text) | AcroForm ~70%; text heuristic-weak; static text discarded | 🟡 |
| Understand (scanned/image) | No OCR — empty extraction | ⬛ (now in scope, honest path) |
| Turn into a form | Extraction → correction UI → unpublished draft; no section-fate; type not editable pre-create | 🟡 |
| Preserve documents-as-documents | No static-reference item type; static/consent text dropped | ⬛ |
| Assemble a packet | Packet item can only be a form (schema forbids non-form) | ⬛ |
| Assign to participants | No per-requirement assignment; recipient only in link metadata; session grouping exists | ⬛ |
| Send to a family | Retrievable/idempotent link + eager embed (addendum `ec4954888`) | 🟢 |
| Complete conversationally | Guided wizard, not a conversation; **no NLU**; upload control a stub; 2 guardians unmodeled; resume tab-scoped | 🔴 / ⬛ |
| Generate documents | Stub generator (plain-text key/value PDF); no fidelity; no assembled artifact | 🔴/⬛ |
| Collect signatures | Attestation metadata only; no pad, no placement, no immutable artifact, no multi-signer | ⬛ |
| Submit | Packet completion → Processing case (wired) | 🟢 |
| Operator review | Packet rollup + case + Decision Conversation | 🟢 |
| Return item for correction | `needs_correction` sets a CRM flag only — no participant round-trip | 🔴 |
| Approve + file | Filing works (~70%) but files the stub, on packet-review path not canonical approve; retention thin | 🟡 |
| Send completed copies | Comms can't attach documents; enrollment email sends a link; no resend | ⬛ |
| Audit/history | Review events + provenance lineage; no version history / retention | 🟡 |

**Reusable (do not rebuild):** Forms Studio + versioning/publish; Forms engine renderer; canonical field
binding + packet-only-field concept; AcroForm extraction (page/bbox) + substantial correction UI; idempotent
draft-form creation; packet definition/session model + `packet_instance` grouping; packet completion →
Processing case; packet review rollup; Decision Conversation + identity resolution + Commit; document
upload/storage/classification/entity-linking; prefill-diff "ask only what's missing" + multi-child family
plan; guided single-thread participant shell; `form_submission_signatures` audit table; retrievable
distribution links (addendum).

**Defects to fix (broken existing features, NOT missing capabilities):** participant file-upload control is
a stub; document generator is a stub; "drawn signature" is paste-a-UUID; correction loop doesn't round-trip;
save/resume tab-scoped; field type not editable pre-create.

**Missing capabilities to build:** packet item-type polymorphism; per-participant requirement assignment
(+ shared/child-scoped, dependencies, signing order, due dates, correction/completion/copy rules); section-fate
+ static-text preservation in extraction; **OCR path for scanned documents**; real fidelity document
generation (fill/overlay/flatten/assemble); real signature (capture + placement + immutable version +
multi-signer/order + review-then-sign); **conversational NLU (interpret typed/pasted info → proposed
structured answers, confirmed by participant)**; completed-copy distribution (attachment send + recipients +
resend); durable multi-guardian participant modeling; retention/version history.

**Out of scope (must not be represented as supported):** advanced handwriting interpretation; arbitrary
complex-table reconstruction; third-party e-sign provider integration; billing/deposit; any Current Work /
Business Process / broader Enrollment realization.

---

## Scope corrections (mandate)

1. **Conversational understanding is IN scope.** Reuse the existing guided thread — do not create a second
   runtime. The participant must be able to type/paste natural-language family info; Alloy extracts supported
   values as **proposed** structured answers; the participant **sees, confirms, and corrects** them; only
   confirmed values enter the **existing validated form-answer + submission paths** (no uncontrolled AI
   mutation path). Structured form mode remains available in the same packet/state. The Phase 7 proof must
   include ≥1 NL/pasted contribution interpreted, confirmed, and used in the generated document.
2. **OCR is IN the complete mission.** The earliest proof may use a text/AcroForm PDF, but final
   certification requires an honest scanned-document path: detect image-only/unreadable docs → OCR → show
   confidence + provenance → route OCR output through the same correction experience → never silently accept
   low-confidence OCR → allow manual correction → preserve the source artifact.

---

## Frozen boundaries

Do not reopen Packet/Obligation architecture · redesign Enrollment · create a new foundational runtime · a
new workspace · a second Forms engine · a second Processing review system · packet-specific Communications
infrastructure. Do not bypass canonical Records/Identity/Actions/Processing/Commit/Documents/audit paths. No
childcare-specific hardcoding — childcare enrollment is the proving journey; capabilities stay configurable
and platform-generic.

---

## Execution slices (vertical; each ends walkable)

Dependency spine: 0 → (1, 2 parallel) → 3 → 4 → 5 → 6 → 7 → 8. Risk front-loaded into Slice 0.

- **Slice 0 — Fidelity generation + native signing proof (enabler).** Contained engine: load real PDF → map
  values to fields/coords → visually faithful filled PDF → capture drawn + typed signature + initials → place
  mark at correct location → flatten → immutable signed artifact → preserve timestamp/signer/intent/provenance
  + existing signature audit → retain unsigned+signed lineage. Evidence: source/populated/signed PDFs,
  automated verification, rendered comparison, audit record. Not a production UI.
- **Slice 1 — Source document → reviewed, published form.** Upload → understand (text + AcroForm + scanned/OCR
  detection + OCR path + confidence/provenance) → classify section intent (digital fields / generated content
  / static reference / upload / acknowledgement / initials / signature) → correct extraction (type editable
  pre-create) → map canonical/packet-only fields → preserve static/consent text → preview → publish.
- **Slice 2 — Complete packet composition.** First-class ordered item kinds (form / generated doc / fillable
  original / static reference / upload / acknowledgement / initials / signature) + sections + required/optional
  + participant roles + per-requirement assignment + either/shared + child-scoped + multi-child/guardian +
  dependencies + signing order + due dates + correction/completion/final-artifact/filing/copy rules. Product
  controls, not raw JSON.
- **Slice 3 — Participant launch + real conversational completion.** One thread: purpose, remaining, confirm
  prefill, **type/paste NL → review Alloy's interpretation → correct**, structured questions, multi-adult/child,
  real upload, acknowledgement, durable cross-device resume, switch to form mode and back, participant-language
  validation. Interpreted values enter the same validated form-answer model.
- **Slice 4 — Generation + review + signing in the participant journey.** Integrate Slice 0: complete info →
  see generated/filled doc → review → correct-before-sign → typed/drawn signature + initials + intent ack →
  signer order → immutable signed artifact. Post-sign corrections retain prior signed version, regenerate,
  invalidate signature, require re-sign, preserve lineage.
- **Slice 5 — Submission + unified Digital Mailroom review.** One case view: packet identity, participants +
  completion, forms/answers, generated docs, original+signed artifacts, uploads, acknowledgements, signatures +
  evidence, validation, canonical mappings, proposed record changes, unresolved questions, provenance/lineage.
  Reuse case + rollup + identity + Decision Conversation + Commit. No one-by-one form review.
- **Slice 6 — Targeted correction round-trip.** Operator selects one requirement, explains, chooses
  participant, requests correction (or waive/replace with authority). Participant returns via Communications to
  the same packet/state, only the reopened requirement, with prior answer/artifact + explanation. Resubmit →
  re-review; prior versions immutable; affected generated/signed artifacts regenerated + re-signed.
- **Slice 7 — Approval, commit, filing, copies, resend.** Canonical Commit; file all final artifacts
  (classified, entity-linked, packet retrievable as a whole, full version lineage, retention); distribution via
  Communications with real attachments/secure delivery to configured recipients (guardian/org/location/child
  record/external); delivery state + failed-delivery visibility + operator resend + per-copy audit; no
  regeneration merely to resend.
- **Slice 8 — Full certification.** The 23-step acceptance journey end to end + typechecks + targeted/regression
  tests + DB/RLS verification + browser certification of operator & participant surfaces + screenshots/recordings
  + PDF-fidelity + signature-evidence/lineage + correction-history + filing/copy-delivery verification + doc
  updates + no known P0/P1 in the acceptance path.

---

## Product-quality rule (certification gate)

At every step distinguish: truly-works vs. data-model-exists-but-product-incomplete vs. defect vs. stub vs.
demo-only vs. missing. **Do not certify stubs.** Do not call a styled wizard conversational unless the
participant can provide NL info and confirm interpretation; a key/value PDF a completed document; a UUID field
a drawn signature; a CRM flag a correction loop; an attachment type definition completed-copy distribution.

---

## Final completion statement

Phase 7 is complete only when: *an operator can give Alloy a real enrollment document and, through one
coherent journey, transform it into a digital form, compose and send a participant packet, collect information
and evidence conversationally, generate and sign the final documents, review and correct the submission,
commit and file it, and distribute completed copies.*
