# Actions and workflows

**Status:** Canonical platform module doc (updated June 2026 — unified actions + relationship framework).

Event spine, workflow execution, admin action router, and the canonical action catalog.

---

## Spine

```
emitEvent → workflow_events → workflowRun → effects (DB, messages, updates)
```

Tokenized public actions: `/api/action/[token]/consume` → event → workflows.

---

## Key modules

| Module | Path |
|--------|------|
| Event emit | `web/lib/emitEvent.ts` |
| Workflow run | `web/lib/workflowRun.ts` |
| Admin actions | `web/lib/admin/actions/executeAdminAction.ts` |
| Action resolve | `web/lib/admin/actions/resolveActionsForContext.ts` |
| Client router | `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` |
| Canonical registry | `web/lib/admin/actions/canonicalActionRegistry.ts` |
| Relationship registry | `web/lib/admin/relationship/relationshipActionRegistry.ts` |
| Layout action catalog | `web/lib/layout/layoutEditorActionCatalog.ts` |
| DB catalog | `action_definitions`, `action_placements` |

---

## Canonical action doctrine

| Layer | Controls |
|-------|----------|
| **Business Process** | Which actions are available for a stage/process (DB placements + lifecycle builder matrix) |
| **Experience Builder** | Where actions appear on a layout surface (contact row, section, related list) |
| **BOS** | Can propose/fill canonical action requests (adapters shipped; full rail UI wiring is follow-up) |
| **Executors** | Perform durable writes (admin execute, relationship wizard, dedicated modals) |

The **same canonical action key** may launch from:

- Drawer header / overflow (top-right Actions)
- Work-unit right rail
- Layout `_action_button` (contact block, related-list column)
- Queue row inline action
- BOS proposal (future full UI)
- Workflow automation (registered event keys)

**Target-specific actions** (e.g. `make_primary_contact`) appear only where the UI knows the target person/contact — not in generic header/rail unless a target picker exists (not shipped).

---

## Sources of truth

| Source | Role |
|--------|------|
| `action_definitions` + `action_placements` | Org/global DB catalog and surface slots |
| `canonicalActionRegistry.ts` | Code-side capability matrix (executor, placements, layout contexts) |
| `relationshipActionRegistry.ts` | Relationship actions — scopes, surfaces, confirmation copy |
| `layoutEditorActionCatalog.ts` | Experience Builder picker — friendly labels, groups, availability |
| Lifecycle / BP builder | Stage-scoped action matrix (`lifecycleActionsMatrix.ts`) |
| Enrollment status transition | `update_enrollment_status` — OCM-first modal (replaces generic update status on enrollment surfaces) |

Migrations (June 2026 workstream):

- `20260622210000_relationship_action_definitions.sql` — relationship action_definitions seeds
- `20260622220000_update_enrollment_status_action.sql` — Change Enrollment Status

---

## Placement behavior

| Surface | Generic actions | Target-specific (e.g. make_primary_contact) |
|---------|-----------------|-----------------------------------------------|
| `record_header` / overflow | When BP/stage + DB placement permit | **Stripped** at resolve time |
| `right_rail` / `work_unit` | Same | **Stripped** |
| `queue_row` | Row inline when configured | **Stripped** |
| Layout contact block / related list | Via `_action_button` catalog | **Allowed** — row supplies `targetPersonId` |
| BOS rail | Relationship + enrollment modals when record selected | make_primary_contact **not** on rail |

Work-unit page hosts relationship and enrollment modals via `useWorkUnitRegistryModals.tsx` — rail actions call `applyRegistryResolvedActionClient` with `openRelationshipAction` / `openEnrollmentStatus`.

Client router: `applyRegistryResolvedActionClient.ts` — never silent no-op; returns `{ ok: false, error }` when context missing.

---

## Relationship Action Framework

### Doctrine

- **Household membership ≠ child responsibility.** A person on the account is not automatically responsible for a specific child.
- **Child-scoped relationships are first-class** — emergency contact, authorized pickup, billing contact scoped to selected child(ren).
- **Person identity is global** (`persons`); responsibilities are **scoped links** on `customer_persons`, `customer_member_contacts`, `opportunity_persons`, `opportunity_customer_members` — not booleans on person rows.

