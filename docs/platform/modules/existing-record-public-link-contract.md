# Existing-record form launch (contract sketch)

This documents the **intended** behavior for Alloy Forms **V1.3+** when a form is launched from a known CRM row (child / household / opportunity), without building full prefill or navigation yet.

## Goals

- Submission rows start with **FKs already set** (`person_id`, `customer_id`, `customer_member_id`, `opportunity_id`) when launched from Admin or deep links.
- **Document generation** attaches using the existing parent-resolution order (member → opportunity → customer → person) **without** waiting for email/phone intake matching.
- **Repeated fields** can eventually be filled from canonical records (prefill); today only metadata and display hooks exist.

## Link metadata (source of truth)

On `form_public_links.metadata`, operators or provisioning scripts set:

| Field | Purpose |
| --- | --- |
| `form_context_mode` | `lead_capture` \| `existing_record` \| `document_update` |
| `source_entity_type` | Canonical entity hint, e.g. `customer_member`, `customer`, `opportunity`, `person` |
| `source_entity_id` | UUID of that entity |
| `prefill_enabled` | When true, future flows may hydrate `payload.values` from CRM |
| `allow_auto_create` | When false, intake should not create ambiguous CRM rows for this launch |

On **draft create** (`POST /api/public/forms/[token]/submissions`), the server stamps a **subset** of these keys onto `payload.meta` (clients cannot spoof them; see `mergePublicSubmissionMeta`).

## Future API shape (minimal)

**Option A — extend mint link**  
`POST /api/admin/forms/[formId]/public-links` accepts optional `launch_context` matching the metadata fields above plus optional initial FK hints for analytics only.

**Option B — dedicated “send form” endpoint**  
`POST /api/admin/.../send-form` creates a **single-use** or **tracked** public link row with `form_context_mode: existing_record` and `source_*` set, returns embed URL.

Both options reuse **`form_public_links`**; no parallel link store.

## Submission behavior (future)

1. Resolve link → read `form_context_mode` / `source_*`.
2. If `existing_record` or `document_update`, map `source_entity_*` → submission FK columns **before** or **instead of** intake matching.
3. Skip auto-match when FKs are already authoritative unless `allow_auto_create` and product rules say otherwise.
4. Prefill: when `prefill_enabled`, map canonical fields into `payload.values` using the published schema (field-id mapping TBD).

## Related code

- `web/lib/forms/formContextMode.ts` — stamp + parse helpers  
- `web/app/api/public/forms/[token]/submissions/route.ts` — stamps launch context onto new drafts  
- `web/lib/forms/submissionOutcomeSummary.ts` — operator-facing summaries and document gating  

## Current limitations (V1.3)

- Admin UI does not yet mint “existing record” links with FK seeding; metadata is manual via link PATCH/scripts.
- Prefill from CRM is **not** implemented.
- Clearing a CRM FK from the submission UI requires API `null` payloads (UI copy explains).
