# Enrollment Implementation Alignment Audit

**Path:** `docs/sprints/05_2026/enrollment_alignment_audit.md`  
**Date:** May 2026  
**Related:** [`canonical_action_catalog_v1.md`](./canonical_action_catalog_v1.md), [`action_definition_legacy_mapping_v1.md`](./action_definition_legacy_mapping_v1.md), [`childcare_lifecycle_matrix_v1.md`](./childcare_lifecycle_matrix_v1.md), [`tour_implementation_alignment_audit.md`](./tour_implementation_alignment_audit.md)

---

## Executive summary

Enrollment **operational truth** spans enrollment packet sessions (forms/packets), inquiry-child OCM placement fields (`OpportunityInquiryChildrenSection`), placement orchestration (candidates, queue ordering, manual overrides), and legacy CRM status transitions (`mark_won` → `enrolled`). Registry canonical enrollment actions existed as catalog stubs or partial `ui_intent` rows while operators used drawer sections, queue rows, and legacy header actions.

**Phase 3 alignment (this pass):** audit all enrollment surfaces, activate registry keys that safely route to **existing** flows (packet review modal, send-form composer, inquiry-children field focus, enrollment packet modal), add placements — **no new enrollment subsystem**, no UX redesign, no legacy removal, no billing/deposits.

**Deferred (Phase 3b):** `approve_enrollment`, `reserve_spot` — requirement gates and unified execute paths not ready.

---

## Map: implementation areas → canonical actions

| Area | Primary files | Canonical action(s) | Registry (pre-alignment) | Gap |
|------|---------------|---------------------|--------------------------|-----|
| **Packet send** | `OpportunityEnrollmentPacketModal.tsx`, `enrollment-packet-launch/route.ts` | `send_enrollment_packet` | Active `ui_intent` (Phase 2 metadata) | Not workflow-backed |
| **Packet review** | `OpportunityPacketReviewOverview.tsx`, `OpportunityPacketReviewModal.tsx`, `patchPacketReview` | `review_enrollment_packet` | Stub / catalog only | Ad hoc `packet_review` activity key; no registry button |
| **Missing info comms** | Send-form composer, BOS `missing_information` objective | `request_missing_information` | Stub | BOS maps to comms objective, not action key |
| **Enroll / convert** | `mark_won` (`update_status` → enrolled), `convert_to_enrolled_placeholder` | `approve_enrollment` | Stub | Legacy `mark_won` still primary; no requirement gates |
| **Spot reservation** | `placementOverrideMutations.ts`, waitlist queue, `QueueRowPlacement*` | `reserve_spot` | Stub | Placement orchestration exists; no unified action |
| **Classroom assign** | `OpportunityInquiryChildrenSection` OCM `program_room_cohort_key` | `assign_classroom` | Stub | Inline edits only |
| **Schedule assign** | OCM `desired_schedule_type` | `assign_schedule` | Stub | Inline edits only |
| **Start date** | OCM `desired_start_date` | `set_start_date` | Stub | Inline edits only |
| **Enrollment queues** | `enrollmentPipelineQueueDefinitionV2.ts` | N/A (status keys) | N/A | `enrollment_offers`, `enrollment_completed`, waitlist candidate grain |
| **Enrollment BOS** | `communicationObjectives.ts`, `operationalAttentionExplain.ts` | Comms objectives | BOS template keys | `enrollment_next_steps`, `missing_information` — not registry actions |
| **Work units** | Dept/workspace queue pages | N/A | N/A | Queue preview + placement panels; not action-driven |

---

## Canonical action detail

### `send_enrollment_packet`

| | |
|---|---|
| **Existing** | `OpportunityEnrollmentPacketModal` → `POST …/enrollment-packet-launch`; multi-child selection |
| **Registry** | Active `ui_intent` since `20260529180000`; catalog metadata in Phase 2/3 |
| **Hardcoded** | Drawer intent handler + `adminv2:open-enrollment-packet` event |
| **Duplicate** | Legacy `send_paperwork_placeholder` (deactivated) |
| **Aligned** | No behavior change; remains settings-addable with tour/enrollment stage placements |

### `review_enrollment_packet`

