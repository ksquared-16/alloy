# Documents and forms

## Purpose

Cover **`documents`** (file + metadata records) attached to entities and the **forms engine** (versioned definitions, public capture, submissions, packet flows) **as wired in `web/` and Supabase**.

## Current state

### Documents — implemented

- **Upload:** **`POST /api/admin/documents/upload`** (`web/app/api/admin/documents/upload/route.ts`) — multipart upload to **Supabase Storage** (default bucket **`org_documents`**, override **`ADMIN_DOCUMENTS_BUCKET`**), then **`documents`** row with `bucket`, `storage_path`, `status: uploaded`, org + entity linkage. Route documents RLS/service-role assumptions and signed-url behavior inline.
- **After insert:** emits **`document_uploaded`** via **`emitEvent`** (failures logged; upload still succeeds).
- Admin entity route hydrates document lists with **`normalizeDocumentRow`** (`web/lib/admin/normalizeDocumentRow.ts`) and status helpers (`inferDocumentStatusFromStored` in `statusDefinitionsResolve`).
- Drawer loads location documents arrays and payment-adjacent files depending on entity (`AdminEntityDrawer.tsx`).
- **Signed URLs:** **`GET /api/admin/documents/[id]/signed-url`**, vendor variant under **`/api/admin/vendors/[id]/documents/signed-url`**.

### Forms engine — partially implemented (foundation + **Enrollment Packet E2E Phase 1** shipped)

**Implemented (foundation):**

- **Schema:** **`form_definitions`**, **`form_definition_versions`** (draft / published / archived), **`form_public_links`**, **`form_submissions`** (canonical **`payload`** JSONB per migration **`20260506100000_forms_engine_v1_foundation.sql`**), plus linkage/signatures tables as migrated.
- **Admin APIs:** **`/api/admin/forms`** (list/create definitions), **`/api/admin/forms/[formId]`**, versions CRUD/publish/archive, public links, submissions listing and mutation helpers, packet sessions and packet links (`web/app/api/admin/forms/**`).
- **Public capture:** **`/api/public/forms/[token]/submissions`** (and related) for tokenized submit flows.
- **Admin UI:** Forms hub **`/adminV2/forms`** (`FormsHubClient.tsx`) — workspace per definition, links to packet sessions. **Workspace redesign planned:** **`docs/sprints/archive/05_2026/forms_operational_workspace_redesign.md`** (hub, lifecycle, packet builder — align with packet review UX).
- **Tests:** Broad route coverage in **`web/tests/admin/formsAdminRoutes.test.ts`**.

**Enrollment Packet — Phase 1 (E2E operating loop, shipped May 2026):**

- **Canonical execution:** **`form_packet_sessions`** + **`form_packet_session_items`** remain execution truth; **`form_submissions`** hold per-step payloads; **no** parallel enrollment subsystem.
- **CRM launch:** Operators mint packet public links from the **opportunity drawer** (packet definition, recipient, **multi-child / household-aware** launch metadata — config-driven, not a separate product silo).
- **Delivery:** Packet invitation email uses **Communications V1** (canonical enqueue → worker → provider); templated subject/body with **packet link injection** (see **`docs/product/communications.md`**).
- **Public completion:** Recipients complete steps on the public embed; session advances to **`completed`** with operator review fields (**`operator_review_status`**, mismatch hints JSON) where migrations apply.
- **Operator review:** Approve / reject / needs correction via admin API; **approval** triggers **idempotent** **`createGeneratedPdfForSubmission`** for each **submitted** packet step that has usable **`pdf_mapping_json`** (same path as admin “Generate document”; skips unmapped forms).
- **Documents tab (opportunity drawer):** Merges (a) **`documents`** rows already parented to the opportunity with (b) **`documents`** linked through **`form_submission_documents`** for submissions belonging to packet sessions for that opportunity — enriched with optional **Form submission** / **Packet session** admin links in the list. **Documents are not stored “on” the opportunity row** beyond normal `documents.entity_type` / `entity_id` when the PDF parent resolver chooses `opportunity`; packet artifacts are still tied through **submissions + junction**.
- **Trust boundary:** Public values are **proposals** in **`form_submissions.payload`** until explicit operator/intake flows promote them; **Phase 1 does not** auto-write canonical CRM customer/person/member fields from arbitrary public packet answers beyond existing **intake** rules (see **`docs/forms/linkage-review-operator-flow.md`**, **`docs/product/crm-system.md`**).

