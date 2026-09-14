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

### Update, 2026-09-14 — the requirement is now gone from the draft too

The 2026-09-11 finding above said the packet requirement existed in the Business Process **draft**
and was missing only from the published projection. That is no longer the situation.

Measured again on 2026-09-14, against the same department (`3933ac47…`, Enrollment):

- the draft loads (`readDraft` returns a payload, six stages parse);
- its stages carry **only `field` requirements** — nine of them, and no `packet` ref at all;
- `"kind":"packet"`, `packet_definition_id` and the packet's own id each appear **zero** times in
  the department's lifecycle-builder payload;
- Packet Studio's new **Used by** panel, which reads the draft *and* the publication, reports the
  packet as required by nothing.

So the Enrolling stage currently carries no paperwork requirement of any kind. Publishing would not
restore it — there is nothing to publish. It has to be re-authored on the stage, then published.

**Not done here.** Authoring a stage requirement decides what real families are asked for, and this
slice was explicitly scoped to the admin configuration experience with the process change left in
draft for Kelly's approval. Re-creating a requirement that disappeared between two sessions is a
decision for Kelly, not a repair to make quietly — particularly since *why* it disappeared is not
yet established.

**Still open:** what removed it. The candidates are a draft discard/reset, a re-seed from the
publication (which never had the requirement), or another lane writing the same department's draft.
Nothing in this lane's commits touches stage requirements.

---

## Acceptance pass — the eleven questions, answered from the screen alone

Self-executed 2026-09-14 against *Enrollment Paperwork 2026–2027* on slot 4, reading only what the
product displays. Every answer below is quoted or paraphrased from visible text; no code or database
was consulted during the pass.

| # | Question | Answered by | The answer on screen |
| --- | --- | --- | --- |
| 1 | What does a family have to complete? | Packet › **Family experience** and **What families complete** | Three obligations: Admissions Information (*Collect information*), Family Handbook (*Read & acknowledge*), Immunization record (*Upload a document*) |
| 2 | In what order? | **Family experience**, numbered 1–3, and the step list | Admissions → Handbook → Immunization |
| 3 | Which information will Alloy reuse? | Step 1 card; **Alloy** marks on the form | "4 connected to Alloy"; *Alloy confirms information it already knows* |
| 4 | Which will the family be asked for? | Step 1 card | What is missing, plus the 76 "stored with the form only" |
| 5 | Which answers update Alloy records? | Form editor: the 4 questions marked **Alloy**; inspector | *Alloy already knows this when available … the answer updates the record* |
| 6 | Which stay only with the Form? | Form editor: unmarked questions; inspector | *Stored with this form — Not written to the child or family record* |
| 7 | What document must the family read? | Step 2 card, **View document** | "26 27 Family Handbook — 09/10/2026" |
| 8 | Do they acknowledge/sign it? | Step 2 card | *Acknowledgment required · Signature required* |
| 9 | What document must they upload? | Step 3 card | *Family sends in a document · Filed as Immunization record* |
| 10 | What happens after they submit? | **Family experience**, closing line | *the completed packet arrives for staff review in Processing › Work, with the answers, the signed acknowledgment and the uploaded document attached* |
| 11 | Where would I change any of the above? | **What families complete** → per-step actions | **Manage information** / **Preview form** on step 1; **View document** on step 2; requiredness and *Store answer in* inside the Form editor |

**11/11 answerable without knowing Alloy internals.** The screen uses no `form_definition_id`, no
adapter, no binding or shared-value vocabulary — checked in the rendered text, not just by reading
the source.

The one thing the screen reports as *not* configured is **Used by**: no business process requires
this packet, which is true and is the open finding recorded above.

---

## Forensic close-out, 2026-09-14 — how the requirement was lost

### What durable history says

A governed read-only census of `business_process_revisions` (immutable; UPDATE and DELETE are
blocked) for the Enrollment department, all 31 revisions from 2026-08-06 to 2026-09-12:

| Measured | Result |
| --- | --- |
| Revisions mentioning the packet's id | **0 / 31** |
| Revisions mentioning `"kind":"packet"` | **0 / 31** |
| Revisions mentioning `packet_definition_id` | **0 / 31** |
| Revisions matching the string `enrollment_packet` | 31 / 31 — **false positive**, the `send_enrollment_packet` work template |

