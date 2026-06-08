# Lifecycle Runtime Alignment Matrix v1

**Path:** `docs/sprints/06_2026/lifecycle_runtime_alignment_matrix_v1.md`  
**Status:** Planning artifact (May 2026) — **no implementation in this pass**  
**Sprint:** Lifecycle Runtime & Configuration Alignment  
**Doctrine (canonical):** Lead → Qualification → Tour → Waitlist → Enrollment → Enrolled  
*(Parking lot: **Waitlist**. Exit: **Lost**, **Withdrawn**.)*

**Builds on:**

- [`lifecycle_information_matrix_v1.md`](../05_2026/lifecycle_information_matrix_v1.md) — information + capture surfaces
- [`lifecycle_sprint_final_coverage_closeout_audit_v1.md`](../05_2026/lifecycle_sprint_final_coverage_closeout_audit_v1.md) — coverage + inventory
- [`childcare_lifecycle_matrix_v1.md`](../05_2026/childcare_lifecycle_matrix_v1.md) — operator doctrine
- [`adminv2_action_runtime_audit_and_plan_v1.md`](../05_2026/adminv2_action_runtime_audit_and_plan_v1.md) — runtime taxonomy
- Runtime: `enrollmentPipelineQueueDefinitionV2.ts`, `lifecycleActionRequirementCatalog.ts`, `operationalRecommendationCatalog.ts`

**Legend**

| Marker | Meaning |
|--------|---------|
| **Exists** | Shipped and usable on pilot enrollment orgs without code changes |
| **Partial** | Some surfaces, rules, or placements; gaps vs doctrine |
| **Missing** | Doctrine expects; stub, inactive, or not implemented |

---

## Cross-cutting runtime model

| Layer | Canonical target | Current state | Coverage |
|-------|-------------------|---------------|----------|
| **Work unit** | Single `enrollment_pipeline` WU; domain sections map to lifecycle | v2 `domain_with_attention` layout shipped; legacy multi-WU bootstrap still in onboarding JSON | **Partial** |
| **Status keys** | Six-stage doctrine + tour substates + exit states | `qualification` shipped; tour substates exist; `contact_attempted` legacy retained | **Partial** |
| **Needs Attention** | Stage-aware reasons + overlay queue | Platform reason codes exist; buckets seeded for demo; not stage-scoped in UI copy | **Partial** |
| **BOS** | Stage-aligned recommendations + preflight parity | Phase 1 catalog (8 keys); `recommended_action_preflight` partial | **Partial** |
| **Actions** | Registry placements per stage | Many working; `move_to_waitlist` inactive; task/create weak | **Partial** |
| **Settings** | Expose existing config (placements, layouts, attention SLA) | Four-plane V1 shipped; requirement policy authoring missing | **Partial** |

**Grain note:** Case-level `opportunities.status_key` drives most queues; **Waitlist** and **Enrolling/Enrolled** v2 lanes use **candidate/child grain** (`placement_candidates`, OCM `outcome_status_key`). Do not assume one case status equals every child's state.

---

## Lead

**Operator stage:** Lead  
**Primary `status_key`:** `new_inquiry`  
**Queue domain:** `new_leads` (case grain)

### Work Units

| Target | Runtime today | Coverage |
|--------|---------------|----------|
| **`enrollment_pipeline`** — New Leads section | `new_leads` queue filters `new_inquiry` (+ legacy `open`, `new`) | **Exists** |
| Dedicated Lead-only WU | Not doctrine — single pipeline WU | N/A (by design) |
| Legacy `early_inquiries` / multi-WU bootstrap | Still in `childcareBootstrapV1.ts` for onboarding demos | **Partial** (migration debt) |

### Statuses

| Status key | Operator label | Belongs to stage | Coverage |
|------------|----------------|------------------|----------|
| `new_inquiry` | New inquiry | **Lead** | **Exists** |
| `open`, `new` | Legacy aliases | Lead (compat) | **Partial** |

### Actions

