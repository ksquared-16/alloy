# Workflow execution consistency audit

**Date:** 2026-05-02  
**Related:** `docs/archive/2026-06-superseded-system/actions-and-workflows.md`, `docs/audits/event-integrity-audit.md`, `docs/product/crm-system.md`

## Intended model

For **event-driven** operational automation:

```text
User or system action
  → durable mutation (when the flow changes business data)
  → emitEvent → workflow_events row
  → lookup enabled workflows (event_type + entity_type + org/global scope)
  → executeWorkflowRun(..., { event_id, org_id })
  → workflow_actions (in workflowRun) → side effects (e.g. send mirror, action links, field updates)
```

**Parallel paths** that are not workflow steps are acceptable when documented (e.g. backend workers reading `communication_messages`, admin “run workflow” without a triggering event).

---

## 1. Status update flow

### Text diagram

```text
UI: Admin entity drawer / queue actions
  → PATCH /api/admin/opportunities/[id] | /api/admin/jobs/[id] | /api/admin/schedules/[id]
     OR POST /api/admin/actions/execute (update_status on opportunities)
     OR POST /api/admin/schedules/[id]/cancel
     OR PATCH …/contacts, customers, vendors, locations, payments, subscriptions, documents, customer-members (+ other emitStatusChangedEvent call sites)
  → Supabase UPDATE on entity row (validate status via assertAllowedStatusKey / validateStatusTransition where applicable)
  → emitStatusChangedEvent(...)
       → emitEvent: opportunity_status_changed (opportunities) OR entity_status_changed (all other entity types)
       → workflow_events insert
       → query workflows (enabled, matching event_type + entity_type, org or global)
       → for each: executeWorkflowRun(..., { event_id, org_id })
  → workflow_runs rows + workflow_actions execution inside workflowRun
  → side effects per workflow definition (communications mirror, links, etc.)

Exception — job convenience actions on PATCH /api/admin/jobs/[id]:
  → body.action in { assign_vendor, mark_completed } uses a separate path:
     emitEvent(job_action) + workflow fan-out (unchanged).
  → Ordinary status_key patch on the same route uses emitStatusChangedEvent (above).
```

### Notes

- **`emitStatusChangedEvent`** (`web/lib/admin/emitStatusChangedEvent.ts`) is the single server path for status-key transitions that feed **`workflow_events`**; it now performs **workflow fan-out** after insert (2026-05-02 fix), matching routes such as schedule assign and action-link consume.
- **`executeAdminAction`** `update_status` updates `opportunities`, then calls **`emitStatusChangedEvent`**; workflows now run without duplicating fan-out in `executeAdminAction`.

---

## 2. Message send flow

### Text diagram

```text
UI: Admin communications composer (AdminEntityDrawer)
  → POST /api/admin/communications/send
       → permission + binding checks
       → enqueueCanonicalOutboundMessage(...)
            → upsert communication_threads
            → insert communication_messages (status = queued)
            → emitEvent(message_queued) → workflow_events
            → query workflows (message_queued + entity_type)
            → for each: executeWorkflowRun(..., { event_id, org_id })  [2026-05-02]
  → triggerBackendMessagesQueue(...) (best-effort; separate delivery worker)
  → Provider delivery / dequeue is NOT implemented as a workflow_action in this trace; it is worker/cron-driven off queued rows.
```

### Notes

- **Dual path:** Workflows may run on **`message_queued`** (automations, mirrors, follow-ups). **Physical send** still depends on the **backend messages processor** and bindings — that is intentional and not a duplicate “hidden” workflow bypass.
- **`enqueueCanonicalOutboundMessage`** is also used from **workflow dual-write** (`mirrorQueuedMessage`); `workflow_run_id` on the message links back to the run that enqueued it. Dynamic import of **`executeWorkflowRun`** avoids a module cycle (`workflowRun` → `mirrorQueuedMessage` → `canonicalOutboundEnqueue`).

---

## 3. Scheduling action flow

### Text diagram

```text
Create
  → POST /api/admin/schedules
       → insert schedule (+ related rows as implemented)
       → emitEvent(schedule_created) + workflow fan-out (executeWorkflowRun with event_id)

Vendor assign
  → POST /api/admin/schedules/[id]/assign
       → emitEvent(schedule_vendor_assigned) + workflow fan-out

Reschedule
  → POST /api/admin/schedules/[id]/reschedule
       → mutate schedule times / rows
       → emitEvent + workflow fan-out (pattern in route)

Cancel
  → POST /api/admin/schedules/[id]/cancel
       → UPDATE schedules (canceled_*, status)
       → maybeCreateCancellationFeeCharge (direct side effect; not workflow-gated)
       → emitStatusChangedEvent → emitEvent + workflow fan-out (via emitStatusChangedEvent)

Status / completion on PATCH schedule
  → PATCH /api/admin/schedules/[id]
       → optional generateNextSubscriptionSchedule (emits schedule_created + fan-out internally when it creates a row)
       → optional postScheduleCompletion (GL; emits dedicated GL events per post-* routes — see event-integrity audit)
       → emitStatusChangedEvent when status_key changes → workflow fan-out

Assignment status (vendor accept/decline, etc.)
  → PATCH /api/admin/schedules/[id]/assignment
       → UPDATE assignments
       → emitEvent(assignment_status_changed) + workflow fan-out (2026-05-02)

Customer / token scheduling links
  → POST /api/action/[token]/consume, /api/action-links/consume-reschedule, consume-accept-job
       → durable mutations + emitEvent + workflow fan-out with event_id
```

