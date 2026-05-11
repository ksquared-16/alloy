# Tour Scheduling V1 — Enrollment CRM Completion

## 1. Overview

This sprint delivers **Tour Scheduling V1** as a first-class Alloy capability for enrollment CRM: admin-defined **availability rules**, **token-scoped public booking**, and **opportunity-attached tour appointments** with clear separation from queue previews and from the existing **`schedules`** (job-bound) model.

**Sources of truth:** Step 0 audit (`docs/sprints/…` conversation / `docs/system/*`, `docs/execution/*`, repo inspection) and Step 1 design decisions. Implementation must stay aligned with **`docs/system/record-system.md`**, **`docs/system/workspace-system.md`**, **`docs/system/actions-and-workflows.md`**, **`docs/system/entity-model.md`**, **`docs/system/configuration-system.md`**, and **`docs/product/documents-and-forms.md`**.

**Outcome:** Operators and families can book tours against real slots; **`tour_bookings`** holds scheduling truth; **opportunities** remain the CRM lifecycle anchor; **workflow_events** capture tour lifecycle; queues continue as **selection/preview only** with compatibility via metadata mirror for existing pipeline UX.

---

## 2. Doctrine / System Boundaries

| Principle | Implication for this sprint |
|-----------|------------------------------|
| **Queues = selection/preview only** | Never persist booking decisions from queue row payloads; always **entity GET** (or dedicated booking read) before mutations; queue may show derived `tour_date` / time from resolver or mirrored metadata only. |
| **Opportunity/person-first CRM** | Bookings reference **`opportunity_id`**; prefer **`primary_person_id`** when recording “who”; do not treat **`contacts`** as long-term identity for new paths (`entity-model.md`). |
| **Lifecycle → `workflow_events`** | Tour transitions emit the **locked** tour event types; **`opportunity_status_changed`** fires **only** when `opportunities.status_key` actually changes (`emitStatusChangedEvent` / `updateOpportunityStatusWithEvent` patterns). |
| **No `tour_scheduled` workflow event name** | Avoid collision with opportunity **status_key** `tour_scheduled`; use locked list in §3. |
| **UI maps through record layout system** | Opportunity **Tour** surface is **layout-driven** (`record_drawer_layouts` / `record_layouts`), not a one-off hardcoded drawer fork. |
| **Config/metadata where possible** | Availability rules and org policy knobs live in **DB + metadata**; avoid magic strings in React for keys already governed by status definitions or layouts. |
| **Do not reuse `schedules` for tours** | **`schedules`** remains job-bound; tours use **`tour_bookings`** only. |

---

## 3. Locked V1 Decisions

- **New tables:** `tour_availability_rules`, `tour_bookings`.
- **Do not reuse** `public.schedules` for tour appointments.
- **`tour_bookings`** is the **scheduling source of truth** (`start_at`, `end_at`, `timezone`, booking `status_key`, etc.).
- **Opportunity** remains the **CRM lifecycle** source of truth (`status_key`, work unit, customer/person links).
- **Metadata mirror:** On **confirmed** bookings only, mirror wall date/time to **`opportunities.metadata.tour_date`** and **`tour_time`** (and existing consumers such as queues, Needs Attention, CRM compact).
- **Pending bookings block slots** (capacity / conflict rules treat pending like confirmed for blocking).
- **At most one active non-terminal booking per opportunity** (enforce in service layer + DB constraint where expressible).
- **Workflow event names (exact):** `tour_requested`, `tour_booking_pending`, `tour_confirmed`, `tour_rescheduled`, `tour_canceled`, `tour_no_show`, `tour_completed`.
- **Do not** introduce a workflow event type named `tour_scheduled` (collides with opportunity status vocabulary).

---

## 4. Scope