| Action | Runtime type | Intended placement | Coverage | Notes |
|--------|--------------|---------------------|----------|-------|
| `create_lead` | Capture First | WU `right_rail` | **Exists** | Person-only lead OK (Pass B) |
| `add_child`, `add_sibling` | Capture First | Inquiry section + shell | **Exists** | Pass A convergence |
| `add_family_member`, `add_related_person` | Capture First | `family_contacts` section | **Exists** | Pass B — `AddPersonModal` |
| `send_email`, `send_sms`, `call_parent` | Communication | Queue / overflow | **Exists** | Header default off |
| `send_form` | Communication | Settings-addable | **Partial** | Placement not guaranteed |
| `add_note` | Capture First | Overflow | **Exists** | |
| `create_task` | Open Modal (weak) | Overflow | **Partial** | Opens panel only |
| `move_to_qualification` | Execute Now | Header / queue | **Exists** | No child gate |
| `mark_lost` | Open Modal → Execute | Overflow / queue | **Exists** | `lost_reason` required |
| `schedule_tour` | Open Modal | — | **Missing** at Lead | Correct — qualification/tour stage action |

### Needs Attention

| Reason code | Bucket (demo seed) | Stage fit | Coverage |
|-------------|-------------------|-----------|----------|
| `stale_new_inquiry` | *(generic NA overlay)* | **Lead** — first outreach overdue | **Exists** |
| `missing_identity` | — | Lead — structural | **Exists** |
| `unanswered_inbound` | — | Lead+ (comms overlay) | **Partial** |
| `follow_up_date_passed` | `follow_up_overdue` | Any stage with commitment | **Exists** |

### BOS

| Signal / catalog key | Guidance | Coverage |
|---------------------|----------|----------|
| `stale_new_inquiry` | First response; draft SMS/email | **Exists** |
| `unanswered_inbound` | Reply in thread | **Partial** |
| Initial outreach objectives | Maps to comms actions | **Exists** |
| Missing contact method | Doctrine expects | **Partial** (completion preview only) |

### Layout

| Emphasis | Surface | Coverage |
|----------|---------|----------|
| Primary contact + channels | Family contacts, header | **Exists** |
| Inquiry children (empty OK) | Inquiry children section | **Exists** |
| Work with BOS + Actions menu | Header | **Exists** |
| Attention strip | Above-fold | **Exists** |
| Source / campaign | Metadata | **Partial** |

### Settings Ownership

| Configurable today | Read-only today | Missing |
|--------------------|-----------------|---------|
| Action placements (comms, move to qualification) | Status transition into qualification | Stage-scoped placement presets |
| Field labels; drawer section order | Requirement hard blocks on create lead | Lead intake form → lifecycle link |
| Attention SLA: `stale_new_inquiry` threshold hours | Platform reason definitions | Unified "lead completeness" policy UI |

---

## Qualification

**Operator stage:** Qualification  
**Primary `status_key`:** `qualification`  
**Queue domain:** `communications_followup` (includes legacy `contact_attempted`, `contacted`)

### Work Units

| Target | Runtime today | Coverage |
|--------|---------------|----------|
| **`enrollment_pipeline`** — Follow Up section | `communications_followup` queue | **Exists** |
| Separate Qualification WU | Not doctrine | N/A |

### Statuses

| Status key | Operator label | Belongs to stage | Coverage |
|------------|----------------|------------------|----------|
| `qualification` | Qualification | **Qualification** | **Exists** |
| `contact_attempted` | Contact attempted | Legacy — maps to Follow Up queue | **Partial** |
| `contacted` | Contacted | Legacy alias | **Partial** |

### Actions

| Action | Runtime type | Intended placement | Coverage | Notes |
|--------|--------------|---------------------|----------|-------|
| `add_child`, `add_sibling` | Capture First | Inquiry section | **Exists** | Primary data entry |
| `add_family_member` | Capture First | Family contacts | **Exists** | |
| `send_form` | Communication | Section / Settings | **Partial** | |
| `schedule_tour` | Open Modal → Execute | Header secondary | **Exists** | Preflight on execute only |
| `move_to_waitlist` | Execute Now | Header secondary | **Missing** | **`is_active = false`** |
| `mark_lost` | Open Modal → Execute | Overflow | **Exists** | |
| `assign_classroom`, `assign_schedule`, `set_start_date` | Open Record (focus) | Section (early prep) | **Exists** | Scroll/focus only |
| Universal comms + note + task | Mixed | Overflow / queue | **Partial** (task weak) |

