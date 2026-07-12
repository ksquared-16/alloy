# Childcare Lifecycle Matrix v1

**Path:** `docs/sprints/archive/05_2026/childcare_lifecycle_matrix_v1.md`  
**Status:** Draft v1 (May 2026)  
**Scope:** Default childcare lead-to-enrollment lifecycle — statuses, actions, requirements, automations, and BOS guidance.

**Related:** [`alloy_operational_doctrine_v1.md`](./alloy_operational_doctrine_v1.md), [`action_button_lifecycle_alignment_audit.md`](./action_button_lifecycle_alignment_audit.md), [`docs/product/crm-system.md`](../../product/crm-system.md)

---

## Entry Events

Leads may enter through:

- Web form
- Phone call
- Walk-in
- Referral
- Marketing campaign
- Manual entry
- Import
- API

**Canonical action:** Create Lead

**Result:** Lifecycle status = New Lead

---

## Lifecycle Statuses

**Core lifecycle:**

1. New Lead
2. Qualification
3. Tour
4. Enrollment
5. Active

**Parking lot:**

- Waitlist

**Exit states:**

- Lost
- Withdrawn

---

## New Lead

**Purpose:** A lead has entered the system and needs initial contact.

**Universal actions:**

- Call Parent
- Send Email
- Send SMS
- Add Note
- Create Task
- Send Form

**Lifecycle actions:**

- Move to Qualification
- Mark Lost

**Requirements:**

- Parent first name
- Parent last name
- Phone or email

**BOS guidance:**

- New lead needs contact.
- No contact method found.
- No contact attempt logged.

---

## Qualification

**Purpose:** Gather enough information to determine fit and next step.

**Information gathered:**

- Child name
- Child age or DOB
- Desired start date
- Desired schedule
- Program interest
- Location interest

**Universal actions:**

- Call Parent
- Send Email
- Send SMS
- Add Note
- Create Task
- Send Form

**Lifecycle actions:**

- Schedule Tour
- Move to Waitlist
- Mark Lost

**Requirements:**

- Parent phone or email before outreach.
- Child name, age/DOB, desired start date, and desired schedule before confident fit assessment.

**BOS guidance:**

- Missing child age/program fit.
- Desired start date missing.
- No follow-up after qualification contact.

---

## Tour

**Purpose:** Family is evaluating the center.

**Universal actions:**

- Call Parent
- Send Email
- Send SMS
- Add Note
- Create Task

**Lifecycle actions:**

- Confirm Tour
- Reschedule Tour
- Record Tour Outcome
- Send Enrollment Packet
- Move to Waitlist
- Mark Lost

**Tour outcomes:**

- Enroll
- Waitlist
- Lost
- Follow-up Needed

**Follow-up Needed is not a lifecycle status.** It should create tasks and/or Needs Attention signals.

**Requirements:**

- Tour date and time before scheduling.
- Parent contact method before reminder workflow.

**Automations:**

- Send tour reminder.
- Create Needs Attention if tour date passes without outcome.
- Create follow-up task after no-show or follow-up-needed outcome.

**BOS guidance:**

- Tour tomorrow and not confirmed.
- Tour date passed with no outcome.
- No-show requires follow-up.

---

## Waitlist

**Purpose:** Family wants care but cannot currently be placed.

Waitlist is a parking-lot state, not a linear progression state.

**Universal actions:**

- Call Parent
- Send Email
- Send SMS
- Add Note
- Create Task

**Lifecycle actions:**

- Contact Family
- Schedule Tour
- Send Enrollment Packet
- Remove from Waitlist
- Mark Lost

**Financial actions:**

- Collect Waitlist Fee
- Waive Waitlist Fee

**Requirements:**

- Child age/program.
- Desired start date.
- Desired schedule.
- Location/program interest.

**Optional configurable policy:**

- Waitlist fee required before entering waitlist.
- Waitlist fee optional.
- Waitlist fee not used.

**Automations:**

- Create activity when moved to waitlist.
- Create Needs Attention when opening becomes available.
- Notify staff when family has been on waitlist beyond configured threshold.

