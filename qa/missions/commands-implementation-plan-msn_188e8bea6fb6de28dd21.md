# Commands Architecture Approval & Implementation Plan

| Field | Value |
|-------|-------|
| Mission | Commands Architecture Approval & Implementation Plan |
| Mission ID | `msn_188e8bea6fb6de28dd21` |
| Slot | 1 |
| Worktree | `/Users/Kelly/Code/alloy-worktrees/wt1-commands-system-inventory` |
| Foundations | Inventory · Product Definition · Architecture Blueprint (approved sequence) |
| Date | 2026-07-27 |
| Scope | **Planning only** — no production implementation, migrations, runtime edits, API renames, schema changes, or doctrine updates |

**Implementation progress (mission evidence, not this planning doc’s original scope):** P0.S1 → … → P4.S1 foundation → P4.S2 make_primary_contact → **P4.S3 delete_lead hard-delete cutover**. Next: archive_lead / cancel_tour / withdraw as separate slices.

---

# Part I — Architecture Decision Closure

## 1. Decision register

| Decision | Selected approach | Alternatives rejected | Evidence | Consequences | Revisit trigger |
|----------|-------------------|----------------------|----------|--------------|-----------------|
| **D1 — Variant storage** | **V1: variant JSON on one `action_definitions` row** (`metadata.command_config.variants[]`). Base Command = the definition row for `capabilityKey`. Variants are overlays with `variant_key`, label, expression fields, optional context/process scope. Availability may pin `variant_key` via placement `condition_config` / Availability API field — **no new table, no new column required for V1**. | **A** Multiple definition rows per capability (needs variant identity column + merge rules now). **C** New org command table (schema sprint before behavior). | Product: variants are config overlays, not executors. Architecture: extend definitions. Inventory: definitions already carry `metadata`. Placements already have `condition_config`. | Fast V1; analytics identity = `capabilityKey` (+ optional `variant_key` in audit). Pinning variants in availability is slightly less ergonomic than rows. | When variants need independent enablement, RBAC, or high-volume analytics → promote to child rows/table **without** changing Capability keys. |
| **D2 — Process `command_set` authority** | **Typed process `command_set_v1` is the sole process-wide selection authority.** Stage `action_catalog_v1.candidate_actions` becomes **recommendation-only** (recommendation, order, override_label, optional variant_key) and may only reference keys in `command_set_v1`. Loader rejects stage candidates not in the set. Initial migration: derive `command_set_v1` as union of existing stage candidates ∪ lifecycle-builder-marked availability keys for that process. | Equal authority of placements + lifecycle base + catalogs (today’s multi-source). Placements-as-process-authority. New relational join table before V1. | Product §6 single catalog feed. Architecture A2 option (1). Code: `stage.action_catalog_v1` already exists (`stageActionCatalogV1.ts`); process metadata can hold `command_set_v1` without new tables. | One effective set: Org Catalog → Process `command_set_v1` → Stage recommendation. Outcomes remain separate. | If process definitions leave JSON metadata for normalized tables later, migrate `command_set_v1` as a whole. |
| **D3 — API rename timing** | **Deferred public rename.** P1 builds Command Runtime **behind** existing `/api/admin/actions/execute` (and eligibility/preflight). Mid-stream (with `/configuration/commands`, ~P7): add `/api/admin/commands/*` as **thin aliases** to the same handlers. P9–P10: mark actions routes deprecated; remove aliases only after zero traffic. Mutations/relationship/tour REST: adapt behind Runtime; do not dual-publish semantics. | Immediate rename (high client/test churn before proof). Long-lived dual authorities. | Inventory: many clients on `/actions/*`. Architecture: alias-first. Mission: avoid permanent dual APIs; prove one path. | Low churn; one execution path from P1; Commands URLs appear when product UI ships; retirement is measurable. | If a breaking external consumer is discovered, extend deprecation window — do not fork semantics. |
| **D4 — Permission granularity** | **Hybrid floor + destructive elevation.** Floor: keep `requireAdminOrOps` (or admin for config writes). Capability declares optional `permissionKey`. **V1 enforcement:** (1) Config administration = existing settings mutate / admin role. (2) Destructive Capabilities require **explicit permission class** checks (new keys under a `commands.destructive.*` family **or** mapped existing manage keys) starting P4. (3) Subject/org/location scope continues via accessScope. (4) Variant permissions = inherit Capability (no per-variant RBAC in V1). Availability never grants execute rights. | Full per-Capability permission matrix in P0–P2. Ignoring `required_permissions` forever. Treating catalog enablement as auth. | Audit: coarse gates; empty `required_permissions`. Product: Destructive family needs stronger safeguards. | Prevents “enabled in catalog ⇒ authorized.” Destructive path gets real keys; ordinary Commands stay on floor until a later RBAC sprint. | After Destructive cert, expand permissionKey coverage to Enrollment/financial Commands. |
| **D5 — Reopen Tour in P5** | **Define Capability contract in P5; defer execute.** P5 ships Schedule / Reschedule / Cancel (with confirm+preview) / Confirm / Complete / No-show through Runtime. Register `reopen_tour` with `supportStatus=partial` (contract + eligibility sketch only). **Recovery alternative until execute ships:** Schedule Tour creates a **new** booking; canceled booking remains history. | Full Reopen execute in P5 (scope risk before Cancel safety cert). Entirely omit from registry (hides product debt). | Product includes Reopen; audit: no operator reopen, only rollback helper. Mission: do not include for catalog symmetry. | P5 cert focuses on cancel safety; Reopen is an explicit follow-on slice (P5b) after Cancel telemetry is clean. | Operator demand for uncancel without new booking, or compliance requiring restore-in-place. |
| **D6 — Configuration-maintenance Commands** | **Outside organization Command catalog.** Settings CRUD / publish / retire / draft-delete stay in Configuration product APIs. Optionally later reuse **Runtime safeguard patterns** (preview/confirm/audit) via an internal `configuration_mutation` contract — **not** listed in `/configuration/commands`. Destructive *operational* verbs (Delete Lead, Cancel Tour, …) remain in catalog. | Putting every settings DELETE in org catalog. Forcing all config CRUD through Command Runtime in V1. | Product §12 / architecture A6; inventory: 43 admin DELETEs are settings-domain. | Catalog stays operational. Config pages keep their APIs. Shared safeguard library may still be extracted without catalog pollution. | If Configuration product explicitly adopts Commands IA for admin ops. |

