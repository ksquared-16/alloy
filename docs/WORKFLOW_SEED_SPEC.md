# Workflow Seed Spec: Executor, Events, Inventory, and Seed Script

After Supabase wipe of workflows, workflow_conditions, workflow_actions, workflow_events, workflow_runs, and action_links, this doc provides the definitive reference and a single idempotent SQL seed script.

---

## 1. Supported workflow_actions.action_type and Payload Shapes

**Executor:** `web/lib/workflowRun.ts` — `executeWorkflowRun()` (lines 535–958). Actions are loaded from `workflow_actions` ordered by `action_order` and executed in a switch on `action.action_type`.

| action_type                      | Payload shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Code reference                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **create_message**               | `channel?` (default "email"), `to_value`, `body`, `contact_id?`, `customer_id?`, `opportunity_id?`, `job_id?` — all IDs can be template paths; body/to_value support `renderTemplate()`.                                                                                                                                                                                                                                                                                                      | `workflowRun.ts` 623–658          |
| **send_message**                 | `channel?` (default "sms"), `template` or `body`, `template_key?`, `recipients`: array of RecipientSpec. RecipientSpec: `type?`, `source?` ("payload" \| "query" \| "resolver"), `path?`, `vendor_id_path?`, `role_in?`, `max?`, `status_key?`, `vertical_slug?`, `match_job_vertical?`, `match_job_zip?`. Sources: payload+path; query+contacts_by_vendor+vendor_id_path; query+vendors_query (vertical + zip + status_key); resolver+job_qualified_vendors (status_key default "approved"). | `workflowRun.ts` 659–714, 217–454 |
| **update_entity**                | `entity_type?` or `target_entity`, `id_path?` or `entity_id?` (template/path), `patch`: object; values in patch can be template strings. Entity resolved from payload (job.id, opportunity.id, etc.). Table from ENTITY_TABLES (jobs, opportunities, contacts, customers, schedules, vendors).                                                                                                                                                                                                | `workflowRun.ts` 715–766          |
| **create_assignment**            | `job_id?`, `job_id_path?`, `schedule_id?`, `schedule_id_path?`, `vendor_id?`, `vendor_id_path?`; defaults: job/schedule/vendor from payload.job, payload.schedule, payload.job.assigned_vendor_id. `status_key?` (default "offered"). Upserts: if assignment exists for schedule, update vendor_id/status; else insert.                                                                                                                                                                       | `workflowRun.ts` 771–815          |
| **apply_job_vendor_to_upcoming** | `job_id?`, `job_id_path?` or from payload.job.id. Reads job.assigned_vendor_id; for each upcoming schedule (start_at >= now, not canceled), creates or updates assignment with status "offered".                                                                                                                                                                                                                                                                                              | `workflowRun.ts` 816–859          |
| **create_action_link**           | `action_type`, `entity_type`, `entity_id?` or `entity_id_path?`, `expires_in_minutes?` (default 120), `output_key?` (default "action_link_url"), `metadata?`. Injects resulting URL into payload[output_key].                                                                                                                                                                                                                                                                                 | `workflowRun.ts` 860–911          |
| **log**                          | `message` (template).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `workflowRun.ts` 912–916          |
| **default**                      | Unknown action_type: log only, no throw.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `workflowRun.ts` 917–919          |

**Entity tables (update_entity):** job(s)→jobs, opportunity/opportunities→opportunities, contact(s)→contacts, customer(s)→customers, schedule(s)→schedules, vendor(s)→vendors.

**Condition evaluation:** `workflowRun.ts` 82–181. Conditions use `target_entity`, `field_path` (or `field`), `operator` (eq, neq, contains, gt, lt, gte, lte, in, not_in, is_null, not_null, exists, overlaps), `value` or `value_jsonb`, `enabled`.

---

## 2. Event Types and Payload Shapes (Created/Emitted in App)

Events are inserted via `emitEvent()` into `workflow_events` (`web/lib/emitEvent.ts`). Payloads are passed to `executeWorkflowRun()` as the event payload.

