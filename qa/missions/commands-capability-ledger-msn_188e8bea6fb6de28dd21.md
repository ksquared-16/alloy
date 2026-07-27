# Commands Capability Ledger — P0.S1

| Field | Value |
|-------|-------|
| Mission ID | `msn_188e8bea6fb6de28dd21` |
| Slice | P0.S1 Capability Registry Spine |
| Date | 2026-07-27 |
| Registry | `web/lib/platform/commands/capabilityRegistry.ts` |

Verified code truth for identities classified in this slice. Planning ledger (~86 keys) remains in `commands-implementation-plan-msn_188e8bea6fb6de28dd21.md` §7.

| Current key | Canonical capability | Classification | Execution owner | Catalog visibility | Behavior preserved | Phase | Notes |
|-------------|---------------------|----------------|-----------------|--------------------|--------------------|-------|-------|
| `create_lead` | `create_lead` | executable | registered_action | organization_command_catalog | yes | P1 | Operator Command |
| `update_status` | `update_status` | executable | registered_action | internal_only | yes | P1→P9 | Hidden from org add catalog |
| `confirm_tour` | `confirm_tour` | executable | registered_action | organization_command_catalog | yes | P1/P5 | Also tour domain underneath |
| `schedule.create` | `schedule.create` | executable | registered_action | organization_command_catalog | yes | P1 | Partial scheduling |
| `update_lead_status` | `update_lead_status` | adapted | mutation_runtime | internal_only | yes | P2 | Umbrella |
| `close_lead` | `close_lead` | adapted | mutation_runtime | organization_command_catalog | yes | P2 | Aliases: `mark_lost` |
| `update_child_enrollment_status` | same | adapted | mutation_runtime | internal_only | yes | P2 | |
| `waitlist_child` | same | adapted | mutation_runtime | organization_command_catalog | yes | P2 | Aliases: `move_to_waitlist` |
| `enroll_child` | same | adapted | mutation_runtime | organization_command_catalog | yes | P2 | Aliases: `approve_enrollment` |
| `add_emergency_contact` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | |
| `add_authorized_pickup` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | |
| `add_billing_contact` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | |
| `add_parent_guardian` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | |
| `add_child` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | Dual UI overlap |
| `link_existing_person` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | |
| `link_existing_child` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | |
| `make_primary_contact` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | |
| `add_family_member` | same | adapted | admin_action | organization_command_catalog | yes | P3 | Hub; aliases `add_related_person`, `add_person` |
| `add_sibling` | same | adapted | admin_action | organization_command_catalog | yes | P3 | Overlaps add_child |
| `schedule_tour` | same | adapted | tour_domain | organization_command_catalog | yes | P5 | Not RegisteredAction |
| `reschedule_tour` | same | adapted | tour_domain | organization_command_catalog | yes | P5 | |
| `cancel_tour` | same | adapted | tour_domain | organization_command_catalog | yes | P5 | Confirm/preview later |
| `complete_tour` | same | adapted | tour_domain | organization_command_catalog | yes | P5 | |
| `no_show_tour` | same | adapted | tour_domain | organization_command_catalog | yes | P5 | Alias `mark_tour_no_show` |
| `reopen_tour` | same | unavailable | none | hidden | n/a | P5 contract | Execute deferred |
| `delete_lead` | same | adapted | admin_action | internal_only | yes | P4 | Preview API exists |
| `archive_lead` | same | unavailable | none | hidden | n/a | P4 | Stub only |
| `reopen_lead` | same | unavailable | none | hidden | n/a | P4+ | Missing |
| `withdraw_child` | same | unavailable | none | hidden | n/a | P4+ | Planned/stub |
| `open_record` | same | navigation_only | navigation | organization_command_catalog | yes | — | Non-mutation |
| `ask_bos` | same | navigation_only | navigation | organization_command_catalog | yes | — | Assist open |
| `quick_message` | same | adapted | admin_action | organization_command_catalog | yes | P9 | Drift vs `send_message` |
| `send_message` | same | unavailable | none | hidden | n/a | P9 | No dedicated executor |
| `send_form` | same | adapted | admin_action | organization_command_catalog | yes | P9 | Partial |
| `send_enrollment_packet` | same | adapted | admin_action | organization_command_catalog | yes | P9 | Partial |
| `update_enrollment_status` | same | legacy | admin_action | organization_command_catalog | yes | P9 | Preserve path |
| `update_status_add_note` | `update_enrollment_status` | legacy | admin_action | hidden | yes (placements) | P9 | Not addable in Settings |
| `mark_won` | same | legacy | admin_action | organization_command_catalog | yes | P9 | Overlap enroll |
| `*_placeholder` (4) | same | placeholder | none | hidden | n/a | P0 | Non-runnable |
| `qualify_opportunity` / `start_quote` / `create_inquiry` | same | unavailable | none | hidden | n/a | P10 | Early seeds |
| `workflow.effect` | same | workflow_only | workflow | hidden | n/a | — | Marker |
| `configuration.maintenance` | same | configuration_maintenance | configuration_runtime | hidden | n/a | — | Marker; out of org catalog |
| `processing.*` (15 identity keys) | namespaced | processing_only | processing_identity | hidden | yes (Processing) | — | Avoids `create_lead` collision |

