# Record system (RRS & entity API)

## Purpose

Clarify where **authoritative record payloads** come from for admin UI and why **queue list rows** are not equivalent.

## Queue truth boundary (critical rule)

Queue rows are **selection and preview surfaces only**.

They may be used for:

- Rendering labels, badges, timestamps, and preview fields
- Sorting and filtering rows
- Selecting an entity (`entity_type`, `entity_id`)
- Navigating to a record (e.g. opening the drawer)

Queue rows must **never** be used for:

- Business logic or lifecycle decisions
- Workflow condition evaluation
- Action payload construction
- Financial calculations (e.g. quote totals, balances)
- Identity resolution (person/contact/customer)
- Drawer or record authority
- Aggregates or KPI computation

All authoritative reads must come from:

- Entity GET endpoints (`GET /api/admin/entity/[type]/[id]`)
- Resolver-based record system (RRS)
- Server-side summary endpoints

**Rule:** Queue → select entity → refetch authoritative data → execute logic.

**Never:** Queue → execute logic directly.

Workspace navigation context for queues: **`docs/system/workspace-system.md`**.

For **opportunity** queues, **`QueueService.enrichOpportunityRows`** may attach person/contact/customer/member data, **read active `tour_bookings`** for tour preview fields, **`_placement_priority`** when placement is enabled (opt-in), and **`_operational_summary_preview`** for lane hints — while **filters** may still use **`metadata.tour_date`** for historical compatibility. None of that makes the queue row authoritative: **Queue → select entity → entity GET → act** remains mandatory (see **`docs/sprints/05_2026/tour_scheduling_v1.md`** §12).

## Current state

- **`GET /api/admin/entity/[type]/[id]`** is the generic drawer loader for many entity types.
- **Jobs** use the **record resolution system (RRS)** via `resolveJobRecord` (`web/lib/rrs/entities/job.ts`) with **`surface`** query param (`resolveRecordSurfaceParam`).
- **Opportunities** are resolved in **`respondOpportunityEntityGet`** (`web/lib/admin/opportunityEntityRecord.ts`), wired from the same entity GET route as other types — not RRS. Surfaces include `drawer_visible` (fast shell), `drawer_initial`, and `full`. **Lifecycle and “priced” rules** use the same effective quote as `_quote_total_display` via **`effectiveOpportunityQuoteDollars`** (`web/lib/admin/opportunityLifecyclePresentation.ts`), including **`drawer_visible` + `full` parity** (both load opportunity **`fetchEffectiveStatusDefinitions`** for lifecycle metadata). **RRS parity with jobs** for opportunities remains a separate product question — see `docs/product/crm-system.md` and `docs/execution/roadmap-and-gaps.md`.
- **Opportunity AI attach bundles (May 2026):** Entity GET may include **`_operational_attention`**, **`_attention_suggestion`**, and **`_operational_summary`** (deterministic; enrich route is separate explicit POST). Drawer chrome uses **`OperationalAttentionHeaderStrip`** — **Enhance draft** does not persist or send. **Agent expansion paused** — maintain only; see **`docs/product/ai-system.md`**.
- For **jobs** (RRS), responses may include **`_rrs`** metadata and a **flat** shape suitable for the drawer and overview layout.
- **Field policy mapping (Cards 1.5–4):** Opportunity and job GET includes **`_field_policy_resolved`** and policy columns on **`_field_definitions`**. **PATCH enforcement** (Card 3) returns `{ error: "Field validation failed", violations: [{ field_key, code, message }] }` on violation. **Drawer UX** (Card 4): `EntityDrawerOverview` shows per-field errors, required/read-only chrome, and a global list for violations on fields not visible in the current section; blur-save preserves dirty state on failure.
- **Settings → record presentation (control plane):** Drawer **composition** (section order, show/hide, workflow virtual titles) is configured in Settings → Layouts; **field policies** (required, editability, visibility) in Settings → Fields; **catalog section labels** in Settings → Field grouping. Runtime drawer assembly reads effective layout + field catalog — **`effectiveDrawerLayoutPreview.ts`**, `AdminEntityDrawer`. Opportunity **workflow v1** section config: `opportunityWorkflowV1SectionConfig.ts`.
- **Inquiry drawer children:** `_inquiry_children` merges OCM joins + active household **`customer_members`** (`relationship=child`, `is_active`) for queue parity. Child identity edits PATCH **`customer_members`**; inquiry-specific fields PATCH **`opportunity_customer_members`** (`inquiryChildrenHydration.ts`, `inquiryChildFieldEdit.ts`).
- **Opportunity custom fields in drawer:** `PATCH /api/admin/opportunities/:id` accepts **field_values-only** bodies (e.g. `inquiry_source`, `desired_start_date`) via `upsertFieldValuesFromBody` after native column updates. **`desired_start_date`** is inquiry/household-level in V1; per-child start dates are deferred (see sprint doc).
- **Linked-record inline edit (V1):** Opportunity drawer fields with **`interaction_policy.editability_mode = editable_through_related_record`** and **`ownership.write_behavior = related_record`** (preset: **`personFieldOnOpportunityInteractionPolicy`**) inline-edit **`first_name`**, **`last_name`**, **`email`**, **`phone`** against the linked **primary person** via **`PATCH /api/admin/persons/:id`** — not the opportunity row. Surfaces: config-driven **`EntityDrawerOverview`** and inquiry summary **`FamilyContactsPanel`** / **`PrimaryPersonContactCard`**. Helpers: **`linkedRecordFieldEditing.ts`**, **`primaryPersonCardEdit.ts`**. Sprint: **`docs/sprints/05_2026/linked_record_field_editing_v1.md`**.
- **Control plane vs runtime:** Settings changes structure/presentation/policies; entity PATCH and `executeAdminAction` execute operational logic. See **`docs/system/configuration-system.md`**.
- **Mutation access (Card 7):** Server PATCH runs **org row check → CRM scope gate → field policy** (opportunity/job). Out-of-scope targets return **404**. Drawer **`canMutate`** is **admin role_key only** (ops inline edit deferred). Action **`POST /api/admin/actions/execute`** uses the same CRM scope dimensions as entity reads. UI disabled buttons are not a security boundary.
- **Sprint closeout:** Settings/record UX parity shipped May 2026 — see **`docs/sprints/05_2026/settings_record_ux_parity_sprint.md`** §12 for shipped vs deferred; regression manifest `web/tests/sprints/settingsRecordUxParityRegression.test.ts`.
- Other types may still be “select * + hydration” in the same route; check the branch for the type.

