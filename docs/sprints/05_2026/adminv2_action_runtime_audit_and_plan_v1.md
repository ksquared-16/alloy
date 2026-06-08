# AdminV2 Action Runtime — Audit & Implementation Plan v1

**Path:** `docs/sprints/05_2026/adminv2_action_runtime_audit_and_plan_v1.md`  
**Status:** Audit + plan (no broad implementation in this pass)  
**Date:** 2026-05-31  
**Builds on:** `lifecycle_configuration_requirements_design_package_v1.md`, `canonical_action_catalog_v1.md`, `configured_drawer_actions_fix.md`, runtime preflight slice (`evaluateEffectiveRequirements`, `ActionPreflightBlockedPanel`)

---

## Executive summary

The **first vertical slice** (lifecycle preflight + blocked drawer panel) is proven for **`approve_enrollment`** and extended in code to **`move_to_waitlist`**, **`record_tour_outcome`**, and **`schedule_tour`** (evaluator only for the latter’s recommended fields).

This pass widens scope: **every AdminV2 operator action** should be classifiable by **runtime kind**, answer the five product questions, and use the **requirement engine only where execute-without-capture is the intent**.

**Doctrine:** Preflight-blocked execute ≠ “open modal to gather inputs.” Do not force `approve_enrollment` semantics onto `add_child` or `send_form`.

---

## Runtime taxonomy

### `ActionRuntimeKind` (product model)

| Kind | Meaning | Requirement preflight? | Typical UX |
|------|---------|------------------------|------------|
| `execute_now` | Mutate immediately when clicked | **Yes** when business gates exist before write | Execute API → row update / booking API |
| `open_modal` | Primary purpose is capture/review | **No** at click; validate on submit | Drawer modals, Quick Message, forms |
| `open_related_record` | Navigate or open another drawer surface | No | `open_drawer`, person drawer |
| `create_related_record` | Create child/person/opportunity via form | **No** at click; schema on submit | Add Child, Create Lead, Add Contact |
| `send_communication` | Composer / thread; operator sends | Soft gates (contact method), not lifecycle preflight | Send form, email/SMS, call |
| `transition_lifecycle` | Status change with side effects | **Yes** when transition is one-click | `update_status` lifecycle keys |
| `workflow_trigger` | Emit event / start workflow | Config + payload gates | Org `start_workflow` overrides |

### Mapping to existing code

| Layer | Location |
|-------|----------|
| Definition + handler type | `action_definitions.action_type` → `executeAdminAction` / `applyRegistryResolvedActionClient` |
| Visibility | `action_placements` + `condition_config` → `resolveActionsForContext` |
| Preflight (lifecycle subset) | `LIFECYCLE_PREFLIGHT_ACTION_KEYS` → `preflightOpportunityActionOrNull` |
| Blocked UI | `adminv2:action-preflight-blocked` → `ActionPreflightBlockedPanel` |
| Legacy parallel | `record_actions`, tour bar REST, drawer shell chrome, operational-task strip |

### Five product questions (every action should answer)

1. **What can I do from this record?** — Resolved placements + BOS recommendations (catalog keys).
2. **Why can/can’t I do it?** — `condition_config` visibility + `action_preflight` / completion summary (execute path) or inline modal validation (capture path).
3. **What information is needed?** — Requirement engine (execute) or modal `required_fields` / form schema (capture).
4. **Where do I enter it?** — Modal route, inquiry-children focus, comms tab, tasks panel, or inline layout fields.
5. **What happens after I complete it?** — `emitStatusChangedEvent`, `action_executed`, queue refresh, workflow runs (documented per action).

---

## Deliverable 1 — Action audit

**Sources:** `action_definitions` / `action_placements` migrations (`20260427180000` → `20260602220000`), `ACTION_BUTTON_LIBRARY`, `applyRegistryResolvedActionClient.ts`, `executeAdminAction.ts`, `canonical_action_catalog_v1.md`, `action_definition_legacy_mapping_v1.md`, drawer/tour/task UI spot-check.

**Legend**

| Column | Values |
|--------|--------|
| **Def** | `active` / `inactive` / `stub` (global row typical) |
| **Preflight** | `yes` = shared lifecycle evaluator before execute; `no` = modal/capture; `n/a` = client-only |
| **Demo** | P0 = demo-critical; P1 = high; P2 = later |

---

### A. Lifecycle transition & tour

