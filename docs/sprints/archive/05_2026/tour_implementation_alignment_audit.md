# Tour Implementation Alignment Audit

**Path:** `docs/sprints/archive/05_2026/tour_implementation_alignment_audit.md`  
**Date:** May 2026  
**Related:** [`canonical_action_catalog_v1.md`](./canonical_action_catalog_v1.md), [`action_definition_legacy_mapping_v1.md`](./action_definition_legacy_mapping_v1.md), [`completed/tour_scheduling_phase2_foundation.md`](./completed/tour_scheduling_phase2_foundation.md)

---

## Executive summary

Tour **scheduling truth** lives in `tour_bookings` + `tourBookingService.ts`. The **tour bar** (`OpportunityTourBookingLifecycleBar`) calls booking REST APIs directly. **Registry actions** were partially wired (`schedule_tour`, org `reschedule_tour`, `send_enrollment_packet`) while `confirm_tour` and `record_tour_outcome` existed only as catalog stubs.

**Phase 2 alignment (this pass):** activate canonical defs, route `confirm_tour` / `record_tour_outcome` through existing booking APIs, share client helpers with the tour bar, and add placements — **no new scheduling subsystem**.

---

## Map: implementation areas → canonical actions

| Area | Primary files | Canonical action(s) | Registry today | Gap (pre-alignment) |
|------|---------------|---------------------|----------------|---------------------|
| **Tour scheduling (slot)** | `OpportunityTourScheduleActionModal.tsx`, `OpportunityTourSlotSchedulePanel.tsx`, `POST /api/admin/tours/bookings` | `schedule_tour`, `reschedule_tour` | Partial — drawer opens modal via `form_key=schedule_tour`; global def was `update_status` | `reschedule_tour` not opening modal; dual legacy metadata path |
| **Tour bar** | `OpportunityTourBookingLifecycleBar.tsx` | `confirm_tour`, `reschedule_tour`, `record_tour_outcome` | None — hardcoded buttons + REST | No canonical keys in events |
| **Tour workflows** | `tourLifecycleEvents.ts`, `tourCommsOrchestrator.ts`, `20260430217000_enrollment_schedule_tour_workflow.sql` | `schedule_tour` (legacy workflow) | Org `start_workflow` on old form path | Parallel `opportunity_schedule_tour_followup` vs `tour_confirmed` events |
| **Tour reminders** | `tourReminderTiming.ts`, `tourSchedulingScheduledSends.ts`, comms orchestrator | *(none — side effect of confirm/schedule)* | N/A | Reminders tied to booking lifecycle, not action keys |
| **Tour outcomes** | `markTourBookingCompleted/NoShow`, booking `/complete`, `/no-show` | `record_tour_outcome` | Stub only | Split complete/no-show buttons, no registry |
| **Tour queues** | `enrollmentPipelineQueueDefinitionV2.ts`, `opportunityQueueTourPreview.ts` | N/A (status keys) | N/A | `tour_scheduled` etc. — not action-driven |
| **Tour BOS** | `operationalRecommendationCatalog.ts`, `communicationObjectives.ts` | Comms objectives → `schedule_tour`, follow-up → `record_tour_outcome` / email | BOS uses template keys, not `action_definitions` | `tour_date_passed` recommends comms, not booking actions |
| **Enrollment packet** | `OpportunityEnrollmentPacketModal.tsx`, `send_enrollment_packet` ui_intent | `send_enrollment_packet` | **Existing** ui_intent | Settings-addable; placement added in alignment migration |

---

## Canonical action detail

### `schedule_tour`

| | |
|---|---|
| **Existing** | `OpportunityTourScheduleActionModal` → slot panel → `createTourBooking`; legacy branch → `executeAdminAction` metadata + optional manual booking POST |
| **Registry** | Global + org defs; org `open_form` since `20260430218000`; conditions `metadata_field_missing: tour_date` |
| **Hardcoded** | Drawer relabels to "Reschedule tour" when active booking exists (still key `schedule_tour`) |
| **Duplicate** | Legacy metadata-only schedule vs booking-backed path |
| **Aligned** | Global def → `open_form` / `form_key: schedule_tour`; placement on qualification/new_lead/waitlist |

### `reschedule_tour`

| | |
|---|---|
| **Existing** | Tour bar inline panel; schedule modal duplicate-guard → reschedule mode |
| **Registry** | Org-scoped def + placement (`metadata_field_exists: tour_date`) |
| **Hardcoded** | Tour bar "Reschedule" button (not registry) |
| **Aligned** | Global def → same modal; drawer opens for `reschedule_tour` key; events use `reschedule_tour` |

### `confirm_tour`

| | |
|---|---|
| **Existing** | Tour bar → `POST .../bookings/[id]/confirm` → `confirmTourBooking` + comms |
| **Registry** | Was stub |
| **Aligned** | `ui_intent` + `executeAdminAction` → same service; overflow placement on tour statuses |

### `record_tour_outcome`

| | |
|---|---|
| **Existing** | Tour bar Complete / No-show → `/complete`, `/no-show` |
| **Registry** | Was stub |
| **Aligned** | `open_form` + `RecordTourOutcomeModal` → execute → `markTourBookingCompleted/NoShow`; tour bar emits `record_tour_outcome` |

### `send_enrollment_packet`

| | |
|---|---|
| **Existing** | Drawer `ui_intent` → `OpportunityEnrollmentPacketModal` |
| **Registry** | Active since `20260529180000` |
| **Aligned** | Catalog metadata + default placement on tour/enrollment stages (no behavior change) |

---

## Duplicate / parallel implementations (retained)

| Path | Notes |
|------|-------|
| `quick_message` vs `send_email`/`send_sms` | Tour BOS comms still map to message objectives |
| Org vs global `schedule_tour` | Org overrides preserved |
| Metadata-only tour rows | `metadata_only` UI state; repair via Schedule tour |
| `opportunity_schedule_tour_followup` workflow | Legacy; not subscribed to `tour_confirmed` |
| Tour bar vs registry overflow | Both call same REST/execute paths after alignment |

---

## Legacy actions left untouched

- `contact_attempted` (and its form action)
- `update_status_add_note`
- `quick_message`, `ask_bos`
- Org-scoped workflow-backed `schedule_tour` overrides
- `send_paperwork_placeholder` (deactivated)

---

## Alignment deliverables (`20260602190000`)

- `executeTourBookingActions.ts` — server execute for confirm + outcome
- `tourBookingActionClient.ts` — shared REST wrappers + events
- `RecordTourOutcomeModal.tsx` — registry form for outcome
- Tour bar emits canonical `action_key`s
- Drawer + `applyRegistryResolvedActionClient` wiring
- Migration: activate defs + placements

---

## Still stubbed / deferred

- BOS recommendation cards invoking canonical action keys directly
- Workflow triggers referencing `confirm_tour` / `record_tour_outcome` event keys
- Queue row inline tour actions (header + tour bar sufficient for v1)
- Deprecation of metadata-only legacy schedule execute path
- `cancel_tour` canonical action (tour bar Cancel remains non-catalog)
