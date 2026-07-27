# Commands P2.S1 — Lead Status Mutation Adapter

| Field | Value |
|-------|-------|
| Mission ID | `msn_188e8bea6fb6de28dd21` |
| Slice | P2.S1 Lead Status Mutation Runtime Adapter |
| Date | 2026-07-27 |
| Commit message target | `feat(commands): adapt lead status mutations through runtime facade` |

## Outcome

`update_lead_status` and `close_lead` execute through:

```text
POST /api/admin/actions/execute
→ Command Runtime
→ Lead Status Mutation adapter
→ executeMutation
→ leadStatusHandler
→ existing RPC / mutation_events
```

Mutation Runtime remains the mutation authority. No child enrollment cutover.

## Adapter / gate

| Path | Role |
|------|------|
| `adapters/leadStatusMutationExecutionAdapter.ts` | DecisionIntent + `executeMutation` once |
| `commandRuntimeExecutionGate.ts` | Exact-key support (`update_lead_status`, `close_lead`); `mutation_runtime` owner stays globally false |
| `executeCommandInvocation.ts` | Dispatches registered_action vs lead-status mutation |

## Request normalization (actions/execute)

```text
action_key → commandKey (exact; mark_lost NOT enabled)
entity_id → subjectId
entity_type → opportunity (validated)
payload.target_state | status_key | targetState → targetState
payload.override_reason → overrideReason
context.department_id / work_unit_id → MutationRuntimeContext
mode preview|execute → previewOnly
```

Client `domain` / `execution_owner` / `actor` / `org_id` ignored.

## Response compatibility

```text
data.execution_result = { kind: "mutation", mutation_result: MutationResult }
data.affected_id = entity_id
correlation_id = mutationId (committed) or invocationId
```

Blocked → `ACTION_BLOCKED` with blockers + mutation_result details.

## Alias debt

| Key | P2.S1 |
|-----|-------|
| `mark_lost` | **Not** cut over — remains `executeAdminAction` / legacy `update_status` force-lost |
| `close_lead` | Facade → Mutation Runtime (full picker; no auto-lost) |
| `update_status` | Remains RegisteredAction |

## `/api/admin/mutations/execute`

**Option A:** Left unchanged (preferred). UI panels continue posting there. Retirement is a later phase.

## Exactly-once

Per-invocation `InvocationDelegationGuard`; route never calls `executeAdminAction` after Mutation delegation.

## Behavior-parity matrix

| Capability | Before entry | After entry | Final handler | Validation / readiness / write / events |
|------------|--------------|-------------|---------------|----------------------------------------|
| `update_lead_status` | mutations/execute → executeMutation (actions/execute was unsupported mutation_command) | actions/execute → facade → executeMutation | `leadStatusHandler` | Unchanged via Mutation Runtime |
| `close_lead` | same | same | `leadStatusHandler` | Unchanged |

## Intentionally not cut over

`waitlist_child`, `enroll_child`, `update_child_enrollment_status`, Relationship, Tour-domain, Processing, destructive, `mark_lost`.