## Counts (this slice)

| Maturity | Count (approx) |
|----------|---------------:|
| executable | 4 |
| adapted | ~24 |
| legacy | 3 |
| navigation_only | 2 |
| workflow_only | 1 (marker) |
| processing_only | 15 |
| configuration_maintenance | 1 (marker) |
| placeholder | 4 |
| unavailable | ~8 |
| **Total capability keys in registry** | **~62** |

## Unresolved contradictions

1. `confirm_tour` is both RegisteredAction and tour-domain REST — classified executable/registered_action; P5 converges invoke path.
2. `add_child` dual UI (relationship wizard vs inquiry modal) — classified relationship_runtime; P3 hub work.
3. `quick_message` vs `send_message` naming drift — both classified; no consolidation in P0.
4. Pre-existing failing test: `resolveCanonicalWorkTemplateAlternatePathOptions` “waitlist peers” (function returns transitions only) — **not introduced by P0.S1**.

## Behavior preservation

- No changes to `executeAdminAction`, RegisteredAction execute handlers, Mutation/Relationship/Tour services.
- Catalog filters only hide non-runnable / hidden / internal_only from **Settings add** list.
- `partitionConfiguredActionKeys` disables non-runnable + unknown; adapted production keys remain renderable.

---

# P1.S1 — Command Runtime Facade (read-only preparation)

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p1-runtime-facade-msn_188e8bea6fb6de28dd21.md` |
| Facade | `web/lib/platform/commands/runtime/prepareCommandInvocation.ts` |
| Types | `web/lib/platform/commands/runtime/commandRuntimeTypes.ts` |
| Invariants | `web/lib/platform/commands/runtime/commandRuntimeInvariants.ts` |
| RegisteredAction adapter | `web/lib/platform/commands/runtime/adapters/registeredActionPreparationAdapter.ts` |
| Tests | `web/tests/platform/commands/prepareCommandInvocation.test.ts` |

## Capabilities exercised (preparation only)

| Key | Destination represented | Notes |
|-----|-------------------------|-------|
| `create_lead` / `update_status` / `confirm_tour` / `schedule.create` | `registered_action` | Metadata adapter; execute/eligibility/preview **not** called |
| `close_lead` (+ `mark_lost`) | `mutation_runtime` | Delegated eligibility/inputs |
| `add_parent_guardian` | `relationship_runtime` | Delegated |
| `cancel_tour` | `tour_domain` | Delegated |
| `processing.create_lead` | `processing_identity` | Internal; not org catalog |
| `open_record` | `navigation` | Non-mutation |
| `reopen_tour` / `send_message_placeholder` / unknown | `none` | Stop at `unavailable`; no preview/confirm/execute |

## Invariants certified

See P1 evidence doc. Includes: alias→canonical, destination matches registry owner, suggested≠authoritative, availability≠authorization, BOS cannot weaken confirmation, no executor imports, operatorSafe omits diagnostic codes.

## Behavior intentionally not changed

- No production caller cutover
- No `/api/admin/commands/*`
- No RegisteredAction / Mutation / Relationship / Tour execute wrapping
- Existing APIs, eligibility, auth, confirmation UI, payloads, events, audit unchanged

## Deferred adapter work

- ~~RegisteredAction execute through facade~~ → **P1.S2 shipped**
- Mutation / Relationship / Tour / Processing execute adapters (later phases)
- Destructive Command family completion (P4)
- `/configuration/commands` (later phase)

---

# P1.S2 — RegisteredAction execute cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p1-runtime-facade-msn_188e8bea6fb6de28dd21.md` (P1.S2 section) |
| Execute entry | `web/lib/platform/commands/runtime/executeCommandInvocation.ts` |
| Owner gate | `COMMAND_RUNTIME_EXECUTION_BY_OWNER.registered_action = true` only |
| Route | `POST /api/admin/actions/execute` → facade for four RegisteredAction keys |

## Cut over (behavior-preserving)

| Capability | Final executor | Validation | Eligibility | Audit/events |
|------------|----------------|------------|-------------|--------------|
| `create_lead` | `runRegisteredAction` | RegisteredAction | RegisteredAction | Unchanged (single delegate) |
| `update_status` | `runRegisteredAction` | same | same | same |
| `confirm_tour` | `runRegisteredAction` | same | same | same |
| `schedule.create` | `runRegisteredAction` | same | same | same |

## Compatibility paths retained

All adapted / legacy / unavailable / navigation / processing keys → `executeAdminAction` (and existing domain services). Facade execution unsupported ≠ command disabled.

## Guards

- Exactly-once delegation per invocation (`InvocationDelegationGuard`)
- No `executeAdminAction` after facade delegation
- Client cannot set actor / org / execution_owner
- Preparation (`prepareCommandInvocation`) remains side-effect free when used alone
