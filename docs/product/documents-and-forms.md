# Documents and forms

## Purpose

Cover **`documents`** (file + metadata records) attached to customers, locations, jobs, persons, opportunities, etc., and the **admin upload** path.

## Current state

- **Upload (implemented):** **`POST /api/admin/documents/upload`** (`web/app/api/admin/documents/upload/route.ts`) — multipart upload to **Supabase Storage** (default bucket **`org_documents`**, override **`ADMIN_DOCUMENTS_BUCKET`**), then **`documents`** row with `bucket`, `storage_path`, `status: uploaded`, org + canonical entity linkage. Route documents RLS/service-role assumptions and signed-url behavior inline.
- **After insert:** emits **`document_uploaded`** via **`emitEvent`** (failures logged; upload still succeeds).
- Admin entity route hydrates document lists with **`normalizeDocumentRow`** (`web/lib/admin/normalizeDocumentRow.ts`) and status helpers (`inferDocumentStatusFromStored` in `statusDefinitionsResolve`).
- Drawer loads location documents arrays and payment-adjacent files depending on entity (`AdminEntityDrawer.tsx`).
- **Signed URLs:** **`GET /api/admin/documents/[id]/signed-url`**, vendor variant under **`/api/admin/vendors/[id]/documents/signed-url`**.
- **Forms** as a unified product primitive: **Not implemented** as a single engine in this repo — **Needs verification** for vertical-specific intake; no shared “form builder” surfaced in this audit.

## How it works

- Fetch entity → hydrate related document lists → normalize fields for presentation.
- Status display may be derived from stored keys + org status definitions.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Upload + storage | `web/app/api/admin/documents/upload/route.ts` |
| Document normalization | `web/lib/admin/normalizeDocumentRow.ts` |
| Status resolve | `web/lib/admin/statusDefinitionsResolve.ts` |
| Entity route (documents branches) | `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Document PATCH / entity options | `web/app/api/admin/documents/[id]/route.ts`, `web/app/api/admin/documents/entity-options/route.ts` |

## Guardrails

- **Do not** treat client-side file previews as persisted documents until server confirms storage + DB row.
- **Do not** attach documents without org scoping on parent entity.

## Known gaps / risks

- **Needs verification:** Org-wide compliance hooks (virus scan, retention jobs) if any — not evidenced in upload route beyond Storage + DB.
- **Not implemented (in this pass):** Automated **document AI parsing / extraction** pipeline in production code (beyond admin UI mocks); do not assume OCR/LLM reliability from repo layout alone.

## When this doc must be updated

Document schema changes, new attachment parents, storage bucket policy changes, or forms product launches.
