# Actions Runtime Audit (Phase 1)

**Sprint:** Alloy Actions Foundation — Audit, Contract, and Execution Runtime
**Date:** June 2026
**Scope:** All action-related code, config, tables, seeds, routes, and UI surfaces.
**Goal of audit:** Stop treating actions as loose UI buttons. Establish ground truth so we can build a
consistent **Actions Runtime** where config exposes/configures actions and code owns executable behavior.

---

## 0. Executive summary

Alloy already has substantial action infrastructure, but it is **fragmented across parallel tracks** and
the contract between *configuration* and *executable behavior* is implicit rather than enforced.

| Track | Tables | Resolve | Execute |
|-------|--------|---------|---------|
| **Modern (primary)** | `action_definitions` + `action_placements` | `GET /api/admin/actions` → `resolveActionsForContext` | `POST /api/admin/actions/execute` → `executeAdminAction` |
| **Enrollment status (parallel)** | (uses action def `update_enrollment_status`) | `enrollment-status-transition/context` | `POST /api/admin/enrollment-status-transition/execute` |
| **Relationship actions (parallel)** | (canonical relationship registry) | client wizard | `POST /api/admin/relationship-actions/execute` |
| **Legacy record chrome** | `record_actions` (`event_key`) | `GET /api/admin/record-actions` | drawer maps `event_key` → handler |
| **BOS proposals** | none (ephemeral/durable proposals) | intent router | `/api/admin/ai/*-assist/apply` |

### Core findings

1. **No single enforced registry.** `executeAdminAction` is a large `switch`, not a typed registry of
   handlers. `canonicalActionRegistry.ts` is a *catalog of metadata* but does not own eligibility,
   required-input, preview, or execute functions. There is no compile-time or runtime guarantee that a
   configured action key maps to an executable handler.
2. **Unknown keys fail silently.** A configured `action_definition` / `record_action` with an
   unregistered key renders a button that does nothing useful (or 400s) at click time. There is no
   dev/test guard.
3. **`event_key` has three unrelated vocabularies** (record chrome handler keys, `workflow_events.event_type`,
   tour comms template keys), which makes "reference a known event/action key" ambiguous.
4. **Update Status is split** into a working enrollment path (AdminV2) and a **broken legacy path**
   (`AdminEntityDrawerLegacy` posts `update_status_add_note` to `/actions/execute`, which after migration
   `20260622220000` no longer has a `submit_action_type` handler and returns 400).
5. **Preview/dry-run exists only for enrollment status** (`enrollment-status-transition/preflight`).
   `POST /api/admin/actions/preflight` exists but is **never called by any client**; preflight only runs
   *inside* execute for a small allowlist.
6. **Mutations are correctly server-side** — no client-side Supabase writes were found in action UI. But
   the *route choice* is inconsistent (execute vs enrollment-status vs relationship-actions vs inline
   PATCH in the legacy drawer).

### What this sprint adds (foundation)

- A typed **Action Registry** (`web/lib/adminV2/actions/`) that makes each action a first-class contract:
  `actionKey`, label, supported entity/process, required context, payload schema, eligibility resolver,
  required-input resolver, preview/dry-run builder, execute handler (delegating to the existing
  invariant-owning server code), audit metadata, result contract.
- A registry-gated executor + eligibility API so **BOS and manual UI execute through the same path**.
- Config validation so unregistered keys **fail loudly in dev/test** and render disabled in UI.

---

## 1. Data + config layer

### 1.1 Tables