---

## Summary table

| Flow | Entry route/helper | Event emitted? | Workflow dispatched? | Uses event_id? | Action execution path | Deviation (before) | Fix applied / note |
|------|---------------------|----------------|----------------------|----------------|------------------------|----------------------|---------------------|
| Status update (generic) | `emitStatusChangedEvent` ← PATCH routes listed in event-integrity audit + `executeAdminAction` (update_status) | Yes (`opportunity_status_changed` or `entity_status_changed`) | Yes | Yes | `executeWorkflowRun` → actions in `workflowRun.ts` | Event only; no fan-out | **Fixed:** fan-out added in `emitStatusChangedEvent` |
| Status update (job action shortcut) | `PATCH /api/admin/jobs/[id]` with `action: assign_vendor \| mark_completed` | Yes (`job_action`) | Yes | Yes | `executeWorkflowRun` | None | N/A |
| Message send | `POST …/communications/send` → `enqueueCanonicalOutboundMessage` | Yes (`message_queued`) | Yes | Yes | `executeWorkflowRun` → actions; **plus** backend queue processor for delivery | Event only; no workflow fan-out | **Fixed:** fan-out after emit (dynamic import of `workflowRun`) |
| Schedule create | `POST /api/admin/schedules` | Yes (`schedule_created`) | Yes | Yes | `executeWorkflowRun` | None | N/A |
| Schedule vendor assign | `POST …/schedules/[id]/assign` | Yes | Yes | Yes | `executeWorkflowRun` | None | N/A |
| Schedule reschedule | `POST …/schedules/[id]/reschedule` | Yes | Yes | Yes | `executeWorkflowRun` | None | N/A |
| Schedule cancel | `POST …/schedules/[id]/cancel` | Yes (via `emitStatusChangedEvent`) | Yes (after fix) | Yes | `executeWorkflowRun` | Same as generic status | Covered by `emitStatusChangedEvent` fix |
| Schedule PATCH (status) | `PATCH …/schedules/[id]` | Yes (via `emitStatusChangedEvent` when `status_key` updates) | Yes (after fix) | Yes | `executeWorkflowRun` | Same as generic status | Covered by `emitStatusChangedEvent` fix |
| Assignment status | `PATCH …/schedules/[id]/assignment` | Yes (`assignment_status_changed`) | Yes | Yes | `executeWorkflowRun` | Event only | **Fixed:** fan-out in route (same query shape as assign) |
| Action links / token consume | `action/[token]/consume`, `action-links/*` | Yes | Yes | Yes | `executeWorkflowRun` | None | N/A |
| Manual workflow run | `POST …/admin/workflows/[id]/run` | No (admin supplies `event_payload` only) | N/A (run is the goal) | **No** | `executeWorkflowRun` without `event_id` | By design for operator/testing | **Documented** — not an event-driven trigger |

---

## Remaining intentional deviations

1. **Cancellation fee** — `maybeCreateCancellationFeeCharge` runs in the cancel route after the schedule row is updated. That is a **direct** billing side effect, not a workflow action. Documented here; do not assume it is workflow-gated unless product moves it into a workflow step.
2. **`/api/admin/workflows/[id]/run`** — Manual execution; **`workflow_runs.event_id`** is null unless the UI starts passing one later.
3. **GL posting helpers** on schedule completion may emit **`schedule_*_gl_posted`** events without workflow fan-out (audit / future triggers) — see **`docs/audits/event-integrity-audit.md`**.
4. **`validateWorkflowEventMatch`** — For event-driven runs, **`opportunity_status_changed`** now receives the same **`new_status_key`** presence check as **`entity_status_changed`** (prevents empty transition from matching automations).

---

## Duplicate event insert logic

- **`emitEvent`** is the only insert implementation for new canonical rows (`web/lib/emitEvent.ts`).
- **`emitStatusChangedEvent`** and **`enqueueCanonicalOutboundMessage`** call **`emitEvent`**; no second insert path.

---

## Smoke-test notes

1. **Opportunity status** — PATCH an opportunity’s `status_key`. Expect **`workflow_events.event_type = opportunity_status_changed`**. If a workflow exists for that `event_type` + `entity_type = opportunities`, expect **`workflow_runs.event_id`** set to that event and actions to execute (or `skipped` with `skip_reason` if conditions fail).
2. **Job status** — PATCH `status_key` on a job. Expect **`entity_status_changed`**, `entity_type = jobs`, same **`event_id`** linkage on runs.
3. **Schedule cancel** — POST cancel. Expect status event + matching workflows with **`event_id`**.
4. **Composer send** — POST `/api/admin/communications/send` (valid org + bindings). Expect **`message_queued`** and, when a matching workflow exists, runs with **`event_id`**. Confirm a queued **`communication_messages`** row still appears and backend trigger log matches existing behavior.
5. **Assignment status** — PATCH assignment `status_key`. Expect **`assignment_status_changed`** and linked **`workflow_runs`** when workflows are configured.

---

## Code references (fix set, 2026-05-02)

| Change | File |
|--------|------|
| Status transition → workflows | `web/lib/admin/emitStatusChangedEvent.ts` |
| message_queued → workflows | `web/lib/communications/canonicalOutboundEnqueue.ts` |
| assignment_status_changed → workflows | `web/app/api/admin/schedules/[id]/assignment/route.ts` |
| opportunity_status_changed validation parity | `web/lib/workflowRun.ts` (`validateWorkflowEventMatch`) |
