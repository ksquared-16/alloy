# Lifecycle Alignment Sprint — Closeout

**Date:** 2026-05-31  
**Status:** Closeout pass (BOS header finalization + lifecycle audits)  
**Next sprint (out of scope):** Lifecycle Configuration & Requirements

---

## Sprint completion estimate

| Area | Weight | Done | Notes |
|------|--------|------|-------|
| Entry lifecycle (create_lead, qualification) | 15% | 100% | Phase 1 |
| Universal comms actions | 10% | 100% | Phase 2 |
| Enrollment action alignment (8 keys) | 25% | 90% | 6 active; approve_enrollment gated; reserve_spot deferred |
| Enrollment completion (`approve_enrollment`) | 20% | 95% | Execute + gates shipped; paperwork gate documented not enforced |
| BOS header + deduplication | 10% | 100% | This closeout pass |
| Legacy deprecation (`mark_won`) | 10% | 40% | Audit + migration plan only |
| BOS → canonical action wiring | 10% | 15% | Audit only |
| Billing / deposits | 5% | 0% | Explicitly deferred |
| Waitlist / placement execute (`reserve_spot`) | 5% | 25% | Architecture audit; not activated |

**Overall lifecycle alignment: ~84%**

Recommendation: **Close this sprint** and open **Lifecycle Configuration & Requirements** for paperwork policies, `mark_won` cutover, `reserve_spot` ownership, and BOS action invocation.

---

## Part A — BOS header finalization (shipped)

### Doctrine

| Row | Content | Role |
|-----|---------|------|
| 1 (right) | Work with BOS · Actions | Controls |
| 2 (full width, left) | Chips · summary · More guidance | Context |

### Implementation

| File | Purpose |
|------|---------|
| `web/components/admin/drawer/DrawerHeaderAttentionBlock.tsx` | Chips, 2-line summary, expandable in-drawer panel |
| `web/lib/admin/drawer/drawerHeaderAttentionPresentation.ts` | Visibility helpers + accent surface tokens |
| `OpportunityDrawerHeaderControls.tsx` / `PersonDrawerHeaderControls.tsx` | Layout |
| `OpportunityInquirySummaryRightColumn.tsx` | No review assist when header attention visible |

Summary line uses **do-next recommendation first**, then operational read. Expanded panel: why now, recommended next step (if distinct), what changed, supporting detail. No modal, no navigation.

---

## Part B.1 — `mark_won` deprecation plan

### Current placements (audit)

| Surface | Key | Mechanism |
|---------|-----|-----------|
| Global registry | `mark_won` | `update_status` → `enrolled`, `is_active=true` |
| Queue row (legacy) | `mark_won` | `QueueBlock.tsx` hardcoded event |
| Work unit adapter | `mark_won` | `realWorkUnitFromOpportunities.ts` |
| Record chrome map | `mark_won` | `opportunityRecordActionMap.ts` |
| Org overrides | varies | Some orgs deactivated in `20260430220000_enrollment_registry_actions_only.sql` |

### `approve_enrollment` (canonical)

| Surface | Key | Mechanism |
|---------|-----|-----------|
| Global registry | `approve_enrollment` | `update_status` → `enrolled`, gated in `executeAdminAction` |
| Header Actions menu | overflow | `20260602220000_phase3b_approve_enrollment.sql` |

### Workflow / execute usage

- **`mark_won`:** `executeAdminAction` → generic `update_status` — **no completion gates**
- **`approve_enrollment`:** same path + `assertApproveEnrollmentAllowed` + `enrollment_date` stamping

### Safe migration path (do not execute yet)

1. **Shadow period (current):** Both keys active; operators use `approve_enrollment` from Actions menu.
2. **Org comms:** Document that `mark_won` is legacy; train on gated approve.
3. **Migration `phase4_demote_mark_won`:**
   - Set global `mark_won` `is_active=false` (keep row for audit)
   - Deactivate global `mark_won` queue_row / record_header placements if any remain
   - Remove hardcoded `QueueBlock` `mark_won` row action (replace with resolver-driven `approve_enrollment` when status allows)
   - Update `realWorkUnitFromOpportunities` label to point at approve or remove
4. **Verification:** No org-scoped `mark_won` placements without explicit override; activity feed shows `approve_enrollment` action_key.
5. **Rollback:** Re-activate `mark_won` global def; placements idempotent.

---

## Part B.2 — `reserve_spot` decision

### What exists today

| Layer | Capability |
|-------|------------|
| `placement_candidates` + OCM | Waitlist grain, manual order, pin overrides |
| `placementOverrideMutations.ts` | Server mutations for candidate ordering |
| `QueueRowPlacement*` UI | Waitlist queue row controls |
| Registry `reserve_spot` | **Inactive** stub (`entity_type: opportunity_customer_member`) |

