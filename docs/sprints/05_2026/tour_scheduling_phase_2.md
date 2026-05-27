# Tour Scheduling Phase 2 Roadmap

This document extends **Tour Scheduling V1** (`tour_scheduling_v1.md`) after **manual QA sign-off (May 2026)**. It is planning-only — no implementation commitment until issues are triaged and sequenced.

---

## Current V1 foundation

The following is **in production code** and documented in **`docs/sprints/05_2026/tour_scheduling_v1.md`** (§9–§13):

- **`tour_bookings`** as **scheduling source of truth** (`start_at`, `end_at`, `timezone`, booking `status_key`, location, org scope).
- **`tour_availability_rules`** as **data-driven** availability (recurring windows, buffers, capacity, optional approval).
- **`opportunities`** as **CRM lifecycle** source of truth; transitions validated with **`status_transition_rules`** where applicable.
- **`metadata.tour_date` / `tour_time`** as a **compatibility mirror** after confirm (queues, filters, legacy UX).
- **Queue rows** remain **preview / selection only**; enrichment may read **`tour_bookings`** for better labels — not for mutations.
- **Operator UX:** header **Schedule tour / Reschedule tour** modal + inquiry **Tour date** + lifecycle actions (**Reschedule**, **Cancel**, **Complete**, **No-show**, **Confirm** when pending); standalone **`tour_scheduling`** drawer section **suppressed**.
- **Workflow events** on **`tour_bookings`** use the **locked** V1 names (`tour_requested`, `tour_booking_pending`, `tour_confirmed`, …) — not `tour_scheduled` as an `event_type`.
- **Public booking (V1-basic):** `tour_public_booking_links` + token routes, in-process rate limits, bounded slot query window — not a full branded family-facing product.

---

## Phase 2 goals

Evolve from **internal + link-based tour booking** to **operational scheduling intelligence**: fewer manual steps, stronger comms, calendar reality, safer public surfaces, measurable funnel metrics, and platform hardening for scale.

---

## Candidate Phase 2 workstreams

### 1. External calendar integration

- Google Calendar / Microsoft Outlook **read** availability for staff/resources.
- **Staff calendar availability** as an input to slot generation (not only `tour_availability_rules`).
- **ICS generation** and/or calendar invites on confirm/reschedule.
- **Conflict detection** against external busy times when proposing slots.
- **Two-way sync** for cancel/reschedule (product must define conflict resolution and source-of-truth precedence vs `tour_bookings`).

### 2. Communications + reminders

- **Confirmation** email/SMS on book/confirm (template + channel selection).
- **Reminder** email/SMS (configurable offsets; timezone-aware).
- **Reschedule / cancel** notifications to family and internal distribution lists.
- **No-show follow-up** automation (drip vs single touch — product decision).
- **Per-org / per-location** template registry and quiet hours.

### 3. Public booking maturity

- Richer **public calendar picker** (accessibility, mobile-first, clearer timezone labeling).
- **Single-use / expiring** links; optional max attempts per link.
- **CAPTCHA** and/or proof-of-work; **distributed rate limits** (Redis or edge).
- **Parent confirmation** emails with add-to-calendar actions.
- **Branded** public booking page (logo, colors, copy blocks).
- **Approval workflow** polish (operator queue for pending approvals, SLA hints).

### 4. Admin usability

- Richer **availability rule editor** (copy rules, templates, validation previews).
- **Recurring exception** dates and **blackout** dates (holidays, in-service days).
- **Holiday closure** library (federal + org-specific).
- **Capacity** by room, site, or staff assignment (beyond flat `max_bookings_per_slot` where needed).
- **Duplicate / overlapping rule** detection warnings.
- **Admin preview calendar** (“what does this rule set generate?”) with load metrics.

### 5. Workflow / lifecycle automation

- **Configurable status mapping** (booking lifecycle → `opportunities.status_key`) per org/vertical instead of fixed `TOUR_BOOKING_OPPORTUNITY_STATUS` constants.
- **Configurable cancel / no-show** behavior (e.g. whether to clear mirror, suggest lost reason, reopen inquiry).
- **Post-tour workflow triggers** (e.g. on `tour_completed` event).
- **Automatic follow-up tasks** (assignee, due date rules).
- **Enrollment packet** or application prompt after completed tour.

### 6. AI scheduling layer

- **Suggested best slots** (rules + historical conversion).
- **Lead priority**-aware ordering of slot recommendations.
- **No-show risk** signals (lightweight heuristics before full ML).
- **Adaptive reminder timing** (A/B or bandit — governance heavy).
- **Staff load balancing** suggestions.
- **Anomaly detection** (e.g. tours completed but no enrollment progression).

### 7. Reporting / analytics

- **Tour scheduled rate** (from opportunities + bookings join semantics).
- **Tour completion** and **no-show** rates.
- **Tour-to-enrollment conversion** and **time-to-tour** distributions.
- **Source / program / site** breakdowns for funnel reporting.
- Export paths (CSV, warehouse) aligned with **`Reporting V1`** program.

### 8. Platform hardening