| Table | Created in | Role | Key columns |
|-------|-----------|------|-------------|
| `action_definitions` | `20260427180000_action_definitions_and_placements.sql` (repaired `20260430215000`) | Modern capability definition | `key`, `entity_type`, `action_type` (CHECK: navigate, open_drawer, open_form, update_status, update_field, start_workflow, external_link, ui_intent), `condition_config`, `payload_schema`, `workflow_id`, `org_id` (NULL = platform) |
| `action_placements` | same (+`20260429120000` section_key) | Where a definition appears | `surface`, `slot`, `entity_type`, `department_id`, `work_unit_id`, `section_key`, `order_index`, `display_style`, `condition_config` |
| `record_actions` | `20260409140000_record_layouts_and_record_actions.sql` | **Legacy** record chrome buttons | `entity_type`, `action_key`, `label`, `event_key`, `placement` |
| `action_links` | `20260329165048_remote_schema.sql` | Magic-link tokens (adjacent) | `action_type`, `token`, `expires_at`, `consumed_at` |
| `workflow_events` | remote schema | Append-only business facts | `event_type` |
| `workflow_actions` / `workflow_action_runs` | remote schema | Steps inside workflow defs / run log | `action_type`, `payload` |
| `status_transition_rules` | status rules migration | Blocked/required-field rules for status changes | `from_status_key`, `to_status_key`, `blocked`, `required_metadata_fields`, `required_payload_fields` |
| `status_definitions` | status defs migrations | Allowed status keys/labels per entity (org + industry defaults) | `entity_type`, `status_key`, `status_label`, `metadata.lifecycle_stage` |

**RLS:** `action_definitions` / `action_placements` — authenticated SELECT where `org_id IS NULL OR org_id = current_org_id()`; service_role ALL. Mutations are server-only.

### 1.2 Seeds

- **No `supabase/seed.sql`.** All action rows are seeded via idempotent migration `INSERT`/`UPDATE`.
- **Global platform definitions** (`org_id IS NULL`): enrollment set (`open_record`, `qualify_opportunity`,
  `start_quote`, `mark_won`, `mark_lost`, `schedule_tour`, …); comms/BOS (`quick_message`, `ask_bos`);
  **canonical catalog v1 (34 keys, `is_active=false` stubs)**; relationship actions (`add_child`,
  `add_family_member`, …); `update_enrollment_status` (`20260622220000`).
- **Org-scoped seeds** for enrollment departments (`create_inquiry`, placeholders, `contact_attempted`, …).
- **`record_actions` seeds (legacy):** job (`collect_payment`, `assign_vendor`), schedule (`reschedule`,
  `cancel_visit`), opportunity (`qualify_opportunity`, `start_quote`, `mark_lost`).

### 1.3 `event_key` — three vocabularies (ambiguity flagged)

1. **`record_actions.event_key`** — UI chrome handler identifiers. Mapped in
   `web/lib/recordChrome/opportunityRecordActionMap.ts` (`qualify_opportunity` → `{status_key:"contacted"}`, etc.).
2. **`workflow_events.event_type`** — workflow spine. Editor vocab in `web/lib/workflowVocab.ts`
   (`booking_confirmed`, `payment_succeeded`, `form_submitted`, …); smaller set in `web/lib/events.ts`.
3. **Tour comms template `event_key`** — `web/lib/tours/comms/tourCommsConfig.ts`
   (`tour_confirmation`, `tour_reminder`, …) — *not* `workflow_events`.

> **Doctrine implication:** "config may reference known event/action keys" must be scoped. The Actions
> Runtime keys on **`action_definitions.key` / registry `actionKey`**, and *emits* `workflow_events.event_type`
> as a side effect. The two namespaces should not be conflated.

### 1.4 Config code (config plane — does NOT own mutations)

| File | Role |
|------|------|
| `web/lib/admin/actions/actionDefinitionRegistry.ts` | `ACTION_BUTTON_LIBRARY` — 11 settings-configurable keys |
| `web/lib/admin/actions/canonicalActionRegistry.ts` | `CANONICAL_ACTION_REGISTRY` — metadata catalog (no executable fns) |
| `web/lib/admin/actions/actionPlacementPresentation.ts` | Operator labels for surfaces/slots |
| `web/lib/admin/actions/actionPlacementEditorUi.ts` / `actionPlacementMutation.ts` | Settings grouping + placement PATCH/POST validation |
| `web/components/adminV2/settings/actions/*` | Settings UI (queue, detail panel, catalog modal) |
| `web/lib/admin/actions/resolveActionsForContext.ts` | **Runtime resolve** of placements → `ResolvedActionsBySlot` |

