# Lifecycle Information Matrix v1

**Path:** `docs/sprints/archive/05_2026/lifecycle_information_matrix_v1.md`  
**Status:** Product/system matrix (May 2026) — guides implementation after Pass A  
**Scope:** Childcare enrollment pipeline — information requirements, capture surfaces, actions, BOS, and demo gaps.

**Doctrine spine:** Lead → Qualification → Tour → Waitlist → Enrollment → Enrolled  
*(Parking lot: **Waitlist** can attach from Qualification or Tour. Exit: **Lost**, **Withdrawn**.)*

**Related:**

- [`childcare_lifecycle_matrix_v1.md`](./childcare_lifecycle_matrix_v1.md) — status/action doctrine
- [`lifecycle_configuration_requirements_design_package_v1.md`](./lifecycle_configuration_requirements_design_package_v1.md) — requirement engine
- [`adminv2_action_runtime_audit_and_plan_v1.md`](./adminv2_action_runtime_audit_and_plan_v1.md) — action runtime taxonomy
- [`canonical_action_catalog_v1.md`](./canonical_action_catalog_v1.md) — action vocabulary
- **Pass A shipped:** Add Child capture-first convergence (`AddInquiryChildModal`, `submitAddInquiryChildFromDrawer`)

---

## How to read this matrix

### Status mapping (operator label → Alloy `status_key`)

| Operator stage | Primary `opportunities.status_key` values | Notes |
|----------------|-------------------------------------------|--------|
| **Lead** | `new_inquiry` | Often labeled “New inquiry” in CRM |
| **Qualification** | `qualification` | Replaces legacy `contact_attempted` for new work |
| **Tour** | `tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted` | Substates — not separate lifecycle “stages” in Settings |
| **Waitlist** | `waitlisted` | Parking-lot; child grain may differ on waitlist queues |
| **Enrollment** | `enrolling` | Pre-approval paperwork/placement |
| **Enrolled** | `enrolled` | Case-level enrolled; per-child truth also on OCM/member |

**Grain note:** `opportunities` = household **case** (tours, comms, forms). **`opportunity_customer_members`** = per-child enrollment fields and optional `outcome_status_key`. Do not assume one case status equals every child’s state.

### Requirement legend

| Symbol | Meaning |
|--------|---------|
| **R** | Required — hard block before transition or execute-now action |
| **Rec** | Recommended — non-blocking; BOS or completion preview |
| **Auto** | System stamps on successful action/transition |
| **Exists** | Modeled or enforced in product today (layout, handler, or evaluator) |
| **Partial** | Some surfaces/rules; not unified or not visible everywhere |
| **Missing** | Doctrine expects; not implemented or stub only |

### Action runtime kinds (do not blur)

| Kind | When to use | Preflight at click? |
|------|-------------|---------------------|
| **Capture-first** | Operator must enter data (modal, inline layout, composer) | **No** — validate on submit/save |
| **Execute-now** | One-click transition or booking API when gates pass | **Yes** — `evaluateEffectiveRequirements` + `ActionPreflightBlockedPanel` |

**Current execute-now preflight keys:** `approve_enrollment`, `move_to_waitlist`, `schedule_tour` (execute path), `record_tour_outcome`.  
**Not preflight:** `add_child`, `add_family_member`, `create_lead`, `send_form`, `create_task`, `mark_lost` (modal/form).

---

## Lead

**Alloy status:** `new_inquiry`

### Purpose

Capture the initial inquiry and minimum household/contact context so staff can respond and advance the family into qualification.

### Required information

| Information | R / Rec | Exists today | Where captured / shown |
|-------------|---------|--------------|----------------------|
| Primary contact (person + link to customer) | **R** | **Exists** | `create_lead` execute; family/primary person panels; opportunity `primary_person_id` |
| Parent first + last name | **R** | **Exists** | Create lead modal / intake |
| Phone **or** email | **R** | **Exists** | Create lead; contact channels row |
| Location / site / work unit context | **R** | **Partial** | Opportunity location + WU assignment; not always required on create |
| At least one inquiry child | **Rec** | **Partial** | **Not required** to create lead; **required** before waitlist/tour/approve per downstream gates |
| Inquiry source / campaign | **Rec** | **Partial** | Metadata/forms depending on intake path |

