# Lifecycle Configuration & Requirement Engine Sprint — Final Coverage & Closeout Audit v1

**Path:** `docs/sprints/05_2026/lifecycle_sprint_final_coverage_closeout_audit_v1.md`  
**Status:** Closeout audit (May 2026) — **no implementation in this pass**  
**Sprint completed:** Lifecycle alignment, information matrix, requirement engine foundation, action runtime audit, lifecycle action preflight, Pass A (Add Child), Pass B (Add Person), create-lead doctrine, TypeScript cleanup.

**Inputs:** `lifecycle_information_matrix_v1.md`, `adminv2_action_runtime_audit_and_plan_v1.md`, `pass_b_person_convergence_v1.md`, `lifecycleActionRequirementCatalog.ts`, migrations `20260602160000`–`20260602220000`, Settings hub + `configuration-system.md`.

---

## Executive summary

| Question | Answer |
|----------|--------|
| Can an operator complete **Lead → Qualification → Tour → Waitlist → Enrollment → Enrolled** today? | **Partially.** Core path works through **Tour** and **Approve enrollment → Enrolled**. **Waitlist** is the primary break (action inactive). **Qualification** entry is loose (person-only lead OK); fit data enforced later on tour/waitlist/approve. |
| Is lifecycle **requirement doctrine** fully enforced? | **Partial.** Seeded catalog + preflight cover four execute keys; transition rules + PATCH completion are parallel; doctrine fields (schedule/start on waitlist, qualification fit) are **not** fully hard-blocked. |
| Is action runtime **converged**? | **Partial.** Pass A/B converged child/person capture; many actions remain placement-dependent, task/create_task is weak, `move_to_waitlist` inactive, BOS/settings lifecycle authoring missing. |
| Ready to close this sprint? | **Yes** — foundation and convergence passes are done. **Next sprint** should open on **Runtime & Configuration Alignment** backlog below (P0 first). |

---

## Part 1 — Lifecycle Requirement Coverage Audit

### Legend

| Enforcement | Meaning |
|-------------|---------|
| **Requirement Engine** | `evaluateEffectiveRequirements` / `lifecycleActionRequirementCatalog` / `evaluateLifecycleActionRequirements` |
| **Modal Validation** | Submit-time in modal or form execute payload |
| **Lifecycle Preflight** | `LIFECYCLE_PREFLIGHT_ACTION_KEYS` → blocked execute + `ActionPreflightBlockedPanel` |
| **Status Transition Rule** | `status_transition_rules` + `validateStatusTransition` |
| **PATCH Completion** | `enforceOpportunityCompletionOnPatch` / layout bootstrap |
| **Not Enforced** | Doctrine only or partial UI |

| Coverage | Meaning |
|----------|---------|
| **Exists** | Reliable in production path |
| **Partial** | Some paths/surfaces; gaps vs doctrine |
| **Missing** | Not implemented |

### Lead (`new_inquiry`)

| Required information | Capture path | Enforcement | Runtime effect if missing | Settings ownership | Coverage |
|---------------------|--------------|-------------|---------------------------|-------------------|----------|
| Person (first + last name) | Create lead modal; form intake; API; manual | **Modal** + `executeCreateLeadAction` | Cannot create lead | Entry / Forms (future) | **Exists** |
| Phone or email | Same | **Modal** + execute | Cannot create lead | Entry / Forms | **Exists** |
| Work unit / location context | WU page context; opportunity PATCH; intake metadata | **Partial** — context on create, not required | Lead created without site | Work Units; Layouts | **Partial** |
| Source / campaign | Intake metadata; `source` on execute | **Not Enforced** on manual create | No block | Lifecycle / Forms | **Partial** |
| Child | Add Child modal (Pass A); intake; OCM | **Not Enforced** at lead | Lead valid; downstream actions block | Layouts (inquiry children) | **Partial** (by design) |
| Notes / first contact | `add_note`; activity | **Modal** (note body) | N/A | Actions | **Partial** |

