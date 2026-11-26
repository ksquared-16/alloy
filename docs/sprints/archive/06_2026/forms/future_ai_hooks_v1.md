# Alloy Forms — future AI hooks (design only, V1.6.1)

This note maps **where** optional AI assistance could plug in later. No runtime AI is implemented here.

## 1. Field copy / help / placeholders

- **Primary surface:** `web/components/admin/forms/StructuredFormSchemaEditor.tsx` — when a system field is selected or label/help edits occur, a future action could call a small API route (e.g. `POST /api/admin/forms/ai/suggest-field-copy`) with `{ registry_entry_id, current_label, current_help, org_tone }` and merge suggestions into local state only after explicit operator acceptance.
- **Schema contract:** Suggestions stay within `FormSchemaV1` strings (`label`, `description`, `placeholder`); no new schema version required.

## 2. Suggested required flags

- **Registry source of truth:** `web/lib/forms/systemFieldRegistry.ts` (`default_required`, `public_intake_safe`).
- **UI:** Same editor component — AI could propose toggling `required` only when `suggested_kind` allows (respect existing “type locked” rules for dates, signatures, etc.).

## 3. Packet composition

- **Primary surface:** `web/app/admin/forms/PacketDefinitionDetailClient.tsx` — after `forms` + `items` load, a hook could suggest ordered `form_definition_id`s based on org templates.
- **Server guardrails:** `web/app/api/admin/forms/packet-definitions/[packetDefId]/items/route.ts` remains authoritative (published versions, org scope, session lock).

## 4. Form templates

- **Creation path:** `web/app/api/admin/forms/route.ts` (POST) and `web/lib/forms/adminFormSchemaBuilder.ts` — template pick could set initial `schema_json` for the first draft version instead of `emptyFormSchema`.
- **Storage:** Prefer `form_definitions.metadata` or a dedicated `form_templates` table later; keep `FormSchemaV1` as the persisted shape.

## 5. Telemetry / safety

- Any AI feature should log **human-approved** diffs only, keep PII out of prompts where possible, and respect org RBCS (`getAdminContextCached`).
