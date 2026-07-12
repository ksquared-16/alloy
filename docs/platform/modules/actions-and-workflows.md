# Actions and workflows

**Status:** Canonical platform module doc (updated June 2026 — unified actions + relationship framework).

Event spine, workflow execution, admin action router, and the canonical action catalog.

**Operator inventory & Current Work alignment:** [action-system.md](../operator/action-system.md), [actions-current-work-alignment.md](../operator/actions-current-work-alignment.md).

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
| **Action Runtime contract** | `web/lib/adminV2/actions/actionTypes.ts` |
| **Action Registry** | `web/lib/adminV2/actions/actionRegistry.ts` |
| **Runtime executor** | `web/lib/adminV2/actions/actionExecutor.ts` |
| **Eligibility resolvers** | `web/lib/adminV2/actions/actionEligibility.ts` |
| **Config validation** | `web/lib/adminV2/actions/configValidation.ts` |
| **Eligibility API** | `POST /api/admin/actions/eligibility` |

---

## Action Runtime contract (Phase 2 — June 2026)

**An Action is a configured invocation of a registered capability.** Config decides
*where/when/how* an action appears; code decides *what an action is and how it runs*.

- **Config controls:** label, description, placement, order, visibility, process/entity
  scope, required-input hints, confirmation copy.
- **Config cannot control:** raw mutation behavior, database tables, arbitrary payload
  schemas, or unregistered event/action keys.

Every executable action maps to a `RegisteredAction` in
`web/lib/adminV2/actions/actionRegistry.ts`. Each registered action declares: `actionKey`,
default label, supported entity types, supported process keys, required context, a
code-owned payload schema (`validatePayload`), an `resolveEligibility` resolver
(blockers + available transitions + required inputs), a `buildPreview` dry-run builder,
an `execute` handler, audit metadata, and a structured result contract.

**Single execution path.** Manual UI runs through `POST /api/admin/actions/execute`
→ `runRegisteredAction` (server-authoritative). BOS confirmed proposals use the
**same execute route** for registered keys (reference: `create_lead`); dedicated BOS
rail apply UI remains follow-up. The executor enforces, in order:
registered → context → payload schema → eligibility → (preview | execute). Mutations
are delegated to invariant-owning modules (e.g. `updateOpportunityStatusWithEvent`,
`executeCreateLeadAction`) — the runtime never forks business logic or writes directly.

**Config alignment.** A configured action may only reference a *known* action key
(registered handler **or** canonical catalog entry). Unknown keys fail loudly in
dev/test (`assertConfiguredActionKeys`) and render disabled in production
(`partitionConfiguredActionKeys`) — menus never render silently-broken actions.

**Reference implementations:** `update_status` (generic case-grain status change,
enrollment as first consumer) and `create_lead` (capture-first record creation).
See `docs/sprints/archive/06_2026/actions_runtime_audit.md` for the full audit and rollout plan.

### Create Lead and requirement timing

`create_lead` remains capture-first. It always enforces the code-owned minimum identity/contact requirements, then adds only explicitly configured `record_creation` lifecycle field rules. Stage-progress and stage-exit rules do not block record creation; they surface after the record exists through Current Work/readiness and transition preflight.

For compatibility, legacy child rules without timing are still downgraded to recommended intake fields until a tenant explicitly marks them `record_creation`.

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

### Update Status by domain (Status Truth Doctrine — next action sprint)

Under the Status Truth Doctrine (`../core/status-and-state-system.md`), **"update status" is never
generic** — every status belongs to a subject/domain, so the action must declare which it mutates.

- **Today:** the registered `update_status` action is **hardcoded to Lead Status** —
  `supportedEntityTypes: ["opportunity"]`, `assertAllowedStatusKey(…, "opportunities", …)` →
  `updateOpportunityStatusWithEvent`. Child enrollment status already has its own action
  (`update_enrollment_status`, OCM `outcome_status_key`).
- **Next sprint (planned):** make the domain explicit across all subjects — `update_lead_status`
  (`opportunities.status_key`), `update_child_enrollment_status` (OCM `outcome_status_key`, converging the
  existing enrollment action), `update_person_status` (`persons.status_key`). Each resolves its subject
  from the command's grain/context and mutates only that domain's field; none can silently change another
  subject's status. The operator-facing intent ("Move Forward") still resolves to the correct domain
  action via `operationalIntent.ts`.

