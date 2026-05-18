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
- **Admin UI:** Forms hub **`/adminV2/forms`** (`FormsHubClient.tsx`) — workspace per definition, links to packet sessions.
- **Tests:** Broad route coverage in **`web/tests/admin/formsAdminRoutes.test.ts`**.

**Enrollment Packet — Phase 1 (E2E operating loop, shipped May 2026):**

- **Canonical execution:** **`form_packet_sessions`** + **`form_packet_session_items`** remain execution truth; **`form_submissions`** hold per-step payloads; **no** parallel enrollment subsystem.
- **CRM launch:** Operators mint packet public links from the **opportunity drawer** (packet definition, recipient, **multi-child / household-aware** launch metadata — config-driven, not a separate product silo).
- **Delivery:** Packet invitation email uses **Communications V1** (canonical enqueue → worker → provider); templated subject/body with **packet link injection** (see **`docs/product/communications.md`**).
- **Public completion:** Recipients complete steps on the public embed; session advances to **`completed`** with operator review fields (**`operator_review_status`**, mismatch hints JSON) where migrations apply.
- **Operator review:** Approve / reject / needs correction via admin API; **approval** triggers **idempotent** **`createGeneratedPdfForSubmission`** for each **submitted** packet step that has usable **`pdf_mapping_json`** (same path as admin “Generate document”; skips unmapped forms).
- **Documents tab (opportunity drawer):** Merges (a) **`documents`** rows already parented to the opportunity with (b) **`documents`** linked through **`form_submission_documents`** for submissions belonging to packet sessions for that opportunity — enriched with optional **Form submission** / **Packet session** admin links in the list. **Documents are not stored “on” the opportunity row** beyond normal `documents.entity_type` / `entity_id` when the PDF parent resolver chooses `opportunity`; packet artifacts are still tied through **submissions + junction**.
- **Trust boundary:** Public values are **proposals** in **`form_submissions.payload`** until explicit operator/intake flows promote them; **Phase 1 does not** auto-write canonical CRM customer/person/member fields from arbitrary public packet answers beyond existing **intake** rules (see **`docs/forms/linkage-review-operator-flow.md`**, **`docs/product/crm-system.md`**).

**Still open / Phase 2+ (not claiming “product complete” for all enrollment):**

- **Field-level data change proposals**, richer review UX, non-PDF “submission visibility,” template/reminder productization — see **`docs/sprints/05_2026/enrollment_packet_phase_2.md`**.
- **Required vs optional field semantics** — JSON-schema / version payloads evolve; **needs verification** per form kind and publish path.
- **Automatic sync from submission payload → entity field_values** — **not** assumed (migration comments: payload is canonical; no automatic sync).

### Long-term vision (not current production scope)

Unified intake, documents, and compliance-oriented capture: web/API/email channels; outcomes include CRM intake, enrollment packets, compliance artifacts, billing-adjacent forms. **Advanced (future):** AI-assisted parsing, document recreation, jurisdiction rules, dynamic field logic. **Not V1:** PDF builder, full compliance engine, AI ingestion as critical path. Phase 2: **`docs/sprints/05_2026/enrollment_packet_phase_2.md`**.

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

## Guardrails

- **Do not** treat client-side file previews as persisted documents until server confirms storage + DB row.
- **Do not** attach documents without org scoping on parent entity.
- **Do not** treat **`form_submissions.payload`** as automatically reflected on CRM entities without an explicit linkage/sync path.

## Known gaps / risks

- **Needs verification:** Org-wide compliance hooks (virus scan, retention jobs) for documents — not evidenced beyond Storage + DB.
- **Enrollment packets:** **Phase 1 E2E** is **shipped**; **Phase 2** (proposals, field-level review, reminders, queues) is **partially implemented / next execution priority** — **`docs/sprints/05_2026/enrollment_packet_phase_2.md`**. **Document AI extraction** is **not implemented** and **not** in the current sprint lane (AI agent expansion **paused**).
- **Required vs optional:** **`field_definitions.requirement_policy`** exists in DB; cross-surface behavior **needs verification** (`roadmap-and-gaps.md` item 5).

## Related

- **CRM / opportunity surfaces:** **`docs/product/crm-system.md`**
- **Communications (packet email):** **`docs/product/communications.md`**
- **Enrollment packet audit + status banner:** **`docs/sprints/05_2026/enrollment_journey_packet_operations_v1.md`**
- **Phase 2 enhancement plan:** **`docs/sprints/05_2026/enrollment_packet_phase_2.md`**
- **Roadmap tracking:** **`docs/execution/roadmap-and-gaps.md`**

## When this doc must be updated

Document schema changes; new attachment parents; storage bucket policy changes; forms versioning/linkage behavior changes; enrollment packet Phase 1/2 status or review/PDF behavior changes.
