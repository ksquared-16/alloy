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

~~`add_child` / `link_existing_child`~~ → **P3.S3**  
- P3.S4 candidate: `make_primary_contact` (external executor — classify first)
- Later: Add Family Member hub

---

# P3.S3 — Child Relationship Commands

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Slice | P3.S3 Child Relationship Commands |
| Commit message target | `feat(commands): adapt child relationship commands` |

## Outcome

```text
add_child | link_existing_child
→ POST /api/admin/actions/execute
→ Command Runtime
→ relationshipExecutionAdapter
→ executeRelationshipAction (executorKind add_child | link_child)
→ resolveChildPersonId
   → existing: persons lookup (org-scoped)
   → create (add_child only): findOrCreateChildPersonInOrg
→ customer_members / opportunity_customer_members as owned by Relationship Framework
```

## Exact mappings

| Capability | relationshipActionKey | executorKind | Target resolution |
|------------|----------------------|--------------|-------------------|
| `add_child` | same | `add_child` | `createChildDraft` **or** `selectedChildPersonId` |
| `link_existing_child` | same | `link_child` | `selectedChildPersonId` only (create rejected) |

Relationship kind on household member rows remains domain (`relationship: "child"`). Client kind/direction ignored.

## Source / target grain

| Capability | Source | Target |
|------------|--------|--------|
| Both | opportunity or person + `sourceCustomerId`; `sourceOpportunityId` derived when source is opportunity | Child **person** id (`selectedChildPersonId`) or create draft (add only) |

Do not silently convert person ↔ customer_member ↔ OCM ids in the adapter.

## Domain side effects (preserved, not invented)

When scope is `this_opportunity` and an opportunity id is present, existing `executeRelationshipAction`
may create/link `customer_members` and `opportunity_customer_members` (and may record process
participation via `applyCreateLeadChildParticipationFromIdentity`). The Command Runtime does **not**:

- Set enrollment status
- Choose program/location/room
- Trigger billing, capacity, or scheduling
- Duplicate those writes outside the Relationship Framework

## Enrollment / scheduling isolation

Adapter imports no enrollment Mutation Runtime, scheduling, or financial modules. No status mutation
commands are invoked.

## Exactly-once / spoofing

Same as prior P3 slices. `link_existing_child` rejects `createChildDraft` pre-delegation.

## Compatibility retained

`make_primary_contact` (external), Add Family Member hub, Tour, Processing, RegisteredAction,
Mutation, prior Relationship facade keys unchanged. Dedicated relationship-actions routes remain.

## Behavior-parity matrix (P3.S3)

| Capability | Before write | After actions/execute | Final executor |
|------------|--------------|----------------------|----------------|
| `add_child` | relationship-actions → `executeRelationshipAction` | facade → same | same |
| `link_existing_child` | same | facade → same | same |

## make_primary_contact classification recommendation

→ Certified in **P3.S4** as Disposition B (defer to P4). See section below.

## Remaining after P3.S3

- ~~P3.S4 classification~~ → **done (defer)**
- Later product: Add Family Member hub composition
- Next implementation phase: **P4 — Destructive Command foundation**

---

# P3.S4 — Primary Contact Classification and Relationship Phase Closeout

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Slice | P3.S4 |
| Selected disposition | **B — Defer to P4 — Destructive/replacement Command foundation** |
| Commit message target | `docs(commands): certify relationship command convergence` |

## Authority trace

```text
Operator surface (layout contact_block / related_list / repeater row only)
  → LayoutRuntimeMakePrimaryContactActionButton / applyRegistryResolvedActionClient
  → openMakePrimaryContact({ opportunityId, targetPersonId })
  → LeadHouseholdPrimaryContactConfirmModal (confirm; shows current vs new primary)
  → patchHouseholdPrimaryContact(customerId, personId)
  → PATCH /api/admin/customers/:id/household-primary-contact
       (requireAdminOrOps + getAdminContextCached)
  → setHouseholdPrimaryContactForCustomer
       → ensureCustomerPersonsPrimaryLink  (demotes other primary_contact is_primary rows)
       → UPDATE opportunities.primary_person_id for all opportunities on customer
  → emitHouseholdPrimaryContactChangedEvent (household.primary_contact_changed)
  → client dispatchHouseholdPrimaryContactChanged (projection refresh hooks)
```

**Not** on path: `executeRelationshipAction` (throws “dedicated executor”), Command Runtime facade,
RegisteredAction, Mutation Runtime.

## Final executor

| Layer | Symbol |
|-------|--------|
| HTTP | `web/app/api/admin/customers/[id]/household-primary-contact/route.ts` |
| Domain | `setHouseholdPrimaryContactForCustomer` |
| Displacement helper | `ensureCustomerPersonsPrimaryLink` |
| Event | `emitHouseholdPrimaryContactChangedEvent` |

## Subject / designation grain

