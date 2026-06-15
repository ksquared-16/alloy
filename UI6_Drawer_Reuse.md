# UI-6 — Drawer Communications Tab Reuse

**Commit:** `19e1d65` (UI-5H) → `4662e8b`. **Bundle:** `communications-v2-ui6-drawer-reuse.bundle`.
Mounts the same Family Communication Workspace inside Opportunity / Child / Person drawers, scoped by entity, using the existing `FamilyCommunicationWorkspaceVM` + `family-workspace` API. **No migrations, no send-architecture change, no provider webhooks, no BOS, no modal redesign. The Communications modal (`CommandCenterShell`) is untouched.**

## Implementation

- **`FamilyCommunicationWorkspace.tsx`** (new) — the reusable workspace, **no queue column**: snapshot (family + children chips + health/consent/owner) → timeline (chat with UI-5H delivery status, thread select + "All messages") → composer (UI-5C recipient selector, UI-5E draft, UI-5G review-first send). Self-contained: fetches by `customerId` **or** a drawer entity. Same structure/classes as the locked modal workspace (no redesign).
- **`family-workspace` route** — now accepts `entity_type` + `entity_id` (+ `focus_person_id`) in addition to `customer_id`. When no `customer_id`, it resolves the family via **`resolveCustomerScopeFromEntity`**:
  - `opportunity` → `opportunities.customer_id` + `focusOpportunityId`
  - `child` (`customer_members`) → `customer_id` + `focusChildId`
  - `person` (`customer_persons`; **fallback** to `customer_members.person_id` for child-as-person) → `customer_id` + `focusPersonId`/`focusChildId`
  - `customer` → direct
  `focusPersonId` is threaded into the VM `scope`.
- **`RecordCommunicationsTab`** — when `comms_v2_live_workspace` is on and a drawer entity is present, renders `<FamilyCommunicationWorkspace entity={…}/>`; otherwise the existing record-tab placeholder (preserved). **`CommunicationsDrawerSection`** passes `apiEntityType` + `entityId` (one-line change, behind the existing `comms_v2_record_tab` gate).
- **`timelinePresentation.ts`** (new) — shared pure helpers (relTime/dirLabel/statusDisplay/consent) used by the component.

## Scope by drawer (as required)

| Drawer | entity passed | resolved scope |
|---|---|---|
| Opportunity | `opportunities` + opportunity id | `customerId` + `focusOpportunityId` |
| Child | `customer_members`/person id | `customerId` + `focusChildId` |
| Person | `persons` + person id | `customerId` + `focusPersonId` |

Full Communications **modal behavior preserved** — `CommandCenterShell` is unchanged; drawers get the workspace-only view.

## Tests / verification

- New `resolveCustomerScopeFromEntity.test.ts` — `entityKind` normalization + scope resolution (opportunity/child/person+child-fallback/customer/unknown) with a mocked Supabase.
- Sandbox: all `.ts` strip-check; the 5 pure harnesses still pass **66/66** (no regressions). `.tsx` (component, record tab) brace/structure/icon-verified; JSX/`@supabase` modules validate on the gate via `tsc`.
- Gate: `cd web && npx tsc --noEmit && npm run test -- tests/communications/v2/`.

## API contract notes

`GET /api/admin/communications/family-workspace` — additive params: `entity_type`, `entity_id`, `focus_person_id`. `customer_id` is now optional **iff** `entity_type`+`entity_id` are supplied. Response/VM unchanged (scope now carries `focusPersonId`). `family-send` unchanged.

## Manual QA (staging)

Prereq: a Firefly customer with an opportunity, ≥1 `customer_members` child, ≥1 `customer_persons` parent; flags `comms_v2_record_tab=1` + `comms_v2_live_workspace=1` (+ `comms_v2_compliance=1` to enforce consent on send).

1. `tsc --noEmit` + `npm run test -- tests/communications/v2/` → green.
2. **API (entity):** `GET /family-workspace?entity_type=opportunities&entity_id=<oppId>` → resolves the opportunity's customer; `scope.focusOpportunityId` set; same VM shape. Repeat with `entity_type=persons&entity_id=<parent personId>` and a child member id.
3. **Opportunity drawer:** open it → Communications tab shows the **workspace only** (no queue): snapshot, merged timeline with delivery status, recipient selector (Parent/Guardian), composer. Send via review→confirm; timeline refreshes.
4. **Child drawer / Person drawer:** same workspace, scoped to that family.
5. **Parity:** the drawer workspace matches the modal's workspace pane visually (same structure).
6. **Lock check:** unset `comms_v2_live_workspace` → drawer shows the prior record-tab placeholder; the Communications **modal** is byte-identical regardless.

## Blockers / gaps

1. **Modal/drawer dedupe (known):** the modal (`CommandCenterShell`) still renders its **own inline** workspace pane; the drawer uses the new shared component. They share structure/classes (visually identical) but are two code paths. **Follow-up UI-6.1:** refactor the modal to render `<FamilyCommunicationWorkspace/>` for column 2 (deferred to avoid touching the locked modal unverified). Until then, keep timeline/composer changes mirrored across both.
2. **Person→customer ambiguity:** a person in multiple households resolves to the **first** `customer_persons` row. Multi-household disambiguation (pick the drawer's household) is a later refinement.
3. **Drawer entity types:** resolution covers opportunity/child/person/customer; `jobs` (and any other drawer types) resolve to "unknown" → the tab shows "No conversation." Add mappings if those drawers need Communications.
4. **Receipts/open tracking** still depends on provider webhook ingestion (UI-5H blocker) — unchanged here.
5. Real drawer render is gate-validated (sandbox can't run Next); flag-off keeps the prior placeholder, so rollout is safe.