### Needs Attention

| Reason code | Bucket (demo seed) | Stage fit | Coverage |
|-------------|-------------------|-----------|----------|
| `stale_qualified` | — | **Qualification** — idle after contact | **Exists** (threshold configurable) |
| `mid_funnel_stale` | — | Qualification → early tour | **Partial** |
| Missing child/program fit | — | Doctrine | **Partial** (preflight on downstream executes, not NA reason) |

### BOS

| Signal / catalog key | Guidance | Coverage |
|---------------------|----------|----------|
| Missing child age/program | Completion preview | **Partial** |
| Desired start date missing | Completion preview | **Partial** |
| Follow-up after qualification contact | Generic stale | **Partial** |
| `stale_qualified` | Re-engage | **Partial** (catalog maps via attention) |

### Layout

| Emphasis | Surface | Coverage |
|----------|---------|----------|
| Inquiry children (primary data entry) | Inquiry children section | **Exists** |
| Program, schedule, start date on child rows | OCM inline fields | **Exists** |
| Family contacts | Section | **Exists** |
| BOS fit gaps | Attention / assist band | **Partial** |

### Settings Ownership

| Configurable today | Read-only today | Missing |
|--------------------|-----------------|---------|
| Inline field requiredness (`field_placements_v1`) | `move_to_waitlist` activation | Stage-scoped action visibility (`condition_config`) |
| `stale_qualified` threshold hours | Preflight rules for waitlist (code catalog) | Qualification "fit complete" policy |
| Action placements for schedule tour | | |

---

## Tour

**Operator stage:** Tour  
**Primary `status_key`:** `tour_scheduled` (+ substates)  
**Queue domains:** `tours` (scheduled), `tours_follow_up` (completed / no-show / follow-up)

### Work Units

| Target | Runtime today | Coverage |
|--------|---------------|----------|
| **`enrollment_pipeline`** — Tours section | `tours` + hidden `tours_follow_up` execution queues | **Exists** |
| Post-tour substates in same Tours pill | UI collapses tour_scheduled + follow-up substates | **Partial** (operator sees one "Tours" domain) |

### Statuses

| Status key | Operator label | Belongs to stage | Coverage |
|------------|----------------|------------------|----------|
| `tour_scheduled` | Tour scheduled | **Tour** (active visit) | **Exists** |
| `tour_completed` | Tour completed | **Tour** substate | **Exists** |
| `tour_no_show` | Tour no show | **Tour** substate | **Exists** |
| `follow_up_attempted` | Follow up attempted | **Tour** substate (not separate lifecycle stage) | **Exists** |

### Actions

| Action | Runtime type | Intended placement | Coverage | Notes |
|--------|--------------|---------------------|----------|-------|
| `schedule_tour`, `reschedule_tour` | Open Modal | Header / tour bar | **Exists** | Dual path (bar + registry) |
| `confirm_tour` | Execute Now | Tour section / bar | **Exists** | |
| `record_tour_outcome` | Open Modal → Execute | Header / tour bar | **Exists** | Preflight on execute |
| `send_enrollment_packet` | Communication | Settings-addable | **Exists** | |
| `move_to_waitlist` | Execute Now | Header | **Missing** | Inactive |
| `mark_lost` | Open Modal → Execute | Overflow | **Exists** | |
| `approve_enrollment` | Execute Now | Overflow (ungated) | **Partial** | Wrong stage — placement cleanup needed |
| Universal comms, note, task, send form | Mixed | Various | **Partial** |

### Needs Attention

| Reason code | Bucket (demo seed) | Stage fit | Coverage |
|-------------|-------------------|-----------|----------|
| `tour_date_passed` | `tour_date_passed` | **Tour** — outcome not recorded | **Exists** |
| Tour tomorrow / not confirmed | — | Doctrine | **Missing** (no dedicated reason code) |
| No-show follow-up | — | Doctrine (task, not status) | **Partial** (manual task) |

### BOS

