---
owner: modules
status: canonical
last_reviewed: 2026-10-27
supersedes: []
---

# Documents and forms

**Status:** Canonical platform module doc.

Forms engine, document handling, enrollment packets — industry-agnostic core with enrollment as reference implementation.

---

## Capabilities

| Area | Status | Entry |
|------|--------|-------|
| Form definitions & versions | Complete | `/admin/forms` |
| Public links & submissions | Complete | Public API routes |
| Packet sessions | Complete | Enrollment packet flows |
| Review rollup MVP | Complete | Packet review console |
| DCP / UX hardening | In Progress | Sprint `later-phase/` |
| Record identity resolution | Complete (promotion candidate) | Processing Case identity review for public lead-capture and Manual Create Lead; locally certified, awaiting staging reconciliation |

---

## Architecture

- **Definitions** — `form_definitions`, `form_definition_versions`
- **Capture** — `form_submissions`, public link tokens
- **Packets** — `packet_sessions` chain steps for multi-form enrollment
- **Documents** — file storage separate from form field capture

---

## Digital Mailroom product model

Digital Mailroom is the operator product for bringing external information into Alloy.
Processing remains the engine underneath; it is not the operator-facing architecture.

**Canonical entry:** AdminV2 sidebar **Processing** → `ProcessingModal` (BOS workspace modal).
Standalone `/admin/processing` is a deep-link host only; the modal is the product surface.

The operator never leaves the modal for `/admin/forms`. Processing owns form authoring and publishing
in-modal via Studio → Forms → Builder.

### Mode pattern (Work vs Studio)

Digital Mailroom reuses the Communications operational modal pattern:

| Level | Component | Work | Studio |
|-------|-----------|------|--------|
| Header | `OperationalModalHeader` | Title + subtitle + Close | same |
| Mode (L1) | `AlloyModeSwitch` via `OperationalWorkspaceModeNav` | **Work** | **Studio** |
| Section (L2) | `CommsModalTabBar` via `OperationalWorkspaceModeNav` | Overview · **Queue** · Documents | Forms · Packets · Documents · Fields · Branding |
| Execution | `DigitalMailroomShell` children | landing or queue workspace | asset library / builder |

**Visual dividers (locked):**

- **Horizontal** — `border-b border-stone-200` under the level-2 tab row (`OperationalWorkspaceModeNav`)
- **Vertical** — `border-r border-stone-200` between Queue column and review workspace (`PosProcessingWorkspace`)

Shared nav: `web/app/adminV2/components/OperationalWorkspaceModeNav.tsx`

### Tab hierarchy

```
ProcessingModal
└── DigitalMailroomShell
    ├── OperationalModalHeader ("Digital Mailroom")
    ├── OperationalWorkspaceModeNav
    └── execution
        ├── mode=work,  workView=overview  → ProcessingOverviewLanding
        ├── mode=work,  workView=work       → PosProcessingWorkspace (Queue)
        ├── mode=work,  workView=documents  → ProcessingDocumentsWork (Documents, D5)
        └── mode=studio, studioTab=*        → ProcessingFormsStudio (+ ProcessingFormBuilder)
```

Sub-tab label under Work is **Queue** (not "Work"). Top-level mode label remains **Work**.

### Product spine

1. **Overview** — launch point for importing, resuming active work, or opening Studio assets.
2. **Work → Queue** — folder-aware operational queue + document review.
3. **Studio** — reusable assets: Forms (live), Packets / Fields / Branding (placeholders).
4. **Builder** — canvas-first editor opened from Studio Forms; stays in-modal.

Overview is not a dashboard. It answers: *What am I trying to accomplish?*

The uploaded PDF is evidence. The generated native form is the source of truth.

### Work pipeline

Import Form → Review Alloy's understanding → Generate native form → Studio Builder.

Review uses human language ("Where should this answer go?", "Store on Child"). Implementation
labels stay under Advanced or off-screen.

### Identity resolution and public intake

