# Actions, workflows, and events

## Purpose

Explain how **business facts** become **`workflow_events`**, trigger **workflows**, and drive **effects** — and how **admin actions** fit in.

**Terminology:** **Admin action** refers to UI/system-triggered admin operations; **workflow action** refers to an ordered step executed inside workflow runs. Disambiguation of terms: **`docs/core/glossary.md`**.

## Actions (placement) vs Automations (execution)

| Concern | Settings / config | Runtime |
|---------|-------------------|---------|
| **Where a button appears** | `action_placements` (surface, slot, section, order, enabled) — Settings → Actions V1 for org-scoped rows | `resolveActionsForContext.ts` at render time |
| **What the button does** | `action_definitions` (handler, payload schema) — label editable in Settings V1; create/migrate still platform/seed | `POST /api/admin/actions/execute` → `executeAdminAction.ts` |
| **Side effects & workflows** | Workflow definitions in Automations hub | `emitEvent`, `executeWorkflowRun` |

Settings configures **placement + enablement**, not execution semantics. Older **`record_actions`** chrome and dedicated modals (tour, quote, job) remain alongside the registry — see **`docs/system/configuration-system.md`** (Admin Settings capability inventory).

### Settings → Action buttons (May 2026 closeout)

| Operation | API / module | Notes |
|-----------|--------------|-------|
| List placements + definitions | `GET /api/admin/actions/inventory` | Org + platform rows for Settings UI |
| Approved action catalog | `GET /api/admin/actions/definition-catalog` | Active definitions org may place (no new handlers) |
| Create org placement | `POST /api/admin/action-placements` | Requires existing `action_definition_id`; validates via `actionPlacementMutation.ts` |
| Edit org placement | `PATCH /api/admin/action-placements/[id]` | `is_active`, `entity_type`, `surface`, `slot`, `section_key`, `order_index` |
| Edit org-owned label | `PATCH /api/admin/action-definitions/[id]` | Label only; platform definitions locked |
| Operator copy | `web/lib/admin/actions/actionPlacementPresentation.ts` | Surface/slot labels and inline help |
| UI | `ActionPlacementsSettingsClient.tsx`, `ActionButtonCreatePanel.tsx`, `ActionPlacementFormFields.tsx` | Under **Workflows & automation** on `/adminV2/settings` |

**Surfaces operators may assign in Settings:** `record_header`, `record_section`, `right_rail` (workspace side panel), `queue_row` (workspace queue row). Schema value `workspace` is not resolved by AdminV2 clients yet.

**Ownership:** Built-in platform placements are view-only; operators use **Add org placement** to add an org-owned row for the same approved action. Does **not** extend `executeAdminAction` or add custom handlers.

Closeout: **`docs/sprints/05_2026/completed/settings_control_plane_closeout.md`**.

## Current state

