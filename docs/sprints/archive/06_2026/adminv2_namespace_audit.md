# adminV2 Namespace Audit

**Status:** June 2026. Scope of *this* sprint: relocate the **Operational Command Runtime /
Command Surface** modules out of the `adminV2` conceptual namespace into a platform-owned
namespace. The broader `adminV2` cleanup (routes, settings UI, runtime, drawers) is **explicitly
deferred** to a future sprint — this doc inventories it for that sprint.

## Doctrine

- Operational Command Runtime and Command Surface are **platform-owned**; they must not live
  under an `adminV2` conceptual namespace.
- `adminV2` may continue to exist as **legacy app routing / runtime infrastructure**.
- New platform runtime modules use `web/lib/platform/commands/*` and
  `web/components/platform/commands/*`.
- Old import paths remain only as **compatibility shims** (`export * from <platform>`), not
  canonical locations.

---

## Part A — Migrated in this sprint (command runtime / surface)

Relocated with `git mv` (history preserved). Canonical location → `web/lib/platform/commands/`
and `web/components/platform/commands/`. A compatibility shim remains at each old path.

| Old (now shim) | New canonical |
|---|---|
| `web/lib/adminV2/actions/invocationContext.ts` | `web/lib/platform/commands/invocationContext.ts` |
| `web/lib/adminV2/actions/commandState.ts` | `web/lib/platform/commands/commandState.ts` |
| `web/lib/adminV2/actions/operationalIntent.ts` | `web/lib/platform/commands/operationalIntent.ts` |
| `web/lib/adminV2/actions/commandFlow.ts` | `web/lib/platform/commands/commandFlow.ts` |
| `web/lib/adminV2/actions/createLead/createLeadRequiredInputs.ts` | `web/lib/platform/commands/createLead/createLeadRequiredInputs.ts` |
| `web/lib/adminV2/actions/createLead/createLeadSuccess.ts` | `web/lib/platform/commands/createLead/createLeadSuccess.ts` |
| `web/lib/adminV2/actions/createLead/createLeadCommandModel.ts` | `web/lib/platform/commands/createLead/createLeadCommandModel.ts` |
| `web/lib/adminV2/actions/surface/commandSurfaceTypes.ts` | `web/lib/platform/commands/surface/commandSurfaceTypes.ts` |
| `web/lib/adminV2/actions/surface/deriveCommandSurfaceState.ts` | `web/lib/platform/commands/surface/deriveCommandSurfaceState.ts` |
| `web/lib/adminV2/actions/surface/commandSurfaceModel.ts` | `web/lib/platform/commands/surface/commandSurfaceModel.ts` |
| `web/lib/adminV2/actions/surface/commandSurfacePresentation.ts` | `web/lib/platform/commands/surface/commandSurfacePresentation.ts` |
| `web/lib/adminV2/actions/surface/useCommandSurfaceController.ts` | `web/lib/platform/commands/surface/useCommandSurfaceController.ts` |
| `web/components/adminV2/actions/surface/CommandSurfaceShell.tsx` | `web/components/platform/commands/CommandSurfaceShell.tsx` |

Intra-set imports between these modules were repointed to platform paths. Product consumers
repointed to platform paths: `web/lib/adminV2/actions/definitions/createLeadAction.ts`,
`web/lib/adminV2/actions/configValidation.ts`.

---

## Part B — Remaining `adminV2` references *inside* the migrated command files

These are intentional, deferred dependencies on the shared **action registry / type** layer
(the "move if safe" tier from the V3 prompt; not moved this sprint to keep blast radius small).

| Reference | Used by | Category | Disposition | Destination | Risk |
|---|---|---|---|---|---|
| `@/lib/adminV2/actions/actionTypes` | most command files (types: `ActionBlocker`, `ActionPreview`, `ActionEligibility`, `ActionResultOk`, `RegisteredAction`) | lib (types) | migrate | `web/lib/platform/commands/types` (or `platform/actions`) | Medium — widely imported across runtime + execute route |
| `@/lib/adminV2/actions/actionRegistry` (`isKnownActionKey`) | `operationalIntent.ts` | lib | migrate | `web/lib/platform/actions/registry` | High — registry is imported by execute route, client dispatcher, config validation |
| `@/lib/adminV2/actions/definitions/createLeadAction` | `createLeadCommandModel.ts` | lib | migrate | `web/lib/platform/actions/definitions` | High — action definitions are the execution layer |

**Recommended order for a follow-up "command runtime registry" migration:**
1. `actionTypes` (pure types, lowest risk) → platform.
2. `actionEligibility` / shared helpers.
3. `actionExecutor` + `actionRegistry` + `definitions/*` together (touches
   `web/app/api/admin/actions/execute/route.ts` and `applyRegistryResolvedActionClient.ts` —
   requires the action runtime test suite).

---

## Part C — Compatibility shims (remove once consumers migrate)

13 shim modules now live at the old `adminV2` paths (Part A "Old" column). They `export *` (or
`export { default }` for the component) from the platform module. Current consumers that still
resolve **through** these shims:

- Command tests under `web/tests/adminV2/actions/*` (category: test). **Disposition:** relocate to
  `web/tests/platform/commands/*` in the cleanup sprint; low risk (test-only). Left in place this
  sprint to limit churn.

No protected runtime surface imports the command modules yet (they are not UI-mounted until
Command Surface V3), so shims are needed only for the test path today.

---

## Part D — Broader `adminV2` surface (out of scope this sprint)

`adminV2` is a large legacy namespace (100+ files). Categories for the future cleanup sprint:

| Area | Examples | Category | Disposition |
|---|---|---|---|
| App routes | `web/app/adminV2/workspace/.../work-unit/[workUnitId]/page.tsx`, `web/app/adminV2/settings/*` | route | **Legacy infra** — keep; renaming routes is high-risk and out of scope |
| Runtime/components | `web/lib/adminV2/runtime/focusPanel/*`, `web/components/adminV2/settings/*` | component/lib | Evaluate case-by-case; much is protected runtime infrastructure |
| Action registry/execution | `web/lib/adminV2/actions/{actionTypes,actionRegistry,actionExecutor,actionEligibility,definitions/*,configValidation}.ts` | lib | Migrate next (see Part B order) |
| Tests | `web/tests/adminV2/**` | test | Relocate alongside their modules |

**Recommendation:** the cleanup sprint should generate a complete inventory
(`rg -l adminV2 web --glob '!**/.next/**'`) and triage route renames separately (they affect URLs
and must not break navigation).

---

## Validation (this sprint)

- `web/tests/adminV2/actions/` → 119 passed after relocation (tests resolve via shims).
- No remaining intra-set `@/lib/adminV2/actions/(surface|createLead|commandState|operationalIntent|commandFlow|invocationContext)` imports inside `web/lib/platform/commands/**`.