---

## 2. Approved target architecture (≤2 pages)

```text
Platform Capability Registry (code)
        ↓ validates / binds
Organization Command Catalog (action_definitions + metadata overlays + variants[])
        ↓ process selects
Business Process command_set_v1
        ↓ stage recommends
Stage action_catalog_v1 (recommendation-only ⊂ command_set)
        ↓ context filters
Operational Context + Availability (action_placements as storage)
        ↓
Command Runtime Facade (shared lifecycle)
        ↓
Domain Executor (lead / tour / relationship / enrollment / …)
        ↓
Events → Projections / Automation / BOS read-models
```

### Where concerns are enforced

| Concern | Enforcement point |
|---------|-------------------|
| **Authorization** | Command Runtime (floor + Capability `permissionKey` + accessScope) **before** Domain Executor. Config writes: settings admin gate on catalog APIs. |
| **Availability** | Candidate Resolver: Capability supportStatus ∩ org enabled ∩ process `command_set_v1` ∩ context availability rows ∩ subject compatibility. |
| **Variants** | Resolved when loading Configured Command: base definition + `variants[variant_key]` overlay; pin from availability/`variant_key` on invoke. |
| **Destructive policy** | Capability `destructiveKind` + `confirmationClass` (≥ required; typed for hard delete/void) + mandatory preview hook + audit envelope; permission class from D4. |
| **Execution singularity** | One Runtime facade; Domain Executor invoked once per commit; legacy routes either adapter-internal or drained. |

### Non-goals restated

No org mutation builder. No rewrite of tour/relationship/status domain services. No “placement” product language. Processing Identity remains separate unless promoted.

---

## 3. Transitional authority map

| System | Classification |
|--------|----------------|
| **RegisteredAction / actionRegistry** | **Canonical target** — expands into Capability Registry |
| **actionExecutor / runRegisteredAction** | **Canonical target** — grows into Command Runtime Facade |
| **executeAdminAction** | **Drained during migration** — frozen; no new keys; removed from operator path by P9 |
| **Mutation Runtime** | **Retained domain owner** — **adapted behind facade** (P2) |
| **Relationship Framework** | **Retained domain owner** — **adapted behind facade** (P3) |
| **Tour booking service** | **Retained domain owner** — **adapted behind facade** (P5); REST becomes adapter-internal |
| **Processing Identity commands** | **Retained domain owner** — **outside** org catalog (unless promoted later) |
| **Domain REST (tours/delete/archive)** | **Adapted behind facade** then **drained** from operator chrome |
| **action_definitions** | **Canonical target** — Organization Command Catalog storage |
| **action_placements** | **Canonical target** — Availability storage (implementation) |
| **Lifecycle candidate-action lists / LIFECYCLE_BASE_ACTIONS** | **Transitional** → seed for `command_set_v1`; then **retired as authority** (P6) |
| **Process / stage action catalogs** | Stage catalog **adapted** to recommendation-only; process `command_set_v1` **canonical** (P6) |
| **Operational Intent mappings** | **Transitional compatibility** — UX/BOS vocabulary; must resolve to Capability keys |
| **BOS action adapters** | **Adapted** — continue propose/prefill; execute only via Runtime |
| **Platform / canonical / library catalogs** | **Transitional facades** → generate from Capability Registry; collapse by P10 |
| **Action Buttons settings page** | **Transitional bridge** → **retired** after P7–P8 |
| **`/api/admin/mutations/execute`** | **Transitional compatibility path** → alias/internal after P2 |
| **Configuration settings DELETE/archive APIs** | **Retained** outside Command catalog (D6) |

---

# Part II — Implementation Delivery Plan

## 4. P0–P10 delivery sequence

