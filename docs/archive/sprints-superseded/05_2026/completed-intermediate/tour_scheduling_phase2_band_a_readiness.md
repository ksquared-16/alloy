# Tour Scheduling Phase 2 — Band A Readiness (Implementation Lock)

**Status:** **CLOSED** — Band A shipped (Batches 1–6, May 2026). See **[`tour_scheduling_phase2_band_a_closeout.md`](./tour_scheduling_phase2_band_a_closeout.md)** for staging QA outcomes and operational learnings.  
**Date:** 2026-05-27  
**Parent:** [`tour_scheduling_phase2_foundation.md`](./tour_scheduling_phase2_foundation.md)  
**Scope:** Band A only — Communications + Reminder Foundation (cards A1–A11).

---

## 1. Purpose

Validate that Alloy can implement **Band A** (confirmation, reminders, reschedule/cancel/no-show notifications, template registry, quiet hours, ICS/add-to-calendar, audit/telemetry) **without violating** platform doctrine, **without inventing a parallel reminder engine**, and **with maximum safe Cursor autonomous batching**.

This doc locks:

- **ONE** reminder orchestration architecture  
- **ONE** timezone hierarchy for tour comms  
- **ICS** delivery approach compatible with current Resend worker  
- **Schema/migration** minimum set  
- **Legacy `schedule_tour` coexistence** rules  
- **Autonomous implementation batches** for cards A1–A11  

---

## 2. Current infrastructure audit

### 2.1 Tour scheduling (V1 — authoritative for Band A triggers)

| Component | Location | Band A relevance |
|-----------|----------|------------------|
| Booking mutations | `web/lib/tours/bookings/tourBookingService.ts` | **Single hook point** for comms side effects (after DB commit) |
| Lifecycle events | `web/lib/tours/events/tourLifecycleEvents.ts` | Emits locked tour events + workflow fan-out; **no comms today** |
| Opportunity sync | `web/lib/tours/opportunity/tourBookingOpportunityIntegration.ts` | Mirror + status; runs **before** tour lifecycle events on confirm |
| Constants | `web/lib/tours/constants.ts` | Locked `TOUR_LIFECYCLE_EVENT_TYPES` — subscribe, do not rename |
| Public book | `createTourBooking` | Can auto-confirm → should trigger confirmation comms |

**Emission order today (confirm path):** booking update → `applyTourBookingOpportunityIntegration` → `emitTourBookingLifecycleEvent`.  
**Band A lock:** invoke `tourCommsOrchestrator` **after** opportunity integration on confirm/reschedule, and **after** booking row commit for cancel/complete/no-show; **never** before booking SoT is persisted.

### 2.2 Communications V1 (canonical outbound)

| Layer | Location | Capability |
|-------|----------|------------|
| Enqueue | `web/lib/communications/canonicalOutboundEnqueue.ts` | Thread upsert + `communication_messages` (`status: queued`) + `message_queued` event |
| Send executor | `web/lib/communications/executeCommunicationsSend.ts` | Person resolution, binding pick, calls enqueue |
| Drawer recipients | `web/lib/communications/drawerEmailRecipients.ts` | Person-first email/SMS for **opportunities** |
| Composer starters | `web/lib/communications/opportunityComposeTemplates.ts` | **Hardcoded** status-based draft strings — **not** a template registry |
| Delivery | `backend/app/services/communication_message_sender.py` + `resend_client.py` | SMS (Twilio) + email (Resend); **plain/html body only — no attachments** |
| Wake worker | `web/lib/communications/triggerBackendMessagesQueue.ts` | Best-effort POST to `INTERNAL_MESSAGES_PROCESS_URL` |

**Threading:** `communication_threads` keyed by `(org_id, primary_entity_type, primary_entity_id, channel, recipient_key)`. Tour comms should use **`primary_entity_type = opportunities`**, **`primary_entity_id = opportunity_id`** (matches scheduled-send FK today). Store **`tour_booking_id`** in message/schedule `metadata`.

### 2.3 Scheduled sends (Task Assist V1.1)

| Item | State |
|------|--------|
| Table | `communication_scheduled_sends` (exported in schema reference CSVs) |
| Processor | `processDueCommunicationScheduledSends` → RPC `claim_due_communication_scheduled_sends` (SKIP LOCKED) → `executeCommunicationsSend` |
| Cron route | `POST /api/admin/communication-scheduled-sends/process-due` (`x-cron-token` or admin org-scoped) |
| Stale claim recovery | `releaseStaleClaimedCommunicationScheduledSends` — **separate** ops/cron, not auto in process-due |
| Idempotency | Skips if `communication_message_id` already set; conditional update on enqueue success |

**Hard DB constraints (blockers for tour reuse without migration):**

```text
communication_scheduled_sends.entity_type_check  → ONLY 'opportunities'
communication_scheduled_sends.entity_id_fkey     → opportunities(id)
communication_scheduled_sends.source_check     → ONLY 'task_assist'
```

**Task Assist validator** (`validateCommunicationScheduledSendCreateBody`) additionally restricts API-created rows to `source: task_assist` and `entity_type: opportunities`. Tour paths must use a **dedicated service insert** (service role / new internal API), not the Task Assist HTTP validator.

### 2.4 Workflow / delayed execution

