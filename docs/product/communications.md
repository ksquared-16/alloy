# Communications

## Purpose

Describe outbound/inbound messaging threads and how communications tie to **entities** and **workflows** — without duplicating send logic in UI.

## Current state

- Admin APIs under **`web/app/api/admin/communications/`** (threads, send, related helpers).
- Entity type normalization maps short names to tables (e.g. opportunity → `opportunities`, schedule → `schedules`) in thread routes.
- **Canonical outbound path:** `web/lib/communications/canonicalOutboundEnqueue.ts` (used to centralize enqueue behavior — verify call graph when changing send pipeline).
- Provider binding, RLS, and runbooks lived in archived docs; current code is source of truth.

## How it works

1. UI loads threads for an entity via admin API with org context.
2. Send requests reference entity type/id; server validates membership and org.
3. Complex lifecycle sends should originate from **workflows** or shared server helpers so templates stay consistent.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Thread listing | `web/app/api/admin/communications/threads/route.ts` |
| Send | `web/app/api/admin/communications/send/route.ts` |
| Canonical enqueue | `web/lib/communications/canonicalOutboundEnqueue.ts` |
| Drawer integration | `web/components/admin/AdminEntityDrawer.tsx` (communications UI sections) |

## Guardrails

- **Do not** bypass org checks or send from the client with secrets.
- **Do not** fork template composition in the drawer when a workflow/helper already defines canonical content.
- Map entity types using shared normalization — avoid ad hoc string switches in new code.

## Known gaps / risks

- **Needs verification:** Full provider matrix (email/SMS/push) and which are production-enabled per org.

## When this doc must be updated

New channels, new entity attachment types, or changes to enqueue/queue model.