| Question | Answer |
|----------|--------|
| What becomes primary? | A **person** linked on the **customer/household** (`customer_persons`) |
| Primary relative to? | **Household/customer** (`role_type = primary_contact`, `is_primary = true`) |
| Also synced? | All **opportunities** on that customer → `primary_person_id` (queue/lead display) |
| Not | Org-wide person truth; child-scoped; billing account FK; pickup/guardian grant |

## Displacement

- Prior household primary: `is_primary` cleared on other `customer_persons` rows with same role.
- Previous person **remains** household-linked (modal copy: “remain linked as an additional household contact”).
- Multi-record: customer_persons + N opportunities.
- Confirmation required (dedicated modal; current vs new; affected scope labels).
- Previous primary id returned/audited via event payload (`previous_primary_person_id`).

## Side effects

| Area | Effect? |
|------|---------|
| Queue / lead primary display | Yes — `opportunities.primary_person_id` |
| Communications default recipient | Projection/display-adjacent; not a separate comms executor in this path |
| Billing / payer / funder | No financial mutation in this path |
| Authorized pickup / guardian / emergency | No role grants |
| Portal / legal responsibility | Not mutated here |
| Relationship Framework links | Not via `executeRelationshipAction` |

## Authorization & confirmation

- Route: `requireAdminOrOps` + server org/actor.
- Confirm: `LeadHouseholdPrimaryContactConfirmModal` before PATCH.
- Stripped from generic header/rail/workspace resolve (layout contact-row only).
- Capability `confirmationPolicy: confirm` (P4 may elevate to strong_confirm).

## Classification

| Field | Value |
|-------|-------|
| Maturity | `adapted` |
| Execution owner | `admin_action` (corrected from mistaken `relationship_runtime`) |
| Catalog | `organization_command_catalog` (layout-gated at resolve time) |
| Architecture label | Household primary **designation with displacement** (legacy_external / replacement-adjacent) |
| Disposition | **B — Defer to P4** |

### Why not Disposition A

- Demotes existing primary (replacement semantics).
- Multi-table write (customer_persons + opportunities).
- Explicit confirm UX already separate from Relationship wizard.
- Intentionally `externalExecutor` outside Relationship Framework.
- Stronger destructive/replacement Command safeguards belong in P4.

### Why not Disposition C

- Production operator Command with real mutations and events — not a cosmetic preference or unsupported stub.

## Compatibility retained

- Existing modal + PATCH path unchanged.
- Facade gate remains closed (`isCommandRuntimeFacadeExecutionSupported` = false).
- `/api/admin/actions/execute` continues `executeAdminAction` compatibility for this key.
- No adapter added.

## Add Family Member boundary (certified)

```text
Add Family Member
→ operator-facing hub (product/composition)
→ presents explicit relationship Commands, e.g.:
   - add_parent_guardian
   - add_child
   - link_existing_person
   - link_existing_child
   - add_emergency_contact
   - add_authorized_pickup
   - add_billing_contact
```

Hub is **not** a Relationship Runtime executor and was **not** implemented in P3.

## P3 Relationship Phase Certification

| Capability | Capability owner | Facade execution | Final executor | Status | Future work |
|------------|------------------|------------------|----------------|--------|-------------|
| `add_parent_guardian` | relationship_runtime | Yes (P3.S1) | `executeRelationshipAction` | Migrated | — |
| `link_existing_person` | relationship_runtime | Yes (P3.S1) | `executeRelationshipAction` | Migrated | — |
| `add_emergency_contact` | relationship_runtime | Yes (P3.S2) | `executeRelationshipAction` | Migrated | — |
| `add_authorized_pickup` | relationship_runtime | Yes (P3.S2) | `executeRelationshipAction` | Migrated | — |
| `add_billing_contact` | relationship_runtime | Yes (P3.S2) | `executeRelationshipAction` | Migrated | — |
| `add_child` | relationship_runtime | Yes (P3.S3) | `executeRelationshipAction` | Migrated | Dual UI overlap note |
| `link_existing_child` | relationship_runtime | Yes (P3.S3) | `executeRelationshipAction` | Migrated | — |
| `make_primary_contact` | admin_action | No | `setHouseholdPrimaryContactForCustomer` | Deferred with phase | **P4** replacement/destructive |
| `add_family_member` | admin_action | No | capture-first admin path | Hub/product composition | Commands product / surface |
| `add_related_person` | → `add_family_member` | No | alias | Legacy alias | Hub |
| `add_sibling` | admin_action | No | overlaps add_child | Hub/product / overlap | Product resolve |

## P3 exit criteria

1. Seven Relationship Framework commands migrated through facade → `executeRelationshipAction`.
2. `make_primary_contact` classified with proven authority and named P4 deferral.
3. Add Family Member certified as hub, not executor.
4. No silent “migrated” claim for external/deferred identities.
5. Next implementation phase: **P4 — Destructive Command foundation**.

## Intentionally not claimed

Facade adaptation of primary contact · Add Family Member UI · full Relationship retirement ·
API rename · `/configuration/commands` · schema/migrations.
