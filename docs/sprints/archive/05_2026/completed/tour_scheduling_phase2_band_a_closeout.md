# Tour Scheduling Phase 2 — Band A Closeout

**Path:** `docs/sprints/archive/05_2026/completed/tour_scheduling_phase2_band_a_closeout.md`  
**Status:** **CLOSED** (May 2026) — Band A shipped + staging QA complete. Band B+ deferred.  
**Canonical supplements:** [`tour_scheduling_phase2_foundation.md`](./tour_scheduling_phase2_foundation.md), [`tour_scheduling_phase2_band_a_readiness.md`](./tour_scheduling_phase2_band_a_readiness.md), [`tour_scheduling_phase_2.md`](../tour_scheduling_phase_2.md), [`docs/execution/roadmap-and-gaps.md`](../../execution/roadmap-and-gaps.md).

---

## Band A complete

Tour Scheduling Phase 2 **Band A** (Communications + Reminder Foundation) is **complete** for staging/production enablement per org config. Band B+ (calendar sync, public hardening, settings UI, analytics) remains **future roadmap**.

### Shipped capabilities

| Area | Capability |
|------|------------|
| **Booking lifecycle orchestration** | `tourCommsOrchestrator` wired into `tourBookingService` on confirm, reschedule, cancel, complete, no-show (best-effort, after booking SoT commit) |
| **Confirmation / reschedule / cancel / no-show comms** | Communication-native immediate sends via `enqueueCanonicalOutboundMessage` + template registry |
| **Reminder scheduling** | `communication_scheduled_sends` with `source = tour_scheduling`; offset-based reminders; generation replace on reschedule |
| **Quiet-hours handling** | Reminder `scheduled_for` deferred per org/location comms config |
| **Add-to-calendar deeplinks** | Google / Outlook links in confirmation email bodies (link-based; no persisted ICS artifact in Band A) |
| **Queue / status parity** | Tours lane count and row fetch aligned; alias-aware routing (`tour_scheduled` ↔ `tours`); dynamic row fetch limit vs pill count |
| **Operational attention coherence** | Attention/BOS recompute after booking mutations; drawer optimistic patches after lifecycle changes |
| **Activity timeline parity** | Outbound channel labels reflect actual send channel (email vs SMS) |
| **Booking-backed tour lifecycle controls** | Drawer/header lifecycle bar driven by `tour_bookings`; metadata mirror compatibility-only |
| **Stable work-unit queue persistence** | Lane-scoped filter sanitization; pill switch clears stale `rf_status`; URL sync for queue selection |
| **Tour reminder telemetry** | `communication_messages` + scheduled-send row metadata (`reminder_key`, `schedule_generation`, `quiet_hours_adjusted`, etc.) |
| **Dynamic queue row fetch parity** | Work-unit row fetch limit matches summary count (cap 100); search refetch widens window |
| **Local-time manual scheduling** | Operator wall-time entry resolves in site-local IANA timezone |
| **Calm empty-state / BOS behavior** | Post-schedule empty states and assist surfaces avoid alarming copy when child exists but enrollment status unset |
| **Alias-aware queue routing** | `workUnitQueueSelection` + fetch paths treat `tour_scheduled` and `tours` as equivalent pill keys |

**Default-off:** `org_settings.metadata.tour_comms.enabled = false` until org opts in. See readiness doc § Required org config.

---

## Staging QA outcomes (May 2026)

| Gate | Result |
|------|--------|
| Confirm → confirmation email + reminder rows | **Pass** (with `tour_comms.enabled`) |
| Reschedule → notification + reminder generation replace | **Pass** |
| Cancel → cancel notification + pending reminder cancel | **Pass** |
| Process-due → reminder sends with tour metadata (not Task Assist) | **Pass** |
| Idempotent confirm / process-due (no duplicate immediate sends) | **Pass** |
| Disabled config → no new sends/reminders | **Pass** |
| Tours pill count vs visible rows after schedule | **Pass** (after alias + filter + fetch-limit fixes) |
| Work-unit queue scroll vs BOS command bar | **Pass** (scroll shell accounts for `--ws-shell-bottom-safe`) |
| Drawer child summary when OCM status unset | **Pass** (calm “child listed” copy) |

---

## QA discoveries / operational polish learnings

### Work-unit behavior

- **Queue pills and fetches must treat aliases canonically** — legacy dept links and pills may use `tour_scheduled` while v2 `queue_definition` uses `tours`; selection, summary lookup, and row fetch must resolve to the same canonical lane key.
- **Queue filters cannot persist invalid lane-scoped filters** — e.g. `rf_status=new_inquiry` while viewing Tours hides `tour_scheduled` rows while counts still update; sanitize on lane load and clear lane-scoped filters on pill switch.
- **Queue count parity and visible row parity must always be audited together** — count APIs and row GET can be aligned server-side while client buffer, cache, or filters drop rows.
- **Search against partially loaded datasets causes operator trust breakdown** — hardcoded `limit=20` with count=26+ makes search and scroll lie; fetch limit must track pill count (cap 100) and search should widen fetch window.
- **Queue scroll shells must account for fixed AI/BOS command surfaces** — inner list scroll viewport must subtract `--ws-shell-bottom-safe` (~120px) so rows are not hidden behind the command bar.

### Drawer behavior

