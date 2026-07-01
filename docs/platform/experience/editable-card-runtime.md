# Editable Card Runtime (canonical)

**Path:** `docs/platform/experience/editable-card-runtime.md`
**Status:** **Canonical** (June 2026). The one edit-lifecycle runtime and behavioral contract for every editable card. Implements the Experience Doctrine's Editing Law (Law 5).
**Module:** `web/lib/experience/editing/editableCardRuntime.ts` (pure state machine + lifecycle) · `useEditableCardRuntime.ts` (React binding over the ONE save coordinator).

---

## The one editing model

```
viewing → focused → editing → dirty → saving → saved → viewing
                                ↑         │
                                └─────────┘   save failure → rollback to dirty + legible error
```

Every editable card — anywhere in the platform — uses this machine. No card invents its own `saving`/`saved`/`error`/dirty state. The status vocabulary (`saving · saved · error · unsaved`) is shared via `editableCardStatusLabel()`.

## Ownership (no overlap)

| Concern | Owner | In the runtime |
|---------|-------|----------------|
| Edit lifecycle / state machine | **Card Runtime** | `editableCardReducer`, the hook |
| Optimistic patch · rollback · propagation · truth | **Record Runtime** | `applyOptimistic` / `rollbackOptimistic` / `save` you pass in |
| Acknowledgement / feedback | **Interaction Runtime** | `onAcknowledge`, the `saved` phase |
| Timing / choreography | **Motion** | `acknowledgeMs` only |
| Coordinated Save-All + dirty guard | the **one** `drawerOperatingSaveCoordinator` | the hook registers each card; **no second coordinator** |

## Behavioral contract (verified)

The reducer and the pure `runEditableCardSaveLifecycle` are unit-tested for every lifecycle event — `web/tests/experience/editing/editableCardRuntime.test.ts` (16 tests): entering edit · dirty/clean transitions · save start (idempotent when clean) · save success → ack → settle · **save failure → rollback to dirty with legible error (never silent loss)** · unsaved-change guard (`editableCardBlocksExit`) · shared status vocabulary. The save engine itself remains covered by `drawerOperatingSaveCoordinator.test.ts`.

## Usage

```ts
const edit = useEditableCardRuntime({
  dirty: isDirty(draft, baseline),
  save: async () => { /* mutate via Record/Entity; return { ok, error? } */ },
  applyOptimistic,            // Record Runtime (omit for authoritative-confirmed mutations, e.g. money)
  rollbackOptimistic,
  sectionId: "person_contact",// registers with the ONE coordinator (Save-All + dirty guard)
  acknowledgeMs: 2000,
});
// edit.state.phase, editableCardStatusLabel(edit.state), edit.onFocus/onBlur/notifyChange/commit
```

`applyOptimistic` present → optimistic mode (most UI). Omitted → authoritative-confirmed (money/legal/irreversible) per the [client/server + optimistic-vs-authoritative correction](../foundation/runtime-architecture-map.md#architecture-review-corrections-applied--june-2026).

---

## Convergence status

| Pattern | Verdict | Action |
|---------|---------|--------|
| `LayoutRuntimeDrawerEditProvider` (coordinated, optimistic) | **Canonical approach** — elevated | Its proven coordinated-save model is the basis of this runtime |
| `drawerOperatingSaveCoordinator` | **Canonical engine** | Kept as the one Save-All/rollback coordinator |
| `EditablePersonContactCard` (was self-managed, pessimistic) | **Migrated ✅** | Now drives `useEditableCardRuntime`; self-managed `saving`/`savedFlash`/`saveError` removed |

### Migrated: `EditablePersonContactCard`

The competing pattern has been **converged** onto the canonical runtime:
- Removed self-managed `saving` / `savedFlash` / `saveError` and the bespoke `persistCard` status handling. The card now drives `useEditableCardRuntime` (sectionId `person_contact:<id>` → registered with the one coordinator + dirty guard).
- Kept `draft`/`isPersonContactCardDirty`, the `patchLinkedPersonFromOpportunityDrawer` endpoint, and the view-person path.
- **Authoritative-confirmed mode** (no `applyOptimistic`) — cross-entity linked-person save; status strings (`Saving…`/`Saved`/`Unsaved changes`) preserved.
- **Doctrine fix:** the old code reverted the draft on save failure (silent loss of the operator's edit). The runtime's `saveFailure → dirty + legible error` **retains the edit** — no silent data loss (Law 5).

**Verified behaviorally (not render-only):** `tests/admin/opportunity/editablePersonContactCardLifecycle.test.tsx` drives real focus/type/save in jsdom — dirty + coordinator registration, no-op clean edit, save success → Saved, **save failure retains the edit + shows the error**, no self-managed flags. The repaired `editablePersonContactCardLivePath.test.tsx` covers the view-person path.

All new editable cards use `useEditableCardRuntime`.

### HouseholdContactEdit (Focus Panel — Household edit depth)

Previously used bespoke `phase` ("idle"/"saving"/"saved") + `savedTimer` + local `error` state. Now migrated onto the canonical runtime.

Key differences vs. Opportunity Drawer pattern:
- **No `sectionId`** — Focus Panel editing is card-isolated; no Save-All / dirty guard across cards. The coordinator is intentionally absent here.
- **No `applyOptimistic` / `rollbackOptimistic`** — authoritative confirmed save only (same as before).
- **`acknowledgeMs: 900`** — the 900 ms "Saved" beat is preserved as the timing constant.
- **`onAcknowledge`** fires `(onSaved ?? onClose)()` — hands back to HouseholdCard which shows its own card-level chip.
- Inputs **locked** during the ack window (phase === "saved") to prevent a race between the ack timer and an in-flight re-edit.
- `CardEditPlaceholder` (the pre-implementation placeholder this replaced) deleted — no imports remaining.

**Verified:** `tests/admin/focusPanel/householdContactEditRuntime.test.tsx` — 8 behavioral tests covering save success / failure / cancel / ack-beat / timer-clear-on-cancel.

---

## When this doc must be updated

The state machine or status vocabulary changes; the optimistic/authoritative contract changes; or a quarantined pattern is migrated/removed.
