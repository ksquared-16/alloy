# Hardcoded Workflow Inventory Report

Every hardcoded workflow behavior found in the repo, with file, behavior, trigger, tables, values, and suggested workflow replacement.

---

## 1. Confirm: Set opportunity to Booked (reuse quote path)

- **File:** `web/app/api/book-v2/confirm/route.ts`
- **Function/route:** `POST /api/book-v2/confirm` (reuse-existing-opportunity branch)
- **Exact behavior:** Sets `opportunities.pipeline_stage_id` to "Booked" stage ID and `opportunities.status` to `"booked"`.
- **Trigger:** Confirm with existing opportunity (idempotent retry or reuse recent quote).
- **Tables affected:** `opportunities`
- **Current values:** `pipeline_stage_id` = result of `getOrCreateBookedStage(..., "Booked")`, `status` = `"booked"`
- **Suggested replacement:** Fire `booking_confirmed` (or keep single event); workflow action `update_entity` on `opportunity` with patch `{ pipeline_stage_id: "{{booked_stage_id}}", status: "booked" }`. Route passes `booked_stage_id` in event payload; runner must support templated patch values.

---

## 2. Confirm: Set opportunity to Booked (update existing-opp branch)

- **File:** `web/app/api/book-v2/confirm/route.ts`
- **Function/route:** `POST /api/book-v2/confirm` (else branch, update existing opportunity)
- **Exact behavior:** Same as #1: `opportunities.pipeline_stage_id` = booked stage, `opportunities.status` = `"booked"`.
- **Trigger:** Confirm when updating (not reusing) an existing opportunity.
- **Tables affected:** `opportunities`
- **Current values:** Same as #1
- **Suggested replacement:** Same as #1 (single event; workflow does update).

---

## 3. Confirm: Set opportunity to Booked (insert new opportunity)

- **File:** `web/app/api/book-v2/confirm/route.ts`
- **Function/route:** `POST /api/book-v2/confirm` (insert new opportunity)
- **Exact behavior:** On insert, sets `opportunities.status` to `"booked"` and `opportunities.pipeline_stage_id` to booked stage when `bookedStageIdElse` is set.
- **Trigger:** Confirm when creating a new opportunity.
- **Tables affected:** `opportunities`
- **Current values:** `status` = `"booked"`, `pipeline_stage_id` = booked stage id
- **Suggested replacement:** Route inserts opportunity without status/stage (or with neutral); then fire event; workflow `update_entity` sets Booked stage and status (using `booked_stage_id` in payload).

---

## 4. Confirm: Set job_status_id to "scheduled"

- **File:** `web/app/api/book-v2/confirm/route.ts`
- **Function/route:** `POST /api/book-v2/confirm` (after Step 10 workflows)
- **Exact behavior:** `jobs.update({ job_status_id: "scheduled" }).eq("id", jobId)`.
- **Trigger:** After booking_confirmed workflows run.
- **Tables affected:** `jobs`
- **Current values:** `job_status_id` = `"scheduled"`
- **Suggested replacement:** Workflow action `update_entity` on `job` with patch `{ job_status_id: "scheduled" }`. Remove from route.

---

## 5. Confirm: Create assignment with status "offered" when job has assigned_vendor_id

- **File:** `web/app/api/book-v2/confirm/route.ts`
- **Function/route:** `POST /api/book-v2/confirm` (after creating new schedule)
- **Exact behavior:** If `job.assigned_vendor_id` is set, looks up `assignment_statuses.key = "offered"` and inserts one row into `assignments` (schedule_id, job_id, vendor_id, assignment_status_id).
- **Trigger:** Immediately after creating a new schedule in confirm.
- **Tables affected:** `assignments`, `assignment_statuses` (read)
- **Current values:** `assignment_status_id` = id for key `"offered"`
- **Suggested replacement:** New workflow action type `create_assignment` (schedule_id, job_id, vendor_id, status_key default "offered"). Fire event (e.g. `schedule_created` or include in `booking_confirmed` payload); workflow runs and creates assignment. Route removes this block.

---

## 6. Quote-start: Set opportunity to "Quote Started" stage