**Product expectation:** A **lead can exist with only parent identity**; child is added early via **Add Child** (Pass A) or intake form, but lifecycle advancement actions will block until child + program exist.

### Recommended information

| Information | Exists | Notes |
|-------------|--------|-------|
| Child DOB or age group | **Partial** | Add Child modal (Pass A); inline inquiry children |
| Program interest | **Partial** | Child row / OCM `desired_program_type` |
| Communication preference | **Missing** | No dedicated field gate |
| Notes / first contact logged | **Partial** | `add_note`; activity timeline |

### Information shown in drawer layout

| Surface | Exists |
|---------|--------|
| Header: Work with BOS + Actions menu | **Exists** |
| Inquiry summary / attention strip | **Exists** |
| Family contacts | **Exists** |
| Inquiry children section (shell + rows) | **Exists** |
| Tour block | **Exists** (often empty) |
| Documents / comms tabs | **Exists** |

### Capture-first actions

| Action | Exists | Opens / captures |
|--------|--------|------------------|
| **Create lead** (`create_lead`) | **Exists** | Create lead flow (right rail / open_form) |
| **Add child** (`add_child` / `add_sibling`) | **Exists** (Pass A) | `AddInquiryChildModal` — all entry points converged |
| **Add contact** (`add_family_member`, `add_related_person`) | **Exists** | Add family / related person modals |
| **Send form** (`send_form`) | **Exists** | `SendFormToOpportunityModal` |
| **Create task** (`create_task`) | **Partial** | Opens tasks panel; **no dedicated create modal** |
| **Send email / SMS** (`send_email`, `send_sms`) | **Exists** | Quick Message composer |
| **Add note** (`add_note`) | **Exists** | Add note modal |

### Execute-now actions

| Action | Exists | Preflight | Notes |
|--------|--------|-----------|-------|
| **Move to qualification** (`move_to_qualification`) | **Exists** | No (transition rules) | From `new_inquiry` only (placement + rules) |
| **Mark lost** (`mark_lost`) | **Exists** | No | Modal → `lost_reason` required |

### Transition / advancement requirements

| Transition | Required before advance | Enforced today |
|------------|-------------------------|----------------|
| → `qualification` | Parent identity; allowed from `new_inquiry` | **Exists** (`status_transition_rules` + handler) |
| → `lost` | `lost_reason` | **Exists** |

### Auto-populated fields

| Field | Trigger | Exists |
|-------|---------|--------|
| Opportunity `status_key` = `new_inquiry` | `create_lead` | **Exists** |
| Person + customer links | `create_lead` | **Exists** |

### BOS reminders / recommendations

| Signal / template | Exists | Typical guidance |
|-------------------|--------|------------------|
| `stale_new_inquiry` | **Exists** | First outreach; missing contact attempt |
| Initial outreach / follow-up comms objectives | **Exists** | Maps to `send_email` / `send_sms` |

### Demo readiness gaps

| Gap | Priority |
|-----|----------|
| Create task opens panel only, not a form | P1 |
| Child not required at lead creation (by design) — operators must understand Add Child is next step | Doc/training |
| Inquiry source not unified in layout | P2 |

---

## Qualification

**Alloy status:** `qualification`

### Purpose

Determine whether the family is a viable enrollment candidate and gather enough child/program/schedule context to schedule a tour or waitlist.

### Required information

