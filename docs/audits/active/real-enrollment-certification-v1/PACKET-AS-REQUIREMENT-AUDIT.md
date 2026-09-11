# Packet-as-requirement — current → target audit

Grounded in the code as it stands at `952e80aa0`. No implementation in this document.

---

## 1. What the three real documents actually are

| Source | Shape in evidence | What it implies |
| --- | --- | --- |
| **Admissions Packet** (HTML, 58KB) | One legacy form containing *Contact Information*, *Health Information and Developmental History*, *Tuition & Enrollment Agreement*, *Parent Handbook Acknowledgement*, *Direct Payment Authorization* | Five different obligations packaged as one form because Formsite needed one form. Facts, a legal agreement, an acknowledgment and a payment authorization are **not the same primitive** |
| **Oregon Certificate of Immunization Status** (PDF) | 4 pages, **85 AcroForm fields**, bilingual, dose-date grid (`Dose 1..4 DTaP`, …) | A government evidence document. The dose grid is a structured vaccine model Alloy does not have. **Upload is the correct V1** |
| **2026–27 Family Handbook** (PDF) | 23 pages, **0 form fields** | Policy content ending in authorizations. Read → acknowledge → sign. Turning it into questions would be absurd |

The Admissions Packet is the clearest argument for the packet model: it is already a *packet*, flattened into one form because the old tool had no packet concept.

---

## 2. Current → target

| Concern | Current owner / model | Target owner / model | Reuse vs change |
| --- | --- | --- | --- |
| **Stage requirement** | `StageRequirementV1.ref` — `RequirementRefV1` has 6 kinds: `field`, `form`, `document`, `consent`, `acknowledgment`, `signature`. Enrolling carries **three separate `form` requirements** | One `packet` requirement referencing the Enrollment Packet | **Narrow extension.** Add a 7th ref kind + `parseRef`/`refFields` arms + authorable list |
| **Requirement satisfaction** | `projectRequirementsProgress` over realized session items; `resolvePacketParticipantProgress` builds form requirements *from* packet items | Packet requirement satisfied by its session completing | **Reuse.** The evidence owner already exists — unlike `document`/`consent`/`acknowledgment`/`signature`, which are declared-but-refused precisely because they have none |
| **Packet composition** | `form_packet_items`: `sequence_index`, `form_definition_id` **NOT NULL**, `pinned_form_definition_version_id`, `metadata` | Ordered steps of several kinds | **Change.** There is no step-kind column — every step is a Form today |
| **Native Form step** | Supported (the only kind) | Unchanged | Reuse |
| **Document upload step** | Only as a `file_ref` **control inside a Form** (Immunization Record does this) | A step kind: "Upload a document" | **Partial.** The capability exists one level down; the step vocabulary does not express it |
| **Read/acknowledge step** | Only as an acknowledgment **control inside a Form** (`fieldIsAcknowledgement`: required boolean, no canonical binding) | A step kind: document + acknowledge (+ signature) | **Partial.** Same shape as above — control exists, step kind does not |
| **Recognizable paperwork** | `fillPdfWithFidelity` (`lib/forms/pdf/generation/fidelityEngine.ts`) — **session-free**: takes `sourcePdf`, `fieldValues`, `overlays`. Reached only via `renderParticipantEnrollmentDocument`, which **requires a `sessionId`** | Admin can preview populated paperwork | **Reuse the engine.** The engine is not the blocker; its only caller is session-bound |
| **Generic semantic preview** | `FormPreview` — a local function inside `ProcessingFormBuilder.tsx` (line ~898). **Both ▷ Preview and ◎ Runtime render it** (`runtime={mode === "runtime"}`) | Keep, renamed to "Form structure" | **Reuse + rename.** Two buttons, one renderer, neither shows paperwork — this is Kelly's finding #4 exactly |
| **Family runtime preview** | Participant runtime only, token/session bound | Deferred | **No change.** Blocked on the ephemeral-runtime follow-up; out of scope here |
| **Signature** | Form control + `signature_placements` in `pdf_mapping_json`; participant signs on the document | Unchanged for Form steps; needed for acknowledge steps | Reuse |
| **Canonical return** | P0-b closed: packet session → per-submission proposals → existing executors | Unchanged | **No change** |
| **Packet versioning** | Step-level pinning **proven**; `form_packet_definition_versions` written but **blocked on `gdep_bb3620a9793735`** | Requirement pins a published packet version | **No change now.** Works on step-level pinning until the dependency clears |

---

## 3. Direct answers

- **`RequirementRefV1` cannot reference a packet today.** It is a closed 6-arm union with matching `parseRef` / `refFields` switches. The extension is one arm plus two switch cases — small, and the union is exhaustive so the compiler finds every site.
- **A `packet` requirement would have a real satisfaction owner**, which is what disqualifies the other four unauthorable kinds. `REQUIREMENT_KINDS_AUTHORABLE_V1` is `["field","form"]` for exactly that reason; `packet` can legitimately join it.
- **`compilePacketToStageRequirements` runs the inverse direction** (packet → three form requirements). That is the derived-packet fallback and should be kept during migration, not discarded.
- **The paperwork preview is tractable without reopening ephemeral runtime**, because `fillPdfWithFidelity` needs no session. What is missing is an admin caller.