**No published revision has ever contained the packet requirement.** So there is no "last revision
with it" and no "first revision without it": it lived only in the editable draft.

### The window

- rev 28 published 2026-09-11T19:59Z — no packet requirement
- **2026-09-11 ~22:00Z — the requirement is observed IN THE DRAFT** (this lane, previous run)
- rev 29 published 2026-09-12T01:14Z — no packet requirement
- revs 30, 31 follow on 2026-09-12; 31 is current

Publication makes the draft equal to what was published, so by rev 29 the draft had already lost it.
The loss happened in the draft between 2026-09-11T~22:00Z and 2026-09-12T01:14Z.

### Which operation — UNKNOWN, and that is itself a finding

`business_process_drafts` is mutable, carries only a monotonic `draft_revision`, and there is no
configuration audit log. Nothing records which save changed what. The exact removing operation is
therefore **not recoverable**, and no amount of care at the time would have made it recoverable.

### Stale-draft overwrite — REJECTED

Every writer of the draft passes a compare-and-set on the revision it read
(`lifecycle-builder` route, `editProcessInDraft`, `editBuilderInDraft`,
`saveLifecycleStageRuntimeConfig`). A stale editor **fails** with
`BusinessProcessDraftEditConflictError` rather than overwriting. Concurrent editing is not the cause.

### The mechanism that IS real — and is now fixed

Persistence is **whole-document replacement**, serialized from what was just parsed. And
`parseStageRequirementsV1` deliberately SKIPS requirement rows it cannot read.

Those two decisions are each defensible and together delete data: a row the parser could not read
was absent from the document the next save wrote — so **any save of any unrelated part of the
process silently destroyed it**. Proven directly: a requirement whose `kind` is nested under `ref`
instead of at the row's top level parses to `[]`, with no error anywhere.

`saveDraft` documents itself as "lossless by construction… fields this branch does not understand
survive". That was true of every section except this one.

**Fixed:** the parser keeps unreadable rows verbatim and the serializer re-emits them. They are still
not honoured, and authoring a stage's section still replaces it outright — but an unrelated save can
no longer destroy a requirement nobody read. Covered by `requirementPersistenceIntegrity.test.ts`.

Whether the lost requirement was unreadable or explicitly removed cannot be distinguished without
draft history. The mechanism was real either way, and is closed either way.

### Blocking publication, separately

Publication is refused with `process_command_set_incomplete — Unknown capability 'stage_work.start'`.
It comes from `action_catalog_v1.candidate_actions` on the **Waitlist** stage, it is present in the
published payload (rev 31), and it predates this work — it only became visible because validation
runs once there are unpublished changes. **Kelly cannot publish until that is resolved.** Not fixed
here: it is a different subsystem and outside this slice.

---

## The publication blocker, 2026-09-14 — `stage_work.start`

Publication is refused with one error and only one:

> `process_command_set_incomplete` — Unknown capability `'stage_work.start'` in `command_set_v1`
> (`path: processes[enrollment].command_set_v1`)

### Where it comes from

`stage_work.start` is an **enabled command in the process's `command_set_v1`** (14 commands), present
identically in published revision 31 and in the current draft. It is also a Waitlist
`action_catalog_v1` candidate action — the Waitlist *Offer spot* work. It is not stage-local
configuration; it is a process-level command selection.

### It is a real, current capability — just not on this branch

| | |
| --- | --- |
| Occurrences in `capabilityRegistry.ts` on this lane's branch | **0** |
| Occurrences on `origin/staging` | **4** |
| Introduced | `ea806ca7a` 2026-09-11 16:09 — *"stage_work.start — offering a spot is an operator act"* |
| Made resolvable | `1ad4de1e1` 2026-09-12 06:13 — *"stage_work.start is resolvable, so a configured start renders"* |
| Either commit an ancestor of this lane's HEAD | **No** |
| This lane vs `origin/staging` | **850 behind**, 70 ahead; merge base `4df58a92b`, 2026-09-09 |