| Information | R / Rec | Exists | Where |
|-------------|---------|--------|-------|
| ≥1 child on inquiry | **R** | **Exists** | Inquiry children section; evaluator for later actions |
| Program interest per child | **R** | **Partial** | OCM `desired_program_type` / `program_room_cohort_key`; Add Child optional fields |
| Desired schedule | **R** | **Partial** | OCM `desired_schedule_type`; inline edit |
| Desired start date | **R** | **Partial** | OCM `desired_start_date`; inline edit |
| Parent phone or email | **R** | **Exists** | Contacts; completion bootstrap |
| Qualification status reached | **R** | **Exists** | `status_key` = `qualification` |

### Recommended information

| Information | Exists | Notes |
|-------------|--------|-------|
| Location / site alignment | **Partial** | Opportunity + child `location_id` |
| Budget / tuition fit | **Missing** | Not in enrollment MVP schema |
| Subsidy / employee indicator | **Partial** | Person/household metadata where configured |
| Notes from contact attempts | **Partial** | Activity + `add_note` |

### Information shown in drawer layout

| Surface | Exists |
|---------|--------|
| Inquiry children (primary data entry) | **Exists** |
| Family contacts | **Exists** |
| Assign classroom / schedule / start date focus actions | **Exists** (`ui_intent` → scroll to child fields) |
| BOS attention (missing child/program/start) | **Partial** |

### Capture-first actions

| Action | Exists | Notes |
|--------|--------|-------|
| **Add child** / **Add sibling** | **Exists** | Pass A modal |
| **Add contact** | **Exists** | `family_contacts` section placement |
| **Send form** | **Exists** | Settings-addable |
| **Schedule tour** | **Exists** | **Capture-first at click** → tour schedule modal |
| **Create task** | **Partial** | Panel only |
| **Send email / SMS / call** | **Exists** | Universal comms |

### Execute-now actions

| Action | Exists | Preflight | Notes |
|--------|--------|-----------|-------|
| **Move to waitlist** | **Partial** | **Yes** (code) | Definition often **inactive** in DB — activation needed |
| **Mark lost** | **Exists** | No | |

### Transition / advancement requirements

| Transition | Required | Enforced |
|------------|----------|----------|
| → `tour_scheduled` | Child + program; tour slot; contact for reminders | **Partial** (booking + transition rules) |
| → `waitlisted` | Child + program (catalog); start/schedule in doctrine | **Partial** (preflight child+program only today) |
| → `lost` | `lost_reason` | **Exists** |

### Auto-populated fields

| Field | Trigger | Exists |
|-------|---------|--------|
| `status_key` → `qualification` | `move_to_qualification` | **Exists** |

### BOS reminders / recommendations

| Signal | Exists |
|--------|--------|
| Missing child age/program fit | **Partial** (completion preview) |
| Desired start date missing | **Partial** |
| Follow-up after qualification contact | **Partial** |

### Demo readiness gaps

| Gap | Priority |
|-----|----------|
| `move_to_waitlist` not active in menu | P0 |
| Schedule tour: preflight should not block opening modal (only execute) — document in training | P0 |
| Hard block schedule/start/schedule before tour not in single evaluator pass | P1 |
| Financial/subsidy fields | P2 |

---

## Tour

**Alloy status:** `tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted` (substates)

### Purpose

Schedule and complete a center visit; record outcome and decide next step (enrollment path, waitlist, lost, or follow-up task).

### Required information

| Information | R / Rec | Exists | Where |
|-------------|---------|--------|-------|
| ≥1 child | **R** | **Exists** | Inquiry children |
| Program interest | **R** | **Exists** | OCM fields |
| Tour date + time | **R** | **Exists** | `tour_bookings` + schedule modal; metadata mirror |
| Active tour booking | **R** | **Exists** | Tour bar / bookings API |
| Tour outcome before terminal complete | **R** | **Exists** | `record_tour_outcome` preflight + modal |
| Parent contact for reminders | **Rec** | **Partial** | Transition/comms rules |

### Recommended information

| Information | Exists |
|-------------|--------|
| Assigned staff / guide | **Partial** |
| Tour confirmation state | **Exists** (`confirm_tour`) |
| Follow-up task after no-show | **Partial** (manual task) |
| Notes | **Exists** |

