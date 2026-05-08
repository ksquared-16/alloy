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

### Forms engine — partially implemented

**Implemented (foundation):**

- **Schema:** **`form_definitions`**, **`form_definition_versions`** (draft / published / archived), **`form_public_links`**, **`form_submissions`** (canonical **`payload`** JSONB per migration **`20260506100000_forms_engine_v1_foundation.sql`**), plus linkage/signatures tables as migrated.
- **Admin APIs:** **`/api/admin/forms`** (list/create definitions), **`/api/admin/forms/[formId]`**, versions CRUD/publish/archive, public links, submissions listing and mutation helpers, packet sessions and packet links (`web/app/api/admin/forms/**`).
- **Public capture:** **`/api/public/forms/[token]/submissions`** (and related) for tokenized submit flows.
- **Admin UI:** Forms hub **`/adminV2/forms`** (`FormsHubClient.tsx`) — workspace per definition, links to packet sessions.
- **Tests:** Broad route coverage in **`web/tests/admin/formsAdminRoutes.test.ts`**.

**Not complete / in progress:**

- **Enrollment + intake product completion** — packet-first enrollment journeys, operator workflows, and vertical-specific parity are **still being wired and hardened**; treat behavior as **partially implemented** until sign-off.
- **Required vs optional field semantics** — JSON-schema / version payloads evolve; **needs verification** per form kind and publish path.
- **Automatic sync from submission payload → entity field_values** — **not** assumed (migration comments: payload is canonical; no automatic sync).

Long-range program direction (PDF builder, compliance engine, AI ingestion as critical path): **`docs/strategy/forms-platform.md`** — **not** current production scope.

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
- **Partially implemented:** End-to-end **enrollment / intake** operator + family flows using packets — code exists; **completion and polish** outstanding.
- **Not implemented (production):** Automated **document AI parsing / extraction** pipeline (beyond mocks); do not assume OCR/LLM reliability from repo layout alone.

## When this doc must be updated

Document schema changes; new attachment parents; storage bucket policy changes; forms versioning/linkage behavior changes; enrollment forms declared “complete” for a vertical.