- Schema: **`tour_availability_rules`**, **`tour_bookings`** with org scoping, FKs, indexes, RLS, and constraints supporting locked rules.
- **Availability engine:** slot generation from rules (day-of-week, wall times, timezone), buffers, blocking by pending + confirmed bookings, `max_bookings_per_slot`.
- **Booking service:** create, confirm, reschedule, cancel, complete, no-show; single-flight active booking per opportunity.
- **Opportunity integration:** status transitions via existing helpers where status changes; **metadata mirror** on confirm only.
- **Events:** emit locked tour `event_type` values via **`emitEvent`**; **`opportunity_status_changed`** only when `status_key` changes.
- **Admin UI:** layout-driven **Tour** section on opportunity drawer; **availability settings** CRUD.
- **Public booking:** token-scoped flow reusing **public link / forms** patterns (`form_public_links`, resolve/submit, service role on server only).
- **Tests:** service, events, mirror, queue compatibility assumptions, critical public/admin paths.
- **Docs:** update matching topic files **in same PR** as behavior when required by `operating-doctrine.md`; regenerate **`docs/supabase/reference/*.csv`** after schema lands.

---

## 5. Explicit Non-Scope

- External calendar sync (Outlook/Google).
- SMS/email reminders (workflows may subscribe later; no comms build in this sprint).
- AI scheduling or slot recommendations.
- Deposits / payments for tour holds.
- Staff roster optimization beyond optional `user_id` on rules.
- Changing global meaning of **`schedules`** or creating job rows solely to host tours.
- Retiring **`metadata.tour_*`** read paths in queues in V1 (mirror keeps compatibility).

---

## 6. Data Model Summary

### `tour_availability_rules`

- **Tenant:** `org_id` (required).
- **Scope:** optional `location_id`, optional `user_id` (host); `day_of_week`, `start_time`, `end_time`, `timezone`.
- **Slot policy:** `slot_duration_minutes`, `buffer_minutes`, `max_bookings_per_slot`, `approval_required`, `is_active`, `metadata` (jsonb).

### `tour_bookings`

- **Tenant + anchor:** `org_id`, `opportunity_id` (FK), `location_id`.
- **People (nullable as applicable):** `primary_person_id`, `primary_contact_id` (legacy only if needed), `requested_by_user_id` (admin).
- **Time:** `start_at`, `end_at`, `timezone` (timestamptz + IANA).
- **Booking lifecycle `status_key`:** e.g. `requested`, `pending_approval`, `confirmed`, `rescheduled`, `canceled`, `completed`, `no_show` (finalize enum in migration with CHECK).
- **Provenance:** `source` (`admin`, `public_link`, `form_submission`, `automation`), optional `form_submission_id`, `form_public_link_id`.
- **Cancel audit:** `canceled_at`, `canceled_by`, `cancel_reason`; optional `rescheduled_from_booking_id`.
- **metadata** jsonb for extensibility.

### Constraints (conceptual)

- **One active non-terminal booking per opportunity** (partial unique or enforced in transaction + CHECK/trigger — implementation choice on Card 1).
- Valid window: `end_at > start_at`.

---

## 7. Event Strategy

All tour events: **`emitEvent`** with **`entity_type` = `tour_bookings`**, **`entity_id` = booking id**, payload includes at minimum **`opportunity_id`**, **`org_id`**, booking time window, `status_key`, `source`, and actor/provenance fields as applicable. Then **`executeWorkflowRun`** fan-out as today for matching workflows.

| `event_type` | When |
|--------------|------|
| `tour_requested` | Booking created in an initial requested state (e.g. before slot finalization if split; otherwise align with “create” — implementation may combine with next if redundant; **prefer single emission per user-visible request**). |
| `tour_booking_pending` | Booking enters **pending approval** (slot held, blocks others per locked rules). |
| `tour_confirmed` | Booking becomes **confirmed** (auto or after admin). |
| `tour_rescheduled` | Successful reschedule (times and/or location changed per product rules). |
| `tour_canceled` | Booking becomes **canceled**. |
| `tour_no_show` | Admin marks **no_show**. |
| `tour_completed` | Admin marks **completed**. |

**`opportunity_status_changed`:** Call **`emitStatusChangedEvent`** / **`updateOpportunityStatusWithEvent`** only when **`opportunities.status_key`** changes (e.g. confirm → `tour_scheduled` per org policy). Never emit `tour_scheduled` as a **workflow `event_type`**.

---

## 8. Opportunity Integration