On staging it is fully defined — `capabilityKey`/`canonicalCommandKey` `stage_work.start`, operator
label *Start stage work*, family `enrollment`, maturity `executable`, execution owner
`registered_action`, catalog visibility `organization_command_catalog` — and its own commit message
records that it was already "a production capability, a registered adminV2 action, process-selected
in the tenant command set, and configured against the Waitlist stage with its work template bound."

### Classification — OTHER: branch base drift

Not a stale configuration reference: the config is correct and the capability is current.
Not a missing registration in the product: it is registered on staging.
Not a validator defect: the validator is right — *this build* genuinely does not have the capability.

The tenant's configuration was authored on 2026-09-12 against a product that has
`stage_work.start`. This lane's base is 2026-09-09, three days before it existed. The validator is
correctly reporting that the code it is running does not know a capability the configuration
legitimately uses.

### Why nothing was changed here

Each available "fix" would have been a defect:

- removing the config reference would delete live, correct Waitlist configuration to satisfy an old build;
- registering `stage_work.start` in this branch would fork a capability that already exists on staging;
- relaxing the validator would let genuinely unknown capabilities publish.

The real remedy is to bring this lane onto a base containing `1ad4de1e1`, which is a rebase/merge —
authorization Kelly has not given. Publication should be performed from a staging-based build, where
this error does not arise.

**Waitlist behaviour is unaffected in the meantime**: the stage editor renders, *Review waitlist
position* and *Offer spot* are both present, and no capability error is shown to an operator.

---

## Publication, 2026-09-14 — revision 32, and two deltas that should not have ridden along

Revision 32 was published at 2026-09-14T21:22:56Z from draft 81. The authorized change is live and
correct:

```
Enrolling → requirements_v1.requirements = [ONE row]
  kind: packet · packet_definition_id: c03425c9… (Enrollment Paperwork 2026–2027)
  level: required · enforcement: blocking · scope: record · timing: stage_exit
```

Packet resolves 3 obligations; Configuration Health is green over those real obligations
("3 forms a family must complete in this stage"), not over an empty list; Packet Studio **Used by**
reports the requirement as published.

### What else went live, unauthorized

Diffing revision 31 against the published payload shows the packet requirement **plus two deltas
that were not part of the authorization**:

| Delta | Origin |
| --- | --- |
| `stages[enrolled].description = "Enrolled and attending."` added | my own unrelated-save regression probe, 2026-09-14 |
| `stages[waitlist].action_catalog_v1.candidate_actions[0].work_template_key = "offer_spot"` **removed** | the same probe |

The first is cosmetic. **The second is a live regression.**

`work_template_key` binds the Waitlist `stage_work.start` action to the work it starts. The runtime
resolver says so in as many words — *"Carried, not dropped: an action configured to operate on one of
this stage's work templates needs that key at invoke time, and this is the only place it can
travel."* Live Waitlist now has `{action_key: "stage_work.start", recommendation: "ready"}` and no
binding, so the configured start no longer names *Offer spot*. Both work templates still exist.

### How it happened — the same defect, in a different section

