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
| `add_emergency_contact` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | **P3.S2 facade** → `executeRelationshipAction` |
| `add_authorized_pickup` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | **P3.S2 facade** → `executeRelationshipAction` |
| `add_billing_contact` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | **P3.S2 facade** → `executeRelationshipAction` |
| `add_parent_guardian` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | **P3.S1 facade** → `executeRelationshipAction` |
| `add_child` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | **P3.S3 facade** → `executeRelationshipAction` |
| `link_existing_person` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | **P3.S1 facade** → `executeRelationshipAction` |
| `link_existing_child` | same | adapted | relationship_runtime | organization_command_catalog | yes | P3 | **P3.S3 facade** → `executeRelationshipAction` |
| `make_primary_contact` | same | adapted | admin_action | organization_command_catalog | yes | **P4.S2** | **replace** cutover: facade preview+commit → `setHouseholdPrimaryContactForCustomer`; direct PATCH remains |
| `add_family_member` | same | adapted | admin_action | organization_command_catalog | yes | Product hub | Hub; aliases `add_related_person`, `add_person` |
| `add_sibling` | same | adapted | admin_action | organization_command_catalog | yes | Product hub | Overlaps add_child |
| `schedule_tour` | same | adapted | tour_domain | organization_command_catalog | yes | P5 | Not RegisteredAction |
| `reschedule_tour` | same | adapted | tour_domain | organization_command_catalog | yes | **P5.S1** | Facade → `rescheduleTourBooking`; direct POST reschedule remains |
| `cancel_tour` | same | adapted | tour_domain | organization_command_catalog | yes | **P5.S2** | Destructive facade → `cancelTourBooking`; direct POST cancel remains |
| `complete_tour` | same | adapted | tour_domain | organization_command_catalog | yes | **P5.S3** | Facade → `markTourBookingCompleted`; direct POST complete remains |
| `no_show_tour` | same | adapted | tour_domain | organization_command_catalog | yes | **P5.S3** | Alias `mark_tour_no_show` → canonical; facade → `markTourBookingNoShow` |
| `reopen_tour` | same | unavailable | none | hidden | n/a | P5 contract | Execute deferred |
| `delete_lead` | same | adapted | admin_action | internal_only | yes | **P4.S3** | **delete** hard-delete cutover → `executeDeleteOpportunityLead`; direct POST delete remains |
| `archive_lead` | same | unavailable | none | hidden | n/a | **P4.S4 B** | Explicit unavailable — Manage stub only; no executor; not alias of close/delete |
| `reopen_lead` | same | unavailable | none | hidden | n/a | P4+ | Missing |
| `withdraw_child` | same | unavailable | none | hidden | n/a | P4+ | **withdraw** policy classified; planned/stub |
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

---

# P2.S1 — Lead Status Mutation cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p2-mutation-adapter-msn_188e8bea6fb6de28dd21.md` |
| Adapter | `web/lib/platform/commands/runtime/adapters/leadStatusMutationExecutionAdapter.ts` |
| Exact keys | `update_lead_status`, `close_lead` |
| Final authority | `executeMutation` → `leadStatusHandler` |

## Cut over

| Capability | Route | Final domain handler | Notes |
|------------|-------|----------------------|-------|
| `update_lead_status` | actions/execute → facade | Lead Status | target_state required |
| `close_lead` | actions/execute → facade | Lead Status | full picker; no auto-lost |

## Not cut over (P2.S1)

`mark_lost` (alias debt / legacy path), Relationship, Tour-domain, Processing.  
~~Child enrollment keys~~ → see P2.S2.

## Alias debt

`mark_lost` capability-aliases to `close_lead` but **exact-key gate** keeps it on `executeAdminAction` (legacy force-lost). Do not consolidate without a dedicated slice.

## Compatibility

`/api/admin/mutations/execute` unchanged (Option A).

---

# P2.S2 — Child Enrollment Mutation cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p2-mutation-adapter-msn_188e8bea6fb6de28dd21.md` (P2.S2) |
| Adapter | `web/lib/platform/commands/runtime/adapters/childEnrollmentMutationExecutionAdapter.ts` |
| Exact keys | `update_child_enrollment_status`, `waitlist_child`, `enroll_child` |
| Final authority | `executeMutation` → `enrollmentStatusHandler` |
| Subject | `opportunity_customer_member` |