| Capability | Present? | Notes |
|------------|----------|-------|
| Tour lifecycle `workflow_events` | Yes | `emitTourBookingLifecycleEvent` |
| Workflow `send_message` | Yes | `web/lib/workflowRun.ts` — legacy + canonical dual-write optional |
| **Delayed workflow steps** | **No** | No `wait_until` / schedule step in `workflowRun` grep |
| Enrollment tour follow-up | Yes | `opportunity_schedule_tour_followup` on **`opportunities`** — metadata/form driven; **log-only demo steps** in seed migration |
| Workflows on `tour_confirmed` | **Not seeded** | Fan-out works if org configures |

### 2.5 ICS / attachments

| Search | Result |
|--------|--------|
| `.ics` / `text/calendar` / `VEVENT` in repo | **None** (only Phase 2 planning docs) |
| `communication_messages` attachment columns | **None** |
| Resend `send_resend_email` | `from`, `to`, `subject`, `html` or `text` only |

### 2.6 Quiet hours

| Search | Result |
|--------|--------|
| `quiet_hour` in codebase | **No implementation** (planning docs only) |

### 2.7 Template registry

| System | Purpose | Tour-ready? |
|--------|---------|-------------|
| `enrollmentPacketEmailTemplate.ts` | `{{placeholder}}` merge for packet email | **Pattern to reuse** — not wired to tours |
| `opportunityComposeTemplates.ts` | Drawer composer starters | Hardcoded — **not** org-configurable |
| DB table `communication_templates` | — | **Does not exist** |

### 2.8 Audit / telemetry

| System | State |
|--------|--------|
| `logAdminAudit` | Console-only (`web/lib/admin/adminAuditLog.ts`) |
| `workflow_events` | Tour + `message_queued` events exist |
| Comms metadata | `metadata.source` on enqueue (e.g. `drawer_composer`, `header_quick_message`) |

### 2.9 Unsubscribe / compliance

| Topic | State |
|-------|--------|
| SMS consent copy | Static pages/forms (cleaning quote, `sms-consent`) — **not** opportunity tour-specific |
| Person eligibility | `assertRecipientPersonEligibleForDrawerSms/Email` for drawer sends |
| Unsubscribe DB | **Not found** in tour/comms path audit — provider STOP handling via Twilio |
| Transactional vs marketing | **Undifferentiated in code** — **human gate** for tour SMS copy classification |

---

## 3. Communications infrastructure reuse analysis

### 3.1 Reuse directly (no fork)

| Primitive | Use for Band A |
|-----------|----------------|
| `enqueueCanonicalOutboundMessage` | All **immediate** tour emails/SMS (confirm, cancel, reschedule) |
| `executeCommunicationsSend` | Recipient resolution + binding selection (scheduled path) |
| `fetchOpportunityDrawerEmailRecipients` / person email helpers | Family recipient resolution |
| `processDueCommunicationScheduledSends` + existing cron route | **Reminder due processing** (after migration extends `source`) |
| `triggerBackendMessagesQueue` | Post-enqueue worker wake |
| `communication_provider_bindings` | Org channel routing |
| `formatTourDateTime` / `deriveTourMetadataMirrorFromBooking` | Template variables for wall-time display |
| Enrollment `applyEnrollmentEmailPlaceholders` pattern | `{{var}}` merge implementation |

### 3.2 Extend (required)

| Area | Extension |
|------|-----------|
| `communication_scheduled_sends.source` CHECK | Add `'tour_scheduling'` (migration) |
| `createCommunicationScheduledSend` / validators | New **`createTourSchedulingScheduledSend`** internal function — bypass Task Assist-only validator |
| `processDueCommunicationScheduledSends` metadata | Pass `tour_booking_id`, `reminder_kind` through to `executeCommunicationsSend` augment |
| `executeCommunicationsSend` | Allow `primaryEntityType: opportunities` with metadata augment (already supports `sendMetadataAugment`) |
| Org config | `org_settings.metadata.tour_comms` (+ optional `locations.metadata.tour_comms` overrides) |
| `tourBookingService` | Call orchestrator hooks (thin — no inline comms logic) |

### 3.3 Do NOT reuse

| Surface | Why |
|---------|-----|
| Task Assist HTTP create scheduled send API | Forbidden keys + `source: task_assist` only + human proposal flow |
| Workflow `send_message` as **primary** tour reminder transport | No delay primitive; duplicates scheduling; harder dedup |
| `opportunityComposeTemplates` as registry | Not org-configurable; wrong lifecycle |
| `public.messages` / `messages_outbox` | Legacy — doctrine says extend `communication_*` |
| Metadata-only `schedule_tour` as comms trigger | Not booking SoT — risks wrong time/recipient |

---

## 4. Workflow / event orchestration analysis

### 4.1 Tour events (actual)

Emitted from `tourBookingService` → `emitTourBookingLifecycleEvent`:

| Event | Typical trigger |
|-------|-----------------|
| `tour_requested` | Create with `requested` |
| `tour_booking_pending` | Create with `pending_approval` |
| `tour_confirmed` | Create auto-confirm or admin confirm |
| `tour_rescheduled` | Reschedule mutation |
| `tour_canceled` | Cancel |
| `tour_no_show` | No-show |
| `tour_completed` | Complete |

Payload includes: `booking_id`, `opportunity_id`, `location_id`, `start_at`, `end_at`, `timezone`, `status_key`, `source`.

**Idempotency:** One event per successful mutation; **no** built-in dedup on `emitEvent`. Retries at API layer could double-emit — orchestrator must dedup comms, not rely on event uniqueness.

