# Event integrity audit (API routes)

**Date:** 2026-05-02  
**Scope:** Every `web/app/api/**/route.ts` handler exporting `POST`, `PATCH`, `PUT`, or `DELETE`.

## Canonical event layer

- **`emitEvent`** (`web/lib/emitEvent.ts`): Inserts into `workflow_events` using the service-role admin client. This is the single supported TypeScript entry point for new audit rows.
- **`emitStatusChangedEvent`** (`web/lib/admin/emitStatusChangedEvent.ts`): Bridges status_key transitions; **as of this audit** it delegates inserts to **`emitEvent`** (previously it wrote `workflow_events` directly). Payload shape and event types (`entity_status_changed` vs `opportunity_status_changed`) are unchanged.
- **`enqueueCanonicalOutboundMessage`** (`web/lib/communications/canonicalOutboundEnqueue.ts`): Inserts thread/message rows, then calls **`emitEvent`** with `message_queued` where applicable.
- **`executeAdminAction`**: Uses **`emitEvent`** for workflow-start and `action_executed` paths; uses **`emitStatusChangedEvent`** for opportunity status updates (thus **`emitEvent`**).
- **Workflow execution:** After emitting, routes that fan out to automations call **`executeWorkflowRun`** (`web/lib/workflowRun.ts`) with `options.event_id` when an event was created.

## Changes made (high-value gaps)

| Area | File(s) | Change |
|------|---------|--------|
| Status transitions | `web/lib/admin/emitStatusChangedEvent.ts` | Writes via **`emitEvent`** instead of duplicating `workflow_events` insert logic. |
| Job actions | `web/app/api/admin/jobs/[id]/route.ts` | `job_action` path now **`emitEvent`** (`job_action`) before **`executeWorkflowRun`**, with **`event_id`** on runs. |
| Apply default vendor to upcoming | `web/app/api/admin/jobs/[id]/apply-vendor-to-upcoming/route.ts` | Same pattern for `job_default_vendor_applied`. |
| Schedule vendor assign | `web/app/api/admin/schedules/[id]/assign/route.ts` | Same pattern for `schedule_vendor_assigned`. |
| Customer reschedule (action link) | `web/app/api/action-links/consume-reschedule/route.ts` | After successful DB updates, **`emitEvent`** (`action_link_consumed`) and workflow fan-out (aligned with `web/app/api/action/[token]/consume/route.ts`). Failures on emit/workflow return errors (link is already consumed; ops may need to repair — same tradeoff as token consume). |
| Manual charges | `web/app/api/admin/jobs/[id]/charges/route.ts` | **`emitEvent`** `charge_posted` on successful `charges` insert (payload includes charge snapshot + `actor_user_id`). |
| Assignment status | `web/app/api/admin/schedules/[id]/assignment/route.ts` | **`emitEvent`** `assignment_status_changed` when `status_key` changes (`entity_type` `schedule`, `entity_id` = schedule id) for Activity Log / future workflows. |
| Admin schedule create | `web/app/api/admin/schedules/route.ts` | **`emitEvent`** `schedule_created` + workflow fan-out (same pattern as `POST …/schedules/[id]/reschedule` when copying assignment is false). |
| Payments run (proxy) | `web/app/api/admin/payments/run/route.ts` | After successful backend JSON parse: **`payment_succeeded`** or **`payment_failed`** (excludes `requires_action`). Durable payment writes remain on the Python backend; this route is the **UI/admin observation boundary** for terminal outcomes. |
| GL posting (schedule) | `web/app/api/admin/schedules/[id]/post-completion/route.ts`, `post-customer-payment/route.ts`, `post-vendor-payout/route.ts` | **`schedule_completion_gl_posted`**, **`schedule_customer_payment_gl_posted`**, **`schedule_vendor_payout_gl_posted`** after successful post (not on error/skip-only paths). |
| Contacts | `web/app/api/admin/contacts/route.ts`, `…/archive/route.ts`, `…/unarchive/route.ts` | **`contact_created`**, **`contact_archived`**, **`contact_unarchived`**. |
| Customer members POST | `web/app/api/admin/customer-members/route.ts` | **`customer_member_created`**. |
| Jobs archive/vendor/location | `web/app/api/admin/jobs/[id]/archive/route.ts`, `unarchive/route.ts`, `assign-vendor/route.ts`, `location/route.ts` | **`job_archived`**, **`job_unarchived`**, **`job_vendor_reassigned`** (includes prior `assigned_vendor_id`), **`job_location_updated`**. |
| Schedule location | `web/app/api/admin/schedules/[id]/location/route.ts` | **`schedule_location_updated`** (`entity_type` **`schedule`**). |
| Chart of accounts | `web/app/api/admin/financials/accounts/route.ts`, `accounts/[id]/route.ts` | **`gl_account_created`**, **`gl_account_updated`** (PATCH payload includes before/after snapshot). |
| Documents upload | `web/app/api/admin/documents/upload/route.ts` | **`document_uploaded`** after DB row insert. |
| Vendor contacts / payout | `web/app/api/admin/vendors/[id]/contacts/route.ts`, `…/contacts/[contactId]/route.ts`, `payout-policy/route.ts` | **`vendor_contact_linked`**, **`vendor_contact_unlinked`**, **`vendor_payout_policy_updated`**. |
| Book v2 | `web/app/api/book-v2/opportunity-discount/route.ts`, `ensure-customer/route.ts`, `service-details/route.ts` | **`opportunity_discount_applied` / `opportunity_discount_cleared`**; **`customer_ensured_for_booking`** when `ALLOY_PUBLIC_ORG_ID` is set; **`book_v2_service_details_saved`** after location + opportunity updates. |