## Cut over

| Capability | Target strategy | Notes |
|------------|-----------------|-------|
| `update_child_enrollment_status` | supplied | `target_state` / `status_key` |
| `waitlist_child` | fixed `waitlisted` | conflicting client target ignored |
| `enroll_child` | fixed `enrolled` | conflicting client target ignored |

## Stale assertions corrected

- `tests/mutations/updateLeadStatusCommand.test.ts` — enrollment domain now asserted as `enrollment_status`
- `tests/mutations/mutationRuntime.test.ts` — lead vs enrollment domain isolation (not “unmapped”)

## Still unsupported through facade

`mark_lost`, `move_to_waitlist`, `approve_enrollment`, remaining Relationship keys (see P3.S1 for
the two cut-over keys), Tour-domain (non-RA), Processing, destructive.

---

# P3.S1 — Relationship Runtime adapter spine

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p3-relationship-adapter-msn_188e8bea6fb6de28dd21.md` |
| Adapter | `web/lib/platform/commands/runtime/adapters/relationshipExecutionAdapter.ts` |
| Exact keys | `add_parent_guardian`, `link_existing_person` |
| Final authority | `executeRelationshipAction` (Relationship Framework) |

## Cut over

| Capability | Grain / strategy | Notes |
|------------|------------------|-------|
| `add_parent_guardian` | Source child/person/opportunity + create or link person | Registry default role `guardian`; client relationship kind ignored |
| `link_existing_person` | Existing `selectedPersonId` + `roleKey` | Cannot create identity; role from payload under registry rules |

## Deferred (Add Family Member + remaining Relationship catalog)

~~`add_emergency_contact`, `add_authorized_pickup`, `add_billing_contact`~~ → **P3.S2**  
~~`add_child`, `link_existing_child`~~ → **P3.S3**  
~~`make_primary_contact`~~ → **P3.S4 Disposition B → P4**  
`add_family_member` / hub, sibling aliases.

---

# P3.S2 — Contact-role Relationship Commands

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p3-relationship-adapter-msn_188e8bea6fb6de28dd21.md` (P3.S2) |
| Exact keys | `add_emergency_contact`, `add_authorized_pickup`, `add_billing_contact` |
| Final authority | `executeRelationshipAction` |
| Fixed roles | `emergency_contact` / `authorized_pickup` / `billing_contact` (registry; client role ignored) |

## Cross-role isolation

Emergency ≠ pickup ≠ billing ≠ guardian. Shared adapter does not collapse Command identities.

---

# P3.S3 — Child Relationship Commands

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p3-relationship-adapter-msn_188e8bea6fb6de28dd21.md` (P3.S3) |
| Exact keys | `add_child`, `link_existing_child` |
| Final authority | `executeRelationshipAction` → `resolveChildPersonId` / `findOrCreateChildPersonInOrg` |
| Target | `selectedChildPersonId` (link) or `createChildDraft` (add only) |

## make_primary_contact recommendation

→ **P3.S4 Disposition B:** deferred to **P4 — Destructive/replacement Command foundation**.
Capability owner corrected to `admin_action` (not Relationship Framework).

---

# P3.S4 — Primary Contact Classification & Relationship Phase Closeout

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p3-relationship-adapter-msn_188e8bea6fb6de28dd21.md` (P3.S4) |
| Disposition | **B — Defer to P4** |
| Classification | `adapted` / `admin_action` / household primary designation (displacement) |
| Final write | `setHouseholdPrimaryContactForCustomer` via `PATCH .../household-primary-contact` |
| Facade | **Not** enabled |

## Authority (one line)

Layout contact-row → confirm modal → client PATCH → `setHouseholdPrimaryContactForCustomer` →
`ensureCustomerPersonsPrimaryLink` (demote peers) + sync `opportunities.primary_person_id` →
`household.primary_contact_changed` event. `executeRelationshipAction` **rejects** this key.

---

