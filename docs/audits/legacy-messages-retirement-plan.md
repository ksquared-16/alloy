# Legacy `messages` / `messages_outbox` retirement plan (2026)

**Purpose:** Document **current read/write paths** and a **phased backfill/retirement** plan. **No schema removal**, **no code changes** in this document.

**Canonical V1:** **`communication_threads`**, **`communication_messages`**, **`communication_provider_bindings`**, **`communication_message_reads`** — see **`docs/product/communications.md`**.

**Compatibility surfaces:** **`public.messages`** (SMS queue + historical rows; no `org_id` column — isolation via chains + admin/ops RLS per live audit) and **`messages_outbox`** (audit/UI + workflow enqueue metadata).

---

## Current write paths

| Path | Table(s) | Mechanism |
|------|-----------|-----------|
| Workflow **`send_message`** / **`create_message`** | **`messages`**, optionally **`messages_outbox`** | `web/lib/workflowRun.ts` — **`createAdminClient()`** inserts **`messages`** for Twilio queue; may insert **`messages_outbox`** for audit/dedupe (`LEGACY_COMPAT` on **`to_contact_id`**). |
| Backend inbound SMS | **`messages`** | `backend/app/routes/sms_inbound.py` — PostgREST **`POST /messages`** (service headers); then **`emit_message_lifecycle_event`** → **`workflow_events`**. |
| Backend outbound dispatcher | **`messages`** | `backend/app/services/message_sender.py` — reads/updates **`messages`** via PostgREST. |
| Canonical outbound | **`communication_*`** (+ **`workflow_events`**) | `web/lib/communications/canonicalOutboundEnqueue.ts`, **`emitEvent`** — **preferred** for new product flows. |

---

## Current read paths

| Path | Table | Mechanism |
|------|-------|-----------|
| Admin **`/admin/messaging`** | **`messages_outbox`** | `web/app/admin/messaging/page.tsx` — server **`createAdminClient()`** list. |
| Admin **`/admin/messages-outbox`** | **`messages_outbox`** | `web/app/admin/messages-outbox/page.tsx` — same pattern. |
| Admin dashboard failed count | **`messages_outbox`** | `web/app/admin/dashboard/page.tsx` — failed status head count. |
| Related entities drawer API | **`messages_outbox`** | `web/app/api/admin/related/[entity]/[id]/route.ts` — **`to_contact_id`** linkage. |
| Staging demo reset | **`messages`**, **`messages_outbox`** | `web/scripts/resetStagingDemoData.ts` — optional deletes/counts. |

---

## Retirement phases (recommended order)

### Phase 0 — Freeze expansion (now)

- **No new features** that depend on **`messages`** / **`messages_outbox`** as primary storage (**already** stated in **`docs/product/communications.md`**).
- New outbound/inbound product work uses **`communication_*`** APIs and worker paths only.

### Phase 1 — Observability & parity checklist

- Metrics/dashboards: volume of workflow-driven **`messages`** inserts vs **`communication_messages`** queued rows per org.  
- Confirm **`INTERNAL_MESSAGES_PROCESS_URL`** / cron covers both pipelines where dual-path exists.  
- Document **`COMMUNICATION_DUAL_WRITE`** behavior wherever **`mirrorQueuedMessage`** still applies.

### Phase 2 — Read-path consolidation

- Replace admin reliance on **`messages_outbox`** previews where **`communication_messages`** can serve the same UX (thread/message listing per entity).  
- Keep **`messages_outbox`** until Phase 3 if ops still need workflow-run correlation keys not yet mirrored in **`communication_*`**.

### Phase 3 — Write-path migration

- For each workflow template still using **`send_message`** / **`create_message`**, either:  
  - **(A)** Rewire to canonical enqueue (**`enqueueCanonicalOutboundMessage`** + **`message_queued`**), or  
  - **(B)** Accept intentional legacy SMS-only paths with explicit guardrails (document + restrict edits).  
- Backend **`message_sender`** dequeue: extend or replace so primary dequeue is **`communication_messages`**; **`messages`** becomes drain-only for backlog.

### Phase 4 — Backfill (optional but recommended before drop)

- Historical **`messages`** rows → **`communication_messages`** / threads where channel + entity keys can be reconstructed (may be lossy for old rows missing person/thread anchors — **design sign-off**).  
- **`messages_outbox`** rows → audit archive table or mapped metadata on **`communication_messages`** if needed for compliance.

### Phase 5 — Schema/policy retirement (future; not scheduled here)

- Only after Phases 2–4 and explicit sign-off: tighten RLS or archive tables — **out of scope** for current cleanup sprints.

---

## Risks / dependencies

- **Inbound SMS** today persists to **`messages`** first; canonical inbound paths must remain coherent with **`communication_*`** (already partially implemented on backend — verify per deployment).  
- **`workflow_run_id`** correlation appears on both legacy and canonical paths — retirement scripts must preserve traceability for **`workflow_runs`**.

---

## Related

- **`docs/product/communications.md`** — dual pipeline and canonical model.  
- **`docs/audits/supabase-schema-alignment-audit.md`** — legacy **`messages`** RLS risk notes.  
- **`docs/audits/person-vs-contact-audit.md`** — **`LEGACY_COMPAT`** touchpoints.