---

## Action placements (operator editor)

The Process Actions / Lifecycle Builder editor offers exactly **three** operator-facing
placements (`LIFECYCLE_ACTION_PLACEMENTS` in `web/lib/lifecycle/lifecycleStageBaseActions.ts`).
Each maps to the exact `action_placements.surface`/`slot` the matching rail consumes, so a
checked placement resolves on the surface its label promises:

| Placement (editor) | `surface` / `slot` | Consumed by |
|---|---|---|
| **Focus Panel Manage** | `record_header` / `overflow` | Focus Panel "Manage" menu |
| **Work Unit right rail** | `work_unit` / `primary` | Work Unit Actions rail (`placementSurfaces: ["work_unit"]`) |
| **Workspace** | `workspace` / `primary` | Workspace root actions rail |

Deprecated placements (**Work Unit Queue row**, **Department right rail**, **Workspace root**,
bare **Focus Panel**) are no longer offered. Previously-saved configs are normalized onto the
canonical set without breaking (`normalizeLifecyclePlacementId` /
`lifecycleActivationPlacementIdForSurfaceSlot`):

- Department right rail (`department`/`primary`) → **Workspace**
- Focus Panel (`record_header`/`primary`) → **Focus Panel Manage**
- Work Unit Queue row (`queue_row`/`row_inline`) → **dropped** (no longer surfaced; renders safely)

### Work Unit rail vs Focus Panel Manage (runtime)

These are **separate placement surfaces** with separate resolution — they must never share the
same action list in the operator UI:

| Surface | Placement config | Command rail / menu | Subject context |
|---|---|---|---|
| **Work Unit right rail** | `work_unit` / `primary` | Persistent workspace command rail (`placementSurfaces: ["work_unit"]`) | **No inherited subject** — `create_lead` is always available when placed; record-required commands may receive the selected queue row as a **suggested** subject at execution time only |
| **Focus Panel Manage** | `record_header` / `overflow` | Focus Panel header Manage menu (`header_menu`) | **Current record required** — resolved from `record_header` with `entityId` |

The persistent command rail (`WorkspaceCommandRailShell`) **must not** replace page-registered
Work Unit / Department / Workspace actions with drawer Focus Panel actions when a record is
open. `shouldDrawerReplaceCommandRailActions` blocks that override; Focus Panel Manage stays
in the drawer header (`OpportunityFocusPanelHeader` / `RecordDrawerManageMenu`).

Suggested/selected queue row affects **execution context** (e.g. Schedule Tour default target),
not **which actions appear** in the Work Unit rail.

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

Fresh **Create Lead** (June 2026, hardened in the Create Lead reliability thread) writes:

| Artifact | Detail |
|----------|--------|
| `opportunity.status_key` | From lifecycle binding (legacy `new_inquiry` retained) — not legacy `open` default. The key stays `new_inquiry` for now (queue/lifecycle compatibility), but it **displays as "New Lead"** everywhere (see *Status language* below) |
| OCM `outcome_status_key` | **`null` at intake** — a brand-new lead has no enrollment disposition, and the OCM status domain defines none for "lead". The child badge is **suppressed** until a real enrollment outcome (waitlisted/enrolling/…). Never `new_inquiry`. |
| Household | `customers`, `customer_persons`, `persons` — household status writes `customers.status_key` (canonical), **never** the dropped `customers.status` column (PGRST204) |
| Members | `customer_members`, `opportunity_customer_members` |
| Child-scoped contacts | When role data supplied at intake |
| Address | Parsed + persisted via create-lead address path |
| Events | Workflow/activity audit |
| Queue visibility | New Leads lane — `enrollmentLeadStageStatusAliases.ts` accepts `new_lead`, legacy `new_inquiry`, and `open`/`new`; the org's stored lane filter is expanded at runtime so new + pre-migration rows coexist without a per-org queue migration |

### Create Lead success / projection / refresh

Operator behavior after a successful create (Create Lead reliability thread):