> Sequence follows this mission’s spine (Destructive before Tours). Small adjustment vs architecture doc numbering only — same work, safer ordering.

### P0 — Capability honesty

| | |
|--|--|
| **Objective** | Code-authoritative Capability Registry metadata for inventoried keys; distinguish executable / adapted / placeholder / legacy / unavailable — **no operator behavior change**. |
| **Product-visible** | None required (optional admin-only diagnostics OK). Settings/Process must not newly claim unsupported keys as ready. |
| **Architecture** | Capability Registry spine + supportStatus + disposition map tests. |
| **In scope** | Registry module; status enums; inventory ledger encoded as data; filters for settings definition-catalog / process pickers to hide `unsupported`/`placeholder` from “add” flows where already filtered, tighten gaps. |
| **Out of scope** | Runtime facade changes; UI `/configuration/commands`; wrapping domains; schema migrations. |
| **Code areas** | `web/lib/adminV2/actions/*`, `canonicalActionRegistry`, `actionDefinitionRegistry`, definition-catalog route filters, tests under `web/tests/admin*` / new `commands/` tests. |
| **Storage** | None |
| **API** | None (read filters only if needed) |
| **Compatibility** | Existing execute paths unchanged |
| **Tests** | Registry contract; disposition completeness vs ledger; filter tests |
| **Manual QA** | Spot-check Settings Actions library does not offer pure placeholders as addable if previously blocked |
| **Security** | N/A beyond no auth regression |
| **Docs** | Mission ledger only (canonical doctrine later with behavior) |
| **Entry** | This plan approved |
| **Exit** | Every ledger key has supportStatus; tests lock classifications; zero behavior change in smoke |
| **Rollback** | Revert registry module; no data migration |
| **Deps** | None |
| **Parallel** | Can parallel with planning-only docs; not with P1 |

### P1 — Command Runtime facade

| | |
|--|--|
| **Objective** | Single Runtime entry for **already-registered** Capabilities; `/actions/execute` calls facade only. |
| **Product-visible** | None (behavior parity). |
| **Architecture** | Facade owns lifecycle orchestration for registered keys; confirmationClass enforced server-side where already declared. |
| **In scope** | Grow `actionExecutor`; ensure create_lead / confirm_tour / update_status / schedule.create only via facade; invoke telemetry counter. |
| **Out of scope** | Migrating mutation/relationship/tour keys; API rename; UI |
| **Code areas** | `actionExecutor.ts`, `actions/execute/route.ts`, registered definitions |
| **Storage** | None |
| **API** | Same routes; internal structure only |
| **Compatibility** | Parity tests vs prior results |
| **Tests** | Executor lifecycle; no double-execute; route wiring |
| **Manual QA** | Create Lead, Confirm Tour smoke |
| **Security** | Auth floor unchanged; assert single execute |
| **Docs** | None canonical yet |
| **Entry** | P0 exit |
| **Exit** | Registered keys 100% facade; telemetry proves one path |
| **Rollback** | Revert facade wiring |
| **Deps** | P0 |
| **Parallel** | No |

### P2 — Mutation Runtime adaptation

| | |
|--|--|
| **Objective** | Status domain verbs as Capabilities → Mutation Domain Executor via facade. |
| **Product-visible** | Same labels; optionally clearer blockers. |
| **In scope** | `close_lead`, `waitlist_child`, `enroll_child`, `update_lead_status`, `update_child_enrollment_status`; alias `/mutations/execute` → facade for those keys |
| **Out of scope** | Removing umbrella UI entirely; tours |
| **Code areas** | `mutations/*`, `domainRegistry`, facade adapters, command panels |
| **Storage** | None |
| **API** | mutations/execute compatibility alias |
| **Tests** | Domain adapter; alias parity; no dual commit |
| **Manual QA** | Close lead / waitlist / enroll paths |
| **Security** | Floor + scope |
| **Entry** | P1 |
| **Exit** | Status verbs single-path; mutations alias only |
| **Rollback** | Keep alias; revert adapter registration |
| **Deps** | P1 |
| **Parallel** | Soft parallel with P3 after P1 if separate keys — prefer sequential |

### P3 — Relationship adaptation

| | |
|--|--|
| **Objective** | Relationship Capabilities + Add Family Member hub resolve through facade → relationship executor. |
| **In scope** | 8 relationship keys; hub routing for `add_family_member`; wizard remains UI host |
| **Out of scope** | Remove/Revoke Commands (P4); deleting old capture stack files entirely |
| **Code areas** | `relationship/*`, `executeAdminAction` add-person branches, facade |
| **Tests** | Adapter; hub routes to role Commands; event emission |
| **Manual QA** | Add EC / parent / make primary |
| **Entry** | P1 (prefer after P2) |
| **Exit** | Relationship execute only via facade for wrapped keys |
| **Deps** | P1 |
| **Parallel** | After P1, can follow P2 |

### P4 — Destructive Command foundation