---

## 2. Action inventory (per-action audit table)

Status legend: ✅ works · 🟡 partial · ❌ broken · ❔ unknown

| Action label | Key / event_key | Where it appears | Entity / process | Expected payload | Current handler / API route | Status | Failure mode | Recommended fix |
|---|---|---|---|---|---|---|---|---|
| **Create Lead** | `create_lead` | Workspace actions rail, dept page, work-unit page, drawer header | opportunity / enrollment (capture-first, no entity yet) | `{first_name,last_name,email?,phone?,location_id?,department_id?,work_unit_id?,household commit selection…}` | `CreateLeadModal` → `executeCreateLeadFromModal` → `POST /api/admin/actions/execute` → `executeCreateLeadAction` | ✅ (🟡 spec) | Server enforces only first/last + email\|phone; stage `field_rules` enforced client-side only — server/client parity gap | Register in Action Registry; required-input resolver reads intake spec server-side; keep mutation in `executeCreateLeadAction` |
| **Update Status (enrollment)** | `update_enrollment_status` (alias `update_status_add_note`) | Drawer header, queue row, BOS rail (AdminV2) | opportunity + OCM (child grain) / enrollment | `{opportunity_id,destination_key,target_status_key?,note?,bypass_reason?,scope{grain,ocm_id?}}` | `ChangeEnrollmentStatusModal` → `POST /api/admin/enrollment-status-transition/{context,preflight,execute}` | ✅ | — (works on AdminV2) | Wrap as registry `update_status` reference impl; reuse preflight as eligibility resolver |
| **Update Status (legacy drawer)** | `update_status_add_note` | `AdminEntityDrawerLegacy` `UpdateStatusAddNoteModal` | opportunity | `{status_key,note?,…}` to `/actions/execute` | `executeAdminAction` open_form path | ❌ | After `20260622220000`, `update_status_add_note` is `open_form` w/ no `submit_action_type` → executor returns 400 "open_form v1 supports … start_workflow, update_status, or append_note" | Route legacy drawer through `ChangeEnrollmentStatusModal` + enrollment routes (or registry executor) |
| **Generic update_status** | `update_status` | Resolved actions; `qualify_opportunity`, `mark_won`, `mark_lost`, `move_to_qualification`, `move_to_waitlist`, `approve_enrollment` | opportunities (case) / child (OCM) | `{status_key, …required fields}` | `executeAdminAction` `case "update_status"` → `assertAllowedStatusKey` + `validateOpportunityStatusTransitionForAction` → UPDATE + `emitStatusChangedEvent` + `action_executed` | ✅ | Confusing case-vs-OCM grain; `qualify_opportunity` seed says `contacted` but lifecycle uses `contact_attempted` | Generic `update_status` registry entry with grain in payload; align seeds |
| **Qualify opportunity** | `qualify_opportunity` (event_key) | Opportunity record chrome (legacy) | opportunity | n/a (maps to `{status_key:"contacted"}`) | `opportunityRecordActionMap.mapOpportunityRecordActionToPatch` → PATCH | 🟡 | Parallel patch path bypasses registry/validation | Fold into registry `update_status` |
| **Schedule tour** | `schedule_tour` | Drawer header, queue | opportunity / enrollment | tour booking fields | tour modal → `/api/admin/tours/bookings`; preflight in execute allowlist | ✅ | Multiple shapes across migrations (`update_status` → `open_form` → `start_workflow`) | Register; declare executor = tour booking handler |
| **Record tour outcome** | `record_tour_outcome` | Tour lifecycle bar / drawer | opportunity / enrollment | outcome fields | `executeRecordTourOutcomeAction` (preflight allowlist) | ✅ | — | Register |
| **Confirm tour** | `confirm_tour` | Drawer (`ui_intent`) | opportunity | — | `applyRegistryResolvedActionClient` inline `fetch('/actions/execute')` inside `ui_intent` branch | 🟡 | Special-cased inline fetch bypasses modal/preflight pattern | Register; remove inline special case |
| **Mark lost** | `mark_lost` | Drawer header, queue (open_form) | opportunity | `{lost_reason}` | `MarkLostModal` → `executeMarkLostFromModal` → execute (`validateMarkLostPayload`) | ✅ | — | Register |
| **Add note** | `add_note` / `update_status_add_note` append | Drawer, queue | opportunity | `{note}` | `AddNoteModal` → execute (append_note path) | ✅ | — | Register (universal) |
| **Contact attempted** | `contact_attempted` | Queue, drawer | opportunity | `{note?,next_step?}` | `ContactAttemptedModal` → execute (open_form update_status) | ✅ | — | Register |
| **Add child / sibling / family member** | `add_child`, `add_sibling`, `add_family_member` | Drawer header/section, BOS rail | opportunity/person / enrollment | relationship wizard payload | `relationship_execute` → `POST /api/admin/relationship-actions/execute` (and some via `executeAdminAction` open_form) | 🟡 | Two execute paths (relationship-actions vs actions/execute) for similar intent | Register w/ executor kind = relationship_execute; converge |
| **Make primary contact** | `make_primary_contact` | Drawer contact block | person/customer | `{person_id}` | dedicated modal → relationship execute; emits `household.primary_contact_changed` | ✅ | — | Register (dedicated_modal executor) |
| **Quick message** | `quick_message` (ui_intent) | Queue rail, drawer | opportunity | — | `applyRegistryResolvedActionClient` opens comms; no mutation | ✅ | — | Register as ui_intent (non-mutating) |
| **Ask BOS** | `ask_bos` (ui_intent) | Queue rail, drawer header CTA | any | context | `launchContextualAskBos` → BOS handoff (no auto-execute) | ✅ | — | Register as ui_intent |
| **Send form / enrollment packet** | `send_form`, `send_enrollment_packet` | Drawer | opportunity | form/template ids | modals → comms/form-send APIs | 🟡 | Direct comms API, not registry executor | Register; declare executor |
| **Open record / navigate** | `open_record`, `new_inquiry`, `open_enrollment_work_unit` | Queue rows, workspace | various | route params | `applyRegistryResolvedActionClient` navigate (no mutation) | ✅ | — | Register as navigate (non-mutating) |
| **Job: collect payment / assign vendor** | `collect_payment`, `assign_vendor` (event_key) | Legacy job drawer | job | — | `record_actions` → `onRecordChromeAction(event_key)` | ❔ | Legacy chrome; handler coverage unverified | Audit handlers; migrate or register |
| **Schedule: reschedule / cancel** | `reschedule`, `cancel_schedule` (event_key) | Legacy schedule drawer | schedule | — | `record_actions` chrome handlers | ❔ | Same as above | Audit; register |
| **Canonical catalog stubs (34)** | `call_parent`, `send_sms`, `upload_document`, `reserve_spot`, `assign_classroom`, `withdraw_child`, … | Catalog only (`is_active=false`) | enrollment | varies | None (stubs) | ❔ | No handler; would render broken if activated | Each must map to a registered handler before activation; block activation otherwise |