- **Optimistic drawer mutation patches are required after lifecycle changes** — without local patch, tour time/status lags until full refetch.
- **Operational attention / BOS must recompute immediately after booking mutations** — stale assist/read slots erode trust post-schedule.
- **Metadata-only “legacy schedule_tour” records create UX ambiguity** — booking-backed path is canonical; metadata mirrors are compatibility projections only.

### Tour lifecycle

- **Manual wall-time entry must always resolve in site-local timezone** — UTC or browser-default mislabels operator-entered tour times.
- **Booking-backed tours are now the canonical path** — `tour_bookings` SoT drives drawer preview, queue enrichment, and comms triggers.
- **Legacy metadata-only scheduling remains compatibility-only** — do not schedule reminders or treat metadata as authoritative for new work.

### Communications

- **Activity timelines must use actual outbound channel** — email vs SMS labels must match `communication_messages.channel`, not template intent alone.
- **Reminder rows should preserve rendered snapshots** — `body_snapshot` / `subject_snapshot` at schedule time; process-due must not re-render templates (source-aware augment only).
- **Process-due augmentation must remain source-aware** — `tour_scheduling` rows get tour booking metadata; Task Assist rows keep Task Assist flags.

---

## Future phase / Phase B+ (deferred)

Items discovered during Band A implementation and staging QA — **not in Band A scope**.

### Calendar / scheduling

- OAuth calendar sync (Google / Microsoft)
- Host calendar conflict resolution
- True calendar blocking in slot generation
- ICS download API routes (`/api/admin/tours/bookings/:id/ics`, public token ICS)
- Staff / host notifications
- Public reschedule/cancel flows
- Tour self-service management (parent portal)

### Public booking

- CAPTCHA / distributed rate limits
- Branded booking experiences
- Public reschedule/cancel links
- Token rotation / single-use link policies

### Operational UX

- Stronger empty-state recommendations after scheduling
- Richer tour lifecycle guidance in drawer/BOS
- Tour preparation workflows / tasks
- Post-tour conversion workflows
- Tour attendance operational dashboards

### Queue / runtime

- Virtualization / perf optimization for large queue sets
- Lane-level pagination + server-side search architecture
- Background lane prefetching / debounced post-schedule refresh
- Queue parity diagnostics tooling (`ALLOY_QUEUE_LANE_PARITY_DEBUG`)

### Config / UI

- Settings UI for templates / reminders / channels
- Admin-level template editing
- SMS compliance management (TCPA, opt-out semantics)
- Org-level comms preview / testing surfaces

**Roadmap pointer:** [`tour_scheduling_phase_2.md`](../tour_scheduling_phase_2.md) (Phase 2B–2D tracks).

---

## Canonical doctrine (Band A lock)

| Decision | Rule |
|----------|------|
| **Scheduling SoT** | **`tour_bookings`** is the canonical lifecycle source for tour time, status, and comms triggers |
| **Metadata mirrors** | **`opportunities.metadata.tour_date` / `tour_time`** are compatibility projections only — not authoritative for new scheduling |
| **Communications** | **Communication-native** — immediate sends + `communication_scheduled_sends`; **not workflow-primary** for reminders |
| **Reminders** | **`communication_scheduled_sends`** + existing process-due cron — **not** delayed workflow execution |
| **Queue truth boundary** | Queue rows remain **preview/selection**; authoritative detail via entity GET / drawer / `tour_bookings` |
| **Operational attention** | Derives from **canonical opportunity state** + resolver rules — **not** from queue row snapshots alone |
| **Workflow events** | Locked V1 `tour_*` event types on `entity_type = tour_bookings`; no `tour_scheduled` as `event_type` |
| **Default enablement** | Tour comms **default off** until `metadata.tour_comms.enabled = true` |

---

## Implementation references

| Doc / path | Role |
|------------|------|
| [`tour_scheduling_phase2_foundation.md`](./tour_scheduling_phase2_foundation.md) | Phase 2 audit, bands, cards |
| [`tour_scheduling_phase2_band_a_readiness.md`](./tour_scheduling_phase2_band_a_readiness.md) | Batch plan, code map, staging SQL |
| [`tour_scheduling_v1.md`](../tour_scheduling_v1.md) | V1 shipped baseline |
| [`tour_scheduling_phase_2.md`](../tour_scheduling_phase_2.md) | Phase 2 roadmap sketch + Band B+ tracks |
| `web/lib/tours/comms/*` | Band A comms implementation |
| `web/lib/tours/bookings/tourBookingService.ts` | Lifecycle hooks |
| `docs/product/communications.md` | Canonical comms doctrine |

---

## Remaining known risks

| Risk | Mitigation / follow-on |
|------|----------------------|
| **Org comms disabled by default** | Ops must enable `tour_comms` in staging/prod; document in runbooks |
| **SMS compliance** | Band A defaults SMS off; Band B+ for TCPA/consent |
| **Metadata vs booking drift** | Legacy rows may show metadata-only tours; admin warning job deferred |
| **Client-only search/filters** | Works for ≤100 rows per lane; server-side search deferred (see child-lifecycle closeout) |
| **In-process public rate limits** | Not distributed; Band B hardening |
| **No external calendar truth** | Slot generation ignores staff busy times until Band C |

---

## Suggested commit message

```
Close Tour Scheduling Phase 2 Band A; archive sprint docs and record QA learnings.

Move foundation/readiness docs to completed/, add Band A closeout, update roadmap to reflect shipped comms/reminders and deferred Band B+.
```
