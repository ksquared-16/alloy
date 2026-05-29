# Configured drawer actions fix (2026-05-29)

## Problem

The Opportunity drawer header showed hardcoded **Send form** and **Send enrollment packet** buttons alongside registry-resolved actions. Settings → Action buttons had a non-functional **Edit** flow (editor opened off-screen and dropped placement slot on save), and operators lacked a clear way to reorder drawer actions.

## What was hardcoded

| Button | Location | Handler |
|--------|----------|---------|
| Send form | `AdminEntityDrawer.tsx` header rail | `setOppSendFormOpen(true)` → `SendFormToOpportunityModal` |
| Send enrollment packet | `AdminEntityDrawer.tsx` header rail | `setOppLaunchPacketOpen(true)` → `OpportunityEnrollmentPacketModal` |

Underlying modals and API routes are unchanged.

## What is now config-driven

- Opportunity drawer header actions render **only** from `resolveActionsForContext` (`record_header` placements).
- **Send enrollment packet** is a platform `action_definitions` row (`ui_intent` → `send_enrollment_packet`) addable from `/adminV2/settings/actions`.
- Clicking the configured action opens the existing enrollment packet modal via `send_enrollment_packet` intent handling (drawer direct + `adminv2:open-enrollment-packet` event for registry client paths).
- **Send form** is a platform `action_definitions` row (`ui_intent` → `send_form`) addable from `/adminV2/settings/actions`. Opens `SendFormToOpportunityModal` via drawer intent + `adminv2:open-send-form` event. Not placed by default — operators enable via Settings.

## Migration

**Yes** — two idempotent global action seeds:

| Migration | Action key |
|-----------|------------|
| `20260529180000_send_enrollment_packet_action.sql` | `send_enrollment_packet` (priority 78) |
| `20260529200000_send_form_action.sql` | `send_form` (priority 77) |

No new columns; ordering uses existing `action_placements.order_index`.

## Ordering

- Drawer header respects `action_placements.order_index` (lower first) via `resolveActionsForContext`.
- Settings list shows sort order and ↑/↓ controls (swap `order_index` with peer in same surface/slot/entity).
- Edit modal includes numeric sort order + enabled + placement fields.

## Edit button fix

- Root cause: inline editor rendered above the list (off-screen) and edit seed omitted `slot`, resetting placement on save.
- Fix: modal overlay editor, scroll anchor on open, pass `slot`/`label`/`definitionOrgId`, PATCH org-owned labels via `/api/admin/action-definitions/[id]`.

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260529180000_send_enrollment_packet_action.sql` | Platform action seed |
| `supabase/migrations/20260529200000_send_form_action.sql` | Send form platform action seed |
| `web/lib/admin/actions/actionDefinitionRegistry.ts` | Registry entries for Settings UI |
| `web/components/admin/AdminEntityDrawer.tsx` | Remove hardcoded buttons; send_form + send_enrollment_packet intents |
| `web/lib/admin/actions/applyRegistryResolvedActionClient.ts` | `send_form` + `send_enrollment_packet` intents |
| `web/components/adminV2/settings/ActionPlacementGuidedEditor.tsx` | Modal editor, label edit, slot seed fix |
| `web/components/adminV2/settings/ActionPlacementsSettingsClient.tsx` | Edit scroll, reorder |
| `web/components/adminV2/settings/ConfiguredActionPlacementsList.tsx` | Order display + move controls |
| `web/tests/admin/actions/configuredDrawerActions.test.ts` | Regression tests |

## Migration apply

From repo root (local Supabase):

```bash
supabase db push
# or, if using migration up directly:
supabase migration up
```

Verify seed idempotently:

```sql
SELECT key, action_type, entity_type, is_active
FROM action_definitions
WHERE key IN ('send_enrollment_packet', 'send_form') AND org_id IS NULL;
```

## Validation

```bash
cd web && npm run test -- tests/admin/actions/configuredDrawerActions.test.ts
cd web && npm run test -- tests/admin/actionPlacementEditorUi.test.ts
cd web && npm run test -- tests/admin/actionPlacementMutation.test.ts
cd web && npx tsc --noEmit
```

## Suggested commit message

```
Drive Opportunity drawer header actions from Settings registry.

Remove hardcoded Send form/packet buttons, seed send_enrollment_packet action, fix Settings Edit modal, and persist sort order via order_index.
```