**Retry semantics:** `executeWorkflowRun` failures log `console.warn` and continue — **workflows are best-effort**. Core product comms must not depend solely on customer-configured workflows.

### 4.2 Options evaluated

| Approach | Verdict |
|----------|---------|
| **A. Workflow-driven reminders** | **Reject as primary** — no delayed execution; variable org workflow config = inconsistent product |
| **B. Cron polling dedicated `tour_reminder_schedules` table** | Valid but **violates “no parallel reminder engine”** unless table is thin alias — still needs processor |
| **C. Communication-native `communication_scheduled_sends`** | **SELECT** — reuses claim RPC, enqueue path, cron |
| **D. Hybrid: orchestrator + optional workflow subscribers** | **SELECT** — C for product guarantees; org workflows may add **extra** steps on `tour_confirmed` |

### 4.3 Architecture lock

**Band A uses: communication-native scheduling (C) with optional workflow side effects (D).**

```text
tourBookingService (mutation committed)
    → tourCommsOrchestrator (new, web/lib/tours/comms/)
        → immediate: enqueueCanonicalOutboundMessage
        → future: createTourSchedulingScheduledSend (communication_scheduled_sends)
    → emitTourBookingLifecycleEvent (unchanged)
        → optional org workflows (secondary)
```

**Do not** add new `workflow_events.event_type` names for reminders. Use existing tour events only for optional workflow subscriptions.

---

## 5. Reminder orchestration recommendation

### 5.1 Canonical pattern

| Concern | Implementation |
|---------|----------------|
| **Schedule storage** | `communication_scheduled_sends` rows with `source = 'tour_scheduling'` |
| **Entity anchor** | `entity_type = 'opportunities'`, `entity_id = opportunity_id` (FK-safe) |
| **Booking reference** | `metadata.tour_booking_id`, `metadata.reminder_kind`, `metadata.booking_updated_at` (ISO), `metadata.schedule_generation` (int) |
| **Body at schedule time** | **Snapshot** subject/body at schedule creation (like Task Assist) — re-render only on explicit reschedule requeue |
| **Due processing** | Existing `processDueCommunicationScheduledSends` cron (no new worker) |
| **Approval fields** | Auto-approve tour rows: `approved_at = now()`, `approved_by = system user or created_by service` — satisfies `scheduled_for > approved_at` CHECK |

### 5.2 Reminder kinds (config-driven offsets)

| `reminder_kind` | Default offset (configurable per org) | Quiet hours |
|-----------------|--------------------------------------|-------------|
| `tour_reminder_24h` | `start_at - 24h` | Defer |
| `tour_reminder_same_day` | `start_at - 2h` (example) | Defer |
| (extensible) | Org JSON list `{ kind, offset_minutes, channels[] }` | Per kind |

**Timezone:** Compute `scheduled_for` in **booking IANA** (`tour_bookings.timezone`), persist as UTC instant in `scheduled_for`.

### 5.3 Idempotency model

**On schedule (confirm / reschedule):**

1. `cancelTourSchedulingReminders(orgId, bookingId)` — set `status = canceled` on pending/claimed/failed rows for that booking id in metadata.  
2. Increment `schedule_generation` (or use `booking.updated_at` as metadata).  
3. Insert **N** new rows (one per enabled offset/kind/channel) with dedup metadata.

**DB guard (migration):** partial unique index:

```sql
-- Illustrative; exact name in implementation migration
UNIQUE (org_id, (metadata->>'tour_booking_id'), (metadata->>'reminder_kind'), channel)
WHERE source = 'tour_scheduling' AND status IN ('pending', 'claimed')
```

### 5.4 Cancellation model

| Booking event | Reminder behavior | Immediate comms |
|---------------|-------------------|-----------------|
| `tour_canceled` | Cancel all pending tour scheduled sends | Send cancel notification (if enabled) |
| `tour_rescheduled` | Cancel + re-schedule reminders | Send reschedule notification |
| `tour_completed` / `no_show` | Cancel pending reminders | Optional no-show follow-up (A8) |
| `tour_booking_pending` | No reminders until confirm (default) | Optional pending internal notice |

### 5.5 Recovery model

| Failure | Behavior |
|---------|----------|
| `processDue` enqueue fails | Row → `failed` with `metadata.last_process_error` (existing pattern) |
| Stale `claimed` | Ops: `releaseStaleClaimedCommunicationScheduledSends` (existing) |
| Past-due after quiet hours deferral | See §8 — skip or send on next cron with `metadata.quiet_hours_deferred` flag |
| Booking deleted/cascade | FK on `entity_id` → opportunities cascades; metadata booking id orphan — cancel on booking cancel path |

### 5.6 Retry behavior

- **No custom retry loop in Band A** — rely on `failed` status + admin reprocess patterns from Task Assist (optional admin UI later).  
- Cron runs every N minutes; failed rows remain failed until manual patch or reschedule booking.

---

## 6. ICS generation architecture

### 6.1 Constraints (verified)

- Python Resend adapter: **no attachments API** in current code.  
- `communication_messages`: no attachment storage.  

### 6.2 Band A approach (locked)

