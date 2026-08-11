---
owner: modules
status: canonical
last_reviewed: 2026-07-28
supersedes: []
---

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
| **Capability Registry (P0.S1)** | `web/lib/platform/commands/capabilityRegistry.ts` — classification honesty |
| **Command Runtime Facade (P1–P4.S1)** | `web/lib/platform/commands/runtime/*` — prepare + RegisteredAction + Lead/Enrollment Mutation + Relationship (exact keys) execute; **P4.S1** destructive/replacement safety foundation (commit disabled) |

---

## Platform Capability Registry (P0.S1 — classification spine)

**Status:** Shipped as an honesty/classification layer (July 2026). Does **not** replace Domain
Executors. Does **not** execute Commands.

`web/lib/platform/commands/capabilityRegistry.ts` owns **capability identity honesty**:

- maturity (`executable` \| `adapted` \| `legacy` \| `navigation_only` \| … \| `placeholder` \| `unavailable`)
- execution owner (RegisteredAction, Mutation Runtime, Relationship Runtime, tour domain, …)
- organization Command catalog visibility

A row in `action_definitions` never implies executable behavior by itself. Placeholder and
unavailable identities are excluded from Settings “add Command” catalog flows and are treated
as non-runnable in configured-key partitioning / process option support checks.

**Execution remains distributed** behind existing owners for capabilities not yet adapted to the
Command Runtime facade (`executeAdminAction`, remaining Relationship Framework keys, tour booking
services).

## Command Runtime Facade (preparation + gated execute)

**Status:** Preparation (P1.S1). RegisteredAction execute (P1.S2). Lead Status Mutation execute
(P2.S1). Child Enrollment Mutation execute (P2.S2). Relationship Runtime adapter (P3.S1–P3.S3).
Destructive allowlist commit (P4.S2–S3: `make_primary_contact`, `delete_lead`, `cancel_tour`).
Tour domain adapter (P5). Process `command_set_v1` authority (P6). Organization Commands **operator configuration product rejected** (P7–P8 product-boundary correction): `/organization/commands` is internal capability diagnostics only. Fallback disposition ledger + telemetry (P9). Remaining
`executeAdminAction` keys are classified intentional compatibility / unsupported — not silently
deleted.

`prepareCommandInvocation` remains **side-effect free**.

`executeCommandInvocation` is server-authoritative and **fail-closed**:

- **RegisteredAction** (`create_lead`, `update_status`, `confirm_tour`, `schedule.create`) →
  `runRegisteredAction`
- **Lead Status Mutation** (`update_lead_status`, `close_lead` exact keys only) → `executeMutation`
  → existing Lead Status domain handler
- **Child Enrollment Mutation** (`update_child_enrollment_status`, `waitlist_child`, `enroll_child`
  exact keys only) → `executeMutation` → existing Enrollment Status domain handler
- **Relationship Runtime** (exact keys only) → `executeRelationshipAction`:
  - P3.S1: `add_parent_guardian`, `link_existing_person`
  - P3.S2: `add_emergency_contact`, `add_authorized_pickup`, `add_billing_contact`
  - P3.S3: `add_child`, `link_existing_child`
  (Relationship Framework remains mutation authority; each key retains distinct Command identity)
- `mutation_runtime` / `relationship_runtime` are **not** enabled as global owner gates — only
  explicit exact keys
- `mark_lost` remains on legacy compatibility (`executeAdminAction`); not consolidated
- Enrollment aliases (`move_to_waitlist`, `approve_enrollment`) remain outside exact-key facade cutover
- Remaining Relationship keys (Add Family Member hub) remain outside facade cutover
- **P4.S2:** `make_primary_contact` — replacement adapter → `setHouseholdPrimaryContactForCustomer`
- **P4.S3:** `delete_lead` — destructive adapter → `executeDeleteOpportunityLead` (hard delete; typed
  confirm + preview token). Direct `POST .../opportunities/:id/delete` remains compatibility (Option A).
  Archive / cancel tour / withdraw remain commit-disabled. **P4.S4:** `archive_lead` certified
  Disposition B (unavailable — no production executor; not adapted).
- **P5.S1:** `reschedule_tour` — Tour adapter → `rescheduleTourBooking` (exact key; `tour_domain`
  owner remains globally false). Direct booking reschedule route unchanged. Automations may later
  invoke the same Command / react to Tour domain events; Automations do not own Tour mutation
  execution.
- **P5.S2:** `cancel_tour` — destructive preview + strong confirm → `cancelTourBooking`. Direct
  `POST .../bookings/:id/cancel` remains compatibility (Option A). Recovery: schedule a new Tour
  (`reopen_tour` unavailable).