- **`emitEvent`** (`web/lib/emitEvent.ts`) inserts into **`workflow_events`** (server-only, canonical layer).
- **Status transitions:** Many entity PATCH routes and admin actions call **`emitStatusChangedEvent`** (`web/lib/admin/emitStatusChangedEvent.ts`): emits **`opportunity_status_changed`** for entity type `opportunities`, otherwise **`entity_status_changed`**, then fan-out **`executeWorkflowRun`** with `event_id` (grep for call sites).
- **`executeWorkflowRun`** (`web/lib/workflowRun.ts`) loads workflow rows, enriches payload with related entities, evaluates conditions, and runs workflow actions (large implementation).
- **`executeAdminAction`** (`web/lib/admin/actions/executeAdminAction.ts`) routes declarative admin operations; for workflow starts it emits an event and invokes `executeWorkflowRun` with `event_id` for event-driven validation paths.
- **Admin action registry (UI):** `GET /api/admin/actions` resolves placements per surface (`record_header`, `record_section`, `queue_row`, `right_rail`, …) via `resolveActionsForContext.ts`; mutating types run through `POST /api/admin/actions/execute` → `executeAdminAction.ts`. Legacy **`record_actions`** and hardcoded queue/drawer buttons still exist alongside the registry — see **`docs/system/configuration-system.md`**. Client feedback/refetch helpers: `actionSurfaceFeedback.ts` (Card 5). **Full migration deferred** — sprint closeout §12 in `docs/sprints/05_2026/settings_record_ux_parity_sprint.md`.
- **Settings placement editor (V1):** **Settings → Action buttons** (`/adminV2/settings/actions`, under Workflows & automation on the index). **Create:** `POST /api/admin/action-placements` with an existing `action_definition_id` from `GET /api/admin/actions/definition-catalog` — creates an **org placement row only**, not a new execution handler. **Edit (org placements):** enabled, record type, surface (`record_header`, `record_section`, `right_rail` as workspace side panel, `queue_row` as workspace queue row), slot, section key, order; org-owned definition label via `PATCH /api/admin/action-definitions/[id]`. **Built-in** platform placements: view-only with **Add org placement** override. Operator labels/help: `actionPlacementPresentation.ts`. **`surface=workspace`** on workspace root is schema-valid but **not wired** in AdminV2 resolve calls yet — use side panel or queue row. **Layouts** deep-links per drawer section; does **not** own placements. Does **not** change **`executeAdminAction`** semantics. **`condition_config`** not editable in Settings.
- **Status labels vs automation:** Display names — **Settings → Statuses**. Condition-driven status updates (e.g. tour date set → Tour Scheduled) — **Automations** / workflows; read-only reference table **Workflow automation rules** (`status_transition_rules`). Custom handlers — deferred to automation builder (`docs/sprints/05_2026/completed/settings_control_plane_closeout.md`).
- **Action links:** Consumption routes (e.g. `web/app/api/action/[token]/consume/route.ts`) mark links consumed, emit events, and fan out to enabled workflows.
- **Entity-specific PATCH routes** sometimes emit events directly and loop workflows (e.g. job actions in `web/app/api/admin/jobs/[id]/route.ts`).

## How it works

1. A server path decides a business fact is final (payment posted, job action, link consumed, etc.).
2. It builds a payload (`event_type`, `occurred_at`, `org_id`, entity snapshots).
3. It calls **`emitEvent`** where the canonical layer is used.
4. It queries **`workflows`** filtered by **`event_type`**, **`entity_type`**, `enabled`, and org/global scope.
5. For each match, **`executeWorkflowRun`** records a run and executes actions (side effects).

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Event insert | `web/lib/emitEvent.ts` |
| Status-driven workflow fan-out | `web/lib/admin/emitStatusChangedEvent.ts` |
| Workflow runner | `web/lib/workflowRun.ts` |
| Admin action execution | `web/lib/admin/actions/executeAdminAction.ts` |
| Action link consume | `web/app/api/action/[token]/consume/route.ts` |
| Manual workflow run API | `web/app/api/admin/workflows/[id]/run/route.ts` |

## Guardrails

- **Do not** implement a new side-effect chain that mutates multiple tables without considering whether it should be workflow-driven for auditability and org parity.
- **Do not** skip **`emitEvent`** when extending event-driven flows that expect **`event_id`** on runs.
- **UI guardrail:** Buttons should call APIs that encapsulate this chain — not replicate it in the client.

## Known gaps / risks

- **Workflow Assist (AI):** Propose/apply paths call existing workflow CRUD and **`executeWorkflowRun`** patterns — **no** bypass of this spine. **Template expansion paused**; operational **action button cleanup** and event coverage remain higher priority (`roadmap-and-gaps.md`).
- **Verified (2026-05-02):** Exhaustive route/mutation inventory and **`emitEvent`** coverage — see **`docs/audits/event-integrity-audit.md`**. Remaining high-risk gaps (e.g. GL posting routes, book-v2 discount path, contact create) are listed there.
- **Verified (2026-05-02):** Workflow fan-out consistency for **status changes**, **message send**, and **scheduling** — see **`docs/audits/workflow-execution-consistency-audit.md`** (includes intentional deviations such as manual workflow run without `event_id` and cancellation fee side effects).
- Workflow payload still includes **`contact`** alongside **`person`** in `executeWorkflowRun` — treat **`person`** as preferred for new payload enrichment.

## When this doc must be updated

New canonical `event_type` values, changes to `executeWorkflowRun` contract, or admin action types.