- **No auto-open.** Success state stays in the modal. The Focus Panel opens **only** when the operator clicks **Open Lead**, which then closes the modal (`queueActionWorkspaceLeadHandoff` calls `closeWorkspace` before navigating).
- **Canonical navigation, no legacy drawer.** Open Lead routes to the Work Unit Focus Panel via `resolveCreatedLeadFocusPanelHref` → `operatorWorkUnitHrefFromKey` (`/workspace/work-unit/:slug/:recordId`) — never the legacy adminV2 drawer.
- **Focus Panel composes by record id.** `composeOpportunityDrawerViewModel` loads the record by `org_id + id` only — it is **not** gated on queue membership, so the just-created record opens even before the queue refresh lands.
- **Projection refresh seam.** `CreateLeadCommandSurface` dispatches the canonical `dispatchOpportunityQueueUpdated(id, "create_lead")` on success, and `create_lead` is registered in `QUEUE_MEMBERSHIP_ACTION_KEYS`, so every mounted Work Unit view refetches **lane rows + pill counts** (the new lead appears in New Leads without a full reload). The success contract (`buildCreateLeadSuccess`) carries the created `work_unit_id`/`status_key` and a **work-unit refresh target** alongside the opportunity; all entry points (Work Unit / department / workspace rails) honor `onRefresh`.
- **Refresh recomputes the operational projection, not independent counts.** The canonical refresh event is the unit that re-runs the **operational projection** (`computeOperationalProjection` over the all-records base + Work View predicates), so process card count, Work View counts, queue rows, and active Focus Panel membership all update from the **same** source — never a lane-summary count that disagrees with the rows. See `../core/business-process-system.md` § Operational Projection and `docs/sprints/archive/06_2026/operational_projection_convergence.md`.

### Status language — no operator-facing "Inquiry"

Product language is **Lead**, not **Inquiry**. The internal `new_inquiry` status key is retained for back-compat, but every operator-facing label resolves to **"New Lead"**: `new_inquiry` status-definition labels are relabeled to "New Lead" (migration `20260706120000_new_lead_status_label_canonicalization.sql`), the static status-label maps render "New Lead", and `canonicalNewLeadStatusLabel` covers any lingering `new_inquiry`/`new_lead` key in projections/cards. Legacy child OCM `new_inquiry` rows are cleaned to `null` (badge suppressed) by the org-scoped script `scripts/suppressLegacyChildNewInquiryStatus.ts` (dry-run by default, `EXECUTE=1` to apply; opportunity statuses untouched).

**Caveats for validation:**

- Child drawer needs child/OCM on record
- Waitlist rows need waitlist transition (not create-lead alone)
- Org role config must include relationship role keys
- Legacy `open` records supported by alias filter — optional normalize later
- Changing the **opportunity** case key from `new_inquiry` → `new_lead` is **deferred** (queue/lifecycle config validation first); only the child outcome status was changed

---

## BOS readiness

- Relationship and enrollment status adapters produce **canonical action requests** with confirmation policy.
- Full BOS rail UI wiring for action proposals is **follow-up** — executors and modals are runtime-ready from drawer/rail/layout paths.

---

## Operational Command Runtime

**Every operational mutation in Alloy is an Operational Command.** A command is a registered
platform capability; it exists independently of where it appears. The Actions Runtime is the
Operational Command Runtime — manual UI and BOS are placements over the same runtime.

```
Registered Capability → What can Alloy do?         web/lib/adminV2/actions/actionRegistry.ts
   ↓
Placement             → Where do operators see it?  action_placements (config)
   ↓
Context Resolution    → How is the subject resolved? web/lib/platform/commands/invocationContext.ts
   ↓
Eligibility → Required Subjects → Required Inputs → Preview → Confirmation
   ↓
Execution → Audit → Refresh                          actionExecutor.ts
```

Command = **registered capability + placement + context resolution + eligibility + required
subjects + required inputs + preview + execution + audit + refresh.**

