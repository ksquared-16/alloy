# Architecture

System overview, data flow, source of truth, and where to extend.

> **Doctrine (2026-04):** Canonical direction for **record rendering (resolver-first)**, **persons-first identity**, **overview layout**, and **workspace / work unit / scope** is documented in [`docs/architecture/README.md`](../architecture/README.md). This file’s flow descriptions may still name **contacts** where the live pipeline uses them today; new work should align with the architecture folder.

---

## System overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js (web/)                                                  │
│  ├── Public/marketing/booking (book-v2, quote, payment)         │
│  ├── Admin UI (/admin/*)                                         │
│  └── API routes (app/api/*)                                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase (system of record)                                     │
│  PostgreSQL + Auth + (optional) Realtime                         │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │ optional sync
┌────────┴────────┐     ┌──────────────────┐
│  Sync (Python)  │     │  Backend (Python) │
│  GHL → Supabase │     │  GHL/Twilio      │
└─────────────────┘     └──────────────────┘
```

- **Web:** Single Next.js app. Server components and API routes use Supabase (service role for mutations and admin, anon where appropriate). No separate “API server” in Node.
- **Supabase:** Holds all canonical data (contacts, customers, opportunities, jobs, schedules, assignments, vendors, workflows, messages_outbox, etc.). Migrations live in `supabase/migrations/`.
- **Sync:** Optional. Pulls contacts, opportunities, jobs from GoHighLevel into Supabase; see `sync/README.md`.
- **Backend:** Optional Python service for GHL webhooks and Twilio. Core booking → job → schedule → assignment flow does not depend on it.

---

## Data flow (key flows)

### 1. Quote → Booking (book-v2)

- **quote-start:** `POST /api/book-v2/quote-start` – Creates/updates contact and “Quote Started” opportunity; stores quote in opportunity metadata.
- **quote-refine:** `POST /api/book-v2/quote-refine` – Updates opportunity and pricing.
- **availability:** `POST /api/book-v2/availability` – Returns available slots (reads from existing data; no schema change).
- **confirm:** `POST /api/book-v2/confirm` – Single idempotent endpoint that:
  - Resolves or creates **contact** and **customer** (`lib/bookingResolver`).
  - Finds or creates **opportunity** (idempotent by `booking_attempt_id` or recent “Quote Started” + web_quote).
  - Finds or creates **job** (idempotent by `booking_attempt_id` in job metadata).
  - Creates **schedule** (or reuses if same slot + `booking_attempt_id` in schedule metadata).
  - Records **discount_redemption** if discount applied.
  - Runs **workflows** with `event_type = booking_confirmed`, then sets `job.job_status_id = 'scheduled'`.

All writes go to Supabase. Source of truth for the booking is the **opportunity → job → schedule** chain and schedule metadata (e.g. `booking_attempt_id`).

### 2. Subscription “generate next”

- **Endpoint:** `POST /api/admin/subscriptions/:id/generate-next` (admin auth).
- Reads **customer_subscriptions** row; uses `cadence` (week/month) and `interval` to compute next occurrence.
- If no previous schedule: uses subscription `start_date` and a job for that customer to create first schedule.
- If previous schedule exists: next start = last start + interval (weeks or months); creates new **schedule** with `customer_subscription_id` and `subscription_sequence`.
- If job has `assigned_vendor_id`, creates an **assignment** for the new schedule with status “offered”.
- Idempotency: if a schedule already exists for that subscription and same `start_at`, returns existing.

### 3. Schedule reschedule

- **Endpoint:** `POST /api/admin/schedules/:id/reschedule` (admin). Body: `start_at`, `end_at`, `timezone?`, `copy_assignment?`.
- Creates a **new** schedule row with `rescheduled_from_schedule_id` pointing to the original. Original is not deleted or “canceled” by this call.
- Optionally copies current assignment to the new schedule, or creates a new assignment from job’s `assigned_vendor_id` with status “offered”.

### 4. Schedule assignment (assign / set status)

- **Assign vendor:** `POST /api/admin/schedules/:id/assign` – Body: `vendor_id`. Upserts one **assignment** per schedule (unique on `schedule_id`); sets status to “offered”.
- **Set status:** `PATCH /api/admin/schedules/:id/assignment` – Body: `status_key` (e.g. accepted, declined). Updates `assignment_status_id` for that schedule’s assignment.

Assignment statuses live in **assignment_statuses** (e.g. offered, accepted, declined, removed, completed). One assignment per schedule; no double-counting with job default vendor (job’s `assigned_vendor_id` is only the default; the assignment row is the schedule-level fact).

---

## Source of truth and idempotency

| Area | Source of truth | Idempotency |
|------|-----------------|-------------|
| Booking | Opportunity → Job → Schedule in Supabase | confirm uses `booking_attempt_id` (and optional “reuse recent quote”) to reuse opportunity/job/schedule on retry. |
| Contact/customer | Supabase contacts + customers | bookingResolver deduplicates by email/phone and links contact ↔ customer. |
| Schedules | schedules table | Same slot + same `booking_attempt_id` in metadata → reuse. |
| Assignments | assignments table (one per schedule) | Assign: upsert by schedule_id. Apply default vendor: only creates/updates when status is “offered” or no assignment. |
| Subscriptions | customer_subscriptions + schedules | generate-next: skip if schedule already exists for same subscription + start_at. |

---

## Where to add new modules

- **Admin pages:** Add under `web/app/admin/<name>/page.tsx` and optionally a `*Client.tsx`. Register nav in `web/components/admin/AdminLayout.tsx` (e.g. in `navGroups`).
- **API routes:** Add under `web/app/api/<segment>/route.ts` or `.../ [id]/route.ts`. Use `createAdminClient()` or `createServiceRoleClient()` for Supabase as appropriate; protect admin routes with `requireAdminOrOps()` from `lib/adminAuth`.
- **New entities/tables:** Add migrations in `supabase/migrations/` with a timestamp prefix; keep order consistent. Do not change existing migration files.
- **Workflows/events:** Workflows are stored in `workflows`; conditions/actions in `workflow_conditions` / `workflow_actions`. Runs in `workflow_runs`; outbound messages in `messages_outbox`. To add a new event type, use workflows with that `event_type` and trigger `executeWorkflowRun` from the appropriate API (e.g. confirm for `booking_confirmed`).
- **Components:** Reuse `web/components/admin/` (AdminPageHeader, KpiCard, SectionCard, EmptyState, DataTable, StatusBadge, etc.) for consistency.

---

## Notes / TBD

- Document which API routes use anon vs service role and any RLS plans.
- Clarify dependency of any live flows on backend (Python) or sync.
- customer_subscriptions: confirm whether `cadence`/`interval` live on the table or are derived from pricing_frequencies (generate-next reads them from the subscription row).
