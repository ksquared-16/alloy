# Documents and forms

## Purpose

Cover **`documents`** (and related admin normalization) for file/metadata records attached to customers, locations, jobs, etc.

## Current state

- Admin entity route includes document handling with **`normalizeDocumentRow`** (`web/lib/admin/normalizeDocumentRow.ts`) and status inference helpers (`inferDocumentStatusFromStored` in `statusDefinitionsResolve`).
- Drawer loads location documents arrays and payment-adjacent files depending on entity (`AdminEntityDrawer.tsx`).
- **Forms** as a product primitive: **Needs verification** — may be partially represented as documents + metadata or vertical-specific; no single “forms engine” file identified in this pass.

## How it works

- Fetch entity → hydrate related document lists → normalize fields for presentation.
- Status display may be derived from stored keys + org status definitions.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Document normalization | `web/lib/admin/normalizeDocumentRow.ts` |
| Status resolve | `web/lib/admin/statusDefinitionsResolve.ts` |
| Entity route (documents branches) | `web/app/api/admin/entity/[type]/[id]/route.ts` |

## Guardrails

- **Do not** treat client-side file previews as persisted documents until server confirms storage + DB row.
- **Do not** attach documents without org scoping on parent entity.

## Known gaps / risks

- **Needs verification:** Storage backend (Supabase storage vs external), RLS policies, virus scanning.
- **Needs verification:** Dedicated “form builder” or PDF field mapping if any — not located in this pass.

## When this doc must be updated

Document schema changes, new attachment parents, or forms product launches.