- **Transactional** “create/update booking + opportunity mirror + status” where the product requires atomicity (today: strict ordering + 0-row update detection; DB-level transactions or compensating actions as needed).
- **Repair / backfill job** for metadata mirror drift vs `tour_bookings`.
- **Distributed rate limits** and abuse analytics for public routes.
- **Audit logs** for booking mutations (who/when/what).
- **Observability** on `workflow_events` volume, failures, and latency for tour event types.

---

## Proposed Phase 2 sequencing

Phases are **dependency-aware suggestions**; parallel work is possible within each band.

| Track | Scope | Rationale |
|-------|--------|-----------|
| **Phase 2A** | **Reminders + communications** (workstream 2) | Highest immediate operator/parent value; builds on existing Communications V1 infrastructure. |
| **Phase 2B** | **Public booking polish** (workstream 3) + **Platform hardening** subset (rate limits, audit, 2A telemetry) | Reduces reputational and abuse risk before scaling traffic. |
| **Phase 2C** | **Calendar integrations** (workstream 1) | Depends on clear SoT rules when external calendars disagree with Alloy. |
| **Phase 2D** | **AI + analytics** (workstreams 6–7) + deeper **workflow automation** (5) | Needs stable event stream, data hygiene, and reporting contracts from 2A–2C. |

**Admin usability (4)** can span **2A–2C** as incremental deliverables (does not block comms).

---

## Open questions

Decisions that should land **before** large engineering bets:

1. **Calendar SoT:** If Outlook shows free but Alloy has a booking, who wins? Is external calendar **advisory** only?
2. **Status mapping ownership:** Per-org JSON vs new `tour_integration_policy` table vs workflow-only side effects?
3. **Public booking identity:** When is re-auth required beyond the secret link? Parent portal integration?
4. **Mirror lifecycle:** Should cancel always clear `metadata.tour_*`, or only when no replacement booking exists?
5. **Multi-booking future:** V1 enforces one active non-terminal booking — does any vertical need parallel tours (e.g. siblings at two sites)?
6. **Reminder compliance:** TCPA / consent capture for SMS; unsubscribe semantics tied to `communication_threads`.
7. **Pricing / deposits** for tour holds (explicitly out of V1): never vs optional hold fee in Phase 2+.

---

## Band A QA — tour reminder inspection (SQL)

After scheduling a tour, reminder rows live in `communication_scheduled_sends` with `source = 'tour_scheduling'`. Use these read-only queries during QA (replace ids):

```sql
-- Pending tour reminders for a booking
SELECT id, org_id, channel, status, scheduled_for, metadata
FROM communication_scheduled_sends
WHERE source = 'tour_scheduling'
  AND entity_type = 'tour_bookings'
  AND entity_id = '<booking_uuid>'
ORDER BY scheduled_for ASC;

-- Reminder keys + offsets stored on each row
SELECT
  id,
  status,
  scheduled_for,
  metadata->>'reminder_key' AS reminder_key,
  metadata->>'tour_start_at' AS tour_start_at,
  metadata->>'event_key' AS event_key
FROM communication_scheduled_sends
WHERE source = 'tour_scheduling'
  AND org_id = '<org_uuid>'
ORDER BY scheduled_for DESC
LIMIT 20;

-- Join booking + opportunity for lane QA after schedule
SELECT
  tb.id AS booking_id,
  tb.start_at,
  tb.timezone,
  tb.status_key AS booking_status,
  o.id AS opportunity_id,
  o.status_key AS opportunity_status
FROM tour_bookings tb
JOIN opportunities o ON o.id = tb.opportunity_id AND o.org_id = tb.org_id
WHERE tb.org_id = '<org_uuid>'
  AND tb.opportunity_id = '<opportunity_uuid>'
ORDER BY tb.created_at DESC;
```

Expected: after confirm/reschedule, prior pending rows for the booking are canceled/replaced and new rows appear with `metadata.reminder_key` values such as `tour_reminder_24h` / `tour_reminder_2h` (per org/location comms config).

### Work-unit load audit (Tour Scheduled)

- **Rows API:** `GET /api/admin/queues/{workUnitId}/{queueKey}` → `QueueService.getWorkUnitQueueItems` (status filter + enrichment).
- **Counts API:** `GET /api/admin/queues/{workUnitId}/summaries` → per-lane COUNT queries; v2 canonical key is `tours` while legacy dept links may still pass `?queue=tour_scheduled` (alias).
- **Known parity bug fixed (May 2026):** client compared `queueItems.queue.key` (`tours`) to selected pill key (`tour_scheduled`), dropping buffered rows after refresh and showing empty/mismatched counts. Fix resolves alias → canonical key before fetch and summary lookup.
- **Post-schedule refresh:** drawer dispatches `adminv2:opportunity-updated`, which busts queue row cache and refetches rows + summaries in parallel — intentional for lane movement; broader prefetch/debounce optimization is future work.

---

## References

- **V1 sprint + audit table:** `docs/sprints/05_2026/tour_scheduling_v1.md`
- **Entity boundaries:** `docs/system/entity-model.md`
- **Queue vs record:** `docs/system/record-system.md`, `docs/system/workspace-system.md`
- **Product backlog context:** `docs/execution/roadmap-and-gaps.md`