| action_key | Group | runtime_kind | Def | Primary placement | Current behavior | Preflight | Opens | Mutates | Emits | Gap / notes | Demo |
|------------|-------|--------------|-----|-------------------|------------------|-----------|-------|---------|-------|-------------|------|
| `approve_enrollment` | lifecycle | `transition_lifecycle` | active | `record_header` overflow (status-gated) | `update_status` → enrolled + `enrollment_date` | **yes** | — | opportunity + child dates | status + `action_executed` | Shipped slice; panel in header | P0 |
| `move_to_waitlist` | lifecycle | `transition_lifecycle` | **stub/inactive**† | catalog: header secondary | `update_status` + `waitlist_date` in code | **yes**‡ | — | opportunity status/metadata | status + events | †No activation migration; ‡preflight in code only | P0 |
| `move_to_qualification` | lifecycle | `transition_lifecycle` | active | header / queue (stage-gated) | `update_status` → `qualification` | no§ | — | opportunity | status + events | §transition rules, not action catalog preflight | P1 |
| `mark_lost` | lifecycle | `open_modal` → execute | active | overflow / queue | `open_form` → lost reason → `update_status` | no | Mark lost modal | opportunity | status + events | Form validation, not preflight panel | P1 |
| `mark_won` | lifecycle | `transition_lifecycle` | active (legacy) | mostly removed | `update_status` enrolled | no | — | opportunity | status | **Deprecate** → `approve_enrollment` | P2 |
| `schedule_tour` | lifecycle / tour | `open_modal` | active | header menu / section | `open_form` → `OpportunityTourScheduleActionModal` | **yes**‡ (execute path) | tour schedule modal | `tour_bookings` + metadata | booking + workflow | Preflight applies on **execute**, not modal open; correct pattern | P0 |
| `reschedule_tour` | lifecycle / tour | `open_modal` | active | header (when tour mirror) | Same modal as schedule | no | reschedule modal | booking | tour events | Tour bar also hardcoded | P1 |
| `confirm_tour` | lifecycle / tour | `execute_now` | active | tour section / registry | `ui_intent` → POST execute → confirm API | no | — | tour_booking | `action_executed` | Booking-state gate at execute | P1 |
| `record_tour_outcome` | lifecycle / tour | `open_modal` → execute | active | header / tour bar | Modal → execute → complete/no-show API | **yes** | outcome modal | booking + opp metadata | events | `tour_completed_date` via booking integration | P0 |
| `qualify_opportunity` | legacy lifecycle | `transition_lifecycle` | active (deprecate) | removed from header | old `contacted` status | no | — | opportunity | status | Replace with `move_to_qualification` | P2 |
| `reserve_spot` | lifecycle | stub | inactive | — | none | — | — | placement | — | Phase 3b deferred | P2 |
| `remove_from_waitlist` | lifecycle | missing | stub | — | PATCH / ad hoc | — | — | — | — | Catalog only | P2 |
| `reopen_lead` | lifecycle | missing | stub | — | — | — | — | — | — | Catalog only | P2 |

† `move_to_waitlist`: runtime handler + catalog preflight exist; global definition remains **inactive** in `20260602160000` stubs until activation migration.  
‡ Evaluator registered in `LIFECYCLE_PREFLIGHT_ACTION_KEYS`; blocked panel shows on failed **execute**, not on modal open.

---

### B. Record creation & related records