## High-risk gaps (status after second pass)

Previously critical gaps for **CRM, billing proxy observation, scheduling/GL posting, messaging-side document upload, vendor graph, and book-v2 persistence** are closed in the Next layer via **`emitEvent`** (see table above and route list below). **Workflow fan-out** was **not** added for these unless the route already matched an existing `executeWorkflowRun` pattern; new event types are audit/Activity Log ready and can be wired to workflows when needed.

**Explicit durable-write boundaries**

- **`POST /api/admin/payments/run`** — Backend remains source of truth for payment records and side effects. The BFF emits **`payment_succeeded`** / **`payment_failed`** only from parsed backend responses (see route implementation for status gates).

**Non-critical / intentionally deferred:** Workflow definitions (`PUT` actions/conditions), layout/KPI/agent config, most pricing-matrix CRUD, RBAC, tenant bootstrap, option sets, etc. Rows in the table below marked `missing (deferred)` are acknowledged low-risk for operational workflow triggers unless product explicitly needs them.

## Smoke-test notes

Use a dev org with Supabase SQL or the dashboard.

1. **Job action** — `PATCH /api/admin/jobs/{id}` with `{ "action": "assign_vendor" }` (or `mark_completed` per your workflow setup). Expect HTTP 200/4xx from business rules, not 500 from emit. Confirm a new `workflow_events` row: `event_type = job_action`, `entity_type = job`. If a matching enabled workflow exists (`job` / `job_action`), confirm `workflow_runs.event_id` matches that event where the run was event-driven.
2. **Schedule vendor assign** — `POST /api/admin/schedules/{id}/assign` with `{ "vendor_id": "…" }`. Expect `workflow_events.event_type = schedule_vendor_assigned`, `entity_type = schedule`.
3. **Schedule create (admin)** — `POST /api/admin/schedules` with valid `job_id`, `start_at`, `end_at`. Expect `schedule_created` event; optional `workflow_runs` if workflows are configured.
4. **Reschedule link** — `POST /api/action-links/consume-reschedule` with valid token and window. Expect `action_link_consumed` and workflow fan-out analogous to token consume.
5. **Charge** — `POST /api/admin/jobs/{id}/charges` with adjustment/fee. Expect `charge_posted` on `job` (event type not yet in workflow vocab UI; audit trail is in `workflow_events`).
6. **Payments run** — `POST /api/admin/payments/run` with a body that yields a succeeded payment from the backend. Expect `payment_succeeded`, `entity_type = payments`. For a hard failure response (non–`requires_action`), expect `payment_failed`.
7. **GL post schedule** — `POST /api/admin/schedules/{id}/post-completion` (completed schedule). Expect `schedule_completion_gl_posted` when a journal entry is created (not when `skipped: true`).
8. **GL customer payment / vendor payout** — `post-customer-payment` / `post-vendor-payout`. Expect `schedule_customer_payment_gl_posted` / `schedule_vendor_payout_gl_posted` after successful post.
9. **Contact create/archive** — `POST /api/admin/contacts`; `POST …/contacts/{id}/archive` and `…/unarchive`. Expect `contact_created`, `contact_archived`, `contact_unarchived`.
10. **Customer member** — `POST /api/admin/customer-members`. Expect `customer_member_created`.
11. **Job archive/vendor/location** — `POST …/jobs/{id}/archive`, `unarchive`, `assign-vendor`, `PATCH …/location`. Expect `job_archived`, `job_unarchived`, `job_vendor_reassigned`, `job_location_updated`.
12. **Schedule location** — `PATCH /api/admin/schedules/{id}/location`. Expect `schedule_location_updated`, `entity_type = schedule`.
13. **GL accounts** — `POST` / `PATCH /api/admin/financials/accounts`. Expect `gl_account_created` / `gl_account_updated`.
14. **Document upload** — `POST /api/admin/documents/upload`. Expect `document_uploaded`.
15. **Vendor link/policy** — vendor contact POST/DELETE; `PATCH …/payout-policy`. Expect `vendor_contact_linked`, `vendor_contact_unlinked`, `vendor_payout_policy_updated`.
16. **Book v2** — `POST …/opportunity-discount`, `ensure-customer` (with public org env), `service-details`. Expect discount apply/clear, `customer_ensured_for_booking`, `book_v2_service_details_saved`.