**Advancement:** `move_to_qualification` — **Status transition rule** (`allowed_from: new_inquiry`); does **not** require child. **Runtime:** succeeds with person-only lead.

---

### Qualification (`qualification`)

| Required information | Capture path | Enforcement | Runtime effect if missing | Settings ownership | Coverage |
|---------------------|--------------|-------------|---------------------------|-------------------|----------|
| Child (≥1) | Add Child; intake; import | **Lifecycle Preflight** on `schedule_tour`, `move_to_waitlist`, `approve_enrollment` (not on entering qualification) | Blocked on those executes | Requirement Policies (future) | **Partial** |
| Program interest | Inquiry child inline; Add Child optional; intake | Same preflight (child+program) | Blocked on waitlist/tour execute | Layouts + Requirement Policies | **Partial** |
| Desired schedule | Inquiry child inline; intake | **Not Enforced** in catalog preflight | No block at qualification stage | Layouts | **Partial** |
| Desired start date | Inquiry child inline | **Not Enforced** in catalog | No block at qualification | Layouts | **Partial** |
| Person contact readiness | Create lead / Add Person (Pass B) | **Modal** on person capture | Cannot add person without phone/email | Fields / Relationships | **Exists** |
| Qualification status | `move_to_qualification` execute | **Transition rule** + handler → `qualification` | Cannot advance from wrong status | Statuses + Transition Rules (read-only UI) | **Exists** |

**Doctrine gap:** Child + program required **for confident fit** at qualification — enforced only when operator hits tour/waitlist/approve, not on `move_to_qualification`.

---

### Tour (`tour_scheduled`, `tour_completed`, `tour_no_show`, `follow_up_attempted`)

| Required information | Capture path | Enforcement | Runtime effect if missing | Settings ownership | Coverage |
|---------------------|--------------|-------------|---------------------------|-------------------|----------|
| Child + program | Add Child; inline OCM | **Lifecycle Preflight** `schedule_tour` (hard child+program; soft contact/tour datetime) | Execute blocked or recommendations only | Requirement Policies | **Partial** |
| Tour date + time | Tour schedule modal; `tour_bookings` API | **Modal** + booking service (not catalog hard-block on modal open) | Cannot complete booking without slot | Tour availability Settings | **Exists** |
| Tour outcome | Record tour outcome modal | **Lifecycle Preflight** + **Modal** on execute | Cannot complete outcome execute | Actions + Requirement Policies | **Exists** |
| Parent contact for reminders | Person / primary card | **Recommendation** in `schedule_tour` preflight | Execute may proceed | Fields | **Partial** |
| Active tour booking | Tour bar + bookings | Booking state at confirm/complete | Confirm/outcome gated by booking | Tour config | **Exists** |

**Dual path note:** Tour bar REST + registry actions share keys — **Partial** consolidation story.

---

### Waitlist (`waitlisted`)

| Required information | Capture path | Enforcement | Runtime effect if missing | Settings ownership | Coverage |
|---------------------|--------------|-------------|---------------------------|-------------------|----------|
| Child + program | Add Child; OCM | **Lifecycle Preflight** `move_to_waitlist` (handler exists) | Would block execute **if action were active** | Requirement Policies | **Partial** |
| Desired schedule | Inquiry child inline | **Not Enforced** in `move_to_waitlist` catalog | No preflight block | Layouts + Requirement Policies | **Missing** |
| Desired start date | Inquiry child inline | **Not Enforced** in catalog | No block | Layouts + Requirement Policies | **Missing** |
| Waitlist date | Auto on `move_to_waitlist` success | **Requirement Engine** auto-populate | Stamped when transition runs | Lifecycle metadata | **Exists** (code) |
| Priority / ranking inputs | Placement settings; queue UI | Queue orchestration (not lifecycle preflight) | Ranking only | Waitlist Ranking Policy | **Partial** |