| | |
|--|--|
| **Objective** | Destructive Capability contracts + permission class + preview/confirm/audit envelope; wire Delete Lead / Archive Lead (as support allows) / Remove·Revoke relationship Commands. |
| **Product-visible** | Manage destructive flows gain preview/typed confirm where missing |
| **In scope** | Capability metadata for destructive verbs; Delete Lead Runtime wrap; relationship Remove/Revoke; permission keys for destructive class; **not** every settings DELETE |
| **Out of scope** | Config-maintenance catalog entries; tour cancel execute cutover (P5; policy classified in P4.S1) |
| **Code areas** | `deleteOpportunityLead`, manage menus, relationship remove, auth helpers |
| **Storage** | Optional permission seed rows (if using permission_definitions) — **only when implementing**, not this planning mission |
| **Tests** | Preview/commit correlation; typed confirm; auth denial; dependency blockers |
| **Manual QA** | Delete lead preview; revoke pickup |
| **Security** | **Blocking** destructive permission evidence |
| **Entry** | P1; ideally P3 for Remove/Revoke |
| **Exit** | Destructive operational Commands single-path with safeguards |
| **Deps** | P1; P3 for relationship remove |
| **Parallel** | Not with P5 cancel work on same hosts |
| **P4.S1 shipped** | Policy + preview contract + HMAC correlation + permission-class seam + execution-disabled guard — see `commands-p4-destructive-foundation-msn_188e8bea6fb6de28dd21.md`. No production cutover. |

### P5 — Tour Command convergence

| | |
|--|--|
| **Objective** | Tour Commands through Runtime; Cancel requires preview+confirm; `reopen_tour` contract-only. |
| **In scope** | schedule_tour, reschedule_tour, cancel_tour, confirm_tour, complete_tour, no_show_tour; UI stops raw cancel POST |
| **Out of scope** | Reopen execute (deferred); reminder system rewrite |
| **Code areas** | tour booking service, lifecycle bar, confirmTourAction, facade adapters |
| **Tests** | Cancel confirm gate; adapter parity; no double booking writes |
| **Manual QA** | Full tour happy path + cancel |
| **Entry** | P1; better after P4 patterns exist |
| **Exit** | Tour operator chrome → Runtime only; reopen partial |
| **Deps** | P1 |
| **Parallel** | After P4 preferred |

### P6 — Business Process single catalog

| | |
|--|--|
| **Objective** | `command_set_v1` authority; stage catalog recommendation-only; process editor picks from Org Catalog ∩ Capability support. |
| **In scope** | Loader/writer for command_set_v1; migrate derive-from-union; retire multi-source authority in `resolveCanonicalWorkTemplateActionOptions` |
| **Out of scope** | Full `/configuration/commands` UI |
| **Code areas** | `web/lib/lifecycle/*`, process settings components, tests |
| **Storage** | JSON metadata only (no migration file required if stored in existing lifecycle JSON) |
| **Tests** | Authority tests; orphan candidate rejection |
| **Manual QA** | Process editor select/recommend |
| **Entry** | P0 honesty; better after P1 |
| **Exit** | One effective process command set |
| **Deps** | P0; soft P1 |
| **Parallel** | Can start after P0 in parallel with P2–P5 **if** editor changes don’t depend on facade |

### P7 — `/configuration/commands` foundation

| | |
|--|--|
| **Objective** | New config route/IA read+write catalog expression + availability API (contexts language); Action Buttons becomes bridge/redirect. |
| **In scope** | Page shell, list/detail, enable/label/help, availability matrix CRUD via placements service, optional `/api/admin/commands` aliases |
| **Out of scope** | Perfect polish; all families advanced panels; doctrine rewrite beyond stub pointers |
| **Code areas** | `web/app/adminV2/settings/` or configuration routes; catalog services; Action Buttons redirect |
| **Storage** | definitions metadata overlays |
| **Tests** | Catalog API; availability mapping; cannot enable unsupported |
| **Manual QA** | Enable/disable; availability; process deep-link |
| **Entry** | P0 + P6 strongly recommended |
| **Exit** | Admins can manage Commands without Action Buttons as primary |
| **Deps** | P0, P6 |
| **Parallel** | After P6 |

### P8 — Configuration product completion

| | |
|--|--|
| **Objective** | Variants UI; family pages; automation references read-only; audit link; Action Buttons removed from nav. |
| **In scope** | Variant overlays; destructive policy display; family groupings |
| **Out of scope** | Executor work |
| **Entry** | P7 |
| **Exit** | Product IA matches approved definition for V1 |
| **Deps** | P7 |

### P9 — executeAdminAction drain

| | |
|--|--|
| **Objective** | No operator key remains solely on executeAdminAction; leftover keys unsupported or wrapped. |
| **In scope** | Drain ledger keys; delete dead switch branches; telemetry zero on legacy |
| **Out of scope** | Processing Identity |
| **Entry** | P2–P5 + P4 done for in-scope keys |
| **Exit** | Legacy fallback call count = 0 in staging smoke window |
| **Deps** | P2–P5, P4 |

### P10 — Legacy framing retirement and certification

