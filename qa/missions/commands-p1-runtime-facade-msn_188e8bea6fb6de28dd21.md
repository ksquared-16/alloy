# Commands P1.S1 — Read-only Command Runtime Facade

| Field | Value |
|-------|-------|
| Mission ID | `msn_188e8bea6fb6de28dd21` |
| Slice | P1.S1 Command Runtime Facade Contract |
| Date | 2026-07-27 |
| Commit message target | `feat(commands): add read-only command runtime facade` |

## Outcome

Given a Command key and invocation context, Alloy resolves one standardized **read-only** Command snapshot (capability, owner, subject, lifecycle, eligibility delegation, confirmation, execution destination) **without executing**.

## Facade files

| Path | Role |
|------|------|
| `web/lib/platform/commands/runtime/commandRuntimeTypes.ts` | Request / snapshot / subject / lifecycle / destination types |
| `web/lib/platform/commands/runtime/prepareCommandInvocation.ts` | Preparation entrypoint (`prepareCommandInvocation`) |
| `web/lib/platform/commands/runtime/commandRuntimeInvariants.ts` | Development/test invariant assertions |
| `web/lib/platform/commands/runtime/adapters/registeredActionPreparationAdapter.ts` | Metadata-only RegisteredAction adapter |

## Core contract

- **Request:** `CommandInvocationRequest` — key, origin, operational context, subjects, inputs, process/stage, actor (server-owned).
- **Snapshot:** `CommandSnapshot` — normalized preparation result; `authorizationEvaluated: false` always in P1.S1.
- **Origin ≠ surface:** `CommandInvocationOrigin` vs `CommandOperationalContext`.
- **Execution:** `COMMAND_RUNTIME_EXECUTION_ENABLED = false`; no `executeCommandInvocation`.

## Capabilities exercised in tests

RegisteredAction: `create_lead`, `update_status`, `confirm_tour`, `schedule.create`  
Adapted / other: `close_lead` (+ alias `mark_lost`), `add_parent_guardian`, `cancel_tour`, `processing.create_lead`, `open_record`, `reopen_tour`, `send_message_placeholder`, unknown key

**Destinations represented:** registered_action, mutation_runtime, relationship_runtime, tour_domain, processing_identity, navigation, none

## Invariants certified (selected)

Alias → one canonical; unknown/unavailable/placeholder cannot advance to preview/confirm/execute; navigation not mutation-executable; processing_only not org-catalog; destination matches registry owner; RegisteredAction has real handler; suggested subject never authoritative; availability ≠ authorization; BOS cannot skip confirmation; preparation side-effect free; no executor/DB mutation imports in facade prepare module.

## Intentionally unchanged

No production cutover; no `/api/admin/commands/*`; no execute migration; no eligibility/auth/mutation/UI behavior changes.

## Deferred

~~P1.S2 RegisteredAction execute cutover~~ → **shipped** (see P1.S2 section below).
Mutation/Relationship/Tour execute adapters; `/configuration/commands`.

---

# P1.S2 — RegisteredAction execution through Command Runtime

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Entry | `web/lib/platform/commands/runtime/executeCommandInvocation.ts` |
| Gate | `web/lib/platform/commands/runtime/commandRuntimeExecutionGate.ts` |
| Adapter | `web/lib/platform/commands/runtime/adapters/registeredActionExecutionAdapter.ts` |
| Route | `web/app/api/admin/actions/execute/route.ts` |
| Tests | `executeCommandInvocation.test.ts`, `executeRouteCommandRuntime.test.ts` |

## Cutover

| Capability | Route before | Route after | Final executor |
|------------|--------------|-------------|----------------|
| `create_lead` | `runRegisteredAction` direct | Command Runtime → adapter | `runRegisteredAction` |
| `update_status` | same | same | `runRegisteredAction` |
| `confirm_tour` | same | same | `runRegisteredAction` |
| `schedule.create` | same | same | `runRegisteredAction` |

## Intentionally not cut over

`close_lead` and other Mutation-adapted keys, Relationship keys, Tour-domain keys (e.g. `cancel_tour`), Processing, navigation, placeholders — remain on `executeAdminAction` / domain paths.

## Exactly-once

Request-scoped `InvocationDelegationGuard`; after `runRegisteredAction` begins, route must not call `executeAdminAction`. Proven in route tests (success + post-delegation failure).

## Confirmation limitation

Execute API historically does not require body confirmation evidence (UI confirms first). Facade rejects only when `confirmation.confirmed === false` is explicitly supplied. Does not invent typed confirmation. Origin cannot bypass that reject.

## Actor boundary

Server `getAdminContextCached` org/user only; client `context.actor` / `org_id` / `execution_owner` ignored.