### Information shown in drawer layout

| Surface | Exists |
|---------|--------|
| Tour booking lifecycle bar | **Exists** |
| Tour date block (inquiry) | **Exists** |
| Inquiry children + contacts | **Exists** |

### Capture-first actions

| Action | Exists | Notes |
|--------|--------|-------|
| **Schedule tour** / **Reschedule tour** | **Exists** | `OpportunityTourScheduleActionModal` |
| **Record tour outcome** | **Exists** | Outcome modal → execute |
| **Send form** / **Send enrollment packet** | **Exists** | |
| **Create task** | **Partial** | |
| **Send follow-up** (email/SMS) | **Exists** | Comms |

### Execute-now actions

| Action | Exists | Preflight | Notes |
|--------|--------|-----------|-------|
| **Confirm tour** | **Exists** | No | Booking API |
| **Record tour outcome** (after modal submit) | **Exists** | **Yes** | Outcome required |
| **Move to waitlist** | **Partial** | **Yes** | DB activation |
| **Approve enrollment** | **Exists** | **Yes** | Usually wrong stage; placement-gated |

### Transition / advancement requirements

| Transition / outcome | Required | Enforced |
|----------------------|----------|----------|
| Schedule tour | Slot + child + program | **Partial** |
| Complete tour | Outcome enum | **Exists** |
| Follow-up needed | **Not a status** — task/BOS | **Partial** |

### Auto-populated fields

| Field | Trigger | Exists |
|-------|---------|--------|
| `tour_completed_date` (metadata) | Completed outcome | **Exists** (booking integration) |
| Case status updates per outcome | Outcome execute | **Partial** |

### BOS reminders / recommendations

| Signal | Exists |
|--------|--------|
| `tour_date_passed` | **Exists** |
| Tour tomorrow / not confirmed | **Partial** |
| No-show requires follow-up | **Partial** |

### Demo readiness gaps

| Gap | Priority |
|-----|----------|
| Dual paths: tour bar REST vs registry (aligned keys, two UIs) | P1 accept |
| Follow-up needed not a first-class status | P2 |
| Approve enrollment visible too early without stage-scoped placements | P1 |

---

## Waitlist

**Alloy status:** `waitlisted`  
**Parking lot** — not strictly linear after Tour; families may enter from Qualification or Tour.

### Purpose

Track a qualified family waiting for capacity; maintain ranking/position truth and outreach when spots open.

### Required information

| Information | R / Rec | Exists | Where |
|-------------|---------|--------|-------|
| ≥1 child | **R** | **Exists** | Inquiry children |
| Program / cohort interest | **R** | **Exists** | OCM; placement candidate |
| Desired schedule | **R** (doctrine) | **Partial** | OCM; not in `move_to_waitlist` preflight yet |
| Desired start date | **R** (doctrine) | **Partial** | OCM inline |
| Waitlist date | **R** | **Partial** | `waitlist_date` metadata auto on execute |
| Location / site | **R** (doctrine) | **Partial** | Opportunity + child location |

### Recommended information

| Information | Exists |
|-------------|--------|
| Priority factors (employee/sibling/subsidy) | **Partial** | Placement priority settings V2 |
| Manual queue position | **Exists** | Waitlist queue UI |
| Waitlist fee policy | **Missing** | Catalog only |

### Information shown in drawer layout

| Surface | Exists |
|---------|--------|
| Inquiry children (placement fields) | **Exists** |
| Waitlist queue row (workspace) | **Exists** |
| Placement priority presentation | **Exists** |

### Capture-first actions

| Action | Exists | Notes |
|--------|--------|-------|
| **Adjust position** (queue UI) | **Exists** | Manual order controls — not canonical `action_definitions` |
| **Send communication** | **Exists** | Email/SMS/form |
| **Create task** | **Partial** | |
| **Schedule tour** (re-engage) | **Exists** | |
| **Add child** / **Add contact** | **Exists** | |