**Forms MVP productization (May 2026 — shipped ~2026-05-28):** Operational intent templates, simplified Form Detail setup, location-specific share links, inline field tokens (UI/review only) — **`docs/sprints/archive/05_2026/completed/forms_mvp_productization.md`**. **Intake outcome doctrine:** public submit does **not** auto-create opportunities unless link metadata enables it — **`docs/sprints/archive/05_2026/completed/forms_intake_runtime_validation_closeout.md`**.

**Still open / Phase 2+ (not claiming “product complete” for all enrollment):**

- **Field-level data change proposals (DCP)**, richer review UX hardening (UX cards), template/reminder productization — see **`docs/sprints/archive/05_2026/later-phase/enrollment_packet_phase_2.md`**, **`docs/sprints/archive/05_2026/later-phase/forms_documents_operational_experience_hardening.md`**.
- **Phase 2 review MVP (P2-1–P2-4, shipped ~2026-05-21):**
  - **Read API:** `GET /api/admin/forms/packet-sessions/[packetSessionId]/review-rollup` → **`buildPacketReviewRollupV1`** (`web/lib/forms/packets/buildPacketReviewRollupV1.ts`) — labeled answers, warnings, **`documents_index`**, intake context; **read-only** (no writes).
  - **Packet session review console:** `/adminV2/forms/packets/[packetSessionId]` — **`PacketReviewRollupView`** + **`PacketSessionReviewClient`**; approve / reject / needs correction via existing review PATCH.
  - **Opportunity drawer modal:** **`OpportunityPacketReviewModal`** loads rollup for pending sessions; shared case-file layout with session detail page.
  - **Document provenance + non-PDF steps:** Rollup and opportunity Documents merge expose **`generated_pdf`** rows and synthetic **`submitted_record`** rows for steps without PDF mapping (`documentProvenanceDisplay.ts`, `mergeOpportunityPacketDocuments.ts`).
  - **Not shipped in this slice:** P2-5 deterministic BOS packet insight, DCP apply paths, UX hardening cards (UX-A–H).
- **Required vs optional field semantics** — JSON-schema / version payloads evolve; **needs verification** per form kind and publish path.
- **Automatic sync from submission payload → entity field_values** — **not** assumed (migration comments: payload is canonical; no automatic sync).

### Long-term vision (not current production scope)

Unified intake, documents, and compliance-oriented capture: web/API/email channels; outcomes include CRM intake, enrollment packets, compliance artifacts, billing-adjacent forms. **Advanced (future):** AI-assisted parsing, document recreation, jurisdiction rules, dynamic field logic. **Not V1:** PDF builder, full compliance engine, AI ingestion as critical path. Phase 2: **`docs/sprints/archive/05_2026/later-phase/enrollment_packet_phase_2.md`**.

### Relationship to Settings (four-plane model)

- **Forms hub** (`/adminV2/forms`) owns **`form_definitions`**, versions, public links, and packet flows — not the Settings index tiles for Fields/Layouts/Actions.
- **Settings → Actions** configures **where** org-owned buttons appear (`action_placements`); **`open_form`** handlers resolve through **`executeAdminAction`** and form APIs — no `payload_schema` editing in Settings V1.
- **Settings → Fields** configures **`field_definitions`** policies; form-version required semantics vs field policies remain roadmap work (`roadmap-and-gaps.md` item 5).
- Full control-plane inventory: **`docs/system/configuration-system.md`**.

## How it works