---

## 3. Update Status — deep dive

**Canonical grains** (`docs/platform/core/status-and-state-system.md`):
- Case grain → `opportunities.status_key` (household coordination).
- Child enrollment grain → `opportunity_customer_members.outcome_status_key`.

**Working path (AdminV2):** `ChangeEnrollmentStatusModal` →
`/api/admin/enrollment-status-transition/{context,preflight,execute}`:
- `context` loads children, destinations, scope.
- `preflight` is a real **dry-run**: BP destination eligibility, lifecycle field rules, tour-bypass policy,
  skipped-stage detection.
- `execute` mutates OCM `outcome_status_key` (child/candidate) or case `status_key` (case), applies stage
  operating-plan outcome effects, emits `enrollment_status_tour_bypassed` (if bypass) + `action_executed`.

**Generic path:** `executeAdminAction case "update_status"` → `assertAllowedStatusKey` →
`validateOpportunityStatusTransitionForAction` → `validateStatusTransition` (reads `status_transition_rules`:
`blocked`, required metadata/payload) → UPDATE → `emitStatusChangedEvent`.

**Broken path:** `AdminEntityDrawerLegacy` posts `update_status_add_note` to `/actions/execute`. The global
def is now `open_form` w/ `form_key:update_enrollment_status` and **no `submit_action_type`**, so the executor
returns 400. AdminV2 avoids this by intercepting client-side and opening the enrollment modal.