- **Status:** Map booking lifecycle to opportunity **`status_key`** via **configurable defaults** (childcare enrollment: e.g. confirm → `tour_scheduled`, complete → `tour_completed`, no-show → `tour_no_show`) using **`validateStatusTransition`** + **`assertAllowedStatusKey`**.
- **Metadata mirror:** When booking reaches **`confirmed`**, set **`metadata.tour_date`** / **`tour_time`** derived from booking instant + timezone; clear or update on cancel/reschedule per product rule (document: **on confirm write; on cancel clear mirror if no other confirmed** — Card 4 detail).
- **Drawer / entity GET:** Hydrate active + recent **`tour_bookings`** for opportunity record payload (or dedicated include) so Tour section is authoritative for times; queue still non-authoritative.
- **Needs Attention / queues:** Continue to use mirrored **`tour_date`** for existing **`tour_date_passed`** / sort paths in V1 without requiring queue SQL to join `tour_bookings` immediately.

---

## 9. UI Surfaces

| Surface | Description |
|---------|-------------|
| **Opportunity drawer — Tour** | Section keyed in **`record_drawer_layouts` / `record_layouts`** (e.g. `tour`); renders booking summary, actions, slot picker (admin); post-mutation refresh via entity GET. |
| **Admin — availability settings** | CRUD **`tour_availability_rules`** under Admin V2 settings (exact route TBD in implementation; align with `configuration-system.md`). |
| **Public booking** | Token-scoped page or embed; availability fetch + create booking; ties to **`form_public_links`** / submissions where practical. |
| **Queues** | Preview-only display of tour date/time from mirrored metadata or resolver-enriched preview (no new queue-as-truth behavior). |

---

## 10. API Shape (high level)

**Admin (authenticated, org-scoped)**

- `GET` availability for org/location/user + date range → slot list (computed).
- `POST` create booking (opportunity-scoped or nested under opportunity).
- `POST` confirm / reschedule / cancel / complete / no-show on `tour_bookings/:id`.

**Public (token-scoped)**

- `GET` availability (limited params).
- `POST` create booking (token binds org + opportunity or submission context per Card 7 design).

Exact paths under `web/app/api/admin/...` and `web/app/api/public/...` to be chosen during implementation; must not expose service-role clients to the browser (`api-contracts.md`).

---

## 11. Card Breakdown

### Card 0 — Audit validation

**Objective:** Re-verify Step 0 findings against the repo **immediately before coding** (schema, opportunity PATCH/event paths, queue metadata usage, public forms routes, `record_drawer_layouts` resolution). Update sprint doc or linked audit notes only if drift is found.

**Files likely touched:** `docs/sprints/05_2026/tour_scheduling_v1.md` (changelog note only); optionally `docs/execution/roadmap-and-gaps.md` if scope status changes; **no** `web/` or `supabase/` unless audit discovers a doc bug worth fixing in same PR as a one-line correction.

**Acceptance criteria:**

- [ ] Grep/read confirms: opportunities table has no native `tour_*` columns; existing `metadata.tour_date` / `tour_time` consumers (`QueueService`, attention resolver, drawer) documented with current paths.
- [ ] `emitStatusChangedEvent` / `updateOpportunityStatusWithEvent` call sites for opportunities reviewed; no plan to emit `tour_scheduled` as workflow `event_type`.
- [ ] `schedules` remains `job_id`-bound in schema reference after refresh (Card 1).
- [ ] Public forms entrypoints (`/api/public/forms/[token]/...`) identified for Card 7 reuse.

**Validation commands:** `rg "tour_date|tour_time|tour_booking"` in `web/`; `rg "emitStatusChangedEvent|updateOpportunityStatusWithEvent"` for opportunity flows; read `docs/supabase/reference/supabase_schema_columns.csv` for `schedules` / `opportunities` (current export; Card 1 re-runs `export:supabase-schema` after migrations).

**Doctrine risks to avoid:** Treating this card as implementation; skipping re-check of queue-truth boundaries; assuming CSV reference is current without `export:supabase-schema` after migrations.

#### Card 0 — Repo validation record (2026-05-11)