### Semantic analysis

| Interpretation | Fit | Recommendation |
|----------------|-----|----------------|
| Waitlist hold | Partial — ordering exists, no "held" state | Not canonical yet |
| Placement reservation | Partial — candidate row is preview grain | **Most likely future owner** |
| Classroom reservation | No capacity module | Out of scope |
| Enrollment reservation | Overlaps approve + placement | Split concerns |

### Recommendation

**Do not activate `reserve_spot` in this sprint.**

Canonical ownership (Phase 4):

- **Entity grain:** `placement_candidate` (or `opportunity_customer_member` when promoting waitlist offer)
- **Execute model:** Lightweight status/metadata flag on candidate + activity event (not full capacity scheduling)
- **UI:** Queue row + drawer placement section; not header Actions until grain is unified
- **Distinct from:** `approve_enrollment` (CRM enrolled status) and placement field edits (`assign_classroom`, etc.)

---

## Part B.3 — `review_enrollment_packet` runtime gating (shipped)

**Rule:** Hide when no completed packet session awaits operator review (`needs_review`, `needs_correction`, or null review on completed session).

| File | Change |
|------|--------|
| `filterOpportunityActionsForRuntimeGates.ts` | Strips action from resolved slots |
| `resolveActionsForContext.ts` | Calls filter after resolution |
| `opportunityHasReviewableEnrollmentPacket()` | Same truth as enrollment-packets GET |

Status-key placement conditions unchanged; runtime filter is additive.

---

## Part B.4 — `approve_enrollment` gate review

### Current required gates (`action_key: approve_enrollment`)

| Requirement | Enforced | Source |
|-------------|----------|--------|
| Primary contact | Yes | Always-required |
| ≥1 child | Yes | Always-required |
| Child identity (person link) | Yes | Strict approve gate |
| Classroom / placement (`program_room_cohort_key`) | Yes | Strict approve gate |
| Schedule (`desired_schedule_type`) | Yes | Strict approve gate |
| Start date (`desired_start_date`) | Yes | Enrolled status rules |
| Location / program baseline | Yes | Waitlist/enrolled rules |

### Packet approval gate — recommendation

**Do not add in this sprint.**

| Option | Rationale |
|--------|-----------|
| **Defer (recommended)** | Packet review decision (`operator_review_status=approved`) is form-domain truth; not all enroll paths use packets yet. Adding hard gate now blocks valid manual enroll flows. |
| Future policy | Add org-configurable requirement: `enrollment_operational.packet_approved_required` checked against `form_packet_sessions` — belongs in **Lifecycle Configuration & Requirements**. |
| Interim | Operators use `review_enrollment_packet` before `approve_enrollment`; BOS can recommend sequence without blocking. |

---

## Part B.5 — BOS → lifecycle actions audit

Readiness inventory (documentation only — no wiring):

| BOS signal / objective | Typical recommendation | Canonical action key | Readiness |
|------------------------|------------------------|----------------------|-----------|
| Stale new inquiry | First response | `send_email` / `call_parent` | Partial — comms objectives only |
| Tour date passed | Schedule/reschedule | `schedule_tour` / `reschedule_tour` | Partial |
| Tour completed follow-up | Schedule enrollment steps | `send_enrollment_packet` | Not wired |
| Waiting on documents | Request info | `request_missing_information` | Not wired |
| Packet review pending | Review packet | `review_enrollment_packet` | Not wired (gated in resolver now) |
| Placement incomplete | Assign classroom/schedule | `assign_classroom`, `assign_schedule`, `set_start_date` | Not wired |
| Ready to enroll | Approve | `approve_enrollment` | Not wired |
| Waitlist / offer | Reserve / reorder | `reserve_spot` (deferred) | Blocked — no execute |
| Stale qualified | Enrollment next steps | `send_enrollment_packet` | Not wired |

**Implementation path (next sprint):** Map `recommended_action.key` from operational recommendation catalog to registry keys; surface as header Actions pre-selection or BOS handoff intent — not outbound copy.

---

## Remaining gaps (post-closeout)

1. **`mark_won` demotion migration** — plan documented; not executed
2. **`reserve_spot` execute** — ownership defined; not built
3. **Packet approval policy gate** — documented deferral
4. **BOS recommendation → action invoke** — audit only
5. **Billing / registration fees** — Phase 4+
6. **Workflow events for `approve_enrollment`** — optional hardening
7. **Waitlist demo reseed** — out of scope

---

## Related docs

- `docs/sprints/05_2026/enrollment_alignment_audit.md` — Phase 3/3b action matrix
- `docs/sprints/05_2026/canonical_action_catalog_v1.md` — action definitions
- `docs/sprints/05_2026/action_definition_legacy_mapping_v1.md` — legacy mapping