**Validation layers that already exist (reusable for eligibility resolver):**
`enrollmentStatusTransitionBpResolver`, `evaluateEnrollmentStatusTransitionPreflight`, `assertAllowedStatusKey`,
`validateStatusTransition`, `enrollmentStatusTransitionPolicy` (tour bypass).

---

## 4. Create Lead — deep dive

**Flow:** click → `adminv2:open-create-lead` / `host.openCreateLead()` → `CreateLeadModal` (gather → review →
execute) → reads `GET /api/admin/lifecycle/action-intake-spec` + `POST /api/admin/intake/record-resolution`
(duplicate detection) → `executeCreateLeadFromModal` → `POST /api/admin/actions/execute` (sentinel
`entity_id = __create_lead__`) → `executeCreateLeadAction`.

**Records created:** `persons` → `customers` → `customer_persons` → `opportunities` (status from
`resolveLifecycleCreateLeadBinding`, default `open`) → `opportunity_persons` → optional child OCM / household
commit / layout runtime fields → `emitStatusChangedEvent` (null → status) → `action_executed`.

**Gap:** server validates only `first_name`, `last_name`, and `email|phone`; full stage `field_rules` are
enforced **client-side** via `validateCreateLeadFromIntakeSpec`. No server-side draft preflight (the
`/actions/preflight` route requires an `entity_id`). Required-input parity is the main hardening target.

---

## 5. Mutation API routes (action UI → writes)

| Route | Method | Auth | Mutates |
|-------|--------|------|---------|
| `/api/admin/actions/execute` | POST | `requireAdminOrOps` + `getAdminContextCached` + `getAdminAccessContextCached` | create_lead, update_status (case/OCM), open_form (update_status/append_note/start_workflow), update_field, start_workflow, tour, relationship adds |
| `/api/admin/actions/preflight` | POST | same | **read-only dry-run; unused by any client** |
| `/api/admin/enrollment-status-transition/{context,preflight}` | POST | `requireAdminOrOps` | read-only |
| `/api/admin/enrollment-status-transition/execute` | POST | `requireAdminOrOps` | OCM/case status + outcome effects |
| `/api/admin/relationship-actions/execute` | POST | `requireAdminOrOps` | persons, links, OCM per relationship key |
| `/api/admin/tours/bookings[/…]` | POST | admin | tour bookings |
| `/api/admin/record-actions` | GET | admin | read (legacy chrome list) |

**Audit/events:** `emitEvent` → `workflow_events`. Status: `emitStatusChangedEvent`
(`opportunity_status_changed`) / `emitChildLifecycleStatusChangedEvent`. Every execute path emits
`action_executed` with `actor_user_id`.

**No client-side Supabase mutations** were found in action components — the server boundary is correct;
the inconsistency is *which* route, not direct DB writes.

---

## 6. Client dispatch + BOS

- **Canonical client dispatcher:** `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` —
  navigate/external_link use payload only; mutating types `POST /api/admin/actions/execute`; enrollment
  status + relationship + create_lead intercepted to open modals.
