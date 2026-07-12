# Action Placement Alignment Matrix v1

**Path:** `docs/sprints/06_2026/action_placement_alignment_matrix_v1.md`  
**Status:** Shipped alignment (May 2026) — Phase 2 deliverable  
**Doctrine:** Lead → Qualification → Tour → Waitlist → Enrollment → Enrolled

**Legend:** Should Exist · Should Be Visible · Configurable · Status (Working / Partial / Placeholder)

---

## Lifecycle transition actions

| Action | Should exist | Visible stages | Placements (target) | Configurable | Status |
|--------|--------------|----------------|---------------------|--------------|--------|
| `create_lead` | Yes | Entry | WU right rail | Yes | Working |
| `move_to_qualification` | Yes | Lead | Header, queue | Yes | Working |
| `move_to_waitlist` | Yes | Qualification, Tour, Enrollment | Header secondary, overflow | Yes | **Working** (activated `20260603100000`) |
| `schedule_tour` | Yes | Qualification, Tour, Waitlist | Header secondary | Yes | Working |
| `record_tour_outcome` | Yes | Tour | Header overflow, tour bar | Yes | Working |
| `approve_enrollment` | Yes | **Enrollment only** | Header overflow | Yes | Working (gated `20260603110000`) |
| `mark_lost` | Yes | Pre-enrolled | Overflow, queue | Yes | Working |
| `mark_won` | **No** | — | — | — | Deprecated (inactive) |
| `qualify_opportunity` | **No** | — | — | — | Deprecated (inactive) |

---

## Record & household capture

| Action | Should exist | Visible stages | Placements | Configurable | Status |
|--------|--------------|----------------|------------|--------------|--------|
| `add_child` / `add_sibling` | Yes | Lead → Enrollment | Inquiry section, shell | Yes | Working |
| `add_family_member` | Yes | Lead → Enrollment | `family_contacts` section | Yes | Working |
| `assign_classroom` / `assign_schedule` / `set_start_date` | Yes | Qualification → Enrollment | Record section (focus) | Yes | Working |

---

## Communication & tasks

| Action | Should exist | Visible stages | Placements | Configurable | Status |
|--------|--------------|----------------|------------|--------------|--------|
| `send_email` / `send_sms` | Yes | Universal | Queue (Settings) | Yes | Working |
| `send_form` | Yes | Universal | Settings-addable | Yes | Partial (placement) |
| `create_task` | Yes | Universal | Overflow | Yes | Partial (panel only) |
| `quick_message` | **No** | — | — | — | Deprecated |

---

## BOS & Needs Attention

| Surface | Should exist | Lifecycle scope | Status |
|---------|--------------|-----------------|--------|
| `ask_bos` | Yes | Universal | Working |
| BOS catalog recommendations | Yes | Stage via attention + preflight | Partial |
| `view_needs_attention` | Yes | Platform overlay | Working |
| Needs Attention buckets | Yes | Lifecycle lenses (seed updated) | Partial |

---

## Implementation notes (this sprint)

- **`move_to_waitlist`:** `20260603100000_activate_move_to_waitlist_lifecycle.sql` — `update_status`, header placements, placeholder retired.
- **`approve_enrollment`:** Restricted to enrollment-stage status keys — not Lead/Qualification/Tour-only.
- **Deprecated:** `mark_won`, `qualify_opportunity`, `quick_message` deactivated globally.

---

## Remaining placement gaps (P1)

| Action | Gap |
|--------|-----|
| `send_form` | Pilot org placement seed / Settings checklist |
| `create_task` | Capture modal — task audit |
| `remove_from_waitlist` | Stub — not activated |
| Queue row lifecycle CTAs | Mostly `open_record` + org policy |