**Critical:** `move_to_waitlist` **`action_definitions.is_active = false`** (stub seed only; no activation migration). Operator cannot run canonical waitlist transition from registry UI.

**Workaround:** Queue placement/orchestration may reflect waitlisted rows if status changed by other means — **not** a demo-grade canonical path.

---

### Enrollment (`enrolling`)

| Required information | Capture path | Enforcement | Runtime effect if missing | Settings ownership | Coverage |
|---------------------|--------------|-------------|---------------------------|-------------------|----------|
| Child + person link | Add Child; intake | **Lifecycle Preflight** `approve_enrollment` | Hard block + panel | Requirement Policies | **Exists** |
| Classroom | Inquiry child inline; assign focus actions | **Lifecycle Preflight** approve | Hard block | Layouts | **Exists** |
| Schedule | Inline OCM | **Lifecycle Preflight** approve | Hard block | Layouts | **Exists** |
| Start date | Inline OCM | **Lifecycle Preflight** approve | Hard block | Layouts | **Exists** |
| Primary person | Create lead; Add Person; household | **PATCH** bootstrap + approve context | Soft/hard depending on path | Relationships | **Partial** |
| Enrollment packet | Send/review packet modals | **Not Enforced** (policy deferred) | Approve allowed | Actions + Forms | **Partial** |

---

### Enrolled (`enrolled`)

| Required information | Capture path | Enforcement | Runtime effect if missing | Settings ownership | Coverage |
|---------------------|--------------|-------------|---------------------------|-------------------|----------|
| Enrollment date | `approve_enrollment` auto-populate | **Requirement Engine** + execute | Set on approve | Lifecycle metadata | **Exists** |
| Classroom / schedule / start | Prior stage / OCM | Validated before approve | N/A at enrolled | Layouts | **Exists** |
| Active relationships | Member/person links | Data model | Ongoing ops | Relationships | **Partial** |
| Full profile / billing | Person drawer; future billing | **Not Enforced** | No block | Fields / future modules | **Missing** |

---

### Cross-stage requirement engine map

| Mechanism | Stages covered | Coverage |
|-----------|----------------|----------|
| `LIFECYCLE_PREFLIGHT_ACTION_KEYS` | Tour execute, waitlist execute, approve | **Partial** (waitlist inactive) |
| `status_transition_rules` | Transitions (e.g. mark_lost reason) | **Partial** — read-only Settings |
| `enforceOpportunityCompletionOnPatch` | Field saves on opportunity/OCM | **Partial** — not lifecycle-stage-aware |
| Settings `requirement_policy` authoring | — | **Missing** (read-only guardrails catalog) |
| BOS `recommended_action_preflight` | When catalog maps to preflight key | **Partial** |

---

## Part 2 — Action Inventory Audit

**Scope:** Opportunity enrollment pipeline + platform surfaces visible in AdminV2. Sources: `action_definitions` migrations, `ACTION_BUTTON_LIBRARY`, `applyRegistryResolvedActionClient`, drawer shell, tour bar, BOS catalog, `adminv2_action_runtime_audit_and_plan_v1.md`.

### Inventory (canonical + high-traffic)