| Deliverable | Approach |
|-------------|----------|
| **ICS content** | Pure function module `web/lib/tours/comms/buildTourBookingIcs.ts` — RFC 5545 `VEVENT`, `DTSTART`/`DTEND` as UTC `Z` or TZID per serialization rules |
| **Generation timing** | **On demand** when sending email / serving download route — **not** persisted to DB in Band A |
| **Email inclusion** | **HTTPS link** in HTML body (`Add to calendar`) + optional `text/calendar` snippet — **not** Resend attachment in Band A |
| **Public add-to-calendar** | `GET /api/public/tour-booking/ics?token=...` or signed booking token — validates scope like public book |
| **Admin/operator** | `GET /api/admin/tours/bookings/[id]/ics` (auth) |
| **Stakeholder “blocking” without OAuth** | Email **METHOD:REQUEST** style ICS **link** to host — manual import; true blocking is Band D |

### 6.3 UID / versioning (lock for Band A)

```text
UID: tour-booking-{booking_id}@alloy.app   (stable per booking)
SEQUENCE: metadata.ics_sequence integer — increment on reschedule
STATUS: CONFIRMED | CANCELLED (cancel path serves CANCELLED ICS)
```

Reschedule: **same UID**, increment `SEQUENCE`, update `DTSTART`/`DTEND`. Cancel: emit `STATUS:CANCELLED` ICS at cancel link.

### 6.4 Timezone serialization

- Source instant: `tour_bookings.start_at` / `end_at` (timestamptz UTC).  
- Display TZ: `tour_bookings.timezone` (IANA).  
- ICS: prefer `TZID={booking.timezone}` with local wall components **or** UTC `Z` — pick **one** format in A9 tests (recommend **UTC Z** for simplest interoperability in Band A).

---

## 7. Template registry readiness

### 7.1 Current state

**No** org-level communications template table. Packet templates live in **`form_packet_definitions.metadata`** with `applyEnrollmentEmailPlaceholders`.

### 7.2 Band A schema recommendation

**Option selected for implementation:** `org_settings.metadata.tour_comms` + optional `locations.metadata.tour_comms` override — **no new table in Band A** unless product requires version history.

```typescript
// Illustrative shape (A1 types)
tour_comms: {
  enabled: boolean;
  channels: { email: boolean; sms: boolean };
  quiet_hours?: { start: "21:00"; end: "08:00"; timezone_source: "booking" | "org" };
  reminder_offsets?: Array<{ kind: string; offset_minutes: number; channels: ("email"|"sms")[] }>;
  templates: {
    tour_confirmation_email?: { subject: string; body_html: string };
    tour_confirmation_sms?: { body: string };
    tour_reminder_email?: { ... };
    // reschedule, cancel, no_show_followup, ...
  };
  ics?: { include_in_confirmation: boolean; public_download_enabled: boolean };
}
```

**Vertical defaults:** childcare seed JSON in migration or seed script — **not** hardcoded in `tourBookingService`.

### 7.3 Rendering

| Step | Module |
|------|--------|
| Load effective config | `resolveTourCommsConfig(orgId, locationId)` — location override > org > platform default |
| Build variable bag | `buildTourCommsTemplateContext(booking, opportunity, location, org)` |
| Merge | `applyTourCommsPlaceholders(template, ctx)` — same algorithm as enrollment packet |
| Validate | Fail closed: missing required vars → skip send + log telemetry |

### 7.4 Governance

- Template editing via admin settings (A3 UI) — ops/admin only.  
- No arbitrary HTML from public users.  
- SMS segments length-checked with warning in admin preview (optional A3).

---

## 8. Quiet hours readiness

### 8.1 Current state

**Not implemented** anywhere in `web/lib/communications/**`.

### 8.2 Band A doctrine (locked)

| Rule | Behavior |
|------|----------|
| Applies to | **Reminder** scheduled sends only (default) |
| Does not block | **Immediate** confirmation on confirm (config flag `quiet_hours.apply_to_confirmation` default **false**) |
| Window | Org-local wall clock in timezone from `quiet_hours.timezone_source` |
| `timezone_source: booking` | Use `tour_bookings.timezone` |
| `timezone_source: org` | `resolveOrgTimezoneFromMetadata` |
| Deferral | If `scheduled_for` falls in quiet window → push to **window end** same day, or next morning **08:00** (config `defer_policy`) |
| Overdue | If `now > start_at` → **skip** reminder (log `reminder_skipped_past_tour`) |
| Expiry | Do not send reminders &lt; 15 minutes before `start_at` (config `min_lead_minutes`) |

### 8.3 Implementation location

`adjustScheduledForQuietHours(scheduledForUtc, policy, tz)` in `web/lib/tours/comms/quietHours.ts` — called only when creating tour scheduled sends.

---

## 9. Timezone handling doctrine

### 9.1 Canonical hierarchy (Band A lock)

| Priority | Source | Used for |
|----------|--------|----------|
| 1 | `tour_bookings.timezone` | Reminder scheduling, ICS, parent-facing copy, mirror alignment |
| 2 | `tour_bookings.start_at` / `end_at` (UTC instants) | All absolute comparisons (`now`, cron due) |
| 3 | `org_settings.metadata.timezone` | Quiet hours when `timezone_source: org`; fallback labels |
| 4 | `viewerDisplayTimeZoneIana` | **Admin UI display only** — never persist |
| 5 | `UTC_FALLBACK_IANA` | Invalid IANA repair + telemetry |

### 9.2 Risk areas