---

## 4. V0.5 implementation sequence

Ordered so each step is provable on its own.

1. **`packet` requirement ref** — 7th arm on `RequirementRefV1`, `parseRef`/`refFields` cases, add to authorable kinds, satisfaction via the packet session. Keep `form` requirements working platform-wide.
2. **Compact Requirements row + Manage** — one row per packet requirement (*Enrollment Packet · 4 steps · Required · Blocking*) with **Manage** opening the existing centre pop-out. No inline editor. No Lifecycle Builder redesign.
3. **Packet step kinds** — extend `form_packet_items` with a step kind so a step can be *Collect information* (Form), *Upload a document*, or *Read & acknowledge*. Keep `form_definition_id` valid for Form steps.
4. **Configure the real package** through the product: Admissions → native Form(s); Handbook → read/acknowledge; Immunization → upload.
5. **Preview information architecture** — rename the generic view **Form structure**, add **Paperwork** using `fillPdfWithFidelity` with sample values, leave family-runtime preview disclosed as deferred.
6. **Derived execution unchanged** — same participant runtime, same canonical return.
7. **Update the QA walkthrough** and have Kelly re-run A/B/C.

### Explicitly not in V0.5
Financials in the packet; whole-experience ephemeral preview; vaccine extraction / canonical immunization model; a second participant runtime; removing `form` requirement support; Processing/canonical-return changes; fidelity architecture changes.

---

## 5. QA doctrine (recorded)

> If we cannot write a simple click-by-click customer QA script for a feature, the product flow is probably not coherent enough yet.

QA is a product-coherence test, not only validation. Major end-to-end flows should ship with a customer-operable walkthrough as part of the acceptance artifact. This does not mean every engineering slice produces a 59-step manual test.

---

## Deliberately not built in V0.5 — recorded, not implemented

Both of these were found while decomposing Kelly's real Admissions Packet. Neither is a defect, and
neither is started.

### 1. Financial Setup as a packet step

The real Admissions Packet's **Direct Payment Authorization** section (10 fields: account holder,
financial institution, routing number, account number, account type, and a signature) was
**deferred** and is not part of `Enrollment Paperwork 2026–2027`. The **Parent Handbook
Acknowledgement** section (4 fields) was **removed** from the form entirely, because the packet's
own *Read & acknowledge* step now owns that obligation properly — the family reads the real 23-page
Handbook and signs against it, rather than ticking a line inside an unrelated form.

When financial setup is built, it is a **fourth step kind**, not a form: it collects bank
credentials, which must never land in `form_submissions` beside a child's nap habits. The step-kind
vocabulary in `lib/forms/packets/packetStepKind.ts` is a closed set precisely so adding one is a
deliberate act with its own storage decision.

### 2. Structured immunization extraction

The *Upload a document* step files the family's immunization record under the governed
`immunization_record` classification. It does **not** read doses out of it, and must not be made to:
per **D-H5**, structured dose truth is Health & Safety's to own, and an upload is evidence rather
than a value. The vaccine grid on the Oregon CIS stays truthfully blank until Health supplies it.

Extraction, when it comes, writes to Health's destination — not to a competing one inside Enrollment.

---

## Open blocker — the packet requirement is authored but not published

Measured 2026-09-11 against the certification org on slot 4.

**Symptom.** Organization › Business Processes › **Health** reports:

> Families have paperwork to complete — **Needs fix** — *No paperwork is required here, so a family
> reaches this stage with nothing to do.*

while the same page's Enrolling stage shows the packet requirement exactly as intended, and the
process header still reads *6 stages · Healthy*.

**Why both are true.** They are reading two different copies of the configuration:

| Surface | Reads | Sees the packet requirement |
| --- | --- | --- |
| Business Process builder / stage editor | `business_process_drafts.draft_payload` | yes |
| Configuration Health, `…/lifecycle-activation/validate`, runtime | `departments.metadata.lifecycle_builder_v1` (the **published projection**) | **no** |

`gatherParticipantPaperworkFacts` is given `departments.metadata` and traverses
`requirements_v1`. It expands a `packet` ref into its steps correctly — that code is present and
deployed — but the projection it is handed has no such requirement to expand, so it returns nothing
and every downstream row passes vacuously over an empty set:

- *Required paperwork still exists* — "Every required form resolves" (of zero forms)
- *Required paperwork is published* — "Every required form has a published version" (of zero forms)

So three of the four paperwork rows are green for the wrong reason, which is worse than the one red
row: only `participant_work_exists` is honest about the emptiness.

**Root cause.** The stage edit that replaced three Form requirements with the one
`enrollment_packet` requirement was saved to the draft and never published, so it has not reached
the projection that runtime and health read.

**Remedy.** Publish the Enrollment Business Process. That is a Director-facing configuration action
with participant-runtime consequences, so it is deliberately **not** performed here — this slice
changed no participant or canonical-return behaviour.

**Do not "fix" this in the checker.** Teaching `participantPaperworkReadiness` to read the draft
would make Configuration Health report on a configuration that is not the one running, which is the
opposite of what that panel is for.