| Action key | Label (typical) | Runtime type | Placement | Status | Lifecycle stage(s) | Settings ownership | Notes |
|------------|-----------------|--------------|-----------|--------|-------------------|-------------------|-------|
| `create_lead` | Create lead | Capture First | WU right rail | **Working** | Lead (entry) | Actions | Person-only doctrine aligned (Pass B) |
| `move_to_qualification` | Move to qualification | Execute Now | Header / queue (gated) | **Working** | Lead → Qualification | Actions + Statuses | No child gate on transition |
| `mark_lost` | Mark lost | Open Modal → Execute | Overflow / queue | **Working** | All pre-enrolled | Actions | `lost_reason` required |
| `add_child` | Add child | Capture First | Inquiry section + shell | **Working** | Lead–Enrollment | Actions | Pass A convergence |
| `add_sibling` | Add sibling | Capture First | Inquiry section | **Working** | Lead–Enrollment | Actions | Same modal as add_child |
| `add_family_member` | Add person | Capture First | family_contacts section | **Working** | Lead–Enrollment | Actions | Pass B — `AddPersonModal` |
| `add_related_person` | Add person | Capture First | customer_booking (if layout) | **Working** | Lead–Enrollment | Actions | Same modal; legacy placement often off |
| `add_note` | Add note | Capture First | Overflow | **Working** | Universal | Actions | |
| `send_email` | Send email | Communication | Queue / optional header | **Working** | Universal | Actions | Quick Message |
| `send_sms` | Send SMS | Communication | Queue / optional | **Working** | Universal | Actions | |
| `call_parent` | Call | Communication | Optional | **Working** | Universal | Actions | tel: when phone present |
| `create_task` | Create task | Open Modal (weak) | Overflow | **Partial** | Universal | Actions | Opens tasks panel — **no create modal** |
| `send_form` | Send form | Communication | Settings-addable | **Working** | Universal | Actions | Not default header |
| `upload_document` | Upload document | Open Drawer | Optional | **Working** | Enrollment+ | Actions | Documents tab focus |
| `schedule_tour` | Schedule tour | Open Modal → Execute | Header menu / section | **Working** | Qualification, Tour, Waitlist | Actions + Tour Settings | Preflight on **execute** only |
| `reschedule_tour` | Reschedule tour | Open Modal | Header / tour bar | **Working** | Tour | Actions | Duplicate path with tour bar |
| `confirm_tour` | Confirm tour | Execute Now | Tour section / registry | **Working** | Tour | Actions | |
| `record_tour_outcome` | Record tour outcome | Open Modal → Execute | Header / tour bar | **Working** | Tour | Actions | Preflight on execute |
| `move_to_waitlist` | Move to waitlist | Execute Now | Catalog (intended header/section) | **Placeholder** | Qualification, Tour, Enrollment | Actions | **`is_active = false`** — handler + preflight exist |
| `approve_enrollment` | Approve enrollment | Execute Now | Header overflow (gated) | **Working** | Enrollment | Actions | Preflight + panel shipped |
| `send_enrollment_packet` | Send enrollment packet | Communication | Settings-addable | **Working** | Tour, Enrollment | Actions | |
| `review_enrollment_packet` | Review packet | Open Modal | Header overflow | **Working** | Enrollment | Actions | |
| `request_missing_information` | Request missing info | Communication | Section | **Working** | Enrollment | Actions | Alias to send_form |
| `assign_classroom` | Assign classroom | Open Record (focus) | Section (gated) | **Working** | Enrollment | Layouts + Actions | Scroll/focus only |
| `assign_schedule` | Assign schedule | Open Record (focus) | Section | **Working** | Enrollment | Layouts + Actions | |
| `set_start_date` | Set start date | Open Record (focus) | Section | **Working** | Enrollment | Layouts + Actions | |
| `reserve_spot` | Reserve spot | — | — | **Placeholder** | Enrollment | Actions | Inactive stub |
| `remove_from_waitlist` | Remove from waitlist | — | — | **Placeholder** | Waitlist | Actions | Catalog stub only |
| `reopen_lead` | Reopen lead | — | — | **Placeholder** | Lost | Actions | Catalog stub |
| `contact_family` | Contact family | — | — | **Missing** | Waitlist | Actions | Use send_email/sms |
| `mark_won` | Mark won | Execute Now | Removed | **Deprecated** | — | — | Use `approve_enrollment` |
| `qualify_opportunity` | Qualify | Execute Now | Removed | **Deprecated** | — | — | Use `move_to_qualification` |
| `quick_message` | Message | Communication | Queue | **Duplicate** | Universal | Actions | Prefer send_email/sms |
| `open_record` | Open | Open Drawer | Queue row | **Working** | Universal | Actions | |
| `ask_bos` | Work with BOS | Open Modal (assist) | Header primary | **Working** | Universal | Actions + BOS | Preflight read-only enrich |
| `view_needs_attention` | Needs attention | Open Record | Right rail | **Working** | Platform | Work Units / Attention | Not lifecycle-stage-scoped |
| `update_status_add_note` | Update status | Open Modal | Queue | **Partial** | Legacy | Actions | Header deactivated |
| `contact_attempted` | Log contact | Open Modal | Legacy org | **Deprecated** | — | — | |
| `start_quote` | Start quote | Open Drawer | Removed | **Deprecated** | — | — | Non-childcare |
| `create_inquiry` | Create inquiry | — | ui_intent | **Placeholder** | — | — | Alert only |
| **Tour bar** (hardcoded) | Confirm / reschedule / outcome | Mixed | Tour block | **Working** | Tour | — | Parallel to registry |
| **Shell chrome** | Add child / sibling | Capture First | Inquiry shell | **Working** | Lead–Enrollment | — | Converged to Pass A event |
| **complete_task** | Complete task | Execute Now | Operational strip | **Partial** | Universal | — | **Not in action_definitions** |
| **reschedule_task** | Reschedule | Open Modal | Comms popover | **Partial** | Universal | — | Hardcoded |
| **Inline PATCH** | Edit fields | Capture First | Layout | **Working** | All | Layouts | Completion on save subset |
| **Queue: adjust position** | Manual order | Execute Now | Waitlist queue UI | **Working** | Waitlist | Waitlist Ranking Policy | Not catalog action |
| **BOS catalog keys** | Varies | Communication / Execute | BOS band | **Partial** | Stage-specific signals | Attention SLA + BOS | Not all keys → active definitions |

