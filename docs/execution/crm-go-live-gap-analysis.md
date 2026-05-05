# CRM go-live: gap analysis (strategy → build planning)

**References:** [`docs/strategy/crm-go-live.md`](../strategy/crm-go-live.md), [`docs/product/crm-system.md`](../product/crm-system.md), [`docs/product/communications.md`](../product/communications.md), [`docs/system/workspace-system.md`](../system/workspace-system.md), [`docs/system/entity-model.md`](../system/entity-model.md), [`docs/system/record-system.md`](../system/record-system.md), [`docs/system/actions-and-workflows.md`](../system/actions-and-workflows.md), [`docs/execution/roadmap-and-gaps.md`](roadmap-and-gaps.md), Supabase column reference `docs/supabase/reference/supabase_schema_columns.csv`.

**Method:** This document compares the **go-live definition** to **as-documented and as-implemented platform behavior** (no code in this file). “Supported” means the platform has tables, APIs, or documented flows that can back the workflow; gaps are product/UX/ops or unowned vertical paths, not a full code audit.

---

## 1. What already exists (inventory)

| Area | Current support (summary) |
|------|---------------------------|
| **Opportunities** | `opportunities` with `org_id`, `customer_id`, `work_unit_id`, `primary_person_id` / `primary_contact_id`, `pipeline_id` / `pipeline_stage_id`, `status` / `status_key`, `source`, `metadata`, financial/quote fields. Admin PATCH + entity GET; writes normalized person-first (`crm-system.md`, `entity-model.md`). |
| **Persons / customers / contacts** | `persons`, `customers`, `customer_persons`, `customer_members` (household/children), `contacts` (legacy compatibility). Identity policy: person-first for new CRM logic; contacts remain for integrations and aged rows. |
| **Communication (`communication_*`)** | `communication_threads`, `communication_messages`, `communication_provider_bindings`, `communication_message_reads`. Outbound SMS/email enqueue + worker delivery; inbound SMS → canonical persistence (backend); webhooks for delivery status (`communications.md`). Legacy `messages` / `messages_outbox` parallel path until retired. |
| **Workflow / events** | `workflow_events` via `emitEvent`; status transitions emit `opportunity_status_changed` / `entity_status_changed` and fan out to `executeWorkflowRun` (`actions-and-workflows.md`). Additional event types (e.g. `note_added`, `message_queued`, `schedule_created`) exist at integration points. |
| **Activity tracking** | No verified first-class **calls/tasks/meetings** model in this inventory. **Partial:** opportunity `metadata.notes` / PATCH notes with `note_added` event; workflow events as an audit stream; canonical messages as conversation history. **`activity_log`** exists in schema CSV but is **not** evidenced as the unified CRM timeline driver in `web/` grep pass — treat timeline composition as **implementation-defined**, not guaranteed complete. |
| **Queues / work units** | `work_units.queue_definition` + `QueueService` for lane previews; departments/sites/access scopes (`workspace-system.md`). **Critical rule:** queues are previews only; authority is entity GET / RRS patterns (`record-system.md`). |
| **Pipeline metadata** | `pipelines`, `pipeline_stages` (org-scoped, optional keys, GHL compatibility fields on CSV). |
| **Scheduling (tours)** | `schedules` tied to **`job_id`** (required in admin create API and NOT NULL in schema). `visit_type`, window, status, location, cancel/reschedule metadata. Department “today” hooks use schedules (`crm-system.md`). |
| **Enrollment-shaped data** | Jobs link `opportunity_id`; booking flows create/update jobs and schedules. Demo seeds suggest childcare-style opportunities exist in tooling but **public childcare inquiry** is not documented as a single shipped primitive (see §3). |

---

## 2. Go-live workflows → system support