- **P5.S3:** `complete_tour` and `no_show_tour` (alias `mark_tour_no_show`) — Tour terminal adapter →
  `markTourBookingCompleted` / `markTourBookingNoShow`. Distinct capability, event, and BP
  integration identities retained. Direct complete/no-show routes unchanged. `schedule_tour`
  remains uncut; `reopen_tour` unavailable.
- **P6.S1:** Business Process `command_set_v1` — typed process-wide Command selection authority
  hosted on lifecycle builder process JSON. Effective resolver + legacy compatibility precedence.
  Stage `action_catalog_v1` is recommendation/evaluation only. Enrollment Lead proof only;
  editor authority switch and full migration remain later P6 slices. Automations product not shipped.
- **P6.S2:** Runtime consumers (Current Work allowlist/catalog fallback, process-aware stage
  evaluation, optional BOS process-effective slash filter) read through
  `projectProcessRuntimeCommands`. Editors / Work Template authoring unchanged until P6.S3.
- **P6.S3:** Process saves stamp `command_set_v1`; Work Template option authoring gates to process
  selection; publish validates orphans. Process Command picker UI deferred (P6.S4). P6 certified.

### Destructive / replacement Command policy (P4.S1)

Shared server contract under `web/lib/platform/commands/runtime/destructive/`:

- **Impact classes:** delete, archive, deactivate, remove, revoke, cancel, withdraw, end, void, **replace**
- **Replacement ≠ delete** — e.g. `make_primary_contact` displaces prior primary while keeping the link
- Every classified capability requires **preview**, explicit confirmation (`confirm` |
  `strong_confirm` | `typed_confirm`), and a **permission class** (server-owned; client cannot weaken)
- Preview correlation: HMAC-SHA256 token (compact claims; no full payload; TTL + version match)
- Domain adapters own real impact discovery; shared runtime does not scan domain tables
- **P4.S1 state:** destructive preview framework enabled; commit globally disabled until exact allowlist
- **P4.S2–S3 exact commit allowlist:** `make_primary_contact`, `delete_lead` only
- Representative policies also classify (commit still disabled): `archive_lead`, `cancel_tour`,
  `withdraw_child` — existing routes/UI unchanged for those keys

`POST /api/admin/actions/execute` remains the operator/API route name. Dedicated
`/api/admin/relationship-actions/execute` remains available. `/api/admin/mutations/execute`
remains available and unchanged. Command capability diagnostics (internal only) remain at
`/organization/commands`. `/settings/actions` redirects to developer Action Buttons CRUD
(`/adminV2/settings/actions`). Exactly-once applies **per route invocation**,
not distributed idempotency.

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
| **Capability Registry** | Whether a Command identity exists, maturity, and execution owner (honesty — not authorization) |
| **Capability Registry** | Platform-owned Command identities and honesty | Code registry; not inventable by Surfaces/BOS |
| **Process Command selection** | `command_set_v1` on Business Processes | Stages recommend/evaluate selected Commands only |
| **Surface exposure** | Placements / Surfaces product | Where operators encounter effective Commands |
| **Internal diagnostics** | `/organization/commands` | Read-only Capability Registry inspection — not org configuration |
| **Business Process `command_set_v1`** | Which Commands the process selects (sole target process-wide authority; P6.S1) |
| **Stage `action_catalog_v1`** | Stage recommendation / evaluation metadata for selected Commands only |
| **Experience Builder** | Where actions appear on a layout surface (contact row, section, related list) |
| **BOS** | Command-session placement: discover process-effective ∩ adapter-ready Commands, prepare inputs, confirm, invoke shared Runtime bridge (`executePlatformCommandViaActionsApi`) |
| **Command Runtime / Executors** | Invocation governance, authorization, exactly-once delegation, and durable writes |

Legacy note: DB placements + lifecycle builder matrix remain **compatibility / availability** inputs until process migration completes; they are not equal process-wide selection authorities once `command_set_v1` is present.

The **same canonical action key** may launch from:

- Workspace / Work Unit header Actions control band (operational chrome — independent of BOS state)
- Focus Panel Manage / drawer header overflow (record-scoped; distinct from Work Unit Actions)
- Work-unit right rail (legacy / local-rail surfaces only)
- Section / related-list / Experience Builder placements
- Layout `_action_button` (contact block, related-list column)
- Queue row inline action
- BOS proposal (same Operational Command Runtime — BOS is a placement, not the owner of action chrome)
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

Code: `relationshipActionRegistry.ts`, `relationshipActionClient.ts`, `RelationshipActionGuidedModal`,
`executeRelationshipAction`.