### Action inventory summary

| Status | Count (approx.) | Examples |
|--------|-----------------|----------|
| Working | ~25 | create_lead, add_child, add_family_member, schedule_tour, approve_enrollment, comms |
| Partial | ~10 | create_task, send_form placement, dual tour paths, BOS handoff |
| Placeholder / inactive | ~5 | move_to_waitlist, reserve_spot, remove_from_waitlist, reopen_lead |
| Deprecated / duplicate | ~5 | mark_won, qualify_opportunity, quick_message |
| Not cataloged | ~3 | complete_task, reschedule_task, queue position |

---

## Part 3 — Runtime Alignment Backlog

### P0 — Must complete before demo

| ID | Item | Why |
|----|------|-----|
| P0-1 | **Activate `move_to_waitlist`** (`is_active`, placements on qualification/tour/enrollment) | Cannot complete doctrine path through Waitlist parking lot |
| P0-2 | **Verify end-to-end walkthrough** Lead → Qualification → Tour → Waitlist → Enrollment → Enrolled on pilot org | Proves sprint doctrine in one org |
| P0-3 | **`create_task` capture modal** (or task-assist create flow wired to registry) | Universal action demo weak — see **`task_system_audit_v1.md`** |
| P0-4 | **Default `send_form` placement** for pilot org (or documented Settings steps) | Operators cannot send forms if placement missing |
| P0-5 | **Align waitlist preflight with doctrine** (schedule + start date) OR document as post-demo policy | Prevents false confidence at waitlist |

### P1 — Lifecycle Runtime & Configuration Alignment Sprint