- **One registered capability per command.** Never duplicate a command because it appears on another surface.
- **Logical placements:** `work_unit_actions`, `focus_panel_manage`, `queue_row_menu`, `bos_recommendations` (decoupled from the physical `action_placements.surface` enum via `logicalPlacementForPhysicalSurface`).
- **Context resolution** (`ContextResolution`): `current_record`, `user_selection`, `queue_selection`, `suggested_record`, `bos_proposal`, `open`. A Work Unit rail command is **not** `entityId = null` — it has *no inherited subject yet* and a *required subject* the operator must resolve. A suggested record (last-opened, BOS) is optional context, **never** the authoritative subject.
- **Required subject** (`RequiredSubject`): `none`, `opportunity`, `person`, `child`, `case`, `multiple_opportunities`. Derived from the capability via `requiredSubjectForAction`.
- **Shared invocation contract:** every surface resolves context via `resolveCommandContext` and executes via `runRegisteredAction` / `resolveActionEligibility`. No execution path diverges by surface.

| Command + placement | Context resolution | Required subject | Operator sees |
|---|---|---|---|
| `schedule_tour` @ work_unit_actions | `user_selection` | opportunity | choose a family first |
| `schedule_tour` @ focus_panel_manage | `current_record` | opportunity | scheduling flow for selected family |
| `create_lead` @ work_unit_actions | `open` | none | create-lead form / BOS intake |
| `update_status` @ focus_panel_manage | `current_record` | opportunity | allowed transitions for selected record |
| `update_status` @ work_unit_actions | `user_selection` (or hidden) | opportunity | choose a record, then update status |

### Operator-facing command states

`web/lib/platform/commands/commandState.ts` (`describeCommandState`). A command never fails as a
raw technical error where a user decision is needed:

| State | Operator copy (example) |
|---|---|
| available | runnable |
| disabled_blocked | "This status cannot be changed from Tour Scheduled to Enrolled yet." |
| needs_subject | "Choose a family before running \"Schedule Tour\"." |
| needs_required_input | "Missing required information: child date of birth." |
| preview_ready | "Review what this command will do, then confirm." |
| confirmation_required | "Confirm to run \"Update Status\"." |
| executing | "Schedule Tour…" |
| success | "Lead created. Opening record." / "Tour confirmed." |
| failure | recovery copy (`operatorErrorCopy`), not a stack trace |

- **Configuration owns presentation** (placement, visibility, order, labels, confirmation copy). **Runtime owns execution** (context, eligibility, required inputs, preview, execute, audit, refresh). **The platform owns capabilities.**

Reference commands through the registered runtime: `update_status`, `create_lead`, `confirm_tour`.

### Operational Intent (human) vs Capability (technical)

Operators think in **intent**, not capability. `web/lib/platform/commands/operationalIntent.ts`
maps the operator-facing verb to the technical capability it invokes:

| Operator intent | Capability |
|---|---|
| "Schedule Tour" | `schedule_tour` |
| "Move Forward" | `update_status` |
| "Enroll Child" | `assign_room` + `create_contract` + `generate_documents` + … (fan-out) |

One intent may resolve to many capabilities. The runtime never exposes implementation detail
to operators. `OperationalIntent` = `intentKey`, `title`, `description`, `defaultCapability`,
`supportedCapabilities`, `supportedSubjects`, `supportedProcesses`, `maturity`.

### Operational Flow (reusable stages)

A command is a guided flow composed from reusable stages
(`web/lib/platform/commands/commandFlow.ts` → `buildCommandFlow`):

```
resolve_context → resolve_subject → resolve_required_inputs → resolve_constraints
  → preview → confirm → execute → success
```

The **runtime** decides the current stage from the resolved snapshot; the **UI** renders the
stage the runtime points to. The same command from a richer entry point has more stages
already complete — Work Unit opens at `resolve_subject`, Focus Panel at
`resolve_required_inputs`, BOS at `preview`. No execution path diverges by surface; surfaces
only differ by how much context arrives pre-resolved. See
`docs/sprints/archive/06_2026/operational_command_runtime_v3.md`.

There are no buttons, drawer actions, or dialog mutations — only commands, placements, and
flows over one runtime.

### Create Lead — first visible command flow (V4)

Create Lead is the first operator-visible Operational Command Flow.
`web/lib/platform/commands/createLead/createLeadCommandModel.ts` (`deriveCreateLeadCommandState`)
is a **read-only view-model over the runtime** — it derives stage, operator state/copy,
known/missing inputs, preview, and a standardized success descriptor, but never mutates.