### Execute-now actions

| Action | Exists | Preflight | Notes |
|--------|--------|-----------|-------|
| **Move to waitlist** | **Partial** | **Yes** | Handler + `waitlist_date`; **def inactive** |
| **Remove from waitlist** | **Missing** | — | Catalog stub |
| **Offer spot** / **Move to enrollment** | **Partial** | Queue/BOS driven; no single catalog execute |

### Transition / advancement requirements

| Transition | Required | Enforced |
|------------|----------|----------|
| Enter waitlist | Child + program (preflight) | **Partial** |
| Exit waitlist → `enrolling` | Placement + enrollment fields | **Partial** |

### Auto-populated fields

| Field | Trigger | Exists |
|-------|---------|--------|
| `waitlist_date` | `move_to_waitlist` success | **Exists** (execute layer) |
| Placement candidate rows | Waitlist transition / orchestration | **Exists** |

### BOS reminders / recommendations

| Signal | Exists |
|--------|--------|
| Opening available | **Partial** |
| Long time on waitlist | **Partial** |
| Contact family (`contact_family`) | **Missing** action |

### Demo readiness gaps

| Gap | Priority |
|-----|----------|
| `move_to_waitlist` activation + menu placement | P0 |
| Preflight vs doctrine mismatch (schedule/start not in catalog preflight) | P1 |
| Offer spot / remove from waitlist not in registry | P1 |
| Waitlist fee actions missing | P2 |

---

## Enrollment

**Alloy status:** `enrolling`

### Purpose

Finalize placement, paperwork, and contacts before confirmed enrolled status.

### Required information

| Information | R / Rec | Exists | Where |
|-------------|---------|--------|-------|
| ≥1 child | **R** | **Exists** | Inquiry children |
| Primary contact / guardian | **R** | **Exists** | Family contacts; completion bootstrap |
| Classroom (`program_room_cohort_key`) | **R** | **Exists** | Child row; **approve** preflight |
| Schedule (`desired_schedule_type`) | **R** | **Exists** | Child row; **approve** preflight |
| Start date (`desired_start_date`) | **R** | **Exists** | Child row; **approve** preflight |
| Child linked to person (`person_id`) | **R** | **Exists** | **approve** preflight |
| Enrollment packet reviewed (policy) | **Rec** | **Partial** | Packet review modal; policy deferred |

### Recommended information

| Information | Exists |
|-------------|--------|
| Packet / form completion status | **Partial** |
| Registration fee / deposit | **Missing** |
| Emergency contacts | **Partial** (related persons) |
| Documents uploaded | **Partial** |

### Information shown in drawer layout

| Surface | Exists |
|---------|--------|
| Inquiry children (placement columns) | **Exists** |
| Packet review / send packet actions | **Exists** |
| Documents tab | **Exists** |
| `review_enrollment_packet` overflow action | **Exists** |

### Capture-first actions

| Action | Exists | Notes |
|--------|--------|-------|
| **Send enrollment packet** | **Exists** | Modal |
| **Review enrollment packet** | **Exists** | Packet review |
| **Request missing information** | **Exists** | Opens send form |
| **Assign classroom / schedule / start date** | **Exists** | Focus child fields |
| **Add child** / **Add contact** | **Exists** | |
| **Upload document** | **Exists** | Documents tab |
| **Create task** | **Partial** | |

### Execute-now actions

| Action | Exists | Preflight | Notes |
|--------|--------|-----------|-------|
| **Approve enrollment** | **Exists** | **Yes** | → `enrolled`; `ActionPreflightBlockedPanel` |
| **Move to waitlist** | **Partial** | **Yes** | |
| **Mark lost** | **Exists** | No | |
| **Reserve spot** | **Missing** | — | Stub |

### Transition / advancement requirements

| Transition | Required | Enforced |
|------------|----------|----------|
| → `enrolled` | Classroom, schedule, start, child identity, primary contact | **Exists** (evaluator + bootstrap) |
| Packet approved | **Rec** (policy) | **Deferred** |