| Risk | Mitigation |
|------|------------|
| Legacy metadata `tour_date` without booking | Comms orchestrator **loads booking row**; if active booking exists, **ignore** metadata for times |
| DST gaps | Unit tests with America/New_York spring forward |
| SMS “tomorrow” wording | Template uses booking-TZ formatted string from shared formatter |

### 9.3 UTC normalization

- DB: always `timestamptz` for `scheduled_for`, `start_at`.  
- Code: `Date` / ISO strings in UTC; format with `date-fns-tz` + booking IANA for templates.

---

## 10. Legacy `schedule_tour` convergence plan

### 10.1 Inventory (verified)

| Dependency | Location | Behavior |
|------------|----------|----------|
| Action definition | `schedule_tour`, `reschedule_tour` in migrations + `actionDefinitionRegistry.ts` | `start_workflow` / open form |
| Condition | `metadata_field_missing/exists tour_date` | Shows schedule vs reschedule |
| Execute path | `executeAdminAction.ts` | Writes **metadata only** + emits `opportunity_schedule_tour_followup` |
| Workflow | `Enrollment: Schedule Tour Follow-up` | `opportunity_schedule_tour_followup` — log steps |
| Header UI | `AdminEntityDrawer` + `OpportunityTourScheduleActionModal` | **Slot booking** when `location_id`; legacy form fallback |
| BOS / assist | `communicationObjectives.ts`, workflow assist stubs | Suggests `schedule_tour` objective |
| Queues / attention | `metadata->>tour_date`, `tour_scheduled` status | Preview / Needs Attention |

### 10.2 Authoritative runtime precedence (lock)

```text
1. Active non-terminal tour_bookings row     → scheduling + comms authority
2. opportunities.metadata.tour_date/time      → legacy display + conditions only
3. schedule_tour action metadata write        → legacy; must NOT schedule reminders in Band A
```

### 10.3 Coexistence rules (Band A)

| Rule | Detail |
|------|--------|
| Comms triggers | **Only** `tourCommsOrchestrator` hooks from `tourBookingService` (and optional explicit admin resend later) |
| No metadata-triggered tour comms | `opportunity_schedule_tour_followup` workflow **does not** gain SMS/email steps in Band A seed |
| Legacy form | Still allowed for no-site opportunities; completing form **does not** call orchestrator unless a booking is created |
| Display | Inquiry tour row uses booking-backed display when hook returns active booking (V1) |

### 10.4 Migration sequencing

| Phase | Action |
|-------|--------|
| Band A | Booking-path comms only |
| Band B–C | Public confirm triggers same orchestrator |
| Post-Band A | Admin warning when metadata tour_date disagrees with booking |
| Future | Deprecate `schedule_tour` metadata write; action opens `OpportunityTourScheduleActionModal` only |

### 10.5 Deprecation target

**`tour_bookings` is the only operational scheduling runtime.** Metadata tour fields remain compatibility projections until queue/attention migrations complete (foundation doc).

---

## 11. Idempotency + dedupe strategy

| Layer | Mechanism |
|-------|-----------|
| **Reminder rows** | Partial unique index on `(org_id, booking_id, reminder_kind, channel)` for active statuses |
| **Immediate sends** | `metadata.idempotency_key = '{booking_id}:{event}:{channel}:{booking_updated_at}'` — check `communication_messages` metadata before enqueue (soft dedup, 24h window) OR rely on business logic “only one confirm per transition” |
| **Lifecycle** | Orchestrator keyed off booking `status_key` transitions — ignore duplicate API idempotent returns at service layer |
| **Cron** | Existing `communication_message_id` guard on scheduled sends |
| **Public book** | Same as confirm path — one create per success |

**Reschedule:** Cancel reminders + new generation; new immediate reschedule email allowed (expected).

---

## 12. Failure recovery strategy

| Scenario | Recovery |
|----------|----------|
| Enqueue fails after confirm | Log `tour_comms_failed`; booking remains confirmed; admin “resend confirmation” (post-A11 or manual composer) |
| Reminder failed row | Visible in scheduled sends attention counts pattern; ops reprocess via existing process-due |
| Missing recipient email/phone | Skip channel; log; optional internal alert row in metadata |
| Missing binding | Fail closed with clear log — same as drawer send |
| Worker env unset | Row queued until cron — existing comms doctrine |
| Orchestrator exception | **Must not roll back booking** — try/catch in hook; error logged |

---

## 13. Audit / telemetry strategy

| Signal | Implementation |
|--------|----------------|
| Outbound metadata | `source: tour_confirmation` / `tour_reminder` / `tour_reschedule` / `tour_cancel` / `tour_no_show_followup` |
| Scheduled send metadata | `tour_booking_id`, `reminder_kind`, `schedule_generation`, `quiet_hours_adjusted: true` |
| Structured logs | `console.warn/error` with `[tour_comms]` prefix + org tail |
| `workflow_events` | Existing tour events unchanged; optional `tour_comms_skipped` **not** added in Band A (avoid event sprawl) — use logs |
| Admin audit table | Future; Band A uses comms metadata + `communication_messages` lineage |
| Metrics hook | Count enqueued/skipped/deduped per org in orchestrator return value (for future reporting) |

---

## 14. Recommended schema additions