The probe saved an unrelated stage description **through the pre-rebase build**, which did not know
`work_template_key` (it arrived with `stage_work.start` on 2026-09-11/12, after this lane's base).
The save was a whole-document write serialized from what that build could parse, so the field it did
not understand was dropped — exactly the skip-on-read/whole-write mechanism closed for requirement
rows, still open for the action catalog.

The lane is now on staging and parses the field correctly, so re-authoring it will persist. That is
a configuration change and a second publication, so it is **not** done here.

**Recommended, pending Kelly's authorization:** restore `work_template_key: "offer_spot"` on the
Waitlist candidate action and publish revision 33. Separately, `stageActionCatalogV1` should carry
rows it cannot fully read, the way `stageRequirementsV1` now does.

---

## Revision 33, 2026-09-14 — the corrective publication

Revision 33 published at 2026-09-14T21:40:23Z. **Revision 31 → 33 contains exactly one change:**

```
Enrolling → requirements_v1.requirements = [ONE row]
  kind: packet · packet_definition_id: c03425c9… · level: required · enforcement: blocking
```

7 keys added, **0 removed, 0 changed**. The Waitlist `work_template_key: "offer_spot"` is back to its
revision-31 value, and the regression probe's Enrolled-stage description is gone. Both repairs were
made through the product — *Work an operator may start* for the binding, the stage description field
for the probe delta — never by editing revision JSON.

### The action catalog is lossless now

`stageActionCatalogV1` now uses `preserveUnknownFields` (Law 7 / Law 1), the mechanism the stage and
process levels already used and this section did not: rows carry their residue, unreadable rows are
kept verbatim, and the catalog is serialized explicitly because `JSON.stringify` drops the symbol
carrier. Nothing became executable — an unreadable row is carried, not obeyed — and an authored edit
or removal still wins. Covered by `actionCatalogLosslessness.test.ts`, including the exact live
failure: `offer_spot` surviving a save about a different stage.

### The publication-attribution question, answered

Not a phantom and not an auto-fire. The server log shows `POST …/configuration/validate` immediately
followed by `POST …/configuration/publish` — the Apply click from the automation, which landed once
**Validate refreshed a stale publication summary** and the button became enabled. `validateConfiguration`
only validates; it publishes nothing.

What was wrong was the bar's *state*, not its behaviour: it renders from the stage bootstrap's
`configuration_state`, which was showing "Everything here is live" with Apply disabled while the API
reported unpublished changes. That is no longer reproducible — a fresh load now reports
`unpublished_changes`, the right draft revision and an enabled Apply, agreeing with the API — so no
speculative fix was made. Revision 33 was published with one explicit click and exactly one publish
request, verified from the browser's own network calls.

**Worth watching:** Validate is currently the control that reconciles a stale bar. If the staleness
recurs, the fix is to refresh the publication summary after any configuration-changing save rather
than only on Validate.

### Getting a subject into Enrolling — the legitimate path

No child is in Enrolling today; the workspace carries New leads (3), Waitlist (16), Tours (0) and
Enrolled children (2), and Enrolling is entered transiently. From the live configuration:

> **Waitlist → *Offer spot*** (started by `stage_work.start` — the binding revision 32 lost and 33
> restored) **→ *Move to Enrolling*** (`waitlist_transition_1`) **→ Enrolling → *Send enrollment
> packet***, which launches the participant session against the live packet.

Moving a real waitlisted child is an operator act on live data and part of Kelly's D-flow, so the
process-launched session proof is deferred to it rather than manufactured here.

---

## Obligation configuration, 2026-09-14 — and two things driving it found

Packet Studio explained each obligation but could not show where any of it was decided. Every step
now has **Configure**, and the 15 admin questions are answerable from visible UI (verified 16/16,
including the Forms list explaining its own scope).

Language follows the model rather than the storage: the packet reports **1 Form and 2 document
obligations**, each card carries its type (*Form*, *Document acknowledgment*, *Document upload*), and
the Forms list says in one sentence why the other two are not in it.

### A real defect, found only by driving the creation path

`PacketAddStepChooser` listed `docsLoading` as a dependency of the effect that sets it. The first run
started the document fetch and immediately re-ran; the re-run's cleanup set `cancelled = true` on the
only request in flight, and every branch after it was guarded by `!cancelled`. **A read-and-acknowledge
step could not be authored at all** — the response arrived 200 (180 documents) and was discarded while
the picker sat at "Loading…". Fixed by keying the effect on the step kind alone.

This was invisible to inspection. It only appeared when the packet was built from nothing.

### The creation path has a real gap, not fixed here

`+ Add step` authors all three obligation kinds correctly — proven end to end on a temporary packet,
which was then retired so Kelly still sees one packet. But **Packets Studio's "New packet" does not
create a packet definition**: it opens the per-record composer, which posts
`/api/admin/pos/packets/compose` with `form_definition_ids` — the pick-some-Forms model this whole
thread has been removing, anchored to a record.

So the honest answer to *"could an administrator create the configuration Kelly is looking at?"* is:
**the obligations yes, the container no.** The temporary packet's shell had to be created through the
API. Building a definition-creation flow is a product decision with its own surface — naming, key,
first step — and is recorded here rather than improvised at the end of this slice.

### One thing I did and undid

Verifying Configure against the live packet wrote participant instructions onto two live steps,
including a Handbook line asserting "23 pages" — a page count Alloy does not store and I had already
reported as unverified. Both were restored to empty and re-checked; signature is still required and
the three obligations are intact. The verification script now takes the packet by name so the live
one is not the default target.