## Full route list

Coverage legend:

- **direct** — imports and calls **`emitEvent`**.
- **indirect — …** — calls a helper that calls **`emitEvent`** (or status bridge now backed by **`emitEvent`**).
- **not needed** — no meaningful durable mutation in this handler (validation/UI helpers) or operational entrypoint (manual workflow run).
- **missing (deferred)** — non-critical config/metadata; no event in this pass.
- **missing** — no **`emitEvent`** and not deferred by policy; critical domains in prior gaps are addressed (see “High-risk gaps (status after second pass)”).

| Route | Method | File | Criticality | Coverage | Notes |
|-------|--------|------|-------------|----------|-------|
| /api/action-links/consume-accept-job | POST | `web/app/api/action-links/consume-accept-job/route.ts` | critical | direct |  |
| /api/action-links/consume-reschedule | POST | `web/app/api/action-links/consume-reschedule/route.ts` | critical | direct |  |
| /api/action/[token]/consume | POST | `web/app/api/action/[token]/consume/route.ts` | critical | direct |  |
| /api/admin/actions/execute | POST | `web/app/api/admin/actions/execute/route.ts` | critical | indirect — `executeAdminAction` (`emitEvent` + status bridge) |  |
| /api/admin/addons | POST | `web/app/api/admin/addons/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/addons/[id] | DELETE | `web/app/api/admin/addons/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/addons/[id] | PATCH | `web/app/api/admin/addons/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/agent/v0/queue-definition | POST | `web/app/api/admin/agent/v0/queue-definition/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/agent/v1/record-overview-layout | POST | `web/app/api/admin/agent/v1/record-overview-layout/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/agent/v2/field-visibility | POST | `web/app/api/admin/agent/v2/field-visibility/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/communications/send | POST | `web/app/api/admin/communications/send/route.ts` | critical | indirect — `enqueueCanonicalOutboundMessage` |  |
| /api/admin/config/field-definition-visibility | PUT | `web/app/api/admin/config/field-definition-visibility/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/config/record-overview-layout | PUT | `web/app/api/admin/config/record-overview-layout/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/contacts | POST | `web/app/api/admin/contacts/route.ts` | critical | direct | `contact_created`. |
| /api/admin/contacts/[id] | PATCH | `web/app/api/admin/contacts/[id]/route.ts` | critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/contacts/[id]/archive | POST | `web/app/api/admin/contacts/[id]/archive/route.ts` | critical | direct | `contact_archived`. |
| /api/admin/contacts/[id]/unarchive | POST | `web/app/api/admin/contacts/[id]/unarchive/route.ts` | critical | direct | `contact_unarchived`. |
| /api/admin/customer-member-contacts | POST | `web/app/api/admin/customer-member-contacts/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/customer-member-contacts/[id] | DELETE | `web/app/api/admin/customer-member-contacts/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/customer-members | POST | `web/app/api/admin/customer-members/route.ts` | critical | direct | `customer_member_created`. |
| /api/admin/customer-members/[id] | DELETE | `web/app/api/admin/customer-members/[id]/route.ts` | non-critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/customer-members/[id] | PATCH | `web/app/api/admin/customer-members/[id]/route.ts` | non-critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/customer-person-role-types | POST | `web/app/api/admin/customer-person-role-types/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/customer-person-role-types/[id] | DELETE | `web/app/api/admin/customer-person-role-types/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/customer-person-role-types/[id] | PATCH | `web/app/api/admin/customer-person-role-types/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/customers/[id] | PATCH | `web/app/api/admin/customers/[id]/route.ts` | critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/departments | POST | `web/app/api/admin/departments/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/departments/[departmentId] | DELETE | `web/app/api/admin/departments/[departmentId]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/departments/[departmentId] | PATCH | `web/app/api/admin/departments/[departmentId]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/dev/create-org | POST | `web/app/api/admin/dev/create-org/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/discounts | POST | `web/app/api/admin/discounts/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/discounts/[id] | DELETE | `web/app/api/admin/discounts/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/discounts/[id] | PATCH | `web/app/api/admin/discounts/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/document-field-definitions | POST | `web/app/api/admin/document-field-definitions/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/document-field-definitions/[id] | DELETE | `web/app/api/admin/document-field-definitions/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/document-field-definitions/[id] | PATCH | `web/app/api/admin/document-field-definitions/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/documents/[id] | PATCH | `web/app/api/admin/documents/[id]/route.ts` | non-critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/documents/upload | POST | `web/app/api/admin/documents/upload/route.ts` | critical | direct | `document_uploaded`. |
| /api/admin/entity-labels | DELETE | `web/app/api/admin/entity-labels/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/entity-labels | PUT | `web/app/api/admin/entity-labels/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/field-definitions | POST | `web/app/api/admin/field-definitions/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/field-definitions/[id] | DELETE | `web/app/api/admin/field-definitions/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/field-definitions/[id] | PATCH | `web/app/api/admin/field-definitions/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/field-sections | POST | `web/app/api/admin/field-sections/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/field-sections/[id] | DELETE | `web/app/api/admin/field-sections/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/field-sections/[id] | PATCH | `web/app/api/admin/field-sections/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/financials/accounts | POST | `web/app/api/admin/financials/accounts/route.ts` | critical | direct | `gl_account_created`. |
| /api/admin/financials/accounts/[id] | PATCH | `web/app/api/admin/financials/accounts/[id]/route.ts` | critical | direct | `gl_account_updated`. |
| /api/admin/jobs | POST | `web/app/api/admin/jobs/route.ts` | critical | indirect — `initializeJobPricing` → `emitEvent` |  |
| /api/admin/jobs/[id] | PATCH | `web/app/api/admin/jobs/[id]/route.ts` | critical | direct | Also uses `emitStatusChangedEvent` → `emitEvent` and `overrideJobPricing` → `emitEvent` when pricing fields change. |
| /api/admin/jobs/[id]/apply-vendor-to-upcoming | POST | `web/app/api/admin/jobs/[id]/apply-vendor-to-upcoming/route.ts` | critical | direct |  |
| /api/admin/jobs/[id]/archive | POST | `web/app/api/admin/jobs/[id]/archive/route.ts` | critical | direct | `job_archived`. |
| /api/admin/jobs/[id]/assign-vendor | POST | `web/app/api/admin/jobs/[id]/assign-vendor/route.ts` | critical | direct | `job_vendor_reassigned`. |
| /api/admin/jobs/[id]/charges | POST | `web/app/api/admin/jobs/[id]/charges/route.ts` | critical | direct | `charge_posted` (add to `workflowVocab` when product needs workflow triggers). |
| /api/admin/jobs/[id]/location | PATCH | `web/app/api/admin/jobs/[id]/location/route.ts` | critical | direct | `job_location_updated`. |
| /api/admin/jobs/[id]/unarchive | POST | `web/app/api/admin/jobs/[id]/unarchive/route.ts` | critical | direct | `job_unarchived`. |
| /api/admin/locations | POST | `web/app/api/admin/locations/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/locations/[id] | PATCH | `web/app/api/admin/locations/[id]/route.ts` | non-critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/opportunities/[id] | PATCH | `web/app/api/admin/opportunities/[id]/route.ts` | critical | direct | Also uses `emitStatusChangedEvent` → `emitEvent` when `status_key` changes. |
| /api/admin/opportunity-customer-members/[id] | PATCH | `web/app/api/admin/opportunity-customer-members/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/option-sets | POST | `web/app/api/admin/option-sets/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/option-sets/[setKey] | DELETE | `web/app/api/admin/option-sets/[setKey]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/option-sets/[setKey] | PATCH | `web/app/api/admin/option-sets/[setKey]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/option-sets/[setKey]/items | POST | `web/app/api/admin/option-sets/[setKey]/items/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/option-sets/[setKey]/items/[itemId] | DELETE | `web/app/api/admin/option-sets/[setKey]/items/[itemId]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/option-sets/[setKey]/items/[itemId] | PATCH | `web/app/api/admin/option-sets/[setKey]/items/[itemId]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/org-settings | PATCH | `web/app/api/admin/org-settings/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/org/industry | PATCH | `web/app/api/admin/org/industry/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/payments/[id] | PATCH | `web/app/api/admin/payments/[id]/route.ts` | critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/payments/run | POST | `web/app/api/admin/payments/run/route.ts` | critical | direct | `payment_succeeded` / `payment_failed` from backend JSON (see explicit boundary note); no extra workflow fan-out in route. |
| /api/admin/person-relationship-type-settings | POST | `web/app/api/admin/person-relationship-type-settings/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/person-relationship-type-settings/[id] | DELETE | `web/app/api/admin/person-relationship-type-settings/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/person-relationship-type-settings/[id] | PATCH | `web/app/api/admin/person-relationship-type-settings/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/persons | POST | `web/app/api/admin/persons/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/persons/[id] | PATCH | `web/app/api/admin/persons/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pipeline-stages | POST | `web/app/api/admin/pipeline-stages/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pipeline-stages/[id] | DELETE | `web/app/api/admin/pipeline-stages/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pipeline-stages/[id] | PATCH | `web/app/api/admin/pipeline-stages/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pipelines | POST | `web/app/api/admin/pipelines/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pipelines/[id] | DELETE | `web/app/api/admin/pipelines/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pipelines/[id] | PATCH | `web/app/api/admin/pipelines/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing-dimension-values | POST | `web/app/api/admin/pricing-dimension-values/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing-dimension-values/[id] | DELETE | `web/app/api/admin/pricing-dimension-values/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing-dimension-values/[id] | PATCH | `web/app/api/admin/pricing-dimension-values/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing-dimensions | POST | `web/app/api/admin/pricing-dimensions/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing-dimensions/[id] | DELETE | `web/app/api/admin/pricing-dimensions/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing-dimensions/[id] | PATCH | `web/app/api/admin/pricing-dimensions/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing-modes | POST | `web/app/api/admin/pricing-modes/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing-modes/[id] | DELETE | `web/app/api/admin/pricing-modes/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing-modes/[id] | PATCH | `web/app/api/admin/pricing-modes/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing/first-clean-prices | POST | `web/app/api/admin/pricing/first-clean-prices/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing/first-clean-prices/[id] | PATCH | `web/app/api/admin/pricing/first-clean-prices/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing/matrix | POST | `web/app/api/admin/pricing/matrix/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing/matrix/[id] | PATCH | `web/app/api/admin/pricing/matrix/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing/recurring-prices | POST | `web/app/api/admin/pricing/recurring-prices/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/pricing/recurring-prices/[id] | PATCH | `web/app/api/admin/pricing/recurring-prices/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/rbac/grants | PUT | `web/app/api/admin/rbac/grants/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/rbac/roles | POST | `web/app/api/admin/rbac/roles/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/rbac/roles/[role_key] | PATCH | `web/app/api/admin/rbac/roles/[role_key]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/schedules | POST | `web/app/api/admin/schedules/route.ts` | critical | direct |  |
| /api/admin/schedules/[id] | PATCH | `web/app/api/admin/schedules/[id]/route.ts` | critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/schedules/[id]/assign | POST | `web/app/api/admin/schedules/[id]/assign/route.ts` | critical | direct |  |
| /api/admin/schedules/[id]/assignment | PATCH | `web/app/api/admin/schedules/[id]/assignment/route.ts` | critical | direct | `assignment_status_changed` (not in workflow vocab UI yet). |
| /api/admin/schedules/[id]/cancel | POST | `web/app/api/admin/schedules/[id]/cancel/route.ts` | critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/schedules/[id]/location | PATCH | `web/app/api/admin/schedules/[id]/location/route.ts` | critical | direct | `schedule_location_updated`, `entity_type` `schedule`. |
| /api/admin/schedules/[id]/post-completion | POST | `web/app/api/admin/schedules/[id]/post-completion/route.ts` | critical | direct | `schedule_completion_gl_posted` when entry created (not skipped-only). |
| /api/admin/schedules/[id]/post-customer-payment | POST | `web/app/api/admin/schedules/[id]/post-customer-payment/route.ts` | critical | direct | `schedule_customer_payment_gl_posted`. |
| /api/admin/schedules/[id]/post-vendor-payout | POST | `web/app/api/admin/schedules/[id]/post-vendor-payout/route.ts` | critical | direct | `schedule_vendor_payout_gl_posted`. |
| /api/admin/schedules/[id]/reschedule | POST | `web/app/api/admin/schedules/[id]/reschedule/route.ts` | critical | direct |  |
| /api/admin/send-password-reset | POST | `web/app/api/admin/send-password-reset/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/service-offerings | POST | `web/app/api/admin/service-offerings/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/service-offerings/[id] | DELETE | `web/app/api/admin/service-offerings/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/service-offerings/[id] | PATCH | `web/app/api/admin/service-offerings/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/service-plan-templates | POST | `web/app/api/admin/service-plan-templates/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/service-plan-templates/[id] | DELETE | `web/app/api/admin/service-plan-templates/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/service-plan-templates/[id] | PATCH | `web/app/api/admin/service-plan-templates/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/status-definitions | POST | `web/app/api/admin/status-definitions/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/status-definitions/[id] | DELETE | `web/app/api/admin/status-definitions/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/status-definitions/[id] | PATCH | `web/app/api/admin/status-definitions/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/subscriptions/[id] | PATCH | `web/app/api/admin/subscriptions/[id]/route.ts` | critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/subscriptions/[id]/generate-next | POST | `web/app/api/admin/subscriptions/[id]/generate-next/route.ts` | critical | indirect — `generateNextSubscriptionSchedule` → `emitEvent` |  |
| /api/admin/tenant-bootstrap | POST | `web/app/api/admin/tenant-bootstrap/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/users | POST | `web/app/api/admin/users/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/users/[userId]/remove | POST | `web/app/api/admin/users/[userId]/remove/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/users/[userId]/role | PATCH | `web/app/api/admin/users/[userId]/role/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/vendors/[id] | PATCH | `web/app/api/admin/vendors/[id]/route.ts` | critical | indirect — `emitStatusChangedEvent` → `emitEvent` |  |
| /api/admin/vendors/[id]/contacts | POST | `web/app/api/admin/vendors/[id]/contacts/route.ts` | critical | direct | `vendor_contact_linked`. |
| /api/admin/vendors/[id]/contacts/[contactId] | DELETE | `web/app/api/admin/vendors/[id]/contacts/[contactId]/route.ts` | critical | direct | `vendor_contact_unlinked`. |
| /api/admin/vendors/[id]/payout-policy | PATCH | `web/app/api/admin/vendors/[id]/payout-policy/route.ts` | critical | direct | `vendor_payout_policy_updated`. |
| /api/admin/vertical-bootstrap | POST | `web/app/api/admin/vertical-bootstrap/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/verticals | POST | `web/app/api/admin/verticals/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/verticals/[id] | PATCH | `web/app/api/admin/verticals/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/work-units | POST | `web/app/api/admin/work-units/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/work-units/[id] | DELETE | `web/app/api/admin/work-units/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/work-units/[id] | PATCH | `web/app/api/admin/work-units/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/workflows | POST | `web/app/api/admin/workflows/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/workflows/[id] | DELETE | `web/app/api/admin/workflows/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/workflows/[id] | PATCH | `web/app/api/admin/workflows/[id]/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/workflows/[id]/actions | PUT | `web/app/api/admin/workflows/[id]/actions/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/workflows/[id]/conditions | PUT | `web/app/api/admin/workflows/[id]/conditions/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/workflows/[id]/run | POST | `web/app/api/admin/workflows/[id]/run/route.ts` | non-critical | not needed | Manual workflow execution entrypoint. |
| /api/admin/workspace-kpi-placements | DELETE | `web/app/api/admin/workspace-kpi-placements/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/workspace-kpi-placements | PATCH | `web/app/api/admin/workspace-kpi-placements/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/admin/workspace-kpi-placements | POST | `web/app/api/admin/workspace-kpi-placements/route.ts` | non-critical | missing (deferred) | Configuration or metadata surface. |
| /api/book-v2/confirm | POST | `web/app/api/book-v2/confirm/route.ts` | critical | direct |  |
| /api/book-v2/ensure-customer | POST | `web/app/api/book-v2/ensure-customer/route.ts` | critical | direct | `customer_ensured_for_booking` when `ALLOY_PUBLIC_ORG_ID` set. |
| /api/book-v2/opportunity-discount | POST | `web/app/api/book-v2/opportunity-discount/route.ts` | critical | direct | `opportunity_discount_applied` / `opportunity_discount_cleared`. |
| /api/book-v2/quote-refine | POST | `web/app/api/book-v2/quote-refine/route.ts` | critical | not needed | Quote refinement helper; verify downstream persistence separately. |
| /api/book-v2/quote-start | POST | `web/app/api/book-v2/quote-start/route.ts` | critical | direct |  |
| /api/book-v2/service-details | POST | `web/app/api/book-v2/service-details/route.ts` | critical | direct | `book_v2_service_details_saved`. |
| /api/book-v2/specialty-quote-start | POST | `web/app/api/book-v2/specialty-quote-start/route.ts` | critical | direct |  |
| /api/book-v2/validate-promo | POST | `web/app/api/book-v2/validate-promo/route.ts` | critical | not needed | Validates promo only; no durable CRM mutation in this route. |
| /api/leads/gutters | POST | `web/app/api/leads/gutters/route.ts` | critical | direct |  |
| /api/vendor-application | POST | `web/app/api/vendor-application/route.ts` | non-critical | direct |  |

## Related documentation

- `docs/system/actions-and-workflows.md`
- `docs/system/api-contracts.md`
- `docs/execution/known-gaps.md`