| Signal / catalog key | Guidance | Coverage |
|---------------------|----------|----------|
| `tour_date_passed` | Post-tour follow-up; record outcome | **Exists** |
| Tour not confirmed | Doctrine | **Missing** |
| No-show requires follow-up | Generic follow-up | **Partial** |
| `high_value_stale` | Mid/late funnel re-engage | **Partial** (may fire on tour statuses) |

### Layout

| Emphasis | Surface | Coverage |
|----------|---------|----------|
| Tour booking lifecycle bar | Tour block | **Exists** |
| Tour date / confirmation | Metadata + bookings | **Exists** |
| Inquiry children + contacts | Sections | **Exists** |
| Outcome recording | Modal + bar | **Exists** |

### Settings Ownership

| Configurable today | Read-only today | Missing |
|--------------------|-----------------|---------|
| Tour availability settings | Tour date passed resolver logic | Tour confirmation attention reason |
| Action placements (schedule, outcome) | `record_tour_outcome` preflight catalog | Stage-gated approve enrollment |
| | Tour bar hardcoded actions | |

---

## Waitlist

**Operator stage:** Waitlist *(parking lot — not linear)*  
**Primary `status_key`:** `waitlisted`  
**Queue domain:** `waitlist` (candidate grain, child-primary rows)

### Work Units

| Target | Runtime today | Coverage |
|--------|---------------|----------|
| **`enrollment_pipeline`** — Waitlist section | `waitlist` queue; candidate grain | **Exists** |
| Manual position controls | Queue UI (not catalog action) | **Exists** |
| Placement priority / ranking | Settings V2 + orchestration | **Exists** |

### Statuses

| Status key | Operator label | Belongs to stage | Coverage |
|------------|----------------|------------------|----------|
| `waitlisted` | Waitlisted | **Waitlist** | **Exists** |
| `offer_pending` (child) | Offer pending | Waitlist → Enrollment bridge | **Partial** |

### Actions

| Action | Runtime type | Intended placement | Coverage | Notes |
|--------|--------------|---------------------|----------|-------|
| `move_to_waitlist` | Execute Now | Header secondary + overflow | **Exists** | Activated `20260603100000`; schedule/start preflight |
| `remove_from_waitlist` | Execute Now | Header / queue | **Missing** | Catalog stub |
| `contact_family` | Communication | Section | **Missing** | Use send_email/sms |
| `schedule_tour` | Open Modal | Header | **Exists** | Re-engage path |
| `send_enrollment_packet` | Communication | Settings | **Exists** | |
| Queue: adjust position | Execute Now | Waitlist queue UI | **Exists** | Not in action registry |
| Collect / waive waitlist fee | Execute Now | Section | **Missing** | Doctrine P2 |
| Universal comms, note, task | Mixed | Various | **Partial** |

### Needs Attention

| Reason code | Bucket (demo seed) | Stage fit | Coverage |
|-------------|-------------------|-----------|----------|
| Opening available for age/program | — | **Waitlist** doctrine | **Missing** |
| Long time on waitlist | — | **Waitlist** | **Partial** (ranking UI, no NA code) |
| Waitlist fee unpaid | — | Policy-dependent | **Missing** |
| `waiting_on_family` / `waiting_on_staff` | Wait buckets | Any including waitlist | **Exists** |
| `high_value_stale` | `high_value_stale` bucket | May include waitlisted statuses | **Partial** |

### BOS

| Signal / catalog key | Guidance | Coverage |
|---------------------|----------|----------|
| Opening available | Contact family when spot opens | **Missing** |
| Family not contacted after opening | Doctrine | **Missing** |
| Waitlist fee unpaid | Doctrine | **Missing** |
| `waiting_on_family` | Check-in on documents/timing | **Partial** |
| Offer spot → enrollment | Queue/BOS handoff | **Partial** (no single catalog execute) |

### Layout

| Emphasis | Surface | Coverage |
|----------|---------|----------|
| Child placement fields | Inquiry children | **Exists** |
| Queue position / priority | Waitlist queue row | **Exists** |
| Desired start, schedule, program | OCM inline | **Exists** |
| Household context on candidate rows | Queue preview | **Exists** |

### Settings Ownership