| action_key | Group | runtime_kind | Def | Primary placement | Current behavior | Preflight | Opens | Mutates | Emits | Gap / notes | Demo |
|------------|-------|--------------|-----|-------------------|------------------|-----------|-------|---------|-------|-------------|------|
| `create_lead` | entry | `create_related_record` | active | `right_rail` | `open_form` → create-lead flow / `executeAdminAction` create_lead | no | Create lead modal / WU page | new opportunity + person | events | Phase 1A; sentinel entity id | **P0** |
| `add_child` | record | `create_related_record` | active | `record_section` inquiry_children + shell chrome | **Pass A shipped:** shell + registry + header `open_form` → `AddInquiryChildModal`; submit via `submitAddInquiryChildFromDrawer` | no (submit validation) | Add Child modal | OCM + members | refetch + `adminv2:opportunity-updated` | — | **P0** |
| `add_sibling` | record | `create_related_record` | active | inquiry_children section | Same as `add_child` | no | Add Child modal (sibling mode) | OCM | refetch | Same convergence | **P0** |
| `add_related_person` | record | `create_related_record` | active | customer_booking (legacy off) | **Pass B:** `AddPersonModal` → `submitAddPersonFromDrawer` (household + opportunity link) | no | Add person modal | person + customer_persons + opportunity_persons | refetch + events | Same modal as `add_family_member` | **P0** |
| `add_family_member` | record | `create_related_record` | active | `record_section` family_contacts | **Pass B shipped** — canonical Add Person path | no | Add person modal | person + customer_persons + opportunity_persons | refetch + events | — | **P0** |
| `assign_classroom` | record / enrollment | `open_related_record` (focus) | active | record_section (stage-gated) | `ui_intent` → focus inquiry field | no | scroll/focus | — | — | Not execute; field edit in layout | P1 |
| `assign_schedule` | record | `open_related_record` (focus) | active | section | focus `desired_schedule_type` | no | scroll/focus | — | — | Same | P1 |
| `set_start_date` | record | `open_related_record` (focus) | active | section | focus `desired_start_date` | no | scroll/focus | — | — | Same | P1 |
| `edit child/person` | record | — (layout) | n/a | inquiry layout / person drawer | Inline PATCH / drawer save | layout completion | drawer fields | persons / OCM | — | **Not an action_definitions key**; completion on PATCH | P0 |
| `open_record` | platform | `open_related_record` | active | `queue_row` | `open_drawer` | n/a | drawer | — | — | Queue Open chip | P0 |
| `start_quote` | legacy | `open_related_record` | active (deprecate) | removed | quote intake drawer | n/a | drawer surface | — | — | Non-childcare | P2 |
| `upload_document` | record | `open_related_record` | active | optional header | `ui_intent` → documents tab | no | drawer tab | documents | — | No default header placement | P1 |
| `add_note` | record | `open_modal` | active | overflow (optional) | `open_form` / execute `append_note` | no | Add note modal | activity | events | Body required on submit | P1 |
| `review_enrollment_packet` | enrollment | `open_modal` | active | header overflow | `ui_intent` → packet review | no | packet review | session state | — | Phase 3 | P1 |
| `request_missing_information` | enrollment | `send_communication` | active | section | reuses send-form composer | no | Send form modal | — | — | Alias to send form | P1 |

---

### C. Communication & forms

| action_key | Group | runtime_kind | Def | Primary placement | Current behavior | Preflight | Opens | Mutates | Emits | Gap / notes | Demo |
|------------|-------|--------------|-----|-------------------|------------------|-----------|-------|---------|-------|-------------|------|
| `send_form` | comms / workflow | `send_communication` | active | Settings-addable | `ui_intent` → `SendFormToOpportunityModal` | no | send form modal | form link / submission | workflow optional | Not default header; config-driven | **P0** |
| `send_enrollment_packet` | workflow | `send_communication` | active | Settings-addable | `ui_intent` → enrollment packet modal | no | packet modal | packet session | events | Partial vs catalog workflow | P1 |
| `send_email` | comms | `send_communication` | active | queue / optional | Quick Message (email) | no | composer | message | comms events | Header default off | **P0** |
| `send_sms` | comms | `send_communication` | active | queue / optional | Quick Message (sms) | no | composer | message | comms events | Same | **P0** |
| `call_parent` | comms | `send_communication` | active | optional | `tel:` link | no | OS dialer | — | — | Phone on file check only | P1 |
| `quick_message` | legacy comms | `send_communication` | active | queue | Quick Message | no | composer | message | — | Deprecate → send_email/sms | P1 |
| `contact_family` | comms | missing | stub | — | use quick_message today | — | — | — | — | Catalog missing row | P2 |

---

### D. Task / work

| action_key | Group | runtime_kind | Def | Primary placement | Current behavior | Preflight | Opens | Mutates | Emits | Gap / notes | Demo |
|------------|-------|--------------|-----|-------------------|------------------|-----------|-------|---------|-------|-------------|------|
| `create_task` | task | `open_modal` | active | overflow (optional) | `ui_intent` → tasks panel + operational tasks focus | no | tasks panel / drawer strip | operational_tasks | — | **No unified “Create task” modal**; opens shell | **P0** |
| `complete_task` | task | — | **not in registry** | operational strip / task assist | PATCH `/api/admin/operational-tasks/[id]` | no | inline chip | task row | — | **Not cataloged as action** | **P0** |
| `reschedule_task` | task | — | **not in registry** | scheduled send popover | comms schedule APIs | no | edit popover | scheduled message | — | Hardcoded UX | P1 |
| `clear_task` / dismiss | task | — | not in registry | strip UI | local dismiss / complete | no | — | — | — | Needs action_key? | P2 |
| `view_needs_attention` | platform | `open_related_record` | org | right_rail | navigate WU queue | n/a | workspace | — | — | Platform | P1 |
| `review_automations` | platform | `open_related_record` | org | right_rail | `/adminV2/workflows` | n/a | settings | — | — | Platform | P2 |