- **File:** `web/app/api/book-v2/quote-start/route.ts`
- **Function/route:** `POST /api/book-v2/quote-start`
- **Exact behavior:** Gets/creates pipeline stage by name `"Quote Started"` (position 0); sets new opportunity `pipeline_stage_id` and `status: "open"` on insert; reuse path only updates metadata (no stage change).
- **Trigger:** Quote start (new opportunity created).
- **Tables affected:** `opportunities`, `pipeline_stages` (get-or-create)
- **Current values:** `pipeline_stage_id` = stage named "Quote Started", `status` = `"open"`
- **Suggested replacement:** Event `quote_started`, entity_type `opportunity`. Route may still create opportunity with minimal fields; workflow action sets `pipeline_stage_id` (pass `quote_started_stage_id` in payload) and optionally status. Or route creates opportunity with stage as "data" and we only move the stage name policy to config (TBD). Preferred: fire `quote_started` after upsert; workflow `update_entity` sets stage from payload.

---

## 7. Admin job PATCH assign_vendor

- **File:** `web/app/api/admin/jobs/[id]/route.ts`
- **Function/route:** `PATCH /api/admin/jobs/:id`
- **Exact behavior:** When `body.action === "assign_vendor"`, applies `{ job_status_id: "assigned" }` to job.
- **Trigger:** Admin PATCH job with `action: "assign_vendor"`.
- **Tables affected:** `jobs`
- **Current values:** `job_status_id` = `"assigned"`
- **Suggested replacement:** Event `job_action`, entity_type `job`, payload `{ action: "assign_vendor", job_id }`. Workflow(s) subscribed to `job_action` with condition on action; action `update_entity` with patch `{ job_status_id: "assigned" }`. Route no longer applies JOB_ACTION_PAYLOADS; instead fires workflow and returns.

---

## 8. Admin job PATCH mark_completed

- **File:** `web/app/api/admin/jobs/[id]/route.ts`
- **Function/route:** `PATCH /api/admin/jobs/:id`
- **Exact behavior:** When `body.action === "mark_completed"`, applies `{ job_status_id: "completed", completed_at: now }`.
- **Trigger:** Admin PATCH job with `action: "mark_completed"`.
- **Tables affected:** `jobs`
- **Current values:** `job_status_id` = `"completed"`, `completed_at` = ISO now
- **Suggested replacement:** Same as #7 with `action: "mark_completed"`; workflow `update_entity` job with `job_status_id: "completed"`, `completed_at: "{{occurred_at}}"` or similar.

---

## 9. Apply-vendor-to-upcoming: create/update assignments with "offered"

- **File:** `web/app/api/admin/jobs/[id]/apply-vendor-to-upcoming/route.ts`
- **Function/route:** `POST /api/admin/jobs/:id/apply-vendor-to-upcoming`
- **Exact behavior:** For each upcoming schedule of the job: if no assignment, insert assignment with job's `assigned_vendor_id` and status "offered"; if assignment exists and status is "offered", update vendor_id only.
- **Trigger:** Admin clicks "Apply to upcoming" for a job.
- **Tables affected:** `assignments`, `schedules` (read), `assignment_statuses` (read)
- **Current values:** `assignment_status_id` = id for key `"offered"`
- **Suggested replacement:** Event `job_default_vendor_applied`, entity_type `job`. New action type `apply_job_vendor_to_upcoming` (or workflow runs and calls existing logic). Prefer: generic `create_assignment` per schedule; workflow receives job + schedule list and creates/updates assignments. Complex; alternatively keep route for "data" but have it fire event after; workflow can do additional side effects. Per user: "policy / state / messaging / assignment automation is moved to workflows". So we need workflow to perform the assignment creates/updates. Easiest: add action type `apply_job_vendor_to_upcoming` that takes job_id from payload and does the same logic (read job, upcoming schedules, create/update assignments). Then route only validates and fires event; workflow runs and executes that action.

---

## 10. Schedule assign: create/update assignment with "offered"

- **File:** `web/app/api/admin/schedules/[id]/assign/route.ts`
- **Function/route:** `POST /api/admin/schedules/:id/assign`
- **Exact behavior:** Creates or updates one assignment for the schedule with given `vendor_id` and status "offered".
- **Trigger:** Admin assigns a vendor to a schedule.
- **Tables affected:** `assignments`
- **Current values:** `assignment_status_id` = id for key `"offered"`
- **Suggested replacement:** Event `schedule_vendor_assigned`, entity_type `schedule`, payload `schedule_id`, `vendor_id`, `job_id`. Workflow action `create_assignment` (or upsert) with status_key "offered". Route removes direct assignment write; fires event; workflow does insert/update.

---

## 11. Schedule reschedule: create assignment with "offered" from job default