**BOS guidance:**

- Opening available for this age/program.
- Family has not been contacted after opening.
- Waitlist fee unpaid if policy requires fee.

---

## Enrollment

**Purpose:** Family is proceeding toward enrollment and school is validating paperwork, placement, schedule, and financial requirements.

**Universal actions:**

- Call Parent
- Send Email
- Send SMS
- Add Note
- Create Task
- Upload Document

**Lifecycle actions:**

- Send Enrollment Packet
- Review Enrollment Packet
- Request Missing Information
- Approve Enrollment
- Move to Waitlist
- Mark Lost

**Placement actions:**

- Reserve Spot
- Assign Classroom
- Assign Schedule
- Set Start Date

**Financial actions:**

- Collect Registration Fee
- Waive Registration Fee
- Collect Deposit
- Record Deposit

**Requirements before approving enrollment:**

- Required paperwork submitted and approved.
- Classroom assigned.
- Schedule assigned.
- Start date set.
- Parent/guardian contact exists.
- Child identity exists.

**Configurable policies:**

- Registration fee required or optional.
- Deposit required or optional.
- Required paperwork varies by customer/location/program.
- Activation policy may vary by customer.

**Automations:**

- Set enrollment date = today when enrollment is approved, unless customer policy differs.
- Create enrollment approval activity.
- Create start-date readiness task.
- Trigger welcome/enrollment communications if configured.

**BOS guidance:**

- Enrollment packet incomplete.
- Paperwork submitted but not reviewed.
- Classroom missing.
- Schedule missing.
- Start date missing.
- Deposit unpaid where required.
- Registration fee unpaid where required.

---

## Active

**Purpose:** Child has started care and the lead-to-enrollment lifecycle is complete.

**Activation policy is customer-configurable:**

- Activate on start date.
- Activate on first attendance.
- Activate manually.
- Hybrid policy.

**Universal actions:**

- Add Note
- Create Task
- Send Email
- Send SMS
- Upload Document

**Lifecycle actions:**

- Withdraw Child

**Requirements:**

- Start date.
- Classroom.
- Schedule.
- Program/location.

**Automations:**

- Move to active based on configured activation policy.
- Create activity when child becomes active.
- Notify staff when active child is missing readiness items.

**BOS guidance:**

- Child start date arrived but not active.
- First attendance recorded but status not active.
- Active child missing schedule/classroom.

---

## Lost

**Purpose:** Lead/opportunity closed before enrollment/activation.

**Actions:**

- Reopen Lead
- Add Note

**Required:**

- Lost reason.

**Examples:**

- No response
- Chose competitor
- No availability
- Moved
- Not interested

---

## Withdrawn

**Purpose:** Previously enrolled/active child exited care.

**Actions:**

- Reopen/Re-enroll if allowed
- Add Note
- Create Task

**Required:**

- Withdrawal date
- Withdrawal reason

**Examples:**

- Family moved
- Aged out
- Schedule no longer needed
- Non-payment
- Transferred

---

## Matrix status → Alloy status key (reference mapping)

Use this table when aligning seeds, queues, and action conditions. Matrix labels are operator-facing; Alloy may use finer execution status keys until a consolidation pass.

| Matrix lifecycle | Matrix label | Current Alloy `status_key` (enrollment pipeline) | Notes |
|------------------|--------------|--------------------------------------------------|-------|
| New Lead | New Lead | `new_inquiry` | Label often "New Inquiry" in CRM |
| Qualification | Qualification | `qualification` | Canonical lifecycle status (Phase 1B — `20260602180000`) |
| *(legacy)* | Contact attempted | `contact_attempted` | Retained for historical records; not lifecycle doctrine |
| Tour | Tour | `tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted` | Execution substates should not become permanent statuses per doctrine |
| Enrollment | Enrollment | `enrolling` | |
| Waitlist | Waitlist | `waitlisted` | Parking lot |
| Active | Active | `enrolled` | Child activation may lag status |
| Lost | Lost | `lost` | |
| Withdrawn | Withdrawn | *(person / member scope)* | Not modeled as opportunity status today |