| event_type                     | Where emitted                                                  | Payload shape (key fields)                                                                                                        | File:line                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **action_link_consumed**       | After consuming action link (token).                           | `event_type`, `occurred_at`, `org_id`, `action_type`, `entity_type`, `entity_id`, `vendor_id?`, `canceled_by?`, `cancel_reason?`. | `web/app/api/action/[token]/consume/route.ts` 42–49, 55–62                                                                                 |
| **booking_confirmed**          | After confirm booking (book-v2).                               | `event_type`, `occurred_at`, `org_id`, `booked_stage_id`, `job`, `contact`, `customer`, `opportunity`, `schedule`.                | `web/app/api/book-v2/confirm/route.ts` 1161–1170, 1173–1179                                                                                |
| **quote_started**              | After quote-start (new opportunity).                           | `event_type`, `occurred_at`, `org_id`, `quote_started_stage_id`, `opportunity`.                                                   | `web/app/api/book-v2/quote-start/route.ts` 626–632, 635–642                                                                                |
| **schedule_created**           | After reschedule (new schedule) or generate-next subscription. | `event_type`, `occurred_at`, `org_id`, `schedule_id`, `job_id`, `schedule`, `job?`; generate-next also `assigned_vendor_id?`.     | `web/app/api/admin/schedules/[id]/reschedule/route.ts` 83–97, 94–96; `web/app/api/admin/subscriptions/[id]/generate-next/route.ts` 121–138 |
| **schedule_vendor_assigned**   | Admin assign vendor to schedule.                               | `event_type`, `occurred_at`, `org_id`, `schedule_id`, `job_id`, `vendor_id`, `schedule`.                                          | `web/app/api/admin/schedules/[id]/assign/route.ts` 36–43                                                                                   |
| **job_default_vendor_applied** | Admin apply job default vendor to upcoming.                    | `event_type`, `occurred_at`, `org_id`, `job`.                                                                                     | `web/app/api/admin/jobs/[id]/apply-vendor-to-upcoming/route.ts` 37–41                                                                      |
| **job_action**                 | Admin PATCH job with action (assign_vendor, mark_completed).   | `event_type`, `occurred_at`, `org_id`, `action`, `job`.                                                                           | `web/app/api/admin/jobs/[id]/route.ts` 36–42                                                                                               |

**Vocabulary (event_type list in UI):** `web/lib/workflowVocab.ts` 9–22: booking_confirmed, quote_started, job_action, job_default_vendor_applied, schedule_created, schedule_vendor_assigned, action_link_consumed, job_rescheduled, job_canceled, job_completed, payment_succeeded, payment_failed. Only the first seven are currently emitted in code; the rest are placeholders for future use.

---

## 3. Workflow Inventory (Reconstructed from Code + HARDCODED_WORKFLOW_INVENTORY.md)

| #   | workflow name                                        | org_id   | enabled | event_type                 | entity_type | conditions                                              | actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------- | -------- | ------- | -------------------------- | ----------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Booking: Set opportunity Booked                      | v_org_id | true    | booking_confirmed          | job         | (none)                                                  | 1. update_entity opportunity: id_path opportunity.id, patch { pipeline_stage_id: "{{booked_stage_id}}", status: "booked" }. 2. update_entity job: id_path job.id, patch { status_key: "scheduled" } (preferred; syncs `job_status_id` when a matching `job_statuses` row exists). Legacy: `job_status_id` UUID still works. 3. create_assignment: schedule_id from schedule.id, job_id from job.id, vendor_id from job.assigned_vendor_id, status_key offered (when job.assigned_vendor_id present; optional condition or same action skips when null). |
| 2   | Quote started: Set opportunity stage                 | v_org_id | true    | quote_started              | opportunity | (none)                                                  | update_entity opportunity: id_path opportunity.id, patch { pipeline_stage_id: "{{quote_started_stage_id}}", status: "open" }.                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3   | Action link: vendor_accept_job → update job          | v_org_id | true    | action_link_consumed       | job         | field_path (payload) action_type eq "vendor_accept_job" | update_entity job: entity_id from entity_id, patch { vendor_id: "{{vendor_id}}" }.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4   | Action link: customer_cancel → cancel schedule       | v_org_id | true    | action_link_consumed       | schedule    | action_type eq "customer_cancel"                        | update_entity schedule: entity_id from entity_id, patch { canceled_at: "{{occurred_at}}", canceled_by: "{{canceled_by}}", cancel_reason: "{{cancel_reason}}" }.                                                                                                                                                                                                                                                                                                                                                               |
| 5   | Job action: assign_vendor → job status assigned      | v_org_id | true    | job_action                 | job         | field action eq "assign_vendor"                         | update_entity job: id_path job.id, patch { status_key: "assigned" } (preferred; syncs `job_status_id`). Legacy UUID `job_status_id` placeholders still supported.                                                                                                                                                                                                                                                                                                                                                        |
| 6   | Job action: mark_completed → job completed           | v_org_id | true    | job_action                 | job         | field action eq "mark_completed"                        | update_entity job: id_path job.id, patch { status_key: "completed", completed_at: "{{occurred_at}}" } (preferred; syncs `job_status_id`).                                                                                                                                                                                                                                                                                                                                                                                      |
| 7   | Schedule vendor assigned: create assignment          | v_org_id | true    | schedule_vendor_assigned   | schedule    | (none)                                                  | create_assignment: schedule_id from schedule_id, job_id from job_id, vendor_id from vendor_id, status_key offered.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8   | Schedule created: create assignment from job default | v_org_id | true    | schedule_created           | schedule    | (none)                                                  | create_assignment: schedule_id from schedule.id, job_id from job.id, vendor_id from job.assigned_vendor_id, status_key offered. (Skips when no assigned_vendor_id per executor.)                                                                                                                                                                                                                                                                                                                                              |
| 9   | Job default vendor applied: apply to upcoming        | v_org_id | true    | job_default_vendor_applied | job         | (none)                                                  | apply_job_vendor_to_upcoming: job_id from job.id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Placeholders in payload (templates): `{{booked_stage_id}}`, `{{quote_started_stage_id}}`, `{{scheduled_job_status_id}}`, `{{assigned_job_status_id}}`, `{{completed_job_status_id}}` — **prefer literal `status_key` in job patches** (see rows 1, 5, 6) so workflows stay definitions-aligned; UUID placeholders are only needed if you keep legacy `job_status_id`-only patches.

