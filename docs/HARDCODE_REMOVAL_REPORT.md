# Hardcode Removal Report

Maps each inventory item to what was changed, where the workflow trigger happens, event_type/entity_type, payload fields, and confirmation that the original hardcoded behavior was removed.

---

## Inventory Item #1, #2, #3 (Confirm: Set opportunity to Booked)

- **What changed:** Removed all direct writes of `opportunities.pipeline_stage_id` (Booked stage) and `opportunities.status = "booked"` from the confirm route (reuse path, update path, insert path).
- **Where trigger happens:** No new trigger; existing **booking_confirmed** workflows run in `web/app/api/book-v2/confirm/route.ts` (Step 10). Event payload now includes **booked_stage_id** so a workflow can use **update_entity** on opportunity with patch `{ pipeline_stage_id: "{{booked_stage_id}}", status: "booked" }`.
- **event_type / entity_type:** `booking_confirmed` / `job` (unchanged). Workflows must add an **update_entity** action on **opportunity** using `booked_stage_id` from payload.
- **Payload fields added:** `booked_stage_id` (string | null).
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #4 (Confirm: Set job_status_id to "scheduled")

- **What changed:** Removed the direct `jobs.update({ job_status_id: "scheduled" })` after Step 10.
- **Where trigger happens:** Same **booking_confirmed** workflows in `web/app/api/book-v2/confirm/route.ts`. Workflows can use **update_entity** on job with patch `{ job_status_id: "scheduled" }`.
- **event_type / entity_type:** `booking_confirmed` / `job`.
- **Payload fields:** job, opportunity, schedule, contact, customer, org_id, booked_stage_id, occurred_at.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #5 (Confirm: Create assignment when job has assigned_vendor_id)

- **What changed:** Removed the block that inserted into **assignments** (schedule_id, job_id, vendor_id, assignment_status_id "offered") after creating a new schedule.
- **Where trigger happens:** Same **booking_confirmed** workflows. Workflows can use **create_assignment** action (schedule_id, job_id, vendor_id from payload; job.assigned_vendor_id and schedule.id are in payload).
- **event_type / entity_type:** `booking_confirmed` / `job`.
- **Payload fields:** schedule, job (with assigned_vendor_id), so **create_assignment** can resolve schedule_id, job_id, vendor_id from payload.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #6 (Quote-start: Set opportunity to "Quote Started" stage)

- **What changed:** Removed `pipeline_stage_id: quoteStartedStageId` from new opportunity insert. Reuse logic no longer requires matching pipeline_stage_id (reuse is by contact + time + metadata.source). After inserting a new opportunity, the route fires **quote_started** workflows and passes **quote_started_stage_id** in the payload.
- **Where trigger happens:** `web/app/api/book-v2/quote-start/route.ts` (after new opportunity insert).
- **event_type / entity_type:** `quote_started` / `opportunity`.
- **Payload fields:** event_type, occurred_at, org_id, quote_started_stage_id, opportunity.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #7 (Admin job PATCH assign_vendor)

- **What changed:** Removed **JOB_ACTION_PAYLOADS**; when `body.action` is `assign_vendor` or `mark_completed`, the route no longer applies updates. It loads workflows with event_type **job_action**, entity_type **job**, runs them with payload including **action**, then refetches job and returns (or continues with other body keys).
- **Where trigger happens:** `web/app/api/admin/jobs/[id]/route.ts` (PATCH handler).
- **event_type / entity_type:** `job_action` / `job`.
- **Payload fields:** event_type, occurred_at, org_id, action ("assign_vendor" | "mark_completed"), job.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #8 (Admin job PATCH mark_completed)

- **What changed:** Same as #7; workflow-driven via **job_action** with action "mark_completed". Workflow can **update_entity** job with job_status_id "completed" and completed_at (e.g. "{{occurred_at}}").
- **Where trigger happens:** Same file as #7.
- **event_type / entity_type:** `job_action` / `job`.
- **Payload fields:** Same as #7.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #9 (Apply-vendor-to-upcoming)

- **What changed:** Route no longer creates/updates assignments. It validates job and assigned_vendor_id, then loads workflows with event_type **job_default_vendor_applied**, entity_type **job**, and runs them with job in payload. New workflow action type **apply_job_vendor_to_upcoming** in the runner performs the same logic (upcoming schedules, create/update assignments with status "offered").
- **Where trigger happens:** `web/app/api/admin/jobs/[id]/apply-vendor-to-upcoming/route.ts`.
- **event_type / entity_type:** `job_default_vendor_applied` / `job`.
- **Payload fields:** event_type, occurred_at, org_id, job.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #10 (Schedule assign)