- **BOS** is a separate propose→confirm→apply pipeline (`/api/admin/ai/{task,workflow,config-layout}-assist/*`).
  Registry `ui_intent` `ask_bos` only *opens* BOS with context; it does not auto-execute. **Today BOS
  proposals do not flow through `executeAdminAction`.** This sprint should make confirmed BOS proposals call
  the same registry executor for the actions it can execute (starting with create_lead).

**Flagged fragmentation to converge (later phases):**
- `confirm_tour` inline fetch in the central client.
- Duplicate inline execute helper in `useOpportunityDrawerVmRegistryModals`.
- Inline execute bodies in the work-unit page `onAction` fallback + modal submits.
- `ChangeEnrollmentStatusModal` parallel API (intentional, but should be a registry executor kind).
- `AdminEntityDrawerLegacy` direct PATCH paths and the broken `update_status_add_note` post.
- Person drawer still uses legacy manage-menu stubs (no registry).

---

## 7. Recommendations → mapped to sprint phases

| Finding | Phase |
|---|---|
| No typed registry owning eligibility/required-input/preview/execute | **Phase 2** — `web/lib/adminV2/actions/` registry + contract |
| Update Status split + legacy broken | **Phase 3** — `update_status` reference impl through registry (enrollment preflight as eligibility) |
| Create Lead server/client parity gap; BOS not on same path | **Phase 4** — `create_lead` reference impl; BOS confirmed proposal → same executor |
| Unknown keys fail silently | **Phase 5** — config validation: unknown key fails loud in dev/test, UI disables |
| Coverage gaps | **Phase 6** — tests (registry rejects unknown, mapping, eligibility, transitions, structured errors, no client mutation) |
| Doctrine implicit | **Phase 7** — actions-and-workflows, BPS, ai-platform, implementation-patterns |

### Doctrine to encode

- **Action = configured invocation of a registered capability.** Config controls presentation +
  constraints (label, description, placement, order, visibility, process/entity scope, required-input hints,
  confirmation copy). Config **cannot** control raw mutation behavior, DB tables, arbitrary payload schemas,
  or unregistered keys.
- **Every executable action maps to a registered server handler.** Code owns validation, eligibility,
  required inputs, mutation, audit, and result.
- **BOS suggests/proposes; user confirms; server executes** — through the same registry executor as manual UI.
- **Process required info informs eligibility/blockers; status transitions are validated server-side.**

---

## 8. Runtime V2 — Placement, Context, Execution Convergence (June 2026)

Canonical model: **one registered action → many placements → many invocation contexts → one execution runtime.**

| Layer | Owns | Code |
|---|---|---|
| Registered Action | Capability (handler, payload, eligibility, preview, execute, audit) | `web/lib/adminV2/actions/actionRegistry.ts` |
| Action Placement | Presentation (where/visibility/order/label/confirmation) | `action_placements` + `web/lib/admin/actions/actionPlacementPresentation.ts` |
| Invocation Context | How the target record is resolved | `web/lib/adminV2/actions/invocationContext.ts` |
| Execution Runtime | Eligibility → preview → execute → audit → refresh | `web/lib/adminV2/actions/actionExecutor.ts` |

**Logical placements** (decoupled from physical `action_placements.surface`): `work_unit_actions`, `focus_panel_manage`, `queue_row_menu`, `bos_recommendations`.

### Operational Command Runtime (refined model — June 2026)

The Actions Runtime is the **Operational Command Runtime**. Every operational mutation is a command:
registered capability + placement + **context resolution** + eligibility + **required subjects** +
required inputs + preview + execution + audit + refresh.

**Context resolution** (`ContextResolution`, replaces the weaker `record_inherited` / `entityId=null` model):
`current_record`, `user_selection`, `queue_selection`, `suggested_record`, `bos_proposal`, `open`.

**Required subject** (`RequiredSubject`): `none`, `opportunity`, `person`, `child`, `case`, `multiple_opportunities`
(derived via `requiredSubjectForAction`).