### Child-scoped scopes

| Scope | Meaning |
|-------|---------|
| `this_child` | Active child / OCM row |
| `selected_children` | Operator picks subset |
| `all_children_in_household` | All enrolled/inquiry children on account |
| `household` | Account-level (primary contact, guardians) |

### Durable write paths

- `contacts`, `customer_persons`, `customer_members`
- `opportunity_persons`, `opportunity_customer_members`
- `customer_member_contacts`
- `workflow_events` / activity audit

Shared **guided wizard** + **idempotent executor** — confirmation required before writes.

### Supported relationship actions

| Action key | Notes |
|------------|-------|
| `add_child` | Add or link child |
| `add_parent_guardian` | Parent/guardian on household or child scope |
| `add_emergency_contact` | Child-scoped |
| `add_authorized_pickup` | Child-scoped |
| `add_billing_contact` | Child or enrollment scope |
| `link_existing_person` | Link with role |
| `link_existing_child` | Link existing household child |
| `make_primary_contact` | **Layout contact-row only** — see below |

Code: `relationshipActionRegistry.ts`, `relationshipActionClient.ts`, `RelationshipActionGuidedModal`.

### Make Primary Contact

- Relationship/designation action — **not** inline scalar edit on `person.is_primary`.
- **Layout contexts only:** contact block, household contacts widget, contact related-list row.
- **Hidden** from generic header/rail/workspace resolve (`stripMakePrimaryContactFromResolvedActionsBySlot`).
- Requires **target person** at runtime; registry path disabled without target.
- Primary row: read-only **badge**; non-primary row: **Make Primary Contact** button → confirm → PATCH household primary.

---

## Change Enrollment Status (enrollment surfaces)

Replaces generic **Update Status** on enrollment drawer/queue/rail surfaces.

| Rule | Detail |
|------|--------|
| **OCM-first** | Transition scope prefers `opportunity_customer_members.outcome_status_key` when child/OCM exists |
| **Case fallback** | `opportunities.status_key` only when no child/OCM context |
| **BP transition rules** | Destination picker driven by business process requirements |
| **Waitlist** | Reachable as parking-lot when configured |
| **Preflight** | Required info enforced before execute |
| **Tour bypass** | Reason required when configured |
| **Stage outcomes** | Manual transitions run side effects: create/reopen work, needs attention, stage work completion, child disposition primary work spawn |

Modal host: work-unit rail + drawer via `openEnrollmentStatus` / `dispatchOpenEnrollmentStatusModal`.

---

## Create Lead fresh-data contract

Fresh **Create Lead** (June 2026) writes:

| Artifact | Detail |
|----------|--------|
| `opportunity.status_key` | From lifecycle binding (e.g. `new_inquiry`) — not legacy `open` default |
| OCM `outcome_status_key` | `new_inquiry` when child exists at intake |
| Household | `customers`, `customer_persons`, `persons` |
| Members | `customer_members`, `opportunity_customer_members` |
| Child-scoped contacts | When role data supplied at intake |
| Address | Parsed + persisted via create-lead address path |
| Events | Workflow/activity audit |
| Queue visibility | New Leads lane — includes legacy `open`/`new` aliases via `enrollmentLeadStageStatusAliases.ts` |

**Caveats for validation:**

- Child drawer needs child/OCM on record
- Waitlist rows need waitlist transition (not create-lead alone)
- Org role config must include relationship role keys
- Legacy `open` records supported by alias filter — optional normalize to `new_inquiry` later

---

## BOS readiness

- Relationship and enrollment status adapters produce **canonical action requests** with confirmation policy.
- Full BOS rail UI wiring for action proposals is **follow-up** — executors and modals are runtime-ready from drawer/rail/layout paths.

---

## Rules

- Meaningful business mutations should use event/workflow path where product already does
- Completion guardrails on lifecycle execute paths
- Workflow events: JWT SELECT-only; inserts via service role
- Do not bypass state machines, permissions, or audit for operational writes

---

## Related

- `../operator/experience-builder-doctrine.md`
- `../operator/business-process-layout-assignments.md`
- `../core/status-and-state-system.md`
- `../core/record-system.md`
- `../../system/actions-and-workflows.md` (transitional expanded reference)