- **Opportunity columns:** `docs/supabase/reference/supabase_schema_columns.csv` shows **no** native `tour_*` columns; tour display uses **`opportunities.metadata`** (`tour_date`, `tour_time`, `next_follow_up_at`, notes). **`appointment_id`** exists as **text** (not a typed FK to a tour row today).
- **Forms engine tables:** `form_public_links` / `form_submissions` are **not** listed in the current exported `supabase_schema_columns.csv` (export likely predates or omits those tables in this snapshot). **Card 1** must run `npm run export:supabase-schema` after migrations so reference CSVs include new **`tour_*`** and any missing **`form_*`** rows per `operating-doctrine.md`.
- **`schedules.job_id`:** CSV shows `job_id` as **NOT NULL** on `public.schedules` — aligns with sprint decision **not** to reuse `schedules` for tours.
- **Opportunity status vs workflow `event_type`:** Enrollment seed workflow **`Enrollment: Schedule Tour Follow-up`** uses `workflows.event_type = **opportunity_schedule_tour_followup**`** (`supabase/migrations/20260430217000_enrollment_schedule_tour_workflow.sql`). **`tour_scheduled`** appears in repo as **`opportunities.status_key`** and labels, **not** as a workflow `event_type` in that migration. V1 locked tour events remain additive; avoid conflating with `opportunity_schedule_tour_followup`.
- **Drawer / layout today:** Tour capture is **`schedule_tour`** + **`ScheduleTourActionFormModal`** + metadata-driven fields in **`AdminEntityDrawer.tsx`**; **`record_drawer_layouts`** / **`isOpportunityTourFollowUpSection`** provide real extension points. A **dedicated layout-keyed “Tour” booking section** (slot picker, `tour_bookings` summary) is the **Card 6** target — not fully present as a single composable today.
- **Typecheck:** `cd web && npx tsc --noEmit` — **pass** (Card 0 run).

#### Card 1 — Implementation record (2026-05-11)

- **Migration:** `supabase/migrations/20260511143000_tour_scheduling_v1_foundation.sql` — tables, CHECKs, partial unique (one active non-terminal booking per opportunity), indexes, org-integrity triggers, RLS + grants (anon revoked), `set_updated_at` triggers.
- **Local `supabase db reset --local`:** Failed early on unrelated migration `20260328120000_firstfree4x120_discount_program.sql` (`discount_programs` missing in clean reset order) — **not** attributed to tour SQL; apply tour migration in a healthy local/remote DB to verify end-to-end.
- **`npm run export:supabase-schema`:** Not executed here — no `DATABASE_URL` / `SUPABASE_DB_URL` in this environment; **CSV reference files were not modified** (per doctrine: do not hand-edit; regenerate when DB is available).
- **Doctrine doc:** `docs/system/entity-model.md` updated in same change set (tour entities + `schedules` boundary).

---

### Card 1 — Data model + RLS + docs reference refresh

**Objective:** Add **`tour_availability_rules`** and **`tour_bookings`** migrations: PKs, FKs to `orgs`, `opportunities`, `locations`, optional `form_submissions` / `form_public_links`, CHECKs, partial unique for **one active non-terminal booking per opportunity**, indexes for availability queries and org scope. Enable RLS with policies consistent with other org-scoped tables (authenticated + service_role). Regenerate **`docs/supabase/reference/*.csv`**.

**Files likely touched:** `supabase/migrations/*_tour_scheduling_v1*.sql`; `docs/supabase/reference/*.csv`; `docs/system/entity-model.md` or `api-contracts.md` if new families need a representative row (same PR per doctrine).

**Acceptance criteria:**

- [ ] Tables exist with locked V1 semantics; `schedules` untouched for tours.
- [ ] RLS: no cross-org reads/writes; service role for server paths documented.
- [ ] Constraint: at most one active non-terminal booking per `opportunity_id` (DB or documented DB+app double enforcement).
- [ ] `npm run export:supabase-schema` (or project’s documented equivalent) run against DB with migration applied; CSVs committed.

**Validation commands:** `npm run export:supabase-schema`; local Supabase `db reset` / migration apply per team standard; optional `psql` `\d+ tour_bookings`.