| | |
|--|--|
| **Objective** | Operator copy Commands; deprecate actions API aliases as needed; certification suite green; doctrine updates **with** behavior already shipped. |
| **In scope** | Cert matrix; doc updates; stub retirement report |
| **Out of scope** | Table renames |
| **Entry** | P8–P9 |
| **Exit** | Owner cert sign-off |
| **Deps** | All prior |

---

## 5. Slice decomposition

**Total slices: 42** (IDs `P{n}.S{m}`).

### P0 — Capability honesty (4)

| ID | Title | Goal | Likely areas | Contract | Acceptance | Tests | QA | Deps | Commit boundary | Stop |
|----|-------|------|--------------|----------|------------|-------|-----|------|-----------------|------|
| **P0.S1** | Capability registry spine | Introduce Capability metadata types + registry for all ledger keys with supportStatus | `web/lib/adminV2/actions/` or `web/lib/platform/commands/capabilityRegistry.ts` | Read-only classification API used by tests | 100% ledger keys classified | Registry contract + completeness | None | — | One module + tests | Any behavior change to execute |
| **P0.S2** | Wire known-key helpers | `isKnownActionKey` / support queries read registry | `actionRegistry.ts`, canonical facades | Unsupported ≠ executable | Helpers match ledger | Unit | None | P0.S1 | | Dual sources disagree |
| **P0.S3** | Catalog add filters | Definition-catalog / library cannot add placeholder/unsupported | definition-catalog route, `filterSettingsActionCatalogDefinitions` | Add flows hide bad keys | Filter tests + inventory fixtures | | Spot settings | P0.S1 | | Breaking existing enabled placements resolution |
| **P0.S4** | Process picker honesty | Process editors don’t list unsupported as selectable | lifecycle option resolvers | Unsupported disabled with reason | resolve* tests | | Process UI spot | P0.S1 | | Changing saved process JSON |

### P1 — Runtime facade (3)

| ID | Title | Goal |
|----|-------|------|
| **P1.S1** | Facade extract | `runCommand` lifecycle wrapper around registered execute |
| **P1.S2** | Route bind | `actions/execute` → facade only for registered keys |
| **P1.S3** | Invoke telemetry | Single-path counter + tests for no double commit |

### P2 — Mutation (4)

| ID | Title |
|----|-------|
| **P2.S1** | Capability adapters for lead/enrollment verbs |
| **P2.S2** | Facade execute → domain handlers |
| **P2.S3** | `/mutations/execute` alias |
| **P2.S4** | Panel/UI parity cert |

### P3 — Relationship (4)

| ID | Title |
|----|-------|
| **P3.S1** | Relationship Runtime adapter spine (exact keys: `add_parent_guardian`, `link_existing_person`) — remaining catalog later |
| **P3.S2** | Add Family Member hub Capability |
| **P3.S3** | Redirect legacy add_person execute path |
| **P3.S4** | Wizard + BOS parity QA |

### P4 — Destructive (5)

| ID | Title |
|----|-------|
| **P4.S1** | Destructive/replacement policy + preview + correlation + commit-disabled guard (**shipped**) |
| **P4.S2** | Make Primary Contact replacement preview + facade cutover (**shipped**) |
| **P4.S3** | Delete Lead via Runtime + typed confirm (**shipped**) |
| **P4.S4** | Archive Lead Capability (implement or explicit unsupported) |
| **P4.S5** | Remove / Revoke relationship Capabilities |

### P5 — Tours (5)

| ID | Title |
|----|-------|
| **P5.S1** | Tour Capability adapters (schedule/reschedule/confirm/complete/no-show) |
| **P5.S2** | Cancel via Runtime + preview + confirm |
| **P5.S3** | Lifecycle bar stops raw cancel POST |
| **P5.S4** | `reopen_tour` contract-only registration |
| **P5.S5** | Tour family manual cert |

### P6 — Process catalog (4)

| ID | Title |
|----|-------|
| **P6.S1** | `command_set_v1` types + parse/write |
| **P6.S2** | Derive migration from existing candidates |
| **P6.S3** | Resolver authority switch |
| **P6.S4** | Process editor UX bound to catalog |

### P7 — Config foundation (5)

| ID | Title |
|----|-------|
| **P7.S1** | Catalog read service |
| **P7.S2** | `/configuration/commands` list+detail shell |
| **P7.S3** | Availability service over placements |
| **P7.S4** | Optional `/api/admin/commands` aliases |
| **P7.S5** | Action Buttons bridge/redirect |

### P8 — Config completion (3)

| ID | Title |
|----|-------|
| **P8.S1** | Variants overlay editor |
| **P8.S2** | Families + automation refs + audit link |
| **P8.S3** | Remove Action Buttons from nav |

### P9 — Drain (3)

| ID | Title |
|----|-------|
| **P9.S1** | Ledger drain pass (wrap or mark unsupported) |
| **P9.S2** | Remove dead executeAdminAction branches |
| **P9.S3** | Legacy telemetry zero window |

### P10 — Cert (2)

| ID | Title |
|----|-------|
| **P10.S1** | Cross-family certification suite |
| **P10.S2** | Canonical doctrine updates matching shipped behavior |