For lead-capture submissions, the public submit route opens/reuses a Processing Case and persists source facts and candidate resolutions. It does **not** create or link `persons`, `customers`, `customer_members`, or `opportunities` at submit time. Operators review candidates/corrections, build and approve an immutable Commit Plan, then explicitly invoke the executor.

Plausible matches, ambiguity, and contradictions form a blocking **identity-review gate** before plan build, approval, or commit; source adapters may recommend/preselect trusted deterministic matches but may not bypass the gate.

Manual Create Lead uses the same source-agnostic Processing spine. Whether the operator enters
through the BOS command session (Conversation/Form) or the compatibility modal host, confirmed
execution still routes through registered `create_lead` and Processing identity review —
BOS prepares and explains the payload; it does not bypass the identity-review gate or write
canonical identity rows early. `applyFormIntakeSafe` is retired and throw-only; the C1
comparison helpers are retained for audit, not runtime authority. There is no source-cutover
feature flag.

### Public tour request on intake (S7, 2026-10-26)

A school's public tour calendar (`/tours/[token]`) is step one in front of its published lead form:
the token is a location-scoped Processing intake link (`form_public_links`) carrying the
server-controlled `metadata.tour_calendar_v1` flag, which only `PATCH …/public-links/[linkId]`
`{ tour_calendar }` sets, under `forms.author` **and** `tours.configure`. The submitted time is
**pending intent** on the Processing case (`processing_cases.metadata.requested_tour`,
`processing.requested_tour.v1`): no Opportunity, no booking, no seat hold and no message before
Approve. The submit route revalidates the time against the canonical slot engine and refuses it
before any write (`TOUR_SLOT_UNAVAILABLE`, draft kept); a request that cannot be recorded fails the
submit rather than being dropped. After `commitApprovedLeadForCase`, Approve resolves it through
`materializeRequestedTourForCase` (`web/lib/tours/publicCalendar/`): revalidate, book through
`createTourBooking`, or record `needs_rescheduling` with a reason — never rolling back the lead.
Re-running Approve retries; the booking (`tour_bookings.metadata.processing_case_id`) is the truth.
Evidence: `certification/tours-calendar-forms/s7/`.

**Optional marketing consent (Tours I1).** On the same links, the Forms runtime (`FormEmbedClient`)
renders a Communications-owned control below the form — two unchecked boxes, email and texts, each with
its own versioned wording — when the resolve payload's server-derived `marketing_consent_offered` is
true. It is not a form field: it is not in the schema, not in the submission payload values, and the
form author does not place it. Submit sends the boxes' actual state as `marketing_consent`; the route
refuses an answer from a link that does not offer it and records the evidence on the Processing case
beside `requested_tour`. Approve commits it through Communications (see `communications-platform.md`
§ Tours). Packet and enrollment journeys never show it. Evidence: `certification/tours-calendar-forms/i1/`.

### Studio — Forms and Builder

Canvas-first interaction translated from Surface Builder:

1. **Canvas** — primary artifact
2. **Sections** — primary organizational unit (left rail)
3. **Questions** — primary editable primitive (add via library modal)
4. **Properties** — contextual inspector (360px, last)

Studio folders are configurable definitions with `id`, `label`, `description`, `order`, `accent`,
`hidden`, and `system` behavior. Current defaults are starter folders only.

Intake prefill and embed doctrine: sprint closeouts in `docs/sprints/completed/`.

### Work layout (locked 2026-07-08)

Work review for document imports uses three parent surfaces:

1. **Queue** (~22%) — folder-aware work list
2. **Source document** (~55%) — PDF or recognized regions (hero); scrollable multi-page
3. **Review questions** (~23%) — question resolution inspector

Shared panel chrome: `ProcessingParentPanel`. Folder icons: `ProcessingFolderIcon`.

Visual tokens: Midnight Forge, Bend Pine, Stone, White in shell chrome.

**Lock:** Digital Mailroom V1 UI is approved and frozen. Extend behavior **inside** this shell only.
See `docs/sprints/archive/07_2026/processing-v1-lock-closeout.md`.