# P4.S1 — Destructive and Replacement Command Foundation

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p4-destructive-foundation-msn_188e8bea6fb6de28dd21.md` |
| Module | `web/lib/platform/commands/runtime/destructive/` |
| Facade commit | Exact allowlist only (`make_primary_contact`, `delete_lead` as of P4.S3) |
| Production cutovers | P4.S2 + P4.S3 (see below) |

## Classified (policy)

| Key | Impact | Confirm | Permission | Recovery | Facade commit |
|-----|--------|---------|------------|----------|---------------|
| `delete_lead` | delete | typed_confirm | sensitive_destructive | none | **enabled (P4.S3)** |
| `archive_lead` | archive | strong_confirm | standard_destructive | none | disabled |
| `make_primary_contact` | replace | strong_confirm | replacement | restore | **enabled (P4.S2)** |
| `cancel_tour` | cancel | strong_confirm | standard_destructive | schedule_new | **enabled (P5.S2)** |
| `withdraw_child` | withdraw | strong_confirm | sensitive_destructive | manual_support | disabled |

## Preview correlation

HMAC-SHA256 compact claims; TTL + version; no DB store; not an idempotency key.

---

# P4.S2 — Make Primary Contact Replacement Cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p4-destructive-foundation-msn_188e8bea6fb6de28dd21.md` (P4.S2) |
| Facade | **Enabled** for `make_primary_contact` (exact allowlist; with `delete_lead` as of P4.S3) |
| Domain | `setHouseholdPrimaryContactForCustomer` (unchanged) |
| Direct API | Compatibility retained (no preview token required) |

---

# P4.S3 — Delete Lead Destructive Cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p4-destructive-foundation-msn_188e8bea6fb6de28dd21.md` (P4.S3) |
| Facade | **Enabled** for `delete_lead` (exact allowlist) |
| Domain | `executeDeleteOpportunityLead` → `executeOpportunityLeadDeletionGraph` (unchanged) |
| Kind | Hard delete; work units retained; recovery none |
| Typed confirm | `opportunity_name` ≤64 or `DELETE` |
| Direct API | POST `.../opportunities/:id/delete` unchanged (Option A) |

---

# P4.S4 — Archive Lead Disposition B

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p4-destructive-foundation-msn_188e8bea6fb6de28dd21.md` (P4.S4 + certification) |
| Disposition | **Remain unavailable** |
| Facade | Commit disabled; not allowlisted |
| Executor | None |
| vs Delete | Distinct hard-delete path remains `delete_lead` only |
| Restore | Not supported (`reopen_lead` also missing) |
| P4 exit | Certified — see P4 Destructive Phase Certification table in evidence |

---

# P5.S1 — Tour Reschedule Cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p5-tour-convergence-msn_188e8bea6fb6de28dd21.md` |
| Facade | **Enabled** for `reschedule_tour` (+ terminals in P5.S3) |
| Domain | `rescheduleTourBooking` (unchanged) |
| Direct API | Compatibility retained |
| Cancel | Still destructive commit-disabled |
| Automation | Documented consumer/invoker only — not implemented |

---

# P5.S2 — Cancel Tour Destructive Cutover

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p5-tour-convergence-msn_188e8bea6fb6de28dd21.md` (P5.S2) |
| Facade | **Enabled** for `cancel_tour` (destructive allowlist) |
| Domain | `cancelTourBooking` (unchanged) |
| Direct API | Compatibility retained |
| Recovery | schedule_new; reopen unavailable |

---

# P5.S3 — Complete Tour and Mark No-show

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p5-tour-convergence-msn_188e8bea6fb6de28dd21.md` (P5.S3 + phase certification) |
| Facade | **Enabled** for `complete_tour`, `no_show_tour` (`mark_tour_no_show` alias) |
| Domain | `markTourBookingCompleted` / `markTourBookingNoShow` (unchanged) |
| Direct APIs | Compatibility retained |
| Reopen / schedule_tour | Unavailable / deferred |
| Automation | Documented consumer/invoker only — not implemented |

---

# P6.S1 — Business Process Command Set Authority

| Field | Value |
|-------|-------|
| Date | 2026-07-27 |
| Evidence | `qa/missions/commands-p6-process-command-authority-msn_188e8bea6fb6de28dd21.md` |
| Contract | `command_set_v1` on `LifecycleBuilderProcessRecord` |
| Resolvers | `resolveBusinessProcessCommandSelection` + `resolveEffectiveBusinessProcessCommands` |
| Compatibility | V1 present → sole; else deterministic legacy migrate |
| Proof | Enrollment Lead fixture — behavior-equivalent selection |
| Editor / WT options switch | Deferred P6.S3 |
| Automation / Commands UI | Not shipped |