| ID | Item | Why |
|----|------|-----|
| P1-1 | **Requirement policy Settings authoring** (replace seeded catalog-only) | Operators cannot tune lifecycle gates |
| P1-2 | **Stage-scoped action placements** (condition_config / presets per status) | Reduces wrong-stage actions (e.g. approve too early) |
| P1-3 | **BOS ↔ requirement engine parity** (copy, `recommended_action_preflight`, blocked execute) | Single story for “why can’t I?” |
| P1-4 | **Qualification stage enforcement** (child+program before tour/waitlist — already partial; document vs harden at `move_to_qualification`) | Doctrine clarity |
| P1-5 | **`primary_person_id` sync** when adding Primary person role | Household/opportunity alignment |
| P1-6 | **Catalog `complete_task` / `reschedule_task`** or document as non-registry ops | Action system consistency |
| P1-7 | **Needs Attention lifecycle-awareness** (stage-specific reasons vs generic stale) | Attention SLA alignment |
| P1-8 | **Pass C–E from matrix** (send form polish, task modal, enrollment packet policy) | Closes capture gaps |
| P1-9 | **Status transition rules editable UI** (today read-only diagnostic) | Transition blockers configurable |
| P1-10 | **Remove / hide deprecated actions** from placements (`mark_won`, `qualify_opportunity`) | Operator confusion |

### P2 — Post-demo

| ID | Item |
|----|------|
| P2-1 | `remove_from_waitlist`, `contact_family`, `reopen_lead`, `reserve_spot` |
| P2-2 | Financial gates (deposit, waitlist fee) |
| P2-3 | Tour bar vs registry consolidation (optional) |
| P2-4 | Create lead modal: source, location, notes |
| P2-5 | Communication preference field + lifecycle rec |
| P2-6 | Full `record_actions` retirement |
| P2-7 | Packet-required org policy on approve |
| P2-8 | Per-stage work unit presentation CRUD (Config Management card) |

---

## Part 4 — Settings Readiness Audit

| Domain | Exists + Editable | Exists + Read Only | Missing | Notes for next sprint |
|--------|-------------------|--------------------|---------|------------------------|
| **Lifecycle statuses** | **Partial** — `/settings/statuses` labels/order | Transition targets in rules/workflows | Stage doctrine editor | `qualification` status shipped; tour substates in status_key not separate Settings “stages” |
| **Statuses (automation)** | Workflows UI | `status-transition-rules` diagnostic | Unified lifecycle config | Rules drive some blocks |
| **Work units & queues** | **Editable** — work-units, placement-priority | Queue definition JSON (advanced) | Per-stage WU wizard | Enrollment pipeline v2 converged; qualification WU exists in migrations |
| **Actions** | **Editable** — placements (surface, slot, section) | Definition catalog (global keys) | `condition_config` builder | Cannot create new handlers — placements only |
| **Layouts** | **Editable** — sections, field order, `field_placements_v1` | Integrity report | Lifecycle-specific layout presets | Requiredness on drawer_overview |
| **Fields** | **Editable** — labels, visibility, types | Opportunity/job requiredness de-emphasized in Fields UI | Lifecycle-required field set | Structure vs lifecycle gates split |
| **Requirement policies** | — | **Completion guardrails** panel (bootstrap catalog) | **Lifecycle requirement authoring** | Seeded TS catalog is runtime truth for preflight |
| **BOS configuration** | **Partial** — Attention SLA rules | BOS catalog keys in code | Map all signals → actions | `recommended_action_preflight` partial |
| **Forms & packets** | **Editable** — `/adminV2/forms` | — | Link forms to lifecycle requirements | Intake satisfies lead/child paths |
| **Tour availability** | **Editable** | — | — | Supports tour stage |
| **Relationships** | **Editable** | — | — | Person roles |
| **Entity labels** | **Editable** | — | — | Person vs Contact copy |

### Configuration vs code (next sprint leverage)

| Goal | Achievable via existing Settings | Requires new code |
|------|----------------------------------|-------------------|
| Show/hide actions per surface | **Yes** — action placements | Stage `condition_config` presets (partial today) |
| Change button labels | **Yes** — org placement label override | — |
| Change drawer required fields | **Yes** — `field_placements_v1` | Lifecycle evaluator must read same policies |
| Change lifecycle hard blocks on execute | **No** | Requirement policy UI + wire to `lifecycleActionRequirementCatalog` |
| Change transition allowed paths | **Partial** | Editable `status_transition_rules` UI |
| Change BOS next-step copy | **Partial** — attention rules | Catalog + preflight linkage |
| Activate waitlist button | **No** — migration/seed | `move_to_waitlist` `is_active = true` |

