# Entity / Record / Resolver API

**Domain size:** ~126 route handlers. Full list: [`api-index.md` → Entity / Record / Resolver](api-index.md#entity--record--resolver).

The largest domain. Covers the canonical **entity GET** (the record-of-truth read behind every drawer/focus panel) plus CRM record CRUD: persons, contacts, customers and members, opportunities, jobs, schedules, locations, vendors, subscriptions, payments, financials, operational tasks, tours, processing cases, placement candidates, and childcare operational records.

---

## Role in the platform

Queue rows are previews. **Authoritative record detail is resolved here**, via the entity GET and the per-resource routes. Drawer/focus-panel view models compose on top of these reads (see [`workspace-api.md`](workspace-api.md) for the view-model routes).

---

## Auth & org scoping

- **Auth:** `getAdminContextCached` (org) + `getAdminAccessContextCached` (scope) is the dominant pattern; CRM record families (jobs, opportunities, schedules, persons) layer department/site scope. Mutations frequently also require `requireAdminOrOps`.
- **Scope:** This domain is where deny-by-default matters most. Single-record reads call `assertEntityDrawerRecordReadable` / `assertRowOrg`; out-of-scope or cross-tenant ids return **404**, not foreign data. Every query filters `org_id` because the service-role client bypasses RLS.

---

## Canonical route: `GET /api/admin/entity/[type]/[id]`

Source: `web/app/api/admin/entity/[type]/[id]/route.ts`.

- **Purpose:** Single composed record read for the drawer/focus-panel. One route, many entity types.
- **Allowed `type`:** `jobs`, `opportunities`, `contacts`, `customers`, `customer_members`, `persons`, `schedules`, `discount_redemptions`, `workflows`, `vendors`, `subscriptions`, `locations`, `payments`, `service_offerings`, `service_plan_templates`, `addons`, `documents`. Unknown type/id → `400`.
- **Auth:** `getAdminContextCached` + `getAdminAccessContextCached`. Scope gate via `assertEntityDrawerRecordReadable` (skipped for `id === "new"`, `opportunities`, `addons`).
- **Org model (documented in-source):**
  - *Tenant-scoped* rows (have `org_id`, or verified via FK): jobs, opportunities, contacts, customers, schedules, locations, workflows, vendors, subscriptions, documents, payments, customer_members, persons, service_offerings, service_plan_templates.
  - *Global / catalog* (no org on primary table): `verticals`, `discount_codes`, `assignment_statuses`, `job_statuses`, `location_types` (joins only); `addons` → `pricing_addons` (vertical-scoped).
  - `discount_redemptions` has no `org_id`; access allowed when any linked customer/job/opportunity/contact is in caller org.
- **Response (Phase 2D — fully migrated):** the standard success envelope `{ ok: true, data: { entity }, correlation_id }`. The **entity payload shape is unchanged** — the same bare record enriched with `_`-prefixed display fields (`_status_display`, `_primary_contact_name`, `_counts`, `_linked_*`, etc.) now lives at `data.entity`. Opportunities delegate to `respondOpportunityEntityGet`; jobs to `resolveJobRecord` (RRS) and include `_rrs` (read as `data.entity._rrs`). `id === "new"` returns `data.entity === { _create: true }`. Opportunity surfaces (`drawer_visible` / `drawer_primary` / `full` / `relationship_member_persons`) wrap the same way and **preserve the `X-Alloy-Entity-Surface` / `X-Alloy-Opp-Enrich` / `X-Alloy-Server-Duration` perf headers**; the high-throughput `full` surface builds the envelope JSON string directly so the (large) record is serialized only once. Active consumers unwrap with the shared helper `web/lib/api/unwrapEntityRecord.ts`.
- **Error modes (Phase 2 migrated):** all error exits use the standard failure envelope `{ ok: false, error: { code, message }, correlation_id }` via `apiError` — `400 BAD_REQUEST` (invalid type/id), `404 NOT_FOUND` (not found / out of scope), `500 INTERNAL` (unexpected). **HTTP status codes are preserved exactly**; the bare-string `"Not found"` body is gone (including the two former bare-string exits in `respondOpportunityEntityGet`). See [`api-response-contract.md`](api-response-contract.md).
- **Surface param:** `?surface=` resolves record surface (`full` default) for RRS-backed types.
- **Perf:** Wrapped by an `ADMIN_PERF_TRACE` timing passthrough; person payload build is timed.

**Related reads:** `GET /api/admin/related/[entity]/[id]` (related-records panel), `GET /api/admin/global-search` (see workspace), `POST /api/admin/intake/record-resolution`.

---

## Resource families (CRUD)

Each family follows: `GET`/`POST` on the collection, `GET`/`PATCH`/`DELETE` on `/[id]`, plus verb sub-routes for state changes. Tables touched per route are in [`api-index.md`](api-index.md).

| Family | Base path | Notable sub-routes | Primary tables |
|--------|-----------|--------------------|----------------|
| Persons | `/api/admin/persons` | `/[id]` | `persons`, `customer_persons`, `person_relationships`, `person_locations` |
| Contacts (compat) | `/api/admin/contacts` | `/[id]/archive`, `/unarchive` | `contacts` |
| Customers & members | `/api/admin/customers`, `/api/admin/customer-members`, `/api/admin/customer-member-contacts` | `/[id]/household-primary-contact` | `customers`, `customer_members`, `customer_member_contacts` |
| Opportunities | `/api/admin/opportunities/[id]` | `/decision-split`, `/form-send`, `/delete`, `/delete-preview`, `/placement-candidates`, `/enrollment-packets`, `/drawer-operational-bootstrap`, `/stage-transition-reconciliation/preflight` | `opportunities` |
| Jobs | `/api/admin/jobs` | `/[id]/charges`, `/payments`, `/payout`, `/assign-vendor`, `/archive`, `/location` | `jobs`, `assignments` |
| Schedules | `/api/admin/schedules` | `/[id]/assign`, `/reschedule`, `/cancel`, `/post-completion`, `/post-customer-payment`, `/post-vendor-payout` | `schedules`, `assignments` |
| Locations | `/api/admin/locations` | `/[id]` | `locations`, `person_locations` |
| Vendors | `/api/admin/vendors/[id]` | `/contacts`, `/payout`, `/payout-policy`, `/documents/signed-url` | `vendors`, `contacts` |
| Subscriptions | `/api/admin/subscriptions/[id]` | `/generate-next` | `customer_subscriptions`, `schedules` |
| Payments / financials | `/api/admin/payments`, `/api/admin/financials/*` | `/run`, ledger/journal/accounts/statements/snapshot | `payments`, `payment_allocations`, financial ledger tables |
| Operational tasks | `/api/admin/operational-tasks` | `/[id]` | operational work tables (Task Assist–sourced) |
| Tours | `/api/admin/tours/*` | `bookings/[bookingId]/{confirm,cancel,complete,no-show,reschedule}`, `availability-rules`, `slots` | tour booking tables |
| Childcare operational | `/api/admin/child-enrollment-agreements/*`, `/api/admin/child-placements`, `/api/admin/placement-candidates/*` | agreement `ending`/`ended`/`cancel`, candidate `manual-position`/`overrides` | `child_enrollment_agreements`, `child_placements`, placement candidate tables (flag-gated) |
| Processing cases | `/api/admin/processing/cases/[caseId]/*` | `approve`, `classification`, `recommendation`, `form-draft/*` | processing/case tables |

---

## Validation & side effects

- **Validation:** Mostly manual field/UUID checks with `400` on bad input. Financial and schedule mutations validate amounts/dates.
- **Side effects:** Financial, schedule, vendor-payout, and opportunity state-change routes emit workflow events and/or post ledger entries through server-side helpers (`executeAdminAction`, workflow run helpers). Payment posting and payout routes are operational-truth writes — they are **not** "config" and route through audited paths. Do not replicate these as direct writes.

---

## Notes & cautions

- **Widening entity GET responses** affects every drawer and RRS consumer — coordinate with drawer VM contracts (`docs/system/drawer-doctrine.md`, AdminV2 performance doctrine). The Phase 2D envelope is an **outer wrapper only**: the record inside `data.entity` is byte-for-byte the prior shape, and consumers unwrap before feeding readiness predicates / snapshot caches, so composed-payload readiness and reveal gates are unchanged.
- `contacts` is **compatibility infrastructure**; prefer `persons` + `customer_persons` for human identity (project doctrine).
- The canonical entity GET is now **fully standardized** (Phase 2D — success + errors). Per-resource CRUD families in this domain still carry mixed success envelopes, tracked in the [audit](api-documentation-audit.md).

Source root: `web/app/api/admin/` (entity, persons, contacts, customers, opportunities, jobs, schedules, locations, vendors, subscriptions, payments, financials, tours, processing, child-*, placement-candidates).