**Command Runtime (P3.S1 / P3.S2):** Exact keys may also reach `executeRelationshipAction` through
`POST /api/admin/actions/execute` → Command Runtime facade → thin `relationshipExecutionAdapter`:

| Capability | Fixed registry role (server-owned) |
|------------|-------------------------------------|
| `add_parent_guardian` | `guardian` |
| `link_existing_person` | operator-selected `roleKey` (domain-validated) |
| `add_emergency_contact` | `emergency_contact` |
| `add_authorized_pickup` | `authorized_pickup` |
| `add_billing_contact` | `billing_contact` |
| `add_child` | child identity create/link (`createChildDraft` \| `selectedChildPersonId`) |
| `link_existing_child` | existing child person only (`selectedChildPersonId`) |

Relationship kind/role/cardinality/identity resolution remain Relationship Framework–owned.
Contact-role and child Commands share infrastructure but remain distinct identities.
`make_primary_contact` and the Add Family Member hub are not cut over.

**`make_primary_contact` (P3.S4 classification):** Not Relationship Framework. Household primary
designation via `PATCH /api/admin/customers/:id/household-primary-contact` →
`setHouseholdPrimaryContactForCustomer` (displaces prior `is_primary`, syncs opportunity
`primary_person_id`, emits `household.primary_contact_changed`). Confirm modal required.
**P4.S2 cutover:** Facade preview + correlated commit via destructive replacement adapter.
Capability owner: `admin_action`. Domain authority unchanged.
P4.S1 classifies impact as **`replace`** (strong_confirm, displaced impact required).

### Make Primary Contact

- Relationship/designation action — **not** inline scalar edit on `person.is_primary`.
- **Layout contexts only:** contact block, household contacts widget, contact related-list row.
- **Hidden** from generic header/rail/workspace resolve (`stripMakePrimaryContactFromResolvedActionsBySlot`).
- Requires **target person** at runtime; registry path disabled without target.
- Primary row: read-only **badge**; non-primary row: **Make Primary Contact** button → confirm →
  `PATCH /api/admin/customers/:id/household-primary-contact` → `setHouseholdPrimaryContactForCustomer`.
- Displaces prior household primary (`is_primary`); previous contact remains linked.

### Copy from primary (Household Focus Panel)

- Operator affordance on **secondary / other parent-guardian** rows (alongside Make primary).
- Copies primary Context Detail channels onto the target adult: `email`, `phone`, address fields.
- **Never** copies `first_name` / `last_name`. Empty primary values are skipped.
- Confirm modal → existing `savePersonContact` person PATCH (no new mutation type).
- Helpers: `copyPrimaryContactDetails.ts`; UI: `HouseholdCopyPrimaryContactConfirmModal`.
- **Command Runtime:** P4.S2 facade allowlisted for preview/commit (replacement adapter). Domain
  write remains `setHouseholdPrimaryContactForCustomer`. Capability owner `admin_action` — not
  `executeRelationshipAction`. Direct customer PATCH remains compatibility (Option A).

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
- **BOS Command Runtime Convergence (Mission 1 — frozen):** BOS is a placement over Command Runtime.
  Live slash discovery is process-effective ∩ `bosCommandAdapterRegistry`. Confirmed invoke always
  uses `executePlatformCommandViaActionsApi` → `/api/admin/actions/execute` →
  `executeCommandInvocation`. Representative BOS-ready families: `create_lead` (owner-accepted
  reference), `update_lead_status`, `add_parent_guardian`, `cancel_tour`. Create Lead legacy modal
  remains behind `NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION=0`. Coverage honesty and remaining adapters:
  `../milestones/bos-command-runtime-convergence-closeout.md` and the mission coverage ledger.
  **Surfaces do not configure Commands** — Business Process `command_set_v1` owns selection.

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

**First end-to-end operator wiring (V3 → V6).** Create Lead still has **one** execute path:
`executeCreateLeadCommand.ts` → `POST /api/admin/actions/execute` registered `create_lead`
(no forked mutation path); success/refresh derive from `buildCreateLeadSuccess`. **Primary
operator entry (V6):** Work Unit / Workspace Actions open a BOS command session (Conversation +
Form over `BosCommandDraft`, then Processing identity review / success in-session). **Compatibility
entry:** `CreateLeadCommandSurface` (rich `CreateLeadModal` body) when
`NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION=0`. Form mode inside the session reuses the same strong
gather controls (`ActionWorkspaceGatherFields`) so intake richness is not replaced by a weaker
generic form.

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
