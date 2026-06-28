# Implementation patterns

**Status:** Canonical engineering patterns (June 2026 rebaseline).

Recurring patterns implementers and AI agents should follow.

---

## Admin API handler

```typescript
// 1. Org context
const ctx = await getAdminContextCached(request);
// 2. CRM scope (when touching scoped entities)
const access = await getAdminAccessContextCached(request);
// 3. Assert scope on target row before mutate
assertExistingOpportunityMutableInAdminScope(access, opportunity);
```

---

## Queue → record flow

1. Render queue row from `QueueService` preview
2. User selects row → navigate with entity type/id
3. Fetch `GET /api/admin/entity/[type]/[id]`
4. Execute actions against entity GET payload — never queue JSON

---

## Side effects

Prefer: `emitEvent` → workflow → action effects.

Avoid: component-local mutations that skip events for domains already on spine.

---

## Config-driven UI

- Layouts: `field_placements_v1` + effective preview resolver
- Queues: validated `queue_definition` JSON
- Status: `status_definitions` with entity_type grain

Code owns: authorization, invariants, validation guardrails.

---

## Action Runtime

An **Action = configured invocation of a registered capability.** Config controls
presentation + constraints (label, placement, order, visibility, scope, required-input
hints, confirmation copy). Config never owns executable behavior.

- Every executable action maps to a `RegisteredAction` in
  `web/lib/adminV2/actions/actionRegistry.ts` (typed contract:
  eligibility / required inputs / preview / execute / audit / result).
- Manual UI and BOS-confirmed proposals execute through the **same** server path:
  `runRegisteredAction` → validate → eligibility gate → delegate to invariant-owning
  mutation helper. The runtime never writes directly.
- Configured keys must be **known** (registered handler or canonical catalog). Unknown
  keys fail loudly in dev/test (`assertConfiguredActionKeys`) and render disabled in prod.
- Read-only checks before execute: `POST /api/admin/actions/eligibility`
  (`resolveActionEligibility`) returns blockers, available transitions, required inputs,
  and an optional preview.

**Operational Command Runtime — one capability, many placements, one runtime.** Every
operational mutation is a command: registered capability + placement + context resolution +
eligibility + required subjects + required inputs + preview + execution + audit + refresh.

- **Capability** = the registered command (platform).
- **Placement** = where it appears (config): logical placements `work_unit_actions`,
  `focus_panel_manage`, `queue_row_menu`, `bos_recommendations`.
- **Context resolution** = how the subject is resolved
  (`web/lib/platform/commands/invocationContext.ts`): `current_record`, `user_selection`,
  `queue_selection`, `suggested_record`, `bos_proposal`, `open`. Work Unit commands have
  **no inherited subject yet** (not `entityId = null`) and a **required subject** the operator
  resolves; a suggested record is optional context, never authoritative.
- **Required subject:** `none | opportunity | person | child | case | multiple_opportunities`.
- **Operator states** (`commandState.ts` → `describeCommandState`): available,
  disabled_blocked, needs_subject, needs_required_input, preview_ready, confirmation_required,
  executing, success, failure. Never surface a raw technical error where a user decision is
  needed — map it with `operatorErrorCopy`.
- **Shared invocation contract:** all surfaces call `resolveCommandContext` then the same
  runtime. Do not duplicate a command because it appears on another surface.
- **Operational Intent vs capability** (`operationalIntent.ts`): operators choose an intent
  ("Move Forward"); the runtime resolves it to a capability (`update_status`). One intent may
  fan out to many capabilities. Never expose capability keys to operators.
- **Operational Flow** (`commandFlow.ts` → `buildCommandFlow`): a command is a guided flow of
  reusable stages (`resolve_context → resolve_subject → resolve_required_inputs →
  resolve_constraints → preview → confirm → execute → success`). The runtime picks the current
  stage from the resolved snapshot; the UI renders it. Richer entry points (Focus Panel, BOS)
  arrive with more stages already complete.
- **Command view-models are read-only** (e.g. `createLead/createLeadCommandModel.ts` →
  `deriveCreateLeadCommandState`): they derive stage/state/copy/known+missing inputs/preview/
  success from known inputs, but never execute or mutate. Manual UI and BOS share one
  view-model and both submit the same payload through the registered action's execute route —
  never a per-surface mutation path. Read-only eligibility/preview derivation is shared between
  the registered action and the view-model (one source of truth).