| | |
|---|---|
| **Existing** | `OpportunityPacketReviewOverview` + `OpportunityPacketReviewModal` → `fetchPacketReviewRollup` / `patchPacketReview` |
| **Registry** | Was stub |
| **Hardcoded** | Inline “Review” in inquiry summary activity column |
| **Duplicate** | Activity event used ad hoc `packet_review` key (not CRM enroll) |
| **Aligned** | `ui_intent` → `adminv2:open-enrollment-packet-review`; activity emits `review_enrollment_packet`; header placement on enrollment-stage statuses |

### `request_missing_information`

| | |
|---|---|
| **Existing** | Send-form composer (`adminv2:open-send-form`); BOS `missing_information` comms objective |
| **Registry** | Was stub |
| **Hardcoded** | BOS draft routing in `communicationObjectives.ts` |
| **Aligned** | `ui_intent` with `composer: send_form` — reuses send-form path; overflow header placement |

### `approve_enrollment`

| | |
|---|---|
| **Existing** | `mark_won` (`update_status` → `enrolled`); org `convert_to_enrolled_placeholder` |
| **Registry** | Stub — **intentionally not activated** |
| **Hardcoded** | Queue row `mark_won` (“Won” / “Enrolled”); `opportunityRecordActionMap` |
| **Duplicate** | `mark_won` vs `approve_enrollment` vs packet review “approve” (form decision ≠ CRM enrolled) |
| **Deferred** | Requirement engine gates (paperwork, classroom, schedule, start date, contact) before replacing `mark_won` |

### `reserve_spot`

| | |
|---|---|
| **Existing** | Placement candidates, manual order/pin in workspace queue, `createPlacementOverride` |
| **Registry** | Stub — **not activated** |
| **Hardcoded** | `QueueRowPlacementManualOrderControls`, placement candidate panel |
| **Deferred** | No safe single execute path; entity grain is `opportunity_customer_member` |

### `assign_classroom` / `assign_schedule` / `set_start_date`

| | |
|---|---|
| **Existing** | `OpportunityInquiryChildrenSection` inline OCM PATCH (`inquiryChildFieldEdit.ts`) |
| **Registry** | Were stubs |
| **Hardcoded** | Section-only edits; waitlist queue refresh on cohort/outcome change |
| **Aligned** | `ui_intent` + `focus_field` → scroll/focus inquiry children section; `record_section` placements on `inquiry_children` |

---

## Enrollment conversion paths

| Path | Mechanism | Canonical target | Status |
|------|-----------|------------------|--------|
| Header / queue “Won” | `mark_won` → status `enrolled` | `approve_enrollment` | Legacy retained |
| Org placeholder | `convert_to_enrolled_placeholder` ui_intent | `approve_enrollment` | Deactivated / stub |
| Packet review approve | `patchPacketReview` → operator_review_status | *(form workflow)* | **Not** CRM enroll — separate concern |
| Waitlist → offer | Outcome status + placement candidates | `reserve_spot` + placement actions | Partial via OCM/queue |

---

## Duplicate / parallel implementations (retained)

| Path | Notes |
|------|-------|
| `mark_won` vs `approve_enrollment` | Do not deactivate `mark_won` until gates exist |
| Packet review approve vs CRM enrolled | Review modal updates session status only |
| Send-form vs `request_missing_information` | Canonical key wraps same composer |
| Placement queue UI vs `assign_*` actions | Actions focus drawer fields; queue retains manual order |
| BOS comms objectives vs registry | `missing_information` / `enrollment_next_steps` still template-driven |

---

## BOS overlap

| Signal / objective | File | Maps to | Registry gap |
|--------------------|------|---------|--------------|
| `missing_information` | `communicationObjectives.ts` | Send comms / forms | Now `request_missing_information` ui_intent available |
| `enrollment_next_steps` | Same | Follow-up comms | No canonical action button from BOS cards yet |
| `tour_date_passed` | `opportunityAttentionResolver.ts` | Tour follow-up | Phase 2 tour actions separate |
| `waiting_on_documents` | BOS routing | `missing_information` | Comms-only |

Matrix BOS guidance in `childcare_lifecycle_matrix_v1.md` remains **docs-only** for enrollment stage recommendations.

---

## Queues and work units

