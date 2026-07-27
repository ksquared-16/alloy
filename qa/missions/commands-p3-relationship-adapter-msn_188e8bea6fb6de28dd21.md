# Commands P3.S1 — Relationship Runtime Adapter Spine

| Field | Value |
|-------|-------|
| Mission ID | `msn_188e8bea6fb6de28dd21` |
| Slice | P3.S1 Relationship Runtime Adapter Spine |
| Date | 2026-07-27 |
| Commit message target | `feat(commands): adapt relationship execution through runtime` |

## Outcome

`add_parent_guardian` and `link_existing_person` execute through:

```text
POST /api/admin/actions/execute
→ Command Runtime facade
→ relationshipExecutionAdapter
→ executeRelationshipAction
→ existing Relationship Framework write stacks (guardian / link_person)
→ existing persistence / events / projections
```

Relationship Framework remains the mutation authority. No Add Family Member hub. No other
Relationship catalog keys cut over.

## Paths discovered (pre-cutover)

| Capability | Prior write entry | Final executor |
|------------|-------------------|----------------|
| `add_parent_guardian` | `POST /api/admin/relationship-actions/execute` | `executeRelationshipAction` (`executorKind: guardian`) |
| `link_existing_person` | same | `executeRelationshipAction` (`executorKind: link_person`) |

`/api/admin/actions/execute` previously fell through to `executeAdminAction` → `ui_intent` for these
keys (no relationship write). Dedicated relationship-actions route remains available.

## Adapter / gate

| Path | Role |
|------|------|
| `adapters/relationshipExecutionAdapter.ts` | Normalize payload → `RelationshipActionExecutionRequest`; call once |
| `commandRuntimeExecutionGate.ts` | Exact-key support; `relationship_runtime` owner stays globally **false** |
| `executeCommandInvocation.ts` | Dispatches relationship_runtime after RegisteredAction / Mutation |

## Source / target grain

| Capability | Source | Target |
|------------|--------|--------|
| `add_parent_guardian` | child / person / opportunity record + `sourceCustomerId` | New person draft **or** existing `selectedPersonId` |
| `link_existing_person` | same source grain | Existing person only (`selectedPersonId`); no create |

Direction and entity compatibility remain domain-owned inside `executeRelationshipAction`.

## Relationship-kind / direction authority

- Client `relationship_kind` / `relationship_type` / `execution_owner` / `org_id` / `actor` ignored.
- `add_parent_guardian` uses registry `defaultRoleKey` (`guardian`); client `role_key` ignored for fixed guardian semantics.
- `link_existing_person` requires operator-selected `roleKey` under existing registry / role-resolution rules.

## Request normalization (actions/execute)

```text
action_key → RelationshipActionKey (exact gate)
entity_type / entity_id → sourceEntityType / sourceRecordId (with payload overrides)
payload.source_customer_id → sourceCustomerId (required)
payload.selected_person_id | person_id | target_entity_id → selectedPersonId
payload.create_person_draft → createPersonDraft (add_parent_guardian only)
payload.role_key → roleKey (link_existing_person; guardian fixed for add_parent_guardian)
payload.scope → RelationshipActionScope (registry-allowed)
server orgId / userId → orgId / actorUserId
```

## Response compatibility

```text
data.execution_result = { kind: "relationship", relationship_result: RelationshipActionExecutionResult }
data.affected_id = person_id | child_person_id | entity_id
correlation_id = invocationId
```

Domain throws surface operator-safe messages (parity with relationship-actions route). Post-delegation
failures never fall back to `executeAdminAction`.

## Duplicate / cardinality / write / event parity

Unchanged — sole write authority is `executeRelationshipAction`. Adapter does not insert rows,
emit events, or refresh projections independently.

## Exactly-once evidence

- `InvocationDelegationGuard` marks before executor call; duplicate mark throws.
- Route tests: one `executeRelationshipAction` call; zero `executeAdminAction` /
  `runRegisteredAction` / `executeMutation` after facade path.
- Post-delegation failure: still zero compatibility fallback.

## Auth / spoofing

| Spoof | Result |
|-------|--------|
| Client actor / org_id / execution_owner | Ignored; server context wins |
| relationship_kind / type | Ignored |
| add_parent_guardian role_key | Forced to registry guardian |
| link_existing_person createPersonDraft | Rejected pre-delegation |
| Cross-org person | Domain throws (`Person not found for this organization.`) |

## Compatibility paths retained

