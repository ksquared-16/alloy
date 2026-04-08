# Domain model

Canonical entities, relationships, and rules as implemented in the current codebase.

---

## Entity relationship (simplified)

```
  Customer ──┬──< Contact
            │
            └──< Opportunity ──> Job ──> Schedule ──> Assignment ──> Vendor
                     │                    │                │
                     │                    └── canceled_at  │
                     │                    └── customer_subscription_id
                     └── pipeline_stage_id
```

- **Customer:** One per “account” (e.g. household). Has many contacts and opportunities.
- **Contact:** Person (email, phone). Belongs to one customer; can be linked to a vendor (e.g. primary contact for that vendor).
- **Opportunity:** Sales/lead record. Links to customer and primary_contact_id; has pipeline_stage_id, status, monetary_value; metadata holds quote_input, quote_output, booking_attempt_id, etc.
- **Job:** One or more per opportunity. Links to customer_id, primary_contact_id, opportunity_id, vertical_id. Has assigned_vendor_id (default vendor for this job). Optional job_status_id; metadata can hold address, internal_notes, etc.
- **Schedule:** One occurrence of a job (start_at, end_at, timezone). Belongs to one job. Can be linked to customer_subscription_id and subscription_sequence. Can have rescheduled_from_schedule_id; canceled_at/canceled_by/cancel_reason for cancellation.
- **Assignment:** One per schedule (unique schedule_id). Links schedule → job → vendor and assignment_status_id. Represents “this vendor is assigned to this schedule occurrence” and their response (offered, accepted, declined, etc.).
- **Vendor:** Service provider. Has vendor_status_id (pending, approved, suspended, etc.); can have primary_contact_id; linked to contacts via vendor_contacts.

**Subscriptions:** customer_subscriptions links a customer (and optional vertical, pricing_frequency) to a recurrence. Schedules created by “generate next” set customer_subscription_id and subscription_sequence. One subscription drives many schedules over time.

---

## Table overview

| Entity | Table | Key fields / notes |
|--------|--------|---------------------|
| Customer | customers | id, name, status, vertical_id?, created_at, updated_at |
| Contact | contacts | id, customer_id, first_name, last_name, email, phone, vendor_id? (if linked to vendor) |
| Opportunity | opportunities | id, customer_id, primary_contact_id, pipeline_stage_id, status, monetary_value_cents?, metadata (quote, booking_attempt_id, etc.) |
| Job | jobs | id, opportunity_id, customer_id, primary_contact_id, vertical_id, assigned_vendor_id (default vendor), job_status_id?, scheduled_at?, gross_price_cents?, metadata |
| Schedule | schedules | id, job_id, start_at, end_at, timezone, duration_minutes, canceled_at?, customer_subscription_id?, subscription_sequence?, rescheduled_from_schedule_id? |
| Assignment | assignments | id, schedule_id, job_id, vendor_id, assignment_status_id (one row per schedule) |
| Vendor | vendors | id, vendor_status_id, name, primary_contact_id, ... |
| Assignment status | assignment_statuses | id, key, label (e.g. offered, accepted, declined, removed, completed) |
| Vendor status | vendor_statuses | id, key, label (pending, approved, suspended, rejected) |
| Subscription | customer_subscriptions | id, customer_id, pricing_frequency_id, status, start_date?, cadence?, interval? (TBD: may live on table or come from pricing_frequency) |

---

## Definitions

- **Default vendor (job.assigned_vendor_id):** The vendor to use for this job when creating new assignments (e.g. “apply to upcoming” or generate-next). It is not an assignment itself; it is the template. Schedule-level assignment is the fact.
- **Assignment:** The fact that a specific vendor is (or was) assigned to a specific schedule occurrence, with a status (offered, accepted, declined, etc.). One assignment per schedule; UNIQUE(schedule_id).
- **Offered:** Vendor has been assigned but has not yet accepted/declined. Admin can change vendor or status.
- **Accepted / Declined:** Set via PATCH schedules/:id/assignment with status_key. Canceled schedule: set schedule.canceled_at (and optionally canceled_by, cancel_reason); assignment may remain for audit but the occurrence is not “active.”

---

## Assignment statuses and behavior

- **Status keys** (in assignment_statuses): e.g. **offered**, **accepted**, **declined**, **removed**, **completed**. (One migration renames “offered” → “assigned”; code still looks up “offered” in assign and apply-vendor-to-upcoming; confirm which key is current in your DB.)
- **Offered but not accepted:** Schedule has an assignment with status offered; vendor has not accepted. Counts as “attention needed” in admin dashboard.
- **Canceled schedule:** schedule.canceled_at is set. Assignment row may still exist; do not double-count “active” work. Admin “cancel” is a separate action from “reschedule” (reschedule creates a new schedule and optionally copies or re-applies assignment).

---

## Job default vendor vs schedule assignment (no double-counting)

- **Job.assigned_vendor_id** = default vendor for that job. Used when:
  - Admin clicks “Apply to upcoming schedules”: for each upcoming schedule with no assignment or with status “offered,” create/update assignment to this vendor with status “offered.”
  - Generate-next: after creating the new schedule, if job has assigned_vendor_id, create one assignment with status “offered.”
  - Reschedule (when not copying assignment): if job has assigned_vendor_id, create one assignment for the new schedule with status “offered.”
- **Assignment** = one row per schedule. The “count” of who is doing the work is assignment per schedule (and assignment_status_id). Do not count job.assigned_vendor_id as “assigned” for a schedule that has no assignment row or has declined/removed.

---

## Notes / TBD

- Confirm assignment_statuses keys in your DB (offered vs assigned after migration 20250209120000).
- job_statuses table: optional; if missing, admin uses fallback labels for known job_status_id values (scheduled, assigned, completed).
- customer_subscriptions: confirm whether cadence/interval are columns or derived from pricing_frequencies.