---

## Studio → Documents (D3)

The Digital Mailroom's Studio has a **Documents** tab (Forms | Packets | Documents | Fields | Branding) where an
organization maintains the document categories and types it tracks.

- **Categories:** vocabulary, saved immediately.
- **Types:** versioned (draft → validated → published). An unpublished revision can be discarded
  (`DELETE …/types/[id]/draft`); the published version stays live. A type whose only version is the draft is deleted
  as a type instead.
- **Where it lives:** `web/app/adminV2/pos/ProcessingDocumentsStudio.tsx`.
- **Internal API:** `/api/admin/documents/configuration/*`.
- **Authority:** writes need `processing.documents.manage`, reads need `documents.read`.
- **Starter vocabulary:** every organization receives a childcare starter vocabulary (10 categories, 13 types, including
  the existing `doc_type` values) as ordinary editable rows.
- **Enforcement:** the default sensitivity is enforced for new and re-typed documents (D3). Since D5, applicable subject
  types, allowed formats and review are enforced when a document is filed or uploaded, and the replacement policy when it
  is filed or replaced (`web/lib/documents/configuration/documentTypeEnforcement.ts`, `public.document_file`). Validity
  (expiration, reconfirmation) is still declared intent for D7. The Studio labels each field with where it is enforced.
- **Security model:** `docs/platform/governance/document-security-model.md` §7.

## Focus Panel → Documents: the household library (D4)

The Focus Panel's Documents surface (Activity → Documents, and the Documents card on drill) is one library for the
household behind the case: the household, its adults, its children and its cases.

- **Where it lives:** `web/components/admin/documents/DocumentLibraryPanel.tsx` (UI),
  `web/lib/documents/library/documentLibrary.ts` (read model), `GET /api/admin/documents/library`.
- **Organization:** grouped by the owning subject, then the Studio category and type. Filing is logical — subjects and
  types — never storage folders. Search and type/category filters work over the authorized list.
- **Ownership vs association:** each document is filed under its primary owner; other members it relates to are shown
  as "Also relates to". A document owned outside the household appears under "Related from another record", unnamed.
- **Narrowing:** the selected child (`child.customer_member_id`) opens the library narrowed to that child; the chips
  widen it to the household or switch to another member. Narrowing is done by the server.