| Configurable today | Read-only today | Missing |
|--------------------|-----------------|---------|
| Waitlist Ranking Policy V2 | `move_to_waitlist` activation | Waitlist fee policy |
| Priority factors, shadow mode | Preflight fields (schedule/start not in catalog) | `remove_from_waitlist` handler |
| Attention buckets (partial) | Candidate grain filters | Opening-available signal config |

---

## Enrollment

**Operator stage:** Enrollment  
**Primary `status_key`:** `enrolling`  
**Queue domain:** `enrollment_offers` (child grain)

### Work Units

| Target | Runtime today | Coverage |
|--------|---------------|----------|
| **`enrollment_pipeline`** — Enrolling section | `enrollment_offers` queue | **Exists** |
| `ready_to_enroll` alias | Maps to same domain | **Exists** |

### Statuses

| Status key | Operator label | Belongs to stage | Coverage |
|------------|----------------|------------------|----------|
| `enrolling` | Enrolling | **Enrollment** | **Exists** |
| `ready_to_enroll` | Ready to enroll | Enrollment (alias) | **Partial** |

### Actions

| Action | Runtime type | Intended placement | Coverage | Notes |
|--------|--------------|---------------------|----------|-------|
| `approve_enrollment` | Execute Now | Header overflow | **Exists** | Preflight + blocked panel |
| `send_enrollment_packet` | Communication | Section / Settings | **Exists** | |
| `review_enrollment_packet` | Open Modal | Header overflow | **Exists** | |
| `request_missing_information` | Communication | Section | **Exists** | Alias to send_form |
| `assign_classroom`, `assign_schedule`, `set_start_date` | Open Record (focus) | Section | **Exists** | |
| `upload_document` | Open Drawer | Documents tab | **Exists** | |
| `move_to_waitlist` | Execute Now | Header | **Missing** | Inactive |
| `mark_lost` | Open Modal → Execute | Overflow | **Exists** | |
| `reserve_spot` | Execute Now | — | **Missing** | Stub |
| Collect registration fee / deposit | Execute Now | Section | **Missing** | Doctrine P2 |
| Universal comms, note, task | Mixed | Various | **Partial** |

### Needs Attention

| Reason code | Bucket (demo seed) | Stage fit | Coverage |
|-------------|-------------------|-----------|----------|
| `waiting_on_documents` | — | **Enrollment** — packet pending | **Exists** |
| `waiting_on_payment` | — | **Enrollment** — fee/deposit | **Exists** (no fee actions yet) |
| `waiting_on_staff` | — | Internal review backlog | **Exists** |
| Classroom/schedule/start missing | — | Preflight, not NA code | **Partial** |
| Packet incomplete | — | Doctrine | **Partial** (no dedicated reason) |

### BOS

| Signal / catalog key | Guidance | Coverage |
|---------------------|----------|----------|
| Packet incomplete | Review / request info | **Partial** |
| Classroom / schedule / start missing | Maps to preflight + focus actions | **Exists** |
| Deposit/fee unpaid | Doctrine | **Missing** |
| `waiting_on_documents` | Staff review | **Partial** |
| `recommended_action_preflight` on approve | Blocked execute enrich | **Exists** |

### Layout

| Emphasis | Surface | Coverage |
|----------|---------|----------|
| Inquiry children placement columns | Inquiry children | **Exists** |
| Packet send/review | Actions + modals | **Exists** |
| Documents tab | Drawer tab | **Exists** |
| Primary contact / guardian | Family contacts | **Exists** |

### Settings Ownership

| Configurable today | Read-only today | Missing |
|--------------------|-----------------|---------|
| Layout required fields for OCM | `approve_enrollment` preflight catalog (TS) | Packet-required org policy |
| Action placements (approve, packet, review) | Financial gate actions | Requirement policy authoring |
| Forms / packets hub | | Enrollment checklist templates (out of scope) |

---

## Enrolled

**Operator stage:** Enrolled *(operator label: Active / Enrolled)*  
**Primary `status_key`:** `enrolled`  
**Queue domain:** `enrollment_completed` (child grain)

### Work Units

| Target | Runtime today | Coverage |
|--------|---------------|----------|
| **`enrollment_pipeline`** — Enrolled section | `enrollment_completed` queue | **Exists** |
| Ongoing care operations | Person drawer / future modules | **Partial** |