**Doctrine risks to avoid:** Missing RLS; weak FK to wrong org; allowing multiple conflicting truths without constraint; hand-editing CSVs instead of regenerating.

---

### Card 2 — Availability engine

**Objective:** Pure server module: given org, location, optional user, date range, and ruleset, return **candidate slots** excluding blocked windows; apply **buffer**, **slot_duration_minutes**, **max_bookings_per_slot**; **pending + confirmed** bookings block; timezone-safe conversion.

**Files likely touched:** `web/lib/tours/*` (new); possibly `web/lib/admin/timezoneContract.ts` reuse; read-only access to `tour_availability_rules`, `tour_bookings`.

**Acceptance criteria:**

- [ ] Deterministic slot generation documented (in code comment or short module docstring): day-of-week, truncation, buffer semantics.
- [ ] Blocking includes **pending_approval** and **confirmed** (and any other statuses classified as “holding slot” in shared constant).
- [ ] Unit tests for edge cases: DST boundary (at least one fixture), empty rules, full day booked, max_bookings > 1.

**Validation commands:** `pnpm test` / `npm test` scoped to new test files (e.g. `web/tests/tours/availability.engine.test.ts`).

**Doctrine risks to avoid:** Using queue rows as input; caching slots in client as authority; ignoring org timezone policy.

---

### Card 3 — Booking service

**Objective:** Core transactional **booking service**: create (requested / pending per `approval_required`), confirm, reschedule, cancel, complete, no-show; enforce **single active non-terminal** booking; integrate with availability engine for validation.

**Files likely touched:** `web/lib/tours/bookingService.ts` (or similar); callers TBD for Cards 6–7; `web/lib/opportunityIdentity.ts` only if normalization needed for opportunity side-effects.

**Acceptance criteria:**

- [ ] All mutations run through one service layer with clear invariants (org match, opportunity exists, slot still free).
- [ ] Reschedule validates new window same as create.
- [ ] Cancel/complete/no-show are idempotent-safe or return clear errors on illegal transitions.

**Validation commands:** `pnpm test` / `npm test` for `web/tests/tours/bookingService*.test.ts`.

**Doctrine risks to avoid:** Splitting business rules across API routes without shared service; skipping org/opportunity scope checks.

---

### Card 4 — Opportunity integration

**Objective:** On **confirm** (and relevant transitions), **mirror** `tour_date` / `tour_time` to **`opportunities.metadata`**; on cancel/reschedule-out, update mirror per locked policy; apply **`status_key`** changes through **`validateStatusTransition`**, **`normalizeOpportunityWritePayload`**, **`updateOpportunityStatusWithEvent`** or **`emitStatusChangedEvent`** after persist.

**Files likely touched:** `web/lib/tours/opportunityTourMirror.ts` (new); `web/lib/opportunities/updateOpportunityStatusWithEvent.ts`; `web/lib/admin/emitStatusChangedEvent.ts` (callers only); possibly `web/lib/admin/opportunityEntityRecord.ts` for GET payload fields.

**Acceptance criteria:**

- [ ] Confirmed booking → metadata mirror matches booking wall date/time in chosen TZ policy.
- [ ] Opportunity status updates never bypass transition validators.
- [ ] Entity GET reflects booking summary for drawer consumers.

**Validation commands:** Targeted tests under `web/tests/tours/` and/or `web/tests/opportunities/`; manual smoke: confirm booking → `GET /api/admin/entity/opportunities/:id` shows mirror + booking.

**Doctrine risks to avoid:** Writing metadata without booking truth; updating `status_key` without `opportunity_status_changed` when key changes; person/contact writes violating `opportunityIdentity` rules.

---

### Card 5 — Event emission

**Objective:** Emit **`tour_requested`**, **`tour_booking_pending`**, **`tour_confirmed`**, **`tour_rescheduled`**, **`tour_canceled`**, **`tour_no_show`**, **`tour_completed`** via **`emitEvent`** with `entity_type = tour_bookings`; run **`executeWorkflowRun`** with `event_id`; **never** register workflows on a `tour_scheduled` **event_type**. Preserve **`opportunity_status_changed`** only when opportunity status changes.