---

### E. BOS / system / platform

| action_key | Group | runtime_kind | Def | Primary placement | Current behavior | Preflight | Opens | Mutates | Emits | Gap / notes | Demo |
|------------|-------|--------------|-----|-------------------|------------------|-----------|-------|---------|-------|-------------|------|
| `ask_bos` | BOS | `open_modal` (assist) | active | header (Work with BOS) | `BosDrawerAssistCta` / handoff | BOS preflight read-only | assist panel | — | — | `recommended_action_preflight` enrich | P0 |
| `ask_bos` (placement) | BOS | same | active | queue optional | contextual handoff | — | — | — | — | Settings placement | P1 |
| BOS catalog keys | BOS | varies | n/a | recommendations | mapped via `mapCatalogKeyToCanonicalActionKey` | partial | handoff to actions above | — | — | Not all keys have definitions | P1 |

---

### F. Unknown / legacy / hardcoded (not registry-complete)

| Surface | Keys / behavior | Group | Notes | Demo |
|---------|-----------------|-------|-------|------|
| `record_actions` | job `collect_payment`, schedule `reschedule` | legacy | PATCH + events; not opportunity registry | P2 |
| Tour bar | confirm / reschedule / complete / no-show | hardcoded | REST + same canonical keys as registry | P0 |
| Inquiry shell chrome | Add child / Add sibling buttons | hardcoded | Bypasses registry `open_form` handler | **P0** |
| Drawer PATCH | field saves | layout | `enforceOpportunityCompletionOnPatch` | P0 |
| Queue preview | Open only (+ policy strips) | platform | merged with `queue_row` placements | P0 |
| Placeholders | `*_placeholder` | legacy | inactive | P2 |
| `create_inquiry` | ui_intent alert | legacy | “Coming next” | P2 |
| `new_inquiry`, `open_enrollment_work_unit` | navigate | legacy | deactivated / rail | P2 |
| `update_status_add_note` | open_modal | legacy | queue; header off | P1 |
| `contact_attempted` | open_form | legacy | org enrollment | P2 |

---

### Runtime matrix (lifecycle slice — reference)

```ts
// Shipped pattern — execute-time preflight only
{
  action_key: "approve_enrollment",
  runtime_kind: "transition_lifecycle",
  valid_when: { status_key_in: ["ready_to_enroll", "enrolling", "waitlisted", ...] },
  visible_where: ["record_header.overflow"],
  required_inputs: "evaluateEffectiveRequirements (action_execute)",
  opens: null,
  mutates: { entity: "opportunity", status: "enrolled", metadata: ["enrollment_date"] },
  emits: ["opportunity_status_changed", "action_executed"],
}
```

```ts
// Correct contrast — capture-first
{
  action_key: "add_child",
  runtime_kind: "create_related_record",
  valid_when: { drawer: "opportunity", section: "inquiry_children" },
  visible_where: ["record_section.inquiry_children", "shell_chrome"],
  required_inputs: "modal schema (first_name, last_name, ...)",
  opens: "AddInquiryChildModal",
  mutates: { entity: "opportunity_customer_members" },
  emits: ["adminv2:opportunity-updated"],
  preflight_at_click: false,
}
```

---

## Deliverable 2 — Implementation plan (next 3–5, demo-ready)

**Do not implement everything in one pass.** Sequence by operator pain and existing modal infrastructure.

### Recommended slice order

| Priority | Action(s) | Why | Work shape |
|----------|-----------|-----|------------|
| **1** | **Add Child** (+ **Add Sibling**) | Dual path confuses demo; modal exists | Wire registry `open_form` / section click → `AddInquiryChildModal`; document runtime_kind; optional light submit validation; **no lifecycle preflight** |
| **2** | **Add Contact / Add Person** (`add_family_member`, `add_related_person`) | Modals + execute exist; section placement done | Unified “blocked” only on execute failure (API error → inline); guide copy in action audit card; verify family_contacts placement |
| **3** | **Create New Opportunity** (`create_lead`) | Right-rail CTA; Phase 1A execute exists | Ensure WU + drawer paths share `create_lead` runtime map; post-create navigation; gates on parent identity at **submit** not preflight panel |
| **4** | **Send Form** | Modal + intent shipped; not default visible | Settings seed placement for pilot org; operator doc; optional “recommended fields” in modal, not header preflight |
| **5** | **Create Task** (+ complete/reschedule from strip) | `create_task` only opens panel today | Add **Create Task** modal (or reuse task-assist create flow) with title/due/assignee; catalog `complete_task` as optional registry key later |

