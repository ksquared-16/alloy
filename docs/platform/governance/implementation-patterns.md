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

Avoid: per-surface inline `fetch('/actions/execute')`, parallel mutation APIs for the
same intent, or client components that mutate operational truth directly.

---

## Drawer VM

- Wait for composed payload readiness before above-fold reveal
- Request signature / stale-response guards on apply
- Warm navigation: prefetch on intent, hold body on linked swap

Locked: `../../system/adminv2-runtime-performance-doctrine.md`

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