- **What it shows:** title, type and category, version (n of m), received date, size, sensitivity class and Forms
  provenance; review and validity only when the version stores them. The list derives nothing; readiness ("required /
  missing / pending review / waived") is the D6 Documents evaluator's answer, shown above it. "Expiring" is D7.
- **Actions:** open (a signed link, per version too), version history and the document's history (loaded when a row is
  expanded), replacement with a reason, and upload to a chosen member with a Studio type. Uploads go through
  `POST /api/admin/documents/upload` (content check, D1c screening, quarantine, the type's default sensitivity).
- **Performance:** the Activity prewarm warms the library, and no longer requests the legacy related-list documents;
  revisiting a record renders from its snapshot; a write invalidates the cache so a refresh is never stale.
- **Security:** `docs/platform/governance/document-security-model.md` §7a.

## Processing → Work → Documents: filing a received document (D5)

Received customer documents are classified, tied to the right record, reviewed and FILED into the canonical library
from inside the Digital Mailroom. Record: `certification/documents-v1/D5-PROCESSING-FILING.md`.

- **Queue** (`GET /api/admin/processing/documents/queue`, `ProcessingDocumentsWork.tsx`). Document cases whose purpose is
  a customer document (intent `store_document` / `process_information`, or a filing proposal) with a DERIVED lane:
  unclassified · needs a record · needs review · ready to file · filing errors · filed (7 days). Read from the Processing
  case spine; there is no queue table and no Work Items row. Every row passes the canonical document disclosure.
  Form-template uploads (`generate_form`, `packet_source`) stay in the forms flow.
- **Proposal** (`processing_cases.metadata.document_filing`, `GET/PUT …/cases/[caseId]/document-filing`): the type (from
  the published Studio catalog; the deterministic classifier's suggestion is shown as a proposal only), the PRIMARY OWNER
  and any related records chosen from a household graph the operator can see (search finds the household; nothing is
  matched from a name or an email), review, an optional sensitivity raise, and new document vs new version.
- **Filing = approval.** `POST …/cases/[caseId]/approve` runs the Documents filing command
  (`web/lib/documents/filing/documentFiling.ts`) and completes the case only when the filing committed
  (`operational_result.kind = "document_filed"`). A refusal is stored on the proposal (`last_error`, the Filing errors
  lane) and is never shown as done; a retry replays (filing key `processing_case:<case>:document:<doc>`).
- **Ownership.** Processing owns intake and resolution. Documents owns the filing: associations, versions, sensitivity,
  authorization and the transaction. Processing never writes a document row or an association.
- **After filing** the document is in the record's Focus Panel library (D4) under its primary owner, with "Also relates
  to" for the related records; "Open record" lands on the record's Documents card. History shows "Filed from Processing"
  from the committed filing record.

## Document requirements, readiness and waivers (D6)

Documents owns document requirement DEFINITIONS, their SATISFACTION and document-specific WAIVERS. Business Process
reads the Documents answer; Enrollment keeps its separate stage exceptions. Record:
`certification/documents-v1/D6-DOCUMENT-REQUIREMENTS.md`. Migration `supabase/migrations/20261212090000_documents_d6_requirements.sql`.

- **Authoring** (Processing → Studio → Documents → **Requirements**, `/api/admin/documents/configuration/requirements/*`):
  a published Studio type, the subject grain (household · adult · child · enrollment case), scope (every record, or
  records in a Business Process, optionally at named stages), timing (immediately, or within N days of entering scope),
  required/optional, waivable or not, an optional effective window. Versioned like types: draft → validated → published
  (compare-and-swap) → superseded; the database validates against the PUBLISHED type (it must exist and accept the
  grain) and refuses a second live definition of the same type, grain and scope. Archive keeps history and waivers;
  only a governed QA run's own archived fixture requirement (QA organization, key `qa_<run>_…`, `?qa_run_id=qar_<run>`)
  can be purged, for zero-residue certification teardown.
  `processing.documents.manage`; reads `documents.read`.
- **One evaluator** (`web/lib/documents/requirements/documentRequirementEvaluator.ts`, pure): missing · pending review ·
  satisfied · waived · blocked, from the subject's owned documents of the type, their status and their CURRENT version's
  review, and the active waivers. Accepted evidence satisfies; an unaccepted upload (or no review on a review-required
  type) is pending review; quarantined or rejected evidence alone is blocked; a type no longer published or no longer
  accepting the grain is blocked by configuration. Satisfaction is never stored — no placeholder rows, no satisfaction
  table, no "waived" document status.
- **Waivers** (`/api/admin/documents/requirements/waivers`): one requirement, one subject, a reason, the actor, an optional
  end date; revocation with a reason; never deleted. Only a requirement whose published policy allows waivers.
  A waiver is not evidence, grants no access and never changes a document (quarantine stays quarantine).
- **Review** (`POST /api/admin/documents/[id]/review`): accept or reject a document's current version — what turns
  pending evidence into satisfying (or blocked) evidence.
- **Work** — Processing → Work → Documents → **Missing documents**, and Work Items (source "Documents"), both from
  `GET /api/admin/documents/requirements/work`: derived rows (`document_requirement:<requirement>:<grain>:<subject>`)
  for unmet REQUIRED requirements; never `operational_tasks`; a row disappears on the next read once satisfied or waived.
- **Readiness** — the Focus Panel Documents card (`DocumentReadinessPanel`, `GET …/requirements/readiness`): required, on
  file, missing, pending review, waived and blocked per household member, with accept/reject/waive/revoke.
- **Business Process** — a stage `document` requirement (`document_type_key`) is now authorable (a published type a child
  can file); participant progress asks the same Documents service, so a stage's document requirement and the Documents
  requirement for that type give one answer. Completion sufficiency and Enrollment stage exceptions are unchanged.
- **Security:** `docs/platform/governance/document-security-model.md` §7c.

## Review, expiration and renewal (D7)

- **Validity is derived, never stored.** One pure evaluator (`web/lib/documents/validity/documentValidity.ts`) reads the
  type's published validity policy (D3: none, explicit date, duration, periodic reconfirmation, event renewal; warning
  days) and the version's `effective_on` / `expires_on` (D2), on the **organization-local date**
  (`documentsClock.ts`, `org_settings.metadata.timezone`). `expires_on` is the last valid day. A duration or
  reconfirmation derives its expiration from the effective date (else the review or received date); a recorded date
  overrides it. An explicit-date or event type with no recorded date is *date missing*.
- **Requirements honour validity.** Accepted evidence that has expired, or is not yet in force, no longer satisfies; the
  requirement reads **expired** (blocking). Accepted evidence of a type needing a recorded date, without one, reads
  *pending review* until the date is recorded. Satisfied evidence inside its warning window is *expiring soon*
  (renewal work, never blocking). Business Process readiness gets this through the same evaluator.
- **Review lifecycle** (`POST /api/admin/documents/[id]/review`, `document_review_version`): first decision with
  `documents.write`; rejection and reopen need a reason; changing a decided review needs `processing.documents.manage`
  and a reason. Every decision and every date change is in `document_version_review_events` and in the history.
- **Validity dates** (`GET/PUT /api/admin/documents/[id]/validity`, `document_set_version_validity`): current version
  only; review untouched.
- **Renewal** is a replacement version (`POST …/[id]/versions`, optional `effective_on` / `expires_on`): same document
  and subject, history kept; pending review when the type requires review or says `review_on_renewal`. While it awaits
  review (or after a rejection) the earlier accepted version keeps counting if still in force; a renewal never counts
  until accepted, and a file screening would quarantine is never stored.
- **Operational surfaces**: `GET /api/admin/documents/requirements/work` returns requirement rows (missing, pending
  review, expired, blocked, and *expiring soon* renewal work) and **document attention** rows (expired, expiring soon,
  review due, date missing) for owned documents no requirement row already names — one derived read for Processing →
  Work → Documents, Work Items (source Documents, never `operational_tasks`) and the Focus Panel.

## Forms and Documents (D8)

- **Forms already write canonical Documents.** Completed-form PDFs, signed artifacts and signature images are
  `documents` rows whose immutable version and owner association the D2 insert triggers create;
  `form_submission_documents` links them to their submission; form uploads are typed documents. D8 adds no storage,
  identity or association path (inventory: `certification/documents-v1/D8-FORMS-DOCUMENTS-CONVERGENCE.md`).
- **Provenance** (`web/lib/documents/forms/formArtifactProvenance.ts`): form, submission and status, artifact kind and
  integrity (a signed artifact's recorded signed hash against the stored checksum) — shown on each library row.
- **Forms evidence for requirements** (`document_requirement_versions.form_evidence`, Studio "also satisfied by
  completed forms"): a completed-form PDF of a named form, owned by the subject, from a SUBMITTED submission, with no
  integrity mismatch, counts — after review (default) or on submission (`submitted`, only where the organization's
  policy says so). D7 validity applies with the requirement's type policy.

## Integration points

- Opportunity drawer — packet review modal, form status
- Workflows — submission events
- Field policy — forms parity with settings **planned**
- Processing Identity Resolution — public lead-capture and Manual Create Lead source adapters; facts/resolutions/approval/executor
- Processing document filing (D5) — the Documents filing command, called by a document case's approval
- Business Process readiness (D6) — stage `document` requirements answered by the Documents requirement service
- Work Items (D6) — the Documents source, a derived projection of unmet document requirements

---

## Related

- `../../platform/modules/documents-and-forms.md` (transitional expanded reference)
- `../../foundation/platform-capabilities.md`
