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

## Intentionally not cut over (as of P2.S1)

~~`waitlist_child`, `enroll_child`, `update_child_enrollment_status`~~ → **P2.S2**  
Relationship, Tour-domain, Processing, destructive, `mark_lost` remain out.

---

# P2.S2 — Child Enrollment Mutation Adapter

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Adapter | `adapters/childEnrollmentMutationExecutionAdapter.ts` |
| Exact keys | `update_child_enrollment_status`, `waitlist_child`, `enroll_child` |
| Final authority | `executeMutation` → `enrollmentStatusHandler` |
| Subject grain | `opportunity_customer_member` (OCM id) |
| Downstream | RPC `execute_enrollment_status_mutation` only — no scheduling assignment creation in this path |

## Target-state strategy

| Capability | Strategy | Canonical state |
|------------|----------|-----------------|
| `update_child_enrollment_status` | supplied (`target_state` / `status_key`) | caller-provided |
| `waitlist_child` | fixed (client conflict ignored) | `waitlisted` |
| `enroll_child` | fixed (client conflict ignored) | `enrolled` |

## Behavior-parity matrix

| Capability | Before | After | Handler | Subject | Target | Readiness / write / events |
|------------|--------|-------|---------|---------|--------|----------------------------|
| `update_child_enrollment_status` | mutations/execute → executeMutation | actions/execute → facade → executeMutation | `enrollmentStatusHandler` | OCM | supplied | Unchanged |
| `waitlist_child` | same | same | same | OCM | fixed `waitlisted` | Unchanged |
| `enroll_child` | same | same | same | OCM | fixed `enrolled` | Unchanged |

## Stale tests updated

| Test | Before | After | Why |
|------|--------|-------|-----|
| `updateLeadStatusCommand.test.ts` “does NOT map update_child_enrollment_status” | expected `null` | asserts `enrollment_status` ≠ `lead_status` | Domain registry already mapped enrollment; P2.S2 makes facade truth explicit |
| `mutationRuntime.test.ts` “distinct from update_child_enrollment_status” | expected child `null` | asserts distinct domains | Same — V1 “lead only” comment was stale |

## Alias debt retained

`move_to_waitlist` / `approve_enrollment` — exact-key gate keeps them off facade (like `mark_lost`).
`mark_lost` still outside.

## Compatibility retained

`/api/admin/mutations/execute` unchanged. RegisteredAction / Lead Status paths unchanged.
~~Relationship~~ → see `commands-p3-relationship-adapter-msn_188e8bea6fb6de28dd21.md` (P3.S1 exact keys only).
Tour / Processing remain outside.