- **Command Surface is platform-owned** (`surface/deriveCommandSurfaceState.ts`): the shell
  anatomy (header/body/footer/success/failure), stage order, and action patterns are fixed by
  the platform and identical across work_unit / focus_panel_manage / queue_row / bos variants.
  Configuration influences **content only** through `CommandSurfaceConfigInfluence` (labels,
  description, confirm/blocker copy) — never layout, stage order, lifecycle, or components.
  Do not build per-command or per-config bespoke command UIs; feed a command snapshot to the
  shared surface model instead.
- **Command Surface UI is presentational; lifecycle injects execution** (V2). Render with
  `CommandSurfaceShell.tsx` (no command state, callbacks injected) and drive the lifecycle with
  `useCommandSurfaceController.ts`, which holds inputs/phase and re-derives the surface but takes
  `execute` as an **injected** function. Wire `execute` to the existing registered-action route
  (e.g. `executeCreateLeadFromModal` / `POST /api/admin/actions/execute`) — never call a mutation
  API from the shell/controller. This is how BOS/manual/Work Unit share one lifecycle without
  forking execution. Operator copy must pass `isOperatorSafeCopy` (no payload/action keys).
- **One shared client execution adapter per command; host owns execution, not the entry point**
  (V3). Create Lead's reference: `executeCreateLeadCommand.ts` is the single client adapter
  (POST `/api/admin/actions/execute` → registered `create_lead`, normalized to `ActionResult`),
  reused by every entry point. The platform host `CreateLeadCommandSurface.tsx` wraps the
  existing intake and owns execution + standardized success (`buildCreateLeadSuccess`); entry
  points pass only context + open/refresh callbacks. When an existing intake is protected and
  rich (e.g. `CreateLeadModal`), host it as the body and converge execution/success rather than
  rewriting it — and document the visible-chrome swap as deferred.

Avoid: per-surface inline `fetch('/actions/execute')`, parallel mutation APIs for the
same intent, client components that mutate operational truth directly, modeling Work Unit
commands as `entityId = null`, or duplicating a capability per placement.

---

## Surface ViewModel (canonical reveal ownership)

The **preferred / canonical** runtime pattern. Each route composes **one** above-fold Surface
ViewModel that owns reveal; components render its sections and never decide readiness.

- Compose a Surface VM (`shell_nav` / `workspace` / `work_unit`) over the **existing** loader,
  session cache, bootstrap, and reveal gate — **no new fetch, no new skeleton layer, no new reveal
  primitive**. `reveal.canCommit` is the single commit decision per route.
- Above-fold sections are present in final placement (snapshot/default content) or hidden behind the
  one surface gate — never popped in late, never re-owned, never briefly legacy.
- Patch non-blocking values (KPI/counts/cards/rail) **in place** after commit; never re-stage.
- Exactly **one** authoritative renderer per above-fold region; legacy/fallback owners are deleted
  or quarantined behind flag-off — **do not expand legacy loaders**.
- Code: `web/lib/adminV2/runtime/surface/*`. Canonical doc:
  `../operator/surface-view-model-composition.md` + `../operator/runtime-surface-section-map.md`.

## Drawer VM (reveal/payload infrastructure behind the Focus Panel)

The drawer VM is **not** a product surface — it is the protected reveal/payload layer that the
**Focus Panel** (`buildOperationalContext()`) renders from. Do not add new drawer-product surfaces.

- Wait for composed payload readiness before above-fold reveal
- Request signature / stale-response guards on apply
- Warm navigation: prefetch on intent, hold body on linked swap

Locked: `../../system/adminv2-runtime-performance-doctrine.md`. Convergence:
`../operator/focus-panel-runtime-cutover-report.md`.

---

## Supabase access

- Browser: anon/authenticated client with RLS
- Server privileged writes: `createAdminClient` / service role
- Never expose service role to client

---

## Testing focus areas

When touching runtime-sensitive files, run doctrine test suite listed in `.cursor/rules/adminv2-runtime-performance.mdc`.

See `testing-and-quality.md`.

---

## TypeScript imports

Use `import type` for symbols used only as types — prevents Vercel build failures.

---

## Search before inventing

`rg` for nearby patterns, route guards, and existing helpers in `web/lib/**`.

---

## Related

- `design-and-operational-doctrine.md`
- `../../execution/operating-doctrine.md`