| Workflow | Already supported | Partially supported | Missing / weak |
|----------|-------------------|---------------------|----------------|
| **Inquiry intake** | Opportunity + person creation paths exist (e.g. book-v2 quote-start is person-first; other leads use contact→opportunity helpers). `source`, `metadata`, org scoping. | **Childcare-specific** intake may reuse booking/lead routes or admin-only creation; **no unified “forms engine”** (`documents-and-forms.md`, `roadmap-and-gaps.md`). Attribution (campaign/location/program) depends on implementation per route. | **Dedicated inbound childcare inquiry** (public form → household + opportunity + work unit) as a **product-owned** path. **Inbound email** as a lead source (see §3). |
| **Messaging / follow-up** | Outbound SMS/email; threads on **primary entity**; drawer + quick send (`communications.md`). Inbound **SMS** to canonical store. | **Person vs contact** resolution on older rows; legacy workflow message paths. Thread UX is **entity-scoped only** — no org-wide inbox. | **Global triage inbox** (director sees all new inbound in one place). **Inbound email** threading/reply parity with SMS if email is primary for families. Notifications (header bell) not in V1 comms. |
| **Tour scheduling** | Schedule lifecycle, admin APIs, cancel/reschedule/action links, workflow hooks (`crm-system.md`). | Workspace surfaces that show **today’s schedules** for ops. | **First-class “tour”** UX on the **opportunity** without forcing operators through **job-first** mental model. Today **admin schedule POST requires `job_id`** — so CRM-only tours imply **creating or reusing a job** as a carrier (product pattern), unless requirements change. |
| **Pipeline tracking** | `pipeline_stage_id`, `status_key`, `work_unit_id`, queue lanes, drawer. Workflow on status change. | Board vs list parity with director mental model **not verified** per vertical. KPI routes vs queue summaries called out as **verification debt** (`crm-system.md`, `roadmap-and-gaps.md`). | SLA/staleness (“needs nudge”), assignment UX polish, consistent definitions across **department KPIs** and **queues**. |
| **Conversion to enrollment** | Customer + `customer_members` + `customer_persons`; jobs optionally tied to `opportunity_id`; subscriptions exist in schema for recurring patterns. | **Vertical-specific** “closed-won” may be a status/workflow package rather than one universal wizard. Book-v2 **confirm** path is **cleaning-shaped**, not asserted as childcare enrollment. | **Explicit childcare enrollment handoff**: defined terminal statuses, household completeness checks, optional documents checklist — **as a packaged CRM completion**, without billing (`crm-go-live.md` §4). |

---

## 3. Missing capabilities (thematic)

| Theme | Gap |
|-------|-----|
| **Inbound lead capture** | No documented **shared forms/intake engine**; inbound routes are **vertical/route-specific**. Email-as-lead not described in comms V1 doc (SMS inbound is). |
| **Messaging UX** | No **global inbox**; no **notification** surface; possible **email reply** gaps vs SMS; **dual legacy/canonical** paths increase operator confusion until retired. |
| **Tour scheduling** | **Job-required schedule** coupling; childcare director expects **tour ↔ family/opportunity** linkage **in UX**, not only underlying rows. |
| **Pipeline transitions / automation** | Workflows exist but **org playbooks** (when to move stage, tour-no-show, nurture) are **configuration + content**, not guaranteed. **Automation breadth** needs explicit CRM playbook per vertical. |
| **Activity timeline** | **Unified timeline** (notes + messages + stage changes + tours + tasks) not guaranteed; `activity_log` underutilized vs events scattered across tables/events. |
| **Reporting / KPI** | **Basic funnel metrics** (“inquiries, drop-offs, closed”) need **agreed definitions** and surfaces; queue vs KPI alignment is open (`crm-system.md`). |

---

## 4. Categorization

| Tier | Items |
|------|--------|
| **Must-have for CRM go-live** (per [`crm-go-live.md`](../strategy/crm-go-live.md)) | Person-first inquiry lands as **actionable opportunity** in correct **work unit**; **threaded comms** on the record; **pipeline visibility** in workspace; **tour time** on calendar or schedule with clear **opportunity/family** context; **conversion** to enrolled household (customer + members) **without** leaving Alloy for the CRM slice; **minimal reporting** (counts/stage funnel). |
| **Required to credibly “replace Procare” for the enrollment desk only** | **Director-grade inbound**: stable intake (web form or integrated source) + **inbound message visibility** (SMS + ideally email) + **tour workflow** that staff actually use daily. **Not** required for this slice: billing, attendance, full parent portal (`crm-go-live.md` §4). Full Procare parity beyond enrollment is **explicitly later**. |
| **Later** | Billing/tuition, attendance/staff scheduling platform, full parent portal, global inbox phase-2, BYO comms wizard, RRS unification for opportunities, legacy message retirement, document AI, deep automation library. |