- **Documents:** Fetch entity → hydrate related document lists → normalize fields for presentation.
- **Forms:** Operators manage definitions and versions in admin; published versions are immutable except archive transition; public links mint tokens; submissions persist payloads and support manual linkage / confirm flows per routes under **`web/app/api/admin/forms/`**.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Upload + storage | `web/app/api/admin/documents/upload/route.ts` |
| Document normalization | `web/lib/admin/normalizeDocumentRow.ts` |
| Forms admin DB helpers | `web/lib/admin/forms/formsAdminDb.ts` |
| Forms route tree | `web/app/api/admin/forms/**`, `web/app/api/public/forms/**` |
| Schema baseline | `supabase/migrations/20260506100000_forms_engine_v1_foundation.sql` (and follow-on forms migrations) |
| Entity route (documents branches) | `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Document PATCH / entity options | `web/app/api/admin/documents/[id]/route.ts`, `web/app/api/admin/documents/entity-options/route.ts` |
| Packet review rollup API | `web/app/api/admin/forms/packet-sessions/[packetSessionId]/review-rollup/route.ts`, `web/lib/forms/packets/buildPacketReviewRollupV1.ts` |
| Packet review UI | `web/components/forms/packets/PacketReviewRollupView.tsx`, `PacketSessionReviewClient.tsx`, `OpportunityPacketReviewModal.tsx` |
| Document provenance | `web/lib/forms/packets/documentProvenanceDisplay.ts`, `web/lib/admin/related/mergeOpportunityPacketDocuments.ts` |

## Platform model (three intake modes)

Alloy forms are one engine with three operator-facing modes — **enrollment is not a separate subsystem**:

| Mode | Primary truth | Review / documents pattern |
|------|---------------|----------------------------|
| Standalone operational form | `form_submissions` | Submission detail + optional PDF; provenance from form version |
| Public lead / intake | `form_submissions` + public link metadata | Intake/linkage review; **child site/cohort** on `opportunity_customer_members` when mapped (`intake_field_paths`, Card 4 — see **`waitlist_priority_fact_truth_child_scope.md`**) |
| Multi-step packet | `form_packet_sessions` + items | Packet review rollup (`PacketReviewRollupV1`), `/adminV2/forms/packets/[id]` review console, opportunity Documents merge, operator review PATCH |

Shared building blocks: versioned definitions, public links, prefill (`web/lib/forms/prefill/**`), `launch_context` / `crm_snapshot` on packets, `form_submission_documents`, Communications for delivery.

## Prefill (hydration vs truth)

- **Prefill** hydrates draft `payload.values` from CRM/context when link metadata allows (`prefill_enabled`, `prefill_field_map`, `form_context_mode` existing_record or anchored packet). See **`docs/forms/existing-record-public-link-contract.md`**.
- **Submitted values** in `form_submissions.payload` remain intake truth until explicit intake/linkage/review paths promote CRM fields.
- **Lead capture → CRM (May 2026):** `buildFormIntakeMetaFromPayload` + `applyFormIntakeSafe` write **`opportunity_customer_members.location_id`** and **`program_room_cohort_key`** when link `intake_field_paths` map child site/cohort (or per-child `children[]`). See **`docs/sprints/archive/05_2026/waitlist_priority_fact_truth_child_scope.md`** (Card 4–5). **Org-level** cohort keys until site-scoped catalog (deferred — not a blocker for fact-truth sprint closeout).
- **Packet `shared_values`** is a shallow cross-step scalar merge — not a full prefill store or CRM mirror.
- Review UX should eventually distinguish **already known** (aligned with snapshot/context) vs **new or changed** (submitted differs) — Phase 2 rollup warnings are a first slice (name hints only).

## Guardrails

- **Do not** treat client-side file previews as persisted documents until server confirms storage + DB row.
- **Do not** attach documents without org scoping on parent entity.
- **Do not** treat **`form_submissions.payload`** as automatically reflected on CRM entities without an explicit linkage/sync path.
- **Do not** hardcode enrollment-only behavior in shared form/packet/review modules — use link metadata and generic packet/session contracts.

## Known gaps / risks

- **Needs verification:** Org-wide compliance hooks (virus scan, retention jobs) for documents — not evidenced beyond Storage + DB.
- **Enrollment packets:** **Phase 1 E2E** is **shipped**; **Phase 2 review MVP (P2-1–P2-4) shipped ~2026-05-21**; DCP, P2-5 BOS insight, and UX hardening cards remain **partially implemented / next execution** — **`docs/sprints/archive/05_2026/later-phase/enrollment_packet_phase_2.md`**, **`forms_documents_phase_2_packet_review_mvp.md`**. **Document AI extraction** is **not implemented** and **not** in the current sprint lane (AI agent expansion **paused**).
- **Required vs optional:** **`field_definitions.requirement_policy`** exists in DB; cross-surface behavior **needs verification** (`roadmap-and-gaps.md` item 5).

## Related

- **CRM / opportunity surfaces:** **`docs/product/crm-system.md`**
- **Communications (packet email):** **`docs/product/communications.md`**
- **Enrollment packet audit + status banner:** **`docs/sprints/archive/05_2026/enrollment_journey_packet_operations_v1.md`**
- **Phase 2 enhancement plan:** **`docs/sprints/archive/05_2026/later-phase/enrollment_packet_phase_2.md`**
- **Roadmap tracking:** **`docs/execution/roadmap-and-gaps.md`**

## When this doc must be updated

Document schema changes; new attachment parents; storage bucket policy changes; forms versioning/linkage behavior changes; enrollment packet Phase 1/2 status or review/PDF behavior changes.