---

## 4. Single Idempotent SQL Seed Script

**File:** `supabase/seed/workflow_action_links_seed.sql`

- Set `v_org_id` at the top of the script to your org UUID.
- For each workflow: delete existing actions and conditions for that workflow (by name + org_id), delete the workflow row, then insert workflow and its conditions/actions. No table nukes.
- **workflow_events** and **action_links** are not re-seeded (events are emitted at runtime; action_links are created by the app when generating links).

---

## 5. Post-Seed Verification and Smoke Test

**Verification SQL (run after seed; replace `YOUR_ORG_ID` with your org UUID):**

```sql
-- Counts by org
SELECT org_id, COUNT(*) AS workflows FROM workflows WHERE org_id = 'YOUR_ORG_ID' GROUP BY org_id;
SELECT w.org_id, COUNT(*) AS actions FROM workflow_actions a JOIN workflows w ON w.id = a.workflow_id WHERE w.org_id = 'YOUR_ORG_ID' GROUP BY w.org_id;
SELECT w.org_id, COUNT(*) AS conditions FROM workflow_conditions c JOIN workflows w ON w.id = c.workflow_id WHERE w.org_id = 'YOUR_ORG_ID' GROUP BY w.org_id;

-- List workflows
SELECT name, enabled, event_type, entity_type FROM workflows WHERE org_id = 'YOUR_ORG_ID' ORDER BY name;
```

**Placeholders to resolve after seed (or add to API payloads):**

- `{{booked_stage_id}}` — passed by book-v2/confirm.
- `{{quote_started_stage_id}}` — passed by quote-start.
- `{{scheduled_job_status_id}}` / `{{assigned_job_status_id}}` / `{{completed_job_status_id}}` — **optional** if job `update_entity` patches use `status_key` instead of `job_status_id`.

**Smoke test checklist:**

1. **action_link_consumed**
   - Insert an `action_links` row (token, action_type=vendor_accept_job, entity_type=job, entity_id=job_uuid, expires_at=future, org_id=your_org).
   - POST `/api/action/[token]/consume` with body `{ "vendor_id": "<vendor_uuid>" }`.
   - Confirm `workflow_runs` has a row for the workflow "Action link: vendor_accept_job update job" with status=completed and that the job's `vendor_id` was updated.

2. **booking_confirmed**
   - Run a full book-v2 confirm flow (or POST `/api/admin/workflows/[workflow_id]/run` with body `{ "event_payload": { "event_type": "booking_confirmed", "org_id": "...", "booked_stage_id": "...", "scheduled_job_status_id": "...", "job": {...}, "opportunity": {...}, "schedule": {...}, "contact": {...}, "customer": {...} } }`).
   - Confirm `workflow_runs` has a completed run and that the opportunity's `pipeline_stage_id` and `status`, and the job's `status_key` (and aligned `job_status_id`), were updated as expected.

---

*End of spec. SQL script: `supabase/seed/workflow_action_links_seed.sql`.*
