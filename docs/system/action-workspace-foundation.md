---
owner: runtime
status: frozen
last_reviewed: 2026-07-12
supersedes: []
---

# Action Workspace Foundation

**Path:** `docs/system/action-workspace-foundation.md`  
**Status:** V1.1 — Create Lead reference implementation (UX polish)  
**Date:** 2026-06-08

## Purpose

Define the canonical Alloy **Action Workspace** — where operators and BOS complete operations together.

| Surface | Role |
|---------|------|
| **Workspace** | Where work is organized (queues, lanes, rails) |
| **Drawer** | Where records live (detail, layout runtime, history) |
| **Action Workspace** | Where humans + BOS gather, review, execute, and continue |

Future actions should migrate to this pattern: Create Lead, Add Parent, Add Child, Schedule Tour, Send Message, Create Task, Move Stage, Enroll Child.

## UX contract

All actions follow:

**Gather → Review → Execute → Success / Continue**

| Principle | Rule |
|-----------|------|
| BOS assists | May suggest, extract, prepare, explain |
| User approves | BOS must not execute without explicit confirmation |
| Review is read-only | Back returns to Gather for edits |
| Execute is visible | Show explicit in-progress state |
| Success before continue | Brief success, then host opens record/drawer |

## Visual contract

Action Workspace is **not** a small centered modal and **not** the entity drawer.

- Centered overlay (~80vw; height `min(calc(100vh - 8.5rem), 820px)` — clears BOS Command Center)
- No workspace vertical scroll (`overflow-hidden` on panel + content)
- Soft backdrop; workspace remains visible
- Rounded, elevated panel with persistent header + footer
- BOS-first gather canvas (paste → suggestions → details)
- Step rail in header (Gather → Review → Execute → Continue)

### BOS Command Center vs Action Workspace

| Surface | Role |
|---------|------|
| **BOS Command Center** | Conversation, exploration, cross-record assist |
| **Action Workspace** | Structured execution — gather, review, create |

Shared gold BOS visual language; workspace sits above Command Center (`ACTION_WORKSPACE_LAYER_Z = 98`).

**Shell:** `web/components/admin/actions/ActionWorkspaceShell.tsx`  
**Layer:** `ACTION_WORKSPACE_LAYER_Z` in `web/lib/admin/actions/actionWorkspaceLayer.ts`

## Shared components (V1)

| Component | Role |
|-----------|------|
| `ActionWorkspaceShell` | Overlay chrome, step rail slot, header/footer |
| `ActionWorkspaceStepRail` | Progress indicator |
| `ActionWorkspacePasteCanvas` | Large paste area + Analyze with BOS |
| `ActionWorkspaceBosSuggestions` | Review/apply suggestions before field write |
| `ActionWorkspaceGatherFields` | Editable gather sections |
| `ActionWorkspaceReviewSummary` | Read-only confirm summary |
| `ActionWorkspaceExecuteState` | In-progress feedback |
| `ActionWorkspaceSuccessState` | Post-create continue handoff |

Types: `web/lib/admin/actions/actionWorkspaceTypes.ts`

## BOS suggestion pattern (V1.1 gather phases)

Inside **Gather**, three exclusive sub-phases:

1. **paste** — paste canvas + Analyze only (no form)
2. **bos-results** — suggestions + confidence + inline edit + Apply (no form)
3. **details** — tabbed gather form after Apply or manual entry

Flow:

1. Operator pastes → **Analyze with BOS** (`ActionIntakePasteParser`)
2. Suggestions in `ActionWorkspaceBosSuggestions` — not auto-applied; editable inline
3. **Apply** → gather fields populate → details phase
4. **Review** (conditional) or **Create lead** fast path → Execute → Success → `onCreated`

Fast path skips Review when all applied suggestions are high confidence, platform minimum met, and user made no edits. See `canFastPathCreateLead` in `actionWorkspaceGatherFlow.ts`.

V1 parser: `parseCreateLeadIntakeText` (deterministic). AI swap behind same interface later.

## Create Lead (reference implementation)

**Component:** `web/components/admin/opportunity/actions/CreateLeadModal.tsx`  
**Gather config:** `web/lib/admin/actions/createLeadPlatformGather.ts`

### Requiredness (platform minimum only)

Create Lead enforces only what is needed to create a record:

- Parent/guardian first + last name
- Email **or** phone

Lifecycle **Required Information** is **not** blocking at create. Additional fields (child, program, source, notes) are optional gather — they flow into readiness / Needs Attention after creation.

### Execution

Unchanged platform path:

`executeCreateLeadFromModal` → `POST /api/admin/actions/execute` (`create_lead`) → `executeCreateLeadAction`

Optional `intake_notes` stored on opportunity `metadata`.

### Host wiring

```tsx
<CreateLeadModal
  open={open}
  departmentId={departmentId}
  onClose={() => setOpen(false)}
  onSubmit={async (payload) => {
    const opportunityId = await executeCreateLeadFromModal({ payload, ... });
    return { opportunity_id: opportunityId };
  }}
  onCreated={(opportunityId) => openDrawer(...)}
/>
```

`onSubmit` runs during **Execute**. `onCreated` runs after **Success** animation (~1.4s) — not immediately on API return.

## Adding a new action

1. Define gather fields + platform minimum validation (if any)
2. Optional: parser implementing `ActionIntakePasteParser`
3. Compose `ActionWorkspaceShell` with step state machine
4. Wire existing `executeAdminAction` path on Execute step
5. Host `onCreated` for drawer/navigation handoff

## Related docs

- `docs/archive/2026-06-superseded-system/actions-and-workflows.md` — execute path
- `docs/sprints/archive/06_2026/lifecycle_action_intake_model.md` — intake spec design (lifecycle fields post-create)
- `docs/sprints/archive/06_2026/create_lead_action_ux_foundation.md` — prior sprint closeout
- `docs/sprints/archive/06_2026/program_interest_configurable_model_audit.md` — program/schedule/room option model (audit before implementation; impacts Create Lead + Add Child gather fields)
- `docs/sprints/archive/06_2026/location_scoped_programs_configuration_design.md` — Settings → Locations tabs (Programs/Offerings, Rooms/Cohorts), V1 site offerings derived from rooms, form cascade

## Visual review (dev gallery + screenshots)

**Live gallery (dev only):** `http://localhost:3000/dev/action-workspace-review`

**Regenerate screenshots:**

```bash
cd web && npm run dev   # separate terminal
cd web && npm run screenshots:action-workspace
```

Output: `docs/sprints/archive/06_2026/assets/action-workspace-review/`

| File | Step |
|------|------|
| `01-bos-intake.png` | BOS intake (paste only) |
| `02-bos-suggestions.png` | BOS suggestions before Apply |
| `03-gather-details.png` | Gather details after Apply |
| `04-review.png` | Review (conditional) |
| `05-execute.png` | Execute |
| `06-success.png` | Success / Continue |

Sprint notes: `docs/sprints/archive/06_2026/action_workspace_v1_1_polish.md`

## Tests

```bash
cd web && npm run test -- tests/admin/actions/actionWorkspaceFoundation.test.ts tests/lifecycle/actionIntakePasteParser.test.ts
```