- **What changed:** Route no longer inserts/updates **assignments**. It validates schedule and vendor_id, then loads workflows with event_type **schedule_vendor_assigned**, entity_type **schedule**, and runs them with schedule_id, job_id, vendor_id, schedule in payload. Workflow action **create_assignment** can create or update the assignment.
- **Where trigger happens:** `web/app/api/admin/schedules/[id]/assign/route.ts`.
- **event_type / entity_type:** `schedule_vendor_assigned` / `schedule`.
- **Payload fields:** event_type, occurred_at, org_id, schedule_id, job_id, vendor_id, schedule.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #11 (Schedule reschedule – create assignment from job default)

- **What changed:** When `copy_assignment` is false, the route no longer creates an assignment from job.assigned_vendor_id. It fires **schedule_created** workflows with new schedule_id, job_id, job, schedule in payload. Workflow action **create_assignment** can create the row when job has assigned_vendor_id.
- **Where trigger happens:** `web/app/api/admin/schedules/[id]/reschedule/route.ts` (else branch after creating new schedule).
- **event_type / entity_type:** `schedule_created` / `schedule`.
- **Payload fields:** event_type, occurred_at, org_id, schedule_id, job_id, job, schedule.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #12 (Generate-next: create assignment)

- **What changed:** Route no longer inserts into **assignments** after creating the new schedule. It fires **schedule_created** workflows with schedule_id, job_id, job, schedule in payload.
- **Where trigger happens:** `web/app/api/admin/subscriptions/[id]/generate-next/route.ts`.
- **event_type / entity_type:** `schedule_created` / `schedule`.
- **Payload fields:** event_type, occurred_at, org_id, schedule_id, job_id, job, schedule.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #13 (Action link vendor_accept_job: update job.vendor_id)

- **What changed:** Route marks the action link consumed but no longer updates **jobs.vendor_id**. It fires **action_link_consumed** workflows with action_type, entity_type, entity_id, vendor_id (from body) in payload. Workflow can **update_entity** on job with patch `{ vendor_id: "{{vendor_id}}" }`.
- **Where trigger happens:** `web/app/api/action/[token]/consume/route.ts`.
- **event_type / entity_type:** `action_link_consumed` / (entity_type from link: **job** for vendor_accept_job).
- **Payload fields:** event_type, occurred_at, org_id, action_type, entity_type, entity_id, vendor_id, canceled_by, cancel_reason.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #14 (Action link customer_cancel: set schedule canceled_at)

- **What changed:** Route no longer updates **schedules** (canceled_at, canceled_by, cancel_reason). It fires **action_link_consumed** workflows; workflow can **update_entity** on schedule with patch e.g. `{ canceled_at: "{{occurred_at}}", canceled_by: "{{canceled_by}}", cancel_reason: "{{cancel_reason}}" }`.
- **Where trigger happens:** Same as #13.
- **event_type / entity_type:** `action_link_consumed` / **schedule** (for customer_cancel).
- **Payload fields:** Same as #13.
- **Original hardcoded behavior removed:** Yes.

---

## Inventory Item #15 (Workflow runner: job_qualified_vendors "approved" key)

- **What changed:** In **resolveRecipients** (job_qualified_vendors branch), the vendor status key is no longer hardcoded "approved". It uses **r.status_key** from the recipient spec when present, otherwise defaults to **"approved"**.
- **Where trigger happens:** `web/lib/workflowRun.ts` (resolveRecipients, inside executeWorkflowRun when resolving send_message recipients).
- **event_type / entity_type:** N/A (workflow action payload: recipients[].status_key).
- **Payload fields:** N/A. Action payload recipients can include **status_key** (e.g. "approved" or another key).
- **Original hardcoded behavior removed:** Yes (configurable per recipient; default remains "approved").

---

## Workflow runner additions (no seeding in code)

- **update_entity:** Patch values that are strings are now templated via **renderTemplate(value, payload)** so workflow actions can use `"{{booked_stage_id}}"`, `"{{occurred_at}}"`, etc.
- **create_assignment:** New action type. Payload: schedule_id, job_id, vendor_id (or from payload.job.assigned_vendor_id), status_key (default "offered"). Resolves IDs from payload; upserts assignment for that schedule.
- **apply_job_vendor_to_upcoming:** New action type. Payload: job_id (or from payload.job.id). Loads job.assigned_vendor_id, upcoming schedules, creates/updates assignments with status "offered" (same safe rules as before).

---

## Org filter for workflow lookup

- **booking_confirmed:** Query in confirm route now filters by `org_id`: `.or(\`org_id.eq.${orgId},org_id.is.null\`)` when orgId is set.
- **job_action, job_default_vendor_applied, schedule_vendor_assigned, schedule_created, quote_started, action_link_consumed:** Same pattern applied in each route (org_id from env or context, then `.or(org_id.eq.X,org_id.is.null)` when present).

---

## New event types in vocabulary

- **workflowVocab.ts** now includes: quote_started, job_action, job_default_vendor_applied, schedule_created, schedule_vendor_assigned, action_link_consumed (so Admin UI can create workflows for these events).