Each slice inherits phase tests/QA/security from §4; **commit boundary** = one coherent local commit per slice; **stop** if dual execute detected or production smoke regresses.

---

## 6. First implementation slice — P0.S1

### Detail

| Field | Content |
|-------|---------|
| **Slice ID** | P0.S1 |
| **Title** | Capability registry spine (honesty) |
| **Goal** | Establish code-owned Capability metadata for every inventoried identity with `supportStatus` and disposition — **zero operator behavior change**. |
| **Answers** | Which keys are executable today vs adapted-later vs placeholder vs legacy vs unavailable; how runtime/tests distinguish; how config UIs will refuse to present nonexistent capabilities as ready (filters in P0.S3–S4). |
| **Behavioral contract** | No change to execute, eligibility HTTP results, or chrome. Pure additive module + tests. |
| **Acceptance** | (1) Registry exports lookup by key. (2) Every ledger key present. (3) Status ∈ production \| partial \| adapted \| placeholder \| legacy \| unsupported \| processing_only \| navigation_only \| config_maintenance \| duplicate \| retire. (4) Tests fail if inventory key missing. |
| **Tests** | Completeness vs embedded ledger snapshot; status enum invariants; registered keys ⊆ production/partial. |
| **QA evidence** | Diff review + test output; no UI QA required. |
| **Commit boundary** | Single commit: registry + tests (+ ledger JSON if extracted). |
| **Stop** | Any production route behavior change. |

### Appendix A — Cursor prompt for P0.S1

See **Appendix A** at end of this document.

---

## 7. Catalog migration ledger

Disposition codes: **Canon** · **Variant** · **Alias** · **Workflow** · **Processing** · **Nav** · **ConfigMaint** · **Hide** · **Legacy** · **Dup** · **Retire** · **Review**

### 7.1 Production / partial operator keys

| Current key | Future capability | Family | Current executor | Target executor | Phase | Compat | Disposition |
|-------------|-------------------|--------|------------------|-----------------|-------|--------|-------------|
| `create_lead` | `create_lead` | Record Creation | RegisteredAction | same | P1 | keep | Canon |
| `confirm_tour` | `confirm_tour` | Tours | RegisteredAction | Tour domain via facade | P1/P5 | keep | Canon |
| `update_status` | `update_status` | Status | RegisteredAction | internal-only | P1→P9 | hide from org catalog | Legacy→internal |
| `schedule.create` | `schedule.create` | Scheduling | RegisteredAction | same | P1 | keep | Canon |
| `update_lead_status` | `update_lead_status` | Status | Mutation | Mutation via facade | P2 | alias | Canon (internal umbrella) |
| `close_lead` | `close_lead` | Status/Destructive-adjacent | Mutation alias | Mutation via facade | P2 | keep | Canon |
| `update_child_enrollment_status` | `update_child_enrollment_status` | Enrollment | Mutation | facade | P2 | alias | Canon (internal) |
| `waitlist_child` | `waitlist_child` | Enrollment | Mutation alias | facade | P2 | keep | Canon |
| `enroll_child` | `enroll_child` | Enrollment | Mutation alias | facade | P2 | keep | Canon |
| `schedule_tour` | `schedule_tour` | Tours | Modal+REST | Tour executor | P5 | keep | Canon |
| `reschedule_tour` | `reschedule_tour` | Tours | REST | Tour executor | P5 | keep | Canon |
| `quick_message` | `send_message` | Communications | Composer | Composer Capability | P9 | alias quick→send | Dup→Canon `send_message` |
| `send_message` | `send_message` | Communications | catalog null | Composer Capability | P9 | | Canon |
| `ask_bos` | `ask_bos` | Administration | UI open BOS | UI Capability | P7 | | Canon (non-mutating) |
| `send_form` | `send_form` | Documents | form host | facade+host | P9 | | Canon partial |
| `send_enrollment_packet` | `send_enrollment_packet` | Documents | workflow/execute | facade | P9 | | Canon partial |
| `open_record` | `open_record` | Record | open_drawer | Nav Capability | P7 | | Nav |
| `add_family_member` | `add_family_member` (hub) | Relationships | admin_execute | hub→relationship | P3 | keep | Canon hub |
| `add_related_person` | → hub | Relationships | admin_execute | hub | P3 | alias | Alias |
| `add_sibling` | `add_child` / sibling variant | Relationships | admin_execute | relationship/inquiry | P3 | | Variant/Dup |
| `add_child` | `add_child` | Relationships | dual UI | relationship executor | P3 | | Canon |
| `add_emergency_contact` | same | Relationships | relationship | facade | P3 | | Canon |
| `add_authorized_pickup` | same | Relationships | relationship | facade | P3 | | Canon |
| `add_billing_contact` | same | Relationships | relationship | facade | P3 | | Canon |
| `add_parent_guardian` | same | Relationships | relationship | facade | P3 | | Canon |
| `link_existing_person` | same | Relationships | relationship | facade | P3 | | Canon |
| `link_existing_child` | same | Relationships | relationship | facade | P3 | | Canon |
| `make_primary_contact` | same | Relationships | dedicated modal | facade | P3 | | Canon |
| `mark_lost` | `close_lead` | Status | admin_execute | close_lead | P2/P9 | alias | Dup |
| `mark_won` | `enroll_child` / outcome | Enrollment | admin_execute | domain verb | P2/P9 | | Dup/Review |
| `update_enrollment_status` | — | Status | admin_execute form | retire operator | P9 | | Legacy→Retire |
| `update_status_add_note` | — | Status | legacy | retire | P0 hide / P9 | | Legacy→Retire |
| `record_tour_outcome` | split complete/no_show | Tours | partial | tour Capabilities | P5 | | Dup→Canon split |
| `approve_enrollment` | `enroll_child` | Enrollment | intent alias | enroll_child | P2/P6 | alias | Alias |
| `move_to_waitlist` | `waitlist_child` | Enrollment | stub/intent | waitlist_child | P2/P6 | alias | Alias |

