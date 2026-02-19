# Events (code-implied)

System events that exist in the current codebase: what triggers them and what DB writes occur. This doc does not invent an event bus; it describes what the app does today.

---

## booking_confirmed

- **Trigger:** Successful `POST /api/book-v2/confirm` after opportunity, job, and schedule are created or reused and integrity check passes.
- **Location:** `web/app/api/book-v2/confirm/route.ts` (Step 10).
- **What happens:**
  - Load workflows where `enabled = true`, `event_type = 'booking_confirmed'`, `entity_type = 'job'`.
  - For each, call `executeWorkflowRun(supabase, workflowId, eventPayload)` with payload containing job, opportunity, contact, customer, schedule (and event_type, occurred_at, org_id).
  - Workflow run is inserted in **workflow_runs**; conditions are evaluated; actions run (e.g. send_message → enqueue **messages_outbox**).
- **Then:** Job is updated with `job_status_id = 'scheduled'` (idempotent).

---

## Action links (token-based)

- **Table:** **action_links** (token, action_type, entity_type, entity_id, expires_at, consumed_at).
- **Trigger:** User opens a link that includes a token (e.g. `/a/[token]`). Route consumes the token and dispatches by **action_type** (e.g. vendor_accept_job, customer_reschedule, customer_cancel).
- **Location:** `web/app/api/action/[token]/consume/route.ts` (or equivalent).
- **DB:** Token is marked consumed (`consumed_at` set); then the handler performs the action (e.g. update assignment status, create reschedule, set schedule canceled_at). No separate “event” table; the action is the side effect.

---

## Workflow run (generic)

- **Trigger:** Explicit call to `executeWorkflowRun(supabase, workflowId, eventPayload)`. Currently used from confirm (booking_confirmed). No other triggers are implied by the codebase without further inspection.
- **DB writes:**
  - **workflow_runs:** One row per run (status, event_payload, etc.).
  - **workflow_actions:** Evaluated in order; e.g. “send_message” inserts into **messages_outbox** (status queued).
- **Outbox:** **messages_outbox** rows are written by the workflow runner. Actual send (Twilio, etc.) is TBD; processing is not described in the repo.

---

## Future automation (TBD)

- **Twilio / outbound send:** messages_outbox is the queue; sender (cron, Lambda, or internal job) and Twilio integration are TBD.
- **Other workflow triggers:** No other event types (e.g. schedule_created, assignment_accepted) are wired in this doc; add when implemented.
- **Webhooks from external systems:** Backend (Python) may receive GHL webhooks; not covered here.

---

## Notes / TBD

- List all action_type values used in action_links and their handlers.
- Document messages_outbox processing (who consumes, retries, failure handling).
- Add any other call sites of executeWorkflowRun if present.