---

## A. Gap table (workflow → current support → missing pieces)

| Workflow | Current support | Missing pieces |
|----------|-----------------|----------------|
| **Inquiry intake** | Opportunities + persons; some public/API intake; admin can mutate records | Childcare-owned **intake channel**; **forms** product or standardized API; **email/web lead** plumbing; **household** creation UX from inquiry; dedupe rules |
| **Messaging / follow-up** | Canonical outbound + inbound SMS; entity threads | **Org inbox** or equivalent triage; **email inbound/reply** story; notifications; legacy path clarity |
| **Tour scheduling** | `schedules` + workflows; job-scoped create | **Opportunity-centric tour UX**; optional **job-less tour** model **or** documented **enrollment job** pattern; reminder content |
| **Pipeline tracking** | Stages, queues, workflows | KPI/report **definitions** aligned with queues; staleness/ownership UX |
| **Conversion** | Customers/members/jobs exist | **Childcare enrollment** playbook (statuses, checklist, handoff) independent of **book-v2 confirm** |

---

## B. Build plan (4–6 weeks, indicative)

**Week 1–2 — Intake + identity**

- Define childcare **intake entry** (public form contract or admin flow): always yields `person` + `customer` (household) + `opportunity` + `work_unit` assignment + `source` attribution.
- Close **person-first** gaps on any remaining inbound paths; document **duplicate** handling.
- Seed/configure **pipeline stages** and **queue_definition** for enrollment lanes.

**Week 3–4 — Comms + tours**

- **Messaging:** Ensure drawer/quick send covers director daily use; decide **email inbound** MVP (if required); optional **“needs reply”** lane driven by unread/thread metadata (still not necessarily global inbox).
- **Tours:** Product decision on **job-carried schedules** vs future model; implement **opportunity ↔ schedule ↔ family** visibility in workspace/drawer; tour confirmation templates via existing workflow/comms patterns.

**Week 5–6 — Conversion + reporting**

- **Enrollment conversion:** Defined stage transitions, customer/member updates, opportunity terminal rules; optional documents checklist using existing upload (`documents-and-forms.md`).
- **Reporting V1:** Funnel by stage/source/site; exports or dashboard MVP; reconcile **KPI routes** with **QueueService** definitions.

---

## C. Dependencies (what must come first)

1. **Intake contract** — downstream data quality for messaging, tours, and reporting depends on consistent opportunity + household creation.
2. **Pipeline/work unit configuration** — queues and stages must match the director’s operating model before polishing automation.
3. **Tour carrier decision** — if schedules remain job-bound, **enrollment job** semantics (lightweight vs full job lifecycle) must be agreed so engineering does not fork schedule APIs.
4. **Comms bindings per org** — Twilio/Resend (or equivalent) configured before treating messaging as go-live ready (`communications.md`).

---

## D. Schema blockers (only where structure forces a decision)

**No migration is proposed here.** One **structural fact** shapes tour planning:

- **`schedules.job_id` is required** (schema + `POST /api/admin/schedules`). Any “opportunity-only tour” still needs a **supported product pattern** (e.g. lightweight job linked to opportunity) unless requirements explicitly change storage.

Other areas (`communication_*`, `opportunities`, `workflow_events`, `pipelines`) are **broadly sufficient** for CRM go-live; gaps are predominantly **product surfaces, vertical workflows, and configuration**, not missing core tables.

---

## When to update this doc

After intake/tour/enrollment flows are implemented for childcare, after KPI definitions are fixed, or when schedule–job coupling changes.