- **File:** `web/app/api/admin/schedules/[id]/reschedule/route.ts`
- **Function/route:** `POST /api/admin/schedules/:id/reschedule`
- **Exact behavior:** When `copy_assignment` is false and job has `assigned_vendor_id`, creates a new assignment for the new schedule with status "offered".
- **Trigger:** Admin reschedules (new schedule created); then this block runs.
- **Tables affected:** `assignments`
- **Current values:** `assignment_status_id` = id for key `"offered"`
- **Suggested replacement:** After creating new schedule, fire event `schedule_created` (or `schedule_rescheduled`) with new schedule_id, job_id, job.assigned_vendor_id. Workflow action `create_assignment` creates the row. Route removes assignment creation.

---

## 12. Generate-next: create assignment with "offered"

- **File:** `web/app/api/admin/subscriptions/[id]/generate-next/route.ts`
- **Function/route:** `POST /api/admin/subscriptions/:id/generate-next`
- **Exact behavior:** After inserting new schedule, if job has `assigned_vendor_id`, inserts one assignment with status "offered".
- **Trigger:** Admin "Generate next" for subscription.
- **Tables affected:** `assignments`
- **Current values:** `assignment_status_id` = id for key `"offered"`
- **Suggested replacement:** After inserting schedule, fire event `schedule_created` with schedule_id, job_id, assigned_vendor_id (and org_id). Workflow subscribes and runs `create_assignment`. Route removes assignment insert.

---

## 13. Action link vendor_accept_job: update job.vendor_id

- **File:** `web/app/api/action/[token]/consume/route.ts`
- **Function/route:** `POST /api/action/:token/consume`
- **Exact behavior:** When `action_type === "vendor_accept_job"` and body has `vendor_id`, updates `jobs.vendor_id` for `entity_id` (job).
- **Trigger:** User consumes action link (e.g. vendor accept link) with vendor_id in body.
- **Tables affected:** `jobs`
- **Current values:** `vendor_id` = body.vendor_id
- **Suggested replacement:** Event `action_link_consumed`, payload `action_type`, `entity_type`, `entity_id`, `vendor_id`, etc. Workflow condition on action_type; action `update_entity` on job with patch `{ vendor_id: "{{vendor_id}}" }`. Route marks link consumed and fires event; does not update job.

---

## 14. Action link customer_cancel: set schedule canceled_at

- **File:** `web/app/api/action/[token]/consume/route.ts`
- **Function/route:** `POST /api/action/:token/consume`
- **Exact behavior:** When `action_type === "customer_cancel"` and `entity_type === "schedule"`, updates schedule with `canceled_at`, `canceled_by`, `cancel_reason`.
- **Trigger:** User consumes customer cancel link.
- **Tables affected:** `schedules`
- **Current values:** `canceled_at` = now, `canceled_by` = body or "customer", `cancel_reason` = body
- **Suggested replacement:** Event `action_link_consumed`; workflow updates schedule via `update_entity`. Route marks consumed and fires event; does not update schedule.

---

## 15. Workflow runner: job_qualified_vendors uses fixed "approved" status

- **File:** `web/lib/workflowRun.ts`
- **Function:** `resolveRecipients` (inside executeWorkflowRun)
- **Exact behavior:** When resolving recipients with source `job_qualified_vendors`, filters vendors by `vendor_statuses.key = "approved"` (hardcoded).
- **Trigger:** Workflow send_message action with recipients from job_qualified_vendors.
- **Tables affected:** `vendor_statuses` (read), `vendors` (read)
- **Current values:** Literal key `"approved"`
- **Suggested replacement:** Support optional `status_key` in recipient spec for job_qualified_vendors (e.g. from action payload), default to `"approved"`. No new event; configurable in workflow action payload.

---

## Summary count by type

| Type | Count |
|------|--------|
| Status transitions (opportunity/job/schedule) | 6 (items 1–4, 7, 8; plus quote_start 6; action 13, 14 are updates) |
| Assignment/offer automations | 5 (items 5, 9, 10, 11, 12) |
| Messaging sends/enqueues | 0 (messages_outbox is only written inside workflow runner for send_message action) |
| Other policy actions | 2 (action_link consume 13, 14) + 1 (workflow runner approved key 15) |

**Total inventory items:** 15.

- **Status/stage transitions:** 1, 2, 3, 4, 6, 7, 8 (7).
- **Assignment/offer automations:** 5, 9, 10, 11, 12 (5).
- **Messaging:** 0 direct in routes.
- **Other (action link + runner policy):** 13, 14, 15 (3).