### Auto-populated fields

| Field | Trigger | Exists |
|-------|---------|--------|
| `enrollment_date` | `approve_enrollment` | **Exists** |
| Child enrollment dates | Approve success path | **Exists** (stamp if blank) |

### BOS reminders / recommendations

| Signal | Exists |
|--------|--------|
| Packet incomplete | **Partial** |
| Classroom / schedule / start missing | **Exists** (preflight + completion) |
| Deposit/fee unpaid | **Missing** |

### Demo readiness gaps

| Gap | Priority |
|-----|----------|
| Approve preflight + panel — **demo-ready** | — |
| Financial gates | P2 |
| `reserve_spot` | P2 |
| Packet required policy not configurable | P1 |

---

## Enrolled

**Alloy status:** `enrolled`  
**Operator label:** Active / Enrolled

### Purpose

Confirmed enrolled family; child lifecycle may continue on member records; operations shift to ongoing care and profile completeness.

### Required information

| Information | R / Rec | Exists | Where |
|-------------|---------|--------|-------|
| Enrollment date | **R** | **Exists** | Opportunity metadata |
| Classroom, schedule, start date | **R** | **Exists** | OCM + child status |
| Active child / person relationships | **R** | **Partial** | Member + person links |
| Program / location | **R** | **Exists** | OCM fields |

### Recommended information

| Information | Exists |
|-------------|--------|
| Full profile completion | **Partial** |
| Communication preferences | **Partial** |
| Billing setup | **Missing** (later module) |

### Information shown in drawer layout

| Surface | Exists |
|---------|--------|
| Inquiry children (read-mostly) | **Exists** |
| Person drawer from child row | **Exists** |
| Documents / comms history | **Exists** |

### Capture-first actions

| Action | Exists |
|--------|--------|
| **View / edit child** (inline + person drawer) | **Exists** |
| **View / edit contact** | **Exists** |
| **Send communication** | **Exists** |
| **Create task** | **Partial** |
| **Add note** / **Upload document** | **Exists** |

### Execute-now actions

| Action | Exists | Notes |
|--------|--------|-------|
| **Withdraw child** | **Missing** | Catalog stub |
| Status changes | **Partial** | Child/member lifecycle APIs |

### Transition / advancement requirements

| Transition | Required | Enforced |
|------------|----------|----------|
| Activation policies (start date vs attendance) | **Rec** | **Partial** / config |

### Auto-populated fields

| Field | Trigger | Exists |
|-------|---------|--------|
| `enrollment_date` | Approve (prior stage) | **Exists** |

### BOS reminders / recommendations

| Signal | Exists |
|--------|--------|
| Start date arrived not active | **Partial** |
| Active child missing schedule/classroom | **Partial** |

### Demo readiness gaps

| Gap | Priority |
|-----|----------|
| Withdraw / reopen flows | P2 |
| Billing | Out of scope |

---

## Exit states (brief)

| Stage | Status | Required | Key actions | Exists |
|-------|--------|----------|-------------|--------|
| **Lost** | `lost` | `lost_reason` | `mark_lost`, `reopen_lead` (stub) | Mark lost **Exists** |
| **Withdrawn** | `withdrawn` / member withdrawn | Date + reason | `withdraw_child` | **Missing** |

---

## Cross-stage summary tables

### What exists vs missing (information)

| Information domain | Exists | Missing |
|------------------|--------|---------|
| Parent identity + contact | **Exists** | — |
| Inquiry children + OCM placement fields | **Exists** | — |
| Tour bookings SoT | **Exists** | — |
| Waitlist placement + queue position | **Exists** | Fee policy |
| Unified requirement evaluator | **Partial** | Settings authoring for rules |
| Financial gates | — | Registration/deposit/waitlist fee |
| Employee ID conditional required | — | Person conditional policy |
| Per-stage action visibility in Settings | **Partial** | Stage-scoped placement presets |