## How it works

1. **Drawer URL construction:** `buildAdminEntityFetchUrl` in `AdminEntityDrawer.tsx` uses `/api/admin/entity/jobs/:id?surface=...` and opportunities with `surface` when applicable; other types use the generic pattern.
2. **Resolver:** RRS composes pricing, payments, relationships, and presentation helpers depending on surface; errors return 404/500 with structured messages.
3. **Queue lists:** `QueueService` builds **preview** projections (allowlisted columns, sorting, filters) for jobs/opportunities/etc. — optimized for lane triage, not full record authority. For opportunity **CRM compact** lanes, child display lines may be **enriched from `customer_members`** while remaining preview-only (see **`docs/system/workspace-system.md`**).

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Entity GET route | `web/app/api/admin/entity/[type]/[id]/route.ts` |
| Opportunity record resolution | `web/lib/admin/opportunityEntityRecord.ts` |
| Opportunity quote + lifecycle helpers | `web/lib/admin/opportunityLifecyclePresentation.ts` |
| Job resolution | `web/lib/rrs/entities/job.ts`, `web/lib/rrs/resolveRecord.ts` |
| Surfaces | `web/lib/rrs/surfaces.ts` |
| Drawer fetch wiring | `web/components/admin/AdminEntityDrawer.tsx` |
| Queue previews | `web/lib/queues/QueueService.ts` |

## Guardrails

- **Queue vs authority:** Obey **[Queue truth boundary (critical rule)](#queue-truth-boundary-critical-rule)** above — drawer and record summaries must hydrate from entity GET / RRS, not from queue list payloads.
- **Do not** duplicate pricing, allocation, or lifecycle rules in drawer-only code — align with resolver and server helpers.
- **Do** use entity GET / resolver outputs when building summaries that must match the drawer.

## Known gaps / risks

- **Implemented today:** Jobs use **RRS**; opportunities use **`respondOpportunityEntityGet`** (`web/lib/admin/opportunityEntityRecord.ts`) — a **dedicated** record responder, not the job RRS module.
- **Needs verification:** Which other entity types will move to RRS vs stay on entity-route hydration.
- **Needs verification:** Long-term consolidation of opportunity responder with job RRS patterns (roadmap, not behavioral bug).

## When this doc must be updated

When a new entity gains RRS, surfaces change, queue preview fields gain/lose parity with resolver output, or **opportunity queue enrichment** sources for CRM compact change.
