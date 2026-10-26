---
owner: modules
status: canonical
last_reviewed: 2026-10-23
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
| Section (L2) | `CommsModalTabBar` via `OperationalWorkspaceModeNav` | Overview · **Queue** | Forms · Packets · Fields · Branding |
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
- **Enforcement:** only the type's default sensitivity is enforced today. The rest of the policy is declared intent for
  D5–D7, and the Studio says so beside each field.
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
  provenance; review and validity only when the version stores them. Nothing derives "missing" or "expiring" — that is D7.
- **Actions:** open (a signed link, per version too), version history and the document's history (loaded when a row is
  expanded), replacement with a reason, and upload to a chosen member with a Studio type. Uploads go through
  `POST /api/admin/documents/upload` (content check, D1c screening, quarantine, the type's default sensitivity).
- **Performance:** the Activity prewarm warms the library, and no longer requests the legacy related-list documents;
  revisiting a record renders from its snapshot; a write invalidates the cache so a refresh is never stale.
- **Security:** `docs/platform/governance/document-security-model.md` §7a.

## Integration points

- Opportunity drawer — packet review modal, form status
- Workflows — submission events
- Field policy — forms parity with settings **planned**
- Processing Identity Resolution — public lead-capture and Manual Create Lead source adapters; facts/resolutions/approval/executor

---

## Related

- `../../platform/modules/documents-and-forms.md` (transitional expanded reference)
- `../../foundation/platform-capabilities.md`