| Change | Required? | Notes |
|--------|-----------|-------|
| Extend `communication_scheduled_sends.source` CHECK | **Yes** | Add `'tour_scheduling'` |
| Partial unique index on scheduled sends metadata | **Yes** | Dedup reminders |
| `org_settings.metadata.tour_comms` | **Yes** (JSON) | No column migration if using metadata |
| `locations.metadata.tour_comms` override | Optional | Recommended for multi-site |
| `tour_bookings.metadata.ics_sequence` | Optional | Prefer booking metadata over new column |
| New `communication_templates` table | **No** (Band A) | Revisit if versioning needed |
| Extend `entity_type` on scheduled sends | **No** | Keep `opportunities` FK |

**Service role:** Orchestrator runs in server context with service role (same as `tourBookingService` callers).

**Post-migration:** `npm run export:supabase-schema` per doctrine.

---

## 15. Recommended shared primitives / services

| Module | Responsibility |
|--------|----------------|
| `web/lib/tours/comms/types.ts` | Config + template + context types (A1) |
| `web/lib/tours/comms/resolveTourCommsConfig.ts` | Org/location merge (A2) |
| `web/lib/tours/comms/buildTourCommsTemplateContext.ts` | Variable bag from DB rows |
| `web/lib/tours/comms/renderTourCommsTemplate.ts` | Placeholder merge |
| `web/lib/tours/comms/buildTourBookingIcs.ts` | ICS string + UID/SEQUENCE (A9) |
| `web/lib/tours/comms/quietHours.ts` | Deferral logic (A2/A4) |
| `web/lib/tours/comms/tourSchedulingScheduledSends.ts` | create/cancel scheduled rows (A4) |
| `web/lib/tours/comms/tourCommsOrchestrator.ts` | `onBookingConfirmed`, `onRescheduled`, etc. (A5–A8) |
| `web/lib/tours/comms/resolveTourCommsRecipients.ts` | Family + optional host staff |

**Hook integration:** Single call at end of each `tourBookingService` mutation:

```typescript
void runTourCommsAfterBookingMutation(supabase, { booking, kind, previous }).catch(log);
```

---

## 16. Recommended implementation order

| Step | Cards | Dependency |
|------|-------|------------|
| 1 | A1 | Types + variable contract |
| 2 | A2 + migration | Config + `source` CHECK + dedup index |
| 3 | A3 | Template resolution + seeds |
| 4 | A9, A10 (libs + routes) | ICS + download (no booking hook yet) |
| 5 | A4, A6 | Scheduled send helpers + verify cron path |
| 6 | A5, A7, A8 | Orchestrator + `tourBookingService` hooks |
| 7 | A11 | Telemetry + tests |

---

## 17. Parallelization opportunities

| Parallel track | Cards | Notes |
|----------------|-------|-------|
| **Track 1** | A1 → A2 → A3 | Config/templates |
| **Track 2** | A9 → A10 | ICS + routes (after A1 types) |
| **Track 3** | A4 → A6 | Scheduled sends (needs migration from A2) |
| Merge | A5–A8 | Requires A3 + A4 + A9 |
| Final | A11 | Cross-cutting |

---

## 18. Risk areas

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R1 | `source` CHECK migration missed in env | High | Migration + export schema |
| R2 | Double confirmation email on retry | Med | Idempotency metadata check |
| R3 | SMS compliance | High | Human-approved copy; eligibility asserts |
| R4 | No email attachments | Med | Link-based ICS (locked) |
| R5 | Legacy metadata tour time wrong in templates | Med | Always load booking row |
| R6 | Quiet hours edge cases | Med | Explicit defer policy + tests |
| R7 | `executeCommunicationsSend` hardcodes opportunity entity | Low | Correct for Band A anchor |
| R8 | Host recipient undefined | Med | Config: host = `rule.user_id` email or location inbox — gate in A5 |
| R9 | Cron not running in dev | Low | Document manual process-due POST |

---

## 19. Human-gated decisions

| ID | Decision | Default recommendation |
|----|----------|------------------------|
| H1 | SMS transactional classification | Transactional templates only in seed |
| H2 | ICS delivery: link vs attachment | **Link** in Band A |
| H3 | Send confirmation on `pending_approval` | **No** (internal optional) |
| H4 | Host notification on confirm | **Yes** to `tour_availability_rules.user_id` email if set |
| H5 | Quiet hours default window | 21:00–08:00 booking TZ |
| H6 | Reminder offsets default | 24h + 2h |
| H7 | No-show follow-up timing | +24h after mark no-show (scheduled) |
| H8 | Extend `communication_scheduled_sends.source` | **Yes** — required |

---

## 20. Cursor batching recommendation

**Safe for autonomous implementation:** A1, A2 (metadata config), A3 (merge renderer), A9, A10, A4, A6, A11, unit tests, docs updates.

**Requires human gate before merge:** H1 (SMS copy review), H2 (confirm link-based ICS), H4 (host recipient policy), migration applied to production policy.

**Do not autonomous:** Changing `TOUR_LIFECYCLE_EVENT_TYPES`, workflow renames, cancel mirror semantics, new OAuth calendar work.

---

## 21. Final readiness verdict

| Question | Answer |
|----------|--------|
| **Infrastructure compatible?** | **Yes**, with migration extending `communication_scheduled_sends.source` and new `web/lib/tours/comms/*` modules |
| **Parallel reminder engine avoided?** | **Yes** — reuse scheduled sends + canonical enqueue |
| **Workflow-primary reminders avoided?** | **Yes** |
| **ICS without OAuth?** | **Yes** — on-demand generation + HTTPS links |
| **Quiet hours?** | **Net-new** but isolated module — no blocker |
| **Safe for Cursor autonomous batching?** | **Yes**, in batches below with H1/H2/H4 sign-off before production enable |