### Lifecycle follow-ups (parallel, smaller)

| Item | Work |
|------|------|
| `move_to_waitlist` | Activation migration + header placement + verify preflight panel (code ready) |
| `schedule_tour` | Document: preflight on execute only; optional “recommended” in schedule modal |
| BOS handoff | Ensure blocked execute and BOS `recommended_action_preflight` share copy |

### Explicitly defer

- New action framework or parallel registry
- Preflight on `send_email` / `create_task` at click time
- `reserve_spot`, financial actions, full catalog stub activation
- Replacing tour bar hardcoding (already aligned to keys; consolidation optional)

### Per-candidate runtime spec (summary)

| action_key | runtime_kind | Preflight at click? | Opens | After success |
|------------|--------------|---------------------|-------|---------------|
| `add_child` | `create_related_record` | No | `AddInquiryChildModal` | Refetch drawer + queue |
| `add_family_member` | `create_related_record` | No | Add family modal | Execute + refetch |
| `create_lead` | `create_related_record` | No | Create lead modal / flow | Open new opportunity drawer |
| `send_form` | `send_communication` | No | `SendFormToOpportunityModal` | Link + activity |
| `create_task` | `open_modal` | No | Task create modal (new or extracted) | operational-tasks API + strip refresh |

---

## Deliverable 3 — Guardrails

1. **Preserve layouts** — Field behavior stays in `field_placements_v1` / drawer PATCH; actions do not reorder sections.
2. **Preserve modals** — Reuse `AddInquiryChildModal`, `SendFormToOpportunityModal`, Quick Message, tour modals, packet review.
3. **Extend registry paths** — `applyRegistryResolvedActionClient` + `executeAdminAction`; no second action router.
4. **Preflight scope** — Only `LIFECYCLE_PREFLIGHT_ACTION_KEYS` (and future explicit execute-now keys); never block opening a capture modal.
5. **Blocked UI** — `ActionPreflightBlockedPanel` for failed **execute** on preflight actions; inline/modal errors for capture actions.
6. **Placement doctrine** — Capabilities ≠ header pills (`configured_drawer_actions_fix.md`); comms/tasks via Settings or section/BOS.
7. **Events** — No `action_executed` / status events on preflight block; modal submit failures return API errors only.
8. **Convergence metric** — Each action documents the five product questions in catalog or this audit; unknown → `unknown/legacy` until mapped.

---

## Demo blockers (current)

| Blocker | Impact |
|---------|--------|
| `move_to_waitlist` inactive in DB | Action may not appear in menu |
| ~~`add_child` registry vs shell divergence~~ | **Resolved (Pass A)** — unified `openAddInquiryChildModal` / event |
| `create_task` opens panel only | Weak “create task” demo |
| Task complete/reschedule not in action catalog | Inconsistent “action system” story |
| Dual tour paths (bar vs registry) | Acceptable for demo if keys documented |

---

## Suggested next engineering passes

1. **Pass A — Record creation convergence** (Add Child, Add Contact, Create Lead): registry → modal wiring + tests; no new preflight.
2. **Pass B — Communication demo** (Send Form + optional Send Email placement): placement seed + modal polish.
3. **Pass C — Task surface** (Create Task modal + strip integration): optional registry keys for complete/reschedule later.
4. **Pass D — Lifecycle activation** (`move_to_waitlist` migration + menu placement): reuse existing preflight panel.

---

## References

| Doc / module | Role |
|--------------|------|
| `canonical_action_catalog_v1.md` | Business vocabulary |
| `action_definition_legacy_mapping_v1.md` | Legacy → canonical |
| `lifecycle_configuration_requirements_design_package_v1.md` | Requirement engine design |
| `configured_drawer_actions_fix.md` | Header placement doctrine |
| `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` | Client routing |
| `web/lib/admin/actions/executeAdminAction.ts` | Server execute |
| `web/lib/completion/lifecycleActionRequirementCatalog.ts` | Lifecycle preflight rules |
| `web/components/admin/opportunity/ActionPreflightBlockedPanel.tsx` | Blocked execute UX |