- Required subject = **none** → `resolve_subject` is skipped (capture-first).
- Manual UI and BOS share the **same** view-model; BOS (`deriveCreateLeadCommandFromBosProposal`)
  simply arrives with more inputs already parsed, and surfaces missing fields in operator
  language. Both submit the same `executePayload` through the registered `create_lead` action
  via `POST /api/admin/actions/execute` — there is no separate BOS mutation path.
- Read-only eligibility/preview derivation lives in `createLead/createLeadRequiredInputs.ts` and
  is shared by the registered action and the view-model (one source of truth).
- Success is standardized by `createLead/createLeadSuccess.ts` (created id, next surface, refresh
  targets, copy).

Server-side required-input parity with stage intake-spec `field_rules` (notably location) is a
documented follow-up — see `docs/sprints/archive/06_2026/create_lead_command_flow_audit.md` § Phase 6.

### Command Surface — platform-owned shell (V5)

The **Command Surface** is the reusable, **platform-owned** UI/runtime shell for completing an
Operational Intent (`web/lib/platform/commands/surface/*`). `deriveCommandSurfaceState` normalizes
a command snapshot into fixed anatomy: header (title/description/context chips/stage), body
(subject selector · input fields · preview · blocker · confirmation), footer (primary/secondary),
and success/failure. The shell is identical across variants — **work_unit, focus_panel_manage,
queue_row, bos** — which are variants over the same snapshot, not separate systems.

- **Platform owns** layout, stage order, lifecycle, preview/confirm/success/failure patterns,
  and BOS↔manual convergence.
- **Config influences content only** via `CommandSurfaceConfigInfluence` (title/description/
  confirm/blocker copy + availability/placement/order/required inputs/constraints). Config can
  never alter shell anatomy or render custom components.
- The surface model is **read-only** — it prepares UI state, never executes. Create Lead is the
  reference command; Update Status maps onto the same model with no new shell code.

**First operator-visible UI (V2).** `CommandSurfaceShell.tsx` is the platform-owned
presentational component that renders the surface state into the fixed anatomy for every
variant and command; `useCommandSurfaceController.ts` owns the operator lifecycle (idle →
executing → success/failure) and re-derives the surface on each input edit. **Execution is
injected** into the controller — it never mutates directly; callers wire it to the existing
registered-action route, so BOS, manual, and Work Unit converge on one lifecycle without
forking execution. `commandSurfacePresentation.ts` provides the operator copy contract and a
guard (`isOperatorSafeCopy`) proving no payload keys / action keys / runtime enums leak.
`CreateLeadModal.tsx` is protected and not rewritten; convergence is at the model level with
modal-body convergence documented as the next step.

**First end-to-end operator wiring (V3).** Every Create Lead entry point (Work Unit Actions,
BOS-launched intake, manual rail) now renders the platform host
`CreateLeadCommandSurface.tsx`, which hosts the unchanged `CreateLeadModal` as the intake body
but owns execution and success. Execution runs through the single shared client adapter
`executeCreateLeadCommand.ts` → `POST /api/admin/actions/execute` registered `create_lead`
(no forked mutation path); success/refresh derive from `buildCreateLeadSuccess`. Replacing the
modal's visible chrome with `CommandSurfaceShell` remains deferred to avoid regressing the rich
intake.

See `docs/sprints/archive/06_2026/command_surface_v3.md`, `command_surface_v2.md`, `command_surface_v1.md`.

## Rules

- Meaningful business mutations should use event/workflow path where product already does
- Completion guardrails on lifecycle execute paths
- Workflow events: JWT SELECT-only; inserts via service role
- Do not bypass state machines, permissions, or audit for operational writes
- Configuration places actions; it never creates executable behavior. Configured keys + placements must resolve to a registered capability (`validateConfiguredPlacement`) or be hidden/disabled.

---

## Related

- `../operator/experience-builder-doctrine.md`
- `../operator/business-process-layout-assignments.md`
- `../core/status-and-state-system.md`
- `../core/record-system.md`
- `../../system/actions-and-workflows.md` (transitional expanded reference)