| Queue key | Label | Grain | Related actions |
|-----------|-------|-------|-----------------|
| `enrollment_offers` | Enrolling | child (Card 8) | Placement focus actions; `mark_won` on row |
| `enrollment_completed` | Enrolled | child | Read-mostly |
| Waitlist (candidate) | Waitlist | placement candidate | Manual order, pin — `reserve_spot` future |

Work unit pages: `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` — queue blocks preview opportunities; authoritative detail via drawer.

---

## Canonical action mapping (summary)

| Canonical key | Legacy / parallel | Activation (Phase 3) | Route |
|---------------|-------------------|------------------------|-------|
| `send_enrollment_packet` | `send_paperwork_placeholder` | **Already active** | `ui_intent` → enrollment packet modal |
| `review_enrollment_packet` | `packet_review` activity key | **Activated** | `ui_intent` → packet review modal |
| `request_missing_information` | `send_form` (partial) | **Activated** | `ui_intent` → send-form composer |
| `approve_enrollment` | `mark_won`, `convert_to_enrolled_placeholder` | **Stub (3b)** | — |
| `reserve_spot` | placement overrides | **Stub (3b)** | — |
| `assign_classroom` | OCM inline edit | **Activated** | `ui_intent` → focus `program_room_cohort_key` |
| `assign_schedule` | OCM inline edit | **Activated** | `ui_intent` → focus `desired_schedule_type` |
| `set_start_date` | OCM inline edit | **Activated** | `ui_intent` → focus `desired_start_date` |

---

## Alignment deliverables (`20260602200000`)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260602200000_phase3_enrollment_canonical_action_alignment.sql` | Activate defs + placements |
| `web/lib/admin/actions/enrollmentActionConstants.ts` | Status key arrays for conditions |
| `web/lib/admin/actions/enrollmentActionClient.ts` | Client events + scroll helpers |
| `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` | Registry client routing |
| `web/components/admin/AdminEntityDrawer.tsx` | Tab switch + event listeners |
| `web/components/admin/opportunity/OpportunityPacketReviewOverview.tsx` | Review event + canonical activity key |
| `web/components/admin/entity/OpportunityInquiryChildrenSection.tsx` | Focus listener + `data-inquiry-field` targets |

---

## Phase 3b deliverables (`20260602220000`)

| File | Purpose |
|------|---------|
| `supabase/migrations/20260602220000_phase3b_approve_enrollment.sql` | Activate `approve_enrollment`; document `reserve_spot` deferral |
| `web/lib/admin/actions/executeApproveEnrollmentAction.ts` | Completion gate + enrollment_date stamping |
| `web/lib/admin/actions/enrollmentApprovalConstants.ts` | Status keys + metadata key constants |
| `web/lib/admin/actions/executeAdminAction.ts` | Gated `approve_enrollment` execute branch |
| `web/lib/completion/evaluateOpportunityCompletionRequirements.ts` | Strict gates for `approve_enrollment` |
| `web/components/admin/opportunity/OpportunityDrawerHeaderAttentionStrip.tsx` | Header attention chips + one-line summary |

### `approve_enrollment` (activated)

| Item | Detail |
|------|--------|
| **Execute path** | `update_status` → `enrolled` via `executeAdminAction` |
| **Gates** | Primary contact, ≥1 child with person link, classroom (`program_room_cohort_key`), schedule (`desired_schedule_type`), start date (`desired_start_date`), location/program baseline rules |
| **On success** | `status_key = enrolled`; `metadata.enrollment_date` = today if blank; child person `enrollment_date` field stamped if blank; `emitStatusChangedEvent` + `action_executed` |
| **Failure** | HTTP 400 + `completion_requirements` structured payload (matches opportunity PATCH pattern) |
| **Placement** | Global `record_header` overflow when status ∈ enrolling stages |
| **Legacy** | `mark_won` retained (ungated) until operator migration — intentional gap |

### `reserve_spot` (still stubbed)

Placement orchestration (candidates, manual order, queue rows) exists but no unified `executeAdminAction` path for candidate-grain reservation. Registry row stays **inactive** (`stub_phase3b`). Operators continue via waitlist queue / OCM placement UI.

### Billing (deferred)

Deposits, registration fees, and `collect_registration_fee` remain **Phase 4+**. No enforcement in Phase 3b.

### BOS header attention (UX)