---

# Recommended autonomous implementation batches

## Batch 1 — Contracts, config, migration

**Cards:** A1, A2 (partial)

**Shared primitives:**

- `web/lib/tours/comms/types.ts`
- `resolveTourCommsConfig.ts`
- Migration: `communication_scheduled_sends.source` includes `'tour_scheduling'`
- Migration: dedup partial unique index on tour reminder metadata

**Risks:** R1 — migration not applied

**Human gates:** H8 (approve source enum extension)

**Exit criteria:** Types compile; config resolves from `org_settings.metadata`; migration applies cleanly.

---

## Batch 2 — Template registry + rendering

**Cards:** A3 (A1 dependency)

**Shared primitives:**

- `buildTourCommsTemplateContext.ts`
- `renderTourCommsTemplate.ts`
- Childcare default templates in seed/metadata fixture
- Vitest: placeholder merge + missing var fail-closed

**Risks:** R5 — wrong time in context if booking not passed

**Human gates:** H1 — approve default SMS/email copy before enabling in prod orgs

**Exit criteria:** Given booking row + org config, produces subject/body for confirmation template.

---

## Batch 3 — ICS + add-to-calendar routes

**Cards:** A9, A10

**Shared primitives:**

- `buildTourBookingIcs.ts`
- `GET` admin + public ICS routes (auth/token scoped)
- Tests: UID stable, SEQUENCE increment, CANCEL status

**Risks:** R4 — attachment not supported (mitigated by link strategy)

**Human gates:** H2 — confirm link-based ICS is acceptable for parents/staff

**Exit criteria:** ICS URL downloads valid `.ics` for a test booking; confirm email template includes link slot.

---

## Batch 4 — Reminder scheduling machinery

**Cards:** A4, A6

**Shared primitives:**

- `tourSchedulingScheduledSends.ts` (create/cancel/list by booking)
- `quietHours.ts`
- Wire metadata augment in `processDueCommunicationScheduledSends` path if needed
- Tests: cancel on reschedule; dedup index prevents duplicate pending rows

**Risks:** R6 — quiet hour deferral bugs

**Human gates:** H5, H6 — default windows/offsets

**Exit criteria:** Inserting confirm schedules rows; `process-due` enqueues one reminder (mocked send).

---

## Batch 5 — Orchestrator + booking hooks

**Cards:** A5, A7, A8

**Shared primitives:**

- `tourCommsOrchestrator.ts`
- `resolveTourCommsRecipients.ts`
- Hooks in `tourBookingService.ts` (try/catch, non-blocking)
- Immediate: `enqueueCanonicalOutboundMessage`

**Risks:** R2 double send; R8 host recipient

**Human gates:** H3, H4, H7

**Exit criteria:** Confirm booking → confirmation email enqueued; reschedule → cancel reminders + reschedule email; cancel → pending reminders canceled.

---

## Batch 6 — Audit, telemetry, docs

**Cards:** A11 (+ doc updates to `communications.md`, foundation cross-link)

**Shared primitives:**

- Consistent `metadata.source` values
- `[tour_comms]` logging helpers
- Integration tests under `web/tests/tours/tourComms*.test.ts`

**Risks:** R9 cron in dev

**Human gates:** None for code; ops confirms cron

**Exit criteria:** Band A acceptance gates from foundation doc §22 met in staging.

---

## Band A closeout (Batches 1–6 shipped)

**Status:** **Complete** — see **[`tour_scheduling_phase2_band_a_closeout.md`](./tour_scheduling_phase2_band_a_closeout.md)** for final QA outcomes, operational learnings, and Band B+ deferrals. Summary below retained for implementers.

### Shipped capabilities

| Area | Implementation |
|------|----------------|
| Config | `org_settings.metadata.tour_comms` + location overrides via `resolveTourCommsConfig` |
| Templates | Default email/SMS bodies + `renderTourCommsTemplate` |
| Calendar links | Google/Outlook deeplinks + ICS builder (link-based; routes optional) |
| Reminders | `communication_scheduled_sends` with `source = tour_scheduling`, quiet-hours deferral |
| Lifecycle | `tourCommsOrchestrator` wired into `tourBookingService` (best-effort) |
| Process-due | Tour metadata passthrough; snapshots used as-is (no re-render) |
| Idempotency | Immediate sends dedupe via `metadata.idempotency_key` |

### Default-off behavior

`DEFAULT_TOUR_COMMS_CONFIG.enabled = false`. No confirmation, reminder, or lifecycle notifications until an org explicitly sets `tour_comms.enabled: true` in metadata. SMS defaults off (`channels.sms: false`).

### Required org config to enable

```json
{
  "tour_comms": {
    "enabled": true,
    "channels": { "email": true, "sms": false },
    "reminder_offsets": [
      { "reminder_key": "tour_reminder_24h", "offset_minutes": 1440, "channels": ["email"] },
      { "reminder_key": "tour_reminder_2h", "offset_minutes": 120, "channels": ["email"] }
    ]
  }
}
```

Optional location overrides: `locations.metadata.tour_comms`.

### Reminder runtime