### Statuses

| Status key | Operator label | Belongs to stage | Coverage |
|------------|----------------|------------------|----------|
| `enrolled` | Enrolled | **Enrolled** | **Exists** |
| Child `outcome_status_key` | Per-child enrolled | Member grain | **Exists** |

### Actions

| Action | Runtime type | Intended placement | Coverage | Notes |
|--------|--------------|---------------------|----------|-------|
| `withdraw_child` | Execute Now | Header / person scope | **Missing** | Catalog stub |
| View / edit child, contact | Layout / drawer | Inline + person drawer | **Exists** |
| Send communication | Communication | Comms tab | **Exists** |
| `add_note`, `upload_document` | Capture First | Overflow / documents | **Exists** |
| `create_task` | Open Modal (weak) | Overflow | **Partial** |
| Status changes (member) | APIs | Person/member scope | **Partial** |

### Needs Attention

| Reason code | Bucket (demo seed) | Stage fit | Coverage |
|-------------|-------------------|-----------|----------|
| Start date arrived not active | — | **Enrolled** activation policy | **Partial** |
| Active child missing schedule/classroom | — | Steady-state ops | **Partial** |
| `high_value_stale` | — | Should not fire on enrolled | **Partial** (status allow-list in resolver) |

### BOS

| Signal / catalog key | Guidance | Coverage |
|---------------------|----------|----------|
| Start date arrived not active | Activation policy | **Partial** |
| Profile completeness | Steady-state | **Partial** |
| Billing setup | Future module | **Missing** |

### Layout

| Emphasis | Surface | Coverage |
|----------|---------|----------|
| Inquiry children (read-mostly) | Inquiry children | **Exists** |
| Person drawer from child row | Navigation | **Exists** |
| Documents / comms history | Tabs | **Exists** |

### Settings Ownership

| Configurable today | Read-only today | Missing |
|--------------------|-----------------|---------|
| Layout field visibility | Activation policy (code/config) | Withdraw flow actions |
| Action placements (comms, note) | Child/member lifecycle APIs | Billing module config |

---

## Exit states (reference)

| Stage | Status | Key actions | Coverage |
|-------|--------|-------------|----------|
| **Lost** | `lost` | `mark_lost`, `reopen_lead` (stub) | Mark lost **Exists**; reopen **Missing** |
| **Withdrawn** | member/person scope | `withdraw_child`, note, task | **Missing** |

---

## Stage summary — Exists / Partial / Missing

| Stage | Work Units | Statuses | Actions | Needs Attention | BOS | Layout | Settings |
|-------|------------|----------|---------|-----------------|-----|--------|----------|
| **Lead** | Exists | Exists | Partial | Partial | Partial | Exists | Partial |
| **Qualification** | Exists | Partial | Partial | Partial | Partial | Exists | Partial |
| **Tour** | Exists | Exists | Partial | Partial | Partial | Exists | Partial |
| **Waitlist** | Exists | Exists | **Partial** | Partial | Partial | Exists | Partial |
| **Enrollment** | Exists | Exists | Partial | Partial | Partial | Exists | Partial |
| **Enrolled** | Exists | Exists | Partial | Partial | Partial | Exists | Partial |

**Primary alignment gap:** **Waitlist** — canonical `move_to_waitlist` inactive; exit/offer actions missing; BOS waitlist signals not implemented.

---

## References

| Area | Location |
|------|----------|
| Queue definition v2 | `web/lib/config/enrollmentPipelineQueueDefinitionV2.ts` |
| Lifecycle preflight | `web/lib/completion/lifecycleActionRequirementCatalog.ts` |
| BOS catalog | `web/lib/adminV2/bos/recommendations/catalog/operationalRecommendationCatalog.ts` |
| Attention platform | `web/lib/opportunities/attentionPlatformCatalog.ts` |
| NA buckets seed | `web/lib/opportunities/enrollmentNeedsAttentionBucketsSeed.ts` |
| Action inventory (closeout) | `lifecycle_sprint_final_coverage_closeout_audit_v1.md` § Part 2 |
| Sprint backlog | `lifecycle_runtime_configuration_alignment_sprint.md` |