Attention chips + operational read live in `OpportunityDrawerHeaderControls` (below Work with BOS + Actions), with expanded width and body-matching left accent. Inquiry summary body skips duplicated alert/do-next when header attention is visible; tasks, reminders, and More guidance remain when non-duplicative.

### Lifecycle closeout — remaining gaps

| Gap | Priority | Notes |
|-----|----------|-------|
| `mark_won` deprecation | P1 | Ungated legacy enroll path; deactivate after `approve_enrollment` validated in production |
| `reserve_spot` execute | P1 | Registry stub; placement orchestration exists but no unified candidate-grain action |
| Paperwork gate on approve | P2 | Packet review approval not required before `approve_enrollment` |
| `review_enrollment_packet` runtime gating | P2 | Shown even when no pending sessions |
| BOS → canonical action keys | P2 | Recommendation cards do not invoke enrollment actions yet |
| Billing / deposits / registration fees | P3 | Phase 4+; `collect_registration_fee` not implemented |
| Workflow events for `approve_enrollment` | P3 | Register on existing enrollment workflows |
| Waitlist demo data reseed | — | **Out of scope this sprint** |

---

## Recommended implementation plan

### Phase 3b (complete)

1. ~~**`approve_enrollment`**~~ — requirement gates + execute path shipped.
2. **`reserve_spot`** — deferred; unified execute on placement candidate grain (Phase 4).
3. **Runtime gating** — hide `review_enrollment_packet` when no pending sessions.
4. **BOS cards** — invoke canonical action keys from recommendation surfaces.
5. **Workflow events** — register `approve_enrollment` on enrollment workflows.

### Phase 4+ (out of scope here)

- Billing: `collect_registration_fee`, deposits
- Enrollment packet send as `start_workflow` execute
- Remove `mark_won` / `convert_to_enrolled_placeholder`
- Queue row canonical action buttons

---

## Minimal migration plan

1. Apply `20260602200000_phase3_enrollment_canonical_action_alignment.sql` (idempotent placements).
2. No data backfill required — registry-only activation.
3. Operators can add/remove placements via Settings → Actions (same as tour/packet send).
4. **`mark_won`** may be deactivated after operators validate `approve_enrollment` in production.
5. Activity feed may show both legacy `packet_review` and new `review_enrollment_packet` keys during transition — acceptable.

---

## Activated vs stubbed (after Phase 3b)

| Action | Status |
|--------|--------|
| `send_enrollment_packet` | **Active** (pre-existing) |
| `review_enrollment_packet` | **Active** |
| `request_missing_information` | **Active** |
| `assign_classroom` | **Active** |
| `assign_schedule` | **Active** |
| `set_start_date` | **Active** |
| `approve_enrollment` | **Active** (gated) |
| `reserve_spot` | **Stub** (`stub_phase3b`) |

---

## MVP readiness assessment

| Capability | Ready? | Notes |
|------------|--------|-------|
| Send enrollment packet from configured drawer actions | Yes | Phase 2 + settings |
| Review submitted packet from header action | Yes | Opens existing modal |
| Request missing info via send-form | Yes | Reuses composer |
| Assign classroom/schedule/start in drawer | Yes | Focus + existing OCM save |
| Approve enrollment with requirement gates | **Yes** | Use `approve_enrollment`; legacy `mark_won` still ungated |
| Reserve spot from canonical action | **No** | Use queue placement UI |
| BOS → canonical enrollment actions | **No** | Comms objectives only |
| Billing / registration fees | **No** | Explicitly out of scope |

**Overall:** Enrollment lifecycle can close via gated **`approve_enrollment`**. Remaining gaps: **`reserve_spot` execute**, **`mark_won` deprecation**, BOS action wiring, billing policies, packet paperwork gates.

**Closeout (May 2026):** See [`lifecycle_closeout.md`](./lifecycle_closeout.md) for BOS header finalization, `mark_won` migration plan, `reserve_spot` recommendation, `review_enrollment_packet` runtime gating, and BOS→action readiness inventory (~**84%** sprint completion).

---

## Legacy actions left untouched

- `mark_won` (ungated enroll transition — deprecate after `approve_enrollment` adoption)
- `convert_to_enrolled_placeholder` (org stub)
- `send_paperwork_placeholder` (deactivated)
- Queue row hardcoded lifecycle events
- Packet review PATCH semantics (unchanged)