### Capture-first vs execute-now (by action)

| Action | Stage(s) | Mode | Preflight |
|--------|----------|------|-----------|
| Add child / sibling | Lead → Enrollment | Capture-first | No |
| Add contact | Lead → Enrollment | Capture-first | No |
| Create lead | Entry | Capture-first | No |
| Send form / packet / note | Universal | Capture-first | No |
| Schedule / reschedule tour | Qualification, Tour, Waitlist | Capture-first (open modal) | On execute only |
| Record tour outcome | Tour | Capture-first modal → execute | On execute |
| Move to qualification | Lead | Execute-now | No |
| Move to waitlist | Qualification, Tour | Execute-now | **Yes** |
| Approve enrollment | Enrollment | Execute-now | **Yes** |
| Mark lost | Multi | Modal → execute | No |
| Confirm tour | Tour | Execute-now | No |

### Hard blockers vs recommended (target policy)

| Gate | Hard today | Should be |
|------|------------|-----------|
| Approve enrollment fields | **Hard** | **Hard** |
| Move to waitlist child+program | **Hard** | **Hard**; add schedule/start per doctrine |
| Record tour outcome | **Hard** | **Hard** |
| Schedule tour date/time | **Partial** | **Hard** on booking create |
| Create lead parent+contact | **Hard** | **Hard** |
| Add child name + DOB/age | **Hard** (modal) | **Hard** |
| Primary contact on opportunity | **Partial** | **Hard** before approve |
| Packet approved | — | **Rec** or org policy |
| Comms preference | — | **Rec** |

---

## Recommended next implementation order

**Pause broad action-by-action work.** Use this matrix to drive **stage-complete slices** that align information, capture surfaces, execute gates, and BOS.

| Order | Pass | Focus | Delivers |
|-------|------|-------|----------|
| **0** | ✅ **Pass A** | Add Child convergence | Capture-first child; persistence; no preflight |
| **1** | ✅ **Pass B** | Person convergence | **`AddPersonModal`**; household + opportunity link; create-lead doctrine — **`pass_b_person_convergence_v1.md`** |
| **2** | **Pass C** | Communication demo | **Send form** placement + composer polish; optional email/SMS defaults |
| **3** | **Pass D** | Task surface | **Create task** modal; optional complete/reschedule catalog alignment |
| **4** | **Pass E** | Waitlist activation | Activate `move_to_waitlist`; extend preflight to match doctrine (schedule/start); header placement |
| **5** | **Pass F** | Qualification → Tour gates | Unify schedule-tour requirements (modal recommended vs execute hard); stage-scoped action visibility |
| **6** | **Pass G** | Enrollment policy | Optional packet-required org policy; BOS copy ↔ `action_preflight` parity |
| **7** | **Pass H** | Waitlist operations | `remove_from_waitlist`, `contact_family`, offer-spot handoff to enrollment |
| **8** | **Pass I** | Settings authoring | `requirement_policy` + transition rules UI (from design package Phase 2+) |

### Per-pass matrix columns to update

When a pass ships, update the **Exists** column and **Demo readiness gaps** for affected stages — do not fork a second matrix.

### BOS alignment rule

For each new execute-now action: add catalog preflight → `recommended_action_preflight` on drawer scan → same field labels as `ActionPreflightBlockedPanel` and inquiry-child focus actions.

---

## References (code & config)

| Area | Location |
|------|----------|
| Lifecycle preflight catalog | `web/lib/completion/lifecycleActionRequirementCatalog.ts` |
| Add child submit | `web/lib/admin/actions/submitAddInquiryChildFromDrawer.ts` |
| Blocked panel | `web/components/admin/opportunity/ActionPreflightBlockedPanel.tsx` |
| BOS catalog | `web/lib/adminV2/bos/recommendations/catalog/operationalRecommendationCatalog.ts` |
| Action runtime audit | `docs/sprints/archive/05_2026/adminv2_action_runtime_audit_and_plan_v1.md` |