| Path | Behavior |
|------|----------|
| Other Relationship keys | `executeAdminAction` (actions/execute) + dedicated relationship-actions UI/API |
| RegisteredAction ×4 | Unchanged |
| Lead / Enrollment Mutation | Unchanged |
| Tour / Processing / unknown | Unchanged |
| `/api/admin/relationship-actions/execute` | Remains |

## Add Family Member deferral

```text
Add Family Member (future)
→ operator-facing relationship command hub
→ explicit commands such as:
   - add_parent_guardian
   - add_child
   - link_existing_person
   - link_existing_child
```

Hub is product/composition — not a generic Relationship Framework mutation. P3.S1 proves explicit
command execution only.

## Behavior-parity matrix

| Capability | Before (write) | After (actions/execute) | Final executor | Semantics |
|------------|----------------|-------------------------|----------------|-----------|
| `add_parent_guardian` | relationship-actions → `executeRelationshipAction` | facade → same | `executeRelationshipAction` | Unchanged |
| `link_existing_person` | same | facade → same | same | Unchanged |

## Tests

| Suite | Result |
|-------|--------|
| `relationshipExecutionAdapter.test.ts` | pass |
| `executeRouteRelationshipRuntime.test.ts` | pass |
| P0–P2 command suites + route regressions | pass |
| `tests/admin/relationship/*` | pass (22) |
| `npm run typecheck` | pass |

## Remaining P3 slices (after P3.S1)

~~Contact-role commands (emergency, pickup, billing)~~ → **P3.S2**  
- `add_child` / `link_existing_child` (P3.S3)
- `make_primary_contact` (P3.S4)
- Add Family Member hub composition (not mutation convergence)

## Intentionally not claimed

Full Relationship convergence · Add Family Member product · arbitrary relationship configuration ·
`/configuration/commands` · API rename · Relationship Framework retirement · schema/migrations.

---

# P3.S2 — Contact-role Relationship Commands

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Slice | P3.S2 Contact-Role Relationship Commands |
| Commit message target | `feat(commands): adapt contact role relationship commands` |

## Outcome

```text
add_emergency_contact | add_authorized_pickup | add_billing_contact
→ POST /api/admin/actions/execute
→ Command Runtime
→ relationshipExecutionAdapter
→ executeRelationshipAction
→ existing Relationship Framework (child_scoped_contact | billing)
```

Shared adapter/executor; **three distinct capability identities** (no generic “add contact”).

## Exact mappings

| Capability | relationshipActionKey | Fixed role (registry) | executorKind | Target resolution |
|------------|----------------------|------------------------|--------------|-------------------|
| `add_emergency_contact` | same | `emergency_contact` | `child_scoped_contact` | create or link person |
| `add_authorized_pickup` | same | `authorized_pickup` | `child_scoped_contact` | create or link person |
| `add_billing_contact` | same | `billing_contact` | `billing` | create or link person |

Client `role_key` / `relationship_kind` / `relationship_direction` ignored for these fixed-role keys.

## Source / target grain

| Capability | Source | Target |
|------------|--------|--------|
| Emergency / Pickup | typically child (+ `sourceCustomerId`); scopes this_child / selected / all children | person create or link |
| Billing | child or opportunity (+ household/opportunity scopes) | person create or link |

## Cross-role isolation

- Emergency does not confer pickup or guardian.
- Pickup does not confer guardian or billing.
- Billing contact does not imply financial-account / payer ownership beyond existing Relationship Framework billing write targets.
- Distinct `actionKey` passed through to executor and result (`relationship_result.actionKey`).

## Exactly-once / spoofing

Same as P3.S1: `InvocationDelegationGuard`; server org/actor; no post-delegation `executeAdminAction`.

## Compatibility retained

`add_child`, `link_existing_child`, `make_primary_contact`, Add Family Member hub, Tour, Processing,
RegisteredAction, Mutation paths unchanged. Dedicated relationship-actions routes remain.

## Behavior-parity matrix (P3.S2)

| Capability | Before write | After actions/execute | Final executor |
|------------|--------------|----------------------|----------------|
| `add_emergency_contact` | relationship-actions → `executeRelationshipAction` | facade → same | same |
| `add_authorized_pickup` | same | facade → same | same |
| `add_billing_contact` | same | facade → same | same |

## Remaining after P3.S2

- P3.S3: `add_child`, `link_existing_child`
- P3.S4: `make_primary_contact`
- Later: Add Family Member hub