- **Storage:** `communication_scheduled_sends` (`source = tour_scheduling`, `entity_id = opportunity_id`)
- **Schedule time:** Computed at confirm/reschedule; rendered subject/body stored in row snapshots
- **Due processing:** Existing `processDueCommunicationScheduledSends` cron / admin process-due route
- **Enqueue:** `executeCommunicationsSend` with tour metadata augment (not `task_assist_scheduled_send`)

### Process-due behavior (Batch 6)

| Row `source` | Outbound metadata augment |
|--------------|---------------------------|
| `task_assist` | `task_assist_scheduled_send: true`, `communication_scheduled_send_id` |
| `tour_scheduling` | `source: tour_scheduling`, booking/reminder fields from row metadata, `opportunity_id`, `channel` |
| other | `scheduled_send_source`, `communication_scheduled_send_id` only |

Body/subject come from `body_snapshot` / `subject_snapshot` — **no template re-render at process-due**.

### Telemetry metadata (communication records)

**Immediate sends** (`communication_messages.metadata`):

- `source: tour_scheduling`
- `tour_booking_id`, `opportunity_id`, `event_key`, `channel`
- `idempotency_key`, `send_generation`, `lifecycle_action`, `recipient_person_id`

**Scheduled reminders** (row metadata + process-due augment):

- `tour_booking_id`, `reminder_key`, `schedule_generation`, `event_key`, `tour_start_at`, `location_id`
- `quiet_hours_adjusted` when applicable
- `communication_scheduled_send_id` on enqueued message

### Explicit non-shipped (Band A)

- External calendar OAuth / two-way calendar sync
- Public booking flow redesign
- Host/staff/internal notifications (`host_recipient` config not wired)
- ICS download API routes (`/api/admin/tours/bookings/:id/ics`, public token ICS)
- Settings UI for template/config editing
- SMS enabled by default (requires explicit config + compliance review)
- Band B+ (rate limits, CAPTCHA, branded public site, etc.)

### Staging QA checklist

1. Apply migration `20260527150000_tour_scheduling_comm_scheduled_sends_source.sql`.
2. Enable `org_settings.metadata.tour_comms.enabled = true` for a test org.
3. Keep SMS disabled initially (`channels.sms: false`).
4. Confirm a tour booking (admin confirm or create-without-approval).
5. Verify confirmation email row in `communication_messages` (`metadata.source = tour_scheduling`, `event_key = tour_confirmation`).
6. Verify reminder rows in `communication_scheduled_sends` (`source = tour_scheduling`, pending status).
7. Reschedule the booking.
8. Verify reschedule notification enqueued and pending reminders replaced (old rows canceled, new generation).
9. Cancel the booking (or use a fresh booking).
10. Verify cancel notification and pending reminder cancellation.
11. Advance clock or set `scheduled_for` in past; run process-due (cron or admin route).
12. Verify due reminder enqueues with tour metadata (`source = tour_scheduling`, not Task Assist).
13. Retry confirm/process-due — no duplicate immediate sends.
14. Set `tour_comms.enabled = false` — confirm/reschedule produces no new sends or reminders.

### Code map (Band A)

| Path | Role |
|------|------|
| `web/lib/tours/comms/tourCommsConfig.ts` | Types + defaults |
| `web/lib/tours/comms/resolveTourCommsConfig.ts` | Config resolution |
| `web/lib/tours/comms/tourCommsTemplates.ts` | Template rendering |
| `web/lib/tours/comms/tourAddToCalendarLinks.ts` | Google/Outlook links |
| `web/lib/tours/comms/tourSchedulingScheduledSends.ts` | Reminder CRUD |
| `web/lib/tours/comms/tourCommsOrchestrator.ts` | Lifecycle orchestration |
| `web/lib/communications/communicationScheduledSendProcessMetadata.ts` | Process-due metadata |
| `web/lib/tours/bookings/tourBookingService.ts` | Lifecycle hooks |

---

## Summary for implementers

**Recommended orchestration architecture:** **Communication-native** — immediate sends via `enqueueCanonicalOutboundMessage`; reminders via extended `communication_scheduled_sends` + existing `process-due` cron; **not** workflow-delay-primary.

**Highest-risk implementation area:** **Schema migration + orchestrator idempotency** (R1, R2) and **SMS compliance** (R3/H1).

**Recommended first implementation batch:** **Batch 1** (A1 + A2 migration + config types).

**Prompt to start coding:**

> Implement Tour Scheduling Phase 2 Band A **Batch 1** per `docs/sprints/archive/05_2026/completed/tour_scheduling_phase2_band_a_readiness.md` (A1, A2 migration). Do not hook `tourBookingService` until Batch 5.

---

## References

| Doc / path | Role |
|------------|------|
| [`tour_scheduling_phase2_foundation.md`](./tour_scheduling_phase2_foundation.md) | Band A scope + doctrine |
| [`tour_scheduling_phase2_band_a_closeout.md`](./tour_scheduling_phase2_band_a_closeout.md) | Band A closeout + QA learnings |
| [`docs/product/communications.md`](../../archive/2026-06-product/communications.md) | Canonical comms |
| `web/lib/communications/communicationScheduledSendsService.ts` | Scheduled send processor |
| `web/lib/communications/communicationScheduledSendProcessMetadata.ts` | Process-due metadata augment |
| `web/lib/tours/bookings/tourBookingService.ts` | Mutation hooks |
| `docs/supabase/reference/supabase_constraints.csv` | `source` / `entity_type` CHECKs |