### 7.2 Destructive / recovery identities

| Current key | Future capability | Family | Current executor | Target | Phase | Compat | Disposition |
|-------------|-------------------|--------|------------------|--------|-------|--------|-------------|
| `delete_lead` | `delete_lead` | Destructive | delete service | facade | P4 | | Canon |
| `archive_lead` | `archive_lead` | Destructive | stub | implement or unsupported | P4 | | Review→Canon/unsupported |
| `reopen_lead` | `reopen_lead` | Status | stub | Capability when executor exists | P4/P9 | | partial |
| `withdraw_child` | `withdraw_child` | Enrollment/Destructive | planned/stub | Capability when executor exists | P4+ | | partial Hide until ready |
| `cancel_tour` | `cancel_tour` | Tours/Destructive | REST | facade | P5 | | Canon |
| `reopen_tour` | `reopen_tour` | Tours | missing | contract P5; execute later | P5 | | partial |
| `remove_relationship` | `remove_relationship` | Relationships/Destructive | PCR DELETE | facade | P4 | new key | Canon (new) |
| `revoke_authority` | `revoke_authority` | Relationships/Destructive | PCR role remove | facade | P4 | new key | Canon (new) |

### 7.3 Stub catalog keys (34) — default Hide/unsupported until owned

`call_parent`, `send_email`, `send_sms`, `add_note`, `create_task`, `upload_document`, `move_to_qualification`, `contact_family`, `remove_from_waitlist`, `collect_waitlist_fee`, `waive_waitlist_fee`, `review_enrollment_packet`, `request_missing_information`, `reserve_spot`, `assign_classroom`, `assign_schedule`, `set_start_date`, `collect_registration_fee`, `waive_registration_fee`, `collect_deposit`, `record_deposit`, `reenroll_child`, plus stubs already listed above overlapping production.

| Rule | Disposition |
|------|-------------|
| Overlap with Canon | consolidate; stub metadata ignored |
| No executor | **Hide** / `unsupported` | P0 |
| Financial/placement stubs | **Hide** until Billing/Assignment Domain Executor exists | Review |

### 7.4 Placeholders & early legacy

| Key | Disposition | Phase |
|-----|-------------|-------|
| `*_placeholder` | Hide / Retire | P0/P10 |
| `qualify_opportunity`, `start_quote`, `create_inquiry` | Retire | P0/P10 |
| `new_inquiry` as action | Retire / Nav historical | P0 |

### 7.5 Processing Identity (15)

All **Processing** disposition except name overlap `create_lead` (operator Canon remains separate Capability; Processing keeps semantic plan key in its registry). Keys: `create_person`, `update_person`, `create_household`, `link_person_to_household`, `create_child`, `update_child`, `link_child_to_household`, `create_lead`, `update_lead`, `link_person_to_lead`, `create_process_participation`, `update_process_participation`, `attach_document`, `update_communication_preferences`, `propose_merge`.

### 7.6 Operational intents (vocabulary)

| Intent | Disposition |
|--------|-------------|
| current intents | map to Capability — not separate catalog rows |
| planned (`assign_room`, `generate_invoice`, `record_payment`, …) | Hide until Capability exists |

### 7.7 Counts

| Disposition bucket | Approx count |
|--------------------|-------------:|
| Canon (incl. hub, destructive new) | ~35 |
| Alias / Dup consolidate | ~12 |
| Hide / unsupported stubs | ~30 |
| Processing-only | 15 |
| Legacy retire | ~8 |
| Nav / non-mutating | ~2 |
| Review | ~4 |
| **Total identities addressed** | **≥86** |

*No identity silently dropped: Hide/Retire/Review are explicit.*

---

## 8. Test and certification strategy

| Layer | Blocking from |
|-------|----------------|
| Registry contract + ledger completeness | **P0** |
| Config-schema allow-list | P7 |
| Availability resolution | P7 |
| Process `command_set_v1` authority | **P6** |
| Stage recommendation ⊂ set | **P6** |
| Authorization floor | every execute phase |
| Destructive permission + typed confirm | **P4** |
| Subject-scope | P2+ |
| Preview/confirmation | P4/P5 |
| Domain adapter parity | each wrap phase |
| Audit/event | P2+ |
| Projection refresh | smoke each wrap |
| BOS parity | P1, P3, P5 |
| Backward compat aliases | P2, P7 |
| API convergence / zero legacy fallback | **P9** |
| `/configuration/commands` product QA | **P7–P8** |
| Migration replay of command_set derive | **P6** |
| Production-like smoke | each phase exit |