---

## Part 5 — Sprint Closeout Recommendation

### Close this sprint when

- [x] Lifecycle information matrix published  
- [x] Requirement engine foundation + preflight panel shipped  
- [x] Pass A (Add Child) and Pass B (Add Person) convergence shipped  
- [x] Create lead minimum doctrine aligned  
- [x] Action runtime audit + plan documented  
- [x] Full-repo TypeScript cleanup (per team statement)  
- [x] This closeout audit published  

### Do not close as “lifecycle complete”

Runtime alignment and Settings authoring for **lifecycle requirements** remain intentionally deferred.

### Recommended next sprint title

**Lifecycle Runtime & Configuration Alignment**

**Opening scope (ordered):**

1. P0 backlog (waitlist activation + demo walkthrough + task/form placements)  
2. P1 requirement policy authoring MVP (or documented seed edits per org)  
3. Stage-scoped placements + BOS/preflight copy parity  
4. Pass C/E from information matrix (comms + waitlist doctrine preflight)  

---

## Final answer — Operator journey

### Can a school operator complete the full lifecycle today?

| Stage transition | Can complete? | Blocker / caveat |
|------------------|---------------|------------------|
| **Lead** (create) | **Yes** | `create_lead` + WU modal |
| **Lead → Qualification** | **Yes** | `move_to_qualification` — person-only OK |
| **Qualification** (gather fit) | **Yes** (manual) | Add Child / inline OCM; no hard gate at entry |
| **Qualification → Tour** | **Yes** | `schedule_tour` + modal; child+program enforced on execute |
| **Tour** (complete visit) | **Yes** | Tour bar + `record_tour_outcome` |
| **Tour → Waitlist** | **No** (canonical) | **`move_to_waitlist` inactive** — primary gap |
| **Qualification → Waitlist** | **No** (canonical) | Same |
| **Waitlist → Enrollment** | **Partial** | Status/orchestration may exist; no `remove_from_waitlist` / offer-spot catalog |
| **Enrollment → Enrolled** | **Yes** | `approve_enrollment` active + preflight |
| **Enrolled** (steady state) | **Yes** | After approve; ongoing edit via layout |

### Verdict

**~80% of the happy path works** for a demo that **skips explicit Waitlist** (Qualification → Tour → Enrollment → Enrolled).

**A faithful six-stage walkthrough including Waitlist does not work** until **`move_to_waitlist` is activated** and placements exist.

### Exact gaps for next sprint opening scope

1. **`move_to_waitlist` inactive** in `action_definitions` (no activation migration).  
2. **Waitlist doctrine fields** (schedule, start date) not in preflight evaluator.  
3. **`create_task`** — panel only, not capture-first modal.  
4. **`send_form`** — capability exists; **placement not guaranteed** on header/section.  
5. **Requirement policies** — seeded code only; Settings read-only.  
6. **BOS** — signals exist; not fully consuming unified requirement violations for all stages.  
7. **Qualification** — no dedicated “fit complete” gate at stage entry (by current product choice).  
8. **Primary person** — adding primary role does not auto-set `opportunities.primary_person_id`.  
9. **Catalog stubs** — remove_from_waitlist, contact_family, reserve_spot, reopen_lead.  
10. **Task complete/reschedule** — outside action registry.

---

## References

| Doc | Path |
|-----|------|
| Information matrix | `lifecycle_information_matrix_v1.md` |
| Action runtime audit | `adminv2_action_runtime_audit_and_plan_v1.md` |
| Pass B | `pass_b_person_convergence_v1.md` |
| Design package | `lifecycle_configuration_requirements_design_package_v1.md` |
| Childcare doctrine | `childcare_lifecycle_matrix_v1.md` |
| Configuration system | `docs/system/configuration-system.md` |
| Preflight catalog | `web/lib/completion/lifecycleActionRequirementCatalog.ts` |
