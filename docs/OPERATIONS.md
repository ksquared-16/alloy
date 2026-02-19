# Operations

How an admin runs the business today in the app, and short checklists for demo/QA.

---

## How an admin runs the business today

### Vendors

- **List:** `/admin/vendors` – View vendors; filter by status (pending, approved, suspended).
- **Create/approve:** Open vendor (drawer or detail). Update **vendor_status_id** to approved (or suspend/reject). Vendor statuses come from **vendor_statuses** (e.g. pending, approved, suspended).
- **Documents:** In vendor drawer, view insurance and driver’s license via signed URLs when available.

### Job default vendor and applying to upcoming schedules

- **Set default:** On a **job** (e.g. from `/admin/jobs` or drawer), set **assigned_vendor_id** to the chosen vendor. This does not create assignments by itself.
- **Apply to upcoming:** Use “Apply to upcoming” (or equivalent) for that job. This:
  - Finds all **upcoming** schedules for that job (no `canceled_at`, `start_at` ≥ now).
  - For each: if there is **no** assignment, creates one with that vendor and status **offered**; if there **is** an assignment with status **offered**, updates vendor_id only. Other statuses (e.g. accepted, declined) are left unchanged.
- **Safe:** Only “no assignment” or “offered” rows are touched; accepted/declined are not overwritten.

### Schedules and assignments

- **List:** `/admin/schedules` – See schedules (and assignment status). Data may come from jobs + schedules + assignments (see `web/app/admin/schedules` and API).
- **Assign a vendor:** On a schedule, use “Assign” and pick a vendor. This creates or updates the **assignment** for that schedule with status **offered**.
- **Accept / decline:** Use the action that sets assignment status (e.g. “Accept” / “Decline”). It calls `PATCH /api/admin/schedules/:id/assignment` with `status_key: accepted` or `declined`.
- **Reschedule:** Use “Reschedule” with new `start_at` / `end_at`. This creates a **new** schedule with `rescheduled_from_schedule_id` and optionally copies the current assignment or applies the job’s default vendor with status “offered.”
- **Cancel:** Set the schedule as canceled (e.g. set **canceled_at** and optionally canceled_by / cancel_reason). The occurrence is then treated as inactive (e.g. excluded from “upcoming” and from “apply to upcoming”).

### Where to look for issues

- **Unassigned schedules:** Schedules with no assignment row (or no vendor_id). Dashboard “Attention needed” and schedules list can show counts/links.
- **Offered but not accepted:** Schedules with assignment status “offered.” Dashboard and schedules list can highlight these.
- **Failed workflow runs:** `/admin` dashboard or workflows area may show failed runs; check **workflow_runs** with status failed.
- **Message outbox failures:** **messages_outbox** rows with status failed; check `/admin/messages-outbox` or equivalent.

### Other admin areas

- **Opportunities:** Pipeline and booking status; link to job/schedule.
- **Customers / contacts:** Manage records and link contact ↔ customer; vendor link on contact.
- **Subscriptions:** Generate next occurrence via “Generate next” (uses subscription cadence/interval and job default vendor).
- **Workflows / messaging:** Configure workflows; inspect runs and outbox (Twilio/send integration TBD).
- **Discounts / redemptions:** Manage codes and view redemptions.

---

## Demo / QA checklists

### Booking flow (customer-facing)

- [ ] Quote start: submit quote form; opportunity created (or updated) with “Quote Started” and metadata.
- [ ] Quote refine: update quote; opportunity and pricing updated.
- [ ] Availability: get slots (no errors).
- [ ] Confirm: submit confirm with valid slot and contact; opportunity, job, schedule created or reused; discount redemption if applicable; workflow `booking_confirmed` runs if enabled.
- [ ] Idempotency: resubmit same confirm (same booking_attempt_id); same opportunity/job/schedule returned, no duplicates.

### Admin: vendor and assignment

- [ ] Set job default vendor (assigned_vendor_id) on a job.
- [ ] Apply to upcoming: only schedules with no assignment or “offered” get the default vendor; accepted/declined unchanged.
- [ ] Assign a different vendor on a single schedule; status “offered.”
- [ ] Accept/decline assignment; status updates.
- [ ] Reschedule: new schedule created; assignment copied or re-applied from job default as configured.
- [ ] Cancel schedule: canceled_at set; schedule excluded from upcoming.

### Admin: subscriptions

- [ ] Generate next: new schedule created for subscription with correct start_at and subscription_sequence; if job has default vendor, one assignment created with “offered.”
- [ ] Idempotency: run generate-next again for same window; no duplicate schedule (existing returned or skipped).

### Smoke

- [ ] Build: `cd web && npm run build` succeeds.
- [ ] Admin login and dashboard load; jobs, schedules, vendors list load.
- [ ] No 500s on key list/detail pages after migrations applied.

---

## Notes / TBD

- Add exact UI paths for “Apply to upcoming,” “Reschedule,” “Cancel” if you want step-by-step.
- Document how to fix “offered but not accepted” in bulk (if any).
- Document any scheduled jobs (e.g. for messaging or cleanup) if they exist.