---

## 9. Observability and rollback

| Proof | Mechanism | Remove when |
|-------|-----------|-------------|
| One invoke → one executor | `command_runtime_invoke_total{capabilityKey,path}` | P10 after cert |
| No duplicate mutations | Domain idempotency keys + test double-call asserts | keep tests |
| Contexts still resolve | Candidate resolver golden tests + rail smoke | keep |
| Legacy fallback usage | `execute_admin_action_fallback_total{key}` | P9 zero then remove counter P10 |
| Deprecated route calls | access logs on `/actions/*` vs `/commands/*` | after traffic zero |
| Auth failures | structured `COMMAND_FORBIDDEN` | keep |
| Destructive preview↔commit | correlation_id preview_token required on commit | keep |
| Refresh success | result `refreshHints` consumed | keep |
| Variant identity | audit fields `capabilityKey` + `variantKey` | keep |

**Rollback boundary:** per-slice git revert; no irreversible data migrations in P0–P5; P6 derive is additive JSON field.

---

## 10. Documentation update map

| Doc | First phase that may require update |
|-----|-------------------------------------|
| `docs/platform/modules/actions-and-workflows.md` | P1 (Runtime), P7 (product name), P10 |
| `docs/platform/modules/business-process-execution-platform.md` | P6 |
| `docs/platform/core/business-process-system.md` | P6 |
| `docs/platform/modules/configuration-platform.md` | P7–P8 |
| `docs/platform/core/status-and-state-system.md` | P2 (domain verbs) |
| `docs/platform/core/data/relationship-model.md` | P3–P4 |
| `docs/platform/modules/ai-platform.md` | P1/P3 (execute path) |
| `docs/platform/foundation/platform-capabilities.md` | P8/P10 |
| `docs/platform/foundation/product-roadmap.md` | P10 |
| Release history | each shipped phase |
| Platform decisions | only if D1 promote-to-table or permission family becomes cross-platform durable decision |

**Rule:** update canonical doctrine in the **same change** that alters behavior — not in this planning mission.

---

## 11. Owner approval gate

Approve:

- [ ] **D1** Variant JSON on definition metadata (V1)
- [ ] **D2** Process `command_set_v1` sole selection authority; stage catalog recommendation-only
- [ ] **D3** Deferred public rename; facade behind `/actions/*` first; `/commands/*` aliases later
- [ ] **D4** Hybrid auth: floor admin/ops + destructive permission class from P4; availability ≠ auth
- [ ] **D5** Reopen Tour contract in P5; execute deferred; recovery = new Schedule
- [ ] **D6** Config-maintenance outside org Command catalog
- [ ] **P0–P10** sequence in this document
- [ ] **Catalog ledger** dispositions (§7)
- [ ] **Destructive sequencing** in P4 before Tour cancel hardening in P5
- [ ] **Tour scope** P5 without Reopen execute
- [ ] **`/configuration/commands`** delivery in P7–P8
- [ ] **First slice** P0.S1 prompt (Appendix A)

**Once approved → next mission: implement P0.S1 only.**

---

## Appendix A — Implementation prompt for P0.S1

```text
Vacilando Slot 1 — Implement P0.S1 only (Capability registry spine).

Worktree: wt1-commands-system-inventory
Branch: agent/cursor/1-commands-system-inventory
Plans (read-only authority):
- qa/missions/commands-implementation-plan-msn_188e8bea6fb6de28dd21.md (§6, §7)
- qa/missions/commands-architecture-msn_188e8bea6fb6de28dd21.md
- qa/missions/commands-product-definition-msn_188e8bea6fb6de28dd21.md
- qa/missions/commands-system-inventory-msn_188e8bea6fb6de28dd21.md

Goal:
Add a code-owned Platform Capability Registry that classifies every inventoried command identity
with supportStatus / disposition. ZERO operator behavior change. No route logic changes except
what is required to export registry helpers for tests. No migrations. No API renames. No UI.

Deliver:
1) capabilityRegistry module (prefer web/lib/platform/commands/ or web/lib/adminV2/actions/)
2) Enum supportStatus aligned with the implementation plan
3) Entry per ledger key from §7 of the implementation plan (embed snapshot list in test fixture)
4) Tests: completeness, registered Action Runtime keys are production/partial, placeholders unsupported
5) Local commit only if asked; do not push

Stop if you would change executeAdminAction behavior, action execute results, or settings UX.
Exit criteria: tests green; git diff limited to registry + tests (+ fixture).
```

---

## Appendix B — Mission chain

```text
Inventory → Product Definition → Architecture → Implementation Plan (this doc)
→ P0.S1 implementation (next)
```

---

*End of implementation plan. No production implementation performed in this mission.*