Default mapping (`resolveContextResolution`): no required subject → `open`; `focus_panel_manage` /
`queue_row_menu` → `current_record`; `work_unit_actions` → `user_selection`; `bos_recommendations` →
`bos_proposal`. A Work Unit command has **no inherited subject yet** (not `entityId = null`); a suggested
record (last-opened, BOS) is **optional context, never the authoritative subject** — `resolveCommandSubject`
returns `needs_subject` for every selection/proposal resolution even when a suggestion exists.

**Operator command states** (`commandState.ts` → `describeCommandState`): `available`, `disabled_blocked`,
`needs_subject`, `needs_required_input`, `preview_ready`, `confirmation_required`, `executing`, `success`,
`failure`. `operatorErrorCopy` maps technical errors (e.g. `entity_id required`) to user decisions so a
command never fails as a raw stack trace where the operator must choose a subject or supply input.

### Phase 1 risk dispositions

| # | Item | Disposition | Evidence / file paths |
|---|---|---|---|
| 1 | Legacy `update_status_add_note` | **Retired** | Removed `UpdateStatusAddNoteModal` render + inline `/api/admin/actions/execute` POST and import in `web/components/admin/AdminEntityDrawerLegacy.tsx`; stale `open_form` form_key now shows a "moved" message instead of opening nothing. Status changes run exclusively via the registered Update Status action (`ChangeEnrollmentStatusModal` + `enrollment-status-transition` runtime). |
| 2 | `confirm_tour` | **Registered** | `web/lib/adminV2/actions/definitions/confirmTourAction.ts` + registry entry. Routes through `runRegisteredAction`, delegating to the canonical `executeAdminAction` confirm_tour handler (`executeConfirmTourAction`). Client transport in `applyRegistryResolvedActionClient.ts` updated to the canonical string-`error` envelope. |
| 3 | Duplicate inline execute helpers | **Partially converged; rest deferred** | `confirm_tour` special-case now hits the registered runtime. **Deferred (documented):** legacy-drawer inline execute blocks (`AdminEntityDrawerLegacy.tsx` ~L19184–19389 schedule_tour/record_tour_outcome/contact_attempted/mark_lost/add_note modal submits), `useOpportunityDrawerVmRegistryModals.tsx:113` local executor, and work-unit page modal submits (`page.tsx` ContactAttempted/AddNote ~L7655/L7736). These live in protected/legacy drawer surfaces; converge alongside a dedicated drawer-runtime task to avoid reveal regressions. |
| 4 | Parallel action routes | **Documented (intentional domain executors)** | `enrollment-status-transition/{context,preflight,execute}` and `relationship-actions/execute` are domain executors for `update_enrollment_status` / relationship keys; they remain authoritative. `record-actions/route.ts` is a **legacy catalog read** (GET only, no execute). Convergence target: register `update_enrollment_status` as an executor delegating to the enrollment route. |
| 5 | Person drawer Manage stubs | **Documented (deferred, low risk)** | `web/lib/admin/recordManage/buildRecordManageMenu.ts` person/child items are `enabled: false` ("Coming soon"); they cannot silently fire. Latent footgun: legacy opportunity header `delete_lead` is enabled with a no-op `onManageSelect` (`AdminEntityDrawerLegacy.tsx`) — only reachable on legacy-admin. Hide or wire before enabling. |

### Surfaces already conformant (verified, no change needed)

- **Focus Panel Manage already owns record-scoped actions** — `OpportunityFocusPanelHeader` → `OpportunityDrawerHeaderControls` → `RecordDrawerManageMenu` fed by `displayVm.actions.header_menu`, executed `surface: record_header`, `entityId: drawer.id` (record_inherited).
- **Work Unit Actions Rail is Work-Unit-scoped** — catalog resolved with `surface=work_unit`, `entityId=null`; available actions do **not** change with queue selection. Record-requiring actions now prompt for a record when none is selected instead of leaking a technical error (`page.tsx` rail branch), and `schedule_tour` opens a record picker.