**Files likely touched:** `web/lib/tours/tourEvents.ts` (new); `web/lib/emitEvent.ts` (reuse only); `web/lib/workflowRun.ts` (reuse only); booking service from Card 3; `docs/system/actions-and-workflows.md` when event catalog changes.

**Acceptance criteria:**

- [ ] Each booking transition emits the correct **single** event (no duplicate spam on retries).
- [ ] Workflow runs receive `event_id` where applicable (match existing status-change pattern).
- [ ] `opportunity_status_changed` emission unchanged in semantics when status updates accompany tour confirm.

**Validation commands:** Tests with mocked `emitEvent` / workflow runner; grep ensures no `event_type.*tour_scheduled` string for workflow events.

**Doctrine risks to avoid:** Skipping `emitEvent` for auditability; using `tour_scheduled` as workflow event name; emitting status changed without DB status update.

---

### Card 6 — Admin UI: drawer Tour section + availability settings

**Objective:** **Layout-driven** Tour section for opportunity drawer (registry + `record_drawer_layouts` / template updates or seed migration for default section); admin CRUD UI for **`tour_availability_rules`**.

**Files likely touched:** `web/components/admin/...` (Tour section); `web/lib/recordChrome/*`; `web/lib/admin/effectiveRecordDrawerLayout.ts` consumers; `web/app/adminV2/settings/...`; `web/app/api/admin/tour-availability-rules/**`; `supabase/migrations/*` for default layout rows if needed.

**Acceptance criteria:**

- [ ] Tour section visibility/order comes from effective drawer layout, not only hardcoded order.
- [ ] Admin can create/edit/disable rules per org/location/user.
- [ ] Drawer actions call admin APIs and refresh entity GET (no queue row mutation).

**Validation commands:** Manual QA checklist; `pnpm lint` / `pnpm test` for touched components if tests exist.

**Doctrine risks to avoid:** Hardcoding section only in `AdminEntityDrawer` without layout config; using queue data for slot picker; missing access scope (`getAdminAccessContextCached`) on new routes.

---

### Card 7 — Public booking surface

**Objective:** Token-scoped public flow: list availability, create **requested** / **pending_approval** booking, optional auto-confirm when `approval_required=false`; integrate with **`form_public_links`** / **`form_submissions`** where practical for intake + proof.

**Files likely touched:** `web/app/api/public/tour-booking/**` (or under `public/forms` extension); `web/lib/public/forms/*`; new thin `web/app/...` page or embed client; reuse `hashFormLinkToken` / org resolution patterns.

**Acceptance criteria:**

- [ ] No service key in browser; token validates server-side.
- [ ] Creates booking tied to **one opportunity** per token contract; respects single active booking rule.
- [ ] Emits `tour_requested` / `tour_booking_pending` / `tour_confirmed` per actual path.

**Validation commands:** `pnpm test` for new public route tests; manual curl/fetch against dev server.

**Doctrine risks to avoid:** Leaking `org_id` or PII in public responses; weak token entropy; booking without opportunity anchor.

---

### Card 8 — Testing + validation

**Objective:** Consolidate automated coverage: schema constraints (where testable), availability engine, booking service transitions, event list + no `tour_scheduled` workflow event, metadata mirror, queue filter compatibility (metadata present after confirm), and critical admin/public API contracts.

**Files likely touched:** `web/tests/tours/**`, `web/tests/api/**` as patterns dictate; CI config only if new suite path needed.

**Acceptance criteria:**

- [ ] CI-green test suite for new modules; regression tests for opportunity metadata consumers if touched.
- [ ] Explicit test that **`tour_scheduled` is not used as `workflow_events.event_type`** for tour flow.
- [ ] Smoke checklist documented in PR description for human QA.

**Validation commands:** `pnpm test` (full or `web` workspace); `pnpm lint`.

**Doctrine risks to avoid:** Tests that assert on queue row JSON as source of truth; skipping entity GET parity assertions.

---

Ready for Card 1 after human review (Card 0 validation complete — see §11 Card 0 validation record).
